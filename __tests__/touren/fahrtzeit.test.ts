import { describe, it, expect } from 'vitest'
import {
  fahrtZwischenPlz,
  fahrtzeitenEntlangRoute,
  durchschnittsgeschwindigkeitKmh,
  FAHRZEIT_GLEICHE_PLZ_MINUTEN,
  DISTANZ_GLEICHE_PLZ_KM,
} from '@/lib/touren/fahrtzeit'

describe('fahrtZwischenPlz', () => {
  it('liefert Pauschale für identische PLZ', () => {
    const f = fahrtZwischenPlz('60311', '60311')
    expect(f).toEqual({
      distanzKm: DISTANZ_GLEICHE_PLZ_KM,
      fahrzeitMinuten: FAHRZEIT_GLEICHE_PLZ_MINUTEN,
    })
  })

  it('liefert null bei fehlender oder unbekannter PLZ', () => {
    expect(fahrtZwischenPlz(null, '60311')).toBeNull()
    expect(fahrtZwischenPlz('60311', undefined)).toBeNull()
    expect(fahrtZwischenPlz('60311', '00000')).toBeNull()
  })

  it('schätzt Frankfurt → Offenbach plausibel (Nachbarstädte)', () => {
    // 60311 Frankfurt Innenstadt → 63065 Offenbach: ~6-8 km Straße
    const f = fahrtZwischenPlz('60311', '63065')
    expect(f).not.toBeNull()
    expect(f!.distanzKm).toBeGreaterThan(3)
    expect(f!.distanzKm).toBeLessThan(15)
    expect(f!.fahrzeitMinuten).toBeGreaterThanOrEqual(10)
    expect(f!.fahrzeitMinuten).toBeLessThan(40)
  })

  it('schätzt Frankfurt → Kassel als Fernstrecke', () => {
    // ~150 km Nord-Hessen: muss die 55-km/h-Stufe treffen
    const f = fahrtZwischenPlz('60311', '34117')
    expect(f).not.toBeNull()
    expect(f!.distanzKm).toBeGreaterThan(100)
    expect(f!.fahrzeitMinuten).toBeGreaterThan(90)
  })

  it('ist symmetrisch', () => {
    const hin = fahrtZwischenPlz('60311', '65183')
    const zurueck = fahrtZwischenPlz('65183', '60311')
    expect(hin).toEqual(zurueck)
  })
})

describe('durchschnittsgeschwindigkeitKmh', () => {
  it('staffelt nach Streckenlänge', () => {
    expect(durchschnittsgeschwindigkeitKmh(2)).toBe(22)
    expect(durchschnittsgeschwindigkeitKmh(10)).toBe(35)
    expect(durchschnittsgeschwindigkeitKmh(50)).toBe(55)
  })
})

describe('fahrtzeitenEntlangRoute', () => {
  it('berechnet Anfahrten je Stop, erster Stop ohne startPlz = null', () => {
    const route = fahrtzeitenEntlangRoute([
      { plz: '60311' },
      { plz: '60311' },
      { plz: '63065' },
    ])
    expect(route).toHaveLength(3)
    expect(route[0]).toEqual({ fahrzeitMinuten: null, distanzKm: null })
    expect(route[1].fahrzeitMinuten).toBe(FAHRZEIT_GLEICHE_PLZ_MINUTEN)
    expect(route[2].fahrzeitMinuten).toBeGreaterThan(0)
  })

  it('nutzt startPlz für die Anfahrt zum ersten Stop', () => {
    const route = fahrtzeitenEntlangRoute([{ plz: '63065' }], '60311')
    expect(route[0].fahrzeitMinuten).toBeGreaterThan(0)
    expect(route[0].distanzKm).toBeGreaterThan(0)
  })

  it('unbekannte PLZ in der Mitte bricht die Route nicht', () => {
    const route = fahrtzeitenEntlangRoute([
      { plz: '60311' },
      { plz: null },
      { plz: '63065' },
    ])
    expect(route[1]).toEqual({ fahrzeitMinuten: null, distanzKm: null })
    expect(route[2]).toEqual({ fahrzeitMinuten: null, distanzKm: null })
  })
})
