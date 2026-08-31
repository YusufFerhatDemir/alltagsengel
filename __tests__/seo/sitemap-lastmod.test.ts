/**
 * Tests fuer das lastmod-Signal der Sitemap.
 * @see scripts/generate-lastmod.mjs, app/sitemap.ts
 *
 * Hintergrund (live gemessen am 31.08.2026): 137 von 138 Sitemap-URLs trugen
 * denselben lastmod, und der wanderte bei jedem Deploy weiter. Ursache war
 * nicht der Code, sondern die Umgebung — Vercel klont flach, und fuer jede
 * Datei ausserhalb des Klon-Fensters liefert `git log` den Grenz-Commit
 * statt der echten letzten Aenderung. Ein Deploy hat damit die gute
 * eingecheckte JSON ueberschrieben.
 *
 * Diese Tests pruefen die eingecheckte Datei, weil genau sie im
 * Vercel-Build ausgeliefert wird. Sie schlagen an, wenn jemand ein
 * kaputtes Ergebnis committet.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

const ROOT = process.cwd()
const lastmod: Record<string, string> = JSON.parse(
  readFileSync(join(ROOT, 'lib', 'generated', 'lastmod.json'), 'utf8'),
)

describe('lastmod.json', () => {
  it('ist nicht leer', () => {
    expect(Object.keys(lastmod).length).toBeGreaterThan(50)
  })

  it('verweist nur auf Seiten, die es noch gibt', () => {
    const verwaist = Object.keys(lastmod).filter(p => !existsSync(join(ROOT, p)))
    expect(verwaist).toEqual([])
  })

  it('traegt gueltige ISO-Zeitstempel', () => {
    const kaputt = Object.entries(lastmod).filter(
      ([, d]) => Number.isNaN(Date.parse(d)),
    )
    expect(kaputt).toEqual([])
  })

  it('kein Datum gilt fuer mehr als die Haelfte aller Seiten', () => {
    // Der Kern der Regression: ein flacher Klon stempelt fast alles auf
    // denselben Grenz-Commit. Ein echter Sweep-Commit trifft nie so viele
    // oeffentliche Seiten auf einmal — die groesste ehrliche Haeufung lag
    // bei 26 von 98.
    const zaehler = new Map<string, number>()
    for (const d of Object.values(lastmod)) zaehler.set(d, (zaehler.get(d) ?? 0) + 1)
    const [datum, anzahl] = [...zaehler.entries()].sort((a, b) => b[1] - a[1])[0]
    const anteil = anzahl / Object.keys(lastmod).length
    expect(
      anteil,
      `${anzahl} von ${Object.keys(lastmod).length} Seiten tragen ${datum} — ` +
        'sieht nach einem flachen Klon aus, nicht nach echten Aenderungsdaten. ' +
        '`node scripts/generate-lastmod.mjs` in einem VOLLSTAENDIGEN Klon laufen lassen.',
    ).toBeLessThan(0.5)
  })

  it('kein Zeitstempel liegt in der Zukunft', () => {
    const jetzt = Date.now()
    const zukunft = Object.entries(lastmod).filter(([, d]) => Date.parse(d) > jetzt)
    expect(zukunft).toEqual([])
  })
})
