import { test, expect } from '@playwright/test'
import { join } from 'node:path'

/**
 * BF-03 — Maschineller Accessibility-Durchgang (axe-core) für den PflegeCoach.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WAS DIESER LAUF IST — UND WAS ER NICHT IST
 * ────────────────────────────────────────────────────────────────────────────
 * Dies ist eine REGELBASIERTE Strukturprüfung, kein Screenreader-Durchgang.
 * axe-core prüft den gerenderten DOM gegen die WCAG-2.1-A/AA-Regelsätze und
 * findet ausschließlich das, was maschinell entscheidbar ist: fehlende
 * Alternativtexte, unzureichende Kontrastwerte, fehlende Beschriftungen,
 * ungültige ARIA-Attribute, fehlende oder doppelte Landmarks.
 *
 * axe-core kann NICHT beurteilen:
 *   • ob eine Ansage verständlich ist,
 *   • ob eine Live-Region zum richtigen Zeitpunkt spricht,
 *   • ob ein Alternativtext inhaltlich stimmt,
 *   • ob die Vorlese-Reihenfolge sinnvoll ist,
 *   • ob eine Fokusfalle in einer echten Screenreader-Bedienung entsteht.
 * Die Herstellerdokumentation von axe-core beziffert die maschinell
 * abdeckbare Menge selbst als Teilmenge — der manuelle Durchgang mit
 * VoiceOver/NVDA (Prüfpunkte S1–S8) bleibt erforderlich. Siehe
 * docs/dipa/14_ACCESSIBILITY_GAP_LISTE.md §3.3.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * AUFBAU
 * ────────────────────────────────────────────────────────────────────────────
 * axe-core liegt bereits im Baum (transitive Abhängigkeit, Version 4.11.3);
 * es wird als Skript in die Seite injiziert, statt eine neue Abhängigkeit
 * (@axe-core/playwright) aufzunehmen. Geprüft werden ausschließlich die drei
 * ÖFFENTLICHEN Seiten — dieselbe Datensparsamkeitsregel wie in
 * e2e/pflegecoach.spec.ts: keine Anmeldung, keine echten Nutzerdaten.
 *
 * Lauf:  npx playwright test e2e/pflegecoach-axe.spec.ts --project=chromium
 *        (gegen PLAYWRIGHT_BASE_URL, Default http://localhost:3000)
 */

const AXE_PFAD = join(process.cwd(), 'node_modules', 'axe-core', 'axe.min.js')

const OEFFENTLICHE_SEITEN = [
  '/pflegecoach/start',
  '/pflegecoach/datenschutz',
  '/pflegecoach/anfrage',
] as const

/** WCAG-2.1-Stufen A und AA — der für die DiPA maßgebliche Prüfumfang. */
const REGELSATZ = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] as const

interface AxeVerstoss {
  id: string
  impact: string | null
  help: string
  knoten: number
  ziele: string[]
}

interface AxeErgebnis {
  verstoesse: AxeVerstoss[]
  bestanden: number
  unvollstaendig: { id: string; help: string; knoten: number; ziele: string[] }[]
}

async function axeLauf(page: import('@playwright/test').Page): Promise<AxeErgebnis> {
  await page.addScriptTag({ path: AXE_PFAD })
  return page.evaluate(async (tags) => {
    // @ts-expect-error — axe wird zur Laufzeit injiziert
    const r = await window.axe.run(document, { runOnly: { type: 'tag', values: tags } })
    return {
      verstoesse: r.violations.map((v: any) => ({
        id: v.id,
        impact: v.impact ?? null,
        help: v.help,
        knoten: v.nodes.length,
        ziele: v.nodes.slice(0, 5).map((n: any) => String(n.target[0])),
      })),
      bestanden: r.passes.length,
      unvollstaendig: r.incomplete.map((i: any) => ({
        id: i.id,
        help: i.help,
        knoten: i.nodes.length,
        ziele: i.nodes.slice(0, 5).map((n: any) => String(n.target[0])),
      })),
    }
  }, [...REGELSATZ])
}

test.describe('PflegeCoach — axe-core WCAG 2.1 A/AA (BF-03, maschineller Teil)', () => {
  for (const pfad of OEFFENTLICHE_SEITEN) {
    test(`${pfad} ist frei von axe-Verstößen (WCAG 2.1 A/AA)`, async ({ page }) => {
      await page.goto(pfad)
      await page.waitForLoadState('networkidle')

      const ergebnis = await axeLauf(page)

      // Vollständige Ausgabe ins Testprotokoll — auch bei Erfolg, damit
      // nachvollziehbar bleibt, WIE VIEL geprüft wurde und nicht nur, dass
      // nichts gefunden wurde.
      console.log(
        `[axe] ${pfad}: ${ergebnis.bestanden} Regeln bestanden, ` +
          `${ergebnis.verstoesse.length} Verstöße, ` +
          `${ergebnis.unvollstaendig.length} manuell zu klären`,
      )
      for (const u of ergebnis.unvollstaendig) {
        console.log(
          `[axe]   manuell zu klären: ${u.id} (${u.knoten} Knoten) — ${u.help}\n` +
            `[axe]     ${u.ziele.join(' | ')}`,
        )
      }
      for (const v of ergebnis.verstoesse) {
        console.log(
          `[axe]   VERSTOSS ${v.id} [${v.impact}] ${v.knoten}× — ${v.help}\n` +
            `[axe]     ${v.ziele.join(' | ')}`,
        )
      }

      expect(
        ergebnis.verstoesse,
        `axe-Verstöße auf ${pfad}:\n${JSON.stringify(ergebnis.verstoesse, null, 2)}`,
      ).toEqual([])
    })
  }

  test('/pflegecoach/anfrage bleibt auch mit ausgeklapptem Formular sauber', async ({ page }) => {
    // Formularseiten verstecken ihre kritischen Regeln oft hinter Interaktion:
    // Fehlermeldungen, aria-invalid, aria-describedby entstehen erst beim
    // Absenden. Es wird bewusst NICHT abgeschickt (keine echten Daten) —
    // nur die Pflichtfeld-Validierung des Browsers ausgelöst.
    await page.goto('/pflegecoach/anfrage')
    await page.waitForLoadState('networkidle')

    const absenden = page.locator('form button[type="submit"]').first()
    if (await absenden.count()) {
      await absenden.click({ trial: false }).catch(() => {})
      await page.waitForTimeout(500)
    }

    const ergebnis = await axeLauf(page)
    console.log(
      `[axe] /pflegecoach/anfrage (nach Absendeversuch): ` +
        `${ergebnis.bestanden} Regeln bestanden, ${ergebnis.verstoesse.length} Verstöße`,
    )
    for (const v of ergebnis.verstoesse) {
      console.log(`[axe]   VERSTOSS ${v.id} [${v.impact}] ${v.knoten}× — ${v.help}`)
    }

    expect(
      ergebnis.verstoesse,
      `axe-Verstöße nach Absendeversuch:\n${JSON.stringify(ergebnis.verstoesse, null, 2)}`,
    ).toEqual([])
  })

  test('Schaltflächen erfüllen den Kontrastwert 4,5:1 gegen ihren eigenen Hintergrund', async ({
    page,
  }) => {
    // Diese Prüfung existiert, WEIL axe-core den Fall nicht als Verstoß
    // meldet: bei `.pc-btn` lag am 14.08.2026 Vordergrund- gleich
    // Hintergrundfarbe (rgb(11,83,148) auf rgb(11,83,148), Kontrast 1:1,
    // Text unsichtbar), axe stufte das nur als „incomplete / manuell zu
    // klären" ein. Ursache war die CSS-Spezifität: `.pc-root a` (0,1,1)
    // schlägt `.pc-btn` (0,1,0), Link-Buttons erbten die Linkfarbe.
    // Behoben in app/pflegecoach/pflegecoach.css; dieser Test hält den
    // Zustand fest, statt sich auf axes Einstufung zu verlassen.
    for (const pfad of OEFFENTLICHE_SEITEN) {
      await page.goto(pfad)
      await page.waitForLoadState('networkidle')

      const schwach = await page.evaluate(() => {
        const kanal = (c: number) => {
          const s = c / 255
          return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
        }
        const leuchtdichte = (rgb: number[]) =>
          0.2126 * kanal(rgb[0]) + 0.7152 * kanal(rgb[1]) + 0.0722 * kanal(rgb[2])
        const zahlen = (s: string) => (s.match(/\d+(\.\d+)?/g) ?? []).map(Number)
        /** Erster nicht-transparenter Hintergrund in der Elternkette. */
        const hintergrund = (el: Element | null): number[] => {
          while (el) {
            const bg = zahlen(getComputedStyle(el).backgroundColor)
            if (bg.length >= 3 && (bg.length < 4 || bg[3] > 0)) return bg.slice(0, 3)
            el = el.parentElement
          }
          return [255, 255, 255]
        }
        return Array.from(document.querySelectorAll('.pc-btn'))
          .filter((el) => (el as HTMLElement).offsetParent !== null)
          .map((el) => {
            const vg = zahlen(getComputedStyle(el).color).slice(0, 3)
            const hg = hintergrund(el)
            const [hell, dunkel] = [leuchtdichte(vg), leuchtdichte(hg)].sort((a, b) => b - a)
            return {
              text: (el.textContent ?? '').trim().slice(0, 30),
              verhaeltnis: Number(((hell + 0.05) / (dunkel + 0.05)).toFixed(2)),
            }
          })
          .filter((e) => e.verhaeltnis < 4.5)
      })

      expect(schwach, `${pfad}: Schaltflächen unter 4,5:1`).toEqual([])
    }
  })

  test('ARIA-Landmarks und Rollen sind auf jeder öffentlichen Seite vollständig', async ({
    page,
  }) => {
    // Ergänzt die axe-Regeln um eine explizite Landmark-Inventur: axe meldet
    // fehlende/doppelte Landmarks, listet aber nicht auf, WELCHE vorhanden
    // sind. Für den DiPA-Nachweis ist genau diese Liste der Beleg.
    for (const pfad of OEFFENTLICHE_SEITEN) {
      await page.goto(pfad)
      await page.waitForLoadState('networkidle')

      const inventur = await page.evaluate(() => {
        const rolle = (el: Element) =>
          el.getAttribute('role') ??
          { HEADER: 'banner', NAV: 'navigation', MAIN: 'main', FOOTER: 'contentinfo' }[
            el.tagName
          ] ??
          el.tagName.toLowerCase()
        return {
          landmarks: Array.from(
            document.querySelectorAll('header,nav,main,footer,[role]'),
          ).map(rolle),
          h1: document.querySelectorAll('h1').length,
          ueberschriften: Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6')).map((h) =>
            Number(h.tagName[1]),
          ),
          lang: document.documentElement.lang,
          eingaben: Array.from(document.querySelectorAll('input,select,textarea')).filter(
            (e) => (e as HTMLInputElement).type !== 'hidden',
          ).length,
          eingabenOhneLabel: Array.from(
            document.querySelectorAll('input,select,textarea'),
          ).filter((e) => {
            const el = e as HTMLInputElement
            if (el.type === 'hidden') return false
            if (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')) return false
            if (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) return false
            return !el.closest('label')
          }).length,
          knoepfeOhneNamen: Array.from(document.querySelectorAll('button')).filter(
            (b) =>
              !b.textContent?.trim() &&
              !b.getAttribute('aria-label') &&
              !b.getAttribute('aria-labelledby') &&
              !b.getAttribute('title'),
          ).length,
        }
      })

      console.log(`[landmarks] ${pfad}: ${JSON.stringify(inventur)}`)

      expect(inventur.lang, `${pfad}: <html lang> fehlt`).toBe('de')
      expect(inventur.h1, `${pfad}: genau eine h1 erwartet`).toBe(1)
      expect(inventur.landmarks, `${pfad}: main-Landmark fehlt`).toContain('main')
      expect(inventur.landmarks, `${pfad}: contentinfo-Landmark fehlt`).toContain('contentinfo')
      expect(inventur.eingabenOhneLabel, `${pfad}: Eingabefelder ohne Beschriftung`).toBe(0)
      expect(inventur.knoepfeOhneNamen, `${pfad}: Schaltflächen ohne zugänglichen Namen`).toBe(0)

      // Überschriftenhierarchie darf keine Ebene überspringen (WCAG 1.3.1).
      let vorher = 0
      for (const stufe of inventur.ueberschriften) {
        if (vorher !== 0) {
          expect(
            stufe - vorher,
            `${pfad}: Überschriftensprung h${vorher} → h${stufe}`,
          ).toBeLessThanOrEqual(1)
        }
        vorher = stufe
      }
    }
  })
})
