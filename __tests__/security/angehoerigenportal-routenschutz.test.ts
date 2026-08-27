/**
 * Angehoerigenportal — serverseitiger Routenschutz.
 *
 * Lueckenanalyse Bereich 13, P2: `/angehoerige` stand bis 23.08.2026 weder
 * im Middleware-Matcher noch in `PROTECTED_PREFIXES` und hatte keinen
 * `ROLE_ACCESS`-Eintrag. Der Schutz haftete allein am Client-Guard in
 * `app/angehoerige/layout.tsx` — also an Code, der im Browser laeuft und
 * die Seite erst NACH dem Ausliefern wegnimmt.
 *
 * Diese Tests halten fest, dass der Bereich jetzt wie /admin, /kunde,
 * /engel, /fahrer und /mis fail-closed durch die Middleware laeuft.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

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

vi.mock('@supabase/ssr', () => ({ createServerClient: mockCreateServerClient }))

vi.mock('next/server', () => ({
  NextResponse: {
    next: ({ request }: any = {}) => ({
      type: 'next',
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

function createMockRequest(url: string) {
  const parsedUrl = new URL(url, 'https://alltagsengel.care')
  return {
    method: 'GET',
    nextUrl: {
      pathname: parsedUrl.pathname,
      searchParams: parsedUrl.searchParams,
      clone: () => ({ pathname: parsedUrl.pathname, searchParams: new URLSearchParams() }),
    },
    headers: { get: () => null },
    cookies: { getAll: () => [], get: () => undefined, set: vi.fn() },
  } as any
}

import { proxy } from '../../proxy'

/**
 * Nutzer mit einer Rolle, die in BEIDEN autoritativen Quellen steht.
 *
 * Bis zum 28.08.2026 genuegte hier app_metadata: proxy.ts fragte profiles
 * gar nicht erst ab, wenn app_metadata.role gesetzt war. Seitdem ist
 * profiles bindend und app_metadata wirkt nur einschraenkend
 * (wirksameRolle, lib/auth/rollen.ts) — der Doppelgaenger muss die
 * profiles-Zeile deshalb mitliefern, sonst gaebe es gar keine Rolle.
 */
function alsNutzer(rolle: string) {
  mockGetUser.mockResolvedValue({
    data: { user: { id: 'u-1', app_metadata: { role: rolle }, user_metadata: {} } },
    error: null,
  })
  mockFromSelect.mockResolvedValue({ data: { role: rolle }, error: null })
}

describe('Angehoerigenportal: serverseitiger Routenschutz', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
  })

  it('nicht angemeldet → Redirect zum Login statt Auslieferung', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })

    const res = await proxy(createMockRequest('/angehoerige/pflegebericht'))

    expect(res.type).toBe('redirect')
    expect(res.url).toContain('login')
    expect(res.url).toContain('auth_required')
  })

  it('Einstiegsseite /angehoerige ist ebenfalls geschuetzt', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })

    const res = await proxy(createMockRequest('/angehoerige'))

    expect(res.type).toBe('redirect')
    expect(res.url).toContain('login')
  })

  it('Rolle angehoerige darf hinein', async () => {
    alsNutzer('angehoerige')

    const res = await proxy(createMockRequest('/angehoerige/dokumente'))

    expect(res.type).not.toBe('redirect')
  })

  it('admin darf hinein (gleiche Rollenmenge wie Layout-Guard und api-auth)', async () => {
    alsNutzer('admin')

    const res = await proxy(createMockRequest('/angehoerige'))

    expect(res.type).not.toBe('redirect')
  })

  it('Rolle kunde wird auf die eigene Startseite umgeleitet', async () => {
    alsNutzer('kunde')

    const res = await proxy(createMockRequest('/angehoerige/pflegebericht'))

    expect(res.type).toBe('redirect')
    expect(res.url).toContain('/kunde/home')
  })

  it('Rolle engel bekommt keinen Zugriff auf fremde Pflegeberichte', async () => {
    alsNutzer('engel')

    const res = await proxy(createMockRequest('/angehoerige/pflegebericht'))

    expect(res.type).toBe('redirect')
    expect(res.url).toContain('/engel/home')
  })

  it('angehoerige darf umgekehrt NICHT in den Admin-Bereich', async () => {
    alsNutzer('angehoerige')

    const res = await proxy(createMockRequest('/admin/dashboard'))

    expect(res.type).toBe('redirect')
    expect(res.url).toContain('/angehoerige')
  })
})
