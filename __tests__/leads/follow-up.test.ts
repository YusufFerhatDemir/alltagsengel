/**
 * Follow-up-Leiter: 24 h Erinnerung, 48 h Eskalation, 72 h Dringend.
 * @see lib/leads/follow-up.ts
 */
import { describe, it, expect } from 'vitest'
import {
  followUpSeitEingang, followUpSeitWiedervorlage, stufeFuerStunden, zaehleFollowUps,
  hoechsteStufe, berlinerTagPlus, tagAlsZeitpunkt, plusTage, stundenSeit,
} from '@/lib/leads/follow-up'

const JETZT = new Date('2026-09-11T12:00:00Z')
const vor = (h: number) => new Date(JETZT.getTime() - h * 3600_000).toISOString()

describe('Leiter ab Eingang (Stufe NEU)', () => {
  it.each([
    [0, 'keine'],
    [23.9, 'keine'],
    [24, 'erinnerung'],
    [47.9, 'erinnerung'],
    [48, 'eskalation'],
    [71.9, 'eskalation'],
    [72, 'dringend'],
    [167.9, 'dringend'],
    [168, 'verschleppt'],
    [24 * 30, 'verschleppt'],
  ])('%s h → %s', (h, erwartet) => {
    expect(followUpSeitEingang(vor(h as number), JETZT)).toBe(erwartet)
  })

  it('fehlender oder unlesbarer Zeitpunkt ist keine Stufe, kein Absturz', () => {
    expect(followUpSeitEingang(null, JETZT)).toBe('keine')
    expect(followUpSeitEingang('kein-datum', JETZT)).toBe('keine')
    expect(stundenSeit(undefined, JETZT)).toBeNull()
  })

  it('Eingang in der Zukunft (Uhrenversatz) löst nichts aus', () => {
    expect(followUpSeitEingang(vor(-5), JETZT)).toBe('keine')
  })
})

describe('Leiter ab Wiedervorlage (spätere Stufen)', () => {
  it('vor Fälligkeit nichts', () => {
    expect(followUpSeitWiedervorlage(vor(-1), JETZT)).toBe('keine')
  })
  it('am Fälligkeitspunkt Erinnerung — derselbe Punkt wie „24 h nach Eingang"', () => {
    expect(followUpSeitWiedervorlage(vor(0), JETZT)).toBe('erinnerung')
  })
  it('24 h drüber Eskalation, 48 h drüber Dringend, 6 Tage drüber verschleppt', () => {
    expect(followUpSeitWiedervorlage(vor(24), JETZT)).toBe('eskalation')
    expect(followUpSeitWiedervorlage(vor(48), JETZT)).toBe('dringend')
    expect(followUpSeitWiedervorlage(vor(144), JETZT)).toBe('verschleppt')
  })
  it('ohne Wiedervorlage keine Stufe', () => {
    expect(followUpSeitWiedervorlage(null, JETZT)).toBe('keine')
  })
})

describe('Hilfsfunktionen', () => {
  it('stufeFuerStunden(null) = keine', () => {
    expect(stufeFuerStunden(null)).toBe('keine')
  })

  it('zählt je Stufe und gesamt, „keine" zählt nicht mit', () => {
    expect(zaehleFollowUps(['keine', 'erinnerung', 'dringend', 'dringend', 'eskalation', 'verschleppt']))
      .toEqual({ erinnerung: 1, eskalation: 1, dringend: 2, verschleppt: 1, gesamt: 5 })
  })

  it('höchste Stufe', () => {
    expect(hoechsteStufe(['erinnerung', 'dringend', 'keine'])).toBe('dringend')
    expect(hoechsteStufe(['dringend', 'verschleppt'])).toBe('verschleppt')
    expect(hoechsteStufe([])).toBe('keine')
  })

  it('Kalendertag in Berlin, nicht UTC: 23:30 Berlin ist noch derselbe Tag', () => {
    // 21:30 UTC im Sommer = 23:30 Berlin → heute ist der 11.
    expect(berlinerTagPlus(new Date('2026-09-11T21:30:00Z'), 0)).toBe('2026-09-11')
    // 22:30 UTC = 00:30 Berlin → schon der 12.
    expect(berlinerTagPlus(new Date('2026-09-11T22:30:00Z'), 0)).toBe('2026-09-12')
    expect(berlinerTagPlus(new Date('2026-09-11T10:00:00Z'), 3)).toBe('2026-09-14')
    // Monatswechsel
    expect(berlinerTagPlus(new Date('2026-09-30T10:00:00Z'), 1)).toBe('2026-10-01')
  })

  it('date-Spalte → Zeitpunkt; Müll → null', () => {
    expect(tagAlsZeitpunkt('2026-09-14')).toBe('2026-09-14T00:00:00.000Z')
    expect(tagAlsZeitpunkt(null)).toBeNull()
    expect(tagAlsZeitpunkt('14.09.2026')).toBeNull()
  })

  it('plusTage', () => {
    expect(plusTage('2026-09-11T12:00:00.000Z', 2)).toBe('2026-09-13T12:00:00.000Z')
  })
})
