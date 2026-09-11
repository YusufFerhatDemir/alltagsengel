/**
 * Kundenanrede und Drip-Mails nach der Kommunikationsregel (CLAUDE.md):
 * „Hallo Frau/Herr Nachname,“ — Gruß „Ihr Team von Alltagsengel“ — nie ein
 * persönlicher Name. Kein geratenes Geschlecht, keine Stundenpreise, keine
 * Kassenabrechnungs-Zusage.
 */
import { describe, it, expect } from 'vitest'
import { kundenAnrede, KUNDEN_GRUSS, KUNDEN_GRUSS_HTML } from '@/lib/kommunikation/anrede'
import { DRIP_VORLAGEN } from '@/lib/email/drip-vorlagen'

describe('kundenAnrede', () => {
  it('Frau/Herr + Nachname, wenn die Anredeform bekannt ist', () => {
    expect(kundenAnrede({ vorname: 'Erika', nachname: 'Müller', anredeform: 'frau' })).toBe('Hallo Frau Müller,')
    expect(kundenAnrede({ vorname: 'Hans', nachname: 'Schmidt', anredeform: 'herr' })).toBe('Hallo Herr Schmidt,')
  })

  it('ohne Anredeform: neutral mit vollem Namen — Geschlecht wird NIE aus dem Vornamen geraten', () => {
    expect(kundenAnrede({ vorname: 'Erika', nachname: 'Müller' })).toBe('Guten Tag Erika Müller,')
    expect(kundenAnrede({ vorname: 'Hans', nachname: 'Schmidt', anredeform: null })).toBe('Guten Tag Hans Schmidt,')
  })

  it('nur Vorname → keine Du-/Vornamen-Anrede', () => {
    expect(kundenAnrede({ vorname: 'Erika' })).toBe('Guten Tag,')
    expect(kundenAnrede({ vorname: 'Erika', nachname: '  ' })).toBe('Guten Tag,')
  })

  it('nichts bekannt → „Guten Tag,“', () => {
    expect(kundenAnrede({})).toBe('Guten Tag,')
  })

  it('Zeilenumbrüche aus frei wählbaren Namen werden entfernt', () => {
    expect(kundenAnrede({ vorname: 'A\r\nBcc: x@y', nachname: 'B' })).toBe('Guten Tag A Bcc: x@y B,')
  })

  it('Gruß: „Ihr Team von Alltagsengel“', () => {
    expect(KUNDEN_GRUSS).toBe('Herzliche Grüße\nIhr Team von Alltagsengel')
    expect(KUNDEN_GRUSS_HTML).toContain('Ihr Team von Alltagsengel')
  })
})

describe.each(['day3', 'day7', 'day14'] as const)('Drip %s', (stufe) => {
  const v = DRIP_VORLAGEN[stufe]
  const html = stufe === 'day14'
    ? DRIP_VORLAGEN.day14.html('Guten Tag Erika Müller,', 'CODE1')
    : (v.html as (a: string) => string)('Guten Tag Erika Müller,')

  it('beginnt mit der übergebenen Anrede und schließt mit „Ihr Team von Alltagsengel“', () => {
    expect(html).toContain('Guten Tag Erika Müller,')
    expect(html).toContain('Ihr Team von Alltagsengel')
    expect(html).not.toMatch(/Hallo \$\{|Ihr Alltagsengel Team|Liebe Grüße/)
  })

  it('kein persönlicher Name, kein Vorname im Betreff', () => {
    expect(`${v.subject} ${html}`).not.toMatch(/Yusuf|Abdullah|Cilcioglu/i)
    expect(v.subject).not.toMatch(/\$\{/)
  })

  it('kein konkreter Stundenpreis, keine Kassenabrechnungs-Zusage', () => {
    expect(html).not.toMatch(/\d+\s?€\s?(pro|\/)\s?(Stunde|Std)/)
    expect(html).not.toMatch(/nichts aus eigener Tasche|Sie zahlen 0|übernimmt die Kosten/i)
  })
})
