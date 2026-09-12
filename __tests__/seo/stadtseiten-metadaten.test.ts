/**
 * Stadtseiten: Titel- und Beschreibungslängen, und vor allem —
 * unterscheiden sich die Seiten überhaupt voneinander?
 *
 * BEFUND 12.09.2026 (Live-Messung über alle 182 Sitemap-URLs):
 *   /hygienebox      5 Textskelette auf 25 Stadtseiten
 *   /krankenfahrten  5 Textskelette auf 25 Stadtseiten
 *   /engel-werden    4 Textskelette auf 15 Stadtseiten
 *   Textgleichheit benachbarter Städte bis 96,3 %
 * Dagegen: /haushaltshilfe 25/25 und /alltagsbegleitung 26/26 mit eigenem Text.
 * Der Unterschied war kein Zufall — die guten Silos setzten reale Ortsdaten
 * (Stadtteile) in die Beschreibung, die schlechten nur den Stadtnamen.
 *
 * Near-Duplicates sind keine exakten Dubletten; ein Vergleich auf Gleichheit
 * findet sie nie. Deshalb misst dieser Test die **Ähnlichkeit** und verlangt,
 * dass genug echter Ortsbezug übrig bleibt.
 */
import { describe, it, expect } from 'vitest'
import type { Metadata } from 'next'

/** Aus app/layout.tsx: `title.template`. Zählt bei jeder Seite mit. */
const MARKEN_SUFFIX = ' | Alltagsengel'
const TITEL_MAX = 60
const BESCHREIBUNG_MAX = 160

const SILOS = {
  hygienebox: () => import('@/app/hygienebox/[stadt]/page'),
  krankenfahrten: () => import('@/app/krankenfahrten/[stadt]/page'),
  'engel-werden': () => import('@/app/engel-werden/[stadt]/page'),
  haushaltshilfe: () => import('@/app/haushaltshilfe/[stadt]/page'),
} as const

interface Seite { slug: string; titel: string; beschreibung: string }

async function seitenVon(silo: keyof typeof SILOS): Promise<Seite[]> {
  const mod: {
    generateStaticParams: () => { stadt: string }[]
    generateMetadata: (a: { params: Promise<{ stadt: string }> }) => Promise<Metadata>
  } = await SILOS[silo]()
  const slugs = mod.generateStaticParams().map(p => p.stadt)
  return Promise.all(slugs.map(async slug => {
    const m = await mod.generateMetadata({ params: Promise.resolve({ stadt: slug }) })
    return {
      slug,
      titel: typeof m.title === 'string' ? m.title : '',
      beschreibung: typeof m.description === 'string' ? m.description : '',
    }
  }))
}

/**
 * Anteil gemeinsamer Wortfolgen (Trigramme). 1.0 = identisch.
 * Trigramme statt einzelner Wörter: „Pflegebox nach Hanau" und
 * „Pflegebox nach Kassel" teilen zwar fast alle Wörter, aber der Unterschied
 * sitzt genau in der Wortfolge — und darum geht es.
 */
export function aehnlichkeit(a: string, b: string): number {
  const tri = (s: string) => {
    const w = s.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter(Boolean)
    return new Set(w.slice(0, -2).map((_, i) => w.slice(i, i + 3).join(' ')))
  }
  const ta = tri(a), tb = tri(b)
  if (!ta.size || !tb.size) return a === b ? 1 : 0
  let treffer = 0
  for (const t of ta) if (tb.has(t)) treffer++
  return treffer / Math.max(ta.size, tb.size)
}

describe.each(Object.keys(SILOS) as (keyof typeof SILOS)[])('Stadtseiten — /%s', silo => {
  it('Titel bleiben mit Markensuffix unter 60 Zeichen', async () => {
    const zuLang = (await seitenVon(silo))
      .map(s => ({ ...s, laenge: s.titel.length + MARKEN_SUFFIX.length }))
      .filter(s => s.laenge > TITEL_MAX)
      .map(s => `${s.slug}: ${s.laenge}`)
    expect(zuLang, `Zu lange Titel: ${zuLang.join(', ')}`).toEqual([])
  })

  it('Beschreibungen bleiben unter 160 Zeichen', async () => {
    const zuLang = (await seitenVon(silo))
      .filter(s => s.beschreibung.length > BESCHREIBUNG_MAX)
      .map(s => `${s.slug}: ${s.beschreibung.length}`)
    expect(zuLang, `Zu lange Beschreibungen: ${zuLang.join(', ')}`).toEqual([])
  })

  it('keine zwei Städte teilen sich praktisch denselben Beschreibungstext', async () => {
    const seiten = await seitenVon(silo)
    const paare: string[] = []
    for (let i = 0; i < seiten.length; i++) {
      for (let j = i + 1; j < seiten.length; j++) {
        const w = aehnlichkeit(seiten[i].beschreibung, seiten[j].beschreibung)
        // 0,80 lässt gemeinsame Satzbausteine zu (Rechtsgrundlage, Leistung),
        // verlangt aber, dass der Ortsbezug messbar durchschlägt.
        if (w >= 0.8) paare.push(`${seiten[i].slug}↔${seiten[j].slug} ${(w * 100).toFixed(1)}%`)
      }
    }
    expect(paare, `Zu ähnlich: ${paare.slice(0, 6).join(' · ')}`).toEqual([])
  })

  it('jede Seite hat überhaupt Titel und Beschreibung', async () => {
    for (const s of await seitenVon(silo)) {
      expect(s.titel.length, `${silo}/${s.slug} ohne Titel`).toBeGreaterThan(10)
      expect(s.beschreibung.length, `${silo}/${s.slug} ohne Beschreibung`).toBeGreaterThan(60)
    }
  })
})

/**
 * Die Wurzelseiten der Silos. Sie haben statische `metadata` statt
 * `generateMetadata` und fielen deshalb durch die Prüfung oben hindurch —
 * am 12.09.2026 lagen sechs von acht über der Grenze, `/engel-werden` mit
 * 91 Zeichen und doppelter Marke im Titel.
 */
const WURZELSEITEN: Record<string, () => Promise<{ metadata?: Metadata }>> = {
  '/leistungen': () => import('@/app/leistungen/page'),
  '/haushaltshilfe': () => import('@/app/haushaltshilfe/page'),
  '/warteliste': () => import('@/app/warteliste/page'),
  '/hygienebox': () => import('@/app/hygienebox/page'),
  '/krankenfahrten': () => import('@/app/krankenfahrten/page'),
  '/engel-werden': () => import('@/app/engel-werden/page'),
  '/alltagsbegleitung': () => import('@/app/alltagsbegleitung/page'),
  '/pflegebox': () => import('@/app/pflegebox/page'),
}

describe('Wurzelseiten der Silos', () => {
  it.each(Object.keys(WURZELSEITEN))('%s bleibt in 60/160 Zeichen', async (pfad) => {
    const m = (await WURZELSEITEN[pfad]()).metadata
    expect(m, `${pfad} ohne metadata`).toBeTruthy()
    const titel = typeof m!.title === 'string' ? m!.title : ''
    expect(titel.length, `${pfad}: Titel fehlt oder ist kein String`).toBeGreaterThan(10)
    expect(titel.length + MARKEN_SUFFIX.length, `${pfad}: Titel zu lang`).toBeLessThanOrEqual(TITEL_MAX)
    expect((m!.description ?? '').length, `${pfad}: Beschreibung zu lang`).toBeLessThanOrEqual(BESCHREIBUNG_MAX)
  })

  it('kein Titel trägt die Marke selbst — die Vorlage hängt sie an', async () => {
    for (const [pfad, lade] of Object.entries(WURZELSEITEN)) {
      const m = (await lade()).metadata
      const titel = typeof m?.title === 'string' ? m.title : ''
      expect(titel, `${pfad}: Marke doppelt`).not.toContain('Alltagsengel')
    }
  })
})

describe('Detektor — das Maß erkennt den alten Zustand wieder', () => {
  it('zwei Städte im alten Textskelett fallen auf, echte Ortsdaten nicht', () => {
    const altA = 'Kostenlose Pflegebox nach Hanau: Handschuhe, Desinfektion, Bettschutz (§40 SGB XI). Bis 42 €/Monat von der Kasse, 0 € Zuzahlung. Jetzt bestellen!'
    const altB = 'Kostenlose Pflegebox nach Maintal: Handschuhe, Desinfektion, Bettschutz (§40 SGB XI). Bis 42 €/Monat von der Kasse, 0 € Zuzahlung. Jetzt bestellen!'
    expect(aehnlichkeit(altA, altB)).toBeGreaterThanOrEqual(0.8)

    const neuA = 'Pflegebox nach Hanau — auch nach Kesselstadt & Steinheim. Handschuhe, Desinfektion, Bettschutz nach §40 SGB XI, bis 42 €/Monat von der Pflegekasse.'
    const neuB = 'Pflegebox nach Maintal — auch nach Bischofsheim & Dörnigheim. Handschuhe, Desinfektion, Bettschutz nach §40 SGB XI, bis 42 €/Monat von der Pflegekasse.'
    expect(aehnlichkeit(neuA, neuB)).toBeLessThan(0.8)
  })

  it('identischer Text wird als identisch erkannt', () => {
    expect(aehnlichkeit('ein satz mit genug woertern darin', 'ein satz mit genug woertern darin')).toBe(1)
  })
})
