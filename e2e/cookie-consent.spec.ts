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

async function rohwert(page: import('@playwright/test').Page) {
  return page.evaluate((k) => window.localStorage.getItem(k), SCHLUESSEL)
}

/**
 * Die gespeicherte Entscheidung als Kategorien.
 *
 * Liest bewusst nicht die Schreibweise, sondern den Inhalt — sonst prueft
 * dieser Spec das Speicherformat und nicht die Einwilligung. `null` heisst
 * „noch nicht entschieden".
 */
async function entscheidung(page: import('@playwright/test').Page) {
  const roh = await rohwert(page)
  if (!roh) return null
  const o = JSON.parse(roh) as Record<string, unknown>
  return { statistik: o.statistik === true, marketing: o.marketing === true }
}

test.describe('Cookie-Banner', () => {
  test.slow()

  test('erscheint beim ersten Besuch', async ({ page }) => {
    await page.goto('/')
    await expect(banner(page)).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('button', { name: 'Nur Notwendige' })).toBeVisible()
    // Vor der Antwort darf nichts gespeichert sein: ein vorab gesetzter Wert
    // waere eine Einwilligung, die niemand erteilt hat.
    expect(await rohwert(page)).toBeNull()
  })

  test('Ablehnen wird gespeichert und schliesst den Banner', async ({ page }) => {
    await page.goto('/')
    await expect(banner(page)).toBeVisible({ timeout: 15_000 })
    await page.getByRole('button', { name: 'Nur notwendige' }).click()
    await expect(banner(page)).toBeHidden()
    // Ablehnen heisst: KEINE der abwaehlbaren Kategorien ist erlaubt.
    expect(await entscheidung(page)).toEqual({ statistik: false, marketing: false })
  })

  test('Annehmen wird gespeichert und schliesst den Banner', async ({ page }) => {
    await page.goto('/')
    await expect(banner(page)).toBeVisible({ timeout: 15_000 })
    await banner(page).click()
    await expect(banner(page)).toBeHidden()
    expect(await entscheidung(page)).toEqual({ statistik: true, marketing: true })
  })

  test('die Antwort ueberlebt den Reload — der Banner kommt nicht wieder', async ({ page }) => {
    await page.goto('/')
    await expect(banner(page)).toBeVisible({ timeout: 15_000 })
    await page.getByRole('button', { name: 'Nur notwendige' }).click()
    await expect(banner(page)).toBeHidden()

    await page.reload()
    await page.waitForLoadState('load')
    // Deutlich laenger warten als die 800 ms der Komponente: ein Banner, der
    // erst nach der Zusicherung auftaucht, wuerde sonst durchrutschen.
    await page.waitForTimeout(2_000)
    await expect(banner(page)).toBeHidden()
    expect(await entscheidung(page)).toEqual({ statistik: false, marketing: false })
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
    await page.getByRole('button', { name: 'Nur notwendige' }).click()
    expect(await entscheidung(page)).toEqual({ statistik: false, marketing: false })
  })

  test('eine EINZELNE Kategorie laesst sich erlauben', async ({ page }) => {
    // Der Kern der Umstellung: wer der Reichweitenmessung zustimmen will,
    // aber nicht dem Retargeting, musste vorher alles ablehnen.
    await page.goto('/')
    await expect(banner(page)).toBeVisible({ timeout: 15_000 })

    await page.getByRole('button', { name: 'Einstellungen anpassen' }).click()
    await page.getByLabel(/Statistik und Analyse/).check()
    await page.getByRole('button', { name: 'Auswahl speichern' }).click()

    await expect(banner(page)).toBeHidden()
    expect(await entscheidung(page)).toEqual({ statistik: true, marketing: false })
  })

  test('Notwendig laesst sich nicht abwaehlen', async ({ page }) => {
    await page.goto('/')
    await expect(banner(page)).toBeVisible({ timeout: 15_000 })
    await page.getByRole('button', { name: 'Einstellungen anpassen' }).click()

    const notwendig = page.getByLabel(/Notwendig/)
    await expect(notwendig).toBeChecked()
    await expect(notwendig).toBeDisabled()
  })

  test('beide Hauptknoepfe sind gleich gross — keine gestalterische Schieflage', async ({ page }) => {
    // Art. 4 Nr. 11 DSGVO: eine Einwilligung, die ueber eine optische
    // Bevorzugung zustande kommt, ist nicht freiwillig. Geprueft wird die
    // tatsaechlich gerenderte Groesse, nicht die Absicht im Stylesheet.
    await page.goto('/')
    await expect(banner(page)).toBeVisible({ timeout: 15_000 })

    const ablehnen = await page.getByRole('button', { name: 'Nur notwendige' }).boundingBox()
    const annehmen = await banner(page).boundingBox()
    expect(ablehnen).not.toBeNull()
    expect(annehmen).not.toBeNull()
    expect(Math.abs(ablehnen!.height - annehmen!.height)).toBeLessThanOrEqual(2)
    expect(Math.abs(ablehnen!.width - annehmen!.width)).toBeLessThanOrEqual(2)
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
