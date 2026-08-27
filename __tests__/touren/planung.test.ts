import { describe, it, expect } from 'vitest'
import {
  pruefeZeitplan,
  intervalleUeberlappen,
  pruefeWochenkapazitaet,
  pruefeVorlagenStops,
  tourGesamtMinuten,
  type PlanStop,
} from '@/lib/touren/planung'

const stop = (p: Partial<PlanStop> & { position: number }): PlanStop => ({
  geplante_ankunft: null,
  geplantes_ende: null,
  fahrzeit_minuten: null,
  ...p,
})

describe('pruefeZeitplan', () => {
  it('akzeptiert konsistenten Plan ohne Warnungen', () => {
    const warnungen = pruefeZeitplan([
      stop({ position: 1, geplante_ankunft: '08:00', geplantes_ende: '09:00' }),
      stop({ position: 2, geplante_ankunft: '09:20', geplantes_ende: '10:30', fahrzeit_minuten: 15 }),
    ])
    expect(warnungen).toEqual([])
  })

  it('meldet zu knappe Fahrzeit', () => {
    const warnungen = pruefeZeitplan([
      stop({ position: 1, geplante_ankunft: '08:00', geplantes_ende: '09:00' }),
      stop({ position: 2, geplante_ankunft: '09:05', geplantes_ende: '10:00', fahrzeit_minuten: 20 }),
    ])
    expect(warnungen).toHaveLength(1)
    expect(warnungen[0].typ).toBe('FAHRZEIT_ZU_KNAPP')
    expect(warnungen[0].position).toBe(2)
  })

  it('meldet Ende vor Ankunft und fehlende Zeiten', () => {
    const warnungen = pruefeZeitplan([
      stop({ position: 1, geplante_ankunft: '10:00', geplantes_ende: '09:00' }),
      stop({ position: 2, geplante_ankunft: null, geplantes_ende: '11:00' }),
    ])
    expect(warnungen.map(w => w.typ)).toContain('ENDE_VOR_START')
    expect(warnungen.map(w => w.typ)).toContain('ZEITEN_UNVOLLSTAENDIG')
  })

  it('meldet falsche Reihenfolge', () => {
    const warnungen = pruefeZeitplan([
      stop({ position: 1, geplante_ankunft: '10:00', geplantes_ende: '11:00' }),
      stop({ position: 2, geplante_ankunft: '08:00', geplantes_ende: '09:00' }),
    ])
    expect(warnungen.map(w => w.typ)).toContain('REIHENFOLGE')
  })

  it('prüft nach Position sortiert, nicht nach Array-Reihenfolge', () => {
    const warnungen = pruefeZeitplan([
      stop({ position: 2, geplante_ankunft: '09:20', geplantes_ende: '10:30', fahrzeit_minuten: 15 }),
      stop({ position: 1, geplante_ankunft: '08:00', geplantes_ende: '09:00' }),
    ])
    expect(warnungen).toEqual([])
  })
})

describe('intervalleUeberlappen', () => {
  it('erkennt Überlappung', () => {
    expect(intervalleUeberlappen(
      { start: '08:00', ende: '10:00' },
      { start: '09:00', ende: '11:00' },
    )).toBe(true)
  })

  it('angrenzende Intervalle überlappen nicht', () => {
    expect(intervalleUeberlappen(
      { start: '08:00', ende: '10:00' },
      { start: '10:00', ende: '11:00' },
    )).toBe(false)
  })

  it('unvollständige Zeiten überlappen nie', () => {
    expect(intervalleUeberlappen(
      { start: null, ende: '10:00' },
      { start: '09:00', ende: '11:00' },
    )).toBe(false)
  })
})

describe('pruefeWochenkapazitaet', () => {
  it('ohne Soll-Stunden keine Aussage', () => {
    const e = pruefeWochenkapazitaet({ wochenstundenSoll: null, verplanteMinutenWoche: 1000, neueMinuten: 500 })
    expect(e).toEqual({ ueberlastet: false, auslastungProzent: null, text: null })
  })

  it('warnt ab 90% Auslastung', () => {
    // 30h Soll = 1800 Min; 1650 Min = 92%
    const e = pruefeWochenkapazitaet({ wochenstundenSoll: 30, verplanteMinutenWoche: 1500, neueMinuten: 150 })
    expect(e.ueberlastet).toBe(false)
    expect(e.auslastungProzent).toBe(92)
    expect(e.text).toContain('92%')
  })

  it('meldet Überlastung über Soll', () => {
    const e = pruefeWochenkapazitaet({ wochenstundenSoll: 30, verplanteMinutenWoche: 1700, neueMinuten: 200 })
    expect(e.ueberlastet).toBe(true)
    expect(e.text).toContain('überschritten')
  })
})

describe('tourGesamtMinuten', () => {
  it('summiert Einsatz- und Fahrzeit', () => {
    const summe = tourGesamtMinuten([
      stop({ position: 1, geplante_ankunft: '08:00', geplantes_ende: '09:00' }),          // 60
      stop({ position: 2, geplante_ankunft: '09:20', geplantes_ende: '10:00', fahrzeit_minuten: 20 }), // 40+20
    ])
    expect(summe).toBe(120)
  })

  it('ignoriert kaputte Zeiten statt zu rechnen', () => {
    const summe = tourGesamtMinuten([
      stop({ position: 1, geplante_ankunft: '10:00', geplantes_ende: '09:00', fahrzeit_minuten: 10 }),
    ])
    expect(summe).toBe(10)
  })
})

// ═══════════════════════════════════════════════════════════════
// Tour-Vorlagen: stops ist ein jsonb-Array ohne Struktur-Zusage
// ═══════════════════════════════════════════════════════════════
// Beim Anwenden einer Vorlage wurde `dauer_minuten` ungeprueft auf den
// Zeitzeiger addiert. Fehlte das Feld, ergab das NaN, `minutenZuZeit(NaN)`
// lieferte "NaN:NaN", und dieser Wert ging als Uhrzeit an die Einsatz-Anlage:
// Postgres antwortete mit einem rohen Formatfehler (HTTP 500).

describe('pruefeVorlagenStops', () => {
  const gut = { client_id: 'kl-1', dauer_minuten: 45 }

  it('nimmt eine gepflegte Vorlage an', () => {
    expect(pruefeVorlagenStops([gut, { client_id: 'kl-2', dauer_minuten: 30 }])).toBeNull()
  })

  it('weist eine leere Vorlage ab', () => {
    expect(pruefeVorlagenStops([])).toMatch(/keine Stops/)
  })

  it('weist eine fehlende Dauer ab, statt daraus NaN zu rechnen', () => {
    expect(pruefeVorlagenStops([{ client_id: 'kl-1' }])).toMatch(/dauer_minuten/)
    expect(pruefeVorlagenStops([{ client_id: 'kl-1', dauer_minuten: null }])).toMatch(/dauer_minuten/)
    expect(pruefeVorlagenStops([{ client_id: 'kl-1', dauer_minuten: '45' }])).toMatch(/dauer_minuten/)
    expect(pruefeVorlagenStops([{ client_id: 'kl-1', dauer_minuten: NaN }])).toMatch(/dauer_minuten/)
  })

  it('weist eine Dauer von 0 oder weniger ab', () => {
    // Eine negative Dauer erzeugte einen Stop, dessen Ende vor der Ankunft lag.
    expect(pruefeVorlagenStops([{ client_id: 'kl-1', dauer_minuten: 0 }])).toMatch(/größer als 0/)
    expect(pruefeVorlagenStops([{ client_id: 'kl-1', dauer_minuten: -30 }])).toMatch(/größer als 0/)
  })

  it('weist eine Dauer über einen ganzen Tag ab', () => {
    expect(pruefeVorlagenStops([{ client_id: 'kl-1', dauer_minuten: 1441 }])).toMatch(/ganzen Tag/)
  })

  it('weist einen Stop ohne Klient ab', () => {
    expect(pruefeVorlagenStops([{ dauer_minuten: 45 }])).toMatch(/client_id/)
    expect(pruefeVorlagenStops([{ client_id: '  ', dauer_minuten: 45 }])).toMatch(/client_id/)
  })

  it('nennt die Position des fehlerhaften Stops', () => {
    expect(pruefeVorlagenStops([gut, gut, { client_id: 'kl-3' }])).toMatch(/Stop 3/)
  })
})
