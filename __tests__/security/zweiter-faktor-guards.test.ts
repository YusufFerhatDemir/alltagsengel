/**
 * Der zweite Faktor an den beiden uebrigen Toren
 * ═══════════════════════════════════════════════════════════════════════
 *
 * BEFUND (Block 95) — Begruendung siehe
 * __tests__/security/zweiter-faktor-riegel.test.ts.
 *
 * `lib/abrechnung/require-admin.ts` hat einen eigenen Test. Die beiden
 * anderen Tore, die bis Block 95 dieselbe Ableitung trugen, hatten
 * keinen:
 *
 *   `lib/auth/guard.ts`      — requireBerechtigung / requireAdministration,
 *                              also jede Route mit Berechtigungsanspruch
 *   `lib/ops/api-auth.ts`    — requireOpsAdmin, der gesamte Betriebssystem-
 *                              Bereich
 *
 * Ohne Test hier waere der Umbau an beiden Stellen nur per Quelltextlesung
 * belegt — und eine Quelltextsuche ist kein Test (siehe die gleichnamige
 * Notiz im Gedaechtnis).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const getUserMock = vi.fn()
const aalMock = vi.fn()
const profileMock = vi.fn()
const getActiveOrgIdMock = vi.fn()
const resolveUserOrgIdMock = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: () => getUserMock(),
      mfa: { getAuthenticatorAssuranceLevel: () => aalMock() },
    },
    from: (tabelle: string) => {
      if (tabelle !== 'profiles') throw new Error(`Unerwartete Tabelle: ${tabelle}`)
      return {
        select: () => ({
          eq: () => ({ single: () => profileMock(), maybeSingle: () => profileMock() }),
        }),
      }
    },
  }),
}))

vi.mock('@/lib/organizations/server', () => ({
  getActiveOrgId: () => getActiveOrgIdMock(),
  resolveUserOrgId: () => resolveUserOrgIdMock(),
}))

import { requireBerechtigung, requireAdministration } from '@/lib/auth/guard'
import { requireOpsAdmin } from '@/lib/ops/api-auth'

const USER = '00000000-0000-4000-8000-00000000a001'
const ORG = '00000000-0000-4000-8000-00000000b001'
const BESTAETIGT = { id: 'f-1', factor_type: 'totp', status: 'verified' }

function benutzer(factors: unknown[]) {
  return { data: { user: { id: USER, factors } } }
}

async function status(r: { ok: boolean; response?: Response }): Promise<number | null> {
  return r.ok ? null : (r as { response: Response }).response.status
}

async function fehlertext(r: { ok: boolean; response?: Response }): Promise<string> {
  return String((await (r as { response: Response }).response.json()).error ?? '')
}

beforeEach(() => {
  for (const m of [getUserMock, aalMock, profileMock, getActiveOrgIdMock, resolveUserOrgIdMock]) m.mockReset()
  getUserMock.mockResolvedValue(benutzer([BESTAETIGT]))
  profileMock.mockResolvedValue({ data: { role: 'superadmin' } })
  aalMock.mockResolvedValue({ data: { currentLevel: 'aal2', nextLevel: 'aal2' }, error: null })
  getActiveOrgIdMock.mockResolvedValue(ORG)
  resolveUserOrgIdMock.mockResolvedValue(ORG)
})

// Jedes Tor bekommt dieselben vier Fragen gestellt.
const TORE = [
  ['requireBerechtigung', () => requireBerechtigung('system.verwalten')],
  ['requireAdministration', () => requireAdministration()],
  ['requireOpsAdmin', () => requireOpsAdmin('system.verwalten')],
] as const

for (const [name, aufruf] of TORE) {
  describe(`${name} — zweiter Faktor`, () => {
    it('laesst eine erhobene Sitzung durch', async () => {
      expect((await aufruf()).ok).toBe(true)
    })

    it('sperrt ein Konto mit Faktor auf AAL1', async () => {
      aalMock.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal2' }, error: null })
      const r = await aufruf()
      expect(await status(r)).toBe(403)
      expect(await fehlertext(r)).toMatch(/Zweiter Faktor/)
    })

    it('sperrt auch dann, wenn nextLevel die Einrichtung nicht kennt', async () => {
      // Sitzungs-Cookie aelter als die Einrichtung des Faktors.
      aalMock.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal1' }, error: null })
      expect(await status(await aufruf())).toBe(403)
    })

    it('SPERRT, wenn die Niveau-Abfrage scheitert — der Befund', async () => {
      aalMock.mockRejectedValue(new Error('Auth nicht erreichbar'))
      expect(await status(await aufruf())).toBe(403)
    })

    it('SPERRT, wenn die Abfrage einen Fehler NEBEN einem alten Wert meldet', async () => {
      // Die haesslichste Form: `error` gesetzt UND `data` gefuellt. Wer nur
      // `data` zerlegt, liest hier 'aal2' und laesst durch.
      aalMock.mockResolvedValue({
        data: { currentLevel: 'aal2', nextLevel: 'aal2' },
        error: { message: 'session missing' },
      })
      expect(await status(await aufruf())).toBe(403)
    })

    it('laesst ein Konto OHNE Faktor durch und fragt das Niveau nicht ab', async () => {
      // Die eine gewollte Fail-open-Richtung: sonst kaeme niemand mehr an
      // /admin/mfa-einrichtung heran.
      getUserMock.mockResolvedValue(benutzer([]))
      aalMock.mockRejectedValue(new Error('Auth nicht erreichbar'))
      expect((await aufruf()).ok).toBe(true)
      expect(aalMock).not.toHaveBeenCalled()
    })
  })
}

describe('requireBerechtigung — die Ausnahme fuer die Einrichtungsseite', () => {
  it('ueberspringt den Faktor nur mit ohneMfa', async () => {
    aalMock.mockRejectedValue(new Error('Auth nicht erreichbar'))
    expect(await status(await requireBerechtigung('system.verwalten'))).toBe(403)
    expect((await requireBerechtigung('system.verwalten', { ohneMfa: true })).ok).toBe(true)
  })
})

describe('Reihenfolge: Berechtigung vor Faktor', () => {
  it('antwortet einer fehlenden Berechtigung nicht mit dem Faktor-Hinweis', async () => {
    // Sonst schickt die Meldung den Nutzer in eine Schleife, die sein
    // eigentliches Problem nie loest.
    profileMock.mockResolvedValue({ data: { role: 'engel' } })
    aalMock.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal2' }, error: null })
    for (const [, aufruf] of TORE) {
      expect(await fehlertext(await aufruf())).toMatch(/Berechtigung|Administratoren/)
    }
  })
})
