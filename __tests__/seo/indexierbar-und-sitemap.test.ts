/**
 * Was Google finden darf, muss in der Sitemap stehen — und umgekehrt.
 *
 * ── DER BEFUND VOM 13.09.2026 ─────────────────────────────────────────
 * Ein Abgleich zwischen den gebauten Routen und der Sitemap fand 38
 * öffentliche Routen, die nicht darin standen. 31 davon zu Recht
 * (`noindex`), sieben nicht:
 *
 *   /choose           indexierbar, Self-Canonical, KEIN <h1> — und in
 *                     keiner Sitemap genannt
 *   /sentry-example   eine Debug-Seite mit einem Knopf „Fehler auslösen",
 *                     offen für Suchmaschinen unter dem eigenen Markennamen
 *   /angehoerige/**   leiten unangemeldet auf /auth/login um; das
 *                     Umleitungsziel war `index, follow`
 *
 * ── WARUM DIESER TEST DIE QUELLDATEIEN LIEST ──────────────────────────
 * Der Renderer-Test unter `__tests__/seo` prüft die ausgelieferten Seiten.
 * Genau die sieben oben tauchten dort nicht auf — weil sie in keiner
 * Seitenliste standen. Ein Test, der nur die bekannten Seiten prüft, kann
 * die unbekannten nicht finden. Dieser hier geht deshalb vom
 * DATEISYSTEM aus: jede `page.tsx` unter `app/`, ohne Vorauswahl.
 */
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const APP = join(process.cwd(), 'app')

/**
 * Die gesperrten Präfixe werden aus `app/robots.ts` GELESEN, nicht hier
 * wiederholt. Zwei Kopien derselben Liste laufen auseinander, und dann
 * prüft der Test gegen eine Sperre, die es nicht mehr gibt.
 */
function gesperrtePraefixe(): string[] {
  const s = readFileSync(join(APP, 'robots.ts'), 'utf8')
  const m = s.match(/disallow:\s*\[([^\]]+)\]/s)
  if (!m) throw new Error('disallow-Liste in app/robots.ts nicht gefunden')
  return [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1])
}

function istGesperrt(route: string): boolean {
  return gesperrtePraefixe().some(p => route === p.replace(/\/$/, '') || route.startsWith(p))
}

/** Alle statischen Routen aus dem Dateisystem — ohne Vorauswahl. */
function routen(): string[] {
  const raus: string[] = []
  const lauf = (dir: string) => {
    for (const e of readdirSync(dir)) {
      if (e === 'node_modules') continue
      const p = join(dir, e)
      if (statSync(p).isDirectory()) lauf(p)
    }
    if (['page.tsx', 'page.ts'].some(n => existsSync(join(dir, n)))) {
      const rel = relative(APP, dir)
      if (rel === '') { raus.push('/'); return }
      const teile = rel.split(sep)
      // Routengruppen `(x)`, private Ordner `_x` und dynamische `[x]`
      // erzeugen keine feste URL.
      if (teile.some(t => t.startsWith('(') || t.startsWith('_') || t.includes('['))) return
      raus.push('/' + teile.join('/'))
    }
  }
  lauf(APP)
  return [...new Set(raus)].sort()
}

/**
 * Sagt die Route (oder ein Layout darüber) `noindex`?
 *
 * Eine Client-Komponente kann kein `metadata` exportieren — dort trägt das
 * Layout die Anweisung. Deshalb wird der Ordnerpfad nach oben abgelaufen.
 */
function istNoindex(route: string): boolean {
  const teile = route === '/' ? [] : route.slice(1).split('/')
  for (let i = teile.length; i >= 0; i--) {
    const dir = join(APP, ...teile.slice(0, i))
    for (const name of ['page.tsx', 'page.ts', 'layout.tsx', 'layout.ts']) {
      const p = join(dir, name)
      if (!existsSync(p)) continue
      const s = readFileSync(p, 'utf8')
      if (/robots:\s*\{[^}]*index:\s*false/s.test(s)) return true
      if (/robots:\s*['"]noindex/.test(s)) return true
    }
  }
  return false
}

/** Die in `app/sitemap.ts` fest eingetragenen Routen. */
function sitemapRouten(): Set<string> {
  const s = readFileSync(join(APP, 'sitemap.ts'), 'utf8')
  return new Set([...s.matchAll(/url:\s*'([^']+)'/g)].map(m => m[1]))
}

describe('Indexierbarkeit und Sitemap', () => {
  it('jede öffentliche, indexierbare Route steht in der Sitemap', () => {
    const sm = sitemapRouten()
    const fehlend = routen()
      .filter(r => !istGesperrt(r))
      .filter(r => !istNoindex(r))
      .filter(r => !sm.has(r))
      // Dynamisch erzeugte Silos hängen an eigenen Generatoren, nicht an
      // der festen Liste — sie sind über ihre Elternroute abgedeckt.
      .filter(r => !/^\/(blog|alltagsbegleitung|haushaltshilfe|hygienebox|krankenfahrten|engel-werden)\//.test(r))

    expect(
      fehlend,
      'Diese Routen darf Google indexieren, bekommt sie aber nie genannt.\n' +
      'Entweder in app/sitemap.ts aufnehmen — oder `robots: { index: false }` setzen.',
    ).toEqual([])
  })

  it('die Debug-Seite /sentry-example ist NICHT indexierbar', () => {
    // Eine Seite, deren Zweck ein Knopf „Fehler ausloesen" ist, gehoert
    // nicht in den Index unter dem eigenen Markennamen.
    expect(istNoindex('/sentry-example')).toBe(true)
  })

  it('die Registrierungsseiten bleiben ausdrücklich erlaubt', () => {
    // `app/robots.ts` sperrt `/auth/` und `/fahrer/`, nimmt aber beide
    // Registrierungen ausdrücklich davon aus — „SEO für Engel werden /
    // Konto erstellen". Diese Ausnahme ist eine Entscheidung, kein
    // Versehen, und darf nicht von einer breiteren Sperre kassiert werden.
    //
    // Genau das ist mir am 13.09.2026 passiert: ein
    // `robots: { index: false }` auf einem neuen `app/auth/layout.tsx`
    // hätte `/auth/register` mit aus dem Index genommen. Der Test hält
    // die Ausnahme jetzt fest.
    const s = readFileSync(join(APP, 'robots.ts'), 'utf8')
    const erlaubt = s.match(/allow:\s*\[([^\]]+)\]/s)
    expect(erlaubt, 'allow-Liste nicht gefunden').toBeTruthy()
    const werte = [...erlaubt![1].matchAll(/'([^']+)'/g)].map(x => x[1])
    expect(werte).toContain('/auth/register')
    expect(werte).toContain('/fahrer/register')

    // Und kein Layout darüber darf sie wieder auf noindex setzen.
    expect(istNoindex('/auth/register'), '/auth/register wurde noindex gesetzt').toBe(false)
  })

  it('/choose trägt eine echte Überschrift, kein gestyltes div', () => {
    // Die einzige oeffentliche Seite ohne <h1> — sie war in keiner
    // Seitenliste und deshalb von keinem Test erfasst.
    const s = readFileSync(join(APP, 'choose/page.tsx'), 'utf8')
    expect(s).toMatch(/<h1[\s>]/)
  })

  it('findet überhaupt Routen — sonst prüft der Test über nichts', () => {
    expect(routen().length).toBeGreaterThan(80)
  })
})
