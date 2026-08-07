/**
 * Tests fuer POST /api/billing/invoices/create
 *
 * Testet die 12 geforderten Szenarien:
 * 1.  Unautorisierter Zugriff (kein Token)
 * 2.  Nicht-Admin-Rolle wird abgelehnt
 * 3.  Fehlende clientId
 * 4.  Ungueltiges periodMonth-Format
 * 5.  Klient gehoert nicht zur Organisation
 * 6.  Keine abrechenbaren Leistungen
 * 7.  Erfolgreiche Rechnungserstellung (einzelner Budget-Typ)
 * 8.  Idempotenz (gleicher Aufruf gibt bestehende Rechnung zurueck)
 * 9.  Mehrere Budget-Typen erzeugen mehrere Rechnungen
 * 10. Engine-Fehler werden als strukturierte Fehler zurueckgegeben
 * 11. Audit-Trail wird geschrieben (via createInvoiceDraft)
 * 12. Rechnungsnummer wird von Engine generiert (nicht vom Browser)
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Supabase server client mock
const mockGetUser = vi.fn()
const mockProfileSelect = vi.fn()
const mockClientSelect = vi.fn()
const mockRecordsSelect = vi.fn()

const serverSupabaseChain = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  in: vi.fn().mockReturnThis(),
  gte: vi.fn().mockReturnThis(),
  lte: vi.fn().mockReturnThis(),
  single: vi.fn(),
}

const mockServerFrom = vi.fn((table: string) => {
  if (table === 'profiles') {
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: mockProfileSelect,
        }),
      }),
    }
  }
  return serverSupabaseChain
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: mockServerFrom,
  })),
}))

// Admin client mock
const adminChain = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  in: vi.fn().mockReturnThis(),
  gte: vi.fn().mockReturnThis(),
  lte: vi.fn().mockReturnThis(),
  single: mockClientSelect,
}

const mockAdminFrom = vi.fn(() => adminChain)

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: mockAdminFrom,
  })),
}))

// Engine mock
const mockCreateInvoiceDraft = vi.fn()
vi.mock('@/lib/billing/core', () => ({
  createInvoiceDraft: (...args: unknown[]) => mockCreateInvoiceDraft(...args),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/billing/invoices/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function setupAuth(user = { id: 'user-1' }) {
  mockGetUser.mockResolvedValue({ data: { user }, error: null })
}

function setupProfile(profile = { role: 'admin', organization_id: 'org-1' }) {
  mockProfileSelect.mockResolvedValue({ data: profile, error: null })
}

function setupClient(client = { id: 'client-1', organization_id: 'org-1' }) {
  mockClientSelect.mockResolvedValue({ data: client, error: null })
}

function setupRecords(records: Array<{ budget_type: string }> = [{ budget_type: 'entlastung' }]) {
  // Override adminFrom to handle both 'clients' and 'service_records'
  mockAdminFrom.mockImplementation((table: string) => {
    if (table === 'clients') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 'client-1', organization_id: 'org-1' },
              error: null,
            }),
          }),
        }),
      }
    }
    if (table === 'service_records') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              gte: vi.fn().mockReturnValue({
                lte: vi.fn().mockResolvedValue({
                  data: records,
                  error: null,
                }),
              }),
            }),
          }),
        }),
      }
    }
    return adminChain
  })
}

function setupDraftResult(overrides: Partial<{
  invoiceId: string
  invoiceNumber: string
  totalAmountCents: number
  lineCount: number
  alreadyExists: boolean
}> = {}) {
  mockCreateInvoiceDraft.mockResolvedValue({
    invoiceId: 'inv-1',
    invoiceNumber: 'RE-2026-00001',
    totalAmountCents: 3500,
    lineCount: 2,
    alreadyExists: false,
    ...overrides,
  })
}

// ---------------------------------------------------------------------------
// Import handler (nach Mocks)
// ---------------------------------------------------------------------------

let POST: (request: Request) => Promise<Response>

beforeEach(async () => {
  vi.clearAllMocks()
  const mod = await import('@/app/api/billing/invoices/create/route')
  POST = mod.POST
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/billing/invoices/create', () => {
  // 1. Unautorisierter Zugriff
  it('lehnt unautorisierte Anfragen ab (401)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'No session' } })

    const res = await POST(makeRequest({ clientId: 'c1', periodMonth: '2026-08' }))
    expect(res.status).toBe(401)

    const json = await res.json()
    expect(json.error).toContain('autorisiert')
  })

  // 2. Nicht-Admin wird abgelehnt
  it('lehnt Nicht-Admin-Rollen ab (403)', async () => {
    setupAuth()
    setupProfile({ role: 'caregiver', organization_id: 'org-1' })

    const res = await POST(makeRequest({ clientId: 'c1', periodMonth: '2026-08' }))
    expect(res.status).toBe(403)

    const json = await res.json()
    expect(json.error).toContain('Administratoren')
  })

  // 3. Fehlende clientId
  it('gibt 400 bei fehlender clientId', async () => {
    setupAuth()
    setupProfile()

    const res = await POST(makeRequest({ periodMonth: '2026-08' }))
    expect(res.status).toBe(400)

    const json = await res.json()
    expect(json.error).toContain('clientId')
  })

  // 4. Ungueltiges periodMonth
  it('gibt 400 bei ungueltigem periodMonth-Format', async () => {
    setupAuth()
    setupProfile()

    const res = await POST(makeRequest({ clientId: 'c1', periodMonth: '2026-8' }))
    expect(res.status).toBe(400)

    const json = await res.json()
    expect(json.error).toContain('YYYY-MM')
  })

  // 5. Klient gehoert nicht zur Organisation
  it('lehnt fremde Klienten ab (Org-Fence, 403)', async () => {
    setupAuth()
    setupProfile({ role: 'admin', organization_id: 'org-1' })

    // Client gehoert zu org-2
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === 'clients') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: 'c1', organization_id: 'org-2' },
                error: null,
              }),
            }),
          }),
        }
      }
      return adminChain
    })

    const res = await POST(makeRequest({ clientId: 'c1', periodMonth: '2026-08' }))
    expect(res.status).toBe(403)

    const json = await res.json()
    expect(json.error).toContain('Organisation')
  })

  // 6. Keine abrechenbaren Leistungen
  it('gibt 404 wenn keine abrechenbaren Leistungen vorhanden', async () => {
    setupAuth()
    setupProfile()
    setupRecords([]) // leere Records

    // Override: leere Records aber Client ist OK
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === 'clients') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: 'client-1', organization_id: 'org-1' },
                error: null,
              }),
            }),
          }),
        }
      }
      if (table === 'service_records') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                gte: vi.fn().mockReturnValue({
                  lte: vi.fn().mockResolvedValue({
                    data: [],
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        }
      }
      return adminChain
    })

    const res = await POST(makeRequest({ clientId: 'client-1', periodMonth: '2026-08' }))
    expect(res.status).toBe(404)

    const json = await res.json()
    expect(json.error).toContain('abrechenbar')
  })

  // 7. Erfolgreiche Erstellung
  it('erstellt Rechnung erfolgreich ueber die Engine', async () => {
    setupAuth()
    setupProfile()
    setupRecords([{ budget_type: 'entlastung' }])
    setupDraftResult()

    const res = await POST(makeRequest({ clientId: 'client-1', periodMonth: '2026-08' }))
    expect(res.status).toBe(200)

    const json = await res.json()
    expect(json.count).toBe(1)
    expect(json.invoices).toHaveLength(1)
    expect(json.invoices[0].invoiceNumber).toBe('RE-2026-00001')
    expect(json.invoices[0].budgetType).toBe('entlastung')
  })

  // 8. Idempotenz
  it('gibt bestehende Rechnung bei doppeltem Aufruf zurueck', async () => {
    setupAuth()
    setupProfile()
    setupRecords([{ budget_type: 'entlastung' }])
    setupDraftResult({ alreadyExists: true, invoiceId: 'existing-inv' })

    const res = await POST(makeRequest({ clientId: 'client-1', periodMonth: '2026-08' }))
    expect(res.status).toBe(200)

    const json = await res.json()
    expect(json.invoices[0].alreadyExists).toBe(true)
    expect(json.invoices[0].invoiceId).toBe('existing-inv')
  })

  // 9. Mehrere Budget-Typen
  it('erstellt separate Rechnungen pro Budget-Typ', async () => {
    setupAuth()
    setupProfile()
    setupRecords([
      { budget_type: 'entlastung' },
      { budget_type: 'private' },
    ])

    let callCount = 0
    mockCreateInvoiceDraft.mockImplementation((_sb: unknown, params: { budgetType: string }) => {
      callCount++
      return Promise.resolve({
        invoiceId: `inv-${callCount}`,
        invoiceNumber: `RE-2026-0000${callCount}`,
        totalAmountCents: callCount * 1000,
        lineCount: callCount,
        alreadyExists: false,
      })
    })

    const res = await POST(makeRequest({ clientId: 'client-1', periodMonth: '2026-08' }))
    expect(res.status).toBe(200)

    const json = await res.json()
    expect(json.count).toBe(2)
    expect(json.invoices).toHaveLength(2)
    expect(mockCreateInvoiceDraft).toHaveBeenCalledTimes(2)
  })

  // 10. Engine-Fehler werden strukturiert zurueckgegeben
  it('gibt strukturierte Fehler bei Engine-Fehler zurueck', async () => {
    setupAuth()
    setupProfile()
    setupRecords([{ budget_type: 'entlastung' }])
    mockCreateInvoiceDraft.mockRejectedValue(new Error('Service Records laden fehlgeschlagen: connection refused'))

    const res = await POST(makeRequest({ clientId: 'client-1', periodMonth: '2026-08' }))
    expect(res.status).toBe(400)

    const json = await res.json()
    expect(json.error).toBe('Keine Rechnungen erstellt.')
    expect(json.warnings).toBeDefined()
    expect(json.warnings[0]).toContain('Service Records laden fehlgeschlagen')
  })

  // 11. createInvoiceDraft wird mit actorId aufgerufen
  it('uebergibt die User-ID als actorId an die Engine', async () => {
    setupAuth({ id: 'actor-123' })
    setupProfile()
    setupRecords([{ budget_type: 'entlastung' }])
    setupDraftResult()

    await POST(makeRequest({ clientId: 'client-1', periodMonth: '2026-08' }))

    expect(mockCreateInvoiceDraft).toHaveBeenCalledWith(
      expect.anything(), // admin client
      expect.objectContaining({
        actorId: 'actor-123',
        clientId: 'client-1',
        periodMonth: '2026-08',
        budgetType: 'entlastung',
      })
    )
  })

  // 12. Rechnungsnummer kommt von der Engine
  it('verwendet die von der Engine generierte Rechnungsnummer', async () => {
    setupAuth()
    setupProfile()
    setupRecords([{ budget_type: 'entlastung' }])
    setupDraftResult({ invoiceNumber: 'RE-2026-00042' })

    const res = await POST(makeRequest({ clientId: 'client-1', periodMonth: '2026-08' }))
    const json = await res.json()

    // Nummer kommt von Engine, nicht vom Browser (kein RE-202608-XXXXX Pattern)
    expect(json.invoices[0].invoiceNumber).toBe('RE-2026-00042')
    expect(json.invoices[0].invoiceNumber).not.toMatch(/^RE-\d{6}-[A-Z0-9]+$/)
  })
})
