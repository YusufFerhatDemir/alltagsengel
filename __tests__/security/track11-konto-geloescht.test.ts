// ═══════════════════════════════════════════════════════════════════════
// Track 11 — Ein zur Löschung vorgemerktes Konto ist gesperrt
// ═══════════════════════════════════════════════════════════════════════
//
// BEFUND: `DELETE /api/user/delete` setzt `profiles.deleted_at`, meldet
// „Konto wurde deaktiviert" und meldet die Sitzung ab. Danach fragte
// KEINE Stelle des Anmeldewegs diese Spalte je wieder ab — und die
// Datenbank ebenfalls nicht: `profiles_select_own USING (auth.uid() = id)`
// trägt keinen `deleted_at`-Filter, `auth.users` bleibt unangetastet, das
// Passwort gilt weiter. Wer sich erneut anmeldete, arbeitete im Konto
// weiter, als sei nichts geschehen — während im Hintergrund die
// 60-Tage-Frist bis zur endgültigen Löschung lief.
//
// Die Tests hier halten die neue Regel fest, und zwar an JEDER der vier
// Stellen, die die Rolle aus `profiles` beziehen. Die Gegenproben führen
// den alten Zustand nach: ohne `deleted_at` muss dieselbe Person
// unverändert durchkommen — sonst hätte die Sperre schlicht alle
// ausgesperrt und wäre kein Beweis.
// ═══════════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  KONTO_GELOESCHT_CODE,
  KONTO_GELOESCHT_TEXT,
  istZurLoeschungVorgemerkt,
} from '@/lib/auth/konto-status'
import {
  holeRollenQuellen,
  holeRollenQuellenFuer,
  quellenDuerfen,
  quellenSindAdministration,
} from '@/lib/auth/rollen-quelle'
import type { SupabaseClient } from '@supabase/supabase-js'

const USER_ID = 'eeeeeeee-0000-4000-8000-000000000001'

interface StubProtokoll {
  spalten: string[]
}

/**
 * Minimaler Supabase-Stub für die Rollenermittlung.
 *
 * Er zeichnet die Spaltenliste auf: die Prüfung „steht `deleted_at`
 * überhaupt im select()" ist Teil des Befunds — ohne die Spalte kann die
 * Regel gar nicht greifen, egal wie sie geschrieben ist.
 */
function stub(
  profil: Record<string, unknown> | null,
  user: { id: string; app_metadata?: Record<string, unknown> } | null = { id: USER_ID },
): { client: SupabaseClient; protokoll: StubProtokoll } {
  const protokoll: StubProtokoll = { spalten: [] }
  const client = {
    auth: {
      getUser: async () => ({ data: { user }, error: user ? null : { message: 'kein Nutzer' } }),
    },
    from: () => ({
      select: (spalten: string) => {
        protokoll.spalten.push(spalten)
        return {
          eq: () => ({
            maybeSingle: async () => ({ data: profil, error: null }),
          }),
        }
      },
    }),
  } as unknown as SupabaseClient
  return { client, protokoll }
}

// ════════════════════════════════════════════════════════════════════
describe('Track 11 — die Regel selbst (lib/auth/konto-status.ts)', () => {
  it('ein Profil ohne deleted_at ist aktiv', () => {
    expect(istZurLoeschungVorgemerkt({ deleted_at: null })).toBe(false)
    expect(istZurLoeschungVorgemerkt({})).toBe(false)
    expect(istZurLoeschungVorgemerkt({ deleted_at: undefined })).toBe(false)
    expect(istZurLoeschungVorgemerkt({ deleted_at: '   ' })).toBe(false)
  })

  it('ein gesetzter Zeitstempel heißt: vorgemerkt', () => {
    expect(istZurLoeschungVorgemerkt({ deleted_at: '2026-08-01T10:00:00.000Z' })).toBe(true)
  })

  it('FAIL-CLOSED: auch ein unlesbarer Wert heißt vorgemerkt', () => {
    // Ein `new Date(...)`-Vergleich läge hier bei NaN und fiele
    // stillschweigend auf „aktiv" — also genau dort offen, wo etwas
    // nicht stimmt.
    expect(istZurLoeschungVorgemerkt({ deleted_at: 'kaputt' })).toBe(true)
    expect(istZurLoeschungVorgemerkt({ deleted_at: 0 })).toBe(true)
    expect(istZurLoeschungVorgemerkt({ deleted_at: false })).toBe(true)
  })

  it('kein Profil ist keine Vormerkung (das behandeln die Guards eigenständig)', () => {
    expect(istZurLoeschungVorgemerkt(null)).toBe(false)
    expect(istZurLoeschungVorgemerkt(undefined)).toBe(false)
  })

  it('die Vormerkung wird NICHT gegen die 60-Tage-Frist gerechnet', () => {
    // Gesperrt ist das Konto ab dem Vormerken, nicht erst ab Fristablauf.
    const geradeEben = new Date().toISOString()
    expect(istZurLoeschungVorgemerkt({ deleted_at: geradeEben })).toBe(true)
  })
})

// ════════════════════════════════════════════════════════════════════
describe('Track 11 — Rollenquelle (50 Routen hängen daran)', () => {
  it('liest deleted_at überhaupt mit', async () => {
    const { client, protokoll } = stub({ role: 'kunde', first_name: 'A', last_name: 'B', deleted_at: null })
    await holeRollenQuellenFuer(client, { id: USER_ID })
    expect(protokoll.spalten.join(' ')).toContain('deleted_at')
  })

  it('ein vorgemerktes Konto trägt keine profilRolle mehr', async () => {
    const { client } = stub({ role: 'admin', first_name: 'A', last_name: 'B', deleted_at: '2026-08-01T00:00:00Z' })
    const quellen = await holeRollenQuellenFuer(client, { id: USER_ID, app_metadata: { role: 'admin' } })

    expect(quellen.zurLoeschungVorgemerkt).toBe(true)
    expect(quellen.profilRolle).toBe('')
    // Und damit ein klares Nein auf jede Berechtigungsfrage — auch wenn
    // app_metadata weiterhin 'admin' sagt.
    expect(quellenDuerfen(quellen, 'stammdaten.lesen')).toBe(false)
    expect(quellenSindAdministration(quellen)).toBe(false)
  })

  it('GEGENPROBE: ohne deleted_at kommt dieselbe Person unverändert durch', async () => {
    const { client } = stub({ role: 'admin', first_name: 'A', last_name: 'B', deleted_at: null })
    const quellen = await holeRollenQuellenFuer(client, { id: USER_ID, app_metadata: { role: 'admin' } })

    expect(quellen.zurLoeschungVorgemerkt).toBe(false)
    expect(quellen.profilRolle).toBe('admin')
    expect(quellenDuerfen(quellen, 'stammdaten.lesen')).toBe(true)
    expect(quellenSindAdministration(quellen)).toBe(true)
  })

  it('holeRollenQuellen() antwortet mit null — die Sitzung trägt keinen Zugang mehr', async () => {
    const { client } = stub({ role: 'engel', first_name: 'A', last_name: 'B', deleted_at: '2026-08-01T00:00:00Z' })
    expect(await holeRollenQuellen(client)).toBeNull()
  })

  it('GEGENPROBE: holeRollenQuellen() liefert dasselbe Konto ohne Vormerkung aus', async () => {
    const { client } = stub({ role: 'engel', first_name: 'A', last_name: 'B', deleted_at: null })
    const quellen = await holeRollenQuellen(client)
    expect(quellen?.profilRolle).toBe('engel')
  })
})

// ════════════════════════════════════════════════════════════════════
describe('Track 11 — lib/auth/guard.ts', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  async function ladeGuard(profil: Record<string, unknown> | null) {
    vi.doMock('@/lib/supabase/server', () => ({
      createClient: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: USER_ID, app_metadata: {} } } }) },
        from: () => ({
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: profil, error: null }) }) }),
        }),
      }),
    }))
    vi.doMock('@/lib/organizations/server', () => ({
      getActiveOrgId: async () => 'org-1',
    }))
    return import('@/lib/auth/guard')
  }

  it('holeRolle() gibt für ein vorgemerktes Konto null zurück', async () => {
    const { holeRolle } = await ladeGuard({
      role: 'admin', first_name: 'A', last_name: 'B', deleted_at: '2026-08-01T00:00:00Z',
    })
    expect(await holeRolle()).toBeNull()
  })

  it('requireBerechtigung() antwortet dann mit 401', async () => {
    const { requireBerechtigung } = await ladeGuard({
      role: 'admin', first_name: 'A', last_name: 'B', deleted_at: '2026-08-01T00:00:00Z',
    })
    const ergebnis = await requireBerechtigung('stammdaten.lesen', { ohneMfa: true })
    expect(ergebnis.ok).toBe(false)
    if (!ergebnis.ok) expect(ergebnis.response.status).toBe(401)
  })

  it('GEGENPROBE: ohne deleted_at lässt derselbe Guard durch', async () => {
    const { requireBerechtigung } = await ladeGuard({
      role: 'admin', first_name: 'A', last_name: 'B', deleted_at: null,
    })
    const ergebnis = await requireBerechtigung('stammdaten.lesen', { ohneMfa: true })
    expect(ergebnis.ok).toBe(true)
  })
})

// ════════════════════════════════════════════════════════════════════
describe('Track 11 — Angehörigenportal', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  async function ladePortal(profil: Record<string, unknown> | null) {
    vi.doMock('@/lib/supabase/server', () => ({
      createClient: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: USER_ID } }, error: null }) },
        from: (tabelle: string) => ({
          select: () => ({
            eq: () => ({
              single: async () => ({ data: profil, error: null }),
              eq: () => ({
                eq: async () => ({
                  data: tabelle === 'angehoerigen_zugaenge'
                    ? [{
                        id: 'z1', client_id: 'c1', user_id: USER_ID, organization_id: 'org-1',
                        status: 'aktiv', freigegebene_bereiche: ['termine'],
                        pflegeberichte_freigegeben: false, gueltig_bis: null,
                      }]
                    : [],
                  error: null,
                }),
              }),
            }),
          }),
        }),
      }),
    }))
    vi.doMock('@/lib/organizations/server', () => ({ resolveUserOrgId: async () => 'org-1' }))
    return import('@/lib/angehoerige/portal-helpers')
  }

  it('sperrt ein vorgemerktes Konto — trotz gültiger Rolle und aktivem Zugang', async () => {
    // Ohne diese Prüfung sähe ein zur Löschung vorgemerktes Konto weiter
    // Gesundheitsdaten Dritter ein.
    const { requirePortalAccess } = await ladePortal({
      role: 'angehoerige', deleted_at: '2026-08-01T00:00:00Z',
    })
    const ergebnis = await requirePortalAccess()
    expect(ergebnis.ok).toBe(false)
    if (!ergebnis.ok) {
      expect(ergebnis.response.status).toBe(403)
      expect(await ergebnis.response.json()).toEqual({ error: KONTO_GELOESCHT_TEXT })
    }
  })

  it('GEGENPROBE: dasselbe Konto ohne Vormerkung bekommt seinen Zugang', async () => {
    const { requirePortalAccess } = await ladePortal({ role: 'angehoerige', deleted_at: null })
    const ergebnis = await requirePortalAccess()
    expect(ergebnis.ok).toBe(true)
  })
})

// ════════════════════════════════════════════════════════════════════
describe('Track 11 — proxy.ts hält die Oberfläche zu', () => {
  const quelle = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '..', '..', 'proxy.ts'), 'utf-8') as string

  it('liest deleted_at aus profiles mit', () => {
    expect(quelle).toMatch(/\.select\('role, deleted_at'\)/)
  })

  it('leitet mit einem eigenen Grund zur Anmeldung um', () => {
    expect(quelle).toContain('KONTO_GELOESCHT_CODE')
    expect(KONTO_GELOESCHT_CODE).toBe('konto_geloescht')
  })

  it('die Anmeldeseite erklärt diesen Grund, statt nur „Zugriff verweigert" zu zeigen', () => {
    const seite = require('node:fs').readFileSync(
      require('node:path').join(__dirname, '..', '..', 'app', 'auth', 'login', 'page.tsx'), 'utf-8') as string
    expect(seite).toContain('KONTO_GELOESCHT_CODE')
    expect(seite).toContain('KONTO_GELOESCHT_TEXT')
  })
})
