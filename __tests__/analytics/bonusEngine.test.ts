import { describe, it, expect } from 'vitest'
import {
  bewerteKeineAusfaelle,
  bewerteVollstaendigeDokumentation,
  bewerteKeineOffenenPruefungen,
  berechnePunkteFuerMesswert,
} from '../../lib/analytics/bonusEngine'

describe('Bonussystem — bewerteKeineAusfaelle', () => {
  it('ist erfüllt, wenn Ausfalltage unter der Grenze liegen', () => {
    const r = bewerteKeineAusfaelle(0, 0)
    expect(r.erfuellt).toBe(true)
  })

  it('ist nicht erfüllt, wenn Ausfalltage die Grenze überschreiten', () => {
    const r = bewerteKeineAusfaelle(3, 0)
    expect(r.erfuellt).toBe(false)
    expect(r.messwert).toBe(3)
  })

  it('respektiert einen konfigurierten Toleranzwert', () => {
    const r = bewerteKeineAusfaelle(2, 2)
    expect(r.erfuellt).toBe(true)
  })
})

describe('Bonussystem — bewerteVollstaendigeDokumentation', () => {
  it('ist erfüllt, wenn die Quote den Schwellenwert erreicht', () => {
    const r = bewerteVollstaendigeDokumentation(10, 9, 90)
    expect(r.erfuellt).toBe(true)
    expect(r.messwert).toBe(90)
  })

  it('ist nicht erfüllt unterhalb des Schwellenwerts', () => {
    const r = bewerteVollstaendigeDokumentation(10, 5, 90)
    expect(r.erfuellt).toBe(false)
  })

  it('ist nicht erfüllt ohne Leistungsnachweise (nicht bewertbar)', () => {
    const r = bewerteVollstaendigeDokumentation(0, 0, 90)
    expect(r.erfuellt).toBe(false)
    expect(r.messwert).toBe(0)
  })
})

describe('Bonussystem — bewerteKeineOffenenPruefungen', () => {
  it('ist erfüllt ohne offene Prüfhinweise', () => {
    const r = bewerteKeineOffenenPruefungen(10, 0, 100)
    expect(r.erfuellt).toBe(true)
    expect(r.messwert).toBe(100)
  })

  it('ist nicht erfüllt bei zu vielen offenen Prüfhinweisen', () => {
    const r = bewerteKeineOffenenPruefungen(10, 4, 90)
    expect(r.erfuellt).toBe(false)
    expect(r.messwert).toBe(60)
  })
})

describe('Bonussystem — berechnePunkteFuerMesswert', () => {
  it('vergibt die Regel-Punkte, wenn das Kriterium erfüllt ist', () => {
    const punkte = berechnePunkteFuerMesswert(15, { erfuellt: true, messwert: 100, begruendung: '' })
    expect(punkte).toBe(15)
  })

  it('vergibt 0 Punkte, wenn das Kriterium nicht erfüllt ist', () => {
    const punkte = berechnePunkteFuerMesswert(15, { erfuellt: false, messwert: 40, begruendung: '' })
    expect(punkte).toBe(0)
  })
})
