/**
 * POST /api/einsatzplanung — Zeitprüfung vor dem Schreiben
 *
 * `assignments` trägt keinen CHECK auf start_time/end_time. Bis hierher gab
 * es auf diesem Weg ÜBERHAUPT keine Zeitprüfung:
 *
 *   · ein Tippfehler im Format ("9:5", "25:00") schlug erst als roher
 *     Postgres-Fehler durch — HTTP 500 statt einer lesbaren Meldung,
 *   · ein Einsatz "10:00–10:00" ließ sich anlegen. Er belegt keine Zeit, wird
 *     vom Doppelbelegungs-Trigger folgerichtig ignoriert und erzeugt später
 *     einen Leistungsnachweis über null Minuten.
 *
 * Nachteinsätze über Mitternacht bleiben ausdrücklich erlaubt — dieselbe
 * Regel wie im Dienstplan (assertZeitfenster).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockCreateClient, mockCreateAdminClient } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockCreateAdminClient: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: mockCreateClient }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mockCreateAdminClient }))
vi.mock('@/lib/organizations/server', () => ({
  getActiveOrgId: async () => 'org-1',
  getActiveOrgIdOrDefault: async () => 'org-1',
  resolveUserOrgId: async () => 'org-1',
}))

import { POST } from '@/app/api/einsatzplanung/route'

/** Zählt jeden Datenbankzugriff — die Zusage ist: bei ungültiger Zeit keinen. */
function zaehlenderClient(zugriffe: string[]) {
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
    from(tabelle: string) {
      if (tabelle !== 'profiles') zugriffe.push(tabelle)
      const kette: any = {
        select: () => kette, insert: () => kette, update: () => kette,
        eq: () => kette, in: () => kette, or: () => kette, is: () => kette,
        gte: () => kette, lte: () => kette, order: () => kette, limit: () => kette,
        // Track 7 (28.08.2026): die Rollenermittlung laeuft ueber
        // holeRollenQuellenFuer() und liest profiles mit maybeSingle() —
        // beide Endpunkte muessen deshalb dieselbe Rolle liefern, sonst
        // bleibt der Doppelgaenger rollenlos und die Route antwortet 403,
        // bevor die eigentlich geprueften Zeitregeln ueberhaupt greifen.
        single: async () => (tabelle === 'profiles'
          ? { data: { role: 'admin' }, error: null }
          : { data: null, error: null }),
        maybeSingle: async () => (tabelle === 'profiles'
          ? { data: { role: 'admin' }, error: null }
          : { data: null, error: null }),
        then: (auf: any) => Promise.resolve(auf({ data: [], error: null })),
      }
      return kette
    },
  }
}

async function post(body: Record<string, unknown>) {
  const zugriffe: string[] = []
  const client = zaehlenderClient(zugriffe)
  mockCreateClient.mockResolvedValue(client)
  mockCreateAdminClient.mockReturnValue(client)
  const req = new Request('http://test/api/einsatzplanung', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  const res = await POST(req as any)
  return { status: res.status, body: await res.json(), zugriffe }
}

const basis = {
  client_id: '11111111-1111-4111-8111-111111111111',
  caregiver_id: '22222222-2222-4222-8222-222222222222',
  assignment_date: '2026-09-10',
  service_type: 'Alltagsbegleitung',
  start_time: '08:00',
  end_time: '10:00',
}

beforeEach(() => vi.clearAllMocks())

describe('Zeitprüfung im Einsatz-POST', () => {
  it('weist einen Einsatz ohne Dauer ab, ohne die Datenbank anzufassen', async () => {
    const res = await post({ ...basis, start_time: '10:00', end_time: '10:00' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/identisch/)
    expect(res.zugriffe).toEqual([])
  })

  it('weist eine unlesbare Uhrzeit ab, statt sie an Postgres zu reichen', async () => {
    for (const zeit of ['25:00', '9 Uhr', '08:75', '']) {
      const res = await post({ ...basis, end_time: zeit })
      expect(res.status).toBe(400)
      expect(res.zugriffe).toEqual([])
    }
  })

  it('lässt einen Nachteinsatz über Mitternacht durch die Zeitprüfung', async () => {
    // Belegt wird, dass die Zeitprüfung ihn NICHT abweist: der Ablauf kommt
    // bis zur Klienten-Freigabe, die im leeren Testbestand erwartungsgemäß
    // scheitert. Vor der Härtung wäre hier derselbe Punkt erreicht worden —
    // nach ihr darf ein Nachteinsatz nicht vorher hängenbleiben.
    const zugriffe: string[] = []
    const client = zaehlenderClient(zugriffe)
    mockCreateClient.mockResolvedValue(client)
    mockCreateAdminClient.mockReturnValue(client)
    const req = new Request('http://test/api/einsatzplanung', {
      method: 'POST',
      body: JSON.stringify({ ...basis, start_time: '22:00', end_time: '06:00' }),
    })
    await POST(req as any).catch(() => null)
    expect(zugriffe).toContain('clients')
  })
})
