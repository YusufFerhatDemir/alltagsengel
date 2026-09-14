/**
 * Drei Riegel gegen die doppelte Meldung — alle drei fielen offen aus
 * ═══════════════════════════════════════════════════════════════════════
 *
 * BEFUND (Block 91)
 *
 * `sendeOffeneSicherheitsmeldungen()` sucht Sicherheitsereignisse, die
 * noch keine Meldung bekommen haben. Drei Riegel verhindern, dass jemand
 * eine ZWEITE Mail zur selben Sache bekommt:
 *
 *   a) bereits gemeldet (Meldenachweise im Prüfpfad)
 *   b) schon in der Zustellspur (der Wiederholungslauf ist zuständig)
 *   c) dieselbe Anmeldung, zweimal aufgezeichnet — Trigger-Zeile und
 *      Anwendungszeile beschreiben dasselbe Ereignis
 *
 * Alle drei standen auf verworfenen Lesefehlern. Fiel eine der Abfragen
 * aus, war die zugehörige Menge leer und der Riegel wirkungslos — und
 * zwar in die eine Richtung, die zählt: es geht Post an Menschen raus,
 * die sie schon haben.
 *
 * Riegel c) ist dabei der sprechendste: der lange Absatz darüber
 * begründet ausführlich, warum die Trigger-Zeile übersprungen werden
 * MUSS, wenn die Anwendung dasselbe Ereignis schon hat. Ein
 * Verbindungsabbruch hätte diese ganze Überlegung ausgehebelt.
 *
 * Die Hauptabfrage darüber prüft ihren Fehler seit jeher. Die drei
 * Riegel nicht.
 *
 * ── UND EINE ENTSCHEIDUNG, DIE BLEIBT ────────────────────────────────
 * `alarmspur.ts` und `abfrage.ts` sind ausdrücklich fail-soft: „eine
 * Sicherheitsansicht ohne Alarmspalte ist besser als keine Liste." Das
 * bleibt. Geändert wurde nur, dass die Lücke nicht mehr spurlos ist —
 * das try/catch dort fängt einen PostgREST-Fehler gar nicht, weil er
 * nicht geworfen wird.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const NACHZUEGLER = readFileSync('lib/security/nachzuegler.ts', 'utf8')
const ALARMSPUR = readFileSync('lib/security/alarmspur.ts', 'utf8')
const ABFRAGE = readFileSync('lib/security/abfrage.ts', 'utf8')

describe('Die drei Riegel prüfen ihren Lesefehler', () => {
  it('a) Meldenachweise', () => {
    expect(NACHZUEGLER).toContain('const { data: nachweise, error: nachweiseFehler }')
    expect(NACHZUEGLER).toContain("riegelFehler('Meldenachweise', nachweiseFehler)")
  })

  it('b) Zustellspur', () => {
    expect(NACHZUEGLER).toContain('const { data: zustellungen, error: zustellungenFehler }')
    expect(NACHZUEGLER).toContain("riegelFehler('Zustellspur', zustellungenFehler)")
  })

  it('c) Anwendungszeilen', () => {
    expect(NACHZUEGLER).toContain('const { data: ausDerAnwendung, error: anwendungFehler }')
    expect(NACHZUEGLER).toContain("riegelFehler('Anwendungszeilen', anwendungFehler)")
  })

  it('und jeder bricht den Lauf ab, statt mit halbem Riegel weiterzulaufen', () => {
    expect((NACHZUEGLER.match(/if \(riegelFehler\(/g) ?? []).length).toBe(3)
    const fn = NACHZUEGLER.slice(NACHZUEGLER.indexOf('const riegelFehler ='))
      .slice(0, 600)
    expect(fn).toContain('ergebnis.fehler++')
    expect(fn).toContain('return true')
  })

  it('der Abbruch steht VOR der ersten Meldung', () => {
    const letzterRiegel = NACHZUEGLER.lastIndexOf('if (riegelFehler(')
    expect(letzterRiegel).toBeGreaterThan(-1)
    // Die Meldeschleife kommt danach. Gesucht wird der AUFRUF, nicht die
    // erste Erwaehnung des Namens — der steht schon im Import und im
    // Kopfkommentar, und `indexOf` von vorn traefe diese.
    const aufruf = NACHZUEGLER.indexOf('await meldeSicherheitsereignis({')
    expect(aufruf).toBeGreaterThan(-1)
    expect(letzterRiegel).toBeLessThan(aufruf)
  })

  it('die Begründung nennt den Schaden', () => {
    expect(NACHZUEGLER).toMatch(/statt doppelt zu melden/)
  })

  it('die Hauptabfrage bleibt, wie sie war', () => {
    expect(NACHZUEGLER).toContain("if (error.code !== '42P01' && error.code !== 'PGRST205')")
  })
})

describe('Die Fail-soft-Entscheidung der Ansicht bleibt — aber nicht spurlos', () => {
  it('alarmspur: beide Abfragen protokollieren ihren Fehler', () => {
    expect(ALARMSPUR).toContain('const { data, error } = await admin')
    expect(ALARMSPUR).toMatch(/Versandnachweise nicht lesbar/)
    expect(ALARMSPUR).toMatch(/Zustellversuche nicht lesbar/)
  })

  it('alarmspur: das Verhalten ist unverändert fail-soft', () => {
    expect(ALARMSPUR).toMatch(/Fail-soft: faellt eine der beiden Abfragen aus/)
    // Kein Abbruch, kein throw in den beiden Bloecken.
    const teil = ALARMSPUR.slice(ALARMSPUR.indexOf('// ── 1 · Versandnachweise'))
      .slice(0, 2500)
    expect(teil).not.toContain('throw ')
  })

  it('abfrage: Namen und Organisationen ebenso', () => {
    expect(ABFRAGE).toMatch(/Namen nicht lesbar/)
    expect(ABFRAGE).toMatch(/Organisationsnamen nicht lesbar/)
  })

  it('und die Begründung dafür steht weiterhin im Code', () => {
    expect(ABFRAGE).toMatch(/eine\s*\n?\s*\/\/ Sicherheitsansicht ohne Alarmspalte ist besser als keine Liste/)
  })
})
