/**
 * Die Admin-Sicherheitsansicht: geht jeder Filter auch WIRKLICH raus?
 *
 * ── DER BEFUND, DEN DIESE SUITE FESTHÄLT ──────────────────────────────────
 * Am 31.08.2026 stand in `app/admin/security/audit-log/page.tsx` ein
 * Auswahlfeld „Nur echte Nutzeraktivität". Die Route verstand den
 * Parameter, `lib/security/abfrage.ts` setzte ihn um — nur hängte die
 * Seite ihn nie an die URL. Die Auswahl änderte die Liste also nicht,
 * ohne Fehlermeldung. Der CSV-Export war mitbetroffen, weil er auf
 * derselben Abfrage aufbaut.
 *
 * Das ist eine Klasse, kein Einzelfall: ein Filterfeld hinzuzufügen sind
 * VIER Stellen (Zustand, URL-Parameter, Route, Abfrage). Wer eine
 * vergisst, bekommt keinen Fehler, sondern eine stille Lüge — die
 * Oberfläche behauptet eine Auswahl, die niemand vorgenommen hat.
 *
 * Diese Suite vergleicht deshalb die Felder von `Filter` mit den
 * tatsächlich gesetzten URL-Parametern, am Quelltext. Ein Grep ist hier
 * ausnahmsweise das richtige Mittel: die Aussage IST eine über den
 * Quelltext („diese Zeile existiert"), nicht über ein Laufzeitverhalten,
 * und die Seite ist eine Client-Komponente mit React-Zustand, die sich
 * ohne Browser nicht sinnvoll fahren lässt.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SEITE = join(process.cwd(), 'app/admin/security/audit-log/page.tsx')
const ROUTE = join(process.cwd(), 'app/api/admin/security/audit-log/route.ts')
const ABFRAGE = join(process.cwd(), 'lib/security/abfrage.ts')

const lies = (pfad: string) => readFileSync(pfad, 'utf8')

/** Die Feldnamen aus `interface Filter { … }` der Seite. */
function filterFelder(quelle: string): string[] {
  const block = /interface Filter \{([\s\S]*?)\n\}/.exec(quelle)
  if (!block) throw new Error('interface Filter nicht gefunden')
  return [...block[1].matchAll(/^\s*(\w+)\s*:/gm)].map(m => m[1])
}

describe('Jeder Filter der Ansicht geht auch an die API', () => {
  it('für jedes Feld von Filter wird ein URL-Parameter gesetzt', () => {
    const quelle = lies(SEITE)
    const felder = filterFelder(quelle)
    expect(felder.length).toBeGreaterThan(5)

    const fehlend = felder.filter(f => !quelle.includes(`p.set('${f}'`))
    expect(fehlend, `Filterfelder ohne p.set(): ${fehlend.join(', ')}`).toEqual([])
  })

  it('die Route nimmt jeden dieser Parameter entgegen', () => {
    // Die Gegenrichtung. Ein Parameter, den die Seite schickt und die
    // Route nicht liest, ist derselbe stille Fehler — nur an der
    // anderen Stelle.
    const quelle = lies(SEITE)
    const route = lies(ROUTE)
    const felder = filterFelder(quelle)

    const unbekannt = felder.filter(f => !route.includes(`p.get('${f}'`))
    expect(unbekannt, `von der Route nicht gelesen: ${unbekannt.join(', ')}`).toEqual([])
  })
})

describe('Der Herkunftsfilter — der Fall, an dem es aufgefallen ist', () => {
  it('die Seite sendet ihn', () => {
    expect(lies(SEITE)).toContain("p.set('herkunft', filter.herkunft)")
  })

  it('die Route lässt nur die drei bekannten Werte durch', () => {
    // Erlaubnisliste statt Durchreichen: der Wert landet in einem
    // PostgREST-`.or()`-Ausdruck. Ein durchgereichter Fremdwert wäre
    // dort eine freie Abfrage — derselbe Befund wie bei der Suche.
    const route = lies(ROUTE)
    expect(route).toContain("=== 'echt'")
    expect(route).toContain("=== 'nicht_echt'")
    expect(route).toContain("=== 'test'")
    expect(route).toContain(': null')
  })

  it('die Abfrage kennt alle drei Werte', () => {
    const abfrage = lies(ABFRAGE)
    expect(abfrage).toContain("'echt' | 'nicht_echt' | 'test' | null")
    expect(abfrage).toContain("f.herkunft === 'test'")
  })

  it('die Auswahl bietet alle drei an', () => {
    const quelle = lies(SEITE)
    expect(quelle).toContain('value="echt"')
    expect(quelle).toContain('value="test"')
    expect(quelle).toContain('value="nicht_echt"')
  })
})

describe('Die Schnellfilter setzen dieselben Felder wie die Einzelfilter', () => {
  it('jeder Schnellfilter setzt nur Felder, die es in Filter gibt', () => {
    // Ein Schnellfilter auf ein Feld, das nicht existiert, wäre wirkungslos
    // — genau der Fehler, der oben behoben wurde, nur eine Ebene höher.
    const quelle = lies(SEITE)
    const felder = new Set(filterFelder(quelle))
    const block = /const SCHNELLFILTER[\s\S]*?\n\]/.exec(quelle)
    expect(block).not.toBeNull()

    const gesetzt = [...block![0].matchAll(/(?:setzt|leert):\s*\{\s*(\w+):/g)].map(m => m[1])
    expect(gesetzt.length).toBeGreaterThan(0)
    const unbekannt = [...new Set(gesetzt)].filter(f => !felder.has(f))
    expect(unbekannt, `Schnellfilter auf unbekanntes Feld: ${unbekannt.join(', ')}`).toEqual([])
  })

  it('es gibt die vier verlangten: Real, Test, Security, Login', () => {
    const quelle = lies(SEITE)
    for (const b of ['Real', 'Test', 'Security', 'Login']) {
      expect(quelle).toContain(`bezeichnung: '${b}'`)
    }
  })

  it('„Test" filtert auf Testereignisse, nicht auf „nicht echt"', () => {
    // Der inhaltliche Kern: „nicht echt" enthält auch SYNTHETIC_EVENT und
    // alles Unbelegte. Wer nach Tests sucht, bekäme sonst Zeilen zu sehen,
    // über deren Herkunft schlicht nichts bekannt ist.
    const quelle = lies(SEITE)
    const block = /schluessel: 'test'[\s\S]*?\},/.exec(quelle)
    expect(block).not.toBeNull()
    expect(block![0]).toContain("herkunft: 'test'")
    expect(block![0]).not.toContain('nicht_echt')
  })
})
