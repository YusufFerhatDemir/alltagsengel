// ═══════════════════════════════════════════════════════════════════════
// Mitgliedschafts-Orakel im PflegeCoach-Freigabeweg
// (POST /api/coach/freigaben)
//
// Die Route sucht zu einer eingegebenen E-Mail die Nutzer-ID
// (coach_finde_nutzer_id) und antwortet unterscheidbar: „kein Konto" (404)
// gegen „bereits freigegeben" (409) gegen Erfolg. Damit lässt sich zu
// jeder Adresse feststellen, ob sie ein PflegeCoach-Konto hat.
//
// Der EXECUTE-Entzug (20260922000000) hält Fremde draußen — nicht aber
// einen angemeldeten Nutzer, der eine Adressliste durchprobiert. Genau das
// stand in 20260916000000_coach_shares_email_funktionen.sql als bekannte,
// offene Einschränkung („ein Rate-Limit dafür existiert noch nicht").
//
// Diese Suite ist die Sperrklinke für den nachgezogenen Deckel.
// ═══════════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest'

const requireCoachUser = vi.fn()
const rateLimitPersistent = vi.fn()
const rpc = vi.fn()

vi.mock('@/lib/coach/api-auth', () => ({
  requireCoachUser: () => requireCoachUser(),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ rpc: (...a: unknown[]) => rpc(...a) }),
}))
vi.mock('@/lib/rate-limit-persistent', () => ({
  rateLimitPersistent: (...a: unknown[]) => rateLimitPersistent(...a),
}))

const { POST } = await import('@/app/api/coach/freigaben/route')

const USER = '00000000-0000-4000-8000-00000000c001'
const COACH_USER = '00000000-0000-4000-8000-00000000c002'
const ANDERER = '00000000-0000-4000-8000-00000000c003'

/** Supabase-Client des angemeldeten Nutzers: Einwilligung ja, keine Freigabe. */
function nutzerClient() {
  return {
    from(tabelle: string) {
      const kette: Record<string, unknown> = {}
      const gib = async () => {
        if (tabelle === 'coach_consents') {
          return { data: [{ consent_typ: 'datenfreigabe', erteilt: true, widerrufen_am: null }], error: null }
        }
        return { data: null, error: null }
      }
      kette.select = () => kette
      kette.eq = () => kette
      kette.insert = () => kette
      kette.update = () => kette
      kette.maybeSingle = gib
      kette.then = (aufloesen: (v: unknown) => unknown) => gib().then(aufloesen)
      return kette
    },
  }
}

function anfrage(email = 'nachbarin@example.de') {
  return new Request('https://alltagsengel.care/api/coach/freigaben', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, empfaenger_rolle: 'angehoerig' }),
  })
}

beforeEach(() => {
  requireCoachUser.mockReset().mockResolvedValue({
    ok: true,
    user: { id: USER },
    coachUser: { id: COACH_USER },
    supabase: nutzerClient(),
  })
  rateLimitPersistent.mockReset().mockResolvedValue(true)
  rpc.mockReset().mockResolvedValue({ data: ANDERER, error: null })
})

describe('POST /api/coach/freigaben — Deckel auf der Adress-Suche', () => {
  it('zählt die Suche pro angemeldetem Nutzer, nicht pro IP', async () => {
    // IP-basiert wäre der Deckel wertlos: geteilt im Praxis-Netz, wechselbar
    // im Mobilfunk.
    await POST(anfrage())

    expect(rateLimitPersistent).toHaveBeenCalledTimes(1)
    const [schluessel, grenze, fenster] = rateLimitPersistent.mock.calls[0]
    expect(schluessel).toBe(`coach-freigabe-lookup:${USER}`)
    expect(grenze).toBe(10)
    expect(fenster).toBe(60 * 60 * 1000)
  })

  it('antwortet 429, sobald der Deckel greift', async () => {
    rateLimitPersistent.mockResolvedValue(false)
    const antwort = await POST(anfrage())
    expect(antwort.status).toBe(429)
  })

  it('führt die Suche dann gar nicht erst aus — sonst wäre der Deckel wirkungslos', async () => {
    rateLimitPersistent.mockResolvedValue(false)
    await POST(anfrage())
    expect(rpc).not.toHaveBeenCalled()
  })

  it('verrät in der 429-Antwort nichts über das gesuchte Konto', async () => {
    rateLimitPersistent.mockResolvedValue(false)
    const inhalt = await (await POST(anfrage())).json()
    // Weder "Konto vorhanden" noch "kein Konto" — nur der Hinweis auf das Limit.
    expect(JSON.stringify(inhalt)).not.toMatch(/Konto|nachbarin/i)
    expect(inhalt.error).toMatch(/Zu viele Suchanfragen/)
  })

  it('greift NACH der Einwilligungsprüfung — ein Nutzer ohne Einwilligung verbraucht kein Kontingent', async () => {
    requireCoachUser.mockResolvedValue({
      ok: true,
      user: { id: USER },
      coachUser: { id: COACH_USER },
      supabase: {
        from: () => {
          const kette: Record<string, unknown> = {}
          const gib = async () => ({ data: [], error: null })
          kette.select = () => kette
          kette.eq = () => kette
          kette.then = (aufloesen: (v: unknown) => unknown) => gib().then(aufloesen)
          return kette
        },
      },
    })

    const antwort = await POST(anfrage())
    expect(antwort.status).toBe(403)
    expect(rateLimitPersistent).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('lässt den regulären Fall unverändert durch', async () => {
    const antwort = await POST(anfrage())
    expect(antwort.status).toBe(200)
    expect(rpc).toHaveBeenCalledWith('coach_finde_nutzer_id', { p_email: 'nachbarin@example.de' })
  })
})
