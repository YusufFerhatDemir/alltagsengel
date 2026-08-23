/**
 * VP/KZP — Zeitraumlogik
 *
 * Der Schwerpunkt liegt auf dem Jahreswechsel: Tage UND Betrag sind
 * kalenderjahresbezogen, ein Zeitraum ueber den 31.12. ist deshalb zwei
 * Vorgaenge. Wird er als einer behandelt, stimmt die Summe und beide
 * Jahresstaende sind falsch — ein Fehler, der ohne Test nicht auffaellt.
 */

import { describe, it, expect } from 'vitest'
import {
  eindeutigeTage,
  findeUeberschneidungen,
  pruefeZeitraum,
  tageImZeitraum,
  teileNachKalenderjahr,
  ueberschneidetSich,
  ueberschneidungsTage,
  ZeitraumUngueltigError,
  MAX_ZEITRAUM_TAGE,
} from '@/lib/billing/vpkzp/zeitraum'

describe('tageImZeitraum', () => {
  it('zaehlt beide Grenzen mit', () => {
    expect(tageImZeitraum({ von: '2026-03-01', bis: '2026-03-01' })).toBe(1)
    expect(tageImZeitraum({ von: '2026-03-01', bis: '2026-03-07' })).toBe(7)
  })

  it('rechnet ueber Monatsgrenzen und Schaltjahre korrekt', () => {
    expect(tageImZeitraum({ von: '2026-01-30', bis: '2026-02-02' })).toBe(4)
    // 2028 ist ein Schaltjahr — der 29.02. existiert und zaehlt mit.
    expect(tageImZeitraum({ von: '2028-02-28', bis: '2028-03-01' })).toBe(3)
  })

  it('rechnet ueber die Sommerzeitgrenze ohne Tagesverlust', () => {
    // Umstellung 2026 in Deutschland am 29.03. bzw. 25.10. Mit lokaler
    // Zeit gerechnet ergaebe eine der beiden Spannen 6 oder 8 statt 7 Tage.
    expect(tageImZeitraum({ von: '2026-03-26', bis: '2026-04-01' })).toBe(7)
    expect(tageImZeitraum({ von: '2026-10-22', bis: '2026-10-28' })).toBe(7)
  })
})

describe('pruefeZeitraum', () => {
  it('lehnt verdrehte Zeitraeume ab statt sie zu tauschen', () => {
    expect(() => pruefeZeitraum({ von: '2026-05-10', bis: '2026-05-01' }))
      .toThrow(ZeitraumUngueltigError)
  })

  it('lehnt nicht existierende Kalendertage ab', () => {
    // new Date('2026-02-30') ergaebe in JavaScript still den 02.03.
    expect(() => pruefeZeitraum({ von: '2026-02-30', bis: '2026-03-01' }))
      .toThrow(ZeitraumUngueltigError)
    expect(() => pruefeZeitraum({ von: '2026-13-01', bis: '2026-13-02' }))
      .toThrow(ZeitraumUngueltigError)
  })

  it('lehnt unplausibel lange Zeitraeume ab', () => {
    expect(() => pruefeZeitraum({ von: '2026-01-01', bis: '2028-01-01' }))
      .toThrow(new RegExp(String(MAX_ZEITRAUM_TAGE)))
  })

  it('lehnt leere Angaben ab', () => {
    expect(() => pruefeZeitraum({ von: '', bis: '' })).toThrow(ZeitraumUngueltigError)
  })
})

describe('teileNachKalenderjahr', () => {
  it('laesst einen Zeitraum innerhalb eines Jahres unveraendert', () => {
    expect(teileNachKalenderjahr({ von: '2026-04-01', bis: '2026-04-10' })).toEqual([
      { jahr: 2026, von: '2026-04-01', bis: '2026-04-10', tage: 10 },
    ])
  })

  it('zerlegt am Jahreswechsel und verteilt die Tage auf beide Jahre', () => {
    const segmente = teileNachKalenderjahr({ von: '2025-12-27', bis: '2026-01-09' })
    expect(segmente).toEqual([
      { jahr: 2025, von: '2025-12-27', bis: '2025-12-31', tage: 5 },
      { jahr: 2026, von: '2026-01-01', bis: '2026-01-09', tage: 9 },
    ])
    // Die Summe der Segmente ist der Gesamtzeitraum — nichts geht verloren,
    // nichts wird doppelt gezaehlt.
    expect(segmente.reduce((s, x) => s + x.tage, 0))
      .toBe(tageImZeitraum({ von: '2025-12-27', bis: '2026-01-09' }))
  })

  it('behandelt den 31.12. und den 01.01. als je eigenes Segment', () => {
    expect(teileNachKalenderjahr({ von: '2025-12-31', bis: '2026-01-01' })).toEqual([
      { jahr: 2025, von: '2025-12-31', bis: '2025-12-31', tage: 1 },
      { jahr: 2026, von: '2026-01-01', bis: '2026-01-01', tage: 1 },
    ])
  })
})

describe('Ueberschneidungen', () => {
  const a = { von: '2026-05-10', bis: '2026-05-20' }

  it('erkennt Beruehrung an genau einem Tag', () => {
    expect(ueberschneidetSich(a, { von: '2026-05-20', bis: '2026-05-25' })).toBe(true)
    expect(ueberschneidungsTage(a, { von: '2026-05-20', bis: '2026-05-25' })).toBe(1)
  })

  it('erkennt Nachbarschaft ohne Beruehrung nicht als Ueberschneidung', () => {
    expect(ueberschneidetSich(a, { von: '2026-05-21', bis: '2026-05-25' })).toBe(false)
    expect(ueberschneidungsTage(a, { von: '2026-05-21', bis: '2026-05-25' })).toBe(0)
  })

  it('zaehlt vollstaendig enthaltene Zeitraeume mit ihrer eigenen Laenge', () => {
    expect(ueberschneidungsTage(a, { von: '2026-05-12', bis: '2026-05-14' })).toBe(3)
  })

  it('liefert alle betroffenen Bestandsbuchungen mit Tageszahl', () => {
    const befunde = findeUeberschneidungen(a, [
      { id: '1', von: '2026-05-01', bis: '2026-05-11' },
      { id: '2', von: '2026-06-01', bis: '2026-06-05' },
      { id: '3', von: '2026-05-19', bis: '2026-05-30' },
    ])
    expect(befunde.map(b => b.bestand.id)).toEqual(['1', '3'])
    expect(befunde.map(b => b.tage)).toEqual([2, 2])
  })
})

describe('eindeutigeTage', () => {
  it('zaehlt einen Tag nur einmal, auch bei mehreren Leistungen', () => {
    // Mehrfachleistung am selben Tag verbraucht EINEN Tag des Kontingents.
    expect(eindeutigeTage([
      { von: '2026-07-01', bis: '2026-07-05' },
      { von: '2026-07-03', bis: '2026-07-07' },
    ])).toBe(7)
  })

  it('summiert getrennte Zeitraeume', () => {
    expect(eindeutigeTage([
      { von: '2026-07-01', bis: '2026-07-05' },
      { von: '2026-08-01', bis: '2026-08-03' },
    ])).toBe(8)
  })
})
