/**
 * DiPA / PflegeCoach — Zugangsschranke `lib/coach/api-auth.ts`
 * ═══════════════════════════════════════════════════════════════════════
 *
 * WARUM DIESE SUITE: `requireCoachUser()` steht vor 21 der 24 Routen unter
 * `app/api/coach/**` und ist die einzige Stelle, an der entschieden wird,
 * ob neue GESUNDHEITSDATEN entstehen dürfen. Sie hatte bis hierhin keinen
 * einzigen Test — geprüft waren nur die reinen Auswertungsmodule darunter
 * (`mfa.ts`, `consent.ts`, `freischaltung.ts`), also die Regeln, nicht ihre
 * DURCHSETZUNG. Genau dazwischen liegt der Fehler, den ein Modultest nicht
 * sieht: eine Regel, die stimmt, aber nicht abgefragt wird.
 *
 * Vier Entscheidungen werden hier festgehalten:
 *   1. Sitzung vorhanden?                       → sonst 401
 *   2. coach_users-Zeile vorhanden?              → sonst 403 NO_COACH_PROFILE
 *   3. Bei `schreibzugriff: true` zusätzlich
 *      MFA → Einwilligung → Freischaltung,
 *      in DIESER Reihenfolge, jede fail-closed.
 *   4. Ohne `schreibzugriff` wird NICHTS davon
 *      abgefragt — Lesen, Export (Art. 15/20),
 *      Löschung (Art. 17) und der Widerruf
 *      selbst müssen offen bleiben.
 *
 * Punkt 4 ist kein Nebenaspekt: Würde der Guard auch lesend sperren, wäre
 * der Widerruf der Einwilligung eine Falle — der Nutzer käme an seine
 * eigenen Daten nicht mehr heran (Art. 7 Abs. 3 DSGVO verlangt das
 * Gegenteil). Die Tests prüfen deshalb NEGATIV mit, dass die zusätzlichen
 * Abfragen im Lesefall gar nicht erst stattfinden.
 *
 * Punkt 3 ist die TR-03161-Durchsetzung: Im DiPA-Modus ist der zweite
 * Faktor Pflicht (O.Auth_3, über DiPAV §5 Abs. 2 Nr. 1 → §78a Abs. 7
 * SGB XI). Der letzte Block hält fest, dass der Modus-Schalter das
 * tatsächlich bis in die Route durchreicht und nicht nur in `mfa.ts`
 * richtig gerechnet wird.
 *
 * ACHTUNG SCHALTER: die Suite setzt COACH_DIPA_MODUS und
 * COACH_FREISCHALTUNG_PFLICHT. Beide werden in `beforeEach` zurückgesetzt —
 * `mfaPflicht()`/`freischaltungPflicht()` lesen process.env bei JEDEM
 * Aufruf, ein stehengebliebener Wert würde die Nachbartests verfälschen.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  COACH_DIPA_MODUS_ENV,
  COACH_FREISCHALTUNG_ENV,
} from '@/lib/coach/config'
import { MFA_EINRICHTUNG_CODE, MFA_ZWEITER_FAKTOR_CODE } from '@/lib/coach/mfa'
import { EINWILLIGUNG_FEHLT_CODE, FREISCHALTUNG_NOETIG_CODE } from '@/lib/coach/consent'

// ── Aussenschnittstellen ────────────────────────────────────────────
const getUserMock = vi.fn()
const aalMock = vi.fn()

/** Antworten je Tabelle; jeder Zugriff wird protokolliert. */
type TabellenAntwort = { data: unknown; error: unknown }
const antworten = new Map<string, TabellenAntwort>()
/** Tabelle → Filter, die der Prüfling gesetzt hat. */
const zugriffe: { tabelle: string; filter: Array<[string, unknown]> }[] = []

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: () => getUserMock(),
      mfa: { getAuthenticatorAssuranceLevel: () => aalMock() },
    },
    from: (tabelle: string) => {
      const eintrag = { tabelle, filter: [] as Array<[string, unknown]> }
      zugriffe.push(eintrag)
      const antwort = () =>
        antworten.get(tabelle) ?? { data: null, error: null }
      const kette: Record<string, unknown> = {}
      kette.select = () => kette
      kette.eq = (spalte: string, wert: unknown) => {
        eintrag.filter.push([spalte, wert])
        return kette
      }
      kette.maybeSingle = async () => antwort()
      kette.single = async () => antwort()
      // Listenabfrage (coach_consents, coach_freischaltungen) — thenable.
      kette.then = (auf: (v: unknown) => unknown, ab?: (e: unknown) => unknown) =>
        Promise.resolve(antwort()).then(auf, ab)
      return kette
    },
  }),
}))

import { requireCoachSession, requireCoachUser } from '@/lib/coach/api-auth'

const USER_ID = '00000000-0000-4000-8000-00000000c001'
const COACH_ID = '00000000-0000-4000-8000-00000000c002'

/** Nutzer mit optionalen MFA-Faktoren, wie die Auth-Schicht ihn liefert. */
function nutzer(faktoren: Array<{ id: string; status: string }> = []) {
  return { id: USER_ID, factors: faktoren }
}

/** Standardlage: angemeldet, Profil vorhanden, Einwilligung erteilt, kein MFA-Faktor. */
function lageOk() {
  getUserMock.mockResolvedValue({ data: { user: nutzer() }, error: null })
  aalMock.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal1' } })
  antworten.set('coach_users', { data: { id: COACH_ID, user_id: USER_ID }, error: null })
  antworten.set('coach_consents', {
    data: [{ consent_typ: 'gesundheitsdaten_art9', erteilt: true, widerrufen_am: null }],
    error: null,
  })
  antworten.set('coach_freischaltungen', { data: [], error: null })
}

function tabellen(): string[] {
  return zugriffe.map(z => z.tabelle)
}

async function status(ergebnis: Awaited<ReturnType<typeof requireCoachUser>>) {
  if (ergebnis.ok) throw new Error('Erwartet war eine Ablehnung, der Guard hat durchgelassen.')
  return { code: ergebnis.response.status, body: await ergebnis.response.json() }
}

beforeEach(() => {
  vi.clearAllMocks()
  antworten.clear()
  zugriffe.length = 0
  delete process.env[COACH_DIPA_MODUS_ENV]
  delete process.env[COACH_FREISCHALTUNG_ENV]
  lageOk()
})

afterEach(() => {
  delete process.env[COACH_DIPA_MODUS_ENV]
  delete process.env[COACH_FREISCHALTUNG_ENV]
})

// ═══════════════════════════════════════════════════════════════════
describe('requireCoachSession — nur die Sitzung', () => {
  it('lehnt ohne Sitzung mit 401 ab', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null })
    const ergebnis = await requireCoachSession()
    expect(ergebnis.ok).toBe(false)
    if (ergebnis.ok) return
    expect(ergebnis.response.status).toBe(401)
  })

  it('lehnt auch dann ab, wenn die Auth-Schicht einen Fehler UND einen Nutzer liefert', async () => {
    // Fail-closed: ein Fehler ist ein Fehler, auch wenn daneben ein
    // Nutzerobjekt steht. Ohne diesen Zweig entschiede ein halb
    // fehlgeschlagener Token-Abruf über den Zugang zu Gesundheitsdaten.
    getUserMock.mockResolvedValue({ data: { user: nutzer() }, error: { message: 'jwt expired' } })
    const ergebnis = await requireCoachSession()
    expect(ergebnis.ok).toBe(false)
  })

  it('lässt eine gültige Sitzung durch, ohne eine Tabelle anzufassen', async () => {
    const ergebnis = await requireCoachSession()
    expect(ergebnis.ok).toBe(true)
    // Onboarding: die coach_users-Zeile existiert hier noch gar nicht.
    expect(tabellen()).toEqual([])
  })
})

// ═══════════════════════════════════════════════════════════════════
describe('requireCoachUser — Profil', () => {
  it('liest die eigene Zeile über user_id — nicht über eine ID aus dem Aufruf', async () => {
    const ergebnis = await requireCoachUser()
    expect(ergebnis.ok).toBe(true)
    const zugriff = zugriffe.find(z => z.tabelle === 'coach_users')
    expect(zugriff?.filter).toEqual([['user_id', USER_ID]])
  })

  it('meldet 403 NO_COACH_PROFILE, wenn keine Zeile existiert', async () => {
    antworten.set('coach_users', { data: null, error: null })
    const { code, body } = await status(await requireCoachUser())
    expect(code).toBe(403)
    expect(body.code).toBe('NO_COACH_PROFILE')
  })

  it('meldet 500 statt „kein Profil", wenn die Abfrage scheitert', async () => {
    // Der Unterschied ist nicht kosmetisch: 403 NO_COACH_PROFILE schickt die
    // Oberfläche ins Onboarding — bei einem Datenbankfehler würde der Nutzer
    // damit aufgefordert, ein bereits bestehendes Profil neu anzulegen.
    antworten.set('coach_users', { data: null, error: { message: 'timeout' } })
    const { code, body } = await status(await requireCoachUser())
    expect(code).toBe(500)
    expect(body.code).toBeUndefined()
  })

  it('fragt ohne schreibzugriff WEDER Einwilligung NOCH Freischaltung ab', async () => {
    // Art. 7 Abs. 3 / Art. 15 / Art. 17 DSGVO: Lesen, Export, Löschung und
    // der Widerruf selbst müssen nach einem Widerruf offen bleiben.
    process.env[COACH_FREISCHALTUNG_ENV] = 'true'
    antworten.set('coach_consents', { data: [], error: null })
    const ergebnis = await requireCoachUser()
    expect(ergebnis.ok).toBe(true)
    expect(tabellen()).toEqual(['coach_users'])
  })
})

// ═══════════════════════════════════════════════════════════════════
describe('requireCoachUser({ schreibzugriff: true }) — Einwilligung', () => {
  it('lässt bei erteilter Einwilligung durch', async () => {
    const ergebnis = await requireCoachUser({ schreibzugriff: true })
    expect(ergebnis.ok).toBe(true)
    expect(tabellen()).toEqual(['coach_users', 'coach_consents'])
  })

  it('sperrt mit 403 EINWILLIGUNG_FEHLT nach Widerruf', async () => {
    antworten.set('coach_consents', {
      data: [{ consent_typ: 'gesundheitsdaten_art9', erteilt: true, widerrufen_am: '2026-08-01T10:00:00Z' }],
      error: null,
    })
    const { code, body } = await status(await requireCoachUser({ schreibzugriff: true }))
    expect(code).toBe(403)
    expect(body.code).toBe(EINWILLIGUNG_FEHLT_CODE)
  })

  it('sperrt auch, wenn eine ANDERE Einwilligung aktiv ist', async () => {
    // 'datenfreigabe' ist nicht die Pflicht-Einwilligung. Ein Guard, der nur
    // „irgendeine aktive Zeile" prüft, wäre hier grün.
    antworten.set('coach_consents', {
      data: [{ consent_typ: 'datenfreigabe', erteilt: true, widerrufen_am: null }],
      error: null,
    })
    const { code, body } = await status(await requireCoachUser({ schreibzugriff: true }))
    expect(code).toBe(403)
    expect(body.code).toBe(EINWILLIGUNG_FEHLT_CODE)
  })

  it('schreibt NICHT, wenn die Einwilligung nicht geprüft werden kann (503, fail-closed)', async () => {
    antworten.set('coach_consents', { data: null, error: { message: 'connection reset' } })
    const { code } = await status(await requireCoachUser({ schreibzugriff: true }))
    expect(code).toBe(503)
  })

  it('filtert die Einwilligungen auf die eigene coach_user_id', async () => {
    await requireCoachUser({ schreibzugriff: true })
    const zugriff = zugriffe.find(z => z.tabelle === 'coach_consents')
    expect(zugriff?.filter).toEqual([['coach_user_id', COACH_ID]])
  })
})

// ═══════════════════════════════════════════════════════════════════
describe('requireCoachUser({ schreibzugriff: true }) — zweiter Faktor', () => {
  it('sperrt einen Nutzer MIT Faktor, dessen Sitzung nur auf AAL1 steht', async () => {
    getUserMock.mockResolvedValue({ data: { user: nutzer([{ id: 'f1', status: 'verified' }]) }, error: null })
    aalMock.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal2' } })
    const { code, body } = await status(await requireCoachUser({ schreibzugriff: true }))
    expect(code).toBe(403)
    expect(body.code).toBe(MFA_ZWEITER_FAKTOR_CODE)
  })

  it('prüft den Faktor VOR der Einwilligung — die Einwilligung wird gar nicht erst gelesen', async () => {
    getUserMock.mockResolvedValue({ data: { user: nutzer([{ id: 'f1', status: 'verified' }]) }, error: null })
    aalMock.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal2' } })
    await requireCoachUser({ schreibzugriff: true })
    expect(tabellen()).toEqual(['coach_users'])
  })

  it('lässt einen Nutzer MIT Faktor auf AAL2 durch', async () => {
    getUserMock.mockResolvedValue({ data: { user: nutzer([{ id: 'f1', status: 'verified' }]) }, error: null })
    aalMock.mockResolvedValue({ data: { currentLevel: 'aal2', nextLevel: 'aal2' } })
    const ergebnis = await requireCoachUser({ schreibzugriff: true })
    expect(ergebnis.ok).toBe(true)
  })

  it('sperrt fail-closed, wenn das Sitzungsniveau nicht ermittelbar ist', async () => {
    // Wirft die Auth-Schicht, meldet niveauDerSitzung() null. Für einen
    // Nutzer MIT Faktor heisst das gesperrt — sonst genügte ein Ausfall
    // der Niveau-Abfrage, um den zweiten Faktor zu umgehen.
    getUserMock.mockResolvedValue({ data: { user: nutzer([{ id: 'f1', status: 'verified' }]) }, error: null })
    aalMock.mockRejectedValue(new Error('netzwerk'))
    const { code, body } = await status(await requireCoachUser({ schreibzugriff: true }))
    expect(code).toBe(403)
    expect(body.code).toBe(MFA_ZWEITER_FAKTOR_CODE)
  })

  it('ein NUR ANGEFANGENER Faktor sperrt nicht', async () => {
    // 'unverified' = abgebrochene Einrichtung. Würde sie zählen, sperrte
    // sich jeder Nutzer selbst aus, der die Einrichtung einmal abbricht.
    getUserMock.mockResolvedValue({ data: { user: nutzer([{ id: 'f1', status: 'unverified' }]) }, error: null })
    const ergebnis = await requireCoachUser({ schreibzugriff: true })
    expect(ergebnis.ok).toBe(true)
    // Und die Niveau-Abfrage entfällt, weil sie nichts entscheiden kann.
    expect(aalMock).not.toHaveBeenCalled()
  })

  it('DiPA-Modus: Nutzer OHNE Faktor wird zur Einrichtung aufgefordert (TR-03161 O.Auth_3)', async () => {
    process.env[COACH_DIPA_MODUS_ENV] = 'true'
    const { code, body } = await status(await requireCoachUser({ schreibzugriff: true }))
    expect(code).toBe(403)
    expect(body.code).toBe(MFA_EINRICHTUNG_CODE)
  })

  it('ohne DiPA-Modus ist der Faktor freiwillig — Nutzer ohne Faktor schreibt', async () => {
    const ergebnis = await requireCoachUser({ schreibzugriff: true })
    expect(ergebnis.ok).toBe(true)
  })

  it('DiPA-Modus sperrt NICHT den lesenden Weg', async () => {
    // Sonst käme ein Nutzer ohne Authenticator-App im DiPA-Betrieb nicht
    // mehr an seine eigenen Daten — Art. 15/20 DSGVO.
    process.env[COACH_DIPA_MODUS_ENV] = 'true'
    const ergebnis = await requireCoachUser()
    expect(ergebnis.ok).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════
describe('requireCoachUser({ schreibzugriff: true }) — Freischaltung', () => {
  it('fragt die Freischaltung NICHT ab, solange der Schalter aus ist', async () => {
    await requireCoachUser({ schreibzugriff: true })
    expect(tabellen()).not.toContain('coach_freischaltungen')
  })

  it('sperrt bei aktivem Schalter ohne gültige Freischaltung', async () => {
    process.env[COACH_FREISCHALTUNG_ENV] = 'true'
    antworten.set('coach_freischaltungen', { data: [], error: null })
    const { code, body } = await status(await requireCoachUser({ schreibzugriff: true }))
    expect(code).toBe(403)
    expect(body.code).toBe(FREISCHALTUNG_NOETIG_CODE)
  })

  it('lässt bei aktivem Schalter mit gültiger Freischaltung durch', async () => {
    process.env[COACH_FREISCHALTUNG_ENV] = 'true'
    antworten.set('coach_freischaltungen', {
      data: [{ status: 'aktiv', gueltig_von: '2020-01-01', gueltig_bis: '2099-12-31' }],
      error: null,
    })
    const ergebnis = await requireCoachUser({ schreibzugriff: true })
    expect(ergebnis.ok).toBe(true)
    expect(tabellen()).toEqual(['coach_users', 'coach_consents', 'coach_freischaltungen'])
  })

  it('eine ABGELAUFENE Freischaltung zählt nicht', async () => {
    process.env[COACH_FREISCHALTUNG_ENV] = 'true'
    antworten.set('coach_freischaltungen', {
      data: [{ status: 'aktiv', gueltig_von: '2020-01-01', gueltig_bis: '2020-12-31' }],
      error: null,
    })
    const { code, body } = await status(await requireCoachUser({ schreibzugriff: true }))
    expect(code).toBe(403)
    expect(body.code).toBe(FREISCHALTUNG_NOETIG_CODE)
  })

  it('schreibt NICHT, wenn die Freischaltung nicht geprüft werden kann (503, fail-closed)', async () => {
    process.env[COACH_FREISCHALTUNG_ENV] = 'true'
    antworten.set('coach_freischaltungen', { data: null, error: { message: 'timeout' } })
    const { code } = await status(await requireCoachUser({ schreibzugriff: true }))
    expect(code).toBe(503)
  })
})
