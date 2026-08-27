/**
 * Supabase-Doppelgaenger fuer Modultests
 *
 * Warum nicht der Mini-Stub aus budget-cap.test.ts: der liefert je Tabelle
 * EINE feste Antwort. Die Module in dieser Testrunde lesen dieselbe Tabelle
 * mehrfach mit unterschiedlichen Filtern (Ketten-Abfragen in
 * ladeKorrekturHistorie, Lauf + Rechnungen + Rueckaeufer im Orchestrator),
 * und mehrere geprueften Fehler sind genau Fehler in den FILTERN — ein
 * fehlender org-Fence, ein falscher Spaltenname, ein fehlender Status-Guard
 * im WHERE. Ein Stub, der Filter verschluckt, kann solche Fehler prinzipiell
 * nicht finden.
 *
 * Deshalb hier:
 *   - jeder Aufruf wird mit Tabelle, Operation, allen Filtern und dem
 *     geschriebenen Datensatz protokolliert,
 *   - die Antwort kommt aus einer Funktion, die den Aufruf sieht,
 *   - eine harte Obergrenze an Aufrufen macht aus einer Endlosschleife im
 *     Pruefling einen roten Test statt eines haengenden Laufs.
 */

export interface FilterEintrag {
  methode: string
  spalte: string
  wert: unknown
}

export type Operation = 'select' | 'insert' | 'update' | 'delete'
export type Terminal = 'single' | 'maybeSingle' | 'liste'

export interface FakeAufruf {
  tabelle: string
  operation: Operation
  /** Spaltenliste des select() — bei insert/update das nachgelagerte select(). */
  spalten: string | null
  filter: FilterEintrag[]
  /** Der bei insert/update uebergebene Datensatz. */
  payload: unknown
  terminal: Terminal
  /** true bei `{ head: true }` — Zaehlabfrage ohne Zeilen. */
  head: boolean
  zaehlmodus: string | null
  /** Laufende Nummer dieses Aufrufs auf DIESE Tabelle, ab 0. */
  nr: number
  /** Laufende Nummer ueber alle Tabellen, ab 0. */
  gesamtNr: number
}

export interface FakeAntwort {
  data?: unknown
  error?: { message: string; code?: string } | null
  count?: number | null
}

export type AntwortGeber = (aufruf: FakeAufruf) => FakeAntwort | undefined

// ── Storage ────────────────────────────────────────────────────────────
// Warum mit im Doppelgaenger: bei fail-closed-Pfaden ist die interessante
// Aussage nicht „es kam ein Fehler", sondern „es wurde NICHTS abgelegt".
// Ohne aufgezeichnete Uploads laesst sich das nicht pruefen — ein Test
// koennte dann nur den geworfenen Fehler sehen und wuerde eine Datei, die
// trotzdem im Bucket landet, uebersehen.

export interface SpeicherAufruf {
  bucket: string
  operation: 'upload' | 'download' | 'createSignedUrl' | 'remove'
  pfad: string
  /** Bei upload: der uebergebene Inhalt. */
  inhalt?: unknown
  optionen?: unknown
}

export interface SpeicherAntwort {
  data?: unknown
  error?: { message: string } | null
}

export type SpeicherGeber = (aufruf: SpeicherAufruf) => SpeicherAntwort | undefined

// ── RPC ────────────────────────────────────────────────────────────
// Warum aufgezeichnet: bei Idempotenz- und CAS-Pfaden ist die
// entscheidende Aussage haeufig „die RPC wurde NICHT gerufen" — etwa
// dass ein zweiter manueller Retry kein zweites Workflow-Event
// ausloest. Ein RPC-Stub ohne Protokoll kann das nicht belegen.

export interface RpcAufruf {
  name: string
  args: Record<string, unknown> | undefined
  /** Laufende Nummer ueber alle RPC-Aufrufe, ab 0. */
  nr: number
}

export type RpcGeber = (aufruf: RpcAufruf) => FakeAntwort | undefined

export interface FakeSupabase {
  /** In die zu pruefende Funktion zu reichen. */
  client: never
  /** Alle Aufrufe in Reihenfolge. */
  aufrufe: FakeAufruf[]
  /** Alle Storage-Aufrufe in Reihenfolge. */
  speicherAufrufe: SpeicherAufruf[]
  /** Alle RPC-Aufrufe in Reihenfolge. */
  rpcAufrufe: RpcAufruf[]
  /** Alle Aufrufe auf eine Tabelle. */
  auf(tabelle: string): FakeAufruf[]
  /** Der erste Aufruf auf eine Tabelle mit dieser Operation. */
  ersterAuf(tabelle: string, operation?: Operation): FakeAufruf | undefined
  /** Alle Storage-Aufrufe einer Operation. */
  speicherAuf(operation: SpeicherAufruf['operation']): SpeicherAufruf[]
  /** Alle Aufrufe einer bestimmten RPC. */
  rpcAuf(name: string): RpcAufruf[]
}

/** Obergrenze gegen Endlosschleifen im Pruefling. */
export const MAX_AUFRUFE = 200

export class ZuVieleAufrufeError extends Error {
  constructor(tabelle: string) {
    super(
      `Mehr als ${MAX_AUFRUFE} Datenbankaufrufe (zuletzt "${tabelle}"). `
      + `Der Pruefling laeuft vermutlich in einer Endlosschleife — `
      + `ohne diese Schranke wuerde der Test haengen statt fehlzuschlagen.`,
    )
    this.name = 'ZuVieleAufrufeError'
  }
}

/** true, wenn der Aufruf genau diesen Filter gesetzt hat. */
export function hatFilter(
  aufruf: FakeAufruf | undefined,
  methode: string,
  spalte: string,
  wert?: unknown,
): boolean {
  if (!aufruf) return false
  return aufruf.filter.some(f =>
    f.methode === methode
    && f.spalte === spalte
    && (wert === undefined || JSON.stringify(f.wert) === JSON.stringify(wert)),
  )
}

/** Kurzform fuer den haeufigsten Fall: sitzt der Mandanten-Fence? */
export function hatOrgFence(aufruf: FakeAufruf | undefined, orgId: string): boolean {
  return hatFilter(aufruf, 'eq', 'organization_id', orgId)
}

const KETTEN_METHODEN = [
  'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike',
  'in', 'is', 'not', 'or', 'contains', 'overlaps', 'filter',
  'order', 'limit', 'range', 'returns', 'abortSignal',
] as const

export function erstelleFakeSupabase(
  antwortGeber: AntwortGeber,
  speicherGeber?: SpeicherGeber,
  rpcGeber?: RpcGeber,
): FakeSupabase {
  const aufrufe: FakeAufruf[] = []
  const speicherAufrufe: SpeicherAufruf[] = []
  const rpcAufrufe: RpcAufruf[] = []
  const zaehlerProTabelle = new Map<string, number>()

  function from(tabelle: string) {
    if (aufrufe.length >= MAX_AUFRUFE) throw new ZuVieleAufrufeError(tabelle)

    const nr = zaehlerProTabelle.get(tabelle) ?? 0
    zaehlerProTabelle.set(tabelle, nr + 1)

    const aufruf: FakeAufruf = {
      tabelle,
      operation: 'select',
      spalten: null,
      filter: [],
      payload: undefined,
      terminal: 'liste',
      head: false,
      zaehlmodus: null,
      nr,
      gesamtNr: aufrufe.length,
    }
    aufrufe.push(aufruf)

    let operationGesetzt = false

    const antwortHolen = (): FakeAntwort => {
      const a = antwortGeber(aufruf) ?? {}
      return {
        data: a.data ?? null,
        error: a.error ?? null,
        count: a.count ?? null,
      }
    }

    const kette: Record<string, unknown> = {}

    kette.select = (spalten?: string, optionen?: { head?: boolean; count?: string }) => {
      // Bei insert().select() bleibt die Operation `insert` — sonst waere in
      // der Auswertung nicht mehr erkennbar, dass geschrieben wurde.
      if (!operationGesetzt) { aufruf.operation = 'select'; operationGesetzt = true }
      aufruf.spalten = spalten ?? '*'
      if (optionen?.head) aufruf.head = true
      if (optionen?.count) aufruf.zaehlmodus = optionen.count
      return kette
    }

    for (const op of ['insert', 'update', 'upsert'] as const) {
      kette[op] = (payload: unknown) => {
        aufruf.operation = op === 'upsert' ? 'insert' : op
        operationGesetzt = true
        aufruf.payload = payload
        return kette
      }
    }

    kette.delete = () => {
      aufruf.operation = 'delete'
      operationGesetzt = true
      return kette
    }

    for (const m of KETTEN_METHODEN) {
      kette[m] = (spalte?: unknown, wert?: unknown) => {
        aufruf.filter.push({
          methode: m,
          spalte: typeof spalte === 'string' ? spalte : String(spalte),
          wert,
        })
        return kette
      }
    }

    kette.single = async () => {
      aufruf.terminal = 'single'
      const a = antwortHolen()
      // PostgREST liefert bei .single() ohne Treffer einen Fehler, nicht
      // `data: null` ohne Fehler. Module, die nur `data` pruefen, verhalten
      // sich sonst im Test anders als live.
      if (!a.error && (a.data === null || a.data === undefined)) {
        return { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' }, count: null }
      }
      return a
    }

    kette.maybeSingle = async () => {
      aufruf.terminal = 'maybeSingle'
      return antwortHolen()
    }

    kette.then = (
      aufloesen: (v: unknown) => unknown,
      ablehnen?: (e: unknown) => unknown,
    ) => {
      aufruf.terminal = 'liste'
      try {
        return Promise.resolve(antwortHolen()).then(aufloesen, ablehnen)
      } catch (err) {
        return Promise.reject(err).then(aufloesen, ablehnen)
      }
    }

    return kette
  }

  function speicherAntwort(aufruf: SpeicherAufruf): { data: unknown; error: { message: string } | null } {
    speicherAufrufe.push(aufruf)
    const a = speicherGeber?.(aufruf) ?? {}
    return { data: a.data ?? null, error: a.error ?? null }
  }

  const storage = {
    from(bucket: string) {
      return {
        upload: async (pfad: string, inhalt: unknown, optionen?: unknown) =>
          speicherAntwort({ bucket, operation: 'upload', pfad, inhalt, optionen }),
        download: async (pfad: string) =>
          speicherAntwort({ bucket, operation: 'download', pfad }),
        createSignedUrl: async (pfad: string, optionen?: unknown) =>
          speicherAntwort({ bucket, operation: 'createSignedUrl', pfad, optionen }),
        remove: async (pfade: string[]) =>
          speicherAntwort({ bucket, operation: 'remove', pfad: pfade.join(',') }),
      }
    },
  }

  async function rpc(name: string, args?: Record<string, unknown>) {
    const aufruf: RpcAufruf = { name, args, nr: rpcAufrufe.length }
    rpcAufrufe.push(aufruf)
    // Ohne rpcGeber das bisherige Verhalten: leere Erfolgsantwort.
    const a = rpcGeber?.(aufruf) ?? {}
    return { data: a.data ?? null, error: a.error ?? null }
  }

  return {
    client: { from, storage, rpc } as never,
    aufrufe,
    speicherAufrufe,
    rpcAufrufe,
    auf: (tabelle: string) => aufrufe.filter(a => a.tabelle === tabelle),
    ersterAuf: (tabelle: string, operation?: Operation) =>
      aufrufe.find(a => a.tabelle === tabelle && (!operation || a.operation === operation)),
    speicherAuf: (operation: SpeicherAufruf['operation']) =>
      speicherAufrufe.filter(a => a.operation === operation),
    rpcAuf: (name: string) => rpcAufrufe.filter(a => a.name === name),
  }
}
