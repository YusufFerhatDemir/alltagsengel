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
    // ── Warum hier abgefangen wird ──────────────────────────────────
    // AUTH-005 ist eine Aussage ueber GENAU EINEN Zweig in
    // app/auth/login/page.tsx: wenn Supabase „Invalid login credentials"
    // oder „Email not confirmed" meldet, muss dieselbe generische Meldung
    // erscheinen — sonst laesst sich von aussen abzaehlen, welche
    // E-Mail-Adressen es gibt.
    //
    // In CI zeigt die Supabase-URL auf einen Platzhalter. Ein echter
    // Anmeldeversuch landet damit NICHT in diesem Zweig, sondern im
    // generischen Netzwerk-Zweig darunter — und der braucht so lange, wie
    // die Namensaufloesung eben braucht. Der erste Lauf dieser Suite ist
    // genau daran gescheitert: „element(s) not found" nach 20 Sekunden.
    //
    // Das Zeitlimit hochzudrehen haette den Lauf gruen gemacht und nichts
    // bewiesen. Die Antwort wird deshalb abgefangen und durch die ECHTE
    // Absage von GoTrue ersetzt. Damit laeuft der Test durch den Zweig,
    // um den es geht, ist unabhaengig von jedem Backend und schnell.
    await page.route('**/auth/v1/token**', route =>
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'invalid_grant',
          error_description: 'Invalid login credentials',
          msg: 'Invalid login credentials',
        }),
      }),
    )
    // Der Ratenzaehler laeuft ueber eine eigene Route, die ihrerseits
    // Supabase anspricht. Ohne dieses Abfangen wartet der Test auf sie
    // statt auf die Anmeldung.
    await page.route('**/api/auth/check-rate-limit', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ allowed: true, locked: false }),
      }),
    )

    await page.goto('/auth/login')
    await page.getByPlaceholder(/E-Mail/i).first().fill(`nonexistent-${Date.now()}@test.invalid`)
    await page.getByPlaceholder(/Passwort/i).first().fill('WrongPassword!123')

    const submit = page.getByRole('button', { name: /anmelden|einloggen/i }).first()
    await submit.click()

    // Auf das Fehler-Banner der Anmeldemaske selbst, nicht auf irgendein
    // [role="alert"] der Seite: ein frueherer Lauf traf ein sichtbares,
    // aber LEERES alert-Element. `.auth-error` ist die Klasse, die
    // app/auth/login/page.tsx fuer genau diese Meldung setzt.
    const banner = page.locator('.auth-error[role="alert"]')
    await expect(banner.first()).toBeVisible({ timeout: 15_000 })

    const text = (await banner.first().innerText()).trim().toLowerCase()
    expect(text.length).toBeGreaterThan(0)

    // AUTH-005: die Meldung darf nicht verraten, ob es die Adresse gibt.
    expect(text).not.toMatch(/nicht registriert|kein konto|unbekannte e-mail|user not found|nicht gefunden/)
    // Und sie darf die Meldung von Supabase nicht durchreichen.
    expect(text).not.toContain('invalid login credentials')
    // Positiv: es ist die gemeinsame Meldung fuer „falsch" UND
    // „nicht bestaetigt" — genau darin besteht der Schutz.
    expect(text).toMatch(/e-mail oder passwort ist falsch/)
  })
})
