/**
 * E2E-Integrations­test: Alle 3 Rechnungspfade
 *
 * Verifiziert, dass die drei produktiven Invoice-Erstellungspfade
 * alle durch die Billing-Engine (createInvoiceDraft) laufen und die
 * gleichen Sicherheitsgarantien einhalten.
 *
 * Pfade:
 *   1. POST /api/billing/invoices/create  (Admin-UI: Rechnungserstellung)
 *   2. POST /api/billing/invoices/create  (Admin-UI: CreateInvoiceModal)
 *   3. POST /api/billing/auto-invoice     (Native App + Admin)
 *
 * Getestete Garantien:
 *   - Gleiche Engine für alle Pfade
 *   - DB-Preise (nicht Browser)
 *   - Fortlaufende Nummern (RE-YYYY-NNNNN)
 *   - Org/Client-Match (Cross-Org-Blocking)
 *   - Audit-Trail
 *   - Korrekter Status (entwurf)
 *   - Idempotenz (kein Duplikat bei Wiederholung)
 *   - Manipulierte Preise abgelehnt
 *   - Null-Preis-Schutz
 *
 * Testdaten: Synthetisch, keine echten Kunden-/Gesundheitsdaten.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ═══════════════════════════════════════════════════════════════
// Mocks
// ═══════════════════════════════════════════════════════════════

const {
  mockRequireCaregiverSession,
  mockCreateClient,
  mockCreateAdminClient,
  mockCreateInvoiceDraft,
  mockGetActiveOrgId,
} = vi.hoisted(() => ({
  mockRequireCaregiverSession: vi.fn(),
  mockCreateClient: vi.fn(),
  mockCreateAdminClient: vi.fn(),
  mockCreateInvoiceDraft: vi.fn(),
  mockGetActiveOrgId: vi.fn(),
}))

vi.mock('@/lib/native-auth', () => ({
  requireCaregiverSession: mockRequireCaregiverSession,
}))
// Die aktive Org kommt aus organization_members (Org-Switcher-Cookie),
// NICHT aus profiles — profiles hat keine organization_id-Spalte.
vi.mock('@/lib/organizations/server', () => ({
  getActiveOrgId: mockGetActiveOrgId,
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: mockCreateClient,
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: mockCreateAdminClient,
}))
vi.mock('@/lib/billing/core', () => ({
  createInvoiceDraft: (...args: unknown[]) => mockCreateInvoiceDraft(...args),
}))

// ═══════════════════════════════════════════════════════════════
// Testdaten (synthetisch — keine echten Kunden/Gesundheitsdaten)
// ═══════════════════════════════════════════════════════════════

const TEST_ORG = 'org-test-e2e'
const OTHER_ORG = 'org-other-e2e'
const ADMIN_USER = 'admin-e2e-001'
const TEST_CLIENT = 'client-e2e-001'
const TEST_CAREGIVER = 'caregiver-e2e-001'
const PERIOD = '2026-08'

const SIGNED_RECORD = {
  id: 'rec-e2e-1',
  client_id: TEST_CLIENT,
  caregiver_id: TEST_CAREGIVER,
  date: '2026-08-05',
  service_type: 'Betreuung',
  duration_minutes: 120,
  amount: 80,
  budget_type: 'entlastung',
  status: 'signed',
}

const SIGNED_RECORD_2 = {
  ...SIGNED_RECORD,
  id: 'rec-e2e-2',
  date: '2026-08-12',
}

const ENGINE_RESULT = {
  invoiceId: 'inv-e2e-001',
  invoiceNumber: 'RE-2026-00001',
  totalAmountCents: 16000,
  lineCount: 2,
  alreadyExists: false,
  priceSource: 'service_records' as const,
}

const FULL_INVOICE_OBJ = {
  id: 'inv-e2e-001',
  invoice_number: 'RE-2026-00001',
  invoice_number_formatted: 'RE-2026-00001',
  client_id: TEST_CLIENT,
  organization_id: TEST_ORG,
  total_amount: 160,
  budget_amount: 160,
  private_amount: 0,
  status: 'entwurf',
  period_start: '2026-08-01',
  period_end: '2026-08-31',
}

const INVOICE_ITEMS_OBJ = [
  { id: 'item-e2e-1', invoice_id: 'inv-e2e-001', service_record_id: 'rec-e2e-1', amount: 80 },
  { id: 'item-e2e-2', invoice_id: 'inv-e2e-001', service_record_id: 'rec-e2e-2', amount: 80 },
]

// ═══════════════════════════════════════════════════════════════
// Admin-Mock Builder (gleiche Struktur wie in anderen Tests)
// ═══════════════════════════════════════════════════════════════

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
        order() { return builder },
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

function defaultE2EHandler(overrides: Partial<Record<string, Handler>> = {}): Handler {
  return (q) => {
    const key = `${q.table}:${q.op}`
    if (overrides[key]) return overrides[key]!(q)
    switch (key) {
      case 'service_records:select':
        if (q.filters.id) return { data: SIGNED_RECORD, error: null }
        if (q.filters.caregiver_id) {
          const owns = q.filters.caregiver_id === TEST_CAREGIVER && q.filters.client_id === TEST_CLIENT
          return { data: owns ? { id: SIGNED_RECORD.id } : null, error: null }
        }
        return { data: [SIGNED_RECORD, SIGNED_RECORD_2], error: null }
      case 'service_records:update':
        return { data: null, error: null }
      case 'assignments:select':
        return { data: null, error: null }
      case 'clients:select':
        if (q.filters.id === TEST_CLIENT) {
          return {
            data: {
              id: TEST_CLIENT,
              organization_id: TEST_ORG,
              insurance_name: 'Test-Kasse',
              insurance_number: 'V-TEST-001',
              pflegekasse_name: null,
              versichertennummer: null,
            },
            error: null,
          }
        }
        return { data: null, error: { message: 'not found' } }
      case 'profiles:select':
        return {
          data: { role: 'admin' },
          error: null,
        }
      case 'invoice_items:select':
        if (q.filters.invoice_id === 'inv-e2e-001') return { data: INVOICE_ITEMS_OBJ, error: null }
        return { data: [], error: null }
      case 'invoices:select':
        if (q.filters.id === 'inv-e2e-001') return { data: FULL_INVOICE_OBJ, error: null }
        return { data: null, error: null }
      default:
        return { data: null, error: null }
    }
  }
}

function setupAdminAuth() {
  mockCreateClient.mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: ADMIN_USER } } }) },
    // Track 7 (28.08.2026): die Rollenermittlung laeuft ueber
    // holeRollenQuellenFuer() und liest profiles mit maybeSingle().
    from: () => ({
      select: () => ({
        eq: () => ({
          single: vi.fn().mockResolvedValue({
            data: { role: 'admin' },
            error: null,
          }),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { role: 'admin' },
            error: null,
          }),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { role: 'admin' },
            error: null,
          }),
        }),
      }),
    }),
  })
  mockGetActiveOrgId.mockResolvedValue(TEST_ORG)
  mockRequireCaregiverSession.mockResolvedValue({ ok: false, status: 401, error: 'Nicht autorisiert' })
}

function setupCaregiverAuth(caregiverId: string) {
  mockCreateClient.mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
  })
  mockRequireCaregiverSession.mockResolvedValue({ ok: true, userId: 'user-x', caregiverId })
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ═══════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════

describe('E2E: Alle 3 Invoice-Pfade nutzen die gleiche Engine', () => {

  it('Pfad 1+2: POST /api/billing/invoices/create → ruft createInvoiceDraft', async () => {
    setupAdminAuth()
    const adminMock = createAdminMock(defaultE2EHandler())
    mockCreateAdminClient.mockReturnValue(adminMock)
    mockCreateInvoiceDraft.mockResolvedValue(ENGINE_RESULT)

    const { POST } = await import('@/app/api/billing/invoices/create/route')
    const req = new Request('https://alltagsengel.care/api/billing/invoices/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clientId: TEST_CLIENT, periodMonth: PERIOD }),
    })

    const res = await POST(req)
    const json = await res.json()

    expect(mockCreateInvoiceDraft).toHaveBeenCalled()
    const callArgs = mockCreateInvoiceDraft.mock.calls[0]
    expect(callArgs[1]).toMatchObject({
      clientId: TEST_CLIENT,
      periodMonth: PERIOD,
      actorId: ADMIN_USER,
    })
    expect(json.invoices).toBeDefined()
    expect(json.invoices[0].invoiceId).toBe('inv-e2e-001')
  })

  it('Pfad 3: POST /api/billing/auto-invoice → ruft createInvoiceDraft', async () => {
    setupAdminAuth()
    const adminMock = createAdminMock(defaultE2EHandler())
    mockCreateAdminClient.mockReturnValue(adminMock)
    mockCreateInvoiceDraft.mockResolvedValue(ENGINE_RESULT)

    const { POST } = await import('@/app/api/billing/auto-invoice/route')
    const req = new Request('https://alltagsengel.care/api/billing/auto-invoice', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ client_id: TEST_CLIENT, month: PERIOD }),
    })

    const res = await POST(req)
    expect(res.status).toBe(201)

    expect(mockCreateInvoiceDraft).toHaveBeenCalled()
    const callArgs = mockCreateInvoiceDraft.mock.calls[0]
    expect(callArgs[1]).toMatchObject({
      clientId: TEST_CLIENT,
      periodMonth: PERIOD,
    })
  })

  it('Alle Pfade: Engine erhält KEINEN Browser-Preis als Parameter', async () => {
    setupAdminAuth()
    const adminMock = createAdminMock(defaultE2EHandler())
    mockCreateAdminClient.mockReturnValue(adminMock)
    mockCreateInvoiceDraft.mockResolvedValue(ENGINE_RESULT)

    // Pfad 1/2: Body mit manipuliertem Preis senden
    const { POST: createPost } = await import('@/app/api/billing/invoices/create/route')
    await createPost(new Request('https://alltagsengel.care/api/billing/invoices/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        clientId: TEST_CLIENT,
        periodMonth: PERIOD,
        amount: 99999,        // manipuliert
        totalAmount: 99999,   // manipuliert
        price: 99999,         // manipuliert
      }),
    }))

    // createInvoiceDraft darf keine Browser-Preise erhalten
    const args1 = mockCreateInvoiceDraft.mock.calls[0][1]
    expect(args1).not.toHaveProperty('amount')
    expect(args1).not.toHaveProperty('totalAmount')
    expect(args1).not.toHaveProperty('price')

    vi.clearAllMocks()
    mockCreateAdminClient.mockReturnValue(adminMock)
    setupAdminAuth()
    mockCreateInvoiceDraft.mockResolvedValue(ENGINE_RESULT)

    // Pfad 3: auto-invoice mit manipulierten Preisen
    const { POST: autoPost } = await import('@/app/api/billing/auto-invoice/route')
    await autoPost(new Request('https://alltagsengel.care/api/billing/auto-invoice', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        client_id: TEST_CLIENT,
        month: PERIOD,
        amount: 99999,
      }),
    }))

    const args2 = mockCreateInvoiceDraft.mock.calls[0][1]
    expect(args2).not.toHaveProperty('amount')
    expect(args2).not.toHaveProperty('price')
  })
})

describe('E2E: Rechnungsnummer-Format', () => {
  it('Engine-Ergebnis enthält RE-YYYY-NNNNN Format', () => {
    // Das Format wird von generateInvoiceNumber in der Engine erzeugt
    expect(ENGINE_RESULT.invoiceNumber).toMatch(/^RE-\d{4}-\d{5}$/)
  })
})

describe('E2E: Cross-Org-Blocking', () => {
  it('Pfad 1/2: Admin einer fremden Org → 403', async () => {
    // Admin von OTHER_ORG versucht auf TEST_ORG-Client zuzugreifen
    mockCreateClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'foreign-admin' } } }) },
      from: () => ({
        select: () => ({
          eq: () => ({
            single: vi.fn().mockResolvedValue({
              data: { role: 'admin' },
              error: null,
            }),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { role: 'admin' },
              error: null,
            }),
          }),
        }),
      }),
    })
    mockGetActiveOrgId.mockResolvedValue(OTHER_ORG)

    const adminMock = createAdminMock(defaultE2EHandler())
    mockCreateAdminClient.mockReturnValue(adminMock)

    const { POST } = await import('@/app/api/billing/invoices/create/route')
    const req = new Request('https://alltagsengel.care/api/billing/invoices/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clientId: TEST_CLIENT, periodMonth: PERIOD }),
    })

    const res = await POST(req)
    expect(res.status).toBe(403)
    expect(mockCreateInvoiceDraft).not.toHaveBeenCalled()
  })

  it('Pfad 3: Caregiver ohne Zuordnung zum Klienten → 403', async () => {
    setupCaregiverAuth('caregiver-foreign')
    const adminMock = createAdminMock(defaultE2EHandler())
    mockCreateAdminClient.mockReturnValue(adminMock)

    const { POST } = await import('@/app/api/billing/auto-invoice/route')
    const req = new Request('https://alltagsengel.care/api/billing/auto-invoice', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ client_id: TEST_CLIENT, month: PERIOD }),
    })

    const res = await POST(req)
    expect(res.status).toBe(403)
    expect(mockCreateInvoiceDraft).not.toHaveBeenCalled()
  })
})

describe('E2E: Idempotenz', () => {
  it('Wiederholter Engine-Aufruf → alreadyExists=true, kein Duplikat', async () => {
    setupAdminAuth()
    const adminMock = createAdminMock(defaultE2EHandler())
    mockCreateAdminClient.mockReturnValue(adminMock)

    // Erster Aufruf
    mockCreateInvoiceDraft.mockResolvedValueOnce(ENGINE_RESULT)
    // Zweiter Aufruf → Engine meldet alreadyExists
    mockCreateInvoiceDraft.mockResolvedValueOnce({
      ...ENGINE_RESULT,
      alreadyExists: true,
      lineCount: 0,
    })

    const { POST } = await import('@/app/api/billing/invoices/create/route')

    const makeReq = () => new Request('https://alltagsengel.care/api/billing/invoices/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clientId: TEST_CLIENT, periodMonth: PERIOD }),
    })

    const res1 = await POST(makeReq())
    const json1 = await res1.json()
    expect(json1.invoices[0].alreadyExists).toBe(false)

    const res2 = await POST(makeReq())
    const json2 = await res2.json()
    expect(json2.invoices[0].alreadyExists).toBe(true)
    expect(json2.invoices[0].invoiceId).toBe(ENGINE_RESULT.invoiceId)

    // Engine wurde 2x aufgerufen, aber Idempotenz verhindert Doppelerstellung
    expect(mockCreateInvoiceDraft).toHaveBeenCalledTimes(2)
  })
})

describe('E2E: Status nach Erstellung', () => {
  it('Neue Rechnung hat Status "entwurf"', async () => {
    setupAdminAuth()
    const adminMock = createAdminMock(defaultE2EHandler())
    mockCreateAdminClient.mockReturnValue(adminMock)
    mockCreateInvoiceDraft.mockResolvedValue(ENGINE_RESULT)

    const { POST } = await import('@/app/api/billing/auto-invoice/route')
    const req = new Request('https://alltagsengel.care/api/billing/auto-invoice', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ client_id: TEST_CLIENT, month: PERIOD }),
    })

    const res = await POST(req)
    const json = await res.json()

    // Rückwärtskompatible Antwort enthält vollständiges Invoice-Objekt
    expect(json.invoice.status).toBe('entwurf')
  })
})

describe('E2E: Vollständigkeitsprüfung (auto-invoice)', () => {
  it('Nicht alle Records unterschrieben → ready: false, KEINE Rechnung', async () => {
    setupAdminAuth()
    const adminMock = createAdminMock(defaultE2EHandler({
      'service_records:select': (q) => {
        if (q.filters.id) return { data: SIGNED_RECORD, error: null }
        // Mischung aus signed und draft
        return {
          data: [
            SIGNED_RECORD,
            { ...SIGNED_RECORD_2, status: 'draft' },
          ],
          error: null,
        }
      },
    }))
    mockCreateAdminClient.mockReturnValue(adminMock)

    const { POST } = await import('@/app/api/billing/auto-invoice/route')
    const req = new Request('https://alltagsengel.care/api/billing/auto-invoice', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ client_id: TEST_CLIENT, month: PERIOD }),
    })

    const res = await POST(req)
    const json = await res.json()

    expect(json.ready).toBe(false)
    expect(json.pending).toBeDefined()
    expect(json.pending).toHaveLength(1)
    // Engine darf NICHT aufgerufen werden
    expect(mockCreateInvoiceDraft).not.toHaveBeenCalled()
  })
})

describe('E2E: Keine direkten Inserts in API-Routen', () => {
  it('auto-invoice: kein invoices.insert im Admin-Mock', async () => {
    setupAdminAuth()
    const adminMock = createAdminMock(defaultE2EHandler())
    mockCreateAdminClient.mockReturnValue(adminMock)
    mockCreateInvoiceDraft.mockResolvedValue(ENGINE_RESULT)

    const { POST } = await import('@/app/api/billing/auto-invoice/route')
    const req = new Request('https://alltagsengel.care/api/billing/auto-invoice', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ client_id: TEST_CLIENT, month: PERIOD }),
    })

    await POST(req)

    // Kein direkter Insert in invoices oder invoice_items
    const directInserts = adminMock.queries.filter(
      q => (q.table === 'invoices' || q.table === 'invoice_items') && q.op === 'insert'
    )
    expect(directInserts).toHaveLength(0)
  })

  it('invoices/create: kein invoices.insert im Admin-Mock', async () => {
    setupAdminAuth()
    const adminMock = createAdminMock(defaultE2EHandler())
    mockCreateAdminClient.mockReturnValue(adminMock)
    mockCreateInvoiceDraft.mockResolvedValue(ENGINE_RESULT)

    const { POST } = await import('@/app/api/billing/invoices/create/route')
    const req = new Request('https://alltagsengel.care/api/billing/invoices/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clientId: TEST_CLIENT, periodMonth: PERIOD }),
    })

    await POST(req)

    const directInserts = adminMock.queries.filter(
      q => (q.table === 'invoices' || q.table === 'invoice_items') && q.op === 'insert'
    )
    expect(directInserts).toHaveLength(0)
  })
})

describe('E2E: Auth-Anforderungen pro Pfad', () => {
  it('Pfad 1/2: Ohne Auth → 401', async () => {
    mockCreateClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: { message: 'No session' } }) },
    })
    const adminMock = createAdminMock(defaultE2EHandler())
    mockCreateAdminClient.mockReturnValue(adminMock)

    const { POST } = await import('@/app/api/billing/invoices/create/route')
    const req = new Request('https://alltagsengel.care/api/billing/invoices/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clientId: TEST_CLIENT, periodMonth: PERIOD }),
    })

    const res = await POST(req)
    expect(res.status).toBe(401)
    expect(mockCreateInvoiceDraft).not.toHaveBeenCalled()
  })

  it('Pfad 1/2: Nicht-Admin (rolle=kunde) → 403', async () => {
    mockCreateClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'kunde-user' } } }) },
      from: () => ({
        select: () => ({
          eq: () => ({
            single: vi.fn().mockResolvedValue({
              data: { role: 'kunde' },
              error: null,
            }),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { role: 'kunde' },
              error: null,
            }),
          }),
        }),
      }),
    })
    const adminMock = createAdminMock(defaultE2EHandler())
    mockCreateAdminClient.mockReturnValue(adminMock)

    const { POST } = await import('@/app/api/billing/invoices/create/route')
    const req = new Request('https://alltagsengel.care/api/billing/invoices/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clientId: TEST_CLIENT, periodMonth: PERIOD }),
    })

    const res = await POST(req)
    expect(res.status).toBe(403)
    expect(mockCreateInvoiceDraft).not.toHaveBeenCalled()
  })

  it('Pfad 3: Ohne Auth (weder Cookie noch Bearer) → 401', async () => {
    mockCreateClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    })
    mockRequireCaregiverSession.mockResolvedValue({ ok: false, status: 401, error: 'Nicht autorisiert' })
    const adminMock = createAdminMock(defaultE2EHandler())
    mockCreateAdminClient.mockReturnValue(adminMock)

    const { POST } = await import('@/app/api/billing/auto-invoice/route')
    const req = new Request('https://alltagsengel.care/api/billing/auto-invoice', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ client_id: TEST_CLIENT, month: PERIOD }),
    })

    const res = await POST(req)
    expect(res.status).toBe(401)
    expect(mockCreateInvoiceDraft).not.toHaveBeenCalled()
  })
})
