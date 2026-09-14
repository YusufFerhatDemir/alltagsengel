/**
 * Der leere Tag, den niemand gelesen hatte
 * ═══════════════════════════════════════════════════════════════════════
 *
 * BEFUND (Block 82) — aus dem Bestand, den Block 79 sichtbar gemacht hat.
 *
 * `/admin/schedule` (sechs Abfragen) und `/admin/kalender` (fünf) luden
 * ihre Quellen gebündelt und verarbeiteten jede ungeprüft als leere Liste
 * weiter. Das ist genau die Lage, die der Kopf von
 * scripts/lint-leerzustand.ts als Beispiel nennt:
 *
 *   „Ein Engel liest das morgens als Aussage über seinen Tag und fährt
 *    nicht los — obwohl die Einsätze in der Datenbank stehen."
 *
 * Hier liest die Disposition. Zwei Richtungen, beide falsch:
 *
 *   Fällt `assignments` aus → die Woche ist leer. Niemand fehlt, niemand
 *   wird nachbesetzt, und ein unbesetzter Tag fällt nicht auf.
 *
 *   Fällt `absences` aus → `isAbsent()` antwortet ÜBERALL mit nein. Die
 *   Seite schlägt dann eine Kraft vor, die im Urlaub ist, und die
 *   Kalenderansicht zeigt sie als verfügbar.
 *
 * Die zweite ist die gefährlichere: sie erzeugt keine Lücke, sondern eine
 * falsche Zusage.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const SCHEDULE = readFileSync('app/admin/schedule/page.tsx', 'utf8')
const KALENDER = readFileSync('app/admin/kalender/page.tsx', 'utf8')
const LINT = readFileSync('scripts/lint-leerzustand.ts', 'utf8')

const SEITEN: Array<[string, string, string[]]> = [
  ['Dienstplan', SCHEDULE, [
    'cgRes.error', 'clRes.error', 'asRes.error',
    'abRes.error', 'srRes.error', 'prRes.error',
  ]],
  ['Kalender', KALENDER, [
    'aRes.error', 'abRes.error', 'stRes.error', 'cgRes.error', 'clRes.error',
  ]],
]

describe('Beide Seiten prüfen jede ihrer Quellen', () => {
  for (const [name, quelle, felder] of SEITEN) {
    it(`${name}: alle ${felder.length} Abfragen`, () => {
      const teil = quelle.slice(quelle.indexOf('const quellen = [')).slice(0, 800)
      for (const f of felder) expect(teil, f).toContain(f)
    })

    it(`${name}: die Fehlerliste entsteht aus den Quellen`, () => {
      // Ohne diese Zusicherung käme eine Mutation durch, die den Zweig
      // stehen lässt und nie betritt.
      expect(quelle).toContain('const fehlend = quellen.filter(([, grund]) => grund !== null)')
    })

    it(`${name}: und der Zweig dahinter meldet es`, () => {
      const ab = quelle.indexOf('const fehlend = quellen.filter')
      const teil = quelle.slice(ab, ab + 1400)
      expect(teil).toContain('if (fehlend.length > 0) {')
      expect(teil).toContain('setLadefehler(')
      expect(teil).toContain('return')
    })

    it(`${name}: die Ansicht wird dann gar nicht gerendert`, () => {
      expect(quelle).toContain('ladefehler ? null : (')
      expect(quelle).toContain('{ladefehler && <Banner tone="danger">{ladefehler}</Banner>}')
    })

    it(`${name}: der Zustand wird bei jedem Laden zurückgesetzt`, () => {
      expect(quelle).toContain('setLadefehler(null)')
    })
  }
})

describe('Die Abwesenheiten sind der gefährlichere Fall', () => {
  it('Dienstplan: leert die Abwesenheitsliste, statt sie halb zu zeigen', () => {
    const ab = SCHEDULE.indexOf('const fehlend = quellen.filter')
    const teil = SCHEDULE.slice(ab, ab + 1400)
    expect(teil).toContain('setAbsences([])')
    expect(teil).toContain('setAssignments([])')
  })

  it('Kalender: ebenso', () => {
    const ab = KALENDER.indexOf('const fehlend = quellen.filter')
    const teil = KALENDER.slice(ab, ab + 1400)
    expect(teil).toContain('setAbsences([])')
    expect(teil).toContain('setAssignments([])')
  })

  it('und `isAbsent` bleibt die Auskunft, die sie war', () => {
    // Nicht angefasst — sie ist richtig, solange sie eine vollständige
    // Liste sieht. Der Befund lag davor.
    for (const [name, quelle] of SEITEN) {
      expect(quelle, name).toContain('const isAbsent = useCallback(')
    }
  })
})

describe('Der Bestand ist mitgezogen', () => {
  it('trägt keinen Eintrag mehr für die beiden Seiten', () => {
    const liste = LINT.slice(
      LINT.indexOf('const BESTAND_GEBUENDELT'),
      LINT.indexOf('function imBestand'),
    )
    expect(liste).not.toContain('admin/schedule')
    expect(liste).not.toContain('admin/kalender')
  })

  it('und ist weiter gesunken', async () => {
    const { BESTAND_GEBUENDELT } = await import('../../scripts/lint-leerzustand')
    expect(BESTAND_GEBUENDELT.length).toBeLessThanOrEqual(59)
  })
})
