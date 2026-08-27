// ═══════════════════════════════════════════════════════════════
// Supabase-Client-Attrappe fuer ops-Unit-Tests
// ═══════════════════════════════════════════════════════════════
//
// Die ops-Lib-Funktionen nehmen SupabaseClient als Parameter
// entgegen — kein vi.mock noetig, einfach Attrappe uebergeben.
//
// Nutzung:
//   const mock = createMockSupabase()
//   mock._setResult([{ id: '1', titel: 'Test' }])
//   const ergebnis = await listAufgaben(mock.client as any, filter)
// ═══════════════════════════════════════════════════════════════

import { vi } from 'vitest'

export interface MockResult {
  data: any
  error: any
}

/**
 * Baut einen Query-Builder-Proxy, der an einen eigenen `state` gebunden ist.
 * Separat aufrufbar, damit `_setTableData` (siehe unten) einer Tabelle einen
 * ISOLIERTEN Zustand geben kann — ohne das gemeinsame `result` (aus
 * `_setResult`) zu ueberschreiben. Ohne diese Trennung wuerde eine Abfrage
 * gegen eine per `_setTableData` vorbefuellte Tabelle den fuer eine SPAETERE,
 * nicht vorbefuellte Tabelle vorgesehenen `_setResult`-Wert verfaelschen
 * (z. B. wenn eine Funktion erst Referenzdaten prueft und danach erst den
 * eigentlichen Insert ausfuehrt).
 */
function buildQueryBuilder(state: MockResult) {
  const queryBuilder: Record<string, ReturnType<typeof vi.fn>> = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    single: vi.fn(() => Promise.resolve({ data: state.data, error: state.error })),
    maybeSingle: vi.fn(() => Promise.resolve({ data: state.data, error: state.error })),
  }

  // Wenn keine Terminal-Methode (single/maybeSingle) aufgerufen wird,
  // muss das Query-Objekt selbst als thenable fungieren (await query).
  const handler: ProxyHandler<typeof queryBuilder> = {
    get(target, prop) {
      if (prop === 'then') {
        return (resolve: (v: MockResult) => void) => resolve({ data: state.data, error: state.error })
      }
      return target[prop as string]
    },
  }

  const proxy = new Proxy(queryBuilder, handler)

  // Damit jede Methode (eq, select, ...) wieder den Proxy zurueckgibt:
  for (const key of Object.keys(queryBuilder)) {
    if (key !== 'single' && key !== 'maybeSingle') {
      queryBuilder[key] = vi.fn().mockReturnValue(proxy)
    }
  }

  return { queryBuilder, proxy }
}

export function createMockSupabase() {
  const result: MockResult = { data: null, error: null }
  const { queryBuilder, proxy } = buildQueryBuilder(result)

  const tabellen: Record<string, any> = {}

  const client = {
    from: vi.fn((tabelle: string) => {
      if (tabelle in tabellen) {
        // Eigener, isolierter Zustand — beeinflusst `result` (und damit
        // spaetere, nicht vorbefuellte `.from()`-Aufrufe) nicht.
        return buildQueryBuilder({ data: tabellen[tabelle], error: null }).proxy
      }
      return proxy
    }),
  }

  return {
    client,
    queryBuilder,
    /** Ergebnis fuer den naechsten Query setzen */
    _setResult(data: any, error: any = null) {
      result.data = data
      result.error = error
    },
    /** Daten pro Tabelle vorbefuellen */
    _setTableData(tabelle: string, data: any[]) {
      tabellen[tabelle] = data
    },
    /** Query-Builder zuruecksetzen */
    _reset() {
      result.data = null
      result.error = null
      for (const fn of Object.values(queryBuilder)) {
        if (typeof fn.mockClear === 'function') fn.mockClear()
      }
      client.from.mockClear()
      for (const key of Object.keys(tabellen)) delete tabellen[key]
    },
  }
}
