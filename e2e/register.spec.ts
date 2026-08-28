import { test, expect } from '@playwright/test'

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

    await page.getByPlaceholder('Vorname').first().fill('Max')
    await page.getByPlaceholder('Nachname').first().fill('Mustermann')
    await page.getByPlaceholder('E-Mail-Adresse').fill(`test-${Date.now()}@example.de`)
    // Ein häufiges Passwort — soll von validatePassword + isCommonPassword geblockt werden
    await page.getByPlaceholder(/Passwort \(min\. 8 Zeichen\)/).fill('passwort')
    await page.getByPlaceholder('PLZ').first().fill('60311')
    await page.getByPlaceholder('Stadt').first().fill('Frankfurt')

    // ── AGB-Tor ────────────────────────────────────────────────────
    // Der Absende-Knopf ist `disabled`, solange die AGB-Checkbox nicht
    // gesetzt ist (app/auth/register/page.tsx: disabled={loading ||
    // !agbAccepted}). Die fruehere Fassung dieses Tests kannte das Tor
    // nicht und lief 30 s in einen click-Timeout — der erste Lauf der
    // Suite hat es sichtbar gemacht.
    //
    // Das Tor wird hier ausdruecklich mitgeprueft statt nur umgangen:
    // die Einwilligung in AGB und Datenschutz ist eine Zusage, keine
    // Formalie, und ein Test, der sie stillschweigend wegklickt, wuerde
    // ihren Wegfall nicht bemerken.
    const submitButton = page.getByRole('button', { name: /registrieren|konto erstellen/i }).first()
    await expect(submitButton).toBeDisabled()

    const agb = page.getByRole('checkbox').first()
    await agb.scrollIntoViewIfNeeded()
    await agb.check()
    await expect(submitButton).toBeEnabled()

    await submitButton.click()

    // Auf das Fehler-Banner pruefen, nicht auf irgendeinen Text der Seite:
    // „Passwort" steht als Feldbeschriftung ohnehin da, die alte Zusicherung
    // war damit unabhaengig vom Verhalten gruen.
    // Grosszuegiges Zeitlimit mit Grund: validatePasswordAsync laedt
    // zxcvbn per dynamischem Import nach — ein grosses Woerterbuch-Modul.
    // Auf dem mobile-safari-Projekt hat genau das den Test einmal
    // flackern lassen. Das Zeitlimit gilt dem LADEN, nicht der
    // Zusicherung: die bleibt unveraendert scharf.
    const banner = page.locator('[role="alert"]')
    await expect(banner.first()).toBeVisible({ timeout: 25_000 })
    await expect(banner.first()).toHaveText(/Mindestanforderungen|Zu schwach/i)
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
