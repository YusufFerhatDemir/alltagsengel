import { test, expect } from '@playwright/test'
import { cookieBannerVorwegBeantworten } from './helpers/consent'

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

// Der Cookie-Banner legt sich 800 ms nach dem Laden ueber den unteren
// Seitenrand und verdeckt auf `mobile-safari` die Absende-Knoepfe. Er wird
// deshalb vorweg beantwortet — geprueft wird er selbst in
// e2e/cookie-consent.spec.ts, nicht hier als Beifang.
test.beforeEach(async ({ page }) => {
  await cookieBannerVorwegBeantworten(page)
})

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
    // ── Warum hier `fetch` ersetzt wird und nicht `page.route` ──────
    // Erster Versuch war `page.route` auf die Supabase-URL. In chromium
    // lief das (1,6 s, gruen), auf mobile-safari NICHT — und die Diagnose
    // unten hat gezeigt, woran: `tokenAufrufe: []`, in der Konsole
    // „Error resolving ci-placeholder.supabase.co" und „TypeError: Load
    // failed", der Knopf stand auf „Anmelden…".
    //
    // Der Aufruf geht an eine FREMDE Herkunft und traegt Content-Type
    // application/json — damit ist er kein einfacher Aufruf und WebKit
    // schickt zuerst einen OPTIONS-Preflight. Dieser Preflight lief an
    // der Routing-Schicht vorbei ins echte Netz, scheiterte an der
    // Namensaufloesung, und supabase-js versuchte es danach still weiter.
    // Der Preflight einzeln beantwortet (davor probiert) half nicht: was
    // nie durch die Abfangregel kommt, laesst sich darin auch nicht
    // beantworten.
    //
    // `fetch` im Fenster zu ersetzen umgeht die ganze Schicht: kein
    // Preflight, keine Herkunftspruefung, kein Netz — und dieselbe
    // Antwort in jeder Maschine. Der geprueffte Code ist unveraendert der
    // echte; ersetzt ist nur, was Supabase geantwortet haette.
    await page.addInitScript(() => {
      const echtesFetch = window.fetch.bind(window)
      const antwort = (koerper: unknown, status: number) =>
        new Response(JSON.stringify(koerper), {
          status,
          headers: { 'Content-Type': 'application/json' },
        })

      window.fetch = ((eingabe: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof eingabe === 'string' ? eingabe
          : eingabe instanceof URL ? eingabe.href
          : eingabe.url

        // Die Absage, um die es geht — wortgleich wie GoTrue sie schickt.
        if (url.includes('/auth/v1/token')) {
          return Promise.resolve(antwort({
            error: 'invalid_grant',
            error_description: 'Invalid login credentials',
            msg: 'Invalid login credentials',
          }, 400))
        }

        // Der Ratenzaehler spricht seinerseits Supabase an. Ohne diese
        // Antwort wartet der Test auf ihn statt auf die Anmeldung — und
        // ein „locked" von dort waere einer der beiden stillen Rueckwege
        // der Maske, bei denen gar keine Meldung erscheint.
        if (url.includes('/api/auth/check-rate-limit')) {
          return Promise.resolve(antwort({ allowed: true, locked: false }, 200))
        }

        return echtesFetch(eingabe as RequestInfo, init)
      }) as typeof window.fetch
    })

    // Beobachter fuer die Diagnose weiter unten.
    const konsole: string[] = []
    const seitenfehler: string[] = []
    const tokenAufrufe: Array<{ methode: string; status: number | string }> = []
    const ratenAufrufe: string[] = []
    // Hinweis zur Lesart: seit `fetch` im Fenster ersetzt ist, laeuft der
    // Anmeldeaufruf gar nicht mehr ueber die Netzschicht — `tokenAufrufe`
    // bleibt im Normalfall LEER. Ein Eintrag darin hiesse, dass die
    // Ersetzung nicht griff und ein echter Aufruf rausging.
    page.on('console', m => {
      if (m.type() === 'error' || m.type() === 'warning') konsole.push(`${m.type()}: ${m.text()}`)
    })
    page.on('pageerror', e => seitenfehler.push(e.message))
    page.on('response', r => {
      const u = r.url()
      if (u.includes('/auth/v1/token')) tokenAufrufe.push({ methode: r.request().method(), status: r.status() })
      if (u.includes('/api/auth/check-rate-limit')) ratenAufrufe.push(String(r.status()))
    })

    await page.goto('/auth/login')

    // ── Hydrations-Tor ─────────────────────────────────────────────
    // Die Maske ist ein Client-Component mit kontrollierten Feldern
    // (app/auth/login/page.tsx:445 ff., `value={email}`). Wer tippt,
    // bevor React hydratisiert hat, schreibt in das servergerenderte
    // DOM — die Hydration ueberschreibt es gleich darauf aus dem noch
    // leeren State. Genau das ist passiert: im Fehlerbild stand die
    // E-Mail (zuerst gefuellt) leer, das Passwort (danach gefuellt)
    // noch drin; der Klick lief ins Leere, weil `required` am leeren
    // E-Mail-Feld die Absendung nativ abfing. Deshalb blieb die
    // Diagnose stumm: kein Konsolenfehler, kein Seitenfehler, kein
    // Netzverkehr, der Knopf unveraendert auf „ANMELDEN".
    //
    // Einzeln lief der Test durch, in der vollen Datei nicht — eine
    // Rennbedingung, kein fester Fehler. Ein Zeitpuffer wuerde sie
    // verdecken statt schliessen.
    //
    // Der Umschalter neben dem Passwortfeld wechselt seine
    // Beschriftung ueber React-State (setShowPassword). Dieser Wechsel
    // KANN vor der Hydration nicht eintreten und ist damit ein Beleg.
    const umschalter = page.getByRole('button', { name: /anzeigen|verbergen/i }).first()
    await expect(umschalter).toHaveText(/anzeigen/i)
    await umschalter.click()
    await expect(umschalter).toHaveText(/verbergen/i)
    await umschalter.click()
    await expect(umschalter).toHaveText(/anzeigen/i)

    const emailFeld = page.getByPlaceholder(/E-Mail/i).first()
    const passwortFeld = page.getByPlaceholder(/Passwort/i).first()
    await emailFeld.fill(`nonexistent-${Date.now()}@test.invalid`)
    await passwortFeld.fill('WrongPassword!123')

    // Beleg, dass beide Eingaben wirklich im Formular stehen. Ohne ihn
    // erschiene ein erneuter Ruecksetzer wieder als „Banner fehlt"
    // statt als das, was er ist.
    await expect(emailFeld).not.toHaveValue('')
    await expect(passwortFeld).toHaveValue('WrongPassword!123')

    const submit = page.getByRole('button', { name: /anmelden|einloggen/i }).first()
    await submit.click()

    // Auf das Fehler-Banner der Anmeldemaske selbst, nicht auf irgendein
    // [role="alert"] der Seite: ein frueherer Lauf traf ein sichtbares,
    // aber LEERES alert-Element. `.auth-error` ist die Klasse, die
    // app/auth/login/page.tsx fuer genau diese Meldung setzt.
    const banner = page.locator('.auth-error[role="alert"]')
    try {
      await expect(banner.first()).toBeVisible({ timeout: 15_000 })
    } catch (fehler) {
      // Ein Test, der nur „element(s) not found" sagt, zwingt zum Raten.
      // Diese Diagnose bleibt dauerhaft stehen: schlaegt der Test wieder
      // fehl, steht im Protokoll, WORAN es lag — die Anmeldemaske kennt
      // genau zwei stille Rueckwege ohne Meldung (Ratenzaehler gesperrt,
      // oder Antwort ohne Nutzer und ohne Fehler), und die lassen sich
      // von aussen nur an diesen Angaben unterscheiden.
      const diagnose = {
        knopfDeaktiviert: await submit.isDisabled().catch(() => 'unlesbar'),
        knopfText: await submit.innerText().catch(() => 'unlesbar'),
        tokenAufrufe: tokenAufrufe.map(a => `${a.methode} ${a.status}`),
        ratenzaehlerAufrufe: ratenAufrufe.length,
        konsole: konsole.slice(0, 10),
        seitenfehler: seitenfehler.slice(0, 5),
        kartentext: (await page.locator('.auth-card').first().innerText()
          .catch(() => '(keine .auth-card)')).replace(/\s+/g, ' ').slice(0, 400),
      }
      throw new Error(
        `Fehler-Banner blieb aus. Diagnose:\n${JSON.stringify(diagnose, null, 2)}\n\n`
        + (fehler as Error).message,
      )
    }

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
