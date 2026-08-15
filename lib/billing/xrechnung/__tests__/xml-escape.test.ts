import { describe, it, expect } from 'vitest'
import { escapeXml, formatCiiDate, formatAmount, formatQuantity } from '../xml-escape'

describe('escapeXml', () => {
  it('escapes ampersand', () => expect(escapeXml('A & B')).toBe('A &amp; B'))
  it('escapes angle brackets', () => expect(escapeXml('<tag>')).toBe('&lt;tag&gt;'))
  it('escapes quotes', () => expect(escapeXml('"test"')).toBe('&quot;test&quot;'))
  it('escapes apostrophes', () => expect(escapeXml("it's")).toBe('it&apos;s'))
  it('handles null', () => expect(escapeXml(null)).toBe(''))
  it('handles undefined', () => expect(escapeXml(undefined)).toBe(''))
  it('handles numbers', () => expect(escapeXml(42)).toBe('42'))
  it('preserves Umlaute', () => expect(escapeXml('Straße')).toBe('Straße'))
})

describe('formatCiiDate', () => {
  it('formats ISO date string', () => expect(formatCiiDate('2026-08-15')).toBe('20260815'))
  it('formats Date object', () => expect(formatCiiDate(new Date('2026-01-05'))).toBe('20260105'))
  it('handles datetime string', () => expect(formatCiiDate('2026-08-15T12:30:00Z')).toBe('20260815'))
  it('returns empty for null', () => expect(formatCiiDate(null)).toBe(''))
  it('returns empty for undefined', () => expect(formatCiiDate(undefined)).toBe(''))
  it('returns empty for invalid date', () => expect(formatCiiDate('not-a-date')).toBe(''))
})

describe('formatAmount', () => {
  it('formats integer', () => expect(formatAmount(100)).toBe('100.00'))
  it('formats decimal', () => expect(formatAmount(35.5)).toBe('35.50'))
  it('handles zero', () => expect(formatAmount(0)).toBe('0.00'))
  it('handles null', () => expect(formatAmount(null)).toBe('0.00'))
})

describe('formatQuantity', () => {
  it('formats integer without decimals', () => expect(formatQuantity(3)).toBe('3'))
  it('formats fractional hours', () => expect(formatQuantity(1.5)).toBe('1.5'))
  it('strips trailing zeros', () => expect(formatQuantity(2.5)).toBe('2.5'))
  it('handles null', () => expect(formatQuantity(null)).toBe('0'))
})
