/**
 * SEPA — das Mandat blieb auf FRST stehen, ohne dass es jemand erfuhr
 * ═══════════════════════════════════════════════════════════════════════
 *
 * BEFUND (Block 58, 14.09.2026)
 *
 * Nach dem ersten Einzug wird ein Mandat von `FRST` auf `RCUR`
 * fortgeschrieben. Beide Schreibwege verwarfen Fehler UND getroffene
 * Zeilen — und PostgREST meldet null getroffene Zeilen nicht.
 *
 * Bleibt ein Mandat auf 'FRST', geht es im NAECHSTEN Sammelauftrag
 * erneut als Erstlastschrift hinaus. Eine zweite FRST zum selben Mandat
 * weist die Bank zurueck: der Einzug scheitert, die Rechnung bleibt
 * offen, und im Code haette nichts davon gestanden.
 *
 * Dreissig Zeilen weiter oben prueft der `xml_storage_path`-Vermerk
 * beides und protokolliert laut. Ausgerechnet der folgenschwerere
 * Schreibvorgang tat es nicht — dieselbe Asymmetrie wie in den Bloecken
 * 55 bis 57.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const MODUL = readFileSync('lib/billing/sepa/sepa-service.ts', 'utf8')

const SCHLEIFE = (() => {
  const ab = MODUL.indexOf('// Mandate auf RCUR setzen')
  expect(ab, 'Mandats-Schleife nicht gefunden').toBeGreaterThan(-1)
  return MODUL.slice(ab, MODUL.indexOf('logBillingAction(', ab))
})()

describe('der Schreibvorgang wird geprueft', () => {
  it('nimmt den Fehler entgegen', () => {
    expect(SCHLEIFE).toContain('error: mandatFehler')
  })

  it('und die getroffenen Zeilen', () => {
    expect(SCHLEIFE).toContain('data: fortgeschrieben')
    expect(SCHLEIFE).toContain("fortgeschrieben?.length ?? 0) === 0")
  })

  it('kein blindes `await supabase` mehr auf sepa_mandates', () => {
    expect(SCHLEIFE).not.toMatch(/\n\s*await supabase\s*\n\s*\.from\('sepa_mandates'\)/)
  })

  it('beide Faelle laufen ueber denselben geprueften Weg', () => {
    // Vorher gab es zwei getrennte, beide ungeprueft. Ein Zweig, der
    // spaeter vergessen wird, ist genau die Form des Befunds.
    expect((SCHLEIFE.match(/from\('sepa_mandates'\)/g) ?? []).length).toBe(1)
    expect(SCHLEIFE).toContain("mandate.sequence_type === 'FRST'")
  })
})

describe('fail-soft, aber sichtbar', () => {
  it('bricht den Lauf NICHT ab', () => {
    // Der Einzug ist vorbereitet, die Datei liegt, der Auftrag steht.
    expect(SCHLEIFE).not.toContain('throw new Error(')
  })

  it('protokolliert mit Mandat, Ist- und Sollwert', () => {
    expect(SCHLEIFE).toContain('mandateId: mandate.id')
    expect(SCHLEIFE).toContain('vorher: mandate.sequence_type')
    expect(SCHLEIFE).toContain('gewollt:')
  })

  it('sammelt die betroffenen Mandate', () => {
    expect(SCHLEIFE).toContain('mandateNichtFortgeschrieben.push(mandate.id)')
  })
})

describe('der Befund landet im Abrechnungs-Audit', () => {
  const AUDIT = MODUL.slice(MODUL.indexOf('logBillingAction(', MODUL.indexOf('// Mandate auf RCUR')))

  it('neben dem Sammelauftrag, nicht nur im Log', () => {
    // Im Log sucht nach einem fehlgeschlagenen Einzug niemand; im
    // billing_audit_trail steht der Auftrag selbst.
    expect(AUDIT).toContain('mandate_nicht_fortgeschrieben')
  })

  it('nur wenn etwas offen blieb', () => {
    // Ein leeres Feld in jedem Eintrag liest nach kurzer Zeit niemand mehr.
    expect(AUDIT).toContain('mandateNichtFortgeschrieben.length > 0')
  })
})

describe('das Vorbild stand in derselben Funktion', () => {
  it('der xml_storage_path-Vermerk prueft Fehler und Zeilen', () => {
    const ab = MODUL.indexOf('xml_storage_path: storagePath')
    const block = MODUL.slice(ab - 400, ab + 700)
    expect(block).toContain('error: pfadFehler')
    expect(block).toContain('pfadVermerkt?.length ?? 0) === 0')
  })
})
