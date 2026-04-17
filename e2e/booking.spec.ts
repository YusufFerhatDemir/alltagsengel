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
    // Site-Name erscheint irgendwo
    await expect(page).toHaveTitle(/Alltagsengel/i)
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

    // Fehler-Meldung erscheint (muss generisch sein nach AUTH-005 Fix)
    await expect(page.getByText(/E-Mail|Passwort|falsch|ungültig/i).first()).toBeVisible({ timeout: 10_000 })
  })
})
