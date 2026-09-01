/**
 * Dienstschluessel-Abfragen: der verworfene Fehler an Entscheidungsstellen
 * ═══════════════════════════════════════════════════════════════════════
 *
 * BEFUND 01.09.2026 (Dienstschluessel-Pass, scripts/audit-admin-from.ts)
 *
 * lint-leerzustand.ts nennt im Kopfkommentar einen offenen Rest: „~120
 * findet ein weiter gefasster Scan zusaetzlich: Abfragen ueber den
 * Dienstschluessel (`await admin.from(...)`)". Diese Datei sichert die
 * drei folgenschwersten Stellen aus diesem Rest ab.
 *
 * Alle drei haben dieselbe Form und dieselbe Wirkung: eine Abfrage
 * beantwortet die Frage „was ist hier schon passiert?", ihr Fehler wird
 * verworfen, das leere Ergebnis heisst dann „noch nichts" — und der
 * Aufrufer tut die Sache ein zweites Mal.
 *
 *   1. auto-invoice: `invoice_items` sagt, welche Nachweise schon an
 *      einer Rechnung haengen. Leer = alles offen = Rechnung doppelt.
 *   2. /api/drip: `bookings` ist die Sperrliste des Werbeversands.
 *      Leer = niemand hat gebucht = Bestandskunden bekommen „Sie haben
 *      noch nie gebucht".
 *   3. /api/cron/review-request: `angel_reviews` ist die Sperrliste der
 *      Bewertungsanfrage. Leer = niemand hat bewertet = zweite Anfrage.
 *
 * WARUM DIE GEGENPROBE MITGEPRUEFT WIRD
 * Ein gruener Lauf beweist hier wenig, wenn er auch ohne den Riegel gruen
 * waere. Jeder Fall hat deshalb einen Zwilling, der denselben Weg mit
 * INTAKTER Abfrage geht und belegt, dass der Test ueberhaupt bis zur
 * Entscheidung vordringt — der Unterschied zwischen beiden ist genau der
 * Fehlerfall.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const CLIENT = 'client-1'
const ORG = 'org-test'
const FEHLER = { message: 'connection reset by peer', code: '08006' }

const {
  mockRequireCaregiverSession, mockCreateClient, mockCreateAdminClient, mockCreateInvoiceDraft,
  mockSendRawEmail, mockCronGeheimnis,
} = vi.hoisted(() => ({
  mockRequireCaregiverSession: vi.fn(),
  mockCreateClient: vi.fn(),
  mockCreateAdminClient: vi.fn(),
  mockCreateInvoiceDraft: vi.fn(),
  mockSendRawEmail: vi.fn(),
  mockCronGeheimnis: vi.fn(),
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
vi.mock('@/lib/notifications', () => ({ sendRawEmail: (...a: unknown[]) => mockSendRawEmail(...a) }))
vi.mock('@/lib/api/cron-auth', () => ({ pruefeCronGeheimnis: () => mockCronGeheimnis() }))

// ── Doppelgaenger ────────────────────────────────────────────────────
type Zustand = { table: string; op: string; values?: any; filters: Record<string, any> }

/**
 * @param antworten je `tabelle:operation` die Antwort. Fehlt ein Eintrag,
 *   kommt `{ data: null, error: null }`.
 */
function adminMit(antworten: Record<string, { data?: unknown; error?: unknown }>) {
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
        is(c: string, v: any) { z.filters[`is:${c}`] = v; return b },
        neq(c: string, v: any) { z.filters[`neq:${c}`] = v; return b },
        order() { return b },
        limit() { return b },
        single() { return Promise.resolve(antwort(z)) },
        maybeSingle() { return Promise.resolve(antwort(z)) },
        then(ok: any, fail: any) { return Promise.resolve(antwort(z)).then(ok, fail) },
      }
      return b
    },
  }
  function antwort(z: Zustand) {
    const treffer = antworten[`${z.table}:${z.op}`]
    return { data: treffer?.data ?? null, error: treffer?.error ?? null }
  }
  return client
}

function alsAdmin() {
  mockCreateClient.mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'admin-user' } } }) },
    from: () => ({
      select: () => ({ eq: () => ({
        single: vi.fn().mockResolvedValue({ data: { role: 'admin' }, error: null }),
        maybeSingle: vi.fn().mockResolvedValue({ data: { role: 'admin' }, error: null }),
      }) }),
    }),
  })
  mockRequireCaregiverSession.mockResolvedValue({ ok: false, status: 401, error: 'Nicht autorisiert' })
}

const KLIENT_ZEILE = {
  id: CLIENT, organization_id: ORG, insurance_name: 'AOK',
  insurance_number: 'V1', pflegekasse_name: null, versichertennummer: null,
}
const UNTERSCHRIEBEN = {
  id: 'rec-1', date: '2026-07-10', service_type: 'Betreuung', duration_minutes: 60,
  amount: 40, budget_type: 'entlastung', status: 'signed',
  proof_status: 'UNTERSCHRIEBEN', billing_status: 'OFFEN',
  signature_hash: 'h', client_signed_at: '2026-07-10T10:00:00Z', client_signature: 'sig',
}

beforeEach(() => {
  vi.clearAllMocks()
  // /api/drip und /api/cron/review-request bauen ihren
  // Dienstschluessel-Client auf MODULEBENE (`const supabaseAdmin =
  // createAdminClient()`). Ohne das Zuruecksetzen behaelt der zweite
  // Test den Doppelgaenger des ersten, und die Gegenproben liefen gegen
  // die Fehlerantwort des Fehlerfalls — sie waren rot, obwohl der Code
  // stimmt. Das Zuruecksetzen erzwingt eine frische Auswertung des
  // Moduls je Fall.
  vi.resetModules()
  mockCreateInvoiceDraft.mockResolvedValue({
    invoiceId: 'inv-1', invoiceNumber: 'RE-1', totalAmountCents: 4000,
  })
  mockSendRawEmail.mockResolvedValue({ ok: true, id: 'msg-1' })
  mockCronGeheimnis.mockReturnValue(null)
  process.env.RESEND_API_KEY = 'test-key'
})

// ═══════════════════════════════════════════════════════════════════════
// 1. Die Doppelabrechnungs-Sperre
// ═══════════════════════════════════════════════════════════════════════
describe('auto-invoice: unlesbare invoice_items rechnen NICHT ein zweites Mal ab', () => {
  async function ruf() {
    const { POST } = await import('@/app/api/billing/auto-invoice/route')
    return POST(new Request('https://alltagsengel.care/api/billing/auto-invoice', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ client_id: CLIENT, month: '2026-07' }),
    }))
  }

  it('faellt die Abfrage aus, entsteht KEINE Rechnung', async () => {
    const admin = adminMit({
      'clients:select': { data: KLIENT_ZEILE },
      'service_records:select': { data: [UNTERSCHRIEBEN] },
      'invoice_items:select': { error: FEHLER },
    })
    mockCreateAdminClient.mockReturnValue(admin)
    alsAdmin()

    const res = await ruf()

    expect(res.status).toBeGreaterThanOrEqual(500)
    // Der eigentliche Beweis: die Rechnungserstellung wurde nie
    // angestossen. Ein 500 allein koennte auch nach dem Schreiben kommen.
    expect(mockCreateInvoiceDraft).not.toHaveBeenCalled()
    // Und der Nachweis wurde auch nicht auf 'invoiced' gestempelt.
    const stempel = admin.queries.find(
      (q: Zustand) => q.table === 'service_records' && q.op === 'update',
    )
    expect(stempel).toBeUndefined()
  })

  it('GEGENPROBE — mit lesbarer Abfrage laeuft derselbe Weg bis zur Rechnung durch', async () => {
    mockCreateAdminClient.mockReturnValue(adminMit({
      'clients:select': { data: KLIENT_ZEILE },
      'service_records:select': { data: [UNTERSCHRIEBEN] },
      'invoice_items:select': { data: [] },
      'invoices:select': { data: { id: 'inv-1' } },
    }))
    alsAdmin()

    const res = await ruf()

    expect(res.status).toBeLessThan(400)
    expect(mockCreateInvoiceDraft).toHaveBeenCalledTimes(1)
  })

  it('ein bereits abgerechneter Nachweis fuehrt weiterhin zu KEINER zweiten Rechnung', async () => {
    // Der Normalfall, den die Sperre abdeckt — er muss unveraendert gelten.
    mockCreateAdminClient.mockReturnValue(adminMit({
      'clients:select': { data: KLIENT_ZEILE },
      'service_records:select': { data: [UNTERSCHRIEBEN] },
      'invoice_items:select': { data: [{ service_record_id: 'rec-1' }] },
    }))
    alsAdmin()

    const res = await ruf()

    expect(res.status).toBeLessThan(400)
    expect(mockCreateInvoiceDraft).not.toHaveBeenCalled()
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 2. Die Sperrliste des Werbeversands
// ═══════════════════════════════════════════════════════════════════════
describe('/api/drip: ohne Sperrliste geht KEINE Werbung hinaus', () => {
  const KUNDE_MIT_BUCHUNG = {
    id: 'kunde-1', email: 'a@example.org', first_name: 'Anna',
    referral_code: 'ANGEL', created_at: new Date(Date.now() - 3 * 86_400_000).toISOString(),
  }

  async function ruf() {
    const { POST } = await import('@/app/api/drip/route')
    return POST(new Request('https://alltagsengel.care/api/drip', { method: 'POST' }))
  }

  it('sind die Buchungen unlesbar, bricht der Lauf ab — keine einzige Mail', async () => {
    mockCreateAdminClient.mockReturnValue(adminMit({
      'profiles:select': { data: [KUNDE_MIT_BUCHUNG] },
      'bookings:select': { error: FEHLER },
    }))

    const res = await ruf()

    expect(res.status).toBe(500)
    expect(mockSendRawEmail).not.toHaveBeenCalled()
  })

  it('GEGENPROBE — mit lesbarer Sperrliste sendet derselbe Lauf an den Nichtbucher', async () => {
    mockCreateAdminClient.mockReturnValue(adminMit({
      'profiles:select': { data: [KUNDE_MIT_BUCHUNG] },
      'bookings:select': { data: [] },
    }))

    const res = await ruf()

    expect(res.status).toBe(200)
    expect(mockSendRawEmail).toHaveBeenCalledTimes(1)
  })

  it('wer gebucht hat, bekommt weiterhin nichts — die Sperrliste wirkt', async () => {
    mockCreateAdminClient.mockReturnValue(adminMit({
      'profiles:select': { data: [KUNDE_MIT_BUCHUNG] },
      'bookings:select': { data: [{ customer_id: 'kunde-1' }] },
    }))

    const res = await ruf()

    expect(res.status).toBe(200)
    expect(mockSendRawEmail).not.toHaveBeenCalled()
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 3. Die Sperrliste der Bewertungsanfrage
// ═══════════════════════════════════════════════════════════════════════
describe('/api/cron/review-request: ohne Sperrliste wird niemand zweimal gefragt', () => {
  const stichtag = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10)
  const BUCHUNG = {
    id: 'buchung-1', customer_id: 'kunde-1', angel_id: 'engel-1',
    service: 'Betreuung', date: stichtag,
  }

  async function ruf() {
    const { GET } = await import('@/app/api/cron/review-request/route')
    return GET(new Request('https://alltagsengel.care/api/cron/review-request'))
  }

  it('sind die vorhandenen Bewertungen unlesbar, bricht der Lauf ab', async () => {
    mockCreateAdminClient.mockReturnValue(adminMit({
      'bookings:select': { data: [BUCHUNG] },
      'angel_reviews:select': { error: FEHLER },
    }))

    const res = await ruf()

    expect(res.status).toBe(500)
    expect(mockSendRawEmail).not.toHaveBeenCalled()
  })

  it('GEGENPROBE — mit lesbarer Sperrliste geht die Anfrage an den Kunden', async () => {
    mockCreateAdminClient.mockReturnValue(adminMit({
      'bookings:select': { data: [BUCHUNG] },
      'angel_reviews:select': { data: [] },
      'profiles:select': { data: { email: 'a@example.org', first_name: 'Anna' } },
    }))

    const res = await ruf()

    expect(res.status).toBe(200)
    expect(mockSendRawEmail).toHaveBeenCalledTimes(1)
  })

  it('wer schon bewertet hat, wird weiterhin nicht erneut gefragt', async () => {
    mockCreateAdminClient.mockReturnValue(adminMit({
      'bookings:select': { data: [BUCHUNG] },
      'angel_reviews:select': { data: [{ booking_id: 'buchung-1' }] },
      'profiles:select': { data: { email: 'a@example.org', first_name: 'Anna' } },
    }))

    const res = await ruf()

    expect(res.status).toBe(200)
    expect(mockSendRawEmail).not.toHaveBeenCalled()
  })
})
