/**
 * Pilotversand — die P0-Sperre konnte nie entstehen
 * ═══════════════════════════════════════════════════════════════════════
 *
 * BEFUND (Block 53, 14.09.2026)
 *
 * `pilot_versand_sperre` wurde an VIER Stellen gelesen — als Sperre vor
 * jedem weiteren Pilotversand — und an genau EINER geschrieben: in
 * `pruefeNachVersand()`. Diese Funktion hatte ausser Tests KEINEN
 * Aufrufer.
 *
 * Das Tor las damit eine Tabelle, die niemand fuellt. Die achtstufige
 * Nachpruefung des ersten echten Versands — Provider-Kennung, genau EINE
 * Protokollzeile, keine Retry-Dublette, Empfaenger/Betreff/Betrag,
 * Audit-Eintrag, `sent_at`, keine fremde Organisation — lief nie, und
 * eine Abweichung konnte keine Sperre setzen.
 *
 * Gefunden ueber eine Messung aller Regel- und Waechterfunktionen in
 * `lib/` ohne Aufrufer: 171 geprueft, 11 ohne, davon diese die
 * folgenschwerste. Dieselbe Form wie Block 52 (ArbZG): eine Regel, die
 * niemand ausfuehrt, faellt auch niemandem auf.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const VERSAND = readFileSync('lib/billing/versand/rechnung-versand.ts', 'utf8')

describe('die Nachpruefung ist an den Versandweg gehaengt', () => {
  it('wird aus dem Rechnungsversand gerufen', () => {
    expect(VERSAND).toContain("import { pruefeNachVersand }")
    expect(VERSAND).toContain('await pruefeNachVersand(admin, {')
  })

  it('NUR wenn das Pilottor tatsaechlich gegriffen hat', () => {
    // `gateGilt`, nicht `pilotToken`: bei ausgeschaltetem Pilotbetrieb
    // wird ein mitgegebenes Token IGNORIERT — die Nachpruefung lief dann
    // fuer einen gewoehnlichen Versand und setzte dort eine P0-Sperre.
    // Ein bestehender Test der Versandlogik hat das gefangen.
    const ab = VERSAND.indexOf('await pruefeNachVersand(')
    const davor = VERSAND.slice(Math.max(0, ab - 1200), ab)
    expect(davor).toContain('if (gateGilt) {')
    expect(davor).not.toContain('if (pilotToken) {')
  })

  it('steht NACH den Nachschreibungen — sonst prueft sie ihr eigenes Vorher', () => {
    // Die acht Punkte fragen nach sent_at, invoice_email_log und dem
    // Audit-Eintrag. Vor deren Schreiben waeren alle drei leer.
    const sentAt = VERSAND.indexOf(".update({ sent_at: versendetAm")
    const protokoll = VERSAND.indexOf('const protokolliert = await protokolliere(')
    const audit = VERSAND.indexOf("action: 'email_versendet'")
    const pruefung = VERSAND.indexOf('await pruefeNachVersand(')
    expect(sentAt).toBeGreaterThan(-1)
    expect(pruefung).toBeGreaterThan(sentAt)
    expect(pruefung).toBeGreaterThan(protokoll)
    expect(pruefung).toBeGreaterThan(audit)
  })

  it('schickt den Aufrufer NICHT in einen Fehlerpfad', () => {
    // Die Mail ist raus. Ein Wurf hier liesse den Wiederholungslauf ein
    // zweites Mal senden — genau der Schaden, den die Pruefung verhindern
    // soll.
    const ab = VERSAND.indexOf('await pruefeNachVersand(')
    const block = VERSAND.slice(Math.max(0, ab - 200), ab + 900)
    expect(block).toContain('try {')
    expect(block).toContain('} catch (err) {')
    expect(block).toContain('log.error(')
  })

  it('uebergibt den Betrag in Cent ueber euroZuCent, nicht ueber * 100', () => {
    // `invoices.total_amount` ist eine EURO-Spalte; der Halb-Cent fiel bei
    // Math.round um einen Cent nach unten.
    const ab = VERSAND.indexOf('await pruefeNachVersand(')
    expect(VERSAND.slice(ab, ab + 500)).toContain('euroZuCent(inv.total_amount')
  })

  it('meldet den Status, den der Versandweg tatsaechlich erreicht hat', () => {
    const ab = VERSAND.indexOf('await pruefeNachVersand(')
    expect(VERSAND.slice(ab, ab + 500)).toContain("versandStatus: 'versendet'")
  })
})

describe('Sperre lesen und Sperre schreiben gehoeren zusammen', () => {
  const LESER = [
    'lib/pilot/send-gate.ts',
    'lib/pilot/rechnung-pilot.ts',
    'lib/pilot/pilot-phasen.ts',
  ]

  it('die Tabelle wird weiterhin als Tor gelesen', () => {
    for (const datei of LESER) {
      expect(readFileSync(datei, 'utf8'), datei).toContain('pilot_versand_sperre')
    }
  })

  it('und sie hat jetzt einen erreichbaren Schreiber', () => {
    // Der Schreibweg liegt in pruefeNachVersand; erreichbar ist er erst
    // seit dem Aufruf im Versandweg.
    const schreiber = readFileSync('lib/pilot/post-send-verification.ts', 'utf8')
    expect(schreiber).toContain("from('pilot_versand_sperre')")
    expect(VERSAND).toContain('pruefeNachVersand(')
  })
})
