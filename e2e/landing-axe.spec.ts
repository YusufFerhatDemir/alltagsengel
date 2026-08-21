import { test, expect } from '@playwright/test'
import { join } from 'node:path'

/**
 * B-10 — Maschineller Accessibility-Durchgang (axe-core) für die
 * öffentlichen Hauptseiten, plus Laufzeitprüfung des Fokus-Managements.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WARUM ES DIESE DATEI GIBT
 * ────────────────────────────────────────────────────────────────────────────
 * `docs/BARRIEREFREIHEIT_AUDIT.md` war bis 21.08.2026 eine reine
 * QUELLCODE-Analyse. Sie konnte zwei Klassen von Mängeln grundsätzlich nicht
 * sehen:
 *
 *   1. Laufzeitbefunde — berechnete Kontraste, ARIA-Bezüge über
 *      Komponentengrenzen hinweg, erst durch Interaktion entstehende Zustände.
 *   2. Fokus-Verhalten — ob der Tastaturfokus beim Öffnen eines Dialogs
 *      hineinspringt, drin bleibt und danach zurückkehrt (WCAG 2.1.2, 2.4.3).
 *      `aria-modal="true"` verbirgt den Hintergrund nur für Screenreader; der
 *      Fokus wandert ohne eigenes Zutun trotzdem dahinter.
 *
 * Der zweite Block unten prüft genau das an einem echten, geöffneten Dialog.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WAS DIESER LAUF NICHT IST
 * ────────────────────────────────────────────────────────────────────────────
 * Kein Screenreader-Durchgang und keine BITV-Prüfung nach Prüfschritten.
 * axe-core entscheidet nur, was maschinell entscheidbar ist — nicht, ob eine
 * Ansage verständlich, ein Alternativtext inhaltlich richtig oder eine
 * Vorlese-Reihenfolge sinnvoll ist. Der manuelle Durchgang mit NVDA/VoiceOver
 * bleibt offen (siehe Audit, Abschnitt „Nicht geprüft").
 *
 * Aufbau bewusst identisch zu `e2e/pflegecoach-axe.spec.ts`: axe-core wird als
 * Skript in die Seite injiziert, statt `@axe-core/playwright` aufzunehmen.
 * `axe-core` ist seit 21.08.2026 eine ausdrückliche devDependency — vorher kam
 * es nur transitiv über `eslint-config-next` herein, ein Bump der Lint-Config
 * hätte die A11y-Suite still lahmgelegt.
 *
 * Lauf:  npx playwright test e2e/landing-axe.spec.ts --project=chromium
 *        (gegen PLAYWRIGHT_BASE_URL, Default http://localhost:3000)
 */

const AXE_PFAD = join(process.cwd(), 'node_modules', 'axe-core', 'axe.min.js')

/**
 * Öffentliche Seiten ohne Anmeldung. Bewusst keine Portal-Routen: dieselbe
 * Datensparsamkeitsregel wie in den übrigen E2E-Tests — keine Anmeldung,
 * keine echten Nutzerdaten.
 */
const OEFFENTLICHE_SEITEN = [
  '/',
  '/alltagsbegleitung',
  '/finanzierung',
  '/kontakt',
] as const

/** WCAG 2.1 Stufen A und AA — der für BITV 2.0 maßgebliche Prüfumfang. */
const REGELSATZ = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] as const

/**
 * ALTLASTEN — bekannte, dokumentierte Verstöße auf den Marketing-Seiten.
 *
 * Diese Regeln schlagen beim ersten axe-Lauf gegen die Produktion (21.08.2026)
 * an. Sie stammen NICHT aus dem Fokus-Umbau, sondern sind Bestand, den die
 * statische Quellcode-Analyse des 1. Durchgangs nicht sehen konnte — genau der
 * Grund, warum dieser Lauf existiert. Siehe `docs/BARRIEREFREIHEIT_AUDIT.md`,
 * Befunde B-15 bis B-17.
 *
 * Der Test läuft deshalb als **Sperrklinke**, nicht als Ampel: Ein Verstoß gegen
 * eine Regel, die hier NICHT steht, lässt den Lauf scheitern. Die Altlasten
 * werden bei jedem Lauf mit Knotenzahl protokolliert, damit sie sichtbar bleiben
 * und nicht stillschweigend wachsen.
 *
 * Diese Liste ist zum Schrumpfen da. Wird ein Befund behoben, gehört sein
 * Eintrag hier gelöscht — dann hält der Test das Ergebnis fest.
 */
const ALTLASTEN: Record<string, string> = {
  'color-contrast':
    'B-15 — Marketing-Fließtext (.lp-text, Preiskarten) unter 4,5:1. Betrifft ' +
    'Landingpage-Varianten, nicht die im 1. Durchgang korrigierten Tokens.',
  'nested-interactive':
    'B-16 — verschachtelte Bedienelemente in einer SVG-Grafik (viewBox 0 0 400 290).',
  'scrollable-region-focusable':
    'B-17 — scrollbarer Bereich ohne Tastaturzugang (Startseite, Abschnitt 5).',
}

interface AxeVerstoss {
  id: string
  impact: string | null
  help: string
  knoten: number
  ziele: string[]
}

async function axeLauf(
  page: import('@playwright/test').Page,
  regelsatz: readonly string[] = REGELSATZ,
): Promise<{ verstoesse: AxeVerstoss[]; bestanden: number; unvollstaendig: AxeVerstoss[] }> {
  await page.addScriptTag({ path: AXE_PFAD })
  return page.evaluate(async (tags) => {
    // @ts-expect-error — axe wird zur Laufzeit injiziert
    const r = await window.axe.run(document, { runOnly: { type: 'tag', values: tags } })
    const abbilden = (v: any) => ({
      id: v.id,
      impact: v.impact ?? null,
      help: v.help,
      knoten: v.nodes.length,
      ziele: v.nodes.slice(0, 5).map((n: any) => String(n.target[0])),
    })
    return {
      verstoesse: r.violations.map(abbilden),
      bestanden: r.passes.length,
      unvollstaendig: r.incomplete.map(abbilden),
    }
  }, [...regelsatz])
}

// ═══════════════════════════════════════════════════════════════════════════
// 1 — Regelbasierter Durchgang
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Der Dev-Server übersetzt jede Route beim ersten Aufruf — auf der Startseite
 * dauert das über eine Minute und sprengt das 30-Sekunden-Standardbudget.
 * Gegen einen gebauten Preview (CI) ist der Aufruf sofort da; das großzügige
 * Budget kostet dort nichts, weil es nur eine Obergrenze ist.
 */
const SEITEN_BUDGET_MS = 180_000

test.describe('Öffentliche Seiten — axe-core WCAG 2.1 A/AA', () => {
  test.slow()
  test.setTimeout(SEITEN_BUDGET_MS)

  for (const pfad of OEFFENTLICHE_SEITEN) {
    test(`${pfad} ist frei von axe-Verstößen (WCAG 2.1 A/AA)`, async ({ page }) => {
      await page.goto(pfad)
      await page.waitForLoadState('load')

      const ergebnis = await axeLauf(page)

      // Auch bei Erfolg protokollieren: sonst bleibt offen, WIE VIEL geprüft
      // wurde, und ein leeres Ergebnis sähe aus wie ein bestandener Lauf.
      console.log(
        `[axe] ${pfad}: ${ergebnis.bestanden} Regeln bestanden, ` +
          `${ergebnis.verstoesse.length} Verstöße, ` +
          `${ergebnis.unvollstaendig.length} manuell zu klären`,
      )
      for (const u of ergebnis.unvollstaendig) {
        console.log(`[axe]   manuell zu klären: ${u.id} (${u.knoten} Knoten) — ${u.help}`)
      }
      for (const v of ergebnis.verstoesse) {
        console.log(
          `[axe]   VERSTOSS ${v.id} [${v.impact}] ${v.knoten}× — ${v.help}\n` +
            `[axe]     ${v.ziele.join(' | ')}`,
        )
      }

      const altlast = ergebnis.verstoesse.filter((v) => v.id in ALTLASTEN)
      const neu = ergebnis.verstoesse.filter((v) => !(v.id in ALTLASTEN))
      for (const a of altlast) {
        console.log(`[axe]   ALTLAST ${a.id}: ${a.knoten} Knoten — ${ALTLASTEN[a.id]}`)
      }

      expect(
        neu,
        `NEUE axe-Verstöße auf ${pfad} (nicht in der Altlasten-Liste):\n` +
          `${JSON.stringify(neu, null, 2)}`,
      ).toEqual([])
    })
  }

  test('Startseite: Sprungmarke zeigt auf ein Ziel, das es wirklich gibt', async ({ page }) => {
    // Eine Sprungmarke ins Leere ist schlimmer als keine: der Fokus
    // verschwindet, ohne dass etwas passiert (WCAG 2.4.1).
    await page.goto('/')
    await page.waitForLoadState('load')

    const marke = await page.evaluate(() => {
      const a = document.querySelector<HTMLAnchorElement>('a.skip-link, a[href^="#main"]')
      if (!a) return null
      const ziel = (a.getAttribute('href') ?? '').slice(1)
      return { text: a.textContent?.trim() ?? '', ziel, trifft: !!document.getElementById(ziel) }
    })

    expect(marke, 'Startseite: keine Sprungmarke zum Hauptinhalt gefunden').not.toBeNull()
    expect(marke!.trifft, `Sprungmarke zeigt auf „#${marke!.ziel}", das Element fehlt`).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 2 — Fokus-Management an einem echten Dialog (WCAG 2.1.2, 2.4.3, 2.1.1)
//
// Prüfgegenstand ist der Rückruf-Dialog auf der Startseite: der einzige
// modale Dialog, der ohne Anmeldung erreichbar ist. Er benutzt dieselbe
// Fokus-Falle (`useFokusFalle` aus lib/a11y.ts) wie die 30 Dialoge im
// Admin-, MIS- und Portalbereich — was hier grün ist, gilt dort ebenso.
// ═══════════════════════════════════════════════════════════════════════════

/** Das Widget blendet sich erst nach 3 s ein — sonst greift der Klick ins Leere. */
async function rueckrufDialogOeffnen(page: import('@playwright/test').Page) {
  const ausloeser = page.getByRole('button', { name: 'Rückruf anfordern' })
  await ausloeser.waitFor({ state: 'visible', timeout: 15_000 })
  await ausloeser.focus()
  await ausloeser.click()
  const dialog = page.getByRole('dialog', { name: 'Rückrufservice' })
  await dialog.waitFor({ state: 'visible' })
  return { ausloeser, dialog }
}

test.describe('Fokus-Management modaler Dialoge', () => {
  test.slow()
  test.setTimeout(SEITEN_BUDGET_MS)

  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('load')
  })

  test('beim Öffnen springt der Fokus in den Dialog', async ({ page }) => {
    await rueckrufDialogOeffnen(page)

    const drin = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]')
      return !!dialog && !!document.activeElement && dialog.contains(document.activeElement)
    })
    expect(drin, 'Fokus steht nach dem Öffnen nicht im Dialog').toBe(true)
  })

  test('Tab bleibt im Dialog gefangen und läuft im Kreis', async ({ page }) => {
    const { dialog } = await rueckrufDialogOeffnen(page)

    const anzahl = await dialog.evaluate(
      (el) =>
        el.querySelectorAll(
          'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
        ).length,
    )
    expect(anzahl, 'Dialog ohne bedienbare Elemente — Test wäre aussagelos').toBeGreaterThan(1)

    // Einmal komplett herum plus zwei Schritte: wer nicht gefangen ist,
    // landet spätestens hier auf der Seite dahinter.
    for (let i = 0; i < anzahl + 2; i++) {
      await page.keyboard.press('Tab')
      const drin = await page.evaluate(() => {
        const d = document.querySelector('[role="dialog"]')
        return !!d && !!document.activeElement && d.contains(document.activeElement)
      })
      expect(drin, `Fokus nach ${i + 1}× Tab aus dem Dialog entkommen`).toBe(true)
    }

    // Rückwärts ebenso — Shift+Tab am ersten Element muss ans Ende springen.
    for (let i = 0; i < anzahl + 2; i++) {
      await page.keyboard.press('Shift+Tab')
      const drin = await page.evaluate(() => {
        const d = document.querySelector('[role="dialog"]')
        return !!d && !!document.activeElement && d.contains(document.activeElement)
      })
      expect(drin, `Fokus nach ${i + 1}× Shift+Tab aus dem Dialog entkommen`).toBe(true)
    }
  })

  test('ESC schließt den Dialog', async ({ page }) => {
    const { dialog } = await rueckrufDialogOeffnen(page)
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  })

  test('nach dem Schließen kehrt der Fokus zum auslösenden Element zurück', async ({ page }) => {
    const { ausloeser, dialog } = await rueckrufDialogOeffnen(page)
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(ausloeser).toBeFocused()
  })

  test('der geöffnete Dialog ist selbst frei von axe-Verstößen', async ({ page }) => {
    // Dialoge entstehen erst durch Interaktion — im Seitenlauf oben ist ihr
    // Markup gar nicht im DOM und wird deshalb nie geprüft.
    await rueckrufDialogOeffnen(page)
    const ergebnis = await axeLauf(page)
    console.log(
      `[axe] Rückruf-Dialog offen: ${ergebnis.bestanden} Regeln bestanden, ` +
        `${ergebnis.verstoesse.length} Verstöße`,
    )
    for (const v of ergebnis.verstoesse) {
      console.log(`[axe]   VERSTOSS ${v.id} [${v.impact}] ${v.knoten}× — ${v.help}`)
    }
    // Der Lauf erfasst die ganze Seite, also auch deren Altlasten. Geprüft wird
    // hier, dass der Dialog selbst keine NEUE Regel bricht.
    const neu = ergebnis.verstoesse.filter((v) => !(v.id in ALTLASTEN))
    expect(
      neu,
      `NEUE axe-Verstöße im offenen Dialog:\n${JSON.stringify(neu, null, 2)}`,
    ).toEqual([])
  })
})
