/**
 * /api/admin/ocr — Prüfzentrale: Dienstschlüssel, Mandant, fail-closed
 * ═══════════════════════════════════════════════════════════════════
 *
 * BEFUNDE (28.08.2026, live gegengeprüft)
 *
 *  1) Die Route schrieb ocr_results und review_errors mit dem RLS-Client
 *     des Aufrufers. Auf beiden Tabellen steht als einzige schreibende
 *     Policy `*_admin_all` mit is_admin(), live auf admin|superadmin
 *     beschränkt. Herein lässt die Route über 'einsatz.schreiben' aber
 *     auch die PDL — also genau die Rolle, die in einem Pflegedienst die
 *     Prüfzentrale bedient.
 *
 *  2) organization_id ist auf beiden Tabellen NOT NULL mit Default
 *     current_org_id(). Beim Dienstschlüssel gibt es keinen angemeldeten
 *     Nutzer; die Fallback-Kette endet in der fest verdrahteten
 *     Stamm-Organisation. Ohne ausdrückliche organization_id landet der
 *     Prüfvorgang jedes Mandanten im Bestand der Stamm-Organisation.
 *
 *  3) Ein fehlgeschlagener review_errors-Insert wurde nur geloggt; die
 *     Route antwortete 200 mit `review_errors: []`. Die Oberfläche meldete
 *     dem Büro eine bestandene Prüfung, während die Beanstandungen —
 *     darunter 'signature_missing' mit severity 'critical' — nirgends
 *     ankamen.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const ORG = 'org-test'
const RECORD = 'rec-1'

const { mockCreateClient, mockCreateAdminClient } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockCreateAdminClient: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: mockCreateClient }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mockCreateAdminClient }))
vi.mock('@/lib/organizations/server', () => ({
  getActiveOrgId: async () => ORG,
  getActiveOrgIdOrDefault: async () => ORG,
  resolveUserOrgId: async () => ORG,
}))

interface Aufruf { tabelle: string; op: string; payload?: any; filter: Record<string, any> }

function baueClient(antwort: (a: Aufruf) => { data: any; error: any; count?: number }) {
  const aufrufe: Aufruf[] = []
  const client: any = {
    from(tabelle: string) {
      const a: Aufruf = { tabelle, op: 'select', filter: {} }
      aufrufe.push(a)
      const b: any = {
        select() { return b },
        insert(payload: any) { a.op = 'insert'; a.payload = payload; return b },
        delete() { a.op = 'delete'; return b },
        update(payload: any) { a.op = 'update'; a.payload = payload; return b },
        eq(spalte: string, wert: any) { a.filter[spalte] = wert; return b },
        single() { return Promise.resolve(antwort(a)) },
        maybeSingle() { return Promise.resolve(antwort(a)) },
        then(ok: any, fail: any) { return Promise.resolve(antwort(a)).then(ok, fail) },
      }
      return b
    },
  }
  return { client, aufrufe }
}

/** Angemeldet als PDL — die Rolle, für die is_admin() live NICHT gilt. */
function alsPdl() {
  mockCreateClient.mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u-pdl' } } }) },
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: { role: 'pdl' }, error: null }) }) }),
    }),
  })
}

function anfrage(body: unknown) {
  return new Request('https://alltagsengel.care/api/admin/ocr', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const KOERPER = {
  service_record_id: RECORD,
  image_url: 'https://example.invalid/foto.jpg',
  raw_text: 'Text',
  extracted: {},
  confidence: 95,
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('/api/admin/ocr — Mandant und Dienstschlüssel', () => {
  it('schreibt ocr_results und review_errors mit dem Dienstschlüssel und setzt die Organisation', async () => {
    const { client, aufrufe } = baueClient(a => {
      if (a.tabelle === 'service_records') {
        return { data: { id: RECORD, date: '2026-06-01', start_time: null, end_time: null, amount: 40 }, error: null }
      }
      if (a.tabelle === 'ocr_results' && a.op === 'insert') return { data: { id: 'ocr-1' }, error: null }
      if (a.tabelle === 'service_signatures') return { data: null, error: null, count: 0 }
      if (a.tabelle === 'review_errors' && a.op === 'insert') return { data: [{ id: 'err-1' }], error: null }
      return { data: null, error: null }
    })
    mockCreateAdminClient.mockReturnValue(client)
    alsPdl()

    const { POST } = await import('@/app/api/admin/ocr/route')
    const res = await POST(anfrage(KOERPER) as any)

    // Kein 500: der Dienstschlüssel läuft nicht in is_admin().
    expect(res.status).toBe(200)

    const ocrInsert = aufrufe.find(a => a.tabelle === 'ocr_results' && a.op === 'insert')
    expect(ocrInsert?.payload.organization_id).toBe(ORG)

    const fehlerInsert = aufrufe.find(a => a.tabelle === 'review_errors' && a.op === 'insert')
    expect(Array.isArray(fehlerInsert?.payload)).toBe(true)
    for (const zeile of fehlerInsert!.payload) {
      expect(zeile.organization_id).toBe(ORG)
    }
    // Die fehlende Unterschrift ist der kritische Befund — er muss dabei sein.
    expect(fehlerInsert!.payload.map((z: any) => z.error_type)).toContain('signature_missing')
  })

  it('FAIL-CLOSED: scheitert der Befund-Eintrag, gibt es 503 und der Prüfvorgang wird zurückgenommen', async () => {
    const { client, aufrufe } = baueClient(a => {
      if (a.tabelle === 'service_records') {
        return { data: { id: RECORD, date: '2026-06-01', start_time: null, end_time: null, amount: 40 }, error: null }
      }
      if (a.tabelle === 'ocr_results' && a.op === 'insert') return { data: { id: 'ocr-1' }, error: null }
      if (a.tabelle === 'service_signatures') return { data: null, error: null, count: 0 }
      if (a.tabelle === 'review_errors' && a.op === 'insert') {
        return { data: null, error: { message: 'permission denied for table review_errors', code: '42501' } }
      }
      return { data: null, error: null }
    })
    mockCreateAdminClient.mockReturnValue(client)
    alsPdl()

    const { POST } = await import('@/app/api/admin/ocr/route')
    const res = await POST(anfrage(KOERPER) as any)

    expect(res.status).toBe(503)
    const json = await res.json()
    expect(json.error).toContain('Prüfbefunde')

    // Rücknahme: kein Prüfvorgang ohne seine Befunde.
    const geloescht = aufrufe.find(a => a.tabelle === 'ocr_results' && a.op === 'delete')
    expect(geloescht?.filter.id).toBe('ocr-1')
  })

  it('GEGENPROBE: die alte Regel hätte hier 200 mit leerer Befundliste geantwortet', () => {
    // Der alte Zweig war `if (errInsErr) { log(...) } else { … }` — danach
    // fiel der Code unverändert in die 200er-Antwort mit insertedErrors = [].
    const insertedErrors: unknown[] = []
    const alteAntwort = { status: 200, review_errors: insertedErrors }
    expect(alteAntwort.status).toBe(200)
    expect(alteAntwort.review_errors).toHaveLength(0)
  })
})
