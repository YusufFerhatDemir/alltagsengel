import { describe, it, expect } from 'vitest'
import {
  berechneUmsatz,
  berechneAuslastung,
  berechneAblehnungsquote,
  berechnePflegequalitaet,
  standardZeitraumAktuellerMonat,
} from '../../lib/analytics/kpi'

describe('KPI-Dashboard — berechneUmsatz', () => {
  it('summiert total_amount über alle Rechnungen', () => {
    const r = berechneUmsatz([{ total_amount: 100 }, { total_amount: 50.5 }])
    expect(r.summeEuro).toBe(150.5)
    expect(r.anzahlRechnungen).toBe(2)
  })

  it('behandelt null-Beträge als 0', () => {
    const r = berechneUmsatz([{ total_amount: null }, { total_amount: 20 }])
    expect(r.summeEuro).toBe(20)
  })

  it('liefert 0 bei leerer Liste', () => {
    const r = berechneUmsatz([])
    expect(r.summeEuro).toBe(0)
    expect(r.anzahlRechnungen).toBe(0)
  })
})

describe('KPI-Dashboard — berechneAuslastung', () => {
  it('berechnet die Quote aus aktiven vs. eingesetzten Kräften', () => {
    const r = berechneAuslastung(['a', 'b', 'c', 'd'], new Set(['a', 'b']))
    expect(r.aktiveCaregiver).toBe(4)
    expect(r.eingesetzteCaregiver).toBe(2)
    expect(r.quoteProzent).toBe(50)
  })

  it('ignoriert eingesetzte Kräfte, die nicht mehr aktiv sind', () => {
    const r = berechneAuslastung(['a'], new Set(['a', 'ehemalig']))
    expect(r.eingesetzteCaregiver).toBe(1)
  })

  it('liefert null-Quote bei 0 aktiven Kräften', () => {
    const r = berechneAuslastung([], new Set())
    expect(r.quoteProzent).toBeNull()
  })
})

describe('KPI-Dashboard — berechneAblehnungsquote', () => {
  it('berechnet den Anteil abgelehnter Buchungen', () => {
    const r = berechneAblehnungsquote([
      { status: 'declined' }, { status: 'accepted' }, { status: 'completed' }, { status: 'declined' },
    ])
    expect(r.gesamtBuchungen).toBe(4)
    expect(r.abgelehnt).toBe(2)
    expect(r.quoteProzent).toBe(50)
  })

  it('liefert null-Quote ohne Buchungen', () => {
    const r = berechneAblehnungsquote([])
    expect(r.quoteProzent).toBeNull()
  })
})

describe('KPI-Dashboard — berechnePflegequalitaet', () => {
  it('berechnet die Durchschnittsbewertung aus Zufriedenheitsanrufen', () => {
    const r = berechnePflegequalitaet([{ satisfaction_rating: 5 }, { satisfaction_rating: 3 }])
    expect(r.datenquelle).toBe('zufriedenheitsanrufe')
    expect(r.durchschnittsbewertung).toBe(4)
    expect(r.anzahlBewertungen).toBe(2)
  })

  it('meldet keine_daten, wenn keine Bewertungen vorliegen', () => {
    const r = berechnePflegequalitaet([{ satisfaction_rating: null }])
    expect(r.datenquelle).toBe('keine_daten')
    expect(r.durchschnittsbewertung).toBeNull()
  })
})

describe('KPI-Dashboard — standardZeitraumAktuellerMonat', () => {
  it('liefert den ersten und letzten Tag des Monats', () => {
    const z = standardZeitraumAktuellerMonat(new Date(2026, 1, 15)) // Februar 2026
    expect(z.von).toBe('2026-02-01')
    expect(z.bis).toBe('2026-02-28')
  })
})
