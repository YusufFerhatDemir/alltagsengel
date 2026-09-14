/**
 * Zwei leere Listen, die eine Aussage über einen Menschen waren
 * ═══════════════════════════════════════════════════════════════════════
 *
 * BEFUND (Block 84) — aus dem Bestand, den Block 79 sichtbar gemacht hat.
 *
 * 1. /kunde/notfall — die Gesundheitsseite des Kunden. Zwei Abfragen,
 *    beide ungeprüft. Fiel die Medikamentenabfrage aus, zeigte die Seite
 *
 *      „Noch keine Medikamente — Tippe auf + um ein Medikament
 *       hinzuzufügen"
 *
 *    einem Menschen, der einen Medikamentenplan hat. Fiel `notfall_info`
 *    aus, fehlten Blutgruppe, Allergien, Vorerkrankungen und
 *    Notfallkontakt, ohne dass etwas darauf hinwies.
 *
 *    Dazu las die zweite Abfrage mit `.single()`: „noch nichts
 *    hinterlegt" war damit selbst ein Fehler (PGRST116) und von einem
 *    echten Ausfall nicht zu unterscheiden.
 *
 * 2. /admin/caregivers/[id] — die Mitarbeiterakte. Der Stammsatz wurde
 *    geprüft, die vier Listen nicht. Eine leere Dokumenten- oder
 *    Qualifikationsliste ist hier keine Anzeige, sondern eine Auskunft:
 *    „kein erweitertes Führungszeugnis, kein Erste-Hilfe-Nachweis, keine
 *    Qualifikation hinterlegt." Genau daran hängt die Einsatzfreigabe.
 *
 *    Die Richtung ist die gefährlichere: ein Ausfall zeigt WENIGER
 *    Nachweise, als es gibt. Mehr kann er nie zeigen.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const NOTFALL = readFileSync('app/kunde/notfall/page.tsx', 'utf8')
const AKTE = readFileSync('app/admin/caregivers/[id]/page.tsx', 'utf8')
const LINT = readFileSync('scripts/lint-leerzustand.ts', 'utf8')

describe('Notfallseite: der Medikamentenplan ist keine Vermutung', () => {
  it('prüft beide Abfragen', () => {
    const teil = NOTFALL.slice(NOTFALL.indexOf('const nichtLesbar = [')).slice(0, 400)
    expect(teil).toContain('medsRes.error')
    expect(teil).toContain('notfallRes.error')
  })

  it('liest die Notfall-Info mit maybeSingle', () => {
    // Sonst wäre „noch nichts hinterlegt" selbst ein Fehler.
    expect(NOTFALL).toContain(".eq('user_id', user.id).maybeSingle()")
    expect(NOTFALL).not.toContain(".eq('user_id', user.id).single()")
  })

  it('leert beide Zustände, statt eine halbe Auskunft zu zeigen', () => {
    const ab = NOTFALL.indexOf('if (nichtLesbar.length > 0) {')
    const teil = NOTFALL.slice(ab, ab + 900)
    expect(teil).toContain('setMedications([])')
    expect(teil).toContain('setNotfallInfo(null)')
    expect(teil).toContain('return')
  })

  it('und zeigt statt der Inhalte den Grund', () => {
    expect(NOTFALL).toContain('{ladefehler ? (')
    const teil = NOTFALL.slice(NOTFALL.indexOf('{ladefehler ? (')).slice(0, 900)
    expect(teil).toContain('Erneut laden')
  })

  it('der Leerzustand „Noch keine Medikamente" bleibt für den echten Fall', () => {
    // Er ist richtig — nur nicht als Antwort auf einen Lesefehler.
    expect(NOTFALL).toContain('Noch keine Medikamente')
  })
})

describe('Mitarbeiterakte: eine leere Nachweisliste ist eine Behauptung', () => {
  it('prüft alle vier Listen', () => {
    const teil = AKTE.slice(AKTE.indexOf('const nichtLesbar = [')).slice(0, 500)
    for (const f of ['docRes.error', 'qualRes.error', 'histRes.error', 'bonusRes.error']) {
      expect(teil, f).toContain(f)
    }
  })

  it('zeigt die Akte dann gar nicht', () => {
    expect(AKTE).toContain('if (ladefehler) return (')
    const teil = AKTE.slice(AKTE.indexOf('if (ladefehler) return (')).slice(0, 400)
    expect(teil).toContain('<Banner tone="danger">{ladefehler}</Banner>')
  })

  it('und nennt die Folge beim Namen', () => {
    expect(AKTE).toMatch(/leere Nachweisliste wäre von einer fehlenden nicht zu unterscheiden/)
  })

  it('der Stammsatz bleibt ein eigener Fall', () => {
    // „nicht gefunden" und „nicht lesbar" sind verschiedene Aussagen.
    expect(AKTE).toContain('if (cgRes.error || !cgRes.data) { setNotFound(true)')
  })

  it('beide Seiten setzen ihren Zustand bei jedem Laden zurück', () => {
    expect(NOTFALL).toContain('setLadefehler(null)')
    expect(AKTE).toContain('setLadefehler(null)')
  })
})

describe('Der Riegel wird auch betreten', () => {
  // Dieselbe Lehre wie in Block 81: eine Zusicherung, die nur die
  // ANWESENHEIT von Quellenliste und Fehlerzweig prueft, laesst eine
  // Mutation durch, die den Filter auf „nie etwas" setzt. Der Zweig waere
  // da und wuerde nie erreicht. Gefunden in der Mutationsprobe.
  for (const [name, quelle] of [['Notfallseite', NOTFALL], ['Mitarbeiterakte', AKTE]] as const) {
    it(`${name}: die Fehlerliste entsteht aus den Gruenden`, () => {
      expect(quelle).toContain('].filter(([, grund]) => grund !== null)')
    })

    it(`${name}: und der Zweig dahinter meldet es`, () => {
      const ab = quelle.indexOf('if (nichtLesbar.length > 0)')
      expect(ab).toBeGreaterThan(-1)
      const teil = quelle.slice(ab, ab + 1000)
      expect(teil).toContain('setLadefehler(')
      expect(teil).toContain('return')
    })
  }
})

describe('Der Bestand ist mitgezogen', () => {
  it('trägt keinen Eintrag mehr für die beiden Seiten', () => {
    const liste = LINT.slice(
      LINT.indexOf('const BESTAND_GEBUENDELT'),
      LINT.indexOf('function imBestand'),
    )
    expect(liste).not.toContain('kunde/notfall')
    expect(liste).not.toContain('caregivers/[id]')
  })

  it('und ist weiter gesunken', async () => {
    const { BESTAND_GEBUENDELT } = await import('../../scripts/lint-leerzustand')
    expect(BESTAND_GEBUENDELT.length).toBeLessThanOrEqual(46)
  })
})
