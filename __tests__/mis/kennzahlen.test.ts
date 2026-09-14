// ═══════════════════════════════════════════════════════════════════════
// Block 28 — Kennzahlen des Kontrollzentrums
//
// Ein Test je Befund. Der Ausgangspunkt: `/mis` zeigte als Umsatz
// `Anzahl Buchungen × 35 €` (live 105 €), fragte `profiles`, `bookings`
// und `angels` ohne jede Mandantenbedingung ab und liess bei einem
// Abfragefehler stillschweigend Nullen stehen.
// ═══════════════════════════════════════════════════════════════════════
import { describe, it, expect } from 'vitest'
import {
  berechneOffenePosten,
  berechneNachweisstand,
  berechneBetrieb,
  marktKennzahlenAus,
  berechneUmsatzProKraft,
  ladeMisKennzahlen,
} from '@/lib/mis/kennzahlen'
import { erstelleFakeSupabase, hatOrgFence, type FakeAufruf } from '../helpers/supabase-fake'

const ORG = '00000000-0000-4000-8000-000460629986'
const FREMD = '99999999-9999-4999-8999-999999999999'
const FEST = '2026-09-01T10:00:00Z'
const HEUTE = '2026-09-14'

describe('Offene Posten', () => {
  it('zählt nur den unbezahlten Rest, nicht den Rechnungsbetrag', () => {
    const r = berechneOffenePosten(
      [{ total_amount: 1064, paid_amount: 912, status: 'disputed', due_date: '2026-12-01', frozen_at: FEST }],
      HEUTE,
    )
    expect(r.summeEuro).toBe(152)
    expect(r.anzahl).toBe(1)
  })

  it('lässt vollständig bezahlte Rechnungen weg', () => {
    const r = berechneOffenePosten(
      [{ total_amount: 650, paid_amount: 650, status: 'paid', due_date: '2026-08-01', frozen_at: FEST }],
      HEUTE,
    )
    expect(r.anzahl).toBe(0)
    expect(r.summeEuro).toBe(0)
  })

  it('lässt eine stornierte Rechnung weg, auch wenn ein Betrag offen steht', () => {
    // Der Storno nimmt der Zeile ihren Status, nicht ihren Betrag — ohne
    // diesen Riegel weist OPOS eine Forderung aus, die es nicht gibt.
    const r = berechneOffenePosten(
      [{ total_amount: 500, paid_amount: 0, status: 'storniert', due_date: '2026-01-01', frozen_at: FEST }],
      HEUTE,
    )
    expect(r.anzahl).toBe(0)
  })

  it('erkennt das englische Storno-Wort ebenso', () => {
    const r = berechneOffenePosten(
      [{ total_amount: 500, paid_amount: 0, status: 'cancelled', due_date: '2026-01-01', frozen_at: FEST }],
      HEUTE,
    )
    expect(r.anzahl).toBe(0)
  })

  it('zählt eine nicht festgeschriebene Rechnung nicht mit — weist sie aber aus', () => {
    const r = berechneOffenePosten(
      [{ total_amount: 187, paid_amount: 0, status: 'sent', due_date: '2026-07-16', frozen_at: null }],
      HEUTE,
    )
    expect(r.anzahl).toBe(0)
    expect(r.summeEuro).toBe(0)
    expect(r.nichtFestgeschrieben).toBe(1)
  })

  it('trennt überfällig von offen', () => {
    const r = berechneOffenePosten([
      { total_amount: 100, paid_amount: 0, status: 'sent', due_date: '2026-07-16', frozen_at: FEST },
      { total_amount: 200, paid_amount: 0, status: 'sent', due_date: '2026-12-31', frozen_at: FEST },
    ], HEUTE)
    expect(r.summeEuro).toBe(300)
    expect(r.anzahl).toBe(2)
    expect(r.ueberfaelligEuro).toBe(100)
    expect(r.ueberfaelligAnzahl).toBe(1)
  })

  it('behandelt eine Rechnung ohne Fälligkeitsdatum nicht als überfällig', () => {
    const r = berechneOffenePosten(
      [{ total_amount: 100, paid_amount: 0, status: 'sent', due_date: null, frozen_at: FEST }],
      HEUTE,
    )
    expect(r.anzahl).toBe(1)
    expect(r.ueberfaelligAnzahl).toBe(0)
  })
})

describe('Nachweisstand', () => {
  it('zählt den Unterschriftsbeleg, nicht proof_status', () => {
    // Live stehen alle 30 Nachweise auf proof_status='ENTWURF'. Wer
    // danach zaehlt, meldet null belegte — obwohl Unterschriften da sind.
    const r = berechneNachweisstand([
      { proof_status: 'ENTWURF', client_signature: 'data:image/png;base64,xxx' },
      { proof_status: 'ENTWURF', client_signature: null },
    ])
    expect(r.gesamt).toBe(2)
    expect(r.belegt).toBe(1)
    expect(r.ohneBeleg).toBe(1)
  })

  it('verlangt zum Hash auch den Zeitstempel, aus dem er gebildet wurde', () => {
    const r = berechneNachweisstand([
      { signature_hash: 'abc', client_signed_at: null },
      { signature_hash: 'abc', client_signed_at: '2026-09-01T09:00:00Z' },
    ])
    expect(r.belegt).toBe(1)
  })

  it('zählt abgerechnete Nachweise in beiden Vokabularen', () => {
    const r = berechneNachweisstand([
      { status: 'invoiced', client_signature: 'x' },
      { status: 'abgerechnet', client_signature: 'x' },
      { status: 'signed', client_signature: 'x' },
    ])
    expect(r.abgerechnet).toBe(2)
  })

  it('liefert bei leerem Bestand Nullen statt zu werfen', () => {
    const r = berechneNachweisstand([])
    expect(r).toEqual({ gesamt: 0, belegt: 0, ohneBeleg: 0, abgerechnet: 0 })
  })
})

describe('Betriebslage', () => {
  it('zählt Einsatzbereitschaft, nicht Personalbestand', () => {
    // Der Produktionsstand am 14.09.2026: zwei Kräfte, keine freigegeben.
    // Eine Kennzahl „2 Kräfte" verdeckt genau das.
    const r = berechneBetrieb(
      [],
      [
        { status: 'active', einsatzfreigabe: false },
        { status: 'active', einsatzfreigabe: false },
      ],
      [],
    )
    expect(r.kraefte).toBe(2)
    expect(r.einsatzbereiteKraefte).toBe(0)
  })

  it('behandelt einsatzfreigabe=null nicht als freigegeben', () => {
    const r = berechneBetrieb([], [{ status: 'active', einsatzfreigabe: null }], [])
    expect(r.einsatzbereiteKraefte).toBe(0)
  })

  it('kennt beide Schreibweisen des aktiven Klientenstatus', () => {
    const r = berechneBetrieb(
      [{ status: 'active' }, { status: 'aktiv' }, { status: 'neu' }, { status: 'beendet' }, { status: null }],
      [], [],
    )
    expect(r.klienten).toBe(5)
    expect(r.aktiveKlienten).toBe(3)
  })

  it('zählt nur aktive Einsätze', () => {
    const r = berechneBetrieb([], [], [{ status: 'active' }, { status: 'beendet' }, { status: 'aktiv' }])
    expect(r.aktiveEinsaetze).toBe(2)
  })
})

describe('Umsatz pro Kraft', () => {
  it('teilt den Umsatz durch die aktiven Kräfte', () => {
    expect(berechneUmsatzProKraft(1000, 4)).toBe(250)
  })

  it('liefert null statt einer Division durch null', () => {
    // „0 € pro Kraft" liest sich wie ein Ergebnis. „—" sagt, dass die
    // Frage mangels Nenner nicht gestellt werden kann.
    expect(berechneUmsatzProKraft(1000, 0)).toBeNull()
    expect(berechneUmsatzProKraft(0, 0)).toBeNull()
  })

  it('rundet auf Cent', () => {
    expect(berechneUmsatzProKraft(100, 3)).toBe(33.33)
  })
})

describe('Marktkennzahlen aus mis_kpis', () => {
  it('übernimmt die gepflegte Zeile statt eines fest verdrahteten Werts', () => {
    // Die Seite hatte TAM fest auf 50 Mrd. € stehen, waehrend die
    // gepflegte Tabelle 24,6 Mrd. € fuehrt. Ein fest verdrahteter Wert
    // ist keine Kennzahl, sondern eine Behauptung.
    const r = marktKennzahlenAus([
      { slug: 'tam', name: 'TAM', value: 24.6, target: 24.6, unit: 'Mrd. €', category: 'market', period: '2026' },
    ])
    expect(r[0].wert).toBe(24.6)
    expect(r[0].einheit).toBe('Mrd. €')
  })

  it('kennzeichnet jede Zeile als Planannahme', () => {
    const r = marktKennzahlenAus([{ slug: 'burn-rate', name: 'Burn Rate', value: 12000 }])
    expect(r[0].herkunft).toBe('plan')
  })

  it('verträgt fehlende Felder ohne NaN', () => {
    const r = marktKennzahlenAus([{ slug: 'x', name: 'X' }])
    expect(r[0].wert).toBe(0)
    expect(r[0].ziel).toBeNull()
    expect(r[0].einheit).toBeNull()
  })

  it('liefert bei leerer Tabelle eine leere Liste', () => {
    expect(marktKennzahlenAus([])).toEqual([])
  })
})

describe('ladeMisKennzahlen — Mandantenzaun und Fehlerverhalten', () => {
  function fake(antwort: (a: FakeAufruf) => { data?: unknown; error?: { message: string } } | undefined) {
    return erstelleFakeSupabase(antwort as never)
  }

  it('fenced JEDE Abfrage auf die Organisation', async () => {
    // Der alte Stand fragte profiles/bookings/angels voellig ohne
    // Mandantenbedingung ab. In einem Mehrmandantensystem ist das kein
    // Dashboard, sondern ein Leck.
    const f = fake(() => ({ data: [] }))
    await ladeMisKennzahlen(f.client, ORG, HEUTE)

    const tabellen = ['invoices', 'clients', 'caregivers', 'assignments', 'service_records', 'mis_kpis']
    for (const t of tabellen) {
      const aufruf = f.ersterAuf(t, 'select')
      expect(aufruf, `keine Abfrage auf ${t}`).toBeDefined()
      expect(hatOrgFence(aufruf, ORG), `${t} ohne organization_id-Fence`).toBe(true)
    }
  })

  it('fragt keine fremde Organisation ab', async () => {
    const f = fake(() => ({ data: [] }))
    await ladeMisKennzahlen(f.client, ORG, HEUTE)
    for (const a of f.aufrufe) {
      expect(hatOrgFence(a, FREMD)).toBe(false)
    }
  })

  it('wirft benannt, statt eine stille Null zu liefern', async () => {
    // Genau das war der Fehler der alten Seite: catch, ins Log, Karten
    // bleiben auf 0. Eine gescheiterte Abfrage sah aus wie ein leerer
    // Betrieb.
    const f = fake(a => a.tabelle === 'invoices'
      ? { error: { message: 'Verbindung unterbrochen' } }
      : { data: [] })
    await expect(ladeMisKennzahlen(f.client, ORG, HEUTE)).rejects.toThrow(/Rechnungen konnten nicht geladen werden/)
  })

  it('wirft auch, wenn nur die Kräfte nicht lesbar sind', async () => {
    const f = fake(a => a.tabelle === 'caregivers'
      ? { error: { message: 'permission denied' } }
      : { data: [] })
    await expect(ladeMisKennzahlen(f.client, ORG, HEUTE)).rejects.toThrow(/Kräfte konnten nicht geladen werden/)
  })

  it('liefert bei leerem Bestand Nullen — und wirft nicht', async () => {
    const f = fake(() => ({ data: [] }))
    const k = await ladeMisKennzahlen(f.client, ORG, HEUTE)
    expect(k.umsatz.summeEuro).toBe(0)
    expect(k.offenePosten.summeEuro).toBe(0)
    expect(k.betrieb.klienten).toBe(0)
    expect(k.nachweise.gesamt).toBe(0)
    expect(k.markt).toEqual([])
  })

  it('bildet den Produktionsstand vom 14.09.2026 ab: 0 € Umsatz, 3 nicht festgeschrieben', async () => {
    const f = fake(a => {
      if (a.tabelle === 'invoices') return { data: [
        { total_amount: 187, paid_amount: null, status: 'sent', due_date: '2026-07-16', frozen_at: null },
        { total_amount: 1064, paid_amount: 912, status: 'disputed', due_date: '2026-08-01', frozen_at: null },
        { total_amount: 650, paid_amount: 650, status: 'paid', due_date: '2026-08-01', frozen_at: null },
      ] }
      if (a.tabelle === 'clients') return { data: [{ status: 'active' }, { status: 'active' }, { status: 'active' }, { status: 'active' }] }
      if (a.tabelle === 'caregivers') return { data: [
        { id: 'c1', status: 'active', einsatzfreigabe: false },
        { id: 'c2', status: 'active', einsatzfreigabe: false },
      ] }
      return { data: [] }
    })

    const k = await ladeMisKennzahlen(f.client, ORG, HEUTE)

    // Die Karte zeigte hier einmal 105 € (3 Buchungen × 35 €), das
    // KPI-Dashboard 1.901 €. Richtig sind 0 €.
    expect(k.umsatz.summeEuro).toBe(0)
    expect(k.umsatz.nichtFestgeschrieben).toBe(3)
    expect(k.offenePosten.summeEuro).toBe(0)
    expect(k.betrieb.aktiveKlienten).toBe(4)
    expect(k.betrieb.kraefte).toBe(2)
    expect(k.betrieb.einsatzbereiteKraefte).toBe(0)
    // Der Nenner sind die AKTIVEN Kräfte (2), nicht die freigegebenen (0) —
    // sonst verschwindet die Kennzahl genau dann, wenn sie am meisten zu
    // sagen hätte.
    expect(k.umsatzProKraft).toBe(0)
  })

  it('liefert „kein Nenner" statt 0, wenn es keine aktive Kraft gibt', async () => {
    const f = fake(() => ({ data: [] }))
    const k = await ladeMisKennzahlen(f.client, ORG, HEUTE)
    expect(k.umsatzProKraft).toBeNull()
  })
})
