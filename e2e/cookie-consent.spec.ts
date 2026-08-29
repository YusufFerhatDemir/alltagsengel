import { test, expect } from '@playwright/test'
import { join } from 'node:path'

/**
 * Cookie-Banner — Einwilligung nach DSGVO Art. 6 Abs. 1 lit. a und Art. 7.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WARUM ES DIESE DATEI GIBT
 * ────────────────────────────────────────────────────────────────────────────
 * Der Banner war bis hierher in keinem Spec Gegenstand. Er tauchte in den
 * axe-Laeufen nur als Beifang auf — mal war er zum Messzeitpunkt schon da,
 * mal noch nicht (er erscheint erst 800 ms nach dem Laden). Damit war die
 * Einwilligung selbst ungeprueft: dass sie erscheint, dass BEIDE Antworten
 * gespeichert werden, dass sie den Reload ueberlebt, und dass sie sich
 * widerrufen laesst (Art. 7 Abs. 3 — „so einfach wie die Erteilung").
 *
 * Seit 29.08.2026 beantworten die uebrigen Specs den Banner vorweg
 * (`e2e/helpers/consent.ts`), weil er auf `mobile-safari` ueber den
 * Absende-Knoepfen liegt. Ohne diese Datei waere er damit vollstaendig aus
 * der Suite gefallen — ein Riegel, den niemand mehr prueft, weil ihn alle
 * umgehen. Hier ist er deshalb ausdruecklich der Gegenstand, und der Helfer
 * wird ausdruecklich NICHT benutzt.
 */

const AXE_PFAD = join(process.cwd(), 'node_modules', 'axe-core', 'axe.min.js')
const SCHLUESSEL = 'ae_cookie_consent'

/** Der Banner erscheint verzoegert — die Komponente wartet 800 ms. */
const banner = (page: import('@playwright/test').Page) =>
  page.getByRole('button', { name: 'Alle akzeptieren' })

async function gespeicherteAntwort(page: import('@playwright/test').Page) {
  return page.evaluate((k) => window.localStorage.getItem(k), SCHLUESSEL)
}

test.describe('Cookie-Banner', () => {
  test.slow()

  test('erscheint beim ersten Besuch', async ({ page }) => {
    await page.goto('/')
    await expect(banner(page)).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('button', { name: 'Nur Notwendige' })).toBeVisible()
    // Vor der Antwort darf nichts gespeichert sein: ein vorab gesetzter Wert
    // waere eine Einwilligung, die niemand erteilt hat.
    expect(await gespeicherteAntwort(page)).toBeNull()
  })

  test('Ablehnen wird gespeichert und schliesst den Banner', async ({ page }) => {
    await page.goto('/')
    await expect(banner(page)).toBeVisible({ timeout: 15_000 })
    await page.getByRole('button', { name: 'Nur Notwendige' }).click()
    await expect(banner(page)).toBeHidden()
    expect(await gespeicherteAntwort(page)).toBe('rejected')
  })

  test('Annehmen wird gespeichert und schliesst den Banner', async ({ page }) => {
    await page.goto('/')
    await expect(banner(page)).toBeVisible({ timeout: 15_000 })
    await banner(page).click()
    await expect(banner(page)).toBeHidden()
    expect(await gespeicherteAntwort(page)).toBe('accepted')
  })

  test('die Antwort ueberlebt den Reload — der Banner kommt nicht wieder', async ({ page }) => {
    await page.goto('/')
    await expect(banner(page)).toBeVisible({ timeout: 15_000 })
    await page.getByRole('button', { name: 'Nur Notwendige' }).click()
    await expect(banner(page)).toBeHidden()

    await page.reload()
    await page.waitForLoadState('load')
    // Deutlich laenger warten als die 800 ms der Komponente: ein Banner, der
    // erst nach der Zusicherung auftaucht, wuerde sonst durchrutschen.
    await page.waitForTimeout(2_000)
    await expect(banner(page)).toBeHidden()
    expect(await gespeicherteAntwort(page)).toBe('rejected')
  })

  test('Widerruf ueber den Footer oeffnet den Banner erneut (Art. 7 Abs. 3)', async ({ page }) => {
    await page.goto('/')
    await expect(banner(page)).toBeVisible({ timeout: 15_000 })
    await banner(page).click()
    await expect(banner(page)).toBeHidden()

    const widerruf = page.getByRole('button', { name: 'Cookie-Einstellungen' })
    await widerruf.scrollIntoViewIfNeeded()
    await widerruf.click()
    await expect(banner(page)).toBeVisible()

    // Und der Widerruf muss auch WIRKEN, nicht nur den Banner zeigen.
    await page.getByRole('button', { name: 'Nur Notwendige' }).click()
    expect(await gespeicherteAntwort(page)).toBe('rejected')
  })

  test('der offene Banner ist frei von axe-Verstoessen', async ({ page }) => {
    await page.goto('/')
    await expect(banner(page)).toBeVisible({ timeout: 15_000 })
    await page.addScriptTag({ path: AXE_PFAD })

    const ergebnis = await page.evaluate(async () => {
      // Nur der Banner selbst — die Altlasten der Startseite pruefen die
      // axe-Laeufe in landing-axe.spec.ts, und sie hier mitzuzaehlen wuerde
      // diesen Test von fremden Befunden abhaengig machen.
      const wurzel = document.evaluate(
        "//button[normalize-space(text())='Alle akzeptieren']",
        document, null, 9, null,
      ).singleNodeValue as HTMLElement | null
      const behaelter = wurzel?.closest('div[style]')?.parentElement?.parentElement ?? null
      // @ts-expect-error axe wird zur Laufzeit injiziert
      const r = await window.axe.run(behaelter ?? document, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
      })
      return {
        bestanden: r.passes.length,
        verstoesse: r.violations.map((v: { id: string; impact: string; help: string; nodes: unknown[] }) => ({
          id: v.id, impact: v.impact, help: v.help, knoten: v.nodes.length,
        })),
      }
    })

    console.log(
      `[axe] Cookie-Banner: ${ergebnis.bestanden} Regeln bestanden, ` +
        `${ergebnis.verstoesse.length} Verstoesse`,
    )
    for (const v of ergebnis.verstoesse) {
      console.log(`[axe]   VERSTOSS ${v.id} [${v.impact}] ${v.knoten}x — ${v.help}`)
    }
    expect(
      ergebnis.verstoesse,
      `axe-Verstoesse im Cookie-Banner:\n${JSON.stringify(ergebnis.verstoesse, null, 2)}`,
    ).toEqual([])
  })
})
