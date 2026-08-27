// ═══════════════════════════════════════════════════════════
// Nachteinsätze in der Konflikt-Vorabprüfung
// ═══════════════════════════════════════════════════════════
// `findeKonflikte` bildet den DB-Trigger `check_assignment_overlap` nach.
// Der Trigger rechnet seit Migration 20261012000000 über den Tageswechsel;
// täte diese Datei es nicht, hätte die Oberfläche wieder eine andere
// Wahrheit als die Datenbank — und zwar die gefährlichere Richtung:
// „kein Konflikt" sagen, wo die Datenbank später blockiert, oder umgekehrt
// eine echte Doppelbelegung durchwinken, weil der Trigger sie zwar fängt,
// die Meldung aber vom Fehler-Sanitizer verschluckt wird.
//
// Der zugehörige Beweis gegen echtes Postgres liegt in
// __tests__/einsatzplanung/assignment-overlap-nachtdienst-pglite.test.ts.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest'
import {
  spanneInMinuten,
  zeitenUeberschneiden,
  tagesVersatz,
  tagVerschieben,
  wochentagsVersatz,
  wochentagsNachbarn,
  findeKonflikte,
  type KonfliktEinsatz,
} from '../../lib/einsatzplanung/konflikte'

function einsatz(over: Partial<KonfliktEinsatz> = {}): KonfliktEinsatz {
  return {
    id: 'a1',
    client_id: 'k1',
    caregiver_id: 'e1',
    assignment_date: '2026-09-10',
    start_time: '09:00:00',
    end_time: '11:00:00',
    status: 'GEPLANT',
    ...over,
  }
}

describe('spanneInMinuten', () => {
  it('rechnet einen Tageinsatz als Start + Dauer', () => {
    expect(spanneInMinuten('09:00', '11:00')).toEqual({ start: 540, dauer: 120 })
  })

  it('löst den Nachteinsatz über Mitternacht auf', () => {
    expect(spanneInMinuten('22:00', '06:00')).toEqual({ start: 1320, dauer: 480 })
  })

  it('meldet Beginn = Ende als Null-Einsatz', () => {
    expect(spanneInMinuten('10:00', '10:00')).toEqual({ start: 600, dauer: 0 })
  })

  it('gibt null bei unlesbarer Zeit', () => {
    expect(spanneInMinuten('neun', '11:00')).toBeNull()
    expect(spanneInMinuten('09:00', null)).toBeNull()
  })
})

describe('zeitenUeberschneiden — Tageswechsel', () => {
  it('erkennt zwei überlappende Nachteinsätze desselben Tages', () => {
    // Alte Regel (a1 < b2 && a2 > b1): 1320 < 300 ist falsch — der Konflikt
    // blieb unsichtbar.
    expect(zeitenUeberschneiden('22:00', '06:00', '23:00', '05:00')).toBe(true)
  })

  it('erkennt den Frühdienst des Folgetages im Nachteinsatz', () => {
    expect(zeitenUeberschneiden('22:00', '06:00', '05:00', '09:00', 1)).toBe(true)
  })

  it('lässt den Frühdienst des Folgetages ab dem Nachtende zu', () => {
    expect(zeitenUeberschneiden('22:00', '06:00', '06:00', '10:00', 1)).toBe(false)
  })

  it('erkennt den Nachteinsatz des Vortages im eigenen Frühdienst', () => {
    expect(zeitenUeberschneiden('05:00', '09:00', '22:00', '06:00', -1)).toBe(true)
  })

  it('meldet den Tageinsatz nicht gegen den Nachteinsatz des Vortages', () => {
    expect(zeitenUeberschneiden('09:00', '12:00', '22:00', '06:00', -1)).toBe(false)
  })

  it('lässt einen Null-Einsatz nichts blockieren', () => {
    // Beginn = Ende belegt keine Zeit. Dieselbe Entscheidung wie im Trigger —
    // ohne sie träfe das entartete Intervall [t, t) fälschlich.
    expect(zeitenUeberschneiden('10:00', '10:00', '09:00', '11:00')).toBe(false)
    expect(zeitenUeberschneiden('09:00', '11:00', '10:00', '10:00')).toBe(false)
  })
})

describe('tagesVersatz / tagVerschieben', () => {
  it('zählt ganze Tage', () => {
    expect(tagesVersatz('2026-09-10', '2026-09-11')).toBe(1)
    expect(tagesVersatz('2026-09-10', '2026-09-09')).toBe(-1)
    expect(tagesVersatz('2026-09-10', '2026-09-10')).toBe(0)
  })

  it('rechnet über den Monatswechsel', () => {
    expect(tagesVersatz('2026-09-30', '2026-10-01')).toBe(1)
    expect(tagVerschieben('2026-10-01', -1)).toBe('2026-09-30')
    expect(tagVerschieben('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('bleibt an der Sommerzeitgrenze bei ganzen Tagen', () => {
    // Deutsche Zeitumstellung 2026: 25.10. Mit lokaler Zeitrechnung käme
    // hier 0 oder 2 heraus.
    expect(tagesVersatz('2026-10-24', '2026-10-25')).toBe(1)
    expect(tagesVersatz('2026-10-25', '2026-10-26')).toBe(1)
  })

  it('gibt null bei unlesbarem Datum', () => {
    expect(tagesVersatz('10.09.2026', '2026-09-10')).toBeNull()
    expect(tagVerschieben(null, 1)).toBeNull()
  })
})

describe('wochentagsVersatz / wochentagsNachbarn', () => {
  it('liefert -1, 0 und +1 für benachbarte Wochentage', () => {
    expect(wochentagsVersatz(1, 1)).toBe(0)
    expect(wochentagsVersatz(1, 2)).toBe(1)
    expect(wochentagsVersatz(2, 1)).toBe(-1)
  })

  it('behandelt Sonntag als 0 und als 7 gleich', () => {
    expect(wochentagsVersatz(0, 7)).toBe(0)
    expect(wochentagsVersatz(7, 1)).toBe(1)
    expect(wochentagsVersatz(0, 1)).toBe(1)
    expect(wochentagsVersatz(6, 0)).toBe(1)
  })

  it('gibt null für weiter entfernte Wochentage', () => {
    expect(wochentagsVersatz(1, 3)).toBeNull()
    expect(wochentagsVersatz(1, null)).toBeNull()
  })

  it('nennt beide Sonntags-Schreibweisen im Suchraum', () => {
    expect(wochentagsNachbarn(1).sort()).toEqual([0, 1, 2, 7])
    expect(wochentagsNachbarn(6).sort()).toEqual([0, 5, 6, 7])
  })
})

describe('findeKonflikte — Nachteinsätze', () => {
  it('erkennt zwei Nachteinsätze derselben Kraft am selben Tag', () => {
    const bestand = [einsatz({ id: 'b1', client_id: 'k2', start_time: '22:00', end_time: '06:00' })]
    const k = findeKonflikte(einsatz({ id: 'neu', start_time: '23:00', end_time: '05:00' }), bestand)
    expect(k).toHaveLength(1)
    expect(k[0].art).toBe('mitarbeiter')
  })

  it('erkennt den Nachteinsatz des Vortages im Frühdienst', () => {
    const bestand = [einsatz({
      id: 'b1', client_id: 'k2', assignment_date: '2026-09-09',
      start_time: '22:00', end_time: '06:00',
    })]
    const k = findeKonflikte(einsatz({
      id: 'neu', assignment_date: '2026-09-10', start_time: '05:00', end_time: '09:00',
    }), bestand)
    expect(k).toHaveLength(1)
    expect(k[0].gegenId).toBe('b1')
    // Die Meldung nennt den Tag des GEGENSPIELERS — sonst sucht der
    // Planende den Konflikt am falschen Tag.
    expect(k[0].meldung).toContain('2026-09-09')
  })

  it('meldet keinen Konflikt, wenn der Frühdienst nach dem Nachtende beginnt', () => {
    const bestand = [einsatz({
      id: 'b1', client_id: 'k2', assignment_date: '2026-09-09',
      start_time: '22:00', end_time: '06:00',
    })]
    expect(findeKonflikte(einsatz({
      id: 'neu', assignment_date: '2026-09-10', start_time: '06:00', end_time: '09:00',
    }), bestand)).toEqual([])
  })

  it('greift nicht über zwei Tage', () => {
    const bestand = [einsatz({
      id: 'b1', client_id: 'k2', assignment_date: '2026-09-08',
      start_time: '22:00', end_time: '06:00',
    })]
    expect(findeKonflikte(einsatz({
      id: 'neu', assignment_date: '2026-09-10', start_time: '05:00', end_time: '09:00',
    }), bestand)).toEqual([])
  })

  it('erkennt die Nachtserie im Frühdienst der Folgeserie', () => {
    const serie = (over: Partial<KonfliktEinsatz>) =>
      einsatz({ assignment_date: null, weekday: 1, ...over })
    const bestand = [serie({ id: 'b1', client_id: 'k2', weekday: 1, start_time: '22:00', end_time: '06:00' })]
    const k = findeKonflikte(serie({ id: 'neu', weekday: 2, start_time: '05:00', end_time: '09:00' }), bestand)
    expect(k).toHaveLength(1)
    expect(k[0].art).toBe('mitarbeiter')
  })

  it('erkennt die Sonntagsnacht (weekday 0) in der Montagsfrühserie', () => {
    const serie = (over: Partial<KonfliktEinsatz>) =>
      einsatz({ assignment_date: null, weekday: 1, ...over })
    const bestand = [serie({ id: 'b1', client_id: 'k2', weekday: 0, start_time: '22:00', end_time: '06:00' })]
    const k = findeKonflikte(serie({ id: 'neu', weekday: 1, start_time: '05:00', end_time: '09:00' }), bestand)
    expect(k).toHaveLength(1)
  })

  it('prüft eine Serie weiterhin nicht gegen einen datierten Einsatz', () => {
    const bestand = [einsatz({ id: 'b1', client_id: 'k2', assignment_date: '2026-09-14', start_time: '22:00', end_time: '06:00' })]
    expect(findeKonflikte(einsatz({
      id: 'neu', assignment_date: null, weekday: 1, start_time: '23:00', end_time: '05:00',
    }), bestand)).toEqual([])
  })

  it('prüft einen datierten Einsatz weiterhin nicht gegen eine Serie', () => {
    const bestand = [einsatz({ id: 'b1', client_id: 'k2', assignment_date: null, weekday: 4, start_time: '22:00', end_time: '06:00' })]
    expect(findeKonflikte(einsatz({
      id: 'neu', assignment_date: '2026-09-10', start_time: '23:00', end_time: '05:00',
    }), bestand)).toEqual([])
  })
})
