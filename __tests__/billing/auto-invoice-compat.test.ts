/**
 * Auto-Invoice API-Kompatibilitätstests
 *
 * Prüft, dass die Umstellung auf die Billing-Engine das bestehende
 * API-Format nicht bricht. Alte Clients erwarten:
 *   { ready, created, invoice: {...}, items: [...], record_count }
 *
 * Neue Clients können zusätzlich nutzen:
 *   { invoices: [...], invoiceIds: [...] }
 *
 * Szenarien:
 * 1. Genau eine erzeugte Rechnung → invoice + items vorhanden
 * 2. Mehrere Rechnungen (verschiedene Budget-Typen) → invoice = erste
 * 3. Client mit altem erwarteten Format → alle alten Felder vorhanden
 * 4. Leeres Ergebnis (keine abrechenbaren Records) → ready: false
 * 5. Teilfehler (ein Budget-Typ OK, einer fehlerhaft) → 201 mit warnings
 * 6. Wiederholter idempotenter Request → alreadyExists, kein Duplikat
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks ──
const { mockRequireCaregiverSession, mockCreateClient, mockCreateAdminClient, mockCreateInvoiceDraft } = vi.hoisted(() => ({
  mockRequireCaregiverSession: vi.fn(),
  mockCreateClient: vi.fn(),
  mockCreateAdminClient: vi.fn(),
  mockCreateInvoiceDraft: vi.fn(),
}))

vi.mock('@/lib/native-auth', () => ({
  requireCaregiverSession: mockRequireCaregiverSession,
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: mockCreateClient,
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: mockCreateAdminClient,
}))
// Fail-closed getActiveOrgId (Audit MITTEL-1): ohne Mitgliedschaft liefert
// die echte Funktion null und die Route antwortet mit 403. Im Test wird
// eine gueltige Organisation gestellt.
vi.mock('@/lib/organizations/server', () => ({
  getActiveOrgId: async () => 'org-test',
  getActiveOrgIdOrDefault: async () => 'org-test',
  resolveUserOrgId: async () => 'org-test',
}))

vi.mock('@/lib/billing/core', () => ({
  createInvoiceDraft: (...args: unknown[]) => mockCreateInvoiceDraft(...args),
}))

// ── Testdaten ──
const CLIENT_ID = 'client-compat-1'
const ORG_ID = 'org-compat-1'
const RECORD_1 = {
  id: 'rec-c1', client_id: CLIENT_ID, caregiver_id: 'cg-1',
  date: '2026-08-10', service_type: 'Betreuung', duration_minutes: 60,
  amount: 40, budget_type: 'entlastung', status: 'signed',
}
const RECORD_2 = { ...RECORD_1, id: 'rec-c2', date: '2026-08-15', budget_type: 'private' }

const FULL_INVOICE = {
  id: 'inv-full-1',
  invoice_number: 'RE-2026-00010',
  invoice_number_formatted: 'RE-2026-00010',
  client_id: CLIENT_ID,
  organization_id: ORG_ID,
  total_amount: 40,
  budget_amount: 40,
  private_amount: 0,
  status: 'entwurf',
  period_start: '2026-08-01',
  period_end: '2026-08-31',
}

const INVOICE_ITEMS = [
  { id: 'item-1', invoice_id: 'inv-full-1', service_record_id: 'rec-c1', amount: 40 },
]

// ── Admin-Mock Builder ──
type QueryState = { table: string; op: string; values?: any; filters: Record<string, any> }
type Handler = (q: QueryState) => { data: any; error: any }

function createAdminMock(handler: Handler) {
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
        gte(col: string, val: any) { state.filters[`gte:${col}`] = val; return builder },
        lte(col: string, val: any) { state.filters[`lte:${col}`] = val; return builder },
        in(col: string, vals: any) { state.filters[`in:${col}`] = vals; return builder },
        limit() { return builder },
        single() { return Promise.resolve(handler(state)) },
        maybeSingle() { return Promise.resolve(handler(state)) },
        then(onFulfilled: any, onRejected: any) {
          return Promise.resolve(handler(state)).then(onFulfilled, onRejected)
        },
      }
      return builder
    },
  }
}

function defaultHandler(overrides: Partial<Record<string, Handler>> = {}): Handler {
  return (q) => {
    const key = `${q.table}:${q.op}`
    if (overrides[key]) return overrides[key]!(q)
    switch (key) {
      case 'service_records:select':
        if (q.filters.id) return { data: RECORD_1, error: null }
        return { data: [RECORD_1], error: null }
      case 'service_records:update':
        return { data: null, error: null }
      case 'clients:select':
        return {
          data: {
            id: CLIENT_ID, organization_id: ORG_ID,
            insurance_name: 'AOK', insurance_number: 'V123',
            pflegekasse_name: null, versichertennummer: null,
          },
          error: null,
        }
      case 'invoice_items:select':
        if (q.filters.invoice_id === 'inv-full-1') return { data: INVOICE_ITEMS, error: null }
        return { data: [], error: null }
      case 'invoices:select':
        if (q.filters.id === 'inv-full-1') return { data: FULL_INVOICE, error: null }
        return { data: null, error: null }
      default:
        return { data: null, error: null }
    }
  }
}

function authAsAdmin() {
  mockCreateClient.mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'admin-1' } } }) },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: vi.fn().mockResolvedValue({ data: { role: 'admin' }, error: null }),
        }),
      }),
    }),
  })
  mockRequireCaregiverSession.mockResolvedValue({ ok: false, status: 401, error: 'Nicht autorisiert' })
}

function makeRequest(body: unknown) {
  return new Request('https://alltagsengel.care/api/billing/auto-invoice', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function callRoute(body: unknown) {
  const { POST } = await import('@/app/api/billing/auto-invoice/route')
  return POST(makeRequest(body))
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Auto-Invoice API-Kompatibilität', () => {
  it('1. Eine Rechnung → invoice + items im alten Format vorhanden', async () => {
    authAsAdmin()
    const adminMock = createAdminMock(defaultHandler())
    mockCreateAdminClient.mockReturnValue(adminMock)
    mockCreateInvoiceDraft.mockResolvedValue({
      invoiceId: 'inv-full-1',
      invoiceNumber: 'RE-2026-00010',
      totalAmountCents: 4000,
      lineCount: 1,
      alreadyExists: false,
    })

    const res = await callRoute({ client_id: CLIENT_ID, month: '2026-08' })
    expect(res.status).toBe(201)

    const json = await res.json()

    // Altes Format: invoice, items, record_count
    expect(json.ready).toBe(true)
    expect(json.created).toBe(true)
    expect(json.invoice).toBeDefined()
    expect(json.invoice.id).toBe('inv-full-1')
    expect(json.invoice.invoice_number).toBeDefined()
    expect(json.items).toBeDefined()
    expect(Array.isArray(json.items)).toBe(true)
    expect(json.record_count).toBeGreaterThan(0)

    // Neues Format: invoices[], invoiceIds[]
    expect(json.invoices).toHaveLength(1)
    expect(json.invoiceIds).toEqual(['inv-full-1'])
  })

  it('2. Mehrere Budget-Typen → invoice = erste, invoices = alle', async () => {
    authAsAdmin()
    const adminMock = createAdminMock(defaultHandler({
      'service_records:select': (q) => {
        if (q.filters.id) return { data: RECORD_1, error: null }
        return { data: [RECORD_1, RECORD_2], error: null }
      },
    }))
    mockCreateAdminClient.mockReturnValue(adminMock)

    let callCount = 0
    mockCreateInvoiceDraft.mockImplementation(() => {
      callCount++
      return Promise.resolve({
        invoiceId: `inv-multi-${callCount}`,
        invoiceNumber: `RE-2026-0001${callCount}`,
        totalAmountCents: 4000,
        lineCount: 1,
        alreadyExists: false,
      })
    })

    const res = await callRoute({ client_id: CLIENT_ID, month: '2026-08' })
    expect(res.status).toBe(201)
    const json = await res.json()

    // Rückwärtskompatibel: invoice = erste Rechnung
    expect(json.invoice).toBeDefined()
    expect(json.invoice.id).toContain('inv-multi')

    // Neu: invoices hat alle
    expect(json.invoices).toHaveLength(2)
    expect(json.invoiceIds).toHaveLength(2)
  })

  it('3. Altes Format: alle erwarteten Felder vorhanden', async () => {
    authAsAdmin()
    const adminMock = createAdminMock(defaultHandler())
    mockCreateAdminClient.mockReturnValue(adminMock)
    mockCreateInvoiceDraft.mockResolvedValue({
      invoiceId: 'inv-full-1',
      invoiceNumber: 'RE-2026-00010',
      totalAmountCents: 4000,
      lineCount: 1,
      alreadyExists: false,
    })

    const res = await callRoute({ client_id: CLIENT_ID, month: '2026-08' })
    const json = await res.json()

    // Alle Felder, die ein alter Client erwartet:
    const requiredFields = ['ready', 'created', 'invoice', 'items', 'record_count']
    for (const field of requiredFields) {
      expect(json).toHaveProperty(field)
    }

    // invoice muss ein Objekt sein (nicht null, nicht Array)
    expect(typeof json.invoice).toBe('object')
    expect(json.invoice).not.toBeNull()
    expect(Array.isArray(json.invoice)).toBe(false)
  })

  it('4. Keine abrechenbaren Records → ready: false (unverändertes Format)', async () => {
    authAsAdmin()
    const adminMock = createAdminMock(defaultHandler({
      'service_records:select': () => ({ data: [], error: null }),
    }))
    mockCreateAdminClient.mockReturnValue(adminMock)

    const res = await callRoute({ client_id: CLIENT_ID, month: '2026-08' })
    const json = await res.json()

    // Dieses Format war schon immer so und bleibt unverändert
    expect(json.ready).toBe(false)
    expect(json.invoice).toBeNull()
  })

  it('5. Teilfehler → 201 mit warnings, invoice von erfolgreichem Typ', async () => {
    authAsAdmin()
    const adminMock = createAdminMock(defaultHandler({
      'service_records:select': (q) => {
        if (q.filters.id) return { data: RECORD_1, error: null }
        return { data: [RECORD_1, RECORD_2], error: null }
      },
    }))
    mockCreateAdminClient.mockReturnValue(adminMock)

    let callCount = 0
    mockCreateInvoiceDraft.mockImplementation(() => {
      callCount++
      if (callCount === 2) {
        return Promise.reject(new Error('Tarif nicht gefunden'))
      }
      return Promise.resolve({
        invoiceId: 'inv-partial-1',
        invoiceNumber: 'RE-2026-00020',
        totalAmountCents: 4000,
        lineCount: 1,
        alreadyExists: false,
      })
    })

    const res = await callRoute({ client_id: CLIENT_ID, month: '2026-08' })
    expect(res.status).toBe(201)
    const json = await res.json()

    expect(json.created).toBe(true)
    expect(json.invoice).toBeDefined()
    expect(json.invoices).toHaveLength(1)
    expect(json.warnings).toBeDefined()
    expect(json.warnings.length).toBeGreaterThan(0)
    expect(json.warnings[0]).toContain('Tarif nicht gefunden')
  })

  it('6. Idempotenter Request → alreadyExists, kein Duplikat', async () => {
    authAsAdmin()
    const adminMock = createAdminMock(defaultHandler())
    mockCreateAdminClient.mockReturnValue(adminMock)
    mockCreateInvoiceDraft.mockResolvedValue({
      invoiceId: 'inv-full-1',
      invoiceNumber: 'RE-2026-00010',
      totalAmountCents: 4000,
      lineCount: 0,
      alreadyExists: true,
    })

    const res = await callRoute({ client_id: CLIENT_ID, month: '2026-08' })
    expect(res.status).toBe(201)
    const json = await res.json()

    expect(json.created).toBe(true)
    expect(json.invoices[0].alreadyExists).toBe(true)
    expect(json.invoice).toBeDefined()
    // Engine wurde genau 1x aufgerufen (nicht 2x)
    expect(mockCreateInvoiceDraft).toHaveBeenCalledTimes(1)
  })

  it('Alle Engine-Fehler → 500 mit error und warnings', async () => {
    authAsAdmin()
    const adminMock = createAdminMock(defaultHandler())
    mockCreateAdminClient.mockReturnValue(adminMock)
    mockCreateInvoiceDraft.mockRejectedValue(new Error('DB-Verbindung fehlgeschlagen'))

    const res = await callRoute({ client_id: CLIENT_ID, month: '2026-08' })
    expect(res.status).toBe(500)
    const json = await res.json()

    expect(json.error).toContain('fehlgeschlagen')
    expect(json.warnings).toBeDefined()
  })
})
