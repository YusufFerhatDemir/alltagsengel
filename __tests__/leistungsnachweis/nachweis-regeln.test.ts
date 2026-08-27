/**
 * Leistungsnachweis — Unterschrift und Storno (lib/leistungsnachweis/nachweis-regeln.ts)
 *
 * Warum das zählt: der Statuswechsel auf UNTERSCHRIEBEN löst in der Datenbank
 * `compute_signature_hash()` aus. Der Trigger bildet den Hash allein aus dem
 * Statuswechsel und setzt is_locked=true — die Rechnungs-RPC prüft danach nur
 * noch `proof_status='UNTERSCHRIEBEN' OR signature_hash IS NOT NULL`. Wer den
 * Status ohne Unterschrift setzen kann, macht damit einen Nachweis
 * abrechenbar, den niemand unterschrieben hat, und sperrt ihn zugleich gegen
 * jede Korrektur.
 */

import { describe, it, expect } from 'vitest'
import {
  hatKlientenUnterschrift,
  assertKlientenUnterschrift,
  assertStornierbar,
  STORNIERBARE_BILLING_STATUS,
} from '../../lib/leistungsnachweis/nachweis-regeln'

describe('hatKlientenUnterschrift', () => {
  it('erkennt die im Request mitgeschickte Unterschrift', () => {
    expect(hatKlientenUnterschrift({ neueSignatur: 'data:image/png;base64,iVBOR' })).toBe(true)
  })

  it('erkennt eine bereits hinterlegte Unterschrift', () => {
    expect(hatKlientenUnterschrift({ bestandsSignatur: 'data:image/png;base64,iVBOR' })).toBe(true)
    expect(hatKlientenUnterschrift({ bestandsSignatur: 'M. Meier' })).toBe(true)
  })

  it('erkennt die getrennt abgelegte Unterschrift der App', () => {
    // Die Native-App schreibt nach service_signatures und setzt den
    // proof_status NICHT selbst — ohne diesen Zweig wäre der Verwaltungsweg
    // für App-Unterschriften blockiert.
    expect(hatKlientenUnterschrift({ digitaleSignaturen: 1 })).toBe(true)
  })

  it('meldet fehlende Unterschrift', () => {
    expect(hatKlientenUnterschrift({})).toBe(false)
    expect(hatKlientenUnterschrift({ neueSignatur: '' })).toBe(false)
    expect(hatKlientenUnterschrift({ neueSignatur: '   ' })).toBe(false)
    expect(hatKlientenUnterschrift({ bestandsSignatur: null, digitaleSignaturen: 0 })).toBe(false)
  })

  it('zählt Nicht-Zeichenketten nicht als Unterschrift', () => {
    expect(hatKlientenUnterschrift({ neueSignatur: true })).toBe(false)
    expect(hatKlientenUnterschrift({ neueSignatur: 1 })).toBe(false)
    expect(hatKlientenUnterschrift({ neueSignatur: {} })).toBe(false)
  })

  it('wirft mit einer Begründung, die den Grund nennt', () => {
    expect(() => assertKlientenUnterschrift({})).toThrow(/Unterschrift/)
    expect(() => assertKlientenUnterschrift({ neueSignatur: 'x' })).not.toThrow()
  })
})

describe('assertStornierbar', () => {
  it('lässt einen offenen Nachweis stornieren', () => {
    expect(() => assertStornierbar({ status: 'complete', billing_status: 'OFFEN' })).not.toThrow()
  })

  it('lässt Altbestand ohne billing_status stornieren', () => {
    expect(() => assertStornierbar({ status: 'draft', billing_status: null })).not.toThrow()
    expect(() => assertStornierbar({ status: 'draft', billing_status: '' })).not.toThrow()
  })

  it('lässt ein zweites Storno zu (idempotent)', () => {
    expect(() => assertStornierbar({ status: 'complete', billing_status: 'STORNIERT' })).not.toThrow()
  })

  it('sperrt einen abgerechneten Nachweis', () => {
    // Die Rechnung bliebe stehen, ihre Position wäre storniert: die Forderung
    // offen, ihr Beleg weg.
    expect(() => assertStornierbar({ status: 'invoiced', billing_status: 'ABGERECHNET' }))
      .toThrow(/Gutschrift/)
  })

  it('sperrt auch, wenn nur einer der beiden Stände abgerechnet meldet', () => {
    expect(() => assertStornierbar({ status: 'invoiced', billing_status: null })).toThrow()
    expect(() => assertStornierbar({ status: 'complete', billing_status: 'ABGERECHNET' })).toThrow()
    expect(() => assertStornierbar({ status: 'complete', proof_status: 'ABGERECHNET' })).toThrow()
  })

  it('sperrt einen bereits zugeordneten Nachweis', () => {
    expect(() => assertStornierbar({ status: 'complete', billing_status: 'ZUGEORDNET' })).toThrow()
  })

  it('sperrt unbekannte Abrechnungsstände (Erlaubnisliste)', () => {
    // Ein später ergänzter Status ist damit erst einmal gesperrt statt
    // versehentlich offen.
    expect(() => assertStornierbar({ status: 'complete', billing_status: 'IN_KLAERUNG' })).toThrow()
    expect(STORNIERBARE_BILLING_STATUS).not.toContain('ZUGEORDNET')
    expect(STORNIERBARE_BILLING_STATUS).not.toContain('ABGERECHNET')
  })
})
