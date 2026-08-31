// Routenoptimierung — lib/touren/optimierung.ts
//
// Die Faelle hier pruefen nicht "findet er eine kuerzere Route", sondern
// die drei Regeln, wegen derer diese Datei kein gewoehnlicher
// TSP-Loeser ist: ein fester Termin bleibt stehen, ein bereits
// angelaufener Stop bleibt stehen, und eine unbekannte Strecke fuehrt
// zur Ablehnung statt zu einer geschoenten Route.

import { describe, it, expect } from 'vitest'
import { optimiereReihenfolge, type OptiStop } from '@/lib/touren/optimierung'
import { fahrtZwischenPlz } from '@/lib/touren/fahrtzeit'

// Reale PLZ aus dem amtlichen Bestand (Rhein-Main).
const ZENTRUM = '60311'   // Frankfurt Innenstadt (Startpunkt)
const OST = '63065'       // Offenbach   — 17 Min vom Zentrum
const WEST = '65929'      // Frankfurt-Hoechst — 26 Min vom Zentrum
const NAH = '60486'       // Bockenheim  — 13 Min vom Zentrum

function stop(over: Partial<OptiStop> & { id: string; position: number }): OptiStop {
  return {
    plz: ZENTRUM,
    status: 'GEPLANT',
    geplante_ankunft: '09:00',
    geplantes_ende: '10:00',
    flexibel_minuten: 0,
    ...over,
  }
}

describe('optimiereReihenfolge — Regel 1: ein Termin ist eine Zusage', () => {
  it('verschiebt ohne ausdruecklichen Spielraum keinen einzigen Stop', () => {
    // Bewusst teure Reihenfolge: Ost → West → nah am Start.
    const erg = optimiereReihenfolge({
      startPlz: ZENTRUM,
      stops: [
        stop({ id: 'a', position: 1, plz: WEST, geplante_ankunft: '08:00', geplantes_ende: '09:00' }),
        stop({ id: 'b', position: 2, plz: OST, geplante_ankunft: '10:00', geplantes_ende: '11:00' }),
        stop({ id: 'c', position: 3, plz: NAH, geplante_ankunft: '12:00', geplantes_ende: '13:00' }),
      ],
    })
    expect(erg.moeglich).toBe(true)
    if (!erg.moeglich) return
    expect(erg.reihenfolge).toEqual(['a', 'b', 'c'])
    expect(erg.unveraendert).toBe(true)
    expect(erg.freieStops).toBe(0)
    expect(erg.verankert).toEqual(['a', 'b', 'c'])
    expect(erg.ersparnisMinuten).toBe(0)
  })

  it('sortiert um, sobald die Termine ausdruecklich Spielraum haben', () => {
    const erg = optimiereReihenfolge({
      startPlz: ZENTRUM,
      stops: [
        stop({ id: 'weit', position: 1, plz: WEST, geplante_ankunft: '08:00', geplantes_ende: '09:00', flexibel_minuten: 240 }),
        stop({ id: 'ost', position: 2, plz: OST, geplante_ankunft: '10:00', geplantes_ende: '11:00', flexibel_minuten: 240 }),
        stop({ id: 'nah', position: 3, plz: NAH, geplante_ankunft: '12:00', geplantes_ende: '13:00', flexibel_minuten: 240 }),
      ],
    })
    expect(erg.moeglich).toBe(true)
    if (!erg.moeglich) return
    expect(erg.freieStops).toBe(3)
    expect(erg.ersparnisMinuten).toBeGreaterThan(0)
    expect(erg.nachher.fahrzeitMinuten).toBeLessThan(erg.vorher.fahrzeitMinuten)
    // Alle Stops bleiben erhalten — eine Optimierung darf keinen verlieren.
    expect([...erg.reihenfolge].sort()).toEqual(['nah', 'ost', 'weit'])
  })

  it('haelt jede vorgeschlagene Ankunft im Fenster des Klienten', () => {
    const flex = 90
    const erg = optimiereReihenfolge({
      startPlz: ZENTRUM,
      stops: [
        stop({ id: 'a', position: 1, plz: WEST, geplante_ankunft: '08:00', geplantes_ende: '09:00', flexibel_minuten: flex }),
        stop({ id: 'b', position: 2, plz: OST, geplante_ankunft: '10:00', geplantes_ende: '11:00', flexibel_minuten: flex }),
        stop({ id: 'c', position: 3, plz: NAH, geplante_ankunft: '12:00', geplantes_ende: '13:00', flexibel_minuten: flex }),
      ],
    })
    expect(erg.moeglich).toBe(true)
    if (!erg.moeglich) return
    const soll: Record<string, number> = { a: 8 * 60, b: 10 * 60, c: 12 * 60 }
    for (const a of erg.ankuenfte) {
      const [h, m] = a.ankunft.split(':').map(Number)
      const abweichung = Math.abs(h * 60 + m - soll[a.stopId])
      expect(abweichung).toBeLessThanOrEqual(flex)
    }
  })
})

describe('optimiereReihenfolge — Regel 2: was laeuft, wird nicht umsortiert', () => {
  it('laesst einen bereits abgeschlossenen Stop auf seinem Platz, auch mit Spielraum', () => {
    const erg = optimiereReihenfolge({
      startPlz: ZENTRUM,
      stops: [
        stop({ id: 'fertig', position: 1, plz: WEST, status: 'ABGESCHLOSSEN', geplante_ankunft: '08:00', geplantes_ende: '09:00', flexibel_minuten: 300 }),
        stop({ id: 'ost', position: 2, plz: OST, geplante_ankunft: '10:00', geplantes_ende: '11:00', flexibel_minuten: 300 }),
        stop({ id: 'nah', position: 3, plz: NAH, geplante_ankunft: '12:00', geplantes_ende: '13:00', flexibel_minuten: 300 }),
      ],
    })
    expect(erg.moeglich).toBe(true)
    if (!erg.moeglich) return
    expect(erg.reihenfolge[0]).toBe('fertig')
    expect(erg.verankert).toContain('fertig')
    expect(erg.freieStops).toBe(2)
  })

  it.each(['UNTERWEGS', 'BEIM_KLIENTEN', 'ABGESCHLOSSEN', 'AUSGEFALLEN'])(
    'verankert Status %s',
    (status) => {
      const erg = optimiereReihenfolge({
        startPlz: ZENTRUM,
        stops: [
          stop({ id: 'a', position: 1, plz: WEST, geplante_ankunft: '08:00', geplantes_ende: '09:00', flexibel_minuten: 300 }),
          stop({ id: 'laeuft', position: 2, plz: OST, status, geplante_ankunft: '10:00', geplantes_ende: '11:00', flexibel_minuten: 300 }),
          stop({ id: 'c', position: 3, plz: NAH, geplante_ankunft: '12:00', geplantes_ende: '13:00', flexibel_minuten: 300 }),
        ],
      })
      expect(erg.moeglich).toBe(true)
      if (!erg.moeglich) return
      expect(erg.reihenfolge[1]).toBe('laeuft')
      expect(erg.verankert).toContain('laeuft')
    },
  )
})

describe('optimiereReihenfolge — Regel 3: unbekannte Strecke ist keine kurze Strecke', () => {
  it('lehnt ab, statt den Stop ohne PLZ als guenstigsten nach vorne zu ziehen', () => {
    const erg = optimiereReihenfolge({
      startPlz: ZENTRUM,
      stops: [
        stop({ id: 'a', position: 1, plz: WEST, flexibel_minuten: 300 }),
        stop({ id: 'ohne', position: 2, plz: null, geplante_ankunft: '10:00', geplantes_ende: '11:00', flexibel_minuten: 300 }),
        stop({ id: 'c', position: 3, plz: NAH, geplante_ankunft: '12:00', geplantes_ende: '13:00', flexibel_minuten: 300 }),
      ],
    })
    expect(erg.moeglich).toBe(false)
    if (erg.moeglich) return
    expect(erg.grund).toBe('PLZ_FEHLT')
    expect(erg.betroffeneStops).toEqual(['ohne'])
  })

  it('erkennt eine erfundene PLZ, die nicht im amtlichen Bestand steht', () => {
    // Der Riegel muss gegen eine ANDERE PLZ pruefen: fahrtZwischenPlz
    // faellt bei identischer PLZ in den Pauschalzweig und wuerde jede
    // erfundene Nummer durchwinken.
    expect(fahrtZwischenPlz('99999', '99999')).not.toBeNull()
    expect(fahrtZwischenPlz('99999', '60311')).toBeNull()

    const erg = optimiereReihenfolge({
      startPlz: ZENTRUM,
      stops: [
        stop({ id: 'a', position: 1, plz: WEST, flexibel_minuten: 300 }),
        stop({ id: 'fake', position: 2, plz: '99999', geplante_ankunft: '10:00', geplantes_ende: '11:00', flexibel_minuten: 300 }),
      ],
    })
    expect(erg.moeglich).toBe(false)
    if (erg.moeglich) return
    expect(erg.grund).toBe('PLZ_FEHLT')
    expect(erg.betroffeneStops).toEqual(['fake'])
  })

  it('lehnt eine unbekannte Start-PLZ ab', () => {
    const erg = optimiereReihenfolge({
      startPlz: '99999',
      stops: [
        stop({ id: 'a', position: 1, plz: WEST, flexibel_minuten: 300 }),
        stop({ id: 'b', position: 2, plz: OST, geplante_ankunft: '10:00', geplantes_ende: '11:00', flexibel_minuten: 300 }),
      ],
    })
    expect(erg.moeglich).toBe(false)
    if (erg.moeglich) return
    expect(erg.grund).toBe('PLZ_FEHLT')
  })
})

describe('optimiereReihenfolge — Randfaelle', () => {
  it('braucht mindestens zwei Stops', () => {
    const erg = optimiereReihenfolge({ stops: [stop({ id: 'a', position: 1 })] })
    expect(erg.moeglich).toBe(false)
    if (erg.moeglich) return
    expect(erg.grund).toBe('ZU_WENIG_STOPS')
  })

  it('lehnt Stops ohne vollstaendige Zeit ab, statt eine Dauer zu erfinden', () => {
    const erg = optimiereReihenfolge({
      startPlz: ZENTRUM,
      stops: [
        stop({ id: 'a', position: 1, plz: WEST }),
        stop({ id: 'ohnezeit', position: 2, plz: OST, geplante_ankunft: '10:00', geplantes_ende: null }),
      ],
    })
    expect(erg.moeglich).toBe(false)
    if (erg.moeglich) return
    expect(erg.grund).toBe('ZEITEN_UNVOLLSTAENDIG')
    expect(erg.betroffeneStops).toEqual(['ohnezeit'])
  })

  it('meldet einen Plan, der mit seinen eigenen Zeitfenstern nicht fahrbar ist', () => {
    // WEST endet 09:00, OST liegt 27 Min entfernt, Termin OST ist auf
    // 09:10 festgenagelt — das ist nicht zu schaffen, und keine
    // Umsortierung aendert das (beide Stops sind fest).
    const erg = optimiereReihenfolge({
      startPlz: ZENTRUM,
      stops: [
        stop({ id: 'a', position: 1, plz: WEST, geplante_ankunft: '08:00', geplantes_ende: '09:00' }),
        stop({ id: 'zuspaet', position: 2, plz: OST, geplante_ankunft: '09:10', geplantes_ende: '10:00' }),
      ],
    })
    expect(erg.moeglich).toBe(false)
    if (erg.moeglich) return
    expect(erg.grund).toBe('KEINE_ZULAESSIGE_REIHENFOLGE')
    expect(erg.betroffeneStops).toEqual(['zuspaet'])
  })

  it('rechnet den Nachtdienst ueber Mitternacht als Dauer, nicht als Minusdauer', () => {
    const erg = optimiereReihenfolge({
      startPlz: ZENTRUM,
      stops: [
        stop({ id: 'nacht', position: 1, plz: NAH, geplante_ankunft: '22:00', geplantes_ende: '02:00' }),
        stop({ id: 'danach', position: 2, plz: NAH, geplante_ankunft: '03:00', geplantes_ende: '04:00' }),
      ],
    })
    expect(erg.moeglich).toBe(true)
    if (!erg.moeglich) return
    // 22:00 + 4 h = 02:00, plus 7 Min Fahrt in derselben PLZ ⇒ 03:00 ist erreichbar.
    expect(erg.ankuenfte.map((a) => a.ankunft)).toEqual(['22:00', '03:00'])
  })

  it('behauptet keine Ersparnis, die nur aus einem frueheren Tagesbeginn kaeme', () => {
    const erg = optimiereReihenfolge({
      startPlz: ZENTRUM,
      stops: [
        stop({ id: 'a', position: 1, plz: WEST, geplante_ankunft: '08:00', geplantes_ende: '09:00', flexibel_minuten: 300 }),
        stop({ id: 'b', position: 2, plz: OST, geplante_ankunft: '10:00', geplantes_ende: '11:00', flexibel_minuten: 300 }),
        stop({ id: 'c', position: 3, plz: NAH, geplante_ankunft: '12:00', geplantes_ende: '13:00', flexibel_minuten: 300 }),
      ],
    })
    expect(erg.moeglich).toBe(true)
    if (!erg.moeglich) return
    // Erste Ankunft des ALTEN Plans war 08:00 nach 26 Min Anfahrt ab
    // 60311 — der Vorschlag darf nicht vor 07:34 losfahren.
    const erste = erg.ankuenfte[0]
    const [h, m] = erste.ankunft.split(':').map(Number)
    const abfahrt = h * 60 + m - (erste.fahrzeitMinuten ?? 0)
    expect(abfahrt).toBeGreaterThanOrEqual(8 * 60 - 26)
  })

  it('rechnet die Rueckfahrt mit, wenn sie verlangt ist', () => {
    const basis = {
      startPlz: ZENTRUM,
      stops: [
        stop({ id: 'a', position: 1, plz: WEST, geplante_ankunft: '08:00', geplantes_ende: '09:00' }),
        stop({ id: 'b', position: 2, plz: OST, geplante_ankunft: '10:00', geplantes_ende: '11:00' }),
      ],
    }
    const ohne = optimiereReihenfolge(basis)
    const mit = optimiereReihenfolge({ ...basis, rueckfahrt: true })
    expect(ohne.moeglich && mit.moeglich).toBe(true)
    if (!ohne.moeglich || !mit.moeglich) return
    const zurueck = fahrtZwischenPlz(OST, ZENTRUM)!
    expect(mit.vorher.fahrzeitMinuten - ohne.vorher.fahrzeitMinuten).toBe(zurueck.fahrzeitMinuten)
  })

  it('bleibt bei vielen freien Stops in vertretbarer Zeit und liefert eine vollstaendige Reihenfolge', () => {
    const plzListe = [WEST, OST, NAH, '60313', '60594', '61118', '60486', ZENTRUM, WEST, OST, NAH, '60313']
    const stops = plzListe.map((plz, i) => stop({
      id: `s${i}`,
      position: i + 1,
      plz,
      geplante_ankunft: `${String(7 + i).padStart(2, '0')}:00`,
      geplantes_ende: `${String(7 + i).padStart(2, '0')}:30`,
      flexibel_minuten: 600,
    }))
    const start = Date.now()
    const erg = optimiereReihenfolge({ startPlz: ZENTRUM, stops })
    const dauer = Date.now() - start
    expect(erg.moeglich).toBe(true)
    if (!erg.moeglich) return
    expect(dauer).toBeLessThan(5000)
    expect(new Set(erg.reihenfolge).size).toBe(stops.length)
    expect([...erg.reihenfolge].sort()).toEqual(stops.map((s) => s.id).sort())
    expect(erg.nachher.fahrzeitMinuten).toBeLessThanOrEqual(erg.vorher.fahrzeitMinuten)
  })

  it('liefert bei gleicher Eingabe dasselbe Ergebnis (reproduzierbar)', () => {
    const eingabe = {
      startPlz: ZENTRUM,
      stops: [
        stop({ id: 'a', position: 1, plz: WEST, geplante_ankunft: '08:00', geplantes_ende: '09:00', flexibel_minuten: 300 }),
        stop({ id: 'b', position: 2, plz: OST, geplante_ankunft: '10:00', geplantes_ende: '11:00', flexibel_minuten: 300 }),
        stop({ id: 'c', position: 3, plz: NAH, geplante_ankunft: '12:00', geplantes_ende: '13:00', flexibel_minuten: 300 }),
        stop({ id: 'd', position: 4, plz: '61118', geplante_ankunft: '14:00', geplantes_ende: '15:00', flexibel_minuten: 300 }),
      ],
    }
    const a = optimiereReihenfolge(eingabe)
    const b = optimiereReihenfolge(eingabe)
    expect(a).toEqual(b)
  })
})
