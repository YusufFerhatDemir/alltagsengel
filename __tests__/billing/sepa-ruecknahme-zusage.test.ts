/**
 * SEPA — eine Ruecknahme-Zusage, die nicht eingehalten sein musste
 * ═══════════════════════════════════════════════════════════════════════
 *
 * BEFUND (Block 57, 14.09.2026)
 *
 * Erkennt der Sammelauftragslauf einen parallelen Zugriff (dieselbe
 * Rechnung ist zeitgleich in einen anderen Auftrag geraten), nimmt er
 * seinen eigenen Lauf zurueck: Posten loeschen, Auftrag loeschen, werfen.
 * Die Fehlermeldung sagt zu:
 *
 *     „Dieser Lauf wurde vollstaendig zurueckgenommen — es wurde nichts
 *      eingezogen."
 *
 * Beide Loeschungen verwarfen ihren Fehler. Schlug eine fehl, war die
 * Zusage eine Falschaussage: der Sammelauftrag blieb in der Datenbank und
 * war weiter exportierbar. Aus einem VERHINDERTEN Doppeleinzug waere so
 * ein echter geworden — und niemand haette danach gesucht, weil die
 * Meldung das Gegenteil behauptete.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const MODUL = readFileSync('lib/billing/sepa/sepa-service.ts', 'utf8')

/** Der Ruecknahme-Block. */
const BLOCK = (() => {
  const ab = MODUL.indexOf('if (verloren.length > 0)')
  expect(ab, 'Ruecknahme-Block nicht gefunden').toBeGreaterThan(-1)
  return MODUL.slice(ab, ab + 2200)
})()

describe('beide Loeschungen werden geprueft', () => {
  it('die Posten-Loeschung nimmt ihren Fehler entgegen', () => {
    expect(BLOCK).toContain('error: postenFehler')
  })

  it('die Auftrags-Loeschung ebenso', () => {
    expect(BLOCK).toContain('error: auftragFehler')
  })

  it('kein blindes `await supabase.from(...).delete()` mehr', () => {
    expect(BLOCK).not.toMatch(/\n\s*await supabase\.from\('sepa_(batch_items|batches)'\)\.delete/)
  })
})

describe('die Zusage wird nur gegeben, wenn sie stimmt', () => {
  it('bei einem Fehlschlag steht KEINE Ruecknahme-Zusage im Text', () => {
    const ab = BLOCK.indexOf('if (postenFehler || auftragFehler)')
    expect(ab).toBeGreaterThan(-1)
    const fehlerzweig = BLOCK.slice(ab, BLOCK.indexOf('}', BLOCK.indexOf('Bitte ihn von Hand')))
    expect(fehlerzweig).not.toContain('vollstaendig zurueckgenommen')
    expect(fehlerzweig).not.toContain('es wurde nichts eingezogen')
  })

  it('sondern der Hinweis, dass der Auftrag noch steht', () => {
    expect(BLOCK).toContain('steht NOCH in der Datenbank')
    expect(BLOCK).toContain('darf nicht')
  })

  it('und die Kennung des Auftrags, damit man ihn findet', () => {
    const ab = BLOCK.indexOf('if (postenFehler || auftragFehler)')
    expect(BLOCK.slice(ab, ab + 900)).toContain('${batch.id}')
  })

  it('der Erfolgsfall behaelt seine Zusage', () => {
    expect(BLOCK).toContain('vollstaendig zurueckgenommen')
    expect(BLOCK).toContain('es wurde nichts eingezogen')
  })
})

describe('die Reihenfolge bleibt', () => {
  it('erst die Posten, dann der Auftrag', () => {
    // Andersherum blieben Posten ohne Auftrag zurueck.
    expect(BLOCK.indexOf("from('sepa_batch_items')"))
      .toBeLessThan(BLOCK.indexOf("from('sepa_batches')"))
  })

  it('der Auftrag wird nicht geloescht, wenn schon die Posten scheiterten', () => {
    // Sonst stuenden verwaiste Posten ohne Auftrag in der Tabelle.
    expect(BLOCK).toContain('postenFehler\n      ? { error: null }')
  })
})
