import { test, expect } from '@playwright/test'
import { cookieBannerVorwegBeantworten } from './helpers/consent'

/**
 * E2E: Register-Flow — Kunde
 *
 * Deckt ab:
 * - Seite lädt & hat erwartete Form-Elemente
 * - Schwaches Passwort wird blockiert (P1-Regression-Test für AUTH-005/AUTH-011)
 * - Ungültige PLZ wird blockiert
 * - Erfolgreicher Register-Flow bis Supabase-Mail-Schritt (E-Mail-Confirm mockt der Supabase-Backend)
 *
 * Hinweis: Dieser Test führt einen echten Supabase-Register durch. In CI
 * sollte ein Test-Projekt mit Random-Emails genutzt werden, damit keine
 * Production-Datenbank verschmutzt wird. In Entwicklung via Supabase-Local.
 */

// Der Cookie-Banner legt sich 800 ms nach dem Laden ueber den unteren
// Seitenrand und verdeckt auf `mobile-safari` die Absende-Knoepfe. Er wird
// deshalb vorweg beantwortet — geprueft wird er selbst in
// e2e/cookie-consent.spec.ts, nicht hier als Beifang.
test.beforeEach(async ({ page }) => {
  await cookieBannerVorwegBeantworten(page)
})

test.describe('Register-Flow: Kunde', () => {
  // zxcvbn wird beim ersten Tastendruck nachgeladen; auf webkit dauert das
  // spuerbar laenger als das Playwright-Standardlimit einraeumt.
  test.slow()

  test('Form ist sichtbar und valide Eingabe-Felder zeigt', async ({ page }) => {
    await page.goto('/auth/register')

    // Kernfelder: Name, E-Mail, Passwort, PLZ
    await expect(page.getByPlaceholder('Vorname').first()).toBeVisible()
    await expect(page.getByPlaceholder('Nachname').first()).toBeVisible()
    await expect(page.getByPlaceholder('E-Mail-Adresse')).toBeVisible()
    await expect(page.getByPlaceholder(/Passwort \(min\. 8 Zeichen\)/)).toBeVisible()
    await expect(page.getByPlaceholder('PLZ').first()).toBeVisible()
    await expect(page.getByPlaceholder('Stadt').first()).toBeVisible()
  })

  test('Schwaches Passwort wird abgelehnt (Regression: AUTH-011)', async ({ page }) => {
    // waitUntil: 'domcontentloaded' statt des Standards 'load'. Der erste
    // mobile-safari-Versuch lief einmal in den 90-s-Deckel, der zweite war
    // in 3 s durch — 'load' wartet auf JEDE Nebenressource, und eine
    // haengende genuegt. Der Test braucht das Dokument und die Hydration,
    // die die Zusicherungen unten ohnehin abwarten, nicht das letzte Bild.
    await page.goto('/auth/register', { waitUntil: 'domcontentloaded' })

    const submitButton = page.getByRole('button', { name: /registrieren|konto erstellen/i }).first()
    const agb = page.getByRole('checkbox').first()

    // ── AGB-Tor, und zugleich das Hydrations-Tor ───────────────────
    // Reihenfolge mit Grund: Die Felder werden ERST nach diesem Block
    // gefuellt. `domcontentloaded` gibt die Seite frei, sobald das
    // servergerenderte HTML steht — React hat dann noch nicht
    // hydratisiert. Wer davor tippt, schreibt in Inputs, die die
    // Hydration gleich darauf aus dem (leeren) React-State
    // ueberschreibt: die Felder standen im Fehlerbild leer da, das
    // Formular kam nie zum Absenden, und der Browser meldete nur noch
    // sein eigenes „Please fill out this field". Nur PLZ und Stadt —
    // die beiden zuletzt gefuellten — hatten ihre Werte behalten.
    //
    // Das Umschalten der Checkbox aendert `disabled` am Absende-Knopf
    // ueber React-State (app/auth/register/page.tsx: disabled={loading
    // || !agbAccepted}). Diese Aenderung KANN vor der Hydration nicht
    // eintreten — sie ist damit ein Beleg, kein Zeitpuffer.
    //
    // Das Tor selbst wird ausdruecklich mitgeprueft statt nur umgangen:
    // die Einwilligung in AGB und Datenschutz ist eine Zusage, keine
    // Formalie, und ein Test, der sie stillschweigend wegklickt, wuerde
    // ihren Wegfall nicht bemerken. Geprueft wird in beide Richtungen
    // und nach der Hydration — vorher waere „ist deaktiviert" auch dann
    // wahr, wenn es die Regel gar nicht mehr gaebe.
    await agb.scrollIntoViewIfNeeded()
    await agb.check()
    await expect(submitButton).toBeEnabled()
    await agb.uncheck()
    await expect(submitButton).toBeDisabled()
    await agb.check()
    await expect(submitButton).toBeEnabled()

    const vorname = page.getByPlaceholder('Vorname').first()
    await vorname.fill('Max')
    await page.getByPlaceholder('Nachname').first().fill('Mustermann')
    await page.getByPlaceholder('E-Mail-Adresse').fill(`test-${Date.now()}@example.de`)
    // Ein häufiges Passwort — soll von validatePassword + isCommonPassword geblockt werden
    await page.getByPlaceholder(/Passwort \(min\. 8 Zeichen\)/).fill('passwort')
    await page.getByPlaceholder('PLZ').first().fill('60311')
    await page.getByPlaceholder('Stadt').first().fill('Frankfurt')

    // Beleg, dass die Eingaben wirklich im Formular stehen. Ohne diese
    // Zusicherung wuerde ein erneuter Ruecksetzer wieder als „Banner
    // fehlt" erscheinen statt als das, was er ist.
    await expect(vorname).toHaveValue('Max')

    // ── Absenden ───────────────────────────────────────────────────
    await submitButton.click()

    // Auf das Fehler-Banner pruefen, nicht auf irgendeinen Text der Seite:
    // „Passwort" steht als Feldbeschriftung ohnehin da, die alte Zusicherung
    // war damit unabhaengig vom Verhalten gruen.
    // Grosszuegiges Zeitlimit mit Grund: validatePasswordAsync laedt
    // zxcvbn per dynamischem Import nach — ein grosses Woerterbuch-Modul.
    // Auf dem mobile-safari-Projekt hat genau das den Test einmal
    // flackern lassen. Das Zeitlimit gilt dem LADEN, nicht der
    // Zusicherung: die bleibt unveraendert scharf.
    //
    // Nicht `[role="alert"]` allein: Next haengt einen eigenen
    // Route-Announcer (`#__next-route-announcer__`) mit genau dieser Rolle
    // in die Seite. Der steht im DOM VOR dem Banner, ist dauerhaft leer und
    // traegt trotzdem eine Box — `.first()` griff also immer ihn, die
    // Sichtbarkeits-Zusicherung war damit inhaltsleer gruen und erst der
    // Text-Vergleich fiel um. Geprueft wird jetzt der Banner selbst
    // (`.auth-error`, app/auth/register/page.tsx:481).
    const banner = page.locator('.auth-error[role="alert"]')
    await expect(banner).toBeVisible({ timeout: 25_000 })
    await expect(banner).toHaveText(/Mindestanforderungen|Zu schwach/i)
  })

  test('Sichtbare Strength-Indicator bei starker Eingabe', async ({ page }) => {
    await page.goto('/auth/register')

    const pwField = page.getByPlaceholder(/Passwort \(min\. 8 Zeichen\)/)
    // Starkes Passwort eintippen
    await pwField.fill('Tr0ub4dor&9!AlltagsEngel')

    // Gib dem Client einen Moment, um state zu rendern
    await page.waitForTimeout(500)

    // Mindestens ein sichtbarer "strong"-Indikator oder kein Fehler-Banner mehr
    // Aufgrund unbekannter Klassen-Naming prüfen wir negativ: keine "Passwort zu"-Meldung
    await expect(page.getByText(/Passwort zu schwach|zu häufig/i)).toHaveCount(0)
  })
})
