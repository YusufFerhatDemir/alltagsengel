// ═══════════════════════════════════════════════════════════════
// lib/reviews.ts — Mandanten-Fence der Bewertungs-Leseschicht
// ═══════════════════════════════════════════════════════════════
// angel_reviews hat KEINE organization_id — der Mandant haengt an der
// Buchung. Die Leseschicht laeuft mit dem Service-Role-Key (RLS umgangen),
// also ist dieser Fence die einzige Schranke. Genau deshalb hier getestet:
//
//   - Bewertung, deren Buchung in einer fremden Org liegt → verworfen
//   - Bewertung, deren Buchung gar nicht auffindbar ist   → verworfen
//   - customer_id/booking_id verlassen den Server nie
//   - Buchungsbewertung nur fuer Kunde, Engel, Admin
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach, vi } from 'vitest'

type Zeile = Record<string, any>

const daten: Record<string, Zeile[]> = { angel_reviews: [], bookings: [], profiles: [] }
const updates: Array<{ tabelle: string; patch: Zeile }> = []

function baueChain(tabelle: string) {
  const filter: Array<(z: Zeile) => boolean> = []
  let limit = Infinity
  let patch: Zeile | null = null

  const treffer = () => (daten[tabelle] || []).filter(z => filter.every(f => f(z))).slice(0, limit)

  const chain: any = {
    select: () => chain,
    update: (p: Zeile) => { patch = p; return chain },
    eq: (s: string, v: any) => { filter.push(z => z[s] === v); return chain },
    in: (s: string, vs: any[]) => { filter.push(z => vs.includes(z[s])); return chain },
    order: () => chain,
    limit: (n: number) => { limit = n; return chain },
    maybeSingle: async () => ({ data: treffer()[0] ?? null, error: null }),
    single: async () => {
      const t = treffer()
      return { data: t[0] ?? null, error: t[0] ? null : { message: 'not found' } }
    },
    then: (resolve: any) => {
      if (patch) {
        updates.push({ tabelle, patch })
        return resolve({ data: null, error: null })
      }
      return resolve({ data: treffer(), error: null })
    },
  }
  return chain
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (tabelle: string) => baueChain(tabelle) }),
}))

const ORG_A = 'org-a'
const ORG_B = 'org-b'

beforeEach(() => {
  daten.angel_reviews = []
  daten.bookings = []
  daten.profiles = [
    { id: 'kunde-a', first_name: 'Anna', last_name: 'Meier', avatar_color: '#fff' },
    { id: 'kunde-b', first_name: 'Bernd', last_name: 'Schulz', avatar_color: '#000' },
  ]
  updates.length = 0
})

function bewertung(over: Zeile = {}): Zeile {
  return {
    id: 'rev-1',
    booking_id: 'buchung-a',
    customer_id: 'kunde-a',
    angel_id: 'engel-1',
    rating: 5,
    punctuality: 5,
    friendliness: 4,
    reliability: null,
    comment: 'Sehr zufrieden',
    created_at: '2026-08-01T10:00:00Z',
    ...over,
  }
}

// ═══════════════════════════════════════════════════════════════
describe('ladeEngelBewertungen: Org-Fence', () => {
  it('liefert Bewertungen der eigenen Org', async () => {
    daten.angel_reviews = [bewertung()]
    daten.bookings = [{ id: 'buchung-a', organization_id: ORG_A }]
    const { ladeEngelBewertungen } = await import('@/lib/reviews')

    const res = await ladeEngelBewertungen('engel-1', ORG_A)
    expect(res).toHaveLength(1)
    expect(res[0].rating).toBe(5)
    expect(res[0].verfasser.first_name).toBe('Anna')
  })

  it('Org A sieht die Bewertungen von Org B NICHT', async () => {
    daten.angel_reviews = [bewertung({ id: 'rev-b', booking_id: 'buchung-b' })]
    daten.bookings = [{ id: 'buchung-b', organization_id: ORG_B }]
    const { ladeEngelBewertungen } = await import('@/lib/reviews')

    expect(await ladeEngelBewertungen('engel-1', ORG_A)).toEqual([])
  })

  it('mischt nicht: nur die Zeilen der aktiven Org kommen durch', async () => {
    daten.angel_reviews = [
      bewertung({ id: 'rev-a', booking_id: 'buchung-a' }),
      bewertung({ id: 'rev-b', booking_id: 'buchung-b', comment: 'Fremde Org' }),
    ]
    daten.bookings = [
      { id: 'buchung-a', organization_id: ORG_A },
      { id: 'buchung-b', organization_id: ORG_B },
    ]
    const { ladeEngelBewertungen } = await import('@/lib/reviews')

    const res = await ladeEngelBewertungen('engel-1', ORG_A)
    expect(res.map(r => r.id)).toEqual(['rev-a'])
  })

  it('fail-closed: Bewertung ohne auffindbare Buchung wird verworfen', async () => {
    daten.angel_reviews = [bewertung({ booking_id: 'geloescht' })]
    daten.bookings = []
    const { ladeEngelBewertungen } = await import('@/lib/reviews')

    expect(await ladeEngelBewertungen('engel-1', ORG_A)).toEqual([])
  })

  it('ohne orgId wird gar nicht erst gelesen', async () => {
    daten.angel_reviews = [bewertung()]
    daten.bookings = [{ id: 'buchung-a', organization_id: ORG_A }]
    const { ladeEngelBewertungen } = await import('@/lib/reviews')

    expect(await ladeEngelBewertungen('engel-1', '')).toEqual([])
  })
})

// ═══════════════════════════════════════════════════════════════
describe('ladeEngelBewertungen: Datensparsamkeit', () => {
  it('gibt weder customer_id noch booking_id noch Nachnamen heraus', async () => {
    daten.angel_reviews = [bewertung()]
    daten.bookings = [{ id: 'buchung-a', organization_id: ORG_A }]
    const { ladeEngelBewertungen } = await import('@/lib/reviews')

    const res = await ladeEngelBewertungen('engel-1', ORG_A)
    const serialisiert = JSON.stringify(res)
    expect(serialisiert).not.toContain('kunde-a')
    expect(serialisiert).not.toContain('buchung-a')
    expect(serialisiert).not.toContain('Meier')
    expect(Object.keys(res[0])).not.toContain('customer_id')
    expect(Object.keys(res[0])).not.toContain('booking_id')
  })

  it('unbekannter Verfasser → leerer Name statt Absturz', async () => {
    daten.angel_reviews = [bewertung({ customer_id: 'geloeschter-kunde' })]
    daten.bookings = [{ id: 'buchung-a', organization_id: ORG_A }]
    const { ladeEngelBewertungen } = await import('@/lib/reviews')

    const res = await ladeEngelBewertungen('engel-1', ORG_A)
    expect(res[0].verfasser.first_name).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════
describe('ladeBuchungsBewertung: Ownership + Org', () => {
  beforeEach(() => {
    daten.bookings = [
      { id: 'buchung-a', customer_id: 'kunde-a', angel_id: 'engel-1', organization_id: ORG_A },
    ]
    daten.angel_reviews = [bewertung()]
  })

  it('Kunde der Buchung darf lesen', async () => {
    const { ladeBuchungsBewertung } = await import('@/lib/reviews')
    const res = await ladeBuchungsBewertung('buchung-a', 'kunde-a', ORG_A, false)
    expect(res.erlaubt).toBe(true)
    expect(res.bewertung?.rating).toBe(5)
  })

  it('Engel der Buchung darf lesen', async () => {
    const { ladeBuchungsBewertung } = await import('@/lib/reviews')
    expect((await ladeBuchungsBewertung('buchung-a', 'engel-1', ORG_A, false)).erlaubt).toBe(true)
  })

  it('Unbeteiligter darf NICHT lesen', async () => {
    const { ladeBuchungsBewertung } = await import('@/lib/reviews')
    const res = await ladeBuchungsBewertung('buchung-a', 'kunde-b', ORG_A, false)
    expect(res.erlaubt).toBe(false)
    expect(res.bewertung).toBeNull()
  })

  it('Admin aus fremder Org darf NICHT lesen', async () => {
    const { ladeBuchungsBewertung } = await import('@/lib/reviews')
    const res = await ladeBuchungsBewertung('buchung-a', 'admin-b', ORG_B, true)
    expect(res.erlaubt).toBe(false)
  })

  it('Admin der eigenen Org darf lesen', async () => {
    const { ladeBuchungsBewertung } = await import('@/lib/reviews')
    expect((await ladeBuchungsBewertung('buchung-a', 'admin-a', ORG_A, true)).erlaubt).toBe(true)
  })

  it('unbekannte Buchung → nicht erlaubt (kein Existenz-Orakel)', async () => {
    const { ladeBuchungsBewertung } = await import('@/lib/reviews')
    expect((await ladeBuchungsBewertung('gibt-es-nicht', 'kunde-a', ORG_A, true)).erlaubt).toBe(false)
  })

  it('noch nicht bewertet → erlaubt, aber null', async () => {
    daten.angel_reviews = []
    const { ladeBuchungsBewertung } = await import('@/lib/reviews')
    const res = await ladeBuchungsBewertung('buchung-a', 'kunde-a', ORG_A, false)
    expect(res.erlaubt).toBe(true)
    expect(res.bewertung).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════
describe('aktualisiereEngelDurchschnitt', () => {
  it('schreibt den Durchschnitt (frueher lief der Update ueber den User-Client ins Leere)', async () => {
    daten.angel_reviews = [
      bewertung({ id: 'r1', rating: 5 }),
      bewertung({ id: 'r2', rating: 4 }),
      bewertung({ id: 'r3', rating: 4 }),
    ]
    const { aktualisiereEngelDurchschnitt } = await import('@/lib/reviews')
    await aktualisiereEngelDurchschnitt('engel-1')

    expect(updates).toHaveLength(1)
    expect(updates[0].tabelle).toBe('angels')
    expect(updates[0].patch.rating).toBe(4.3)
  })

  it('fasst total_jobs nicht an — das Feld zaehlt Auftraege, nicht Bewertungen', async () => {
    daten.angel_reviews = [bewertung()]
    const { aktualisiereEngelDurchschnitt } = await import('@/lib/reviews')
    await aktualisiereEngelDurchschnitt('engel-1')

    expect(updates[0].patch).not.toHaveProperty('total_jobs')
  })

  it('ohne Bewertungen wird nichts geschrieben', async () => {
    daten.angel_reviews = []
    const { aktualisiereEngelDurchschnitt } = await import('@/lib/reviews')
    await aktualisiereEngelDurchschnitt('engel-1')

    expect(updates).toHaveLength(0)
  })
})
