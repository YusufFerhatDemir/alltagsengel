/**
 * Zugangsschranke der Abrechnungs-Routen
 * ═══════════════════════════════════════════════════════════════════════
 *
 * `lib/abrechnung/require-admin.ts` steht vor rund fuenfundzwanzig Routen:
 * DTA-Versand, Zugangsdaten, Zertifikate, SFTP-Schluessel, Betriebsmodus,
 * Wiedervorlagen, Dead Letter, Pilotsteuerung. Es ist die einzige Stelle,
 * an der entschieden wird, wer den Kassenweg bedienen darf — und hatte
 * bis hierhin keinen Test.
 *
 * Geprueft werden die vier Entscheidungen, die das Modul trifft:
 *   1. Gibt es ueberhaupt eine Sitzung?            → 401
 *   2. Traegt die Rolle die verlangte Berechtigung? → 403
 *   3. Ist der zweite Faktor verifiziert?           → 403
 *   4. Ist eine Organisation ausgewaehlt?           → 403
 *
 * Punkt 3 ist bewusst FAIL-OPEN, wenn kein Faktor eingerichtet ist —
 * sonst sperrt die Pruefung Admins aus, bevor sie MFA einrichten koennen.
 * Genau diese Absicht wird hier festgehalten, damit ein spaeterer
 * "Haertungs"-Umbau nicht versehentlich alle aussperrt.
 *
 * Punkt 4 haengt an getActiveOrgId() und NICHT an profiles: die Tabelle
 * hat keine organization_id. Ein Guard, der sie dort selektiert, liefert
 * still 403 — der Test unten haelt fest, dass hier die richtige Quelle
 * befragt wird.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Aussenschnittstellen ────────────────────────────────────────────
const getUserMock = vi.fn()
const aalMock = vi.fn()
const profileMock = vi.fn()
const getActiveOrgIdMock = vi.fn()

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
          // maybeSingle zusaetzlich zu single: holeRollenQuellen() liest die
          // profiles-Zeile mit maybeSingle() — eine fehlende Zeile ist ein
          // regulaerer Fall („keine Rolle"), kein Fehler.
          eq: () => ({ single: () => profileMock(), maybeSingle: () => profileMock() }),
        }),
      }
    },
  }),
}))

vi.mock('@/lib/organizations/server', () => ({
  getActiveOrgId: () => getActiveOrgIdMock(),
}))

import { requireAdmin, requireAdminMitOrg } from '@/lib/abrechnung/require-admin'

const USER = '00000000-0000-4000-8000-00000000a001'
const ORG = '00000000-0000-4000-8000-00000000b001'

/** Standardlage: angemeldeter Admin, MFA eingerichtet und verifiziert, Org gesetzt. */
function lageOk() {
  getUserMock.mockResolvedValue({ data: { user: { id: USER } } })
  profileMock.mockResolvedValue({ data: { role: 'admin' } })
  aalMock.mockResolvedValue({ data: { currentLevel: 'aal2', nextLevel: 'aal2' } })
  getActiveOrgIdMock.mockResolvedValue(ORG)
}

async function status(r: { ok: boolean; response?: Response }): Promise<number | null> {
  return r.ok ? null : (r as { response: Response }).response.status
}

async function fehlertext(r: { ok: boolean; response?: Response }): Promise<string> {
  const body = await (r as { response: Response }).response.json()
  return String(body.error ?? '')
}

beforeEach(() => {
  getUserMock.mockReset()
  profileMock.mockReset()
  aalMock.mockReset()
  getActiveOrgIdMock.mockReset()
  lageOk()
})

// ═══════════════════════════════════════════════════════════════════
describe('requireAdmin — Sitzung', () => {
  it('laesst den angemeldeten Admin durch', async () => {
    expect(await requireAdmin()).toEqual({ ok: true })
  })

  it('weist ohne Sitzung mit 401 ab', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const r = await requireAdmin()
    expect(await status(r)).toBe(401)
    // 401, nicht 403: der Unterschied ist „melde dich an" gegen
    // „du darfst das nicht" — die Oberflaeche haengt daran, ob sie zum
    // Login schickt oder eine Fehlermeldung zeigt.
    expect(await fehlertext(r)).toMatch(/Nicht autorisiert/)
  })

  it('weist ohne Profilzeile mit 403 ab', async () => {
    profileMock.mockResolvedValue({ data: null })
    expect(await status(await requireAdmin())).toBe(403)
  })
})

// ═══════════════════════════════════════════════════════════════════
describe('requireAdmin — Berechtigung statt Rolle', () => {
  it('prueft standardmaessig abrechnung.lesen', async () => {
    // pdl darf die Abrechnung LESEN, aber nicht schreiben.
    profileMock.mockResolvedValue({ data: { role: 'pdl' } })
    expect((await requireAdmin()).ok).toBe(true)
    expect(await status(await requireAdmin('abrechnung.schreiben'))).toBe(403)
  })

  it('laesst die Buchhaltung schreiben', async () => {
    profileMock.mockResolvedValue({ data: { role: 'buchhaltung' } })
    expect((await requireAdmin('abrechnung.schreiben')).ok).toBe(true)
  })

  it('sperrt die Buchhaltung aus der Systemverwaltung aus', async () => {
    // Zugangsdaten, Zertifikate und SFTP-Schluessel haengen an
    // 'system.verwalten'. Wer buchen darf, darf deshalb noch lange
    // nicht die Zugangsdaten zur Datenannahmestelle austauschen.
    profileMock.mockResolvedValue({ data: { role: 'buchhaltung' } })
    expect(await status(await requireAdmin('system.verwalten'))).toBe(403)
  })

  it('sperrt Rollen ohne Verwaltungsrechte vollstaendig aus', async () => {
    for (const rolle of ['engel', 'fahrer', 'kunde', 'angehoerige']) {
      profileMock.mockResolvedValue({ data: { role: rolle } })
      expect(await status(await requireAdmin())).toBe(403)
    }
  })

  it('sperrt eine unbekannte Rolle aus', async () => {
    // Fail-closed: ein Rollenname, den die Matrix nicht kennt (Tippfehler,
    // Altbestand, per Hand gesetzt), darf nicht als Vollzugriff gelten.
    profileMock.mockResolvedValue({ data: { role: 'chefarzt' } })
    expect(await status(await requireAdmin())).toBe(403)
  })

  it('sperrt eine leere Rolle aus', async () => {
    profileMock.mockResolvedValue({ data: { role: null } })
    expect(await status(await requireAdmin())).toBe(403)
  })
})

// ═══════════════════════════════════════════════════════════════════
describe('requireAdmin — zweiter Faktor', () => {
  it('blockt einen Admin mit Faktor, der nicht auf AAL2 steht', async () => {
    aalMock.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal2' } })
    const r = await requireAdmin()
    expect(await status(r)).toBe(403)
    expect(await fehlertext(r)).toMatch(/Zweiter Faktor/)
  })

  it('laesst einen Admin OHNE eingerichteten Faktor durch (bewusst fail-open)', async () => {
    // nextLevel bleibt auf aal1, solange kein Faktor eingerichtet ist.
    // Wuerde hier geblockt, kaeme niemand mehr an die Einrichtung heran.
    aalMock.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal1' } })
    expect((await requireAdmin()).ok).toBe(true)
  })

  it('laesst durch, wenn die AAL-Abfrage selbst scheitert', async () => {
    aalMock.mockRejectedValue(new Error('Supabase nicht erreichbar'))
    expect((await requireAdmin()).ok).toBe(true)
  })

  it('laesst durch, wenn die AAL-Abfrage nichts liefert', async () => {
    aalMock.mockResolvedValue({ data: null })
    expect((await requireAdmin()).ok).toBe(true)
  })

  it('prueft den Faktor ERST nach der Berechtigung', async () => {
    // Reihenfolge ist keine Kosmetik: wer gar keine Berechtigung hat,
    // soll 403 „fehlende Berechtigung" bekommen und nicht den Hinweis,
    // er solle sich mit zweitem Faktor neu anmelden — das schickt ihn
    // sonst in eine Schleife, die sein Problem nie loest.
    profileMock.mockResolvedValue({ data: { role: 'engel' } })
    aalMock.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal2' } })
    expect(await fehlertext(await requireAdmin())).toMatch(/Berechtigung/)
  })
})

// ═══════════════════════════════════════════════════════════════════
describe('requireAdminMitOrg', () => {
  it('liefert Nutzer und Organisation', async () => {
    expect(await requireAdminMitOrg()).toEqual({
      ok: true, userId: USER, organizationId: ORG,
    })
  })

  it('weist ohne aktive Organisation mit 403 ab', async () => {
    getActiveOrgIdMock.mockResolvedValue(null)
    const r = await requireAdminMitOrg()
    expect(await status(r)).toBe(403)
    expect(await fehlertext(r)).toMatch(/Keine Organisation/)
  })

  it('fragt die Organisation NICHT bei profiles ab', async () => {
    // profiles hat keine organization_id. Ein Guard, der sie dort sucht,
    // bekommt 42703 und liefert still 403 — die Route sieht dann aus wie
    // ein Berechtigungsproblem. Die Quelle ist das Mitgliedschafts-
    // Mapping hinter getActiveOrgId().
    await requireAdminMitOrg()
    expect(getActiveOrgIdMock).toHaveBeenCalledTimes(1)
  })

  it('fragt die Organisation erst nach Berechtigung und Faktor ab', async () => {
    // Eine fehlende Berechtigung darf nicht damit beantwortet werden,
    // dass keine Organisation gewaehlt sei — das schickt den Nutzer in
    // den Org-Umschalter statt zum Berechtigungsproblem.
    profileMock.mockResolvedValue({ data: { role: 'engel' } })
    const r = await requireAdminMitOrg()
    expect(await fehlertext(r)).toMatch(/Berechtigung/)
    expect(getActiveOrgIdMock).not.toHaveBeenCalled()
  })

  it('weist ohne Sitzung mit 401 ab, ohne die Organisation zu suchen', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    expect(await status(await requireAdminMitOrg())).toBe(401)
    expect(getActiveOrgIdMock).not.toHaveBeenCalled()
  })

  it('blockt auch hier den fehlenden zweiten Faktor', async () => {
    aalMock.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal2' } })
    const r = await requireAdminMitOrg()
    expect(await status(r)).toBe(403)
    expect(await fehlertext(r)).toMatch(/Zweiter Faktor/)
    expect(getActiveOrgIdMock).not.toHaveBeenCalled()
  })
})
