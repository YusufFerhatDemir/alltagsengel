// ═══════════════════════════════════════════════════════════════
// HIGH-Fix 3: Rate-Limit-Reset ohne Auth-Verifizierung
// ═══════════════════════════════════════════════════════════════
// POST /api/auth/check-rate-limit mit {email, action:'success'} loeschte den
// Fehlversuchs-Zaehler der uebergebenen E-Mail, ohne zu pruefen, ob ueberhaupt
// ein Login stattgefunden hat. Ein Angreifer konnte damit den Brute-Force-
// Schutz eines fremden Kontos beliebig oft zuruecksetzen.
//
// Jetzt: 'success' braucht eine gueltige Session (401) und die E-Mail muss
// zum eingeloggten User gehoeren (403).
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

let sessionUser: { id: string; email: string | null } | null = null
let getUserWirft = false
const geloeschteKeys: string[] = []
const upsertKeys: string[] = []

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => {
        if (getUserWirft) throw new Error('Auth-Service nicht erreichbar')
        return sessionUser
          ? { data: { user: sessionUser }, error: null }
          : { data: { user: null }, error: { message: 'Auth session missing' } }
      },
    },
  }),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      delete: () => ({
        eq: async (_spalte: string, key: string) => {
          geloeschteKeys.push(key)
          return { data: null, error: null }
        },
      }),
      select: () => ({
        eq: () => ({ single: async () => ({ data: null, error: null }) }),
      }),
      upsert: async (row: { key: string }) => {
        upsertKeys.push(row.key)
        return { data: null, error: null }
      },
    }),
  }),
}))

function anfrage(body: Record<string, unknown>) {
  return new NextRequest('https://alltagsengel.care/api/auth/check-rate-limit', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '1.2.3.4' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  sessionUser = null
  getUserWirft = false
  geloeschteKeys.length = 0
  upsertKeys.length = 0
})

describe("check-rate-limit action:'success' — Auth-Pflicht", () => {
  it('ohne Session → 401 und kein Reset', async () => {
    const { POST } = await import('@/app/api/auth/check-rate-limit/route')

    const res = await POST(anfrage({ email: 'opfer@example.de', action: 'success' }))
    expect(res.status).toBe(401)
    expect(geloeschteKeys).toEqual([])
    expect(upsertKeys).toEqual([])
  })

  it('fremde E-Mail trotz gueltiger Session → 403 und kein Reset', async () => {
    sessionUser = { id: 'user-1', email: 'angreifer@example.de' }
    const { POST } = await import('@/app/api/auth/check-rate-limit/route')

    const res = await POST(anfrage({ email: 'opfer@example.de', action: 'success' }))
    expect(res.status).toBe(403)
    expect(geloeschteKeys).toEqual([])
  })

  it('eigene E-Mail mit Session → Reset laeuft (case-insensitiv)', async () => {
    sessionUser = { id: 'user-1', email: 'kunde@example.de' }
    const { POST } = await import('@/app/api/auth/check-rate-limit/route')

    const res = await POST(anfrage({ email: 'Kunde@Example.DE', action: 'success' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(geloeschteKeys).toContain('email:kunde@example.de')
  })

  it('Session ohne E-Mail → 403', async () => {
    sessionUser = { id: 'user-1', email: null }
    const { POST } = await import('@/app/api/auth/check-rate-limit/route')

    const res = await POST(anfrage({ email: 'kunde@example.de', action: 'success' }))
    expect(res.status).toBe(403)
    expect(geloeschteKeys).toEqual([])
  })

  it('Auth-Fehler → fail-closed 401 statt fail-open Reset', async () => {
    getUserWirft = true
    const { POST } = await import('@/app/api/auth/check-rate-limit/route')

    const res = await POST(anfrage({ email: 'kunde@example.de', action: 'success' }))
    expect(res.status).toBe(401)
    expect(geloeschteKeys).toEqual([])
  })
})

describe('check-rate-limit: uebrige Aktionen bleiben ohne Login nutzbar', () => {
  it("action:'check' funktioniert anonym (Login-Formular)", async () => {
    const { POST } = await import('@/app/api/auth/check-rate-limit/route')

    const res = await POST(anfrage({ email: 'kunde@example.de', action: 'check' }))
    expect(res.status).toBe(200)
    expect((await res.json()).allowed).toBe(true)
  })

  it("action:'fail' zaehlt anonym hoch (Fehlversuch vor dem Login)", async () => {
    const { POST } = await import('@/app/api/auth/check-rate-limit/route')

    const res = await POST(anfrage({ email: 'kunde@example.de', action: 'fail' }))
    expect(res.status).toBe(200)
    expect(upsertKeys).toContain('email:kunde@example.de')
    expect(upsertKeys).toContain('ip:1.2.3.4')
  })
})
