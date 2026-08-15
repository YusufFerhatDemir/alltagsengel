import { describe, it, expect } from 'vitest'
import { berechneDringlichkeit, tageVerbleibend } from '@/lib/automation/fristen-sammler'

describe('fristen-sammler — Dringlichkeitsstufen', () => {
  it('negative Resttage → ueberfaellig', () => {
    expect(berechneDringlichkeit(-1)).toBe('ueberfaellig')
  })
  it('0-14 Tage → kritisch', () => {
    expect(berechneDringlichkeit(0)).toBe('kritisch')
    expect(berechneDringlichkeit(14)).toBe('kritisch')
  })
  it('15-30 Tage → warnung', () => {
    expect(berechneDringlichkeit(15)).toBe('warnung')
    expect(berechneDringlichkeit(30)).toBe('warnung')
  })
  it('mehr als 30 Tage → ok', () => {
    expect(berechneDringlichkeit(31)).toBe('ok')
  })

  it('tageVerbleibend: ungültiges Datum → hoher Fallback statt Crash', () => {
    expect(tageVerbleibend('kein-datum')).toBe(999)
  })

  it('tageVerbleibend: Datum in der Vergangenheit → negative Zahl', () => {
    const gestern = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10)
    expect(tageVerbleibend(gestern)).toBeLessThan(0)
  })
})
