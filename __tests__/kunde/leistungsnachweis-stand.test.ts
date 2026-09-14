/**
 * Nachweisstand im Kundenportal — was die Kundin über ihren Einsatz erfährt.
 * @see lib/kunde/leistungen.ts, lib/leistungsnachweis/status-sync.ts
 *
 * ── WORUM ES HIER GEHT ────────────────────────────────────────────────
 * Dieselbe Zeile in `service_records` wird von drei Seiten verschieden
 * gelesen, und alle drei haben recht:
 *
 *   - der Sammelrechnungslauf fragt „rechne ich das ab?"
 *   - der Beleg-Guard fragt „könnte ich das gegenüber der Kasse beweisen?"
 *   - die Kundin fragt „ist mein Einsatz erledigt?"
 *
 * Bis zum 14.09.2026 beantwortete das Portal die dritte Frage mit dem
 * Statuswort und kannte nur zwei Antworten. Diese Tests halten fest,
 * welche Frage hier gestellt wird — und welche ausdrücklich nicht.
 */
import { describe, it, expect } from 'vitest'
import {
  nachweisstand,
  wartetAufUnterschrift,
  NACHWEISSTAND_LABEL,
} from '@/lib/kunde/leistungen'
import { zaehltAlsUnterschrieben } from '@/lib/leistungsnachweis/status-sync'

describe('nachweisstand — die Rangfolge der Auskünfte', () => {
  it('Storno schlägt alles: ein widerrufener Einsatz wartet auf nichts', () => {
    expect(nachweisstand({ status: 'signed', billing_status: 'STORNIERT' })).toBe('storniert')
    expect(nachweisstand({ status: 'invoiced', proof_status: 'STORNIERT' })).toBe('storniert')
    expect(wartetAufUnterschrift({ status: 'signed', billing_status: 'STORNIERT' })).toBe(false)
  })

  it('Abgerechnet schlägt die Unterschrift — bezahlt ist die endgültigere Auskunft', () => {
    expect(nachweisstand({ status: 'invoiced', proof_status: 'ENTWURF' })).toBe('abgerechnet')
    expect(nachweisstand({ status: 'complete', proof_status: 'ABGERECHNET' })).toBe('abgerechnet')
  })

  it('Unterschrieben, wenn ein Beleg vorliegt — auch ohne passenden proof_status', () => {
    expect(nachweisstand({ status: 'signed', proof_status: 'UNTERSCHRIEBEN' })).toBe('unterschrieben')
    expect(nachweisstand({ status: 'signed', proof_status: 'ENTWURF', signature_hash: 'ab12' })).toBe('unterschrieben')
    expect(nachweisstand({ status: 'signed', proof_status: 'ENTWURF', client_signature: 'Frau Meier' })).toBe('unterschrieben')
  })

  it('Offen nur, wenn wirklich nichts vorliegt', () => {
    const leer = { status: 'signed', proof_status: 'ENTWURF', signature_hash: null, client_signature: null }
    expect(nachweisstand(leer)).toBe('offen')
    expect(wartetAufUnterschrift(leer)).toBe(true)
  })

  it("'false' und Leerstring sind keine Unterschrift (client_signature ist live text)", () => {
    expect(nachweisstand({ status: 'signed', client_signature: 'false' })).toBe('offen')
    expect(nachweisstand({ status: 'signed', client_signature: '   ' })).toBe('offen')
  })

  it('jeder Stand hat ein Etikett — kein roher Schlüssel in der Oberfläche', () => {
    for (const stand of ['storniert', 'abgerechnet', 'unterschrieben', 'offen'] as const) {
      expect(NACHWEISSTAND_LABEL[stand]).toBeTruthy()
      expect(NACHWEISSTAND_LABEL[stand]).not.toMatch(/^[a-z_]+$/)
    }
  })
})

describe('REGRESSION: die Kundenfrage ist nicht die Abrechnungsfrage', () => {
  /**
   * Gemessen am 14.09.2026 gegen Produktion: von 28 im Portal sichtbaren
   * Nachweisen tragen 24 ein Unterschriftsbild und 15 stehen auf
   * status='invoiced' — und ALLE 28 tragen proof_status='ENTWURF', weil es
   * den Rückweg status → proof_status nirgends gibt.
   *
   * Wer hier die Regel des Sammelrechnungslaufs einsetzt, färbt das ganze
   * Portal rot. Diese Fälle sind die Live-Konstellationen, eins zu eins.
   */
  const abgerechnetMitBild = { status: 'invoiced', proof_status: 'ENTWURF', signature_hash: null, client_signature: 'Frau Meier' }
  const unterschriebenMitBild = { status: 'signed', proof_status: 'ENTWURF', signature_hash: null, client_signature: 'Frau Meier' }
  const wirklichOffen = { status: 'signed', proof_status: 'ENTWURF', signature_hash: null, client_signature: null }

  it('der Abrechnungslauf sieht alle drei als nicht unterschrieben', () => {
    expect(zaehltAlsUnterschrieben(abgerechnetMitBild)).toBe(false)
    expect(zaehltAlsUnterschrieben(unterschriebenMitBild)).toBe(false)
    expect(zaehltAlsUnterschrieben(wirklichOffen)).toBe(false)
  })

  it('die Kundin bekommt trotzdem drei verschiedene, wahre Auskünfte', () => {
    expect(nachweisstand(abgerechnetMitBild)).toBe('abgerechnet')
    expect(nachweisstand(unterschriebenMitBild)).toBe('unterschrieben')
    expect(nachweisstand(wirklichOffen)).toBe('offen')
  })

  it('ein bereits abgerechneter Einsatz fordert die Kundin nie zur Unterschrift auf', () => {
    expect(wartetAufUnterschrift(abgerechnetMitBild)).toBe(false)
    // Auch der eine Live-Fall ohne jeden Beleg (2026-06-24) bleibt still:
    // die Rechnung ist raus, eine Aufforderung wäre sinnlos.
    expect(wartetAufUnterschrift({ status: 'invoiced', proof_status: 'ENTWURF' })).toBe(false)
  })
})

describe('zaehltAlsUnterschrieben — der Spiegel der Rechnungs-RPC', () => {
  it('bildet die RPC-Bedingung wörtlich ab', () => {
    expect(zaehltAlsUnterschrieben({ proof_status: 'UNTERSCHRIEBEN' })).toBe(true)
    expect(zaehltAlsUnterschrieben({ proof_status: 'ENTWURF', signature_hash: 'ab12' })).toBe(true)
    expect(zaehltAlsUnterschrieben({ proof_status: 'ENTWURF', signature_hash: null })).toBe(false)
    expect(zaehltAlsUnterschrieben({})).toBe(false)
  })

  it('zählt das Unterschriftsbild NICHT — die RPC liest diese Spalte nicht', () => {
    // Nicht "zu streng": wer das hier aufweicht, lässt die Vorprüfung eine
    // andere Menge melden als die, die die Datenbank anschliessend abrechnet.
    expect(zaehltAlsUnterschrieben({ client_signature: 'Frau Meier' } as never)).toBe(false)
  })
})
