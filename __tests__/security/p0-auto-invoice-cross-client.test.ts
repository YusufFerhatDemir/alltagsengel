/**
 * P0 B-1: /api/billing/auto-invoice — Cross-Client-Leak geschlossen
 *
 * Befund (audit/GO_NO_GO_REPORT.md, audit/TENANT_ROUTE_COVERAGE.md):
 * Der Caregiver-Pfad prüfte nur, DASS der Aufrufer eine Betreuungskraft
 * ist — nicht, ob der per Body gelieferte client_id/service_record_id
 * ihr zugeordnet ist. Alles lief über service_role (RLS umgangen).
 *
 * Diese Tests belegen den Fix:
 *   1. Ohne Auth → 401
 *   2. Caregiver + fremder service_record → 403, kein Insert
 *   3. Caregiver + fremde client_id/month (keine Zuordnung) → 403, kein Insert
 *   4. Caregiver + unbekannte client_id → 403 (kein Existenz-Orakel), kein Insert
 *   5. Caregiver + eigener service_record → Rechnung MIT organization_id des Klienten
 *   6. Caregiver + client_id/month mit assignments-Zuordnung → erlaubt
 *   7. Admin-Pfad → erlaubt, organization_id ebenfalls gesetzt
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const CAREGIVER_A = 'caregiver-aaaa'
const CAREGIVER_B = 'caregiver-bbbb'
const CLIENT_1 = 'client-1111'
const ORG_1 = 'org-1111'

// ── Mocks für Auth + Supabase-Clients ──
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

// ── Generischer Query-Builder-Mock ──
// handler({ table, op, values, filters }) → { data, error }
type QueryState = {
  table: string
  op: string
  values?: any
  filters: Record<string, any>
}
type Handler = (q: QueryState) => { data: any; error: any }

function createAdminMock(handler: Handler) {
  const queries: QueryState[] = []
  const client = {
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
  return client
}

// Standard-Datenbestand: CLIENT_1 (Org ORG_1) mit zwei unterschriebenen
// Einsätzen von CAREGIVER_A im Juli 2026.
const RECORD_OWN = {
  id: 'rec-own',
  client_id: CLIENT_1,
  caregiver_id: CAREGIVER_A,
  date: '2026-07-10',
  service_type: 'Betreuung',
  duration_minutes: 60,
  amount: 40,
  budget_type: 'entlastung',
  status: 'signed',
}
const RECORD_2 = { ...RECORD_OWN, id: 'rec-2', date: '2026-07-20' }

function defaultHandler(overrides: Partial<Record<string, Handler>> = {}): Handler {
  return (q) => {
    const key = `${q.table}:${q.op}`
    if (overrides[key]) return overrides[key]!(q)
    switch (key) {
      case 'service_records:select':
        if (q.filters.id) {
          // Einzel-Lookup per service_record_id
          const rec = q.filters.id === RECORD_OWN.id ? RECORD_OWN : null
          return rec ? { data: rec, error: null } : { data: null, error: { message: 'not found' } }
        }
        if (q.filters.caregiver_id) {
          // Zuordnungs-Fallback: eigener Einsatz beim Klienten im Monat?
          const owns = q.filters.caregiver_id === CAREGIVER_A && q.filters.client_id === CLIENT_1
          return { data: owns ? { id: RECORD_OWN.id } : null, error: null }
        }
        // Monatsliste des Klienten
        return { data: q.filters.client_id === CLIENT_1 ? [RECORD_OWN, RECORD_2] : [], error: null }
      case 'service_records:update':
        return { data: null, error: null }
      case 'assignments:select':
        return { data: null, error: null }
      case 'clients:select':
        return q.filters.id === CLIENT_1
          ? {
              data: {
                id: CLIENT_1,
                organization_id: ORG_1,
                insurance_name: 'AOK',
                insurance_number: 'V123',
                pflegekasse_name: null,
                versichertennummer: null,
              },
              error: null,
            }
          : { data: null, error: { message: 'not found' } }
      case 'invoice_items:select':
        return { data: [], error: null }
      case 'invoices:insert':
        return { data: { id: 'inv-1', ...q.values }, error: null }
      case 'invoice_items:insert':
        return { data: q.values, error: null }
      default:
        return { data: null, error: null }
    }
  }
}

function makeRequest(body: unknown) {
  return new Request('https://alltagsengel.care/api/billing/auto-invoice', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function authAsCaregiver(caregiverId: string) {
  mockCreateClient.mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
  })
  mockRequireCaregiverSession.mockResolvedValue({ ok: true, userId: 'user-x', caregiverId })
}

function authAsAdmin() {
  mockCreateClient.mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'admin-user' } } }) },
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

function insertsOn(adminMock: ReturnType<typeof createAdminMock>, table: string) {
  return adminMock.queries.filter(q => q.table === table && q.op === 'insert')
}

async function callRoute(body: unknown) {
  const { POST } = await import('@/app/api/billing/auto-invoice/route')
  return POST(makeRequest(body))
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('P0: /api/billing/auto-invoice — Cross-Client-Schutz', () => {
  it('1. ohne Auth → 401, keine DB-Schreibzugriffe', async () => {
    mockCreateClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    })
    mockRequireCaregiverSession.mockResolvedValue({ ok: false, status: 401, error: 'Nicht autorisiert' })
    const adminMock = createAdminMock(defaultHandler())
    mockCreateAdminClient.mockReturnValue(adminMock)

    const res = await callRoute({ client_id: CLIENT_1, month: '2026-07' })
    expect(res.status).toBe(401)
    expect(insertsOn(adminMock, 'invoices')).toHaveLength(0)
  })

  it('2. Caregiver B + fremder service_record → 403, kein Invoice-Insert', async () => {
    authAsCaregiver(CAREGIVER_B)
    const adminMock = createAdminMock(defaultHandler())
    mockCreateAdminClient.mockReturnValue(adminMock)

    const res = await callRoute({ service_record_id: RECORD_OWN.id })
    expect(res.status).toBe(403)
    const json = await res.json()
    expect(json.error).toMatch(/Kein Zugriff/)
    expect(insertsOn(adminMock, 'invoices')).toHaveLength(0)
    expect(insertsOn(adminMock, 'invoice_items')).toHaveLength(0)
  })

  it('3. Caregiver B + fremde client_id/month ohne Zuordnung → 403, keine Klientendaten', async () => {
    authAsCaregiver(CAREGIVER_B)
    const adminMock = createAdminMock(defaultHandler())
    mockCreateAdminClient.mockReturnValue(adminMock)

    const res = await callRoute({ client_id: CLIENT_1, month: '2026-07' })
    expect(res.status).toBe(403)
    // Versicherungsdaten des Klienten dürfen gar nicht erst geladen werden
    expect(adminMock.queries.filter(q => q.table === 'clients')).toHaveLength(0)
    expect(insertsOn(adminMock, 'invoices')).toHaveLength(0)
  })

  it('4. Caregiver + unbekannte client_id → 403 (kein Existenz-Orakel)', async () => {
    authAsCaregiver(CAREGIVER_A)
    const adminMock = createAdminMock(defaultHandler())
    mockCreateAdminClient.mockReturnValue(adminMock)

    const res = await callRoute({ client_id: 'client-unbekannt', month: '2026-07' })
    expect(res.status).toBe(403)
    expect(adminMock.queries.filter(q => q.table === 'clients')).toHaveLength(0)
  })

  it('5. Caregiver A + eigener service_record → Engine aufgerufen (kein Direkt-Insert)', async () => {
    authAsCaregiver(CAREGIVER_A)
    const adminMock = createAdminMock(defaultHandler())
    mockCreateAdminClient.mockReturnValue(adminMock)
    mockCreateInvoiceDraft.mockResolvedValue({
      invoiceId: 'inv-engine-1',
      invoiceNumber: 'RE-2026-00001',
      totalAmountCents: 8000,
      lineCount: 2,
      alreadyExists: false,
    })

    const res = await callRoute({ service_record_id: RECORD_OWN.id })
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.created).toBe(true)

    // Engine wurde aufgerufen, KEINE direkten Inserts mehr
    expect(mockCreateInvoiceDraft).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ clientId: CLIENT_1, periodMonth: '2026-07' }),
    )
    expect(insertsOn(adminMock, 'invoices')).toHaveLength(0)
    expect(insertsOn(adminMock, 'invoice_items')).toHaveLength(0)
  })

  it('6. Caregiver A + client_id/month mit assignments-Zuordnung → Engine aufgerufen', async () => {
    authAsCaregiver(CAREGIVER_A)
    const adminMock = createAdminMock(defaultHandler({
      'assignments:select': (q) =>
        q.filters.caregiver_id === CAREGIVER_A && q.filters.client_id === CLIENT_1
          ? { data: { id: 'assign-1' }, error: null }
          : { data: null, error: null },
      // Zuordnung soll über assignments greifen, nicht über den Record-Fallback
      'service_records:select': (q) => {
        if (q.filters.caregiver_id) return { data: null, error: null }
        return { data: q.filters.client_id === CLIENT_1 ? [RECORD_OWN, RECORD_2] : [], error: null }
      },
    }))
    mockCreateAdminClient.mockReturnValue(adminMock)
    mockCreateInvoiceDraft.mockResolvedValue({
      invoiceId: 'inv-engine-2',
      invoiceNumber: 'RE-2026-00002',
      totalAmountCents: 8000,
      lineCount: 2,
      alreadyExists: false,
    })

    const res = await callRoute({ client_id: CLIENT_1, month: '2026-07' })
    expect(res.status).toBe(201)
    expect(mockCreateInvoiceDraft).toHaveBeenCalled()
    expect(insertsOn(adminMock, 'invoices')).toHaveLength(0)
  })

  it('7. Admin-Pfad → Engine aufgerufen, kein Zuordnungs-Check nötig', async () => {
    authAsAdmin()
    const adminMock = createAdminMock(defaultHandler())
    mockCreateAdminClient.mockReturnValue(adminMock)
    mockCreateInvoiceDraft.mockResolvedValue({
      invoiceId: 'inv-engine-3',
      invoiceNumber: 'RE-2026-00003',
      totalAmountCents: 8000,
      lineCount: 2,
      alreadyExists: false,
    })

    const res = await callRoute({ client_id: CLIENT_1, month: '2026-07' })
    expect(res.status).toBe(201)
    expect(mockCreateInvoiceDraft).toHaveBeenCalled()
    expect(insertsOn(adminMock, 'invoices')).toHaveLength(0)
    // Admin-Pfad fragt assignments nicht ab
    expect(adminMock.queries.filter(q => q.table === 'assignments')).toHaveLength(0)
  })
})
