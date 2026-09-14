/**
 * Dead-Letter — der Eintrag, der nie in die Aufmerksamkeit waechst
 * ═══════════════════════════════════════════════════════════════════════
 *
 * BEFUND (Block 63, 14.09.2026)
 *
 * WORKFLOW-DEAD-LETTER
 * `anspruchZuruecknehmen()` gibt einen Anspruch frei, „damit ein
 * spaeterer Versuch moeglich bleibt" — ungeprueft. Schlug die Freigabe
 * fehl, blieb `manuell_wiederholt = true`, und der Anspruch am Anfang der
 * Funktion weist jeden weiteren Versuch mit 409 „Dieser Eintrag wurde
 * bereits manuell wiederholt" ab. Der Eintrag waere DAUERHAFT gesperrt
 * gewesen, obwohl nie etwas wiederholt wurde — und die geworfene
 * Ausnahme sprach nur vom urspruenglichen Fehler.
 *
 * DTA-DEAD-LETTER
 * Die Fortschreibung eines bestehenden Eintrags verwarf Fehler UND
 * getroffene Zeilen und meldete unbesehen `fehler: null` — waehrend der
 * Insert wenige Zeilen weiter unten seinen Fehler ueber genau dieses
 * Feld zurueckgibt. Dieselbe Funktion, zwei Massstaebe.
 *
 * Verloren ging dabei nicht nur ein Vermerk: `versuche` wird dort
 * HOCHGEZAEHLT. Bleibt die Zahl stehen, waechst der Eintrag nie in die
 * Aufmerksamkeit, fuer die er angelegt wurde.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const WF = readFileSync('lib/workflow/dead-letter.ts', 'utf8')
const DTA = readFileSync('lib/abrechnung/dead-letter.ts', 'utf8')

describe('Workflow: die Freigabe des Anspruchs', () => {
  /**
   * Nur der Rumpf der Funktion — ein zu weites Fenster reicht in den
   * Aufrufer hinein, und dort steht das `throw`, das hier gerade NICHT
   * stehen soll.
   */
  const FREIGABE = (() => {
    const ab = WF.indexOf('const anspruchZuruecknehmen')
    expect(ab).toBeGreaterThan(-1)
    return WF.slice(ab, WF.indexOf('/** Haengt den Freigabe-Fehlschlag', ab))
  })()

  it('prueft Fehler und Zeilenzahl', () => {
    expect(FREIGABE).toContain('error: freigabeFehler')
    expect(FREIGABE).toContain("freigegeben?.length ?? 0) === 0")
  })

  it('gibt den Grund zurueck, statt selbst zu werfen', () => {
    // Der Aufrufer wirft ohnehin gleich — die Meldung gehoert IN jene
    // Ausnahme, nicht an ihre Stelle.
    expect(FREIGABE).toContain('Promise<string | null>')
    expect(FREIGABE).not.toContain('throw new Error(')
  })

  it('kein blindes `await supabase` mehr', () => {
    expect(FREIGABE).not.toMatch(/\n\s*await supabase\s*\n\s*\.from\('wf_dead_letter'\)/)
  })
})

describe('Workflow: die Ausnahme nennt die dauerhafte Sperre', () => {
  it('sagt, dass der Eintrag NICHT erneut versucht werden kann', () => {
    const text = WF.replace(/'\s*\+\s*'/g, '').replace(/\s+/g, ' ')
    expect(text).toContain('bereits manuell wiederholt')
    expect(text).toContain('NICHT erneut versucht werden')
  })

  it('beide Ausstiege haengen den Freigabe-Fehlschlag an', () => {
    // `mitFreigabe(` trifft nur die AUFRUFE — die Definition schreibt
    // sich `const mitFreigabe = (`.
    expect((WF.match(/mitFreigabe\(/g) ?? []).length).toBe(2)
    expect(WF).toContain('const mitFreigabe = (')
  })

  it('der urspruengliche Grund bleibt in der Meldung', () => {
    expect(WF).toContain('Urspruengliches Event konnte nicht geladen werden')
    expect(WF).toContain('Erneuter Versuch konnte nicht ausgeloest werden')
  })

  it('ohne Freigabe-Fehler bleibt die Meldung unveraendert', () => {
    expect(WF).toContain('freigabeGrund === null\n      ? grundtext')
  })
})

describe('DTA: die Fortschreibung meldet ihren Ausgang', () => {
  const BLOCK = (() => {
    const ab = DTA.indexOf('if (bestehend) {')
    expect(ab).toBeGreaterThan(-1)
    return DTA.slice(ab, ab + 2400)
  })()

  it('prueft Fehler und Zeilenzahl', () => {
    expect(BLOCK).toContain('error: fortschreibFehler')
    expect(BLOCK).toContain("fortgeschrieben?.length ?? 0) === 0")
  })

  it('benutzt das vorhandene `fehler`-Feld des Rueckgabewerts', () => {
    // Der Insert weiter unten tut das seit jeher — die Asymmetrie war der
    // Befund, nicht ein fehlender Vertrag.
    expect(BLOCK).toMatch(/fehler:\s*\n?\s*`Der bestehende Dead-Letter-Eintrag/)
    expect(DTA).toContain('if (error) return { id: null, neu: false, fehler: error.message }')
  })

  it('nennt den Versuchszaehler als das, was stehenbleibt', () => {
    const text = BLOCK.replace(/'\s*\+\s*'/g, '').replace(/\s+/g, ' ')
    expect(text).toContain('Versuchszaehler und Fehlergrund stehen weiter auf dem alten Stand')
  })

  it('gibt weiterhin die Kennung des bestehenden Eintrags zurueck', () => {
    // Der Eintrag existiert — der Aufrufer soll ihn nicht verlieren.
    expect(BLOCK).toContain('id: bestehend.id')
  })
})
