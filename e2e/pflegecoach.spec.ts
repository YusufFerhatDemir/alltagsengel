import { test, expect } from '@playwright/test'
import { cookieBannerVorwegBeantworten } from './helpers/consent'

/**
 * E2E: Digitaler PflegeCoach — Produktbereich
 *
 * Deckt DiPA-Matrix QS-05 ab und liefert für BF-03 den maschinell prüfbaren
 * Teil der Barrierefreiheit.
 *
 * ═══ BEWUSSTE ABGRENZUNG ══════════════════════════════════════════
 * Diese Suite läuft OHNE Anmeldung. Grund: Ein E2E-Test, der sich echt
 * anmeldet, legt Gesundheitsdaten in einer echten Datenbank an — für ein
 * Produkt, dessen Kern die Datensparsamkeit ist, wäre das der falsche
 * Preis für Testabdeckung. Die datentragenden Wege sind stattdessen auf
 * drei anderen Ebenen abgesichert:
 *   * Zugriffsregeln:   supabase/shadow/50_pflegecoach_tests.sql (68 Tests)
 *   * Fachlogik:        lib/coach/*.test.ts
 *   * Produktgrenze:    lib/coach/produktgrenze.test.ts
 * Was NUR ein Browser prüfen kann, steht hier: Erreichbarkeit, Zugangs-
 * schutz, Dokumentstruktur, Werbefreiheit.
 *
 * ═══ WAS DIESE SUITE NICHT IST ════════════════════════════════════
 * Kein WCAG-Audit. Sie prüft strukturelle Voraussetzungen (Landmarks,
 * Überschriften, Titel, Zielgrößen) — kein Ersatz für den externen
 * BITV-Test (BF-01) und keinen Screenreader-Durchgang (BF-03).
 */

/** Öffentlich erreichbare Produktseiten. */
const OEFFENTLICH = [
  { pfad: '/pflegecoach/start', titelTeil: 'Willkommen' },
  { pfad: '/pflegecoach/datenschutz', titelTeil: 'Datenschutz' },
  { pfad: '/pflegecoach/anfrage', titelTeil: 'Anfrage' },
]

/** Seiten mit Daten — ohne Anmeldung führen sie zur Startseite. */
const GESCHUETZT = [
  '/pflegecoach',
  '/pflegecoach/ziele',
  '/pflegecoach/wochenplan',
  '/pflegecoach/assessment',
  '/pflegecoach/belastung',
  '/pflegecoach/verlauf',
  '/pflegecoach/bericht',
  '/pflegecoach/einstellungen',
  '/pflegecoach/einstellungen/sicherheit',
  '/pflegecoach/einstellungen/konto',
  '/pflegecoach/checkout',
]

// Der Cookie-Banner legt sich 800 ms nach dem Laden ueber den unteren
// Seitenrand und verdeckt auf `mobile-safari` die Absende-Knoepfe. Er wird
// deshalb vorweg beantwortet — geprueft wird er selbst in
// e2e/cookie-consent.spec.ts, nicht hier als Beifang.
test.beforeEach(async ({ page }) => {
  await cookieBannerVorwegBeantworten(page)
})

test.describe('PflegeCoach — Erreichbarkeit und Zugangsschutz', () => {
  for (const seite of OEFFENTLICH) {
    test(`${seite.pfad} lädt ohne Anmeldung`, async ({ page }) => {
      const antwort = await page.goto(seite.pfad)
      expect(antwort?.status()).toBeLessThan(400)
      await expect(page.locator('h1').first()).toBeVisible()
    })
  }

  for (const pfad of GESCHUETZT) {
    test(`${pfad} führt ohne Anmeldung zur Startseite`, async ({ page }) => {
      await page.goto(pfad)
      // Der Produktbereich wirft Nichtangemeldete NICHT aufs Login, sondern
      // auf die Startseite mit der Zweckbestimmung (app/pflegecoach/_lib/client.ts).
      await page.waitForURL(/\/pflegecoach\/start/, { timeout: 15000 })
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    })
  }

  test('DiPA-Seiten sind ohne den Schalter nicht vorhanden', async ({ page }) => {
    // COACH_DIPA_MODUS=false → app/pflegecoach/anspruch/page.tsx wirft
    // redirect('/pflegecoach') (kein 404 — das ist der reguläre Next.js-Weg,
    // eine Seite serverseitig unerreichbar zu machen, siehe GESCHUETZT oben).
    // Schlägt dieser Test fehl, wird tatsächlich die Kassen-Oberfläche
    // (AnspruchClient) ausgeliefert.
    await page.goto('/pflegecoach/anspruch')
    await page.waitForURL(/\/pflegecoach\/start/, { timeout: 15000 })
    const text = await page.locator('body').innerText()
    expect(text, 'Kassen-Oberfläche (Anspruchsprüfung) ist trotz COACH_DIPA_MODUS=false erreichbar').not.toMatch(
      /Anspruchsprüfung|Pflegegrad.*beantragt|nutzungDurch/i
    )
  })

  test('Produkt-APIs antworten ohne Anmeldung mit 401', async ({ request }) => {
    for (const route of ['/api/coach/profil', '/api/coach/ziele', '/api/coach/export']) {
      const antwort = await request.get(route)
      expect(antwort.status(), `${route} darf ohne Anmeldung nichts liefern`).toBe(401)
    }
  })

  test('FHIR-Export ist ohne Anmeldung ebenfalls gesperrt', async ({ request }) => {
    const antwort = await request.get('/api/coach/export?format=fhir')
    expect(antwort.status()).toBe(401)
  })
})

test.describe('PflegeCoach — Zweckbestimmung und Produktgrenze', () => {
  test('Startseite trägt die Negativabgrenzung sichtbar', async ({ page }) => {
    await page.goto('/pflegecoach/start')
    // /start ist eine Client-Komponente: Sie zeigt zuerst <CoachLaden />
    // ("Wird geladen …"), bis der Profil-Check (useEffect → /api/coach/profil)
    // zurück ist. Ohne diese Wartestelle liest innerText() zuverlässig nur
    // den Ladezustand statt der Zweckbestimmung.
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const text = await page.locator('body').innerText()
    expect(text).toMatch(/kein Medizinprodukt/i)
  })

  test('kein Produkttext behauptet Erstattung oder Zulassung', async ({ page }) => {
    // Doppelter Boden zu lib/coach/produktgrenze.test.ts: Der Strukturtest
    // liest den Quelltext, dieser hier das tatsächlich Ausgelieferte.
    const verboten = [
      /erstattungsfähig/i, /von der (Pflege)?kasse (bezahlt|erstattet|übernommen)/i,
      /BfArM[- ]?(gelistet|zugelassen)/i, /DiPA[- ]?zugelassen/i,
    ]
    for (const seite of OEFFENTLICH) {
      await page.goto(seite.pfad)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      const text = await page.locator('body').innerText()
      for (const muster of verboten) {
        expect(text, `${seite.pfad} enthält eine unzulässige Aussage (${muster})`).not.toMatch(muster)
      }
    }
  })

  test('Produktbereich lädt keine Tracker und keine Werbeskripte', async ({ page }) => {
    // Werbefreiheit der Kernfunktion (VS-01). Fremde Hosts im Produktbereich
    // wären ein Befund, keine Kleinigkeit.
    const fremdeHosts: string[] = []
    page.on('request', anfrage => {
      const url = new URL(anfrage.url())
      const eigen = url.hostname === new URL(page.url() || 'http://localhost').hostname
      if (!eigen && !['localhost', '127.0.0.1'].includes(url.hostname)) fremdeHosts.push(url.hostname)
    })
    await page.goto('/pflegecoach/start')
    await page.waitForLoadState('networkidle')

    const verdaechtig = fremdeHosts.filter(h =>
      /google|facebook|meta|hotjar|clarity|segment|mixpanel|doubleclick|analytics|tiktok|linkedin/i.test(h)
    )
    expect(verdaechtig, `Tracker im Produktbereich: ${verdaechtig.join(', ')}`).toEqual([])
  })
})

test.describe('PflegeCoach — Kostenlos-Garantie', () => {
  // Geschäftsmodell-Entscheidung vom 14.08.2026 (lib/coach/pricing.ts):
  // dauerhaft kostenlos für Endnutzer, kein Abo, keine Kreditkarte, keine
  // Testphase. Diese Suite prüft, dass die ausgelieferte Oberfläche und
  // die öffentliche Preis-API das auch tatsächlich einhalten.

  test('öffentliche Seiten behaupten nirgends einen Preis, ein Abo oder eine Testphase', async ({ page }) => {
    // Bewusst keine blanke Wortsperre für „kostenpflichtig"/„Abonnement": Die
    // kostenlos-Aussagen benutzen diese Wörter legitim in verneinter Form
    // („kein Abonnement", „ohne kostenpflichtigen Zugang"). Geprüft wird
    // stattdessen, ob tatsächlich ein Preis, ein Zahlungsanbieter oder ein
    // Bestellvorgang auftaucht.
    const verboten = [
      /\d[.,]?\d*\s?€/, /privat zu zahlen/i, /Konditionen (anfragen|besprechen)/i,
      /zahlungspflichtig bestellen/i, /Zugang bestellen/i, /Stripe/i,
    ]
    for (const seite of OEFFENTLICH) {
      await page.goto(seite.pfad)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await page.waitForLoadState('networkidle')
      const text = await page.locator('body').innerText()
      for (const muster of verboten) {
        expect(text, `${seite.pfad} enthält einen Preis-/Abo-Hinweis (${muster})`).not.toMatch(muster)
      }
    }
  })

  test('Startseite sagt ausdrücklich, dass die Nutzung kostenlos ist', async ({ page }) => {
    await page.goto('/pflegecoach/start')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await page.waitForLoadState('networkidle')
    const text = await page.locator('body').innerText()
    expect(text).toMatch(/kostenlos/i)
  })

  test('/api/coach/tarife liefert ohne Verkaufsfreigabe keine Beträge', async ({ request }) => {
    const antwort = await request.get('/api/coach/tarife')
    expect(antwort.status()).toBe(200)
    const daten = await antwort.json()
    expect(daten.verkauf_moeglich, 'COACH_PREISE_FREIGEGEBEN darf im Test nicht scharf sein').toBe(false)
    expect(daten.tarife).toEqual([])
  })
})

test.describe('PflegeCoach — Struktur der Barrierefreiheit', () => {
  test('jede Seite hat genau eine Hauptüberschrift und einen eigenen Titel', async ({ page }) => {
    const gesehen = new Set<string>()
    for (const seite of OEFFENTLICH) {
      await page.goto(seite.pfad)
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)

      // WCAG 2.4.2: Identische Titel machen Tabs und Verlauf unbrauchbar.
      const titel = await page.title()
      expect(titel, `${seite.pfad} hat keinen eigenen Titel`).not.toBe('')
      expect(gesehen.has(titel), `Titel „${titel}" ist doppelt vergeben`).toBe(false)
      gesehen.add(titel)
    }
  })

  test('Sprungmarke zum Inhalt ist vorhanden und erreichbar', async ({ page }) => {
    await page.goto('/pflegecoach/start')
    const sprung = page.locator('a.pc-skiplink')
    await expect(sprung).toHaveAttribute('href', '#pc-main')
    await sprung.focus()
    await expect(sprung).toBeFocused()
    await expect(page.locator('#pc-main')).toHaveCount(1)
  })

  test('Landmarks für Navigation und Inhalt sind gesetzt', async ({ page }) => {
    await page.goto('/pflegecoach/start')
    await expect(page.getByRole('main')).toHaveCount(1)
    await expect(page.locator('footer')).toHaveCount(1)
  })

  test('Bedienelemente erreichen die Mindestgröße von 44 Pixeln', async ({ page }) => {
    await page.goto('/pflegecoach/start')
    // Erst warten, bis der Ladezustand vorbei ist und alle Netzwerk-Requests
    // (u. a. der Tarife-Abruf in Preise()) sowie CSS/Fonts fertig sind —
    // sonst werden Knöpfe in einem Zwischenzustand vermessen (z. B. vor
    // Anwendung von min-height, was fälschlich als zu kleines Ziel auffällt).
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await page.waitForLoadState('networkidle')
    // Nur Produkt-Bedienelemente (.pc-btn) — ein ungefiltertes `button:visible`
    // trifft im Dev-Modus zusätzlich Next.js' eigenen Dev-Tools-Button
    // (#next-logo, 32×32px, kein Produktbestandteil, existiert im Build nicht).
    const knoepfe = page.locator('button.pc-btn:visible, a.pc-btn:visible')
    const anzahl = await knoepfe.count()
    expect(anzahl).toBeGreaterThan(0)
    for (let i = 0; i < anzahl; i++) {
      const box = await knoepfe.nth(i).boundingBox()
      if (!box) continue
      const text = (await knoepfe.nth(i).innerText()).slice(0, 40)
      expect(box.height, `Zu kleines Ziel: „${text}"`).toBeGreaterThanOrEqual(44)
    }
  })

  test('Formularfelder tragen eine Beschriftung', async ({ page }) => {
    await page.goto('/pflegecoach/anfrage')
    const felder = page.locator('input:visible, textarea:visible, select:visible')
    const anzahl = await felder.count()
    for (let i = 0; i < anzahl; i++) {
      const feld = felder.nth(i)
      const id = await feld.getAttribute('id')
      const ariaLabel = await feld.getAttribute('aria-label')
      const ariaBy = await feld.getAttribute('aria-labelledby')
      const hatLabelFor = id ? (await page.locator(`label[for="${id}"]`).count()) > 0 : false
      // Radios/Checkboxes hier sind implizit beschriftet: <label><input/>Text</label>
      // ohne eigene id. Das ist gültiges, zugängliches HTML (WCAG 1.3.1/4.1.2) —
      // die Prüfung muss auch diese Form akzeptieren, nicht nur label[for].
      const hatUmschließendesLabel = await feld.evaluate(el => el.closest('label') !== null)
      expect(
        hatLabelFor || hatUmschließendesLabel || Boolean(ariaLabel) || Boolean(ariaBy),
        `Feld ${id ?? i} hat keine Beschriftung`
      ).toBe(true)
    }
  })

  test('die Seite bleibt bei doppelter Schriftgröße bedienbar', async ({ page }) => {
    // Kein Ersatz für den Reflow-Prüfpunkt, aber der Fall, der die
    // Zielgruppe tatsächlich betrifft: sehr große Schrift.
    await page.goto('/pflegecoach/start')
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' })
    const ueberlauf = await page.evaluate(() =>
      document.documentElement.scrollWidth > document.documentElement.clientWidth + 2
    )
    expect(ueberlauf, 'Die Seite läuft bei 200 % Schriftgröße seitlich über').toBe(false)
  })
})
