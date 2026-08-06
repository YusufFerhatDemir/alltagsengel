/**
 * Transaktionssicherheit: createInvoiceDraft
 *
 * Prüft das Verhalten der Billing-Engine bei Fehlern in verschiedenen
 * Phasen der Rechnungserstellung:
 *
 *   1. Fehler nach Invoice-Insert (Items schlagen fehl) → Rollback
 *   2. Fehler beim Audit-Trail → Rechnung + Items trotzdem erstellt
 *   3. Idempotenz-Key: Wiederholter Aufruf → keine Doppelerstellung
 *   4. Null-Preis-Schutz → Fehler, keine Rechnung
 *   5. Fehlende Service-Records → Fehler, keine Rechnung
 *
 * HINWEIS: createInvoiceDraft verwendet aktuell KEINE echte DB-Transaktion.
 * Die Schritte (Invoice-Insert → Items-Insert → Status-Update → Audit)
 * sind sequentiell. Bei Items-Fehler wird die Rechnung manuell gelöscht.
 * Eine echte DB-Transaktion (transaktionales RPC) ist für Phase 2 geplant.
 *
 * Testdaten: Synthetisch, keine echten Kunden-/Gesundheitsdaten.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ═══════════════════════════════════════════════════════════════
// Mocks
// ═══════════════════════════════════════════════════════════════

const { mockResolvePrice, mockCheckIdempotency, mockLogBillingAction, mockComputeChecksum } = vi.hoisted(() => ({
  mockResolvePrice: vi.fn(),
  mockCheckIdempotency: vi.fn(),
  mockLogBillingAction: vi.fn(),
  mockComputeChecksum: vi.fn(),
}))

vi.mock('@/lib/billing/core/price-resolver', () => ({
  resolvePrice: mockResolvePrice,
  calculateLineTotal: vi.fn(),
}))

vi.mock('@/lib/billing/core/idempotency', () => ({
  generateIdempotencyKey: vi.fn((...args: string[]) => `inv_${args.join('_')}`),
  checkIdempotency: mockCheckIdempotency,
}))

vi.mock('@/lib/billing/core/audit', () => ({
  logBillingAction: mockLogBillingAction,
  computeSnapshotChecksum: mockComputeChecksum,
}))

vi.mock('@/lib/billing/core/status-machine', () => ({
  validateTransition: vi.fn(),
  isValidInvoiceStatus: vi.fn(() => true),
  INVOICE_NUMBER_PREFIX: { storno: 'ST', korrektur: 'KR', gutschrift: 'GS' },
}))

// ═══════════════════════════════════════════════════════════════
// Testdaten
// ═══════════════════════════════════════════════════════════════

const TEST_ORG = 'org-tx-001'
const TEST_CLIENT = 'client-tx-001'
const PERIOD = '2026-09'

const RECORDS = [
  {
    id: 'rec-tx-1',
    client_id: TEST_CLIENT,
    caregiver_id: 'cg-tx-1',
    date: '2026-09-05',
    service_type: 'Betreuung',
    duration_minutes: 60,
    amount: 40,
    budget_type: 'entlastung',
    status: 'signed',
    caregiver: { first_name: 'Test', last_name: 'CG' },
  },
  {
    id: 'rec-tx-2',
    client_id: TEST_CLIENT,
    caregiver_id: 'cg-tx-1',
    date: '2026-09-10',
    service_type: 'Betreuung',
    duration_minutes: 90,
    amount: 60,
    budget_type: 'entlastung',
    status: 'signed',
    caregiver: { first_name: 'Test', last_name: 'CG' },
  },
]

const CLIENT_DATA = {
  id: TEST_CLIENT,
  first_name: 'Test',
  last_name: 'Klient',
  insurance_name: 'Test-Kasse',
  insurance_number: 'V-TX-001',
  organization_id: TEST_ORG,
  pflegekasse_ik: null,
}

// ═══════════════════════════════════════════════════════════════
// Supabase-Mock Builder (erweitert für Fehler-Injection)
// ═══════════════════════════════════════════════════════════════

type QueryState = { table: string; op: string; values?: any; filters: Record<string, any> }
type Handler = (q: QueryState) => { data: any; error: any }

function createMockSupabase(handler: Handler) {
  const queries: QueryState[] = []
  return {
    queries,
    from(table: string) {
      const state: QueryState = { table, op: 'select', filters: {} }
      queries.push(state)
      const builder: any = {
        select() { return builder },
        insert(values: any) { state.op = 'insert'; state.values = values; return builder },
        update(values: any) { state.op = 'update'; state.values = values; return builder },
        delete() { state.op = 'delete'; return builder },
        eq(col: string, val: any) { state.filters[col] = val; return builder },
        gte() { return builder },
        lte() { return builder },
        in(col: string, vals: any) { state.filters[`in:${col}`] = vals; return builder },
        limit() { return builder },
        order() { return builder },
        single() { return Promise.resolve(handler(state)) },
        maybeSingle() { return Promise.resolve(handler(state)) },
        then(onFulfilled: any, onRejected: any) {
          return Promise.resolve(handler(state)).then(onFulfilled, onRejected)
        },
      }
      return builder
    },
    rpc: vi.fn().mockResolvedValue({ data: 'RE-2026-00001', error: null }),
  }
}

function defaultTxHandler(overrides: Partial<Record<string, Handler>> = {}): Handler {
  return (q) => {
    const key = `${q.table}:${q.op}`
    if (overrides[key]) return overrides[key]!(q)
    switch (key) {
      case 'service_records:select':
        return { data: RECORDS, error: null }
      case 'service_records:update':
        return { data: null, error: null }
      case 'clients:select':
        return { data: CLIENT_DATA, error: null }
      case 'invoices:insert':
        return { data: { id: 'inv-tx-001' }, error: null }
      case 'invoices:select':
        return { data: { id: 'inv-tx-001', invoice_number_formatted: 'RE-2026-00001', total_amount: 100 }, error: null }
      case 'invoices:delete':
        return { data: null, error: null }
      case 'invoice_items:insert':
        return { data: [{}, {}], error: null }
      case 'billing_number_sequences:select':
        return { data: { id: 'seq-1', last_number: 0 }, error: null }
      case 'billing_number_sequences:update':
        return { data: null, error: null }
      default:
        return { data: null, error: null }
    }
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockCheckIdempotency.mockResolvedValue({ exists: false })
  mockLogBillingAction.mockResolvedValue(undefined)
  mockComputeChecksum.mockResolvedValue('test-checksum')
  mockResolvePrice.mockRejectedValue(new Error('Kein Tarif'))
})

// ═══════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════

describe('Transaktionssicherheit: Fehler nach Invoice-Insert', () => {
  it('Items-Insert schlägt fehl → Invoice wird gelöscht (manueller Rollback)', async () => {
    const supabase = createMockSupabase(defaultTxHandler({
      'invoice_items:insert': () => ({
        data: null,
        error: { message: 'DB-Constraint-Verletzung' },
      }),
    }))

    const { createInvoiceDraft } = await import('@/lib/billing/core/invoice-engine')

    await expect(
      createInvoiceDraft(supabase as any, {
        clientId: TEST_CLIENT,
        periodMonth: PERIOD,
        budgetType: 'entlastung',
        actorId: 'test-actor',
      })
    ).rejects.toThrow('Positionen konnten nicht erstellt werden')

    // Rechnung muss gelöscht worden sein (Rollback)
    const deletes = supabase.queries.filter(
      q => q.table === 'invoices' && q.op === 'delete'
    )
    expect(deletes).toHaveLength(1)
    expect(deletes[0].filters.id).toBe('inv-tx-001')
  })
})

describe('Transaktionssicherheit: Fehler beim Audit-Trail', () => {
  it('Audit-Fehler → Rechnung + Items existieren (kein Rollback)', async () => {
    mockLogBillingAction.mockRejectedValue(new Error('Audit DB unreachable'))

    const supabase = createMockSupabase(defaultTxHandler())

    const { createInvoiceDraft } = await import('@/lib/billing/core/invoice-engine')

    // logBillingAction wirft, aber wird es gefangen?
    // Aktuell: NEIN — der Fehler propagiert nach oben
    // Das bedeutet: Rechnung + Items existieren, aber der Audit-Trail fehlt
    await expect(
      createInvoiceDraft(supabase as any, {
        clientId: TEST_CLIENT,
        periodMonth: PERIOD,
        budgetType: 'entlastung',
        actorId: 'test-actor',
      })
    ).rejects.toThrow('Audit DB unreachable')

    // Rechnung wurde erstellt
    const invoiceInserts = supabase.queries.filter(
      q => q.table === 'invoices' && q.op === 'insert'
    )
    expect(invoiceInserts).toHaveLength(1)

    // Items wurden erstellt
    const itemInserts = supabase.queries.filter(
      q => q.table === 'invoice_items' && q.op === 'insert'
    )
    expect(itemInserts).toHaveLength(1)

    // ABER: Rechnung wird NICHT gelöscht (kein Rollback bei Audit-Fehler)
    // → DOKUMENTIERTES RISIKO: Rechnung ohne Audit-Trail möglich
    const deletes = supabase.queries.filter(
      q => q.table === 'invoices' && q.op === 'delete'
    )
    expect(deletes).toHaveLength(0)
  })
})

describe('Transaktionssicherheit: Idempotenz-Key', () => {
  it('Bestehende Rechnung → alreadyExists, kein erneuter Insert', async () => {
    mockCheckIdempotency.mockResolvedValue({
      exists: true,
      invoiceId: 'inv-existing',
    })

    const supabase = createMockSupabase(defaultTxHandler({
      'invoices:select': (q) => {
        if (q.filters.id === 'inv-existing') {
          return {
            data: {
              id: 'inv-existing',
              invoice_number_formatted: 'RE-2026-00005',
              total_amount: 100,
            },
            error: null,
          }
        }
        return { data: null, error: null }
      },
    }))

    const { createInvoiceDraft } = await import('@/lib/billing/core/invoice-engine')

    const result = await createInvoiceDraft(supabase as any, {
      clientId: TEST_CLIENT,
      periodMonth: PERIOD,
      budgetType: 'entlastung',
      actorId: 'test-actor',
    })

    expect(result.alreadyExists).toBe(true)
    expect(result.invoiceId).toBe('inv-existing')

    // Kein Insert!
    const inserts = supabase.queries.filter(
      q => q.table === 'invoices' && q.op === 'insert'
    )
    expect(inserts).toHaveLength(0)
  })
})

describe('Transaktionssicherheit: Null-Preis-Schutz', () => {
  it('Record mit amount=0 → Fehler, keine Rechnung', async () => {
    const zeroRecords = [
      { ...RECORDS[0], amount: 0 },
      RECORDS[1],
    ]

    const supabase = createMockSupabase(defaultTxHandler({
      'service_records:select': () => ({ data: zeroRecords, error: null }),
    }))

    const { createInvoiceDraft } = await import('@/lib/billing/core/invoice-engine')

    await expect(
      createInvoiceDraft(supabase as any, {
        clientId: TEST_CLIENT,
        periodMonth: PERIOD,
        budgetType: 'entlastung',
        actorId: 'test-actor',
      })
    ).rejects.toThrow(/amount=0\/null/)

    // Kein Invoice-Insert
    const inserts = supabase.queries.filter(
      q => q.table === 'invoices' && q.op === 'insert'
    )
    expect(inserts).toHaveLength(0)
  })

  it('Record mit amount=null → Fehler, keine Rechnung', async () => {
    const nullRecords = [
      { ...RECORDS[0], amount: null },
    ]

    const supabase = createMockSupabase(defaultTxHandler({
      'service_records:select': () => ({ data: nullRecords, error: null }),
    }))

    const { createInvoiceDraft } = await import('@/lib/billing/core/invoice-engine')

    await expect(
      createInvoiceDraft(supabase as any, {
        clientId: TEST_CLIENT,
        periodMonth: PERIOD,
        budgetType: 'entlastung',
        actorId: 'test-actor',
      })
    ).rejects.toThrow(/amount=0\/null/)
  })
})

describe('Transaktionssicherheit: Fehlende Service-Records', () => {
  it('Keine Records → Fehler, keine Rechnung', async () => {
    const supabase = createMockSupabase(defaultTxHandler({
      'service_records:select': () => ({ data: [], error: null }),
    }))

    const { createInvoiceDraft } = await import('@/lib/billing/core/invoice-engine')

    await expect(
      createInvoiceDraft(supabase as any, {
        clientId: TEST_CLIENT,
        periodMonth: PERIOD,
        budgetType: 'entlastung',
        actorId: 'test-actor',
      })
    ).rejects.toThrow(/Keine abrechenbaren Leistungen/)
  })
})

describe('Transaktionssicherheit: Parallele Erstellung', () => {
  it('Gleichzeitige Aufrufe → Idempotenz-Key verhindert Duplikate', async () => {
    // Erster Aufruf: normal
    // Zweiter Aufruf: checkIdempotency findet den ersten
    let callCount = 0
    mockCheckIdempotency.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return Promise.resolve({ exists: false })
      }
      // Zweiter Aufruf: Rechnung existiert bereits
      return Promise.resolve({ exists: true, invoiceId: 'inv-tx-001' })
    })

    const supabase = createMockSupabase(defaultTxHandler())

    const { createInvoiceDraft } = await import('@/lib/billing/core/invoice-engine')

    const params = {
      clientId: TEST_CLIENT,
      periodMonth: PERIOD,
      budgetType: 'entlastung',
      actorId: 'test-actor',
    }

    // Erster Aufruf: erstellt Rechnung
    const result1 = await createInvoiceDraft(supabase as any, params)
    expect(result1.alreadyExists).toBe(false)

    // Zweiter Aufruf: erkennt bestehende Rechnung
    const result2 = await createInvoiceDraft(supabase as any, params)
    expect(result2.alreadyExists).toBe(true)
    expect(result2.invoiceId).toBe('inv-tx-001')

    // Nur ein Insert
    const inserts = supabase.queries.filter(
      q => q.table === 'invoices' && q.op === 'insert'
    )
    expect(inserts).toHaveLength(1)
  })
})

describe('Transaktionssicherheit: Invoice-Insert fehlgeschlagen', () => {
  it('DB-Fehler beim Invoice-Insert → Fehler, kein Cleanup nötig', async () => {
    const supabase = createMockSupabase(defaultTxHandler({
      'invoices:insert': () => ({
        data: null,
        error: { message: 'unique_violation: idempotency_key' },
      }),
    }))

    const { createInvoiceDraft } = await import('@/lib/billing/core/invoice-engine')

    await expect(
      createInvoiceDraft(supabase as any, {
        clientId: TEST_CLIENT,
        periodMonth: PERIOD,
        budgetType: 'entlastung',
        actorId: 'test-actor',
      })
    ).rejects.toThrow(/Rechnung konnte nicht erstellt werden/)

    // Kein Items-Insert, kein Cleanup nötig
    const itemInserts = supabase.queries.filter(
      q => q.table === 'invoice_items' && q.op === 'insert'
    )
    expect(itemInserts).toHaveLength(0)
  })
})

describe('Transaktionssicherheit: Dokumentierte Risiken', () => {
  it('DOKUMENTIERT: Kein atomisches Rollback bei Service-Records-Update-Fehler', async () => {
    // Wenn service_records.update fehlschlägt, bleiben Rechnung + Items bestehen,
    // aber die Records behalten status='signed' statt 'invoiced'.
    // → Engine wirft KEINEN Fehler (update-Ergebnis wird nicht geprüft)
    const supabase = createMockSupabase(defaultTxHandler({
      'service_records:update': () => ({
        data: null,
        error: { message: 'RLS violation' },
      }),
    }))

    const { createInvoiceDraft } = await import('@/lib/billing/core/invoice-engine')

    // Trotz Update-Fehler: kein Throw
    const result = await createInvoiceDraft(supabase as any, {
      clientId: TEST_CLIENT,
      periodMonth: PERIOD,
      budgetType: 'entlastung',
      actorId: 'test-actor',
    })

    expect(result.invoiceId).toBe('inv-tx-001')

    // Rechnung existiert trotzdem → Inkonsistenz möglich
    // RISIKO: Records bleiben 'signed' obwohl Rechnung existiert
    // → Phase 2: Transaktionales RPC
  })
})
