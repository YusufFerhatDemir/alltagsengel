/**
 * P1 B-2: DSGVO-Kontolöschung (Art. 17) — /api/user/delete + /undo
 * Ende-zu-Ende gegen die Shadow-DB (PostgREST + Auth-Shim).
 *
 * Befund (audit/GO_NO_GO_REPORT.md B-2): profiles.deleted_at und
 * account_deletion_tokens fehlen LIVE — die Routen brechen dort zur
 * Laufzeit. Diese Suite beweist gegen die aus dem Repo gebaute
 * Shadow-DB (inkl. 20260419_soft_delete.sql), dass der komplette
 * Flow funktioniert, sobald die Migration angewendet ist:
 *
 *   1. DELETE ohne Session → 401
 *   2. DELETE mit falschem Passwort → 401, kein Soft-Delete
 *   3. Vorher: anderer Nutzer SIEHT das Profil (RLS-Baseline)
 *   4. DELETE korrekt → 200, deleted_at gesetzt, Widerruf-Token angelegt
 *   5. Nachher: anderer Nutzer + anon sehen das Profil NICHT mehr
 *   6. Zweiter DELETE (idempotent) → 200, Token regeneriert
 *   7. Undo mit unbekanntem Token → redirect token_not_found
 *   8. Undo mit gültigem Token → redirect reactivated=1, deleted_at NULL
 *   9. Danach: Profil wieder sichtbar
 *  10. Undo mit verbranntem Token → redirect already_used
 *
 * Aktivierung wie __tests__/shadow-db/tenant-isolation.test.ts:
 *   ./scripts/shadow-db.sh test && ./scripts/shadow-db-http.sh up
 *   SHADOW_SUPABASE_URL=… SHADOW_SUPABASE_ANON_KEY=… \
 *   SHADOW_SUPABASE_SERVICE_ROLE_KEY=… npx vitest run __tests__/shadow-db/
 * Ohne diese Env-Variablen wird die Suite übersprungen (nicht grün gelogen).
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import type { NextRequest } from 'next/server'

const SHADOW_URL = process.env.SHADOW_SUPABASE_URL
const SHADOW_ANON_KEY = process.env.SHADOW_SUPABASE_ANON_KEY
const SHADOW_SERVICE_KEY = process.env.SHADOW_SUPABASE_SERVICE_ROLE_KEY
const hasShadowDb = Boolean(SHADOW_URL && SHADOW_ANON_KEY && SHADOW_SERVICE_KEY)

// IDs aus supabase/shadow/10_seed_two_orgs.sql
const KUNDE_A_ID = 'a0000000-0000-4000-8000-0000000000a2'
const KUNDE_A_EMAIL = 'kunde-a@shadow.test'
const KUNDE_B_EMAIL = 'kunde-b@shadow.test'
// Festes Shadow-Testpasswort des Auth-Shims (scripts/shadow-auth-shim.mjs)
const TEST_PASSWORD = process.env.SHADOW_TEST_PASSWORD || 'ShadowTest123!'

// ── Mocks: nur Session-Layer + Mail. Admin-Client und damit alle
//    DB-Zugriffe der Routen laufen REAL gegen die Shadow-DB. ──
const { mockGetUser, mockSignOut, mockSendDeletionMail } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockSignOut: vi.fn().mockResolvedValue({ error: null }),
  mockSendDeletionMail: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: mockGetUser, signOut: mockSignOut },
  }),
}))

vi.mock('@/lib/emails/account-deletion', () => ({
  sendAccountDeletionEmail: mockSendDeletionMail,
  sendAccountHardDeletedEmail: vi.fn().mockResolvedValue(undefined),
}))

function loggedInAs(id: string, email: string) {
  mockGetUser.mockResolvedValue({ data: { user: { id, email } } })
}
function loggedOut() {
  mockGetUser.mockResolvedValue({ data: { user: null } })
}

function deleteRequest(body: unknown): NextRequest {
  return new Request('https://alltagsengel.care/api/user/delete', {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest
}

function undoRequest(token: string | null): NextRequest {
  const qs = token === null ? '' : `?token=${encodeURIComponent(token)}`
  return new Request(
    `https://alltagsengel.care/api/user/delete/undo${qs}`
  ) as unknown as NextRequest
}

function lastMailedToken(): string {
  const calls = mockSendDeletionMail.mock.calls
  expect(calls.length).toBeGreaterThan(0)
  return calls[calls.length - 1][0].token
}

describe.skipIf(!hasShadowDb)('Dynamisch: DSGVO-Kontolöschung gegen echte Shadow-DB', () => {
  let service: any

  beforeAll(async () => {
    // Die Routen lesen diese Env-Variablen zur Laufzeit — auf die
    // Shadow-Endpunkte umbiegen (kein Kontakt zu Produktion).
    process.env.NEXT_PUBLIC_SUPABASE_URL = SHADOW_URL
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = SHADOW_ANON_KEY
    process.env.SUPABASE_SERVICE_ROLE_KEY = SHADOW_SERVICE_KEY
    process.env.NEXT_PUBLIC_APP_URL = 'https://alltagsengel.care'

    const { createClient } = await import('@supabase/supabase-js')
    service = createClient(SHADOW_URL!, SHADOW_SERVICE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    // Definierter Ausgangszustand
    await service.from('profiles').update({ deleted_at: null }).eq('id', KUNDE_A_ID)
    await service.from('account_deletion_tokens').delete().eq('user_id', KUNDE_A_ID)
    await ratelimitZuruecksetzen()
  })

  afterAll(async () => {
    // Shadow-DB in den Seed-Zustand zurücksetzen, damit Wiederholungs-
    // läufe und die Tenant-Suite deterministisch bleiben.
    if (!service) return
    await service.from('profiles').update({ deleted_at: null }).eq('id', KUNDE_A_ID)
    await service.from('account_deletion_tokens').delete().eq('user_id', KUNDE_A_ID)
    await ratelimitZuruecksetzen()
  })

  /**
   * Den Ratelimit-Zaehler dieses Nutzers zuruecksetzen.
   *
   * BEFUND, der diese Zeilen noetig macht: `DELETE /api/user/delete` laeuft
   * durch `rateLimitPersistent('user-delete:<id>', 10, 3_600_000)` — der
   * Zaehler steht in `public.api_rate_limits` und damit IN DER DATENBANK.
   * Die Shadow-DB ueberlebt den Testlauf; der Zaehler also auch.
   *
   * Die Suite setzt pro Lauf mehrere DELETE-Aufrufe ab. Nach ein paar
   * Laeufen innerhalb derselben Stunde war das Stundenkontingent
   * aufgebraucht, und ab da antwortete die Route mit 429 — Fall 4 und
   * alles danach fiel um, obwohl an der Loeschkette nichts kaputt war.
   * Genau das ist in CI passiert (jeder Lauf seit dem 28.08. rot, immer
   * dieselben sechs Faelle, immer „expected 429 to be 200").
   *
   * Der bisherige „definierte Ausgangszustand" umfasste `profiles` und
   * `account_deletion_tokens`, aber nicht den Zaehler — er war also
   * definiert fuer alles ausser der einen Zeile, die den Lauf kippte.
   */
  async function ratelimitZuruecksetzen() {
    // Fehler werden bewusst geschluckt: laeuft die Suite gegen eine
    // Shadow-DB ohne Migration 20260922030000, gibt es die Tabelle nicht —
    // dann greift auch der Limiter nicht und es ist nichts zurueckzusetzen.
    await service.from('api_rate_limits').delete().eq('key', `user-delete:${KUNDE_A_ID}`)
  }

  async function profileRow() {
    const { data, error } = await service
      .from('profiles')
      .select('id, deleted_at')
      .eq('id', KUNDE_A_ID)
      .single()
    expect(error).toBeNull()
    return data
  }

  async function tokenRow() {
    const { data, error } = await service
      .from('account_deletion_tokens')
      .select('user_id, token, expires_at, confirmed_at')
      .eq('user_id', KUNDE_A_ID)
      .maybeSingle()
    expect(error).toBeNull()
    return data
  }

  async function visibleToOtherUser(): Promise<number> {
    const { createClient } = await import('@supabase/supabase-js')
    const other = createClient(SHADOW_URL!, SHADOW_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { error: signInError } = await other.auth.signInWithPassword({
      email: KUNDE_B_EMAIL,
      password: TEST_PASSWORD,
    })
    expect(signInError).toBeNull()
    const { data, error } = await other.from('profiles').select('id').eq('id', KUNDE_A_ID)
    expect(error).toBeNull()
    return (data ?? []).length
  }

  it('1. DELETE ohne Session → 401', async () => {
    loggedOut()
    const { DELETE } = await import('@/app/api/user/delete/route')
    const res = await DELETE(deleteRequest({ password: TEST_PASSWORD }))
    expect(res.status).toBe(401)
  })

  it('2. DELETE mit falschem Passwort → 401, deleted_at bleibt NULL', async () => {
    loggedInAs(KUNDE_A_ID, KUNDE_A_EMAIL)
    const { DELETE } = await import('@/app/api/user/delete/route')
    const res = await DELETE(deleteRequest({ password: 'Falsch123!' }))
    expect(res.status).toBe(401)
    expect((await profileRow()).deleted_at).toBeNull()
  })

  it('3. Baseline: anderer angemeldeter Nutzer sieht das Profil (1 Zeile)', async () => {
    expect(await visibleToOtherUser()).toBe(1)
  })

  it('4. DELETE mit korrektem Passwort → 200, deleted_at gesetzt, Token angelegt, Mail + signOut', async () => {
    loggedInAs(KUNDE_A_ID, KUNDE_A_EMAIL)
    const { DELETE } = await import('@/app/api/user/delete/route')
    const res = await DELETE(deleteRequest({ password: TEST_PASSWORD }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
    expect(json.grace_days).toBe(60)

    const profile = await profileRow()
    expect(profile.deleted_at).not.toBeNull()

    const tok = await tokenRow()
    expect(tok).not.toBeNull()
    expect(tok!.token).toMatch(/^[0-9a-f]{64}$/)
    expect(tok!.confirmed_at).toBeNull()
    const daysUntilExpiry =
      (new Date(tok!.expires_at).getTime() - Date.now()) / (24 * 60 * 60 * 1000)
    expect(daysUntilExpiry).toBeGreaterThan(59)
    expect(daysUntilExpiry).toBeLessThan(61)

    expect(mockSendDeletionMail).toHaveBeenCalled()
    expect(lastMailedToken()).toBe(tok!.token)
    expect(mockSignOut).toHaveBeenCalled()
  })

  it('5. Nach Soft-Delete: Profil für andere Nutzer und anon unsichtbar (RLS)', async () => {
    expect(await visibleToOtherUser()).toBe(0)

    const { createClient } = await import('@supabase/supabase-js')
    const anon = createClient(SHADOW_URL!, SHADOW_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data } = await anon.from('profiles').select('id').eq('id', KUNDE_A_ID)
    expect(data ?? []).toEqual([])
  })

  it('6. Zweiter DELETE (idempotent) → 200, Token wird regeneriert', async () => {
    const before = await tokenRow()
    loggedInAs(KUNDE_A_ID, KUNDE_A_EMAIL)
    const { DELETE } = await import('@/app/api/user/delete/route')
    const res = await DELETE(deleteRequest({ password: TEST_PASSWORD }))
    expect(res.status).toBe(200)
    const after = await tokenRow()
    expect(after!.token).not.toBe(before!.token)
    expect((await profileRow()).deleted_at).not.toBeNull()
  })

  it('7. Undo mit unbekanntem Token → redirect undo_error=token_not_found, deleted_at bleibt', async () => {
    const { GET } = await import('@/app/api/user/delete/undo/route')
    const res = await GET(undoRequest('deadbeef'.repeat(8)))
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toContain('undo_error=token_not_found')
    expect((await profileRow()).deleted_at).not.toBeNull()
  })

  it('8. Undo mit gültigem Token → redirect reactivated=1, deleted_at NULL, Token verbrannt', async () => {
    const token = lastMailedToken()
    const { GET } = await import('@/app/api/user/delete/undo/route')
    const res = await GET(undoRequest(token))
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toContain('reactivated=1')

    expect((await profileRow()).deleted_at).toBeNull()
    const tok = await tokenRow()
    expect(tok!.confirmed_at).not.toBeNull()
  })

  it('9. Nach Undo: Profil wieder für andere Nutzer sichtbar', async () => {
    expect(await visibleToOtherUser()).toBe(1)
  })

  it('10. Undo mit verbranntem Token → redirect undo_error=already_used', async () => {
    const token = lastMailedToken()
    const { GET } = await import('@/app/api/user/delete/undo/route')
    const res = await GET(undoRequest(token))
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toContain('undo_error=already_used')
    // Reaktivierung bleibt bestehen — der verbrauchte Token schadet nicht
    expect((await profileRow()).deleted_at).toBeNull()
  })

  it('11. Engel-Rolle: soft-deleted Engel verschwindet auch aus profiles_select_engels', async () => {
    // Regression für 20260803000000: profiles_select_engels (Marktplatz-
    // Discovery) zeigte Engel-Profile unabhängig von deleted_at —
    // permissive Policies sind OR-verknüpft, die Lücke umging den
    // "Anyone can view public profiles"-Filter.
    //
    // Rollenwechsel laufen als eingeloggter Admin: der Role-Guard-
    // Trigger (20260101000100) blockiert Rollen-Updates mit JWT-
    // Claims, wenn der Aufrufer kein Admin ist — das gilt auch für
    // service_role via PostgREST (Claims vorhanden, auth.uid() NULL).
    const { createClient } = await import('@supabase/supabase-js')
    const adminSession = createClient(SHADOW_URL!, SHADOW_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { error: adminSignIn } = await adminSession.auth.signInWithPassword({
      email: 'admin-b@shadow.test',
      password: TEST_PASSWORD,
    })
    expect(adminSignIn).toBeNull()

    const setProfile = async (values: Record<string, unknown>) => {
      const { error } = await adminSession
        .from('profiles')
        .update(values)
        .eq('id', KUNDE_A_ID)
      expect(error).toBeNull()
    }

    try {
      // aktiver Engel ist sichtbar (Discovery funktioniert)
      await setProfile({ role: 'engel', deleted_at: null })
      expect(await visibleToOtherUser()).toBe(1)
      // soft-deleted Engel verschwindet trotz profiles_select_engels
      await setProfile({ deleted_at: new Date().toISOString() })
      expect(await visibleToOtherUser()).toBe(0)
    } finally {
      await setProfile({ role: 'kunde', deleted_at: null })
    }
  })
})
