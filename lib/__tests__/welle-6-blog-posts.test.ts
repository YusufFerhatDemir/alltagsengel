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
