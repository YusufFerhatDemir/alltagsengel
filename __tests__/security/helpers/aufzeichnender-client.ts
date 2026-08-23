/**
 * Aufzeichnender Supabase-Client fuer Routen-Sicherheitstests.
 *
 * WOZU
 * Die Guards (lib/ops/api-auth.ts, lib/auth/guard.ts) lassen sich einzeln
 * pruefen — das tut __tests__/security/rollenkonzept-zugriffe.test.ts. Was
 * damit NICHT geprueft ist: ob eine Route den vom Guard gelieferten
 * Mandanten auch tatsaechlich in JEDE Abfrage schreibt, oder ob sie sich
 * eine Organisation aus Query-Parametern bzw. dem Request-Body ziehen
 * laesst. Genau das ist der Angriffsweg „URL-Manipulation".
 *
 * Dieser Client ersetzt `createAdminClient()` und tut zwei Dinge:
 *   1. Er filtert echt — eq/neq/in/is/gte/lte werden auf die hinterlegten
 *      Zeilen angewandt. Eine Route, die mit dem falschen Mandanten
 *      filtert, bekommt hier tatsaechlich keine Zeilen; eine Route ohne
 *      Mandantenfilter bekommt fremde Zeilen und faellt auf.
 *   2. Er zeichnet jede Abfrage auf (Tabelle, Filter, Operation), damit
 *      ein Test behaupten kann: „diese Route hat nie mit organization_id
 *      = <fremd> gefragt".
 *
 * Der Client ist bewusst schlicht. Er bildet KEIN Postgres nach — RLS,
 * Trigger und Constraints gehoeren in die PGlite-Tests. Hier geht es
 * ausschliesslich um die Frage, welche Filter die Route selbst setzt.
 */

export interface Abfrage {
  tabelle: string
  operation: 'select' | 'insert' | 'update' | 'delete'
  /** Alle gesetzten Filter in Aufrufreihenfolge. */
  filter: Array<{ art: string; spalte: string; wert: unknown }>
  /** Bei insert/update die uebergebenen Werte. */
  nutzlast?: unknown
}

export interface Aufzeichnung {
  abfragen: Abfrage[]
  rpcs: Array<{ name: string; parameter: unknown }>
  /** Alle Werte, mit denen je auf organization_id gefiltert wurde. */
  organisationsFilter(): unknown[]
  /** Alle Tabellen, die ohne organization_id-Filter abgefragt wurden. */
  tabellenOhneOrgFilter(): string[]
  zuruecksetzen(): void
}

type Zeile = Record<string, unknown>

function passt(zeile: Zeile, f: Abfrage['filter'][number]): boolean {
  const wert = zeile[f.spalte]
  switch (f.art) {
    case 'eq':   return wert === f.wert
    case 'neq':  return wert !== f.wert
    case 'is':   return f.wert === null ? wert === null || wert === undefined : wert === f.wert
    case 'in':   return Array.isArray(f.wert) && (f.wert as unknown[]).includes(wert)
    case 'gte':  return wert != null && String(wert) >= String(f.wert)
    case 'lte':  return wert != null && String(wert) <= String(f.wert)
    case 'gt':   return wert != null && String(wert) > String(f.wert)
    case 'lt':   return wert != null && String(wert) < String(f.wert)
    // Unbekannte Filterarten schraenken nicht ein: der Test soll an einem
    // fehlenden Mandantenfilter scheitern, nicht an einer Filterart, die
    // dieser Client nicht kennt.
    default:     return true
  }
}

/**
 * @param daten   Tabellenname → Zeilen. Fehlende Tabellen liefern [].
 * @param rpcAntworten  RPC-Name → Rueckgabewert (Standard: null).
 */
export function erstelleAufzeichnendenClient(
  daten: Record<string, Zeile[]> = {},
  rpcAntworten: Record<string, unknown> = {},
): { client: unknown; aufzeichnung: Aufzeichnung } {
  const abfragen: Abfrage[] = []
  const rpcs: Array<{ name: string; parameter: unknown }> = []

  function baue(tabelle: string, operation: Abfrage['operation'], nutzlast?: unknown) {
    const eintrag: Abfrage = { tabelle, operation, filter: [], nutzlast }
    abfragen.push(eintrag)

    function ergebnis(): { data: Zeile[]; error: null } {
      if (operation !== 'select') return { data: [], error: null }
      const zeilen = (daten[tabelle] || []).filter(z => eintrag.filter.every(f => passt(z, f)))
      return { data: zeilen, error: null }
    }

    const builder: Record<string, unknown> = {}
    const filterArten = ['eq', 'neq', 'is', 'in', 'gte', 'lte', 'gt', 'lt', 'contains', 'ilike', 'like', 'not']
    for (const art of filterArten) {
      builder[art] = (spalte: string, wert: unknown) => {
        eintrag.filter.push({ art, spalte, wert })
        return builder
      }
    }
    for (const durchreichen of ['select', 'order', 'limit', 'range', 'returns', 'or', 'match', 'abortSignal', 'csv', 'throwOnError']) {
      builder[durchreichen] = () => builder
    }
    builder.single = async () => {
      const { data } = ergebnis()
      return data.length === 1
        ? { data: data[0], error: null }
        : { data: null, error: { message: 'Kein oder mehrdeutiger Treffer', code: 'PGRST116' } }
    }
    builder.maybeSingle = async () => {
      const { data } = ergebnis()
      return { data: data[0] ?? null, error: null }
    }
    builder.then = (aufloesen: (w: unknown) => unknown, ablehnen?: (f: unknown) => unknown) =>
      Promise.resolve(ergebnis()).then(aufloesen, ablehnen)

    return builder
  }

  const client = {
    from(tabelle: string) {
      return {
        select: (...args: unknown[]) => {
          const b = baue(tabelle, 'select')
          void args
          return b
        },
        insert: (nutzlast: unknown) => baue(tabelle, 'insert', nutzlast),
        upsert: (nutzlast: unknown) => baue(tabelle, 'insert', nutzlast),
        update: (nutzlast: unknown) => baue(tabelle, 'update', nutzlast),
        delete: () => baue(tabelle, 'delete'),
      }
    },
    rpc: async (name: string, parameter: unknown) => {
      rpcs.push({ name, parameter })
      return { data: rpcAntworten[name] ?? null, error: null }
    },
    auth: {
      admin: {
        listUsers: async () => ({ data: { users: [] }, error: null }),
      },
    },
  }

  const aufzeichnung: Aufzeichnung = {
    abfragen,
    rpcs,
    organisationsFilter: () =>
      abfragen.flatMap(a => a.filter.filter(f => f.spalte === 'organization_id').map(f => f.wert)),
    tabellenOhneOrgFilter: () =>
      abfragen
        .filter(a => a.operation === 'select' && !a.filter.some(f => f.spalte === 'organization_id'))
        .map(a => a.tabelle),
    zuruecksetzen: () => {
      abfragen.length = 0
      rpcs.length = 0
    },
  }

  return { client, aufzeichnung }
}
