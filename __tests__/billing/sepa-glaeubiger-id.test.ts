/**
 * SEPA-Gläubiger-ID — Platzhalter-Sperre (P0)
 *
 * HINTERGRUND
 * Migration 20260812120000 setzt organizations.sepa_creditor_id auf
 * 'DE98ZZZ09999999999'. Dieser Platzhalter steht produktiv in der
 * Stamm-Organisation. createSepaBatch() prüfte bisher nur `if (!id)` —
 * ein Platzhalter ist nicht leer und rutschte durch.
 *
 * Diese Suite hält fest, dass:
 *   1. der bekannte Platzhalter blockiert,
 *   2. strukturell unmögliche IDs blockieren,
 *   3. eine plausible echte ID durchgeht,
 *   4. generatePain008() die Sperre selbst durchsetzt — nicht nur der
 *      aufrufende Service. Ein künftiger zweiter Aufrufer darf sie nicht
 *      umgehen können (Lektion aus dem Tarif-Fail-Closed-Bypass).
 *
 * Testdaten: synthetisch. Die verwendete „echte" IBAN/ID ist konstruiert.
 */

import { describe, it, expect } from 'vitest'
import {
  pruefeGlaeubigerId,
  pruefeGlaeubigerIdOderWerfe,
  normalisiereGlaeubigerId,
  GlaeubigerIdUngueltigError,
  SEPA_PLATZHALTER_IDS,
} from '@/lib/billing/sepa/glaeubiger-id'
import { generatePain008 } from '@/lib/billing/sepa/pain008'

/** Konstruierte, strukturell gültige Gläubiger-ID für Positivtests. */
const ECHTE_ID = 'DE31ZZZ00000123456'

describe('pruefeGlaeubigerId', () => {
  it('blockiert den Migrations-Platzhalter DE98ZZZ09999999999', () => {
    const p = pruefeGlaeubigerId('DE98ZZZ09999999999')
    expect(p.verwendbar).toBe(false)
    expect(p.befund).toBe('platzhalter')
  })

  it('blockiert jeden Wert aus SEPA_PLATZHALTER_IDS', () => {
    for (const id of SEPA_PLATZHALTER_IDS) {
      expect(pruefeGlaeubigerId(id).verwendbar, `${id} muss blockieren`).toBe(false)
    }
  })

  it('blockiert fehlende und leere Werte', () => {
    expect(pruefeGlaeubigerId(null).befund).toBe('fehlt')
    expect(pruefeGlaeubigerId(undefined).befund).toBe('fehlt')
    expect(pruefeGlaeubigerId('   ').befund).toBe('fehlt')
  })

  it('blockiert strukturell unmögliche IDs', () => {
    expect(pruefeGlaeubigerId('DE98ZZZ123').befund).toBe('formatfehler')
    expect(pruefeGlaeubigerId('FR98ZZZ09999999999').befund).toBe('formatfehler')
    expect(pruefeGlaeubigerId('irgendwas').befund).toBe('formatfehler')
  })

  it('blockiert einen Identifikationsteil aus lauter Nullen', () => {
    // Formal korrekt aufgebaut, aber kein von der Bundesbank vergebener Wert.
    const p = pruefeGlaeubigerId('DE31ZZZ00000000000')
    expect(p.verwendbar).toBe(false)
    expect(p.befund).toBe('nur_nullen')
  })

  it('lässt eine strukturell gültige ID durch', () => {
    const p = pruefeGlaeubigerId(ECHTE_ID)
    expect(p.verwendbar).toBe(true)
    expect(p.befund).toBe('ok')
    expect(p.hinweis).toBeNull()
  })

  it('normalisiert Leerzeichen und Kleinschreibung', () => {
    expect(normalisiereGlaeubigerId(' de31 zzz 00000123456 ')).toBe(ECHTE_ID)
    expect(pruefeGlaeubigerId('de31 zzz 00000123456').verwendbar).toBe(true)
  })

  it('erkennt den Platzhalter auch in abweichender Schreibweise', () => {
    expect(pruefeGlaeubigerId('de98 zzz 09999999999').befund).toBe('platzhalter')
  })

  it('gibt den Wert bei einem Platzhalter NICHT im Hinweis preis', () => {
    const p = pruefeGlaeubigerId('DE98ZZZ09999999999')
    expect(p.hinweis).not.toContain('DE98ZZZ09999999999')
  })
})

describe('pruefeGlaeubigerIdOderWerfe', () => {
  it('wirft bei Platzhalter statt einen Wahrheitswert zu liefern', () => {
    expect(() => pruefeGlaeubigerIdOderWerfe('DE98ZZZ09999999999'))
      .toThrow(GlaeubigerIdUngueltigError)
  })

  it('nennt im Fehlertext ausdrücklich, dass nichts eingezogen wurde', () => {
    try {
      pruefeGlaeubigerIdOderWerfe('DE98ZZZ09999999999')
      expect.unreachable('hätte werfen müssen')
    } catch (e) {
      expect((e as Error).message).toContain('SEPA_GESPERRT')
      expect((e as Error).message).toContain('keine Lastschrift eingezogen')
    }
  })

  it('liefert die normalisierte ID zurück, wenn sie verwendbar ist', () => {
    expect(pruefeGlaeubigerIdOderWerfe('de31 zzz 00000123456')).toBe(ECHTE_ID)
  })
})

describe('generatePain008 — Sperre am Erzeugungspunkt', () => {
  const basisPosition = {
    endToEndId: 'E2E-1',
    amountCents: 5000,
    mandateId: 'MND-1',
    mandateDate: '2026-01-15',
    sequenceType: 'FRST' as const,
    debtorName: 'Testfall Erika',
    debtorIban: 'DE02120300000000202051',
  }

  function optionen(creditorId: string) {
    return {
      messageId: 'MSG-1',
      requestedCollectionDate: '2026-09-01',
      creditor: {
        name: 'Alltagsengel UG (haftungsbeschränkt)',
        iban: 'DE02120300000000202051',
        creditorId,
      },
      items: [basisPosition],
    }
  }

  it('erzeugt KEIN einziehbares XML mit Platzhalter-Gläubiger-ID', () => {
    expect(() => generatePain008(optionen('DE98ZZZ09999999999')))
      .toThrow(GlaeubigerIdUngueltigError)
  })

  it('erzeugt KEIN XML ohne Gläubiger-ID', () => {
    expect(() => generatePain008(optionen(''))).toThrow(GlaeubigerIdUngueltigError)
  })

  it('erzeugt gültiges XML mit echter Gläubiger-ID', () => {
    const xml = generatePain008(optionen(ECHTE_ID))
    expect(xml).toContain('pain.008.001.02')
    expect(xml).toContain(ECHTE_ID)
  })
})
