// ═══════════════════════════════════════════════════════════════
// Minimaler In-Memory-Supabase-Doppelgänger für lib/kim-Unit-Tests.
// Anders als __tests__/workflow/_supabase-mock.ts (ein einziges
// global gesetztes Ergebnis) hält dieser Fake echten Tabellenstand —
// nötig, weil message-service/outbox-service mehrere Round-Trips
// pro Aufruf machen (z.B. laden → prüfen → aktualisieren).
// ═══════════════════════════════════════════════════════════════

let idCounter = 0
function genId(): string {
  idCounter += 1
  return `fake-id-${idCounter}`
}

type Row = Record<string, any>
type Filter = readonly [string, string, unknown]

function matchRow(row: Row, filters: Filter[]): boolean {
  return filters.every(([col, op, val]) => {
    if (op === 'eq') return row[col] === val
    if (op === 'lte') return row[col] != null && row[col] <= val
    if (op === 'not_is_null') return row[col] != null
    if (op === 'ilike') {
      const pattern = String(val).replace(/%/g, '').toLowerCase()
      return String(row[col] ?? '').toLowerCase().includes(pattern)
    }
    return true
  })
}

export function createFakeKimSupabase(seed: Record<string, Row[]> = {}) {
  const tables: Record<string, Row[]> = {}
  for (const [name, rows] of Object.entries(seed)) tables[name] = rows.map(r => ({ ...r }))

  function table(name: string): Row[] {
    if (!tables[name]) tables[name] = []
    return tables[name]
  }

  function from(tableName: string) {
    const filters: Filter[] = []
    let insertPayload: Row | Row[] | null = null
    let updatePayload: Row | null = null
    let orderCol: string | null = null
    let orderAsc = true
    let limitN: number | null = null

    async function execute(wantSingle: boolean): Promise<{ data: any; error: any }> {
      const rows = table(tableName)

      if (insertPayload) {
        const toInsert = Array.isArray(insertPayload) ? insertPayload : [insertPayload]
        const inserted = toInsert.map(r => ({
          id: genId(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          status: 'entwurf',
          retry_count: 0,
          max_retries: 5,
          metadata: {},
          details: {},
          config: {},
          is_active: true,
          ...r,
        }))
        rows.push(...inserted)
        return wantSingle ? { data: inserted[0] ?? null, error: null } : { data: inserted, error: null }
      }

      if (updatePayload) {
        const matched = rows.filter(r => matchRow(r, filters))
        matched.forEach(r => Object.assign(r, updatePayload, { updated_at: new Date().toISOString() }))
        return wantSingle ? { data: matched[0] ?? null, error: null } : { data: matched, error: null }
      }

      let result = rows.filter(r => matchRow(r, filters))
      if (orderCol) {
        result = [...result].sort((a, b) => {
          const cmp = a[orderCol!] > b[orderCol!] ? 1 : a[orderCol!] < b[orderCol!] ? -1 : 0
          return orderAsc ? cmp : -cmp
        })
      }
      if (limitN != null) result = result.slice(0, limitN)
      return wantSingle ? { data: result[0] ?? null, error: null } : { data: result, error: null }
    }

    const api: any = {
      select: () => api,
      insert: (payload: Row | Row[]) => { insertPayload = payload; return api },
      update: (payload: Row) => { updatePayload = payload; return api },
      upsert: (payload: Row) => { insertPayload = payload; return api },
      eq: (col: string, val: unknown) => { filters.push([col, 'eq', val]); return api },
      not: (col: string, _op: string, val: unknown) => {
        if (val === null) filters.push([col, 'not_is_null', val])
        return api
      },
      lte: (col: string, val: unknown) => { filters.push([col, 'lte', val]); return api },
      ilike: (col: string, val: unknown) => { filters.push([col, 'ilike', val]); return api },
      or: () => api,
      order: (col: string, opts?: { ascending?: boolean }) => { orderCol = col; orderAsc = opts?.ascending !== false; return api },
      limit: (n: number) => { limitN = n; return api },
      maybeSingle: () => execute(true),
      single: () => execute(true),
      then: (resolve: (v: any) => any, reject?: (e: any) => any) => execute(false).then(resolve, reject),
    }
    return api
  }

  return {
    from,
    _table: table,
  }
}
