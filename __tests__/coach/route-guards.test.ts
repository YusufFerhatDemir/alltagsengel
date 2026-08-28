/**
 * DiPA / PflegeCoach — welcher Riegel steht vor welcher Route
 * ═══════════════════════════════════════════════════════════════════════
 *
 * `lib/coach/api-auth.ts` unterscheidet zwei Stufen: `requireCoachUser()`
 * prüft nur Sitzung und Profil, `requireCoachUser({ schreibzugriff: true })`
 * zusätzlich zweiten Faktor, Einwilligung (Art. 9 DSGVO) und Freischaltung.
 * Die Regeln selbst sind in `__tests__/coach/api-auth.test.ts` geprüft —
 * hier geht es um die andere Hälfte des Problems: dass die richtige Stufe
 * auch tatsächlich VOR der richtigen Route steht.
 *
 * Das ist genau der Fehler, den kein Modultest sieht. Eine neue Route
 * `POST /api/coach/messungen-v2`, die `requireCoachUser()` ohne
 * `schreibzugriff` aufruft, ist in sich stimmig, kompiliert, und schreibt
 * trotzdem Gesundheitsdaten an der Einwilligung vorbei. Erst der Vergleich
 * ALLER Routen gegen eine Liste macht das sichtbar.
 *
 * Deshalb ist die Liste unten eine ERLAUBNISLISTE mit Begründung, keine
 * Sperrliste: Wer eine neue schreibende Route anlegt, bekommt einen roten
 * Test und muss entweder `schreibzugriff: true` setzen oder hier eintragen,
 * WARUM nicht. Eine Sperrliste wäre an dieser Stelle fail-open — eine
 * unbekannte neue Route liefe stillschweigend durch.
 *
 * Die zweite Prüfung betrifft die Gegenrichtung: Die vier Wege, die nach
 * einem Widerruf offen bleiben MÜSSEN (Einwilligungsverwaltung, Löschung,
 * Abo-Kündigung/Widerruf, Profil/Onboarding), dürfen `schreibzugriff`
 * NICHT tragen. Sonst wäre der Widerruf eine Falle: der Nutzer käme an
 * seine eigenen Daten nicht mehr heran (Art. 7 Abs. 3, Art. 15, Art. 17
 * DSGVO). Auch diese Erwartung steht hier ausdrücklich und nicht nur als
 * Kommentar in der jeweiligen Route.
 *
 * Dritte Prüfung: die Betriebsrouten unter `app/api/dipa/**` sind KEINE
 * Endnutzer-Routen. Sie stehen hinter `requireOpsAdmin('system.verwalten')`
 * — Freischaltcodes ausgeben, Abrechnungswege setzen, Schalterstand lesen.
 * Rutschte eine davon versehentlich auf `requireCoachUser`, könnte sich
 * jeder angemeldete PflegeCoach-Nutzer Codes ausstellen.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join, relative } from 'path'
import { globSync } from 'glob'
import { exportiertHandler, handlerRumpfOderFehler } from '../helpers/route-quelle'

const WURZEL = join(__dirname, '..', '..')
const SCHREIBENDE = ['POST', 'PUT', 'PATCH', 'DELETE'] as const

function routen(unterordner: string): string[] {
  return globSync(`app/api/${unterordner}/**/route.ts`, { cwd: WURZEL })
    .map(p => p.split('\\').join('/'))
    .sort()
}

function quelle(pfad: string): string {
  return readFileSync(join(WURZEL, pfad), 'utf8')
}

/** Alle schreibenden Handler einer Route, die es wirklich gibt. */
function schreibendeHandler(pfad: string): string[] {
  const src = quelle(pfad)
  return SCHREIBENDE.filter(m => exportiertHandler(src, m))
}

// ═══════════════════════════════════════════════════════════════════
// Erlaubnisliste: schreibende Route OHNE `schreibzugriff: true`
// ═══════════════════════════════════════════════════════════════════
/**
 * Jeder Eintrag ist eine bewusste Entscheidung mit Grund. Der Grund steht
 * hier und nicht nur in der Route, damit beim Lesen der Liste erkennbar
 * ist, ob die Begründung noch trägt.
 */
const OHNE_SCHREIBZUGRIFF: Record<string, string> = {
  'app/api/coach/abo/route.ts POST':
    'Kündigung und Widerruf des Selbstzahler-Abos. Ein Widerruf muss so '
    + 'einfach wirken wie der Abschluss (Art. 7 Abs. 3 DSGVO analog, § 355 BGB) — '
    + 'ein Einwilligungs- oder Freischaltungstor davor wäre eine Falle.',

  'app/api/coach/consents/route.ts POST':
    'Die Einwilligungsverwaltung selbst. Ein Tor, das die Einwilligung '
    + 'voraussetzt, machte das erneute Erteilen nach einem Widerruf unmöglich.',

  'app/api/coach/freigaben/route.ts POST':
    'Datenfreigabe an Angehörige/Pflegedienst. Prüft in der Route die '
    + 'EIGENE Einwilligung "datenfreigabe" (nicht die Art.-9-Pflicht-'
    + 'einwilligung) und deckelt zusätzlich den Empfänger-Lookup.',

  'app/api/coach/freigaben/[id]/route.ts PATCH':
    'Widerruf einer erteilten Freigabe. Muss immer möglich sein — sonst '
    + 'liesse sich eine laufende Datenweitergabe nicht beenden.',

  'app/api/coach/freischaltung/route.ts POST':
    'Einlösen des Freischaltcodes. Ein Freischaltungstor davor wäre '
    + 'zirkulär: freischalten könnte nur, wer schon freigeschaltet ist.',

  'app/api/coach/loeschung/route.ts DELETE':
    'Löschung des eigenen Kontos (Art. 17 DSGVO). Muss auch nach einem '
    + 'Widerruf und ohne gültige Freischaltung offen bleiben.',

  'app/api/coach/nutzung/route.ts POST':
    'Pseudonymisierte Nutzungsereignisse. Hat ein STRENGERES eigenes Tor '
    + '(Deployment-Schalter COACH_NUTZUNGSNACHWEIS_AKTIV UND Einwilligung '
    + '"wissenschaftliche_auswertung") und antwortet bei fehlender '
    + 'Grundlage weich mit erfasst:false, statt einen Ablauf abzubrechen.',

  'app/api/coach/profil/route.ts POST':
    'Onboarding — legt die coach_users-Zeile überhaupt erst an. '
    + 'requireCoachUser wäre hier unmöglich, die Route nutzt '
    + 'requireCoachSession.',

  'app/api/coach/profil/route.ts PATCH':
    'Darstellungseinstellungen (keine Gesundheitsdaten). Muss nach einem '
    + 'Widerruf bedienbar bleiben, etwa um die Schriftgrösse zu ändern.',

  'app/api/coach/anfrage/route.ts POST':
    'Anonymes Kontaktformular, vor jeder Anmeldung. Steht hinter einem '
    + 'IP-Deckel (rateLimitPersistent), nicht hinter einer Sitzung.',

  'app/api/coach/webhook/route.ts POST':
    'Stripe-Webhook. Es gibt keine Nutzersitzung; die Echtheit wird über '
    + 'die Stripe-Signatur (constructEvent) geprüft.',
}

/**
 * Routen, die `schreibzugriff` NICHT tragen dürfen. Teilmenge der Liste
 * oben — hier steht nicht „ist zurzeit so", sondern „muss so bleiben".
 */
const MUSS_OFFEN_BLEIBEN = [
  'app/api/coach/consents/route.ts POST',
  'app/api/coach/loeschung/route.ts DELETE',
  'app/api/coach/abo/route.ts POST',
  'app/api/coach/freigaben/[id]/route.ts PATCH',
] as const

const SCHREIBZUGRIFF_MUSTER = /requireCoachUser\(\s*\{[^}]*schreibzugriff\s*:\s*true/

// ═══════════════════════════════════════════════════════════════════
describe('Endnutzer-Routen app/api/coach/**', () => {
  const alle = routen('coach')

  it('findet überhaupt Routen (Gegenprobe gegen einen leeren Scan)', () => {
    // Ohne diese Zeile wäre die ganze Suite grün, sobald der Glob nicht
    // mehr greift — der klassische still-grüne Scanner.
    expect(alle.length).toBeGreaterThanOrEqual(20)
    expect(alle).toContain('app/api/coach/messungen/route.ts')
  })

  it('jeder schreibende Handler hat entweder schreibzugriff:true oder einen Eintrag mit Grund', () => {
    const ungedeckt: string[] = []
    for (const pfad of alle) {
      const src = quelle(pfad)
      for (const methode of schreibendeHandler(pfad)) {
        const schluessel = `${pfad} ${methode}`
        const rumpf = handlerRumpfOderFehler(src, methode, pfad)
        if (SCHREIBZUGRIFF_MUSTER.test(rumpf)) continue
        if (OHNE_SCHREIBZUGRIFF[schluessel]) continue
        ungedeckt.push(schluessel)
      }
    }
    expect(
      ungedeckt,
      'Schreibende PflegeCoach-Route ohne Einwilligungs-/MFA-/Freischaltungstor. '
      + 'Entweder requireCoachUser({ schreibzugriff: true }) setzen oder in '
      + 'OHNE_SCHREIBZUGRIFF mit Begründung eintragen.',
    ).toEqual([])
  })

  it('Gegenprobe: bei mindestens vier Routen wird schreibzugriff:true wirklich erkannt', () => {
    // Ohne diese Zeile wäre die Prüfung oben auch dann grün, wenn die
    // Rumpf-Zerlegung leere Strings liefert und JEDE Route über die
    // Erlaubnisliste durchrutscht. Genau dieser still-grüne Scanner ist
    // der Grund, warum handlerRumpfOderFehler zentral liegt.
    const erkannt = alle.flatMap(pfad => {
      const src = quelle(pfad)
      return schreibendeHandler(pfad)
        .filter(m => SCHREIBZUGRIFF_MUSTER.test(handlerRumpfOderFehler(src, m, pfad)))
        .map(m => `${pfad} ${m}`)
    })
    expect(erkannt).toContain('app/api/coach/messungen/route.ts POST')
    expect(erkannt).toContain('app/api/coach/assessments/route.ts POST')
    expect(erkannt).toContain('app/api/coach/ziele/[id]/route.ts PATCH')
    expect(erkannt.length).toBeGreaterThanOrEqual(4)
  })

  it('die Erlaubnisliste enthält keine Karteileichen', () => {
    // Eine Liste, die nur wächst, hört auf, eine Aussage zu sein: ein
    // Eintrag zu einer gelöschten oder inzwischen abgesicherten Route
    // würde stillschweigend weiter „erlaubt" bedeuten.
    const veraltet = Object.keys(OHNE_SCHREIBZUGRIFF).filter(schluessel => {
      const [pfad, methode] = schluessel.split(' ')
      if (!alle.includes(pfad)) return true
      const src = quelle(pfad)
      if (!exportiertHandler(src, methode)) return true
      return SCHREIBZUGRIFF_MUSTER.test(handlerRumpfOderFehler(src, methode, pfad))
    })
    expect(veraltet, 'Eintrag in OHNE_SCHREIBZUGRIFF ist überholt und gehört entfernt.').toEqual([])
  })

  it('die Wege, die nach einem Widerruf offen bleiben müssen, tragen kein Schreibtor', () => {
    for (const schluessel of MUSS_OFFEN_BLEIBEN) {
      const [pfad, methode] = schluessel.split(' ')
      const rumpf = handlerRumpfOderFehler(quelle(pfad), methode, pfad)
      expect(
        SCHREIBZUGRIFF_MUSTER.test(rumpf),
        `${schluessel} trägt schreibzugriff:true. Damit wäre der Widerruf der `
        + 'Einwilligung eine Falle — Art. 7 Abs. 3 / Art. 15 / Art. 17 DSGVO.',
      ).toBe(false)
    }
  })

  it('jede Route mit Sitzungsbezug ruft einen Guard aus lib/coach/api-auth auf', () => {
    // Die drei anonymen Wege sind ausdrücklich benannt; alles andere muss
    // durch den Guard. Ein neuer Handler, der direkt createAdminClient()
    // nutzt, fällt hier auf.
    const ANONYM = [
      'app/api/coach/anfrage/route.ts',
      'app/api/coach/tarife/route.ts',
      'app/api/coach/webhook/route.ts',
    ]
    const ohneGuard = alle.filter(pfad => {
      if (ANONYM.includes(pfad)) return false
      const src = quelle(pfad)
      return !/require(CoachUser|CoachSession)\(/.test(src)
    })
    expect(ohneGuard).toEqual([])
  })

  it('die anonymen Routen sind genau die drei benannten', () => {
    // Gegenrichtung: eine neue Route ohne Guard darf nicht unbemerkt
    // hinzukommen — deshalb die Liste hier noch einmal exakt.
    const ohneGuard = alle.filter(pfad => !/require(CoachUser|CoachSession)\(/.test(quelle(pfad)))
    expect(ohneGuard.sort()).toEqual([
      'app/api/coach/anfrage/route.ts',
      'app/api/coach/tarife/route.ts',
      'app/api/coach/webhook/route.ts',
    ])
  })
})

// ═══════════════════════════════════════════════════════════════════
describe('Betriebsrouten app/api/dipa/**', () => {
  const alle = routen('dipa')

  it('findet die fünf Betriebsrouten', () => {
    expect(alle.length).toBe(5)
  })

  it('jeder Handler steht hinter requireOpsAdmin("system.verwalten")', () => {
    // Diese Routen geben Freischaltcodes aus und setzen Abrechnungswege.
    // Ein Rutsch auf requireCoachUser machte sie für jeden angemeldeten
    // PflegeCoach-Nutzer bedienbar.
    const fehlend: string[] = []
    for (const pfad of alle) {
      const src = quelle(pfad)
      for (const methode of ['GET', ...SCHREIBENDE]) {
        if (!exportiertHandler(src, methode)) continue
        const rumpf = handlerRumpfOderFehler(src, methode, pfad)
        if (!/requireOpsAdmin\(\s*'system\.verwalten'\s*\)/.test(rumpf)) {
          fehlend.push(`${pfad} ${methode}`)
        }
      }
    }
    expect(fehlend).toEqual([])
  })

  it('keine Betriebsroute benutzt den Endnutzer-Guard', () => {
    const falsch = alle.filter(pfad => /requireCoach(User|Session)\(/.test(quelle(pfad)))
    expect(falsch).toEqual([])
  })
})
