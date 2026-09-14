import { describe, it, expect } from 'vitest'
import {
  berechneUmsatz,
  berechneAuslastung,
  berechneAblehnungsquote,
  berechnePflegequalitaet,
  standardZeitraumAktuellerMonat,
} from '../../lib/analytics/kpi'

describe('KPI-Dashboard — berechneUmsatz', () => {
  const FEST = '2026-09-01T10:00:00Z'

  it('summiert total_amount über festgeschriebene Rechnungen', () => {
    const r = berechneUmsatz([
      { total_amount: 100, status: 'sent', frozen_at: FEST },
      { total_amount: 50.5, status: 'paid', frozen_at: FEST },
    ])
    expect(r.summeEuro).toBe(150.5)
    expect(r.anzahlRechnungen).toBe(2)
  })

  it('behandelt null-Beträge als 0', () => {
    const r = berechneUmsatz([
      { total_amount: null, status: 'sent', frozen_at: FEST },
      { total_amount: 20, status: 'sent', frozen_at: FEST },
    ])
    expect(r.summeEuro).toBe(20)
  })

  it('liefert 0 bei leerer Liste', () => {
    const r = berechneUmsatz([])
    expect(r.summeEuro).toBe(0)
    expect(r.anzahlRechnungen).toBe(0)
    expect(r.nichtFestgeschrieben).toBe(0)
  })

  // ── Block 28: der Storno nimmt der Zeile ihren Status, nicht ihren Betrag
  it('zählt eine stornierte Rechnung NICHT als Umsatz', () => {
    const r = berechneUmsatz([
      { total_amount: 100, status: 'sent', frozen_at: FEST },
      { total_amount: 900, status: 'storniert', frozen_at: FEST },
    ])
    expect(r.summeEuro).toBe(100)
    expect(r.anzahlRechnungen).toBe(1)
    expect(r.nichtGezaehlt).toBe(1)
  })

  it('kennt auch das englische Storno-Wort', () => {
    const r = berechneUmsatz([{ total_amount: 900, status: 'cancelled', frozen_at: FEST }])
    expect(r.summeEuro).toBe(0)
    expect(r.nichtGezaehlt).toBe(1)
  })

  it('zählt Entwurf, Ablehnung und Abschreibung nicht', () => {
    const r = berechneUmsatz([
      { total_amount: 10, status: 'entwurf', frozen_at: FEST },
      { total_amount: 20, status: 'draft', frozen_at: FEST },
      { total_amount: 30, status: 'abgelehnt', frozen_at: FEST },
      { total_amount: 40, status: 'rejected', frozen_at: FEST },
      { total_amount: 50, status: 'abgeschrieben', frozen_at: FEST },
    ])
    expect(r.summeEuro).toBe(0)
    expect(r.nichtGezaehlt).toBe(5)
  })

  it('zählt eine bestrittene Rechnung SEHR WOHL als Umsatz', () => {
    // strittig heisst: die Forderung ist gestellt und wird bestritten —
    // nicht zurueckgenommen. Ob sie eingeht, beantwortet der offene Posten.
    const r = berechneUmsatz([{ total_amount: 1064, status: 'disputed', frozen_at: FEST }])
    expect(r.summeEuro).toBe(1064)
  })

  // ── Block 28: ohne frozen_at ist die Rechnung nie ausgestellt worden
  it('zählt eine nicht festgeschriebene Rechnung NICHT als Umsatz', () => {
    const r = berechneUmsatz([{ total_amount: 187, status: 'sent', frozen_at: null }])
    expect(r.summeEuro).toBe(0)
    expect(r.anzahlRechnungen).toBe(0)
  })

  it('weist die nicht festgeschriebenen Rechnungen getrennt aus statt sie zu verschweigen', () => {
    // Der Produktionsbestand am 14.09.2026: drei Rechnungen über 1.901 €,
    // keine davon festgeschrieben. Der Umsatz ist 0 € — aber die Seite
    // muss sagen koennen, WARUM, sonst sieht der leere Bestand aus wie
    // ein Geschaeftseinbruch.
    const r = berechneUmsatz([
      { total_amount: 187, status: 'sent', frozen_at: null },
      { total_amount: 1064, status: 'disputed', frozen_at: null },
      { total_amount: 650, status: 'paid', frozen_at: null },
    ])
    expect(r.summeEuro).toBe(0)
    expect(r.nichtFestgeschrieben).toBe(3)
    expect(r.nichtGezaehlt).toBe(0)
  })

  it('trennt die beiden Gruende sauber: Status und Festschreibung', () => {
    const r = berechneUmsatz([
      { total_amount: 100, status: 'sent', frozen_at: FEST },
      { total_amount: 200, status: 'storniert', frozen_at: FEST },
      { total_amount: 300, status: 'sent', frozen_at: null },
    ])
    expect(r.summeEuro).toBe(100)
    expect(r.nichtGezaehlt).toBe(1)
    expect(r.nichtFestgeschrieben).toBe(1)
  })

  it('rundet auf Cent statt Gleitkommareste auszuweisen', () => {
    const r = berechneUmsatz([
      { total_amount: 0.1, status: 'sent', frozen_at: FEST },
      { total_amount: 0.2, status: 'sent', frozen_at: FEST },
    ])
    expect(r.summeEuro).toBe(0.3)
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
