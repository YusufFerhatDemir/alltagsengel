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
 * NEU SEIT BLOCK 95: woran diese eine Fail-open-Richtung haengt, hat sich
 * geaendert. Bis hierhin las das Modul NUR `getAuthenticatorAssuranceLevel()`
 * und schloss aus `nextLevel !== 'aal2'` auf „kein Faktor eingerichtet" —
 * eine gescheiterte oder leere Abfrage sah damit genauso aus wie ein Konto
 * ohne Faktor, und der Riegel liess durch. Jetzt sagt die Faktorliste aus
 * der Benutzerantwort, ob ein Faktor existiert; das Sitzungsniveau ist die
 * zweite, unabhaengige Haelfte. Fuer ein Konto MIT Faktor ist ein Ausfall
 * der Niveau-Abfrage deshalb GESPERRT. Die Tests unten halten beide
 * Richtungen getrennt fest.
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

const FAKTOR_BESTAETIGT = { id: 'f-1', factor_type: 'totp', status: 'verified' }
const FAKTOR_ANGEFANGEN = { id: 'f-2', factor_type: 'totp', status: 'unverified' }

/** Benutzerantwort mit Faktorliste — so liefert sie `auth.getUser()`. */
function benutzer(factors: unknown[] = [FAKTOR_BESTAETIGT]) {
  return { data: { user: { id: USER, factors } } }
}

/** Standardlage: angemeldeter Admin, MFA eingerichtet und verifiziert, Org gesetzt. */
function lageOk() {
  getUserMock.mockResolvedValue(benutzer())
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

  it('blockt ihn auch dann, wenn nextLevel gar nichts sagt', async () => {
    // Der Kern des Befundes: `nextLevel` wird aus der Faktorliste IN DER
    // SITZUNG abgeleitet. Ein Sitzungs-Cookie, das aelter ist als die
    // Einrichtung des Faktors, traegt sie nicht — `nextLevel` blieb dann
    // 'aal1', und der alte Riegel las daraus „kein Faktor" und liess
    // durch. Die Faktorliste aus der Benutzerantwort weiss es besser.
    aalMock.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal1' } })
    expect(await status(await requireAdmin())).toBe(403)
  })

  it('laesst einen Admin OHNE eingerichteten Faktor durch (bewusst fail-open)', async () => {
    // Wuerde hier geblockt, kaeme niemand mehr an die Einrichtung heran.
    getUserMock.mockResolvedValue(benutzer([]))
    aalMock.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal1' } })
    expect((await requireAdmin()).ok).toBe(true)
  })

  it('zaehlt eine angefangene, nie bestaetigte Einrichtung NICHT als Faktor', async () => {
    // Sonst sperrt der erste abgebrochene Einrichtungsversuch das Konto
    // aus — und zwar genau aus der Seite, auf der man ihn beenden wuerde.
    getUserMock.mockResolvedValue(benutzer([FAKTOR_ANGEFANGEN]))
    aalMock.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal1' } })
    expect((await requireAdmin()).ok).toBe(true)
  })

  it('laesst OHNE Faktor durch, auch wenn die AAL-Abfrage scheitert', async () => {
    getUserMock.mockResolvedValue(benutzer([]))
    aalMock.mockRejectedValue(new Error('Supabase nicht erreichbar'))
    expect((await requireAdmin()).ok).toBe(true)
  })

  it('fragt OHNE Faktor das Niveau gar nicht erst ab', async () => {
    // Was nichts entscheiden kann, soll auch nicht scheitern koennen.
    getUserMock.mockResolvedValue(benutzer([]))
    await requireAdmin()
    expect(aalMock).not.toHaveBeenCalled()
  })

  it('BLOCKT MIT Faktor, wenn die AAL-Abfrage scheitert', async () => {
    // Bis Block 95 war das die Luecke: ein Ausfall der einen Abfrage sah
    // aus wie „kein Faktor eingerichtet", und ein gestohlenes Passwort
    // kam an den Kassenweg.
    aalMock.mockRejectedValue(new Error('Supabase nicht erreichbar'))
    const r = await requireAdmin()
    expect(await status(r)).toBe(403)
    expect(await fehlertext(r)).toMatch(/Zweiter Faktor/)
  })

  it('BLOCKT MIT Faktor, wenn die AAL-Abfrage einen Fehler meldet', async () => {
    // PostgREST wirft nicht — und die Auth-Schicht auch nicht. Ein
    // verworfenes `error` sah genauso aus wie „alles in Ordnung".
    aalMock.mockResolvedValue({ data: null, error: { message: 'session missing' } })
    expect(await status(await requireAdmin())).toBe(403)
  })

  it('BLOCKT MIT Faktor, wenn die AAL-Abfrage nichts liefert', async () => {
    aalMock.mockResolvedValue({ data: null })
    expect(await status(await requireAdmin())).toBe(403)
  })

  it('BLOCKT MIT Faktor, wenn ein Fehler NEBEN einem alten Wert steht', async () => {
    // Die haesslichste Form: `error` gesetzt UND `data` gefuellt. Wer nur
    // `data` zerlegt, liest hier 'aal2' und laesst durch — obwohl die
    // Abfrage gerade gesagt hat, dass sie nichts feststellen konnte.
    aalMock.mockResolvedValue({
      data: { currentLevel: 'aal2', nextLevel: 'aal2' },
      error: { message: 'session missing' },
    })
    expect(await status(await requireAdmin())).toBe(403)
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
