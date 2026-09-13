// ═══════════════════════════════════════════════════════════════
// Welle 6 — Blog-Metadaten (lib/blog-posts.ts)
// ═══════════════════════════════════════════════════════════════
//
// BLOG_POSTS speist die Index-Karten und die Weiterlesen-Sektion.
// Ein Eintrag ohne zugehörige Route erzeugt einen 404-Link im eigenen
// Haus — für die Indexierung teurer als ein fehlender Eintrag.
// Deshalb wird hier gegen das Dateisystem gegengeprüft.
// ═══════════════════════════════════════════════════════════════

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { BLOG_POSTS, getBlogPost } from '../blog-posts'

const APP_BLOG = join(process.cwd(), 'app/blog')

// ───────────────────────────────────────────────────────────────
describe('BLOG_POSTS — Grundform', () => {
  test('ist nicht leer', () => {
    assert.ok(BLOG_POSTS.length > 0)
  })

  test('Slugs sind eindeutig', () => {
    const slugs = BLOG_POSTS.map((p) => p.slug)
    const dubletten = slugs.filter((s, i) => slugs.indexOf(s) !== i)
    assert.deepEqual(dubletten, [], `Doppelte Slugs: ${dubletten.join(', ')}`)
  })

  test('Slugs sind URL-tauglich (klein, nur a-z0-9 und Bindestrich)', () => {
    for (const p of BLOG_POSTS) {
      assert.match(p.slug, /^[a-z0-9]+(-[a-z0-9]+)*$/, `Slug "${p.slug}" ist nicht URL-tauglich`)
    }
  })

  test('Headline und Description sind gefüllt', () => {
    for (const p of BLOG_POSTS) {
      assert.ok(p.headline.trim().length > 0, `${p.slug}: headline leer`)
      assert.ok(p.description.trim().length > 0, `${p.slug}: description leer`)
    }
  })

  test('Description bleibt in der Größenordnung einer Meta-Description', () => {
    // Google schneidet deutlich früher ab; hier nur eine grobe Obergrenze,
    // damit kein Fließtext-Absatz in das Feld rutscht.
    for (const p of BLOG_POSTS) {
      assert.ok(p.description.length <= 320, `${p.slug}: description ist ${p.description.length} Zeichen`)
    }
  })

  test('Kategorie ist gesetzt', () => {
    for (const p of BLOG_POSTS) {
      assert.ok(p.category.trim().length > 0, `${p.slug}: category leer`)
    }
  })

  test('Lesezeit ist eine plausible positive Ganzzahl', () => {
    for (const p of BLOG_POSTS) {
      assert.ok(Number.isInteger(p.readTimeMin), `${p.slug}: readTimeMin ist keine Ganzzahl`)
      assert.ok(p.readTimeMin > 0 && p.readTimeMin <= 60, `${p.slug}: readTimeMin=${p.readTimeMin}`)
    }
  })
})

// ───────────────────────────────────────────────────────────────
describe('BLOG_POSTS — Daten', () => {
  test('datePublished ist ein gültiges ISO-Datum', () => {
    for (const p of BLOG_POSTS) {
      assert.match(p.datePublished, /^\d{4}-\d{2}-\d{2}$/, `${p.slug}`)
      assert.ok(!Number.isNaN(Date.parse(p.datePublished)), `${p.slug}: ${p.datePublished} nicht parsebar`)
    }
  })

  test('dateModified — sofern gesetzt — ist ebenfalls ISO und nicht älter als datePublished', () => {
    for (const p of BLOG_POSTS) {
      if (!p.dateModified) continue
      assert.match(p.dateModified, /^\d{4}-\d{2}-\d{2}$/, `${p.slug}`)
      assert.ok(
        p.dateModified >= p.datePublished,
        `${p.slug}: dateModified ${p.dateModified} liegt vor datePublished ${p.datePublished}`,
      )
    }
  })
})

// ───────────────────────────────────────────────────────────────
describe('BLOG_POSTS — Abgleich mit den Routen', () => {
  test('zu jedem Eintrag existiert app/blog/<slug>/page.tsx', () => {
    const ohneRoute = BLOG_POSTS.filter((p) => !existsSync(join(APP_BLOG, p.slug, 'page.tsx')))
    assert.deepEqual(
      ohneRoute.map((p) => p.slug),
      [],
      'Diese Einträge verlinken auf eine nicht existierende Seite',
    )
  })
})

// ───────────────────────────────────────────────────────────────
describe('getBlogPost', () => {
  test('findet jeden verzeichneten Beitrag', () => {
    for (const p of BLOG_POSTS) {
      assert.equal(getBlogPost(p.slug)?.slug, p.slug)
    }
  })

  test('liefert genau dasselbe Objekt aus der Liste', () => {
    const erster = BLOG_POSTS[0]
    assert.equal(getBlogPost(erster.slug), erster)
  })

  test('unbekannter Slug ergibt undefined, nicht null oder Fehler', () => {
    assert.equal(getBlogPost('gibt-es-nicht'), undefined)
    assert.equal(getBlogPost(''), undefined)
  })

  test('sucht exakt — abweichende Schreibweise findet nichts', () => {
    const slug = BLOG_POSTS[0].slug
    assert.equal(getBlogPost(slug.toUpperCase()), undefined)
    assert.equal(getBlogPost(` ${slug}`), undefined)
    assert.equal(getBlogPost(`${slug}/`), undefined)
  })
})

// ═══════════════════════════════════════════════════════════════
// Die dokumentierten Regeln des Moduls — bis 13.09.2026 ungeprüft
// ═══════════════════════════════════════════════════════════════
//
// Der Kopf von lib/blog-posts.ts sagt seit jeher:
//   „headline MUSS exakt der <h1> des Posts entsprechen,
//    description = Meta-Description der Seite."
// Geprüft hat das niemand. Am 13.09.2026 liefen fünf Beschreibungen und
// eine headline auseinander — darunter „Haushaltshilfe Frankfurt — Jetzt
// über die Pflegekasse buchen", während der H1 der Seite längst auf
// „Jetzt buchen" bereinigt war. BLOG_POSTS speist die Index-Karten, also
// stand die alte Zusage dreimal live auf /blog.
//
// Eine Regel, die im Kommentar steht und nirgends geprüft wird, ist eine
// Absichtserklärung.

import { readFileSync } from 'node:fs'

/** &amp; im JSX ist dasselbe Zeichen wie & im String. */
function entschluesselt(s: string): string {
  // `&amp;` MUSS zuletzt stehen: sonst macht es aus `&amp;apos;` erst
  // `&apos;` und die naechste Regel daraus ein Apostroph — aus einem
  // literalen „&apos;" im Text wuerde stillschweigend ein Zeichen.
  return s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

function seitenQuelle(slug: string): string | null {
  const f = join(APP_BLOG, slug, 'page.tsx')
  return existsSync(f) ? readFileSync(f, 'utf8') : null
}

function h1Von(quelle: string): string | null {
  const m = quelle.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)
  if (!m) return null
  return entschluesselt(m[1].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim()
}

function metaBeschreibungVon(quelle: string): string | null {
  const i = quelle.indexOf('export const metadata')
  if (i < 0) return null
  const j = quelle.indexOf('\n};', i)
  const block = quelle.slice(i, j < 0 ? undefined : j)
  const m = block.match(/\n\s*description:\s*'((?:[^'\\]|\\.)*)'/)
  return m ? m[1] : null
}

describe('Regeln aus dem Modulkopf', () => {
  test('headline entspricht exakt dem <h1> der Seite', () => {
    const abweichend: string[] = []
    for (const p of BLOG_POSTS) {
      const q = seitenQuelle(p.slug)
      if (!q) continue
      const h1 = h1Von(q)
      if (h1 === null) continue
      if (h1 !== entschluesselt(p.headline)) {
        abweichend.push(`${p.slug}\n    headline: ${p.headline}\n    h1      : ${h1}`)
      }
    }
    assert.deepEqual(abweichend, [], `headline weicht vom H1 ab:\n  ${abweichend.join('\n  ')}`)
  })

  test('description entspricht der Meta-Description der Seite', () => {
    const abweichend: string[] = []
    for (const p of BLOG_POSTS) {
      const q = seitenQuelle(p.slug)
      if (!q) continue
      const meta = metaBeschreibungVon(q)
      if (meta === null) continue
      if (meta !== p.description) {
        abweichend.push(`${p.slug} (Modul ${p.description.length} / Seite ${meta.length} Zeichen)`)
      }
    }
    assert.deepEqual(abweichend, [], `description weicht ab:\n  ${abweichend.join('\n  ')}`)
  })

  test('keine Kassen-Zusage in headline oder description', () => {
    // BLOG_POSTS wird auf /blog gerendert. Was hier steht, ist eine
    // Aussage der Seite — und §45a ist nicht anerkannt.
    const verboten = /(über|via|per)\s+(die|Ihre)\s+(Pflege)?[Kk]asse\s+(buchen|bestellen)|rechnen\s+direkt\s+mit\s+(der|Ihrer)\s+(Pflege)?[Kk]asse/i
    const treffer = BLOG_POSTS
      .filter(p => verboten.test(p.headline) || verboten.test(p.description))
      .map(p => p.slug)
    assert.deepEqual(treffer, [], `Kassen-Zusage in BLOG_POSTS: ${treffer.join(', ')}`)
  })
})
