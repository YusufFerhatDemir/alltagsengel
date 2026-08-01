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
    from: () => ({ select: () => ({ eq: () => ({ single: mockFromSelect }) }) }),
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

  it('normaler Benutzer (rolle=kunde) → kein Admin-Zugriff', async () => {
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
    expect(res.url).toContain('admin_required')
  })

  it('Engel-Benutzer → kein Admin-Zugriff', async () => {
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
    expect(res.url).toContain('admin_required')
  })

  it('Admin-Benutzer (app_metadata) → Zugriff erlaubt', async () => {
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

    const req = createMockRequest('/admin/dashboard')
    const res = await proxy(req)

    // Kein Redirect = Zugriff erlaubt
    expect(res.type).not.toBe('redirect')
  })

  it('Superadmin → Zugriff erlaubt', async () => {
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

    const req = createMockRequest('/admin/users')
    const res = await proxy(req)

    expect(res.type).not.toBe('redirect')
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
    expect(res.url).toContain('admin_required')
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
    expect(res.body.error).toContain('CSRF')
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
    expect(res.url).toContain('admin_required')
  })
})
