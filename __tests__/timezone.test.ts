import { describe, it, expect, vi, afterEach } from 'vitest'
import { heuteBerlin, datumBerlin, monatBerlin } from '@/lib/utils/timezone'

describe('timezone helpers', () => {
  afterEach(() => { vi.useRealTimers() })

  it('heuteBerlin gibt YYYY-MM-DD zurueck', () => {
    const result = heuteBerlin()
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('datumBerlin formatiert ein Date als YYYY-MM-DD', () => {
    const d = new Date('2026-06-15T14:30:00Z')
    expect(datumBerlin(d)).toBe('2026-06-15')
  })

  it('monatBerlin gibt YYYY-MM zurueck', () => {
    const result = monatBerlin()
    expect(result).toMatch(/^\d{4}-\d{2}$/)
  })

  it('monatBerlin mit explizitem Datum', () => {
    const d = new Date('2026-03-15T10:00:00Z')
    expect(monatBerlin(d)).toBe('2026-03')
  })

  it('23:30 UTC im Sommer (CEST) = Folgetag in Berlin', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-15T23:30:00Z'))
    expect(heuteBerlin()).toBe('2026-07-16')
    vi.useRealTimers()
  })

  it('22:30 UTC im Winter (CET) = Folgetag in Berlin', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-15T23:30:00Z'))
    expect(heuteBerlin()).toBe('2026-01-16')
    vi.useRealTimers()
  })

  it('Mitternacht UTC im Sommer = selber Tag in Berlin (02:00 CEST)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-15T00:00:00Z'))
    expect(heuteBerlin()).toBe('2026-07-15')
    vi.useRealTimers()
  })

  it('datumBerlin an DST-Grenze gibt korrekten Berlin-Tag', () => {
    const late = new Date('2026-03-28T23:30:00Z')
    expect(datumBerlin(late)).toBe('2026-03-29')
  })

  it('monatBerlin an Monatswechsel UTC vs Berlin', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-31T23:00:00Z'))
    expect(monatBerlin()).toBe('2026-08')
    vi.useRealTimers()
  })
})
