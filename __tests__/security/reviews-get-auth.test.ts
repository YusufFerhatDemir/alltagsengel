// ═══════════════════════════════════════════════════════════════
// HIGH-Fix 2: GET /api/reviews lieferte Kunden-PII ohne Login
// ═══════════════════════════════════════════════════════════════
// Der GET-Handler hatte keinen Auth-Check und jointe
// profiles(first_name, last_name, avatar_color) an die Bewertungen —
// Klarnamen von Kundinnen und Kunden waren damit oeffentlich abrufbar.
// Kein Frontend nutzt den Endpunkt (nur POST wird aufgerufen).
//
// Jetzt: 401 ohne Session, und der Join gibt keine Nachnamen mehr heraus.
// ═══════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

let aktuellerUser: { id: string } | null = null
let letzterSelect = ''

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: aktuellerUser }, error: null }),
    },
    from: () => ({
      select: (spalten: string) => {
        letzterSelect = spalten
        const chain: Record<string, unknown> = {}
        chain.eq = () => chain
        chain.order = () => chain
        chain.limit = async () => ({ data: [], error: null })
        chain.maybeSingle = async () => ({ data: null, error: null })
        return chain
      },
    }),
  }),
}))

function anfrage(query: string) {
  return new NextRequest(`https://alltagsengel.care/api/reviews?${query}`)
}

beforeEach(() => {
  aktuellerUser = null
  letzterSelect = ''
})

describe('GET /api/reviews: Auth-Pflicht', () => {
  it('ohne Session → 401, keine Bewertungsdaten', async () => {
    const { GET } = await import('@/app/api/reviews/route')

    const res = await GET(anfrage('angelId=engel-1'))
    expect(res.status).toBe(401)

    const body = await res.json()
    expect(body.reviews).toBeUndefined()
    expect(body.error).toBe('Nicht authentifiziert')
  })

  it('ohne Session auch bei bookingId → 401', async () => {
    const { GET } = await import('@/app/api/reviews/route')

    const res = await GET(anfrage('bookingId=buchung-1'))
    expect(res.status).toBe(401)

    const body = await res.json()
    expect(body.review).toBeUndefined()
  })

  it('mit Session → 200', async () => {
    aktuellerUser = { id: 'user-1' }
    const { GET } = await import('@/app/api/reviews/route')

    const res = await GET(anfrage('angelId=engel-1'))
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.reviews).toEqual([])
  })

  it('Auth-Check laeuft VOR jeder DB-Abfrage', async () => {
    const { GET } = await import('@/app/api/reviews/route')

    await GET(anfrage('angelId=engel-1'))
    expect(letzterSelect).toBe('')
  })
})

describe('GET /api/reviews: kein Klarnamen-Leak', () => {
  it('profiles-Join enthaelt keinen Nachnamen', async () => {
    aktuellerUser = { id: 'user-1' }
    const { GET } = await import('@/app/api/reviews/route')

    await GET(anfrage('angelId=engel-1'))
    expect(letzterSelect).toContain('profiles:customer_id')
    expect(letzterSelect).not.toContain('last_name')
  })

  it('Quelltext enthaelt keinen last_name-Join mehr', () => {
    const src = readFileSync(join(process.cwd(), 'app/api/reviews/route.ts'), 'utf8')
    expect(src).not.toContain('last_name')
    expect(src).toMatch(/export async function GET[\s\S]{0,600}getUser\(\)/)
  })
})
