/**
 * Die Ausnahmeliste, die mit jeder Behebung blinder wurde
 * ═══════════════════════════════════════════════════════════════════════
 *
 * BEFUND (Block 68)
 *
 * `scripts/lint-stilles-update.ts` führt eine Liste eingefrorener
 * Schreibwege (BESTAND). Ihre eigene Anweisung lautet seit dem ersten Tag:
 * „Wer einen davon anfasst, hängt `.select('id')` an und nimmt die Zeile
 * hier heraus."
 *
 * Der erste Teil geschah in den Blöcken 60–67 achtmal. Der zweite nie.
 *
 * Damit standen acht Ausnahmen für einen Befund, den es nicht mehr gab —
 * und jede von ihnen war eine offene Tür: wäre das `.select('id')` in
 * einer jener Dateien wieder herausgefallen, hätte der Lauf den Rückfall
 * als „im Bestand" durchgewunken. Eine Ausnahmeliste, die ihre eigene
 * Gültigkeit nicht prüft, wird mit jeder Behebung ein Stück blinder.
 *
 * Gemessen vor der Änderung: 19 Treffer im Code, 27 Einträge in der
 * Liste, 8 davon ohne Gegenstück.
 */
import { describe, it, expect } from 'vitest'
import { writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pruefe, veraltet, kette, BESTAND, type Befund } from '../../scripts/lint-stilles-update'

function probe(name: string, quelle: string): string {
  const datei = join(tmpdir(), `stilles-update-${name}.ts`)
  writeFileSync(datei, quelle)
  return datei
}

describe('veraltet() — eine Ausnahme ohne Gegenstück', () => {
  const alle: Befund[] = [
    { datei: 'app/a/route.ts', zeile: 1, tabelle: 'x', operation: 'update', ausschnitt: '' },
  ]

  it('meldet jeden Eintrag, den kein Treffer mehr deckt', () => {
    const tote = veraltet(alle)
    // Die echte Liste deckt hier nichts, also ist sie vollständig veraltet.
    expect(tote.length).toBe(BESTAND.length)
  })

  it('unterscheidet nach Datei, Tabelle UND Operation', () => {
    const eintrag = BESTAND[0]
    const fastPassend: Befund[] = [{
      datei: eintrag.datei, zeile: 1, tabelle: eintrag.tabelle,
      // gleiche Datei, gleiche Tabelle — aber die andere Operation
      operation: eintrag.operation === 'update' ? 'delete' : 'update',
      ausschnitt: '',
    }]
    expect(veraltet(fastPassend).some(e => e.datei === eintrag.datei
      && e.tabelle === eintrag.tabelle && e.operation === eintrag.operation)).toBe(true)
  })

  it('hält einen Eintrag für gültig, sobald sein Treffer wieder da ist', () => {
    const e = BESTAND[0]
    const passend: Befund[] = [{ ...e, zeile: 1, ausschnitt: '' }]
    expect(veraltet(passend).some(x => x.datei === e.datei
      && x.tabelle === e.tabelle && x.operation === e.operation)).toBe(false)
  })
})

describe('Der echte Baum', () => {
  it('trägt keine veraltete Ausnahme mehr', () => {
    // Das ist der Befund selbst, als Test: vor Block 68 waren es acht.
    const alle: Befund[] = []
    for (const eintrag of BESTAND) {
      alle.push(...pruefe(join(process.cwd(), eintrag.datei)))
    }
    expect(veraltet(alle)).toEqual([])
  })

  it('und keine Ausnahme für eine Datei, die es nicht mehr gibt', () => {
    for (const e of BESTAND) {
      expect(() => pruefe(join(process.cwd(), e.datei)), e.datei).not.toThrow()
    }
  })
})

describe('pruefe() — was als stiller Schreibweg gilt', () => {
  it('findet ein update ohne select', () => {
    const datei = probe('a', `
await supabase.from('clients').update({ a: 1 }).eq('id', id)
`)
    const b = pruefe(datei)
    expect(b).toHaveLength(1)
    expect(b[0].tabelle).toBe('clients')
    expect(b[0].operation).toBe('update')
  })

  it('schweigt, wenn ein select in der Kette steht', () => {
    const datei = probe('b', `
await supabase.from('clients').update({ a: 1 }).eq('id', id).select('id')
`)
    expect(pruefe(datei)).toHaveLength(0)
  })

  it('findet auch ein delete', () => {
    const datei = probe('c', `
await supabase.from('clients').delete().eq('id', id)
`)
    expect(pruefe(datei)[0]?.operation).toBe('delete')
  })

  it('lässt ein reines select in Ruhe', () => {
    const datei = probe('d', `
const { data } = await supabase.from('clients').select('id').eq('id', id)
`)
    expect(pruefe(datei)).toHaveLength(0)
  })
})

describe('kette() — wo eine Anweisung endet', () => {
  it('endet an der Leerzeile, nicht erst nach 1200 Zeichen', () => {
    const text = "from('a').update({})\n\nfrom('b').select('id')"
    expect(kette(text, 0)).not.toContain("from('b')")
  })
})

describe('Das Verfahren ist im Quelltext festgehalten', () => {
  const QUELLE = readFileSync('scripts/lint-stilles-update.ts', 'utf8')

  it('ein veralteter Eintrag macht den Lauf rot', () => {
    const abschnitt = QUELLE.slice(QUELLE.indexOf('const tote = veraltet(alle)'))
    expect(abschnitt).toMatch(/if \(tote\.length > 0\)/)
    expect(abschnitt).toContain('process.exit(1)')
  })

  it('und zwar VOR der Entwarnung „Kein Befund"', () => {
    // Sonst meldete der Lauf gruen und liefe erst danach in die Pruefung.
    expect(QUELLE.indexOf('const tote = veraltet(alle)'))
      .toBeLessThan(QUELLE.indexOf('Kein Befund'))
    expect(QUELLE.indexOf('if (tote.length > 0)'))
      .toBeLessThan(QUELLE.indexOf('if (neu.length === 0)'))
  })

  it('main() läuft nicht beim Import — sonst beendete ein Test den Prozess', () => {
    expect(QUELLE).toMatch(/if \(process\.argv\[1\].*endsWith\('lint-stilles-update\.ts'\)\) main\(\)/)
  })
})
