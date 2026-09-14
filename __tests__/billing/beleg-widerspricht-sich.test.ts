/**
 * Ein Beleg, der sich selbst widerspricht — und eine Stornierung zu viel
 * ═══════════════════════════════════════════════════════════════════════
 *
 * BEFUND (Block 90)
 *
 * 1. `erzeugeRechnungsPaket()` prüft die Rechnungspositionen auf ihren
 *    Lesefehler (`if (itemsErr) throw`). Die beiden Abfragen unmittelbar
 *    danach — Leistungen und Unterschriften — nicht. Dieselbe Funktion,
 *    zwei Maßstäbe.
 *
 *    Ohne `recData` trägt der Leistungsnachweis im Paket KEINE Zeilen,
 *    während die Rechnung daneben ihre Positionen auflistet: ein Beleg,
 *    der sich selbst widerspricht, und er geht an den Kunden oder an die
 *    Kasse.
 *
 *    Ohne `sigData` sieht der Nachweis UNUNTERSCHRIEBEN aus. Die
 *    Datenbank lässt eine Rechnung ohne Unterschrift gar nicht erst zu
 *    (RPC v8) — das Dokument hätte das Gegenteil dessen behauptet, was
 *    das Tor davor geprüft hat.
 *
 * 2. `storniereGeloesteAssignments()` liest, welche Einsätze noch an
 *    einem anderen Tour-Halt hängen. Der verworfene Fehler machte daraus
 *    „keiner wird noch gebraucht" — und die Funktion stornierte Einsätze,
 *    die in einer anderen Tour weiterlaufen. Der Schreibvorgang darunter
 *    ist sorgfältig abgesichert; der Lesevorgang, der seine Menge
 *    bestimmt, war es nicht.
 *
 * ── ZWEI NACHBARN, DIE BEWUSST BLEIBEN ───────────────────────────────
 * Im selben Zug geprüft und ausdrücklich NICHT geändert:
 *
 *   app/api/billing/auto-invoice/route.ts — der dortige verworfene
 *   Fehler ist begründet: die Rechnung steht zu dem Zeitpunkt schon in
 *   der Datenbank, und ein 500 lüde den Aufrufer zum zweiten Versuch und
 *   damit zur Doppelabrechnung ein.
 *
 *   app/api/billing/payments/allocate/route.ts — dort wirkt der
 *   verworfene Fehler fail-closed (Vergleich der Trefferzahl schlägt
 *   fehl, 404), und das steht seit dem 01.09.2026 als geprüft im Code.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const PAKET = readFileSync('lib/pdf/rechnung-paket.ts', 'utf8')
const TOUREN = readFileSync('lib/touren/server.ts', 'utf8')
const AUTOINV = readFileSync('app/api/billing/auto-invoice/route.ts', 'utf8')
const ALLOC = readFileSync('app/api/billing/payments/allocate/route.ts', 'utf8')

describe('Rechnungspaket: kein Beleg aus ungelesenen Zeilen', () => {
  it('prüft die Leistungen', () => {
    expect(PAKET).toContain('const { data: recData, error: recErr }')
    expect(PAKET).toContain('if (recErr) {')
  })

  it('und die Unterschriften', () => {
    expect(PAKET).toContain('const { data: sigData, error: sigErr }')
    expect(PAKET).toContain('if (sigErr) {')
  })

  it('beide werfen den Paketfehler, nicht irgendeinen', () => {
    const teil = PAKET.slice(PAKET.indexOf('const { data: recData'))
      .slice(0, 1800)
    expect((teil.match(/new RechnungsPaketError\(/g) ?? []).length).toBe(2)
  })

  it('und benennen die Folge', () => {
    expect(PAKET).toMatch(/widerspricht sich selbst/)
    expect(PAKET).toMatch(/ununterschrieben/)
  })

  it('die Positionsprüfung bleibt, wie sie war', () => {
    expect(PAKET).toContain('if (itemsErr) {')
  })

  it('kein `records = recData || []` mehr ohne Prüfung davor', () => {
    const vor = PAKET.slice(0, PAKET.indexOf('records = recData || []'))
    expect(vor).toContain('if (recErr) {')
  })
})

describe('Tour-Auflösung: keine Stornierung aus einer leeren Antwort', () => {
  it('prüft die verknüpften Stops', () => {
    expect(TOUREN).toContain('const { data: verknuepfte, error: verknuepftFehler }')
    expect(TOUREN).toContain('if (verknuepftFehler) {')
  })

  it('bricht ab, statt alles zu stornieren', () => {
    const ab = TOUREN.indexOf('if (verknuepftFehler) {')
    const teil = TOUREN.slice(ab, ab + 600)
    expect(teil).toContain('throw new Error(')
    expect(teil).toMatch(/Es wurde NICHTS storniert/)
  })

  it('und zwar VOR der Bildung von `frei`', () => {
    expect(TOUREN.indexOf('if (verknuepftFehler) {'))
      .toBeLessThan(TOUREN.indexOf('const frei = ids.filter'))
  })

  it('der geprüfte Schreibvorgang bleibt unverändert', () => {
    expect(TOUREN).toMatch(/Ein Fehler hier bliebe sonst unsichtbar/)
  })
})

describe('Zwei Nachbarn bleiben bewusst, wie sie sind', () => {
  it('auto-invoice: die Begründung steht im Code', () => {
    expect(AUTOINV).toMatch(/zur Doppelabrechnung einlaedt/)
    expect(AUTOINV).toContain('const { data: invoiceItems } = await admin')
  })

  it('allocate: fail-closed und als geprüft vermerkt', () => {
    expect(ALLOC).toMatch(/GEPRUEFT 01\.09\.2026/)
    expect(ALLOC).toContain('if ((invoices?.length ?? 0) !== invoiceIds.length)')
  })
})
