/**
 * Track 13, Befund B7 — /api/visitor-alert nimmt die gemeldete IP aus dem
 * Rumpf. Sie waehlt zweierlei: den LIKE-Praefix der Historie-Abfrage
 * (`ip_address LIKE '<praefix>%'` ueber visitor_locations) und den
 * Schluessel des Stunden-Cooldowns.
 *
 * Ein leerer Wert ergab `LIKE '%'` — die Abfrage traf dann JEDEN Besucher
 * statt eines bestimmten. Das Ergebnis floss in die Alarmmail, nicht in
 * die Antwort an den Aufrufer; es war also keine Auskunft nach aussen,
 * aber die falsche Abfrage.
 *
 * Geprueft wird hier die reine Formregel. Sie ist bewusst grob: sie soll
 * nicht jede gueltige Adresse exakt treffen, sondern verhindern, dass ein
 * Wert als Praefix und Cooldown-Schluessel taugt, der keine Adresse ist.
 */
import { describe, it, expect } from 'vitest'
import { istPlausibleIp } from '@/lib/perimeter/ip-plausibilitaet'

describe('istPlausibleIp — was durchkommt', () => {
  it.each([
    '93.184.216.34',
    '10.0.0.1',
    '255.255.255.255',
    '2a02:3037:400:1234::1',
    '2003:cd:1f2c:8c00:1:2:3:4',
    '::1234:5678',
  ])('nimmt %s an', wert => {
    expect(istPlausibleIp(wert)).toBe(true)
  })
})

describe('istPlausibleIp — was abgewiesen wird', () => {
  it('weist den leeren Wert ab — er ergab LIKE %', () => {
    // Der eigentliche Befund: substring(0,20) einer leeren Zeichenkette
    // ist leer, und `LIKE '%'` trifft jede Zeile.
    expect(istPlausibleIp('')).toBe(false)
    expect(istPlausibleIp('   ')).toBe(false)
  })

  it('weist fehlende und falsch getypte Werte ab', () => {
    expect(istPlausibleIp(undefined)).toBe(false)
    expect(istPlausibleIp(null)).toBe(false)
    expect(istPlausibleIp(42)).toBe(false)
    expect(istPlausibleIp({ ip: '1.2.3.4' })).toBe(false)
    expect(istPlausibleIp(['1.2.3.4'])).toBe(false)
  })

  it('weist Platzhalter und Fragmente ab', () => {
    expect(istPlausibleIp('%')).toBe(false)
    expect(istPlausibleIp('93.')).toBe(false)
    expect(istPlausibleIp('93.184')).toBe(false)
    expect(istPlausibleIp('_')).toBe(false)
  })

  it('weist ein IPv4-Oktett ueber 255 ab', () => {
    expect(istPlausibleIp('999.1.1.1')).toBe(false)
    expect(istPlausibleIp('1.1.1.256')).toBe(false)
  })

  it('weist ueberlange Werte ab', () => {
    expect(istPlausibleIp('a'.repeat(200))).toBe(false)
    expect(istPlausibleIp('1'.repeat(46))).toBe(false)
  })

  it('weist Text ohne Doppelpunkt ab, der nur wie Hex aussieht', () => {
    // Ohne die Doppelpunkt-Bedingung waere jede Hex-Zeichenkette eine
    // „IPv6-Adresse" — und damit wieder ein frei waehlbarer Praefix.
    expect(istPlausibleIp('abcdef1234')).toBe(false)
    expect(istPlausibleIp('deadbeef')).toBe(false)
  })
})
