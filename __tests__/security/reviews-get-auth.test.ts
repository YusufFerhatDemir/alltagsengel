// ═══════════════════════════════════════════════════════════════
// BEWERTUNGS-API — Auth, Mandanten-Fence, Datensparsamkeit
// ═══════════════════════════════════════════════════════════════
// Historie:
//   HIGH-Fix 1 (12.08.): GET /api/reviews hatte keinen Auth-Check und
//     jointe profiles(first_name, last_name, avatar_color) — Klarnamen
//     der Kundschaft waren oeffentlich abrufbar. Fix: 401 + kein
//     Nachname mehr.
//   Vollpruefung (13.08.): Der Auth-Check allein war wirkungslos, weil
//     die RLS beider Bewertungstabellen SELECT USING (true) hatte —
//     dieselben Daten waren mit dem oeffentlichen Anon-Key direkt ueber
//     PostgREST lesbar. Zusaetzlich fehlte jeder Mandanten- und
//     Ownership-Fence, und POST validierte angelId nicht gegen die
//     Buchung.
//
// Diese Suite deckt den API-Kontrakt ab. Der Org-Fence der Leseschicht
// liegt in reviews-org-fence.test.ts, die RLS in der Migration
// 20260901000000_bewertungen_rls_fence.sql.
// ═══════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

// ── Testzustand ────────────────────────────────────────────────
let aktuellerUser: { id: string } | null = null
let letzterSelect = ''
let limitErreicht = false
let buchung: Record<string, any> | null = null
let vorhandeneBewertung: Record<string, any> | null = null
let eingefuegt: Record<string, any> | null = null
let ladeEngelArgs: any[] = []
let ladeBuchungArgs: any[] = []
let buchungsErgebnis: { erlaubt: boolean; bewertung: any } = { erlaubt: true, bewertung: null }
let durchschnittFuer: string | null = null

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: aktuellerUser }, error: null }) },
    from: (tabelle: string) => ({
      select: (spalten: string) => {
        letzterSelect = spalten
        const chain: Record<string, any> = {}
        chain.eq = () => chain
        chain.order = () => chain
        chain.limit = async () => ({ data: [], error: null })
        chain.maybeSingle = async () => ({
          data: tabelle === 'angel_reviews' ? vorhandeneBewertung : null,
          error: null,
        })
        chain.single = async () => ({
          data: tabelle === 'bookings' ? buchung : null,
          error: buchung ? null : { message: 'not found' },
        })
        return chain
      },
      insert: (werte: Record<string, any>) => {
        eingefuegt = werte
        return {
          select: () => ({
            single: async () => ({ data: { id: 'rev-neu', ...werte }, error: null }),
          }),
        }
      },
    }),
  }),
}))

vi.mock('@/lib/organizations/server', () => ({
  getActiveOrgId: async () => 'org-A',
  // Der Endkunden-Leseweg nutzt bewusst den dokumentierten Stamm-Org-Fallback
  // (Audit MITTEL-1): Kundschaft hat keine Zeile in organization_members.
  getActiveOrgIdOrDefault: async () => 'org-A',
}))

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: () => !limitErreicht,
}))

vi.mock('@/lib/reviews', () => ({
  MAX_KOMMENTAR_LAENGE: 2000,
  ladeEngelBewertungen: async (...args: any[]) => {
    ladeEngelArgs = args
    return []
  },
  ladeBuchungsBewertung: async (...args: any[]) => {
    ladeBuchungArgs = args
    return buchungsErgebnis
  },
  aktualisiereEngelDurchschnitt: async (angelId: string) => {
    durchschnittFuer = angelId
  },
  istAdminUser: async () => false,
}))

function getAnfrage(query: string) {
  return new NextRequest(`https://alltagsengel.care/api/reviews?${query}`)
}

function postAnfrage(body: Record<string, any>) {
  return new NextRequest('https://alltagsengel.care/api/reviews', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const GESTERN = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
const MORGEN = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

function gueltigeBuchung(over: Record<string, any> = {}) {
  return {
    id: 'buchung-1',
    customer_id: 'user-1',
    angel_id: 'engel-1',
    status: 'completed',
    date: GESTERN,
    ...over,
  }
}

beforeEach(() => {
  aktuellerUser = null
  letzterSelect = ''
  limitErreicht = false
  buchung = null
  vorhandeneBewertung = null
  eingefuegt = null
  ladeEngelArgs = []
  ladeBuchungArgs = []
  buchungsErgebnis = { erlaubt: true, bewertung: null }
  durchschnittFuer = null
})

// ═══════════════════════════════════════════════════════════════
describe('GET /api/reviews: Auth-Pflicht', () => {
  it('ohne Session → 401, keine Bewertungsdaten', async () => {
    const { GET } = await import('@/app/api/reviews/route')
    const res = await GET(getAnfrage('angelId=engel-1'))
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.reviews).toBeUndefined()
    expect(body.error).toBe('Nicht authentifiziert')
  })

  it('ohne Session auch bei bookingId → 401', async () => {
    const { GET } = await import('@/app/api/reviews/route')
    const res = await GET(getAnfrage('bookingId=buchung-1'))
    expect(res.status).toBe(401)
    expect((await res.json()).review).toBeUndefined()
  })

  it('Auth-Check laeuft VOR jeder DB-Abfrage', async () => {
    const { GET } = await import('@/app/api/reviews/route')
    await GET(getAnfrage('angelId=engel-1'))
    expect(letzterSelect).toBe('')
    expect(ladeEngelArgs).toEqual([])
  })

  it('mit Session → 200', async () => {
    aktuellerUser = { id: 'user-1' }
    const { GET } = await import('@/app/api/reviews/route')
    const res = await GET(getAnfrage('angelId=engel-1'))
    expect(res.status).toBe(200)
    expect((await res.json()).reviews).toEqual([])
  })
})

// ═══════════════════════════════════════════════════════════════
describe('GET /api/reviews: Mandanten-Fence', () => {
  it('angelId-Zweig reicht die aktive Org an die Leseschicht durch', async () => {
    aktuellerUser = { id: 'user-1' }
    const { GET } = await import('@/app/api/reviews/route')
    await GET(getAnfrage('angelId=engel-1'))
    expect(ladeEngelArgs[0]).toBe('engel-1')
    expect(ladeEngelArgs[1]).toBe('org-A')
  })

  it('bookingId-Zweig prueft User UND Org', async () => {
    aktuellerUser = { id: 'user-1' }
    const { GET } = await import('@/app/api/reviews/route')
    await GET(getAnfrage('bookingId=buchung-1'))
    expect(ladeBuchungArgs[0]).toBe('buchung-1')
    expect(ladeBuchungArgs[1]).toBe('user-1')
    expect(ladeBuchungArgs[2]).toBe('org-A')
  })

  it('fremde Buchung → 404 (kein 403, das wuerde Existenz bestaetigen)', async () => {
    aktuellerUser = { id: 'user-1' }
    buchungsErgebnis = { erlaubt: false, bewertung: null }
    const { GET } = await import('@/app/api/reviews/route')
    const res = await GET(getAnfrage('bookingId=fremde-buchung'))
    expect(res.status).toBe(404)
    expect((await res.json()).review).toBeUndefined()
  })

  it('GET liest angel_reviews nicht mehr direkt am Fence vorbei', async () => {
    aktuellerUser = { id: 'user-1' }
    const { GET } = await import('@/app/api/reviews/route')
    await GET(getAnfrage('angelId=engel-1'))
    await GET(getAnfrage('bookingId=buchung-1'))
    expect(letzterSelect).toBe('')
  })
})

// ═══════════════════════════════════════════════════════════════
describe('POST /api/reviews: Buchungsbindung', () => {
  it('ohne Session → 401', async () => {
    const { POST } = await import('@/app/api/reviews/route')
    const res = await POST(postAnfrage({ bookingId: 'b', angelId: 'e', rating: 5 }))
    expect(res.status).toBe(401)
  })

  it('fremde Buchung → 404', async () => {
    aktuellerUser = { id: 'user-1' }
    buchung = gueltigeBuchung({ customer_id: 'user-2' })
    const { POST } = await import('@/app/api/reviews/route')
    const res = await POST(postAnfrage({ bookingId: 'buchung-1', angelId: 'engel-1', rating: 5 }))
    expect(res.status).toBe(404)
    expect(eingefuegt).toBeNull()
  })

  it('angelId != booking.angel_id → 400 (Bewertungs-Faelschung auf fremde Engel)', async () => {
    aktuellerUser = { id: 'user-1' }
    buchung = gueltigeBuchung({ angel_id: 'engel-1' })
    const { POST } = await import('@/app/api/reviews/route')
    const res = await POST(
      postAnfrage({ bookingId: 'buchung-1', angelId: 'fremder-engel', rating: 1 })
    )
    expect(res.status).toBe(400)
    expect(eingefuegt).toBeNull()
    expect(durchschnittFuer).toBeNull()
  })

  it('stornierte Buchung → 400', async () => {
    aktuellerUser = { id: 'user-1' }
    buchung = gueltigeBuchung({ status: 'cancelled' })
    const { POST } = await import('@/app/api/reviews/route')
    const res = await POST(postAnfrage({ bookingId: 'buchung-1', angelId: 'engel-1', rating: 5 }))
    expect(res.status).toBe(400)
    expect(eingefuegt).toBeNull()
  })

  it('Termin in der Zukunft → 400', async () => {
    aktuellerUser = { id: 'user-1' }
    buchung = gueltigeBuchung({ date: MORGEN })
    const { POST } = await import('@/app/api/reviews/route')
    const res = await POST(postAnfrage({ bookingId: 'buchung-1', angelId: 'engel-1', rating: 5 }))
    expect(res.status).toBe(400)
    expect(eingefuegt).toBeNull()
  })

  it('doppelte Bewertung → 409', async () => {
    aktuellerUser = { id: 'user-1' }
    buchung = gueltigeBuchung()
    vorhandeneBewertung = { id: 'rev-alt' }
    const { POST } = await import('@/app/api/reviews/route')
    const res = await POST(postAnfrage({ bookingId: 'buchung-1', angelId: 'engel-1', rating: 5 }))
    expect(res.status).toBe(409)
    expect(eingefuegt).toBeNull()
  })

  it('gueltige Bewertung → customer_id kommt aus der Session, nicht aus dem Body', async () => {
    aktuellerUser = { id: 'user-1' }
    buchung = gueltigeBuchung()
    const { POST } = await import('@/app/api/reviews/route')
    const res = await POST(
      postAnfrage({
        bookingId: 'buchung-1',
        angelId: 'engel-1',
        rating: 5,
        customer_id: 'user-2',
        comment: '  Alles top  ',
      })
    )
    expect(res.status).toBe(200)
    expect(eingefuegt?.customer_id).toBe('user-1')
    expect(eingefuegt?.comment).toBe('Alles top')
    expect(durchschnittFuer).toBe('engel-1')
  })
})

// ═══════════════════════════════════════════════════════════════
describe('POST /api/reviews: Eingabevalidierung', () => {
  it.each([0, 6, 2.5, '5', -1])('rating %p → 400', async (rating) => {
    aktuellerUser = { id: 'user-1' }
    buchung = gueltigeBuchung()
    const { POST } = await import('@/app/api/reviews/route')
    const res = await POST(postAnfrage({ bookingId: 'buchung-1', angelId: 'engel-1', rating }))
    expect(res.status).toBe(400)
    expect(eingefuegt).toBeNull()
  })

  it('Teilnote ausserhalb 1–5 → 400 statt 500 aus dem DB-CHECK', async () => {
    aktuellerUser = { id: 'user-1' }
    buchung = gueltigeBuchung()
    const { POST } = await import('@/app/api/reviews/route')
    const res = await POST(
      postAnfrage({ bookingId: 'buchung-1', angelId: 'engel-1', rating: 5, punctuality: 9 })
    )
    expect(res.status).toBe(400)
    expect(eingefuegt).toBeNull()
  })

  it('Teilnote 0/null wird zu null normalisiert', async () => {
    aktuellerUser = { id: 'user-1' }
    buchung = gueltigeBuchung()
    const { POST } = await import('@/app/api/reviews/route')
    const res = await POST(
      postAnfrage({
        bookingId: 'buchung-1',
        angelId: 'engel-1',
        rating: 4,
        punctuality: 0,
        friendliness: null,
        reliability: 3,
      })
    )
    expect(res.status).toBe(200)
    expect(eingefuegt?.punctuality).toBeNull()
    expect(eingefuegt?.friendliness).toBeNull()
    expect(eingefuegt?.reliability).toBe(3)
  })

  it('ueberlanger Kommentar → 400 (die DB hat keine Laengenbegrenzung)', async () => {
    aktuellerUser = { id: 'user-1' }
    buchung = gueltigeBuchung()
    const { POST } = await import('@/app/api/reviews/route')
    const res = await POST(
      postAnfrage({
        bookingId: 'buchung-1',
        angelId: 'engel-1',
        rating: 5,
        comment: 'x'.repeat(2001),
      })
    )
    expect(res.status).toBe(400)
    expect(eingefuegt).toBeNull()
  })

  it('Rate-Limit greift vor jeder DB-Abfrage → 429', async () => {
    aktuellerUser = { id: 'user-1' }
    buchung = gueltigeBuchung()
    limitErreicht = true
    const { POST } = await import('@/app/api/reviews/route')
    const res = await POST(postAnfrage({ bookingId: 'buchung-1', angelId: 'engel-1', rating: 5 }))
    expect(res.status).toBe(429)
    expect(letzterSelect).toBe('')
    expect(eingefuegt).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════
describe('Bewertungssystem: Quelltext-Invarianten', () => {
  const routeSrc = readFileSync(join(process.cwd(), 'app/api/reviews/route.ts'), 'utf8')
  const libSrc = readFileSync(join(process.cwd(), 'lib/reviews.ts'), 'utf8')

  it('kein Nachname in API oder Leseschicht', () => {
    expect(routeSrc).not.toContain('last_name')
    expect(libSrc).not.toContain('last_name')
  })

  it('Auth-Check steht am Anfang beider Handler', () => {
    expect(routeSrc).toMatch(/export async function GET[\s\S]{0,600}getUser\(\)/)
    expect(routeSrc).toMatch(/export async function POST[\s\S]{0,600}getUser\(\)/)
  })

  it('GET holt die aktive Org, statt ungefenced zu lesen', () => {
    expect(routeSrc).toContain('getActiveOrgId')
  })

  it('die ausgelieferten Bewertungsfelder enthalten keine Fremdschluessel', () => {
    // customer_id/booking_id sind stabile Identifikatoren — sie duerfen
    // den Server nicht verlassen.
    const typBlock = libSrc.slice(
      libSrc.indexOf('export type OeffentlicheBewertung'),
      libSrc.indexOf('/** Spalten, die aus angel_reviews')
    )
    expect(typBlock).not.toContain('customer_id')
    expect(typBlock).not.toContain('booking_id')
  })

  it('Engel-Profilseite liest nicht mehr direkt aus angel_reviews', () => {
    const seite = readFileSync(join(process.cwd(), 'app/kunde/engel/[id]/page.tsx'), 'utf8')
    expect(seite).not.toContain("from('angel_reviews')")
    expect(seite).toContain('ladeEngelBewertungen')
  })

  it('Bewertungs-Cron prueft die richtige Tabelle und verlinkt die echte Route', () => {
    const cron = readFileSync(join(process.cwd(), 'app/api/cron/review-request/route.ts'), 'utf8')
    expect(cron).toContain("from('angel_reviews')")
    expect(cron).not.toContain("from('reviews')")
    expect(cron).not.toContain('/kunde/bewertung?booking=')
  })
})

// ═══════════════════════════════════════════════════════════════
describe('Bewertungs-RLS: Migration', () => {
  const migration = readFileSync(
    join(process.cwd(), 'supabase/migrations/20260901000000_bewertungen_rls_fence.sql'),
    'utf8'
  )

  it('legt fuer beide Bewertungstabellen keine offene Lesepolicy mehr an', () => {
    const policyBlock = migration.slice(migration.indexOf('-- ── 3) angel_reviews'))
    expect(policyBlock).not.toMatch(/USING\s*\(\s*true\s*\)/i)
    expect(policyBlock).not.toMatch(/WITH CHECK\s*\(\s*true\s*\)/i)
  })

  it('fenced SELECT auf Beteiligte und Admins der eigenen Org', () => {
    expect(migration).toContain('angel_reviews_select_beteiligte')
    expect(migration).toContain('reviews_select_beteiligte')
    expect(migration).toContain('buchung_in_aktiver_org')
  })

  it('INSERT bindet die Bewertung an Buchung UND Engel', () => {
    expect(migration).toContain('darf_buchung_bewerten(booking_id, angel_id)')
  })

  it('DSGVO: Loeschpfad fuer die eigene Bewertung existiert', () => {
    expect(migration).toContain('angel_reviews_delete_eigene')
    expect(migration).toContain('reviews_delete_eigene')
  })

  it('Helper laufen mit fixiertem search_path und ohne anon-Recht', () => {
    expect(migration).toMatch(/darf_buchung_bewerten[\s\S]{0,400}SET search_path = public/)
    expect(migration).toMatch(/buchung_in_aktiver_org[\s\S]{0,400}SET search_path = public/)
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.darf_buchung_bewerten[^\n]*anon/)
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.buchung_in_aktiver_org[^\n]*anon/)
  })

  it('ein Rollback-Skript existiert', () => {
    const rollback = readFileSync(
      join(process.cwd(), 'supabase/migrations/20260901000001_rollback_bewertungen_rls_fence.sql'),
      'utf8'
    )
    expect(rollback).toContain('angel_reviews')
    expect(rollback).toContain('DROP FUNCTION IF EXISTS public.darf_buchung_bewerten')
  })
})
