/**
 * Chaos-Hülle um einen Supabase-Client
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Legt eine Schicht über einen echten Client (PGlite-Shim oder Stub) und
 * lässt EINEN gezielt ausgewählten Aufruf scheitern — so, wie er live
 * scheitern würde: mit einem PostgREST-Fehlerobjekt, nicht mit einer
 * geworfenen Ausnahme.
 *
 * ── WARUM DAS NÖTIG IST ────────────────────────────────────────────────
 * Die interessanten Geldfehler entstehen nicht, wenn eine Abfrage
 * scheitert, sondern wenn die DRITTE von vier scheitert: die ersten zwei
 * haben dann schon geschrieben. Genau diese Zustände — halb gebucht,
 * halb protokolliert — lassen sich mit einem Client, der entweder immer
 * oder nie funktioniert, nicht herstellen.
 *
 * ── AUFZEICHNEN UND ABSPIELEN ──────────────────────────────────────────
 * Der Query-Builder ist eine Kette (`.from().update().eq().select()`).
 * Ob ein Aufruf zum Scheitern ausgewählt ist, steht erst am Ende der
 * Kette fest — vorher ist die Operation gar nicht bekannt. Die Hülle
 * zeichnet die Kette deshalb auf und spielt sie am Terminal entweder auf
 * dem echten Builder ab oder ersetzt sie durch den Fehler.
 */

export type ChaosOperation = 'select' | 'insert' | 'update' | 'upsert' | 'delete'

export interface ChaosRegel {
  tabelle: string
  /** Nur Aufrufe dieser Operation zählen und scheitern. */
  operation: ChaosOperation
  /** Der wievielte passende Aufruf scheitert (1-basiert). Default: 1. */
  beimAufruf?: number
  fehler: { message: string; code?: string }
}

export interface ChaosProtokollEintrag {
  tabelle: string
  operation: ChaosOperation
  gescheitert: boolean
}

export interface ChaosClient<T> {
  /** In den Prüfling zu reichen. */
  client: T
  protokoll: ChaosProtokollEintrag[]
  /** Wie oft die Regel gegriffen hat. 0 = sie hat nie zugeschlagen. */
  ausgeloest: number
}

type Aufruf = { methode: string; args: unknown[] }

/**
 * @param echt   Der Client, der die Arbeit tut.
 * @param regeln Was scheitern soll. Leer = die Hülle protokolliert nur.
 */
export function mitChaos<T extends { from: (t: string) => unknown }>(
  echt: T,
  regeln: ChaosRegel[],
): ChaosClient<T> {
  const protokoll: ChaosProtokollEintrag[] = []
  const zaehler = new Map<string, number>()
  const zustand = { ausgeloest: 0 }

  function huelle(tabelle: string): unknown {
    const kette: Aufruf[] = []
    let operation: ChaosOperation = 'select'

    /** Spielt die aufgezeichnete Kette auf dem echten Builder ab. */
    function abspielen(): { builder: unknown } {
      let b = echt.from(tabelle) as Record<string, (...a: unknown[]) => unknown>
      for (const { methode, args } of kette) {
        b = (b[methode] as (...a: unknown[]) => unknown)(...args) as Record<string, (...a: unknown[]) => unknown>
      }
      return { builder: b }
    }

    /**
     * Der Zähler läuft pro (Tabelle, Operation) und wird GENAU EINMAL je
     * Terminal hochgezählt — nicht je Regel. Sonst zählte eine zweite
     * Regel auf derselben Tabelle die erste mit hoch, und `beimAufruf`
     * meinte plötzlich etwas anderes.
     */
    function trifftRegel(): ChaosRegel | undefined {
      const schluessel = `${tabelle}|${operation}`
      const n = (zaehler.get(schluessel) ?? 0) + 1
      zaehler.set(schluessel, n)
      return regeln.find(r =>
        r.tabelle === tabelle
        && r.operation === operation
        && (r.beimAufruf ?? 1) === n)
    }

    const proxy: Record<string, unknown> = {}

    const kettenMethoden = [
      'select', 'insert', 'update', 'upsert', 'delete',
      'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'is', 'in', 'not', 'or',
      'order', 'limit', 'range', 'returns', 'filter', 'contains', 'overlaps',
    ]

    for (const m of kettenMethoden) {
      proxy[m] = (...args: unknown[]) => {
        // Bei insert().select() bleibt die Operation `insert` — sonst
        // träfe eine Regel auf 'select' die falsche Anweisung.
        if (m === 'insert' || m === 'update' || m === 'upsert' || m === 'delete') {
          operation = m as ChaosOperation
        }
        kette.push({ methode: m, args })
        return proxy
      }
    }

    async function terminal(methode: 'single' | 'maybeSingle' | 'liste'): Promise<unknown> {
      const regel = trifftRegel()
      protokoll.push({ tabelle, operation, gescheitert: !!regel })
      if (regel) {
        zustand.ausgeloest++
        return { data: null, error: { ...regel.fehler, details: null, hint: null }, count: null }
      }
      const { builder } = abspielen()
      const b = builder as Record<string, (...a: unknown[]) => unknown>
      if (methode === 'liste') return await (b as unknown as PromiseLike<unknown>)
      return await (b[methode] as () => Promise<unknown>)()
    }

    proxy.single = () => terminal('single')
    proxy.maybeSingle = () => terminal('maybeSingle')
    proxy.then = (
      aufloesen: (v: unknown) => unknown,
      ablehnen?: (e: unknown) => unknown,
    ) => terminal('liste').then(aufloesen, ablehnen)

    return proxy
  }

  const client = {
    ...(echt as unknown as Record<string, unknown>),
    from: (tabelle: string) => huelle(tabelle),
    rpc: (name: string, params?: Record<string, unknown>) =>
      (echt as unknown as { rpc: (n: string, p?: Record<string, unknown>) => unknown }).rpc(name, params),
  } as unknown as T

  return {
    client,
    protokoll,
    get ausgeloest() { return zustand.ausgeloest },
  }
}
