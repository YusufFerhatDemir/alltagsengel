/**
 * Das Tor gegen den blinden Schreibvorgang
 * ═══════════════════════════════════════════════════════════════════════
 *
 * BEFUND (Blöcke 96–98, abgeschlossen mit Block 99)
 *
 * PostgREST wirft nicht. Ein abgewiesener INSERT — RLS, CHECK,
 * Fremdschluessel, UNIQUE, Ausfall — kommt als `error` IM ERGEBNIS
 * zurueck. Wer das Ergebnis gar nicht erst bindet, kann ihn nicht sehen,
 * und ein `try/catch` darum faengt nichts:
 *
 *     await supabase.from('klaerfaelle').insert({ … })
 *     klaerfaelle++                                  // ← zaehlt ins Leere
 *
 * Dreimal mit echter Folge gefunden: der Klaerfall des CAMT-Imports, den
 * es nicht gab (Block 96); der Storno und die Gutschrift ohne ihren
 * Unveraenderlichkeits-Beleg (Block 98). In allen drei Faellen stand der
 * richtige Umgang bereits einige Zeilen entfernt in derselben Datei —
 * ein Tor haette sie beim Schreiben erwischt.
 *
 * `scripts/lint-blinder-insert.ts` ist dieses Tor. Dieser Test prueft die
 * Regel selbst: was sie trifft, was sie in Ruhe laesst, und dass ihre
 * Ausnahmeliste sich nicht in eine offene Tuer verwandeln kann.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  pruefeQuelle, istBlind, veraltet, imBestand, BESTAND, type Befund,
} from '../../scripts/lint-blinder-insert'

const DATEI = 'lib/beispiel/modul.ts'

describe('Die Regel trifft den blinden Schreibvorgang', () => {
  it('findet ein insert ohne gebundenes Ergebnis', () => {
    const q = `
async function x() {
  await supabase.from('klaerfaelle').insert({ a: 1 })
}
`
    const b = pruefeQuelle(q, DATEI)
    expect(b).toHaveLength(1)
    expect(b[0].tabelle).toBe('klaerfaelle')
    expect(b[0].operation).toBe('insert')
  })

  it('auch ueber mehrere Zeilen', () => {
    const q = `
  await supabase
    .from('invoice_snapshots')
    .insert({ a: 1 })
`
    expect(pruefeQuelle(q, DATEI).map(x => x.tabelle)).toEqual(['invoice_snapshots'])
  })

  it('und ein upsert genauso', () => {
    const q = `
  await supabase.from('profiles').upsert({ id: 'x' })
`
    expect(pruefeQuelle(q, DATEI).map(x => x.operation)).toEqual(['upsert'])
  })
})

describe('Die Regel laesst in Ruhe, was sein Ergebnis bindet', () => {
  it('const { error } = await …', () => {
    const q = `
  const { error } = await supabase.from('klaerfaelle').insert({ a: 1 })
`
    expect(pruefeQuelle(q, DATEI)).toHaveLength(0)
  })

  it('const { data, error } = await … .select()', () => {
    const q = `
  const { data, error } = await supabase
    .from('invoice_snapshots')
    .insert({ a: 1 })
    .select('id')
`
    expect(pruefeQuelle(q, DATEI)).toHaveLength(0)
  })

  it('ein Ergebnis in einer Liste', () => {
    const q = `
  const [a, b] = await Promise.all([
    supabase.from('x').insert({}),
  ])
`
    expect(pruefeQuelle(q, DATEI)).toHaveLength(0)
  })

  it('return await', () => {
    const q = `
  return await supabase.from('x').insert({})
`
    expect(pruefeQuelle(q, DATEI)).toHaveLength(0)
  })

  it('ein blindes update/delete — das ist die Schwesterpruefung', () => {
    // Zwei verschiedene Fragen: dort „null getroffene Zeilen", hier
    // „abgewiesen". Wer beides in ein Tor presst, bekommt eines, das
    // niemand gruen haelt.
    const q = `
  await supabase.from('x').update({ a: 1 }).eq('id', 'y')
  await supabase.from('x').delete().eq('id', 'y')
`
    expect(pruefeQuelle(q, DATEI)).toHaveLength(0)
  })

  it('ein await auf eine eigene Funktion, die intern schreibt', () => {
    // Die hat ihre eigene Rueckgabe und ihren eigenen Vertrag.
    const q = `
  await legeKlaerfallAn(supabase, { a: 1 })
`
    expect(pruefeQuelle(q, DATEI)).toHaveLength(0)
  })
})

describe('istBlind unterscheidet Zeilenanfang von Zuweisung', () => {
  it('erkennt das freistehende await', () => {
    const t = '  await supabase'
    expect(istBlind(t, t.indexOf('await'))).toBe(true)
  })

  it('und die Zuweisung nicht', () => {
    for (const t of [
      '  const x = await supabase',
      '  const { error } = await supabase',
      '  return await supabase',
      '  ] = await supabase',
    ]) {
      expect(istBlind(t, t.indexOf('await')), t).toBe(false)
    }
  })
})

describe('Die drei behobenen Stellen bleiben behoben', () => {
  it('der Klaerfall des CAMT-Imports (Block 96)', () => {
    const q = readFileSync('app/api/billing/camt/import/route.ts', 'utf8')
    expect(pruefeQuelle(q, 'app/api/billing/camt/import/route.ts')
      .filter(b => b.tabelle === 'klaerfaelle')).toHaveLength(0)
  })

  it('die Snapshots der Abrechnung (Block 98)', () => {
    for (const d of ['lib/billing/core/invoice-engine.ts', 'lib/billing/core/credit-notes.ts']) {
      expect(pruefeQuelle(readFileSync(d, 'utf8'), d)
        .filter(b => b.tabelle === 'invoice_snapshots'), d).toHaveLength(0)
    }
  })

  it('das Profil im Auth-Callback (Block 97)', () => {
    const d = 'app/auth/callback/route.ts'
    expect(pruefeQuelle(readFileSync(d, 'utf8'), d).filter(b => b.tabelle === 'profiles')).toHaveLength(0)
  })

  it('und keine davon steht im Bestand', () => {
    const quelle = readFileSync('scripts/lint-blinder-insert.ts', 'utf8')
    const liste = quelle.slice(quelle.indexOf('export const BESTAND'), quelle.indexOf('export function imBestand'))
    for (const t of ['klaerfaelle', 'invoice_snapshots']) {
      expect(liste, t).not.toContain(`'${t}'`)
    }
  })
})

describe('Die Ausnahmeliste prueft sich selbst', () => {
  it('ein Eintrag ohne Befund macht den Lauf rot', () => {
    const erfunden = { datei: 'lib/gibtsnicht.ts', tabelle: 'nirgends' }
    // veraltet() arbeitet auf dem echten BESTAND; geprueft wird die
    // Richtung an einem Befundsatz, der ihn NICHT deckt.
    expect(veraltet([]).length).toBe(BESTAND.length)
    expect(imBestand({ ...erfunden, zeile: 1, operation: 'insert', ausschnitt: '' })).toBe(false)
  })

  it('ein gedeckter Eintrag gilt nicht als veraltet', () => {
    const e = BESTAND[0]
    const befund: Befund = { datei: e.datei, tabelle: e.tabelle, zeile: 1, operation: 'insert', ausschnitt: '' }
    expect(veraltet([befund])).not.toContainEqual(e)
    expect(imBestand(befund)).toBe(true)
  })

  it('und der Lauf bricht bei veralteten Eintraegen VOR der Entwarnung ab', () => {
    const quelle = readFileSync('scripts/lint-blinder-insert.ts', 'utf8')
    const riegel = quelle.indexOf('const tote = veraltet(')
    expect(riegel).toBeGreaterThan(-1)
    expect(quelle.slice(riegel)).toContain('process.exit(1)')
    expect(quelle.indexOf('if (tote.length > 0) {'))
      .toBeLessThan(quelle.indexOf('if (neu.length === 0) {'))
  })

  it('der Bestand ist eng gefasst — Datei UND Tabelle', () => {
    // Nur „Datei" wuerde jede weitere Tabelle in derselben Datei
    // mitfreigeben.
    const befund: Befund = {
      datei: BESTAND[0].datei, tabelle: 'eine_andere_tabelle',
      zeile: 1, operation: 'insert', ausschnitt: '',
    }
    expect(imBestand(befund)).toBe(false)
  })

  it('die Liste kann nur schrumpfen — sie waechst nicht von selbst', () => {
    // Keine feste Zahl: der naechste Block arbeitet sie ab, und ein Test,
    // der daran zerbricht, erzieht dazu, nichts aufzuraeumen.
    expect(BESTAND.length).toBeLessThanOrEqual(19)
    expect(BESTAND.length).toBeGreaterThanOrEqual(0)
  })
})

describe('Das Tor haengt in CI', () => {
  it('als eigener Schritt neben der Schwesterpruefung', () => {
    const ci = readFileSync('.github/workflows/ci.yml', 'utf8')
    expect(ci).toContain('npm run lint:blinder-insert')
    expect(ci).toContain('npm run lint:stilles-update')
  })

  it('und ist als npm-Skript erreichbar', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
    expect(pkg.scripts['lint:blinder-insert']).toBe('tsx scripts/lint-blinder-insert.ts')
  })
})
