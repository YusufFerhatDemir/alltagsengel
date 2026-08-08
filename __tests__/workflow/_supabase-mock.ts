// ═══════════════════════════════════════════════════════════════
// Supabase-Client-Attrappe fuer workflow-Unit-Tests
// ═══════════════════════════════════════════════════════════════
//
// Gleiches Muster wie __tests__/ops/_supabase-mock.ts, zusaetzlich
// mit rpc()-Unterstuetzung fuer wf_emit_event/wf_process_pending/...
// ═══════════════════════════════════════════════════════════════

import { vi } from 'vitest'

export interface MockResult {
  data: any
  error: any
}

export function createMockSupabase() {
  const result: MockResult = { data: null, error: null }
  const rpcResult: MockResult = { data: null, error: null }

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
    single: vi.fn(() => Promise.resolve({ data: result.data, error: result.error })),
    maybeSingle: vi.fn(() => Promise.resolve({ data: result.data, error: result.error })),
  }

  const handler: ProxyHandler<typeof queryBuilder> = {
    get(target, prop) {
      if (prop === 'then') {
        return (resolve: (v: MockResult) => void) => resolve({ data: result.data, error: result.error })
      }
      return target[prop as string]
    },
  }

  const proxy = new Proxy(queryBuilder, handler)

  for (const key of Object.keys(queryBuilder)) {
    if (key !== 'single' && key !== 'maybeSingle') {
      queryBuilder[key] = vi.fn().mockReturnValue(proxy)
    }
  }

  const tabellen: Record<string, any> = {}

  const client = {
    from: vi.fn((tabelle: string) => {
      if (tabellen[tabelle]) {
        result.data = tabellen[tabelle]
        result.error = null
      }
      return proxy
    }),
    rpc: vi.fn(() => Promise.resolve({ data: rpcResult.data, error: rpcResult.error })),
  }

  return {
    client,
    queryBuilder,
    _setResult(data: any, error: any = null) {
      result.data = data
      result.error = error
    },
    _setRpcResult(data: any, error: any = null) {
      rpcResult.data = data
      rpcResult.error = error
    },
    _setTableData(tabelle: string, data: any[]) {
      tabellen[tabelle] = data
    },
    _reset() {
      result.data = null
      result.error = null
      rpcResult.data = null
      rpcResult.error = null
      for (const fn of Object.values(queryBuilder)) {
        if (typeof fn.mockClear === 'function') fn.mockClear()
      }
      client.from.mockClear()
      client.rpc.mockClear()
      for (const key of Object.keys(tabellen)) delete tabellen[key]
    },
  }
}
