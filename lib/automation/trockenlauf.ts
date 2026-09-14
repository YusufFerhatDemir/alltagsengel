// ═══════════════════════════════════════════════════════════════════
// Trockenlauf — die Ketten fahren, ohne etwas zu verändern
// ═══════════════════════════════════════════════════════════════════
//
// ── WOZU ──────────────────────────────────────────────────────────
// Elf Automatisierungsketten sind gebaut, in lib/automation/index.ts
// verdrahtet und in vercel.json getaktet (taeglich 05:00). Gelaufen ist
// keine: `CRON_SECRET` ist nicht gesetzt, `pruefeCronGeheimnis` weist
// jeden Aufruf ab, und `ops_aufgaben` traegt live 0 Zeilen.
//
// Am Tag, an dem das Geheimnis gesetzt wird, laufen alle elf auf einen
// Schlag gegen einen zwei Monate alten Bestand. Wie viele Aufgaben und
// Meldungen dabei entstehen, weiss vorher niemand — und genau das ist
// die Frage, die man VOR dem Einschalten beantwortet haben will. Beim
// Lead-Follow-up waeren es nach heutigem Stand 36 Bewerbungen.
//
// Dieselbe Haltung wie bei `/api/cron/perimeter-aufbewahrung`: die
// Mechanik steht bereit, die Wirkung ist eine ausdrueckliche Freigabe,
// und der Trockenlauf liefert das Entscheidungsmaterial.
//
// ── WARUM EIN PROXY UND KEIN FLAG IN JEDER KETTE ──────────────────
// Ein `trockenlauf`-Parameter muesste durch elf Ketten und jede von
// ihnen aufrufende Hilfsfunktion gereicht werden. Jede Stelle, die ihn
// vergisst, schreibt trotzdem — und man saehe es nicht. Der Riegel sitzt
// deshalb an der einen Stelle, durch die JEDE Schreibabsicht muss: dem
// Supabase-Client.
//
// Lesen wird unveraendert durchgereicht, damit die Ketten dieselben
// Mengen sehen wie im Ernstfall. Nachgebildet wird nichts — eine
// Nachbildung beweist nur, dass die Nachbildung laeuft.
//
// ── DIE ZWEITE TUER: E-MAIL ───────────────────────────────────────
// `sendEmailNotification` nimmt KEINEN Client; sie spricht Resend
// direkt an. Dieser Proxy kann sie nicht abfangen. Wer ihn benutzt, MUSS
// deshalb `RESEND_API_KEY` im eigenen Prozess leeren, BEVOR die Module
// geladen werden — `sendRawEmail` gibt dann `uebersprungen: true`
// zurueck, ohne zu werfen. `trockenlaufGefahr()` prueft das und wird vom
// Prueflauf ausgewertet; ohne diese Pruefung waere ein „Trockenlauf" ein
// Versand an echte Menschen.
// ═══════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'

/** Schreibende Methoden auf einem PostgREST-Tabellenzugriff. */
export const SCHREIB_METHODEN = ['insert', 'update', 'upsert', 'delete'] as const
export type SchreibMethode = (typeof SCHREIB_METHODEN)[number]

export interface AbgefangenerSchreibvorgang {
  tabelle: string
  methode: SchreibMethode | 'rpc'
  /** Nutzlast bzw. RPC-Argumente — gekuerzt, damit das Protokoll lesbar bleibt. */
  nutzlast: unknown
}

export interface TrockenlaufProtokoll {
  vorgaenge: AbgefangenerSchreibvorgang[]
  /** Wie oft je Tabelle geschrieben worden waere. */
  jeTabelle(): Record<string, number>
  /** Wie oft je Methode. */
  jeMethode(): Record<string, number>
}

/**
 * Sagt, ob ein Trockenlauf in diesem Prozess gefahrlos ist.
 *
 * Fail-closed gedacht: solange ein Resend-Schluessel gesetzt ist, koennte
 * eine Kette eine echte E-Mail verschicken. Der Aufrufer bricht dann ab.
 */
export function trockenlaufGefahr(env: NodeJS.ProcessEnv = process.env): string | null {
  if (env.RESEND_API_KEY) {
    return 'RESEND_API_KEY ist gesetzt. Die Ketten koennten echte E-Mails versenden — '
      + 'der Proxy fasst nur die Datenbank. Den Schluessel im Prozess leeren, BEVOR die '
      + 'Module geladen werden.'
  }
  return null
}

/**
 * Kennung, die abgefangene Schreibvorgaenge als Ergebnis zurueckgeben.
 *
 * Erkennbar als das, was sie ist, und trotzdem eine gueltige UUID: die
 * Ketten reichen sie teils weiter (z. B. als `entityId` ins Protokoll).
 */
export const TROCKENLAUF_ID = '00000000-0000-4000-8000-000000000000'

/**
 * Antwort auf einen abgefangenen Schreibvorgang.
 *
 * Sie traegt bewusst eine ZEILE und nicht `null`. Viele Ketten lesen nach
 * dem Anlegen die zurueckgegebene Zeile (`.select().single()`) und werten
 * ein fehlendes Ergebnis als Fehlschlag. Mit `null` meldete der
 * Trockenlauf dann „Aufgabe konnte nicht angelegt werden" — ein Fehler,
 * den es scharf nicht gibt, und der die echten Befunde zudeckt. Am
 * 14.09.2026 genau so beobachtet, bei `nachweis-fehlt`.
 */
function leeresErgebnis(): { data: { id: string }; error: null; count: null; status: number; statusText: string } {
  return {
    data: { id: TROCKENLAUF_ID },
    error: null, count: null, status: 200, statusText: 'OK (Trockenlauf)',
  }
}

/**
 * Kette, die nach einem abgefangenen Schreibvorgang weitergereicht wird.
 *
 * Sie muss sich wie PostgREST verhalten: `.select().single()`,
 * `.eq(...).select()` und das blosse `await` muessen alle etwas
 * Sinnvolles ergeben. Ein `undefined` an dieser Stelle laesst die Kette
 * mit einem Fehler abbrechen, der nichts mit ihrer Logik zu tun hat —
 * und der Trockenlauf haette dann nur bewiesen, dass der Proxy kaputt ist.
 */
function abgefangeneKette(): Record<string, unknown> {
  const kette: Record<string, unknown> = {}
  const durchreichen = [
    'select', 'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike',
    'in', 'is', 'not', 'or', 'filter', 'contains', 'overlaps',
    'order', 'limit', 'range', 'match', 'returns', 'abortSignal', 'csv',
  ]
  for (const m of durchreichen) kette[m] = () => kette
  kette.single = async () => leeresErgebnis()
  kette.maybeSingle = async () => leeresErgebnis()
  kette.then = (aufloesen: (w: unknown) => unknown) => Promise.resolve(leeresErgebnis()).then(aufloesen)
  return kette
}

/**
 * Kuerzt eine Nutzlast fuer das Protokoll.
 *
 * Rekursiv, aber mit Tiefenbremse: die Nutzlasten kommen aus fremdem Code
 * und koennen im Zweifel einen Zyklus enthalten. Ohne die Bremse haette
 * eine zyklische Nutzlast den Trockenlauf zum Absturz gebracht — und der
 * Absturz haette wie ein Fehler der geprueften Kette ausgesehen.
 */
function kuerze(wert: unknown, tiefe = 0): unknown {
  if (wert === null || wert === undefined) return wert
  if (typeof wert === 'string') return wert.length > 80 ? wert.slice(0, 80) + '…' : wert
  if (typeof wert !== 'object') return wert
  if (tiefe >= 4) return '[…]'
  if (Array.isArray(wert)) {
    return wert.length <= 3 ? wert.map(v => kuerze(v, tiefe + 1)) : `[${wert.length} Eintraege]`
  }
  const o: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(wert as Record<string, unknown>)) {
    o[k] = kuerze(v, tiefe + 1)
  }
  return o
}

/**
 * Umhuellt einen echten Supabase-Client: Lesen geht durch, Schreiben wird
 * protokolliert und verworfen.
 *
 * @returns der Proxy-Client und das Protokoll dessen, was passiert waere.
 */
export function nurLesenderClient(echt: SupabaseClient): {
  client: SupabaseClient
  protokoll: TrockenlaufProtokoll
} {
  const vorgaenge: AbgefangenerSchreibvorgang[] = []

  const protokoll: TrockenlaufProtokoll = {
    vorgaenge,
    jeTabelle() {
      const m: Record<string, number> = {}
      for (const v of vorgaenge) m[v.tabelle] = (m[v.tabelle] ?? 0) + 1
      return m
    },
    jeMethode() {
      const m: Record<string, number> = {}
      for (const v of vorgaenge) m[v.methode] = (m[v.methode] ?? 0) + 1
      return m
    },
  }

  const client = new Proxy(echt as unknown as Record<string, unknown>, {
    get(ziel, eigenschaft, empfaenger) {
      if (eigenschaft === 'from') {
        return (tabelle: string) => {
          const echteTabelle = (ziel.from as (t: string) => Record<string, unknown>).call(ziel, tabelle)
          return new Proxy(echteTabelle, {
            get(tZiel, tEigenschaft, tEmpfaenger) {
              if (SCHREIB_METHODEN.includes(tEigenschaft as SchreibMethode)) {
                return (nutzlast: unknown) => {
                  vorgaenge.push({
                    tabelle,
                    methode: tEigenschaft as SchreibMethode,
                    nutzlast: kuerze(nutzlast),
                  })
                  return abgefangeneKette()
                }
              }
              const wert = Reflect.get(tZiel, tEigenschaft, tEmpfaenger)
              return typeof wert === 'function' ? wert.bind(tZiel) : wert
            },
          })
        }
      }

      // RPCs koennen schreiben und sind von aussen nicht unterscheidbar.
      // Sie werden deshalb ebenfalls abgefangen — lieber eine Kette, die
      // ohne RPC-Antwort weniger meldet, als ein Trockenlauf, der bucht.
      if (eigenschaft === 'rpc') {
        return (name: string, argumente?: unknown) => {
          vorgaenge.push({ tabelle: `rpc:${name}`, methode: 'rpc', nutzlast: kuerze(argumente) })
          return abgefangeneKette()
        }
      }

      const wert = Reflect.get(ziel, eigenschaft, empfaenger)
      return typeof wert === 'function' ? wert.bind(ziel) : wert
    },
  }) as unknown as SupabaseClient

  return { client, protokoll }
}
