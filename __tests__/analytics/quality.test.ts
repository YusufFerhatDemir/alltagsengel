import { describe, it, expect } from 'vitest'
import {
  berechneWundKennzahlen,
  berechneMassnahmenKennzahlen,
  berechneSturzKennzahlen,
} from '../../lib/analytics/quality'

describe('Quality-Dashboard — berechneWundKennzahlen', () => {
  it('zählt aktive, verschlechterte und abgeheilte Wunden korrekt', () => {
    const r = berechneWundKennzahlen([
      { status: 'aktiv' }, { status: 'in_abheilung' }, { status: 'verschlechtert' }, { status: 'abgeheilt' },
    ])
    expect(r.gesamt).toBe(4)
    expect(r.aktiv).toBe(2)
    expect(r.verschlechtert).toBe(1)
    expect(r.abgeheilt).toBe(1)
  })

  it('liefert 0 bei keinen Wunden', () => {
    const r = berechneWundKennzahlen([])
    expect(r.gesamt).toBe(0)
  })
})

describe('Quality-Dashboard — berechneMassnahmenKennzahlen', () => {
  it('zählt offene (geplant/aktiv) und abgeschlossene Maßnahmen', () => {
    const r = berechneMassnahmenKennzahlen([
      { status: 'geplant' }, { status: 'aktiv' }, { status: 'abgeschlossen' }, { status: 'pausiert' },
    ])
    expect(r.offen).toBe(2)
    expect(r.abgeschlossen).toBe(1)
  })
})

describe('Quality-Dashboard — berechneSturzKennzahlen', () => {
  it('zählt nur Verlaufseinträge vom Typ sturz', () => {
    const r = berechneSturzKennzahlen([
      { eintrag_typ: 'sturz' }, { eintrag_typ: 'beobachtung' }, { eintrag_typ: 'sturz' },
    ])
    expect(r.anzahl).toBe(2)
  })

  it('liefert 0 ohne Sturzereignisse', () => {
    const r = berechneSturzKennzahlen([{ eintrag_typ: 'verlauf' }])
    expect(r.anzahl).toBe(0)
  })
})
