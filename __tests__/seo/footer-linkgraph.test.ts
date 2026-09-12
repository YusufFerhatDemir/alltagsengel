/**
 * Der Footer ist der einzige seitenweite Link-Hub der Marketing-Seiten.
 * Was dort nicht steht, hat faktisch keine interne Verlinkung.
 *
 * BEFUND 12.09.2026 (SEO-Live-Prüfung über alle 182 Sitemap-URLs):
 *   /leistungen      hatte EINEN eingehenden Link (nur /seitenuebersicht)
 *   /haushaltshilfe  hatte KEINEN — nur die eigenen Stadtseiten zeigten
 *                    darauf, die Homepage nannte das Wort kein einziges Mal.
 * Beide standen mit priority 0.9 in der Sitemap. Eine Seite, die wir der
 * Suchmaschine als wichtig melden und intern nicht verlinken, ist ein
 * Widerspruch, den nur ein Test dauerhaft festhält.
 *
 * DIE REGEL: Jede Top-Level-Route, die in app/sitemap.ts mit priority >= 0.9
 * geführt wird, ist entweder im Footer verlinkt oder steht mit Begründung in
 * OHNE_FOOTER_LINK — und muss dann nachweislich anderswo verlinkt sein.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import path from 'path'
import { renderToStaticMarkup } from 'react-dom/server'
import { vi } from 'vitest'

vi.mock('next/navigation', () => ({ usePathname: () => '/alltagsbegleitung' }))

const WURZEL = path.join(__dirname, '..', '..')

/** Top-Level-Routen aus der Sitemap, die wir selbst als wichtig melden. */
function wichtigeTopLevelRouten(): string[] {
  const quelle = readFileSync(path.join(WURZEL, 'app/sitemap.ts'), 'utf8')
  const block = quelle.split('const STATIC_ROUTES')[1] ?? ''
  const treffer = [...block.matchAll(/\{\s*url:\s*'([^']+)',[^}]*priority:\s*([0-9.]+)/g)]
  return treffer
    .filter(([, url, p]) => url.split('/').length === 2 && Number(p) >= 0.9)
    .map(([, url]) => url)
}

async function footerHrefs(): Promise<Set<string>> {
  const mod = await import('@/components/SiteFooter')
  const html = renderToStaticMarkup(mod.default({} as never) as never)
  return new Set([...html.matchAll(/href="(\/[^"]*)"/g)].map(m => m[1]))
}

/**
 * Bewusst nicht im Footer — jeder Eintrag nennt den Grund. Ein Eintrag hier
 * ist kein Freibrief: der zweite Test prüft, dass die Route trotzdem intern
 * erreichbar ist.
 */
const OHNE_FOOTER_LINK: Record<string, string> = {
  '/': 'Startseite — über Logo/Header auf jeder Seite erreichbar, kein Footer-Eintrag nötig.',
  '/pflegebox':
    'Zweitseite der Pflegehilfsmittel-Strecke; der Footer führt /hygienebox als „Pflege-Box". ' +
    'Zwei self-canonical Seiten auf dasselbe Keyword bleiben eine offene Entscheidung ' +
    '(SEO_LIVE_CHECK_12_09_2026.md) — verlinkt ist sie aus /hygienebox und vier Blogartikeln.',
  '/warteliste':
    'Conversion-Ziel, kein Navigationsziel. Erreichbar aus /leistungen und der ' +
    'Haushaltshilfe-Strecke — die selbst erst seit 12.09.2026 im Footer stehen.',
}

/** Alle .tsx unter app/ und components/, ohne den Zielordner selbst. */
function quelldateien(): string[] {
  const raus: string[] = []
  const lauf = (dir: string) => {
    for (const e of readdirSync(dir)) {
      if (e === 'node_modules' || e === '.next') continue
      const p = path.join(dir, e)
      if (statSync(p).isDirectory()) lauf(p)
      else if (p.endsWith('.tsx')) raus.push(p)
    }
  }
  lauf(path.join(WURZEL, 'app'))
  lauf(path.join(WURZEL, 'components'))
  return raus
}

describe('Footer-Linkgraph', () => {
  it('verlinkt jede Top-Level-Route mit priority >= 0.9 (oder nennt den Grund)', async () => {
    const hrefs = await footerHrefs()
    const fehlend = wichtigeTopLevelRouten().filter(r => !hrefs.has(r) && !(r in OHNE_FOOTER_LINK))
    expect(fehlend, `Ohne Footer-Link und ohne Begründung: ${fehlend.join(', ')}`).toEqual([])
  })

  it('die beiden Befunde vom 12.09.2026 sind geschlossen', async () => {
    const hrefs = await footerHrefs()
    expect(hrefs.has('/leistungen')).toBe(true)
    expect(hrefs.has('/haushaltshilfe')).toBe(true)
  })

  it('Detektor: eine unverlinkte wichtige Route fällt auf', async () => {
    const hrefs = await footerHrefs()
    // Gegenprobe mit einer erfundenen Route — schlüge der erste Test nur zu,
    // weil die Liste leer ankommt, bliebe auch diese hier unbemerkt.
    const erfunden = ['/gibt-es-nicht-42', ...wichtigeTopLevelRouten()]
    const fehlend = erfunden.filter(r => !hrefs.has(r) && !(r in OHNE_FOOTER_LINK))
    expect(fehlend).toEqual(['/gibt-es-nicht-42'])
  })

  it('bewusst ausgenommene Routen sind anderswo verlinkt — keine Orphans durch die Hintertür', () => {
    const dateien = quelldateien()
    for (const route of Object.keys(OHNE_FOOTER_LINK)) {
      if (route === '/') continue
      const eigen = path.join(WURZEL, 'app', route.slice(1))
      const quellen = dateien.filter(
        f => !f.startsWith(eigen + path.sep) && new RegExp(`href="${route}(\\?|"|#)`).test(readFileSync(f, 'utf8')),
      )
      expect(quellen.length, `${route} hat keinen einzigen eingehenden Link`).toBeGreaterThan(0)
    }
  })
})
