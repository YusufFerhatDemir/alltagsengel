/**
 * Die Form, die das Tor nicht sehen konnte — und die Seite, die Null meldete
 * ═══════════════════════════════════════════════════════════════════════
 *
 * BEFUND (Block 79)
 *
 * `scripts/lint-leerzustand.ts` verhindert, dass ein verworfener
 * Abfragefehler als Leerzustand erscheint: „Nichts da" und „nicht
 * nachsehen können" sind verschiedene Aussagen. Die Regel sucht dafür
 *
 *     const { data } = await supabase.from(…)
 *
 * Die Übersichtsseiten des Betriebssystems schreiben es anders:
 *
 *     const [clientsRes, caregiversRes, …] = await Promise.all([
 *       supabase.from('clients').select('id, status'),
 *       …
 *     ])
 *     setStats({ activeClients: (clientsRes.data || []).filter(…).length, … })
 *
 * Kein `data` in der Zerlegung, der verworfene Fehler heißt `clientsRes.error`
 * — die Regel traf nichts davon. In dieser Form standen 60 Stellen in 22
 * Dateien, darunter fast jede Übersichtsseite.
 *
 * Am größten war der Schaden auf `/admin/dashboard`: acht Abfragen in einem
 * Aufruf, jede Auswertung mit `|| []`. Eine ausgefallene Abfrage — RLS,
 * Schemadrift, Netz — und die Seite meldete 0 neue Klienten, 0 freie
 * Betreuungskräfte, 0 offene Nachweise, 0 offene Rechnungen und 0,00 €
 * Umsatz. Das `catch` darunter fängt es nicht ab: PostgREST wirft nicht.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { pruefeQuelle } from '../../scripts/lint-leerzustand'

const DATEI = 'app/beispiel/page.tsx'

describe('Die Regel sieht die gebündelte Form', () => {
  it('findet ein verworfenes Ergebnis aus Promise.all', () => {
    const quelle = `
const [aRes, bRes] = await Promise.all([
  supabase.from('clients').select('id'),
  supabase.from('caregivers').select('id'),
])
setClients(aRes.data || [])
`
    const b = pruefeQuelle(quelle, DATEI)
    expect(b.map(x => x.variable)).toContain('aRes')
  })

  it('auch als Setter ohne Leerliste', () => {
    const quelle = `
const [aRes] = await Promise.all([ supabase.from('clients').select('id') ])
setClients(aRes.data)
`
    expect(pruefeQuelle(quelle, DATEI).map(x => x.variable)).toContain('aRes')
  })

  it('schweigt, wenn der Fehler gelesen wird', () => {
    const quelle = `
const [aRes] = await Promise.all([ supabase.from('clients').select('id') ])
if (aRes.error) { setFehler('x'); return }
setClients(aRes.data || [])
`
    expect(pruefeQuelle(quelle, DATEI)).toHaveLength(0)
  })

  it('und auch bei der gebündelten Prüfung über eine Liste', () => {
    // Eine Regel, die nur EINE Schreibweise gelten lässt, erzieht zur
    // Schreibweise statt zur Prüfung.
    const quelle = `
const [aRes, bRes] = await Promise.all([
  supabase.from('clients').select('id'),
  supabase.from('caregivers').select('id'),
])
const abfragen = [['Klienten', aRes], ['Kräfte', bRes]]
const gescheitert = abfragen.filter(([, r]) => r.error)
if (gescheitert.length > 0) { setFehler('x'); return }
setClients(aRes.data || [])
setCaregivers(bRes.data || [])
`
    expect(pruefeQuelle(quelle, DATEI)).toHaveLength(0)
  })

  it('lässt ein Promise.all ohne Datenbankabfrage in Ruhe', () => {
    const quelle = `
const [aRes] = await Promise.all([ fetch('/x').then(r => r.json()) ])
setClients(aRes.data || [])
`
    expect(pruefeQuelle(quelle, DATEI)).toHaveLength(0)
  })

  it('und eine Zerlegung, die gar kein Ergebnisobjekt bindet', () => {
    // `{ data: c }` trägt den Fehler nicht — das ist die Form der alten
    // Regel und wird von ihr, nicht von dieser, beurteilt.
    const quelle = `
const [{ data: c }] = await Promise.all([ supabase.from('clients').select('id') ])
setClients(c || [])
`
    const b = pruefeQuelle(quelle, DATEI)
    expect(b.every(x => x.variable !== '{')).toBe(true)
  })

  it('die alte Regel gilt unverändert weiter', () => {
    const quelle = `
const { data } = await supabase.from('clients').select('id')
setClients(data || [])
`
    expect(pruefeQuelle(quelle, DATEI)).toHaveLength(1)
  })
})

describe('Das Dashboard meldet nicht mehr Null', () => {
  const SEITE = readFileSync('app/admin/dashboard/page.tsx', 'utf8')

  it('prüft jede der acht Abfragen auf ihren Fehler', () => {
    expect(SEITE).toContain('const gescheitert = abfragen.filter(([, r]) => r.error)')
    const liste = SEITE.slice(SEITE.indexOf('const abfragen = ['), SEITE.indexOf('] as const'))
    for (const name of [
      'clientsRes', 'caregiversRes', 'absencesRes', 'recordsRes',
      'invoicesRes', 'budgetsRes', 'revTodayRes', 'revMonthRes',
    ]) {
      expect(liste, name).toContain(name)
    }
  })

  it('bricht ab, statt die Zahlen zu setzen', () => {
    const teil = SEITE.slice(SEITE.indexOf('const gescheitert'))
      .slice(0, SEITE.slice(SEITE.indexOf('const gescheitert')).indexOf('const clients ='))
    expect(teil).toContain('setError(')
    expect(teil).toContain('return')
    expect(teil).not.toContain('setStats(')
  })

  it('nennt dabei, welche Bereiche fehlen', () => {
    expect(SEITE).toContain("gescheitert.map(([name]) => name).join(', ')")
  })

  it('und zeigt ohne Kennzahlen gar keine Kacheln', () => {
    // Leere Kacheln neben einer Fehlermeldung lesen sich wie „alles bei
    // null" — also genau wie der Befund.
    expect(SEITE).toContain('if (error && !stats) {')
  })

  it('steht deshalb NICHT im Bestand', () => {
    const LINT = readFileSync('scripts/lint-leerzustand.ts', 'utf8')
    const liste = LINT.slice(
      LINT.indexOf('const BESTAND_GEBUENDELT'),
      LINT.indexOf('function imBestand'),
    )
    expect(liste).not.toContain('admin/dashboard')
  })
})

describe('Die Ausnahmeliste prüft sich selbst', () => {
  const LINT = readFileSync('scripts/lint-leerzustand.ts', 'utf8')

  it('ein veralteter Eintrag macht den Lauf rot', () => {
    expect(LINT).toContain('export function veraltet(alle: Befund[], gescannt: string[])')
    // Der Aufruf nennt seit Block 83 beide Bereiche; gebunden wird die
    // Zusicherung deshalb an den Funktionsnamen, nicht an die Argumente.
    const teil = LINT.slice(LINT.indexOf('const tote = veraltet('))
    expect(teil).toContain('process.exit(1)')
  })

  it('und zwar VOR der Entwarnung', () => {
    const riegel = LINT.indexOf('const tote = veraltet(')
    expect(riegel).toBeGreaterThan(-1)
    expect(riegel).toBeLessThan(LINT.indexOf('if (befunde.length === 0)'))
  })

  it('beurteilt nur Einträge, deren Datei gescannt wurde', async () => {
    // Der blockierende Lauf sieht app/ und components/; die Liste deckt
    // auch lib/ und app/api ab. Ohne diese Grenze sähe jeder Eintrag der
    // anderen Hälfte veraltet aus und der Lauf wäre dauerhaft rot.
    const { veraltet, BESTAND_GEBUENDELT } = await import('../../scripts/lint-leerzustand')
    const ausLib = BESTAND_GEBUENDELT.find(e => e.datei.startsWith('lib/'))
    expect(ausLib, 'kein lib-Eintrag im Bestand').toBeDefined()
    // Kein Befund, kein Umfang — der Eintrag darf trotzdem nicht als tot gelten.
    expect(veraltet([], [])).toEqual([])
  })

  it('und meldet einen Eintrag, dessen Datei gescannt wurde und keinen Befund mehr trägt', async () => {
    const { veraltet, BESTAND_GEBUENDELT } = await import('../../scripts/lint-leerzustand')
    const einer = BESTAND_GEBUENDELT[0]
    expect(veraltet([], [einer.datei])).toContainEqual(einer)
  })

  it('aber nicht im --staged-Lauf', () => {
    // Dort werden nur geänderte Dateien gescannt; jeder Eintrag zu einer
    // nicht gescannten Datei sähe fälschlich veraltet aus.
    expect(LINT).toContain('if (!nurStaged) {')
  })
})
