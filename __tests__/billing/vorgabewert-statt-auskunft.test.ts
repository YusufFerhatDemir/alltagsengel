/**
 * Der Vorgabewert, der eingesetzt wurde, weil niemand nachsehen konnte
 * ═══════════════════════════════════════════════════════════════════════
 *
 * BEFUND (Block 94) — eine eigene Form: nicht die leere Liste, sondern
 * der EINGESETZTE ERSATZWERT.
 *
 * 1. `mahnung-pdf.ts` lädt drei Dinge. Organisation und Rechnung prüfen
 *    ihren Lesefehler ausdrücklich — mit einem Kommentar über einen
 *    früheren 42703, der genau daran aufgefallen war. Der dritte, der
 *    Mahnvorgang, nicht.
 *
 *    `entry?.dunning_fee_cents || DUNNING_FEES_CENTS[dunningLevel]` fällt
 *    dann auf den Standardsatz zurück. Hat der Betrieb für DIESEN Vorgang
 *    eine andere Gebühr festgelegt, fordert der Brief einen Betrag, der
 *    so nicht vereinbart ist — und er geht als Zahlungsaufforderung raus.
 *
 * 2. `getDatevConfig()` gibt bei `!data` die Vorgabewerte zurück. Der
 *    Kommentar nennt den gemeinten Fall: „Falls noch nichts konfiguriert
 *    ist." Der verworfene Lesefehler führte in denselben Zweig.
 *
 *    Auf dem Exportweg fällt die leere Beraternummer anschließend auf —
 *    fail-closed, aber mit der Begründung „DATEV-Konfiguration
 *    unvollständig" über eine Konfiguration, die vollständig ist. In den
 *    Pilot-Auskünften wird der Rückfall ANGEZEIGT: SKR03,
 *    Sachkontenlänge 4, nächste Debitorennummer 10000.
 *
 * Beide Male ist die Unterscheidung dieselbe: „nicht hinterlegt" ist eine
 * Aussage über die Daten, „nicht lesbar" eine über die Abfrage.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const MAHNUNG = readFileSync('lib/billing/dunning/mahnung-pdf.ts', 'utf8')
const DATEV = readFileSync('lib/billing/datev/datev-config.ts', 'utf8')

describe('Mahnung: kein Brief mit geratener Gebühr', () => {
  it('nimmt den Lesefehler des Mahnvorgangs entgegen', () => {
    expect(MAHNUNG).toContain('const { data: entry, error: entryErr }')
  })

  it('unterscheidet „keine Zeile" von „nicht lesbar"', () => {
    // PGRST116 ist der Normalfall und darf den Standardsatz behalten.
    expect(MAHNUNG).toContain("if (entryErr && entryErr.code !== 'PGRST116') {")
  })

  it('und druckt bei einem echten Fehler nichts', () => {
    const ab = MAHNUNG.indexOf("if (entryErr && entryErr.code !== 'PGRST116') {")
    const teil = MAHNUNG.slice(ab, ab + 600)
    expect(teil).toContain('throw new Error(')
    expect(teil).toMatch(/KEINE Mahnung/)
  })

  it('der Riegel steht VOR der Gebührenberechnung', () => {
    expect(MAHNUNG.indexOf("if (entryErr && entryErr.code !== 'PGRST116')"))
      .toBeLessThan(MAHNUNG.indexOf('const feeCents = entry?.dunning_fee_cents'))
  })

  it('der Standardsatz bleibt für den echten Fall', () => {
    expect(MAHNUNG).toContain('entry?.dunning_fee_cents || DUNNING_FEES_CENTS[dunningLevel]')
  })

  it('die beiden geprüften Nachbarn bleiben, wie sie waren', () => {
    expect(MAHNUNG).toContain('if (orgErr) throw new Error(')
    expect(MAHNUNG).toContain('if (invErr) throw new Error(')
  })
})

describe('DATEV: keine Vorgabewerte aus einem Lesefehler', () => {
  it('nimmt den Fehler entgegen', () => {
    expect(DATEV).toContain('const { data, error } = await supabase')
    expect(DATEV).toContain('if (error) {')
  })

  it('und wirft, statt Vorgabewerte einzusetzen', () => {
    const ab = DATEV.indexOf('if (error) {')
    // Nur der Fehlerzweig: der `!data?.datev_config`-Zweig darunter setzt
    // die Vorgabewerte zu Recht, und ein zu breites Fenster traefe ihn.
    const teil = DATEV.slice(ab, DATEV.indexOf('if (!data?.datev_config)', ab))
    expect(teil).toContain('throw new Error(')
    expect(teil).toMatch(/KEINE Vorgabewerte/)
    expect(teil).not.toContain('return { ...DEFAULT_CONFIG }')
  })

  it('der dokumentierte Fall behält seinen Zweig', () => {
    // „Falls noch nichts konfiguriert ist, werden Defaults zurueckgegeben."
    expect(DATEV).toContain('if (!data?.datev_config) return { ...DEFAULT_CONFIG };')
    expect(DATEV.indexOf('if (error) {'))
      .toBeLessThan(DATEV.indexOf('if (!data?.datev_config)'))
  })

  it('und die Vorgabewerte selbst sind unverändert', () => {
    expect(DATEV).toContain("kontenrahmen: 'SKR03'")
    expect(DATEV).toContain('naechsteDebitorennummer: 10000')
    expect(DATEV).toContain("beraternummer: ''")
  })
})
