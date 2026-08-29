import { test, expect } from '@playwright/test'
import { join } from 'node:path'
import { cookieBannerVorwegBeantworten } from './helpers/consent'

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
 * (@axe-core/playwright) aufzunehmen. Geprüft werden ausschließlich die
 * ÖFFENTLICHEN Seiten (OEFFENTLICHE_SEITEN) — dieselbe
 * Datensparsamkeitsregel wie in e2e/pflegecoach.spec.ts: keine Anmeldung,
 * keine echten Nutzerdaten.
 *
 * Lauf:  npx playwright test e2e/pflegecoach-axe.spec.ts --project=chromium
 *        (gegen PLAYWRIGHT_BASE_URL, Default http://localhost:3000)
 */

const AXE_PFAD = join(process.cwd(), 'node_modules', 'axe-core', 'axe.min.js')

const OEFFENTLICHE_SEITEN = [
  '/pflegecoach/start',
  '/pflegecoach/datenschutz',
  '/pflegecoach/anfrage',
  '/pflegecoach/interoperabilitaet',
] as const

/** WCAG-2.1-Stufen A und AA — der für die DiPA maßgebliche Prüfumfang. */
const REGELSATZ = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] as const

/**
 * Zusätzlicher Regelsatz für den SCREENREADER-Teil (BF-03).
 *
 * Der WCAG-A/AA-Lauf oben deckt die Verstöße ab, die eine Seite
 * unzugänglich machen. Er lässt aber genau die Kategorie aus, die für
 * einen Screenreader den Unterschied zwischen „bedienbar" und „bedienbar,
 * aber unverständlich" macht: Überschriftenhierarchie, Landmark-Struktur
 * und die Vollständigkeit von Rolle/Name/Wert an interaktiven Elementen.
 * Vieles davon ist bei axe-core als „best-practice" eingestuft und damit
 * NICHT Teil von wcag2a/wcag2aa.
 *
 * Diese Kategorien sind die maschinell entscheidbare Teilmenge der
 * Prüfpunkte S1–S8 aus docs/dipa/14_ACCESSIBILITY_GAP_LISTE.md §3.3.
 * Der manuelle Durchgang mit VoiceOver/NVDA bleibt daneben erforderlich —
 * dieser Lauf ersetzt ihn nicht, er nimmt ihm die mechanische Arbeit ab.
 */
const SCREENREADER_REGELSATZ = [
  'cat.aria',
  'cat.name-role-value',
  'cat.structure',
  'cat.semantics',
] as const

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

async function axeLauf(
  page: import('@playwright/test').Page,
  regelsatz: readonly string[] = REGELSATZ,
): Promise<AxeErgebnis> {
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
  }, [...regelsatz])
}

// Der Cookie-Banner legt sich 800 ms nach dem Laden ueber den unteren
// Seitenrand und verdeckt auf `mobile-safari` die Absende-Knoepfe. Er wird
// deshalb vorweg beantwortet — geprueft wird er selbst in
// e2e/cookie-consent.spec.ts, nicht hier als Beifang.
test.beforeEach(async ({ page }) => {
  await cookieBannerVorwegBeantworten(page)
})

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

  // Je Seite ein eigener Testfall statt einer Schleife über alle Seiten.
  // Grund (15.08.2026): Mit der vierten öffentlichen Seite lief die Schleife
  // samt networkidle-Wartezeiten auf einem kalten Dev-Server über das
  // 30-Sekunden-Budget des EINEN Testfalls. Die Prüfungen sind unverändert —
  // sie bekommen nur jeweils ein eigenes Budget und laufen parallel.
  for (const pfad of OEFFENTLICHE_SEITEN) {
    test(`${pfad}: Schaltflächen erfüllen den Kontrastwert 4,5:1 gegen ihren eigenen Hintergrund`, async ({
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
    })
  }

  for (const pfad of OEFFENTLICHE_SEITEN) {
    test(`${pfad}: ARIA-Landmarks und Rollen sind vollständig`, async ({
      page,
    }) => {
      // Ergänzt die axe-Regeln um eine explizite Landmark-Inventur: axe meldet
      // fehlende/doppelte Landmarks, listet aber nicht auf, WELCHE vorhanden
      // sind. Für den DiPA-Nachweis ist genau diese Liste der Beleg.
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
    })
  }
})

// ═══════════════════════════════════════════════════════════════════════════
// BF-03 — Screenreader-Semantik, maschineller Teil
//
// Neu am 15.08.2026. Vorher war BF-03 ausschließlich als manueller
// VoiceOver/NVDA-Durchgang geplant und deshalb offen. Der manuelle
// Durchgang bleibt nötig (siehe Kopf dieser Datei) — aber alles, was eine
// Maschine entscheiden kann, wird jetzt bei jedem Lauf entschieden und
// nicht mehr einer Person überlassen, die es vergessen kann.
//
// Fundstelle für die Anforderung: Anlage 2 DiPAV, Themenfeld IV Nr. 13
// („Bedienhilfen ... insbesondere werden die aktuellsten Empfehlungen der
// DIN EN ISO 9241-171-Normenfamilie berücksichtigt") und Nr. 15
// („bietet Informationen auf mehr als eine Art der Interaktion an").
// ═══════════════════════════════════════════════════════════════════════════

test.describe('PflegeCoach — Screenreader-Semantik (BF-03, maschineller Teil)', () => {
  for (const pfad of OEFFENTLICHE_SEITEN) {
    test(`${pfad}: ARIA, Rolle/Name/Wert und Dokumentstruktur sind sauber`, async ({ page }) => {
      await page.goto(pfad)
      await page.waitForLoadState('networkidle')

      const ergebnis = await axeLauf(page, SCREENREADER_REGELSATZ)

      console.log(
        `[axe/sr] ${pfad}: ${ergebnis.bestanden} Regeln bestanden, ` +
          `${ergebnis.verstoesse.length} Verstöße, ` +
          `${ergebnis.unvollstaendig.length} manuell zu klären`,
      )
      for (const v of ergebnis.verstoesse) {
        console.log(
          `[axe/sr]   VERSTOSS ${v.id} [${v.impact}] ${v.knoten}× — ${v.help}\n` +
            `[axe/sr]     ${v.ziele.join(' | ')}`,
        )
      }

      expect(
        ergebnis.verstoesse,
        `Screenreader-Semantikverstöße auf ${pfad}:\n${JSON.stringify(ergebnis.verstoesse, null, 2)}`,
      ).toEqual([])
    })
  }

  test('jede öffentliche Seite trägt einen eindeutigen, vorlesbaren Dokumenttitel', async ({
    page,
  }) => {
    // Prüfpunkt S1: Der Titel ist das Erste, was ein Screenreader beim
    // Seitenwechsel ansagt. Zwei Seiten mit demselben Titel machen die
    // Ansage wertlos — das ist maschinell entscheidbar, also wird es hier
    // entschieden und nicht im manuellen Durchgang gesucht.
    const gesehen = new Map<string, string>()
    for (const pfad of OEFFENTLICHE_SEITEN) {
      await page.goto(pfad)
      await page.waitForLoadState('networkidle')
      const titel = (await page.title()).trim()

      expect(titel.length, `${pfad}: leerer Dokumenttitel`).toBeGreaterThan(0)
      const schon = gesehen.get(titel)
      expect(schon, `${pfad} und ${schon} tragen denselben Titel „${titel}"`).toBeUndefined()
      gesehen.set(titel, pfad)
    }
  })

  test('die Sprache ist ausgezeichnet — sonst liest der Screenreader Deutsch englisch vor', async ({
    page,
  }) => {
    // Prüfpunkt S2. Ohne lang="de" wählt der Screenreader die Systemstimme;
    // deutscher Text in englischer Aussprache ist für die Zielgruppe des
    // PflegeCoachs faktisch unbrauchbar.
    for (const pfad of OEFFENTLICHE_SEITEN) {
      await page.goto(pfad)
      const sprache = await page.evaluate(() => document.documentElement.lang)
      expect(sprache.toLowerCase(), `${pfad}: html lang fehlt oder ist nicht deutsch`).toMatch(
        /^de\b/,
      )
    }
  })

  test('Sprungmarke zum Hauptinhalt ist vorhanden und zeigt auf ein echtes Ziel', async ({
    page,
  }) => {
    // Prüfpunkt S3. Eine Sprungmarke, deren Ziel nicht existiert, ist
    // schlimmer als keine: der Fokus verschwindet ins Leere.
    for (const pfad of OEFFENTLICHE_SEITEN) {
      await page.goto(pfad)
      await page.waitForLoadState('networkidle')

      const zielTrifft = await page.evaluate(() => {
        const marke = Array.from(document.querySelectorAll('a[href^="#"]')).find((a) =>
          /inhalt|hauptinhalt|main|content/i.test(a.textContent ?? '') ||
          /inhalt|hauptinhalt|main|content/i.test(a.getAttribute('href') ?? ''),
        )
        if (!marke) return { gefunden: false, zielVorhanden: false, ziel: '' }
        const ziel = (marke.getAttribute('href') ?? '').slice(1)
        return {
          gefunden: true,
          zielVorhanden: ziel.length > 0 && document.getElementById(ziel) !== null,
          ziel,
        }
      })

      expect(zielTrifft.gefunden, `${pfad}: keine Sprungmarke zum Hauptinhalt`).toBe(true)
      expect(
        zielTrifft.zielVorhanden,
        `${pfad}: Sprungmarke zeigt auf „#${zielTrifft.ziel}", dieses Element existiert nicht`,
      ).toBe(true)
    }
  })
})
