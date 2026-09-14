/**
 * Eine Verordnung, die unverbraucht aussah
 * ═══════════════════════════════════════════════════════════════════════
 *
 * BEFUND (Block 86) — aus dem Bestand, den Block 79 sichtbar gemacht hat.
 *
 * 1. /admin/verordnungen stellt die Verordnung ihrem VERBRAUCH gegenüber:
 *    erbrachte Leistungen, Rechnungen, Einsätze, Leistungspositionen.
 *    Geprüft wurde nur die Verordnungsliste selbst — die acht übrigen
 *    Abfragen wurden ungeprüft als leere Listen weiterverarbeitet.
 *
 *    Fällt `rRes` aus, sieht jede Verordnung unverbraucht aus; fällt
 *    `iRes` aus, unberechnet; fällt `lRes` aus, hat sie keine
 *    Leistungspositionen — und jemand trägt sie ein zweites Mal ein.
 *
 * 2. /admin/records/new legt einen LEISTUNGSNACHWEIS an. Klient und
 *    Betreuungskraft kommen ausschließlich aus zwei Abfragen, beide
 *    ungeprüft. Leere Auswahlfelder sehen aus wie „kein Klient angelegt",
 *    nicht wie „nicht nachgesehen". Wer daraufhin einen Klienten neu
 *    anlegt, hat ihn zweimal.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const VERORDNUNGEN = readFileSync('app/admin/verordnungen/page.tsx', 'utf8')
const NEU = readFileSync('app/admin/records/new/page.tsx', 'utf8')
const LINT = readFileSync('scripts/lint-leerzustand.ts', 'utf8')

describe('Verordnungen: der Verbrauch ist keine Vermutung', () => {
  it('prüft alle neun Abfragen', () => {
    const teil = VERORDNUNGEN.slice(VERORDNUNGEN.indexOf('const nichtLesbar = ([')).slice(0, 900)
    for (const n of [
      'vRes.error', 'cRes.error', 'gRes.error', 'aRes.error', 'rRes.error',
      'iRes.error', 'absRes.error', 'allAssignRes.error', 'lRes.error',
    ]) {
      expect(teil, n).toContain(n)
    }
  })

  it('die Fehlerliste entsteht aus den Fehlern', () => {
    expect(VERORDNUNGEN).toContain('.filter(([, fehler]) => fehler != null)')
  })

  it('zeigt dann keine Verordnungen', () => {
    const ab = VERORDNUNGEN.indexOf('if (nichtLesbar.length > 0) {')
    expect(ab).toBeGreaterThan(-1)
    const teil = VERORDNUNGEN.slice(ab, ab + 900)
    expect(teil).toContain('setError(')
    // Der Ausstieg kommt VOR dem Setzen der Liste. Ein Fenster, das
    // „setVerordnungen" gar nicht enthalten darf, waere zu breit gefasst:
    // die Zeile steht unmittelbar nach dem Block.
    const aus = teil.indexOf('return')
    expect(aus).toBeGreaterThan(-1)
    expect(aus).toBeLessThan(teil.indexOf('setVerordnungen('))
  })

  it('und die Seite zeigt nur den Grund, keine Registerkarten mit „0"', () => {
    expect(VERORDNUNGEN).toContain('if (error && verordnungen.length === 0 && !loading) {')
  })

  it('nennt die Folge beim Namen', () => {
    // Die Meldung ist im Quelltext umbrochen; gesucht wird das Wort.
    expect(VERORDNUNGEN).toMatch(/unverbrauchte/)
  })

  it('die Ärzte-Stammdaten bleiben bewusst nicht blockierend', () => {
    // Ausdrückliche Entscheidung dieser Datei — sie bleibt.
    expect(VERORDNUNGEN).toMatch(/nicht kritisch fuer die Verordnungsliste/)
  })
})

describe('Neuer Nachweis: eine leere Auswahl ist keine Auskunft', () => {
  it('prüft beide Abfragen', () => {
    const teil = NEU.slice(NEU.indexOf('const nichtLesbar = ([')).slice(0, 400)
    expect(teil).toContain('cRes.error')
    expect(teil).toContain('gRes.error')
    expect(teil).toContain('.filter(([, fehler]) => fehler != null)')
  })

  it('leert beide Listen und meldet es', () => {
    const ab = NEU.indexOf('if (nichtLesbar.length > 0) {')
    const teil = NEU.slice(ab, ab + 700)
    expect(teil).toContain('setClients([])')
    expect(teil).toContain('setCaregivers([])')
    expect(teil).toContain('setError(')
    expect(teil).toContain('return')
  })

  it('und warnt davor, einen Nachweis darauf anzulegen', () => {
    expect(NEU).toMatch(/bevor ein Nachweis angelegt wird/)
  })
})

describe('Der Bestand ist mitgezogen', () => {
  it('und ist weiter gesunken', async () => {
    const { BESTAND_GEBUENDELT } = await import('../../scripts/lint-leerzustand')
    expect(BESTAND_GEBUENDELT.length).toBeLessThanOrEqual(32)
    expect(BESTAND_GEBUENDELT.some(e => e.datei.includes('verordnungen'))).toBe(false)
    expect(BESTAND_GEBUENDELT.some(e => e.datei.includes('records/new'))).toBe(false)
  })
})
