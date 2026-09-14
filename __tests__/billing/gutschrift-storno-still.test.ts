/**
 * Gutschrift verwerfen — der Storno auf der Geld-Tabelle war stumm
 * ═══════════════════════════════════════════════════════════════════════
 *
 * BEFUND (Block 56, 14.09.2026)
 *
 * Beim Verwerfen einer Korrektur wird die zugehoerige
 * Gutschrift-Rechnung storniert. Zwei Luecken in derselben Funktion:
 *
 *   * Der Lesefehler der Gutschrift-Abfrage wurde verworfen. Fiel sie
 *     aus, war `creditInvoice` null, der ganze Block wurde uebersprungen —
 *     und die Gutschrift blieb AKTIV, waehrend die Korrektur darunter als
 *     verworfen galt. Eine Forderung des Kunden, die niemand mehr sieht.
 *
 *   * Das UPDATE auf `invoices` pruefte weder Fehler noch getroffene
 *     Zeilen. PostgREST meldet null Zeilen NICHT als Fehler.
 *
 * Der Gegensatz stand fuenf Zeilen tiefer: das Update auf
 * `invoice_corrections` prueft beides seit jeher. Ausgerechnet der
 * Schreibvorgang auf der GELD-Tabelle war der ungesicherte.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const MODUL = readFileSync('lib/billing/core/credit-notes.ts', 'utf8')

/**
 * Der Abschnitt, in dem die Gutschrift storniert wird.
 *
 * Ausdruecklich innerhalb von `discardCreditNote`: `if
 * (correction.correction_invoice_id)` steht auch in `releaseCreditNote`
 * weiter oben, und ein Griff auf das erste Vorkommen pruefte die falsche
 * Funktion.
 */
const ABSCHNITT = (() => {
  const fn = MODUL.indexOf('export async function discardCreditNote')
  expect(fn, 'discardCreditNote nicht gefunden').toBeGreaterThan(-1)
  const ab = MODUL.indexOf('if (correction.correction_invoice_id)', fn)
  expect(ab).toBeGreaterThan(fn)
  return MODUL.slice(ab, MODUL.indexOf("from('invoice_corrections')", ab))
})()

describe('der Lesefehler wird nicht mehr verworfen', () => {
  it('die Gutschrift-Abfrage nimmt ihren Fehler entgegen', () => {
    expect(ABSCHNITT).toContain('error: creditLeseFehler')
  })

  it('und bricht ab, statt die Gutschrift stillschweigend stehen zu lassen', () => {
    expect(ABSCHNITT).toContain('Es wurde nichts verworfen')
  })
})

describe('der Storno prueft Fehler und Zeilenzahl', () => {
  it('nimmt den Fehler entgegen', () => {
    expect(ABSCHNITT).toContain('error: stornoFehler')
  })

  it('und die getroffenen Zeilen', () => {
    // Ohne `.select('id')` ist ein wirkungsloses UPDATE von einem
    // erfolgreichen nicht zu unterscheiden.
    expect(ABSCHNITT).toContain('data: storniert')
    expect(ABSCHNITT).toContain('storniert.length === 0')
  })

  it('sagt in der Meldung, dass auch die Korrektur nicht verworfen wurde', () => {
    // Sonst bliebe offen, in welchem Zustand das Paar steht.
    expect(ABSCHNITT).toContain('ebenfalls nicht verworfen')
  })

  it('kein UNGEBUNDENES `await supabase` mehr auf invoices', () => {
    // Gemeint ist der Aufruf OHNE `const { … } =` davor — nur der wirft
    // das Ergebnis weg. Ein erster Entwurf dieses Tests suchte `await
    // supabase` ohne Zeilenanfang und traf damit auch die korrigierte
    // Fassung.
    expect(ABSCHNITT).not.toMatch(/\n\s*await supabase\s*\n\s*\.from\('invoices'\)/)
    // Gegenprobe: der gebundene Aufruf ist da.
    expect(ABSCHNITT).toMatch(/=\s*await supabase\s*\n\s*\.from\('invoices'\)\s*\n\s*\.update/)
  })
})

describe('die Mandantenbindung bleibt', () => {
  it('eine fremde Organisation wird weiterhin abgewiesen', () => {
    expect(ABSCHNITT).toContain('gehoert nicht zur angegebenen Organisation')
  })

  it('eine festgeschriebene Gutschrift ebenso', () => {
    expect(ABSCHNITT).toContain('ist festgeschrieben und kann nicht verworfen werden')
  })
})

describe('das Vorbild stand fuenf Zeilen tiefer', () => {
  it('das invoice_corrections-Update prueft Fehler und Zeilen', () => {
    const fn = MODUL.indexOf('export async function discardCreditNote')
    const ab = MODUL.indexOf("from('invoice_corrections')", fn)
    const block = MODUL.slice(ab, ab + 700)
    expect(block).toContain(".select('id')")
    expect(MODUL.slice(ab, ab + 900)).toContain('delError')
  })
})
