// ═══════════════════════════════════════════════════════════════════════
// Master-Final-Release-Audit 2026-08-19, Befund A-2 / I-2
//
// app/mis/analytics/actions.ts uebernahm user_id, user_email, user_name
// und status unveraendert aus dem Client-Body. Damit konnte jeder
// eingeloggte Nutzer Audit-Zeilen unter fremdem Namen erzeugen — der
// Trail, an dem alles andere haengt, war wertlos.
//
// Geprueft: die Identitaet kommt ausschliesslich aus der Session, der
// User-Agent aus den Request-Headern, der Status ist serverseitig fix.
// ═══════════════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach, vi } from 'vitest'

let sessionUser: { id: string; email: string } | null = {
  id: '00000000-0000-4000-8000-0000000000aa',
  email: 'echte.session@example.org',
}
let profil: { first_name: string | null; last_name: string | null } | null = {
  first_name: 'Erika',
  last_name: 'Musterfrau',
}
let inserts: any[] = []
let userAgentHeader: string | null = 'Mozilla/5.0 (echter Header)'

vi.mock('next/headers', () => ({
  headers: async () => ({ get: (n: string) => (n === 'user-agent' ? userAgentHeader : null) }),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: sessionUser },
        error: sessionUser ? null : { message: 'no session' },
      }),
    },
    from: (tabelle: string) => ({
      select: () => ({
        eq: () => ({ single: async () => ({ data: profil, error: null }) }),
      }),
      insert: async (row: any) => {
        inserts.push({ tabelle, row })
        return { error: null }
      },
    }),
  }),
}))

import { logAuthEvent } from '@/app/mis/analytics/actions'

beforeEach(() => {
  inserts = []
  sessionUser = { id: '00000000-0000-4000-8000-0000000000aa', email: 'echte.session@example.org' }
  profil = { first_name: 'Erika', last_name: 'Musterfrau' }
  userAgentHeader = 'Mozilla/5.0 (echter Header)'
})

describe('logAuthEvent — Identitaet aus der Session', () => {
  it('schreibt user_id, user_email und user_name aus Session bzw. Profil', async () => {
    const res = await logAuthEvent({ action: 'login', device: 'iPhone' })

    expect(res).toEqual({ ok: true })
    expect(inserts).toHaveLength(1)
    expect(inserts[0].tabelle).toBe('mis_auth_log')
    expect(inserts[0].row).toMatchObject({
      user_id: '00000000-0000-4000-8000-0000000000aa',
      user_email: 'echte.session@example.org',
      user_name: 'Erika Musterfrau',
      action: 'login',
      device: 'iPhone',
      status: 'success',
    })
  })

  it('ignoriert untergeschobene Identitaetsfelder aus dem Aufruf', async () => {
    // Das ist der Angriff aus A-2: der Client behauptet, jemand anders zu sein.
    await logAuthEvent({
      action: 'login',
      device: 'iPhone',
      // absichtlich am Typ vorbei — genau so kaeme es aus einem manipulierten Client
      user_id: '00000000-0000-4000-8000-00000000dead',
      user_email: 'opfer@example.org',
      user_name: 'Fremder Admin',
      status: 'failed',
      user_agent: '<script>alert(1)</script>',
    } as any)

    expect(inserts[0].row.user_id).toBe('00000000-0000-4000-8000-0000000000aa')
    expect(inserts[0].row.user_email).toBe('echte.session@example.org')
    expect(inserts[0].row.user_name).toBe('Erika Musterfrau')
    expect(inserts[0].row.status).toBe('success')
    expect(inserts[0].row.user_agent).toBe('Mozilla/5.0 (echter Header)')
  })

  it('nimmt den User-Agent aus dem Header, nicht aus dem Body', async () => {
    userAgentHeader = 'AlltagsengelApp/1.0'
    await logAuthEvent({ action: 'login', device: 'Mac' })
    expect(inserts[0].row.user_agent).toBe('AlltagsengelApp/1.0')
  })

  it('kuerzt einen ueberlangen User-Agent auf 500 Zeichen', async () => {
    userAgentHeader = 'A'.repeat(5000)
    await logAuthEvent({ action: 'login', device: 'Mac' })
    expect(inserts[0].row.user_agent).toHaveLength(500)
  })

  it('faellt ohne Profil auf den neutralen Absendernamen zurueck', async () => {
    profil = null
    await logAuthEvent({ action: 'login', device: 'Windows' })
    expect(inserts[0].row.user_name).toBe('Alltagsengel')
  })
})

describe('logAuthEvent — Validierung', () => {
  it('weist unbekannte Aktionen ab, ohne zu schreiben', async () => {
    const res = await logAuthEvent({ action: 'role_grant' as any, device: 'Mac' })
    expect(res).toEqual({ ok: false, error: 'Unbekannte Aktion.' })
    expect(inserts).toHaveLength(0)
  })

  it('normalisiert ein unbekanntes Geraet auf "Unbekannt"', async () => {
    await logAuthEvent({ action: 'login', device: '<img src=x onerror=1>' })
    expect(inserts[0].row.device).toBe('Unbekannt')
  })

  it('schreibt ohne Session gar nichts', async () => {
    sessionUser = null
    const res = await logAuthEvent({ action: 'login', device: 'Mac' })
    expect(res).toEqual({ ok: false, error: 'Nicht autorisiert.' })
    expect(inserts).toHaveLength(0)
  })
})
