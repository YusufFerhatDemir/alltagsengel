/**
 * /api/billing/auto-invoice — ein Storno blockierte den ganzen Monat
 * ═══════════════════════════════════════════════════════════════════
 *
 * BEFUND (28.08.2026)
 * 'STORNIERT' hat kein Gegenstück im status-Werteset; ein Widerruf bleibt
 * deshalb auf dem Stand stehen, den er vor der Stornierung hatte. Die
 * Route las ausschließlich `status` und hatte damit zwei Fehler:
 *
 *   1) Ein auf 'complete' storniertes Blatt zählte in `pending` — die
 *      Route antwortete dauerhaft "n Einsätze noch nicht unterschrieben"
 *      und der Monat war nie abrechenbar. Nachträglich unterschreiben
 *      geht nicht: der Nachweis ist widerrufen.
 *   2) Ein auf 'signed' storniertes Blatt wanderte in signedIds und wurde
 *      im Zweig "alle bereits zugeordnet" auf status='invoiced' gestempelt.
 *      Die Oberfläche führte den Widerruf danach als abgerechnet.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const CLIENT = 'client-1'
const ORG = 'org-test'

const { mockRequireCaregiverSession, mockCreateClient, mockCreateAdminClient, mockCreateInvoiceDraft } = vi.hoisted(() => ({
  mockRequireCaregiverSession: vi.fn(),
  mockCreateClient: vi.fn(),
  mockCreateAdminClient: vi.fn(),
  mockCreateInvoiceDraft: vi.fn(),
}))

vi.mock('@/lib/native-auth', () => ({ requireCaregiverSession: mockRequireCaregiverSession }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mockCreateClient }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mockCreateAdminClient }))
vi.mock('@/lib/organizations/server', () => ({
  getActiveOrgId: async () => ORG,
  getActiveOrgIdOrDefault: async () => ORG,
  resolveUserOrgId: async () => ORG,
}))
vi.mock('@/lib/billing/core', () => ({
  createInvoiceDraft: (...args: unknown[]) => mockCreateInvoiceDraft(...args),
}))

type Zustand = { table: string; op: string; values?: any; filters: Record<string, any> }

function adminMitBestand(records: any[], billedItems: any[] = []) {
  const queries: Zustand[] = []
  const client: any = {
    queries,
    from(table: string) {
      const z: Zustand = { table, op: 'select', filters: {} }
      queries.push(z)
      const b: any = {
        select() { return b },
        insert(v: any) { z.op = 'insert'; z.values = v; return b },
        update(v: any) { z.op = 'update'; z.values = v; return b },
        eq(c: string, v: any) { z.filters[c] = v; return b },
        gte(c: string, v: any) { z.filters[`gte:${c}`] = v; return b },
        lte(c: string, v: any) { z.filters[`lte:${c}`] = v; return b },
        in(c: string, v: any) { z.filters[`in:${c}`] = v; return b },
        limit() { return b },
        single() { return Promise.resolve(antwort(z)) },
        maybeSingle() { return Promise.resolve(antwort(z)) },
        then(ok: any, fail: any) { return Promise.resolve(antwort(z)).then(ok, fail) },
      }
      return b
    },
  }
  function antwort(z: Zustand) {
    const key = `${z.table}:${z.op}`
    if (key === 'clients:select') {
      return { data: { id: CLIENT, organization_id: ORG, insurance_name: 'AOK', insurance_number: 'V1', pflegekasse_name: null, versichertennummer: null }, error: null }
    }
    if (key === 'service_records:select') return { data: records, error: null }
    if (key === 'invoice_items:select') return { data: billedItems, error: null }
    if (key === 'invoices:select') return { data: { id: 'inv-1' }, error: null }
    return { data: null, error: null }
  }
  return client
}

function alsAdmin() {
  mockCreateClient.mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'admin-user' } } }) },
    from: () => ({
      select: () => ({ eq: () => ({ single: vi.fn().mockResolvedValue({ data: { role: 'admin' }, error: null }) }) }),
    }),
  })
  mockRequireCaregiverSession.mockResolvedValue({ ok: false, status: 401, error: 'Nicht autorisiert' })
}

async function ruf(body: unknown) {
  const { POST } = await import('@/app/api/billing/auto-invoice/route')
  return POST(new Request('https://alltagsengel.care/api/billing/auto-invoice', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  }))
}

const UNTERSCHRIEBEN = {
  id: 'rec-ok', date: '2026-07-10', service_type: 'Betreuung', duration_minutes: 60,
  amount: 40, budget_type: 'entlastung', status: 'signed',
  proof_status: 'UNTERSCHRIEBEN', billing_status: 'OFFEN',
}
/** Der Widerruf: auf 'complete' stehengeblieben, weil Storno kein status kennt. */
const STORNIERT_COMPLETE = {
  id: 'rec-storno', date: '2026-07-12', service_type: 'Betreuung', duration_minutes: 60,
  amount: 40, budget_type: 'entlastung', status: 'complete',
  proof_status: 'STORNIERT', billing_status: 'STORNIERT',
}
const STORNIERT_SIGNED = { ...STORNIERT_COMPLETE, id: 'rec-storno-2', status: 'signed' }

beforeEach(() => {
  vi.clearAllMocks()
  mockCreateInvoiceDraft.mockResolvedValue({ invoiceId: 'inv-1', invoiceNumber: 'RE-1', totalAmountCents: 4000 })
})

describe('auto-invoice — Storno blockiert den Monat nicht mehr', () => {
  it('ein storniertes Blatt neben einem unterschriebenen: die Rechnung entsteht', async () => {
    mockCreateAdminClient.mockReturnValue(adminMitBestand([UNTERSCHRIEBEN, STORNIERT_COMPLETE]))
    alsAdmin()

    const res = await ruf({ client_id: CLIENT, month: '2026-07' })
    const json = await res.json()

    expect(res.status).toBe(201)
    expect(json.created).toBe(true)
    expect(mockCreateInvoiceDraft).toHaveBeenCalledTimes(1)
  })

  it('GEGENPROBE: nach der alten Regel galt dasselbe Blatt als "noch nicht unterschrieben"', () => {
    const alteRegel = [UNTERSCHRIEBEN, STORNIERT_COMPLETE]
      .filter(r => !['signed', 'invoiced'].includes(r.status))
    expect(alteRegel).toHaveLength(1)
    expect(alteRegel[0].id).toBe('rec-storno')
  })

  it('nur ein Storno im Monat: klare Antwort statt "noch nicht unterschrieben"', async () => {
    mockCreateAdminClient.mockReturnValue(adminMitBestand([STORNIERT_COMPLETE]))
    alsAdmin()

    const res = await ruf({ client_id: CLIENT, month: '2026-07' })
    const json = await res.json()

    expect(json.ready).toBe(false)
    expect(json.reason).toContain('storniert')
    expect(mockCreateInvoiceDraft).not.toHaveBeenCalled()
  })

  it('ein storniertes, bereits zugeordnetes Blatt wird NICHT auf invoiced gestempelt', async () => {
    // Alle nicht-stornierten Nachweise hängen schon an einer Rechnung —
    // genau der Zweig, der bisher .update({status:'invoiced'}) auf signedIds
    // ausführte, in denen das Storno mit drin war.
    const admin = adminMitBestand(
      [UNTERSCHRIEBEN, STORNIERT_SIGNED],
      [{ service_record_id: UNTERSCHRIEBEN.id }],
    )
    mockCreateAdminClient.mockReturnValue(admin)
    alsAdmin()

    await ruf({ client_id: CLIENT, month: '2026-07' })

    const updates = admin.queries.filter((q: Zustand) => q.table === 'service_records' && q.op === 'update')
    for (const u of updates) {
      expect(u.filters['in:id']).not.toContain(STORNIERT_SIGNED.id)
    }
  })
})
