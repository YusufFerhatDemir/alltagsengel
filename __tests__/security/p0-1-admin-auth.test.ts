/**
 * P0-1: Admin- und Server-Routenschutz — Negativtests
 *
 * Testet die proxy()-Middleware (jetzt als middleware.ts verdrahtet).
 * Da Next.js Middleware schwer Unit-testbar ist (Edge Runtime, spezielle
 * NextRequest-Konstruktion), testen wir die Logik direkt durch Import
 * der proxy()-Funktion mit gemocktem Request.
 *
 * Diese Tests belegen:
 *   1. Nicht-angemeldeter Benutzer → Redirect zu Login (Fail-Closed)
 *   2. Normaler Benutzer → kein Admin-Zugriff
 *   3. CSRF-Schutz funktioniert
 *   4. Fehler in Middleware → Fail-Closed für Admin
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock @supabase/ssr before importing proxy
const { mockGetUser, mockFromSelect, mockCreateServerClient } = vi.hoisted(() => {
  const mockGetUser = vi.fn()
  const mockFromSelect = vi.fn()
  const mockCreateServerClient = vi.fn(() => ({
    auth: { getUser: mockGetUser },
    // maybeSingle zusaetzlich zu single: proxy.ts liest die profiles-Zeile
    // seit dem 28.08.2026 mit maybeSingle() — eine fehlende Zeile ist dort
    // ein regulaerer Fall („keine Rolle"), kein Fehler.
    from: () => ({
      select: () => ({
        eq: () => ({ single: mockFromSelect, maybeSingle: mockFromSelect }),
      }),
    }),
  }))
  return { mockGetUser, mockFromSelect, mockCreateServerClient }
})

vi.mock('@supabase/ssr', () => ({
  createServerClient: mockCreateServerClient,
}))

// Minimal NextRequest mock
function createMockRequest(
  url: string,
  options: {
    method?: string
    headers?: Record<string, string>
    cookies?: Record<string, string>
  } = {}
) {
  const { method = 'GET', headers = {}, cookies = {} } = options
  const parsedUrl = new URL(url, 'https://alltagsengel.care')

  return {
    method,
    nextUrl: {
      pathname: parsedUrl.pathname,
      searchParams: parsedUrl.searchParams,
      clone: () => ({
        pathname: parsedUrl.pathname,
        searchParams: new URLSearchParams(),
      }),
    },
    headers: {
      get: (name: string) => headers[name.toLowerCase()] || null,
    },
    cookies: {
      getAll: () => Object.entries(cookies).map(([name, value]) => ({ name, value })),
      get: (name: string) => {
        const val = cookies[name]
        return val !== undefined ? { name, value: val } : undefined
      },
      set: vi.fn(),
    },
  } as any
}

// We need to mock NextResponse too
vi.mock('next/server', () => ({
  NextResponse: {
    next: ({ request }: any = {}) => ({
      cookies: { set: vi.fn() },
      headers: new Map(),
      _request: request,
    }),
    redirect: (url: any) => ({
      type: 'redirect',
      url: typeof url === 'string' ? url : `${url.pathname}?${url.searchParams?.toString() || ''}`,
      status: 307,
      cookies: { set: vi.fn() },
    }),
    json: (body: any, init?: { status?: number }) => ({
      type: 'json',
      body,
      status: init?.status || 200,
      cookies: { set: vi.fn() },
    }),
  },
}))

import { proxy } from '../../proxy'

describe('P0-1: Admin-Routenschutz (Fail-Closed)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
  })

  it('nicht angemeldeter Benutzer → Redirect von /admin', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })

    const req = createMockRequest('/admin/dashboard')
    const res = await proxy(req)

    expect(res.type).toBe('redirect')
    expect(res.url).toContain('login')
    expect(res.url).toContain('auth_required')
  })

  it('nicht angemeldeter Benutzer → Redirect von /mis', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })

    const req = createMockRequest('/mis/dashboard')
    const res = await proxy(req)

    expect(res.type).toBe('redirect')
    expect(res.url).toContain('login')
  })

  it('nicht angemeldeter Benutzer → Redirect von /kunde/zahlungsdaten (sensibel)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })

    const req = createMockRequest('/kunde/zahlungsdaten')
    const res = await proxy(req)

    expect(res.type).toBe('redirect')
    expect(res.url).toContain('login')
  })

  it('normaler Benutzer (rolle=kunde) → kein Admin-Zugriff, Redirect zur eigenen Startseite', async () => {
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: 'user-123',
          app_metadata: { role: 'kunde' },
          user_metadata: {},
        },
      },
      error: null,
    })
    // DB-Fallback: auch kein Admin
    mockFromSelect.mockResolvedValue({ data: { role: 'kunde' }, error: null })

    const req = createMockRequest('/admin/dashboard')
    const res = await proxy(req)

    expect(res.type).toBe('redirect')
    // Rollenbasierter Routenschutz: Redirect zur eigenen Startseite statt Login
    expect(res.url).toContain('/kunde/home')
  })

  it('Engel-Benutzer → kein Admin-Zugriff, Redirect zur eigenen Startseite', async () => {
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: 'user-456',
          app_metadata: { role: 'engel' },
          user_metadata: {},
        },
      },
      error: null,
    })
    mockFromSelect.mockResolvedValue({ data: { role: 'engel' }, error: null })

    const req = createMockRequest('/admin/klienten')
    const res = await proxy(req)

    expect(res.type).toBe('redirect')
    // Rollenbasierter Routenschutz: Redirect zur eigenen Startseite statt Login
    expect(res.url).toContain('/engel/home')
  })

  // ───────────────────────────────────────────────────────────────
  // Rollenquelle ab 28.08.2026
  //
  // Bis dahin galt „app_metadata gewinnt, profiles nur als Fallback" —
  // profiles wurde gar nicht erst abgefragt, wenn app_metadata gesetzt
  // war. Jetzt ist profiles BINDEND und app_metadata wirkt nur
  // einschraenkend (wirksameRolle, lib/auth/rollen.ts). Die beiden
  // folgenden Tests setzen deshalb beide Quellen; die zwei danach halten
  // fest, was die alte Regel durchgelassen haette.
  // ───────────────────────────────────────────────────────────────

  it('Admin-Benutzer (beide Quellen einig) → Zugriff erlaubt', async () => {
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: 'admin-789',
          app_metadata: { role: 'admin' },
          user_metadata: {},
        },
      },
      error: null,
    })
    mockFromSelect.mockResolvedValue({ data: { role: 'admin' }, error: null })

    const req = createMockRequest('/admin/dashboard')
    const res = await proxy(req)

    // Kein Redirect = Zugriff erlaubt
    expect(res.type).not.toBe('redirect')
  })

  it('Superadmin (beide Quellen einig) → Zugriff erlaubt', async () => {
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: 'super-001',
          app_metadata: { role: 'superadmin' },
          user_metadata: {},
        },
      },
      error: null,
    })
    mockFromSelect.mockResolvedValue({ data: { role: 'superadmin' }, error: null })

    const req = createMockRequest('/admin/users')
    const res = await proxy(req)

    expect(res.type).not.toBe('redirect')
  })

  it('app_metadata=admin OHNE profiles-Zeile → kein Zugriff', async () => {
    // Ein Token ohne zugehoerigen Personendatensatz ist kein Zugang.
    // Unter der alten Regel kam dieser Fall durch.
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'geist-001', app_metadata: { role: 'admin' }, user_metadata: {} } },
      error: null,
    })
    mockFromSelect.mockResolvedValue({ data: null, error: null })

    const res = await proxy(createMockRequest('/admin/dashboard'))

    expect(res.type).toBe('redirect')
    expect(res.url).toContain('login')
  })

  it('in der Datenbank herabgestuft (app_metadata=admin, profiles=kunde) → kein Admin-Zugriff', async () => {
    // Der Kernfall des Tracks: app_metadata.role schreibt nur
    // /api/admin/manage-role. Eine Herabstufung direkt in der Datenbank
    // liess den alten, hoeheren Wert im Token stehen — und dieser
    // Torwaechter liess die Person weiter herein, waehrend die
    // Fach-Guards in lib/**/api-auth.ts bereits abwiesen.
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'ex-admin', app_metadata: { role: 'admin' }, user_metadata: {} } },
      error: null,
    })
    mockFromSelect.mockResolvedValue({ data: { role: 'kunde' }, error: null })

    const res = await proxy(createMockRequest('/admin/dashboard'))

    expect(res.type).toBe('redirect')
    expect(res.url).toContain('/kunde/home')
  })

  it('profiles-Abfrage mit Fehler → fail-closed zum Login', async () => {
    // supabase-js wirft bei PostgREST-Fehlern nicht; ohne ausdrueckliche
    // Pruefung des zurueckgegebenen Fehlers bliebe der Fall unbemerkt.
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'admin-789', app_metadata: { role: 'admin' }, user_metadata: {} } },
      error: null,
    })
    mockFromSelect.mockResolvedValue({ data: null, error: { message: 'connection reset' } })

    const res = await proxy(createMockRequest('/admin/dashboard'))

    expect(res.type).toBe('redirect')
    expect(res.url).toContain('login')
  })

  it('Admin per DB-Fallback (app_metadata leer) → Zugriff erlaubt', async () => {
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: 'admin-db',
          app_metadata: {},
          user_metadata: {},
        },
      },
      error: null,
    })
    mockFromSelect.mockResolvedValue({ data: { role: 'admin' }, error: null })

    const req = createMockRequest('/admin/dashboard')
    const res = await proxy(req)

    expect(res.type).not.toBe('redirect')
  })

  it('DB-Fallback schlägt fehl → Fail-Closed, kein Zugriff', async () => {
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: 'admin-fail',
          app_metadata: {},
          user_metadata: {},
        },
      },
      error: null,
    })
    mockFromSelect.mockRejectedValue(new Error('DB connection failed'))

    const req = createMockRequest('/admin/dashboard')
    const res = await proxy(req)

    expect(res.type).toBe('redirect')
    expect(res.url).toContain('auth_required')
  })
})

describe('P0-1: CSRF-Schutz', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
  })

  it('Cross-Origin POST → 403 CSRF', async () => {
    const req = createMockRequest('/api/admin/krankenfahrten', {
      method: 'POST',
      headers: {
        origin: 'https://evil.com',
        host: 'alltagsengel.care',
      },
    })
    const res = await proxy(req)

    expect(res.type).toBe('json')
    expect(res.status).toBe(403)
    expect((res as any).body.error).toContain('CSRF')
  })

  it('Same-Origin POST → erlaubt', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })

    const req = createMockRequest('/api/kontakt', {
      method: 'POST',
      headers: {
        origin: 'https://alltagsengel.care',
        host: 'alltagsengel.care',
      },
    })
    const res = await proxy(req)

    // Kein CSRF-Block
    expect(res.type).not.toBe('json')
  })

  it('Subdomain-Origin → erlaubt', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })

    const req = createMockRequest('/api/track', {
      method: 'POST',
      headers: {
        origin: 'https://staging.alltagsengel.care',
        host: 'alltagsengel.care',
      },
    })
    const res = await proxy(req)

    expect(res.type).not.toBe('json')
  })
})

describe('P0-1: Middleware Error Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
  })

  it('Middleware-Exception auf Admin-Route → Fail-Closed', async () => {
    mockGetUser.mockRejectedValue(new Error('Supabase unreachable'))

    const req = createMockRequest('/admin/dashboard')
    const res = await proxy(req)

    expect(res.type).toBe('redirect')
    expect(res.url).toContain('auth_required')
  })
})
