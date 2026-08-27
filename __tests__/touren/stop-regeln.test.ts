/**
 * Regeln an Tour und Stop (lib/touren/stops.ts)
 *
 * Reine Prüflogik ohne HTTP — die Route setzt sie um, geprüft wird sie hier.
 * Die Fälle stammen aus dem Zustand vor der Härtung: Statusrückschritte, die
 * den Einsatz stehen ließen, Zeiten ohne Dauer und eine Sortierliste mit
 * doppelten IDs.
 */

import { describe, it, expect } from 'vitest'
import {
  assertStopUebergang,
  assertStopZeiten,
  assertTourOffen,
  assertTourUebergang,
  assignmentStatusFuerStop,
  pruefeReihenfolge,
  schreibeAufAssignment,
  schreibeReihenfolge,
  stopDauerMinuten,
  STOP_STATUS,
  TOUR_STATUS,
} from '../../lib/touren/stops'
import { erstelleFakeSupabase } from '../helpers/supabase-fake'

describe('assertStopUebergang', () => {
  it('lässt den Weg vorwärts zu — auch mit Sprung', () => {
    expect(() => assertStopUebergang('GEPLANT', 'UNTERWEGS')).not.toThrow()
    expect(() => assertStopUebergang('GEPLANT', 'ABGESCHLOSSEN')).not.toThrow()
    expect(() => assertStopUebergang('UNTERWEGS', 'BEIM_KLIENTEN')).not.toThrow()
  })

  it('lässt denselben Status zu (idempotenter Aufruf)', () => {
    for (const s of STOP_STATUS) expect(() => assertStopUebergang(s, s)).not.toThrow()
  })

  it('lässt den Ausfall aus jedem laufenden Zustand zu', () => {
    expect(() => assertStopUebergang('GEPLANT', 'AUSGEFALLEN')).not.toThrow()
    expect(() => assertStopUebergang('BEIM_KLIENTEN', 'AUSGEFALLEN')).not.toThrow()
  })

  it('erlaubt die Reaktivierung eines ausgefallenen Stops', () => {
    expect(() => assertStopUebergang('AUSGEFALLEN', 'GEPLANT')).not.toThrow()
  })

  it('verweigert den Sprung aus AUSGEFALLEN in die laufende Kette', () => {
    // Der Einsatz ist storniert. Ohne Reaktivierung stünde der Stop auf
    // UNTERWEGS, während sein Einsatz storniert bliebe.
    expect(() => assertStopUebergang('AUSGEFALLEN', 'UNTERWEGS')).toThrow(/reaktiviert/)
    expect(() => assertStopUebergang('AUSGEFALLEN', 'ABGESCHLOSSEN')).toThrow()
  })

  it('verweigert jeden Rückschritt aus ABGESCHLOSSEN', () => {
    expect(() => assertStopUebergang('ABGESCHLOSSEN', 'GEPLANT')).toThrow(/Leistungsnachweis/)
    expect(() => assertStopUebergang('ABGESCHLOSSEN', 'AUSGEFALLEN')).toThrow()
  })

  it('verweigert einen unbekannten Status', () => {
    expect(() => assertStopUebergang('GEPLANT', 'FERTIG')).toThrow(/Erlaubt/)
  })
})

describe('assertTourUebergang', () => {
  it('lässt die üblichen Wege zu', () => {
    expect(() => assertTourUebergang('GEPLANT', 'FREIGEGEBEN')).not.toThrow()
    expect(() => assertTourUebergang('FREIGEGEBEN', 'UNTERWEGS')).not.toThrow()
    expect(() => assertTourUebergang('UNTERWEGS', 'ABGESCHLOSSEN')).not.toThrow()
    expect(() => assertTourUebergang('GEPLANT', 'STORNIERT')).not.toThrow()
  })

  it('lässt eine stornierte Tour nur nach GEPLANT zurück', () => {
    expect(() => assertTourUebergang('STORNIERT', 'GEPLANT')).not.toThrow()
    expect(() => assertTourUebergang('STORNIERT', 'UNTERWEGS')).toThrow()
  })

  it('hält ABGESCHLOSSEN als Endzustand fest', () => {
    for (const ziel of TOUR_STATUS.filter(s => s !== 'ABGESCHLOSSEN')) {
      expect(() => assertTourUebergang('ABGESCHLOSSEN', ziel)).toThrow(/abgeschlossen/)
    }
  })
})

describe('assertTourOffen', () => {
  it('lässt offene Touren durch', () => {
    for (const s of ['GEPLANT', 'FREIGEGEBEN', 'UNTERWEGS']) {
      expect(() => assertTourOffen(s, 'Stops zu ändern')).not.toThrow()
    }
  })

  it('sperrt geschlossene Touren und unbekannte Zustände (Erlaubnisliste)', () => {
    expect(() => assertTourOffen('STORNIERT', 'Stops zu ändern')).toThrow()
    expect(() => assertTourOffen('ABGESCHLOSSEN', 'Stops zu ändern')).toThrow()
    expect(() => assertTourOffen(null, 'Stops zu ändern')).toThrow()
    expect(() => assertTourOffen('IRGENDWAS_NEUES', 'Stops zu ändern')).toThrow()
  })
})

describe('assignmentStatusFuerStop', () => {
  it('spiegelt die Kette wie der DB-Trigger', () => {
    expect(assignmentStatusFuerStop('UNTERWEGS')).toBe('UNTERWEGS')
    expect(assignmentStatusFuerStop('BEIM_KLIENTEN')).toBe('GESTARTET')
    expect(assignmentStatusFuerStop('ABGESCHLOSSEN')).toBe('BEENDET')
  })

  it('füllt die beiden Lücken des Triggers', () => {
    // tour_stop_sync_assignment() bildet diese beiden auf NULL ab und lässt
    // den Einsatzstatus stehen — genau daraus entstand der Geisterzustand.
    expect(assignmentStatusFuerStop('GEPLANT')).toBe('GEPLANT')
    expect(assignmentStatusFuerStop('AUSGEFALLEN')).toBe('STORNIERT')
  })
})

describe('assertStopZeiten', () => {
  it('lässt eine gewöhnliche Spanne zu', () => {
    expect(() => assertStopZeiten('08:00', '09:30')).not.toThrow()
    expect(() => assertStopZeiten('08:00:00', '09:30:00')).not.toThrow()
  })

  it('lässt den Nachteinsatz über Mitternacht zu', () => {
    expect(() => assertStopZeiten('22:00', '06:00')).not.toThrow()
  })

  it('lehnt Beginn = Ende ab', () => {
    expect(() => assertStopZeiten('10:00', '10:00')).toThrow(/identisch/)
  })

  it('lehnt unlesbare Uhrzeiten ab', () => {
    expect(() => assertStopZeiten('25:00', '11:00')).toThrow()
    expect(() => assertStopZeiten('8 Uhr', '11:00')).toThrow()
  })

  it('lehnt eine halb gesetzte Spanne ab', () => {
    // assignments.start_time/end_time sind NOT NULL — ein halber Stop ließe
    // sich gar nicht auf seinen Einsatz zurückschreiben.
    expect(() => assertStopZeiten('08:00', null)).toThrow(/zusammen/)
    expect(() => assertStopZeiten(null, '09:00')).toThrow(/zusammen/)
  })

  it('lässt einen Stop ganz ohne Zeiten zu', () => {
    expect(() => assertStopZeiten(null, null)).not.toThrow()
  })
})

describe('stopDauerMinuten', () => {
  it('rechnet über Mitternacht', () => {
    expect(stopDauerMinuten('08:00', '09:30')).toBe(90)
    expect(stopDauerMinuten('22:00', '06:00')).toBe(480)
    expect(stopDauerMinuten('10:00', '10:00')).toBe(0)
    expect(stopDauerMinuten(null, '10:00')).toBeNull()
  })
})

describe('pruefeReihenfolge', () => {
  const bestand = ['a', 'b', 'c']

  it('nimmt eine vollständige Permutation an', () => {
    expect(pruefeReihenfolge(['c', 'a', 'b'], bestand)).toEqual({ ok: true, fehler: null })
  })

  it('weist eine doppelte ID ab', () => {
    // Der eigentliche Befund: Länge und Zugehörigkeit stimmten, die Liste
    // war trotzdem unbrauchbar.
    const befund = pruefeReihenfolge(['a', 'a', 'b'], bestand)
    expect(befund.ok).toBe(false)
    expect(befund.fehler).toMatch(/doppelt/)
  })

  it('weist eine fremde ID ab', () => {
    expect(pruefeReihenfolge(['a', 'b', 'x'], bestand).ok).toBe(false)
  })

  it('weist eine unvollständige Liste ab', () => {
    expect(pruefeReihenfolge(['a', 'b'], bestand).ok).toBe(false)
  })

  it('weist alles ab, was keine Liste von IDs ist', () => {
    expect(pruefeReihenfolge('a,b,c', bestand).ok).toBe(false)
    expect(pruefeReihenfolge([1, 2, 3], bestand).ok).toBe(false)
    expect(pruefeReihenfolge(null, bestand).ok).toBe(false)
  })
})

describe('schreibeReihenfolge', () => {
  it('vergibt Positionen zweiphasig und immer mit Tour-Fence', async () => {
    const fake = erstelleFakeSupabase(() => ({ data: [] }))
    const ergebnis = await schreibeReihenfolge(fake.client, 'tour-1', ['a', 'b'])
    expect(ergebnis.ok).toBe(true)
    const updates = fake.auf('tour_stops')
    expect(updates).toHaveLength(4)
    expect((updates[0].payload as { position: number }).position).toBe(1000)
    expect((updates[2].payload as { position: number }).position).toBe(1)
    // Ohne tour_id-Fence liesse sich per fremder Stop-ID in einer anderen
    // Tour sortieren.
    for (const u of updates) {
      expect(u.filter.some(f => f.spalte === 'tour_id' && f.wert === 'tour-1')).toBe(true)
    }
  })

  it('meldet einen Fehler der zweiten Phase, statt ihn zu verschlucken', async () => {
    let n = 0
    const fake = erstelleFakeSupabase(() => {
      n += 1
      return n === 3 ? { error: { message: 'deadlock detected', code: '40P01' } } : { data: [] }
    })
    const ergebnis = await schreibeReihenfolge(fake.client, 'tour-1', ['a', 'b'])
    expect(ergebnis.ok).toBe(false)
    expect(ergebnis.ok === false && ergebnis.fehler).toMatch(/Ausweichpositionen/)
  })
})

describe('schreibeAufAssignment', () => {
  it('schreibt nichts, wenn es nichts zu schreiben gibt', async () => {
    const fake = erstelleFakeSupabase(() => ({ data: [] }))
    const ergebnis = await schreibeAufAssignment(fake.client, 'a1', {})
    expect(ergebnis.ok).toBe(true)
    expect(fake.aufrufe).toHaveLength(0)
  })

  it('erkennt die Doppelbelegung als eigenen Fall', async () => {
    const fake = erstelleFakeSupabase(() => ({
      error: { message: 'DOPPELBELEGUNG: Mitarbeiter x hat bereits einen Einsatz' },
    }))
    const ergebnis = await schreibeAufAssignment(fake.client, 'a1', { start_time: '10:00' })
    expect(ergebnis.ok).toBe(false)
    expect(ergebnis.doppelbelegung).toBe(true)
  })

  it('meldet jeden anderen Fehler ausdrücklich als „nicht geändert"', async () => {
    const fake = erstelleFakeSupabase(() => ({ error: { message: 'connection reset', code: '08006' } }))
    const ergebnis = await schreibeAufAssignment(fake.client, 'a1', { start_time: '10:00' })
    expect(ergebnis.ok).toBe(false)
    expect(ergebnis.doppelbelegung).toBe(false)
    expect(ergebnis.fehler).toMatch(/NICHT geändert/)
  })
})
