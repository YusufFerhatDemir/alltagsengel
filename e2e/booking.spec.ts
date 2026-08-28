import { test, expect } from '@playwright/test'

/**
 * E2E: Booking-Flow & Public-Entry-Points
 *
 * Der volle Booking-Flow (/kunde/buchen/[id]) braucht Auth + einen echten
 * Engel-Account in der DB. Für diesen Smoke-Layer validieren wir:
 *
 * 1. Unauth-Besuch auf /kunde/buchen/* leitet auf Login
 * 2. Public-Landing (/) lädt und bietet Registration/Login an
 * 3. Login-Form ist sichtbar & erwartet E-Mail + Passwort
 *
 * Full-Stack-Booking-Tests (mit Test-Account + Supabase-Test-Daten)
 * sollten in Sprint 2 als separate Suite hinzukommen (`e2e/booking-e2e.spec.ts`).
 */

test.describe('Booking-Entry-Points (Smoke)', () => {
  test('Public Landing-Page lädt', async ({ page }) => {
    await page.goto('/')

    // Der Homepage-Titel traegt die MARKE BEWUSST NICHT.
    // app/page.tsx setzt title.absolute und umgeht damit das
    // layout-Template '%s | Alltagsengel'; der Kommentar dort nennt den
    // Grund (Marke steckt im Keyword-Set, Titel <= 60 Zeichen). Die
    // fruehere Zusicherung /Alltagsengel/i auf den Titel hat genau diese
    // Entscheidung fuer einen Fehler gehalten — sie ist der erste Test,
    // der beim Einschalten der Suite rot wurde, und der Titel war nicht
    // das Kaputte daran.
    //
    // Geprueft wird deshalb, was wirklich gelten soll: der Titel ist der
    // gewollte, und die Marke steht dort, wo sie hingehoert — im
    // OpenGraph-Satz aus app/layout.tsx. Wer den Titel spaeter aendert,
    // faellt hier auf und muss die Entscheidung neu treffen statt sie zu
    // ueberschreiben.
    await expect(page).toHaveTitle('Alltagsbegleitung, Pflegebox & Krankenfahrten Frankfurt')
    await expect(page.locator('meta[property="og:title"]'))
      .toHaveAttribute('content', /Alltagsengel/i)
  })

  test('Unauth-Versuch auf Booking-Route redirectet auf Login', async ({ page }) => {
    // Direkter Versuch, eine geschützte Buchungs-Route zu besuchen
    await page.goto('/kunde/buchen/nonexistent-engel-id')

    // Erwartung: Middleware leitet auf Login weiter (oder 404).
    // Wir akzeptieren beides, solange die Buchungsseite NICHT mit Engel-Daten angezeigt wird.
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => { /* OK bei Redirect */ })

    const url = page.url()
    const isLogin = url.includes('/auth/login') || url.includes('/auth/register')
    const isNotFound = await page.getByText(/404|nicht gefunden|not found/i).count() > 0

    // Auf keinen Fall darf der Buchungs-Content sichtbar sein
    const hasBookingForm = await page.getByText(/stunden buchen|Buchung best/i).count()
    expect(hasBookingForm).toBe(0)

    // Entweder Login-Redirect oder 404 ist akzeptabel
    expect(isLogin || isNotFound).toBe(true)
  })

  test('Login-Form hat E-Mail- und Passwort-Feld', async ({ page }) => {
    await page.goto('/auth/login')
    await expect(page.getByPlaceholder(/E-Mail/i).first()).toBeVisible()
    await expect(page.getByPlaceholder(/Passwort/i).first()).toBeVisible()
  })

  test('Login mit falschen Credentials zeigt Fehler (Regression: AUTH-005)', async ({ page }) => {
    await page.goto('/auth/login')
    await page.getByPlaceholder(/E-Mail/i).first().fill(`nonexistent-${Date.now()}@test.invalid`)
    await page.getByPlaceholder(/Passwort/i).first().fill('WrongPassword!123')

    const submit = page.getByRole('button', { name: /anmelden|einloggen/i }).first()
    await submit.click()

    // Auf das Fehler-Banner selbst pruefen, nicht auf irgendeinen Text der
    // Seite. Die fruehere Fassung suchte /E-Mail|Passwort|falsch|ungültig/
    // ueber die ganze Seite — und traf damit sofort den Link „Passwort
    // vergessen?", der IMMER da steht. Der Test war gruen, ohne dass je
    // eine Anmeldung stattgefunden haette. Genau diese Sorte Zusicherung
    // gehoert nicht in CI, wenn sie danach als Nachweis zaehlen soll.
    // Auf das Fehler-Banner der Anmeldemaske selbst, nicht auf irgendein
    // [role="alert"] der Seite: der erste Lauf traf ein sichtbares, aber
    // LEERES alert-Element und scheiterte an innerText.length > 0 — die
    // Zusicherung war praezise genug, um rot zu werden, aber nicht
    // praezise genug, um auf das Richtige zu zeigen. `.auth-error` ist die
    // Klasse, die app/auth/login/page.tsx fuer genau diese Meldung setzt.
    const banner = page.locator('.auth-error[role="alert"]')
    await expect(banner.first()).toBeVisible({ timeout: 20_000 })

    // AUTH-005: die Meldung darf nicht verraten, ob es die Adresse gibt.
    const text = (await banner.first().innerText()).trim().toLowerCase()
    expect(text.length).toBeGreaterThan(0)
    expect(text).not.toMatch(/nicht registriert|kein konto|unbekannte e-mail|user not found|nicht gefunden/)
  })
})
