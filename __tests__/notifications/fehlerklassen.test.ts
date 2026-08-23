// ═══════════════════════════════════════════════════════════════════════
// Fehlerklassen: was wiederholt wird und was nicht
// ═══════════════════════════════════════════════════════════════════════
// Die Entscheidung ist bewusst asymmetrisch: im Zweifel wiederholen.
// Eine faelschlich als dauerhaft eingestufte Nachricht ist verloren,
// eine faelschlich als voruebergehend eingestufte kostet nur vier
// weitere Versuche.
// ═══════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest'
import { klassifiziereFehler, istDauerhaft } from '@/lib/notifications/fehlerklassen'

describe('voruebergehend — es wird wiederholt', () => {
  const faelle: Array<[string, unknown]> = [
    ['429 Rate Limit', { statusCode: 429, message: 'Too many requests' }],
    ['500', { statusCode: 500 }],
    ['502 Bad Gateway', { status: 502, message: 'Bad Gateway' }],
    ['503 Service Unavailable', { statusCode: 503, message: 'Service Unavailable' }],
    ['Zeitueberschreitung', new Error('ETIMEDOUT')],
    ['Verbindungsabbruch', new Error('socket hang up ECONNRESET')],
    ['DNS weg', new Error('getaddrinfo ENOTFOUND api.resend.com')],
    ['abgelehnter Schluessel (401)', { statusCode: 401, message: 'API key is invalid' }],
    ['fehlende Berechtigung (403)', { statusCode: 403 }],
    ['leerer Fehler', null],
    ['unbekannter Text', 'irgendwas ging schief'],
    ['Statuscode im Text', 'Resend error 503 upstream'],
  ]

  for (const [name, fehler] of faelle) {
    it(name, () => {
      expect(klassifiziereFehler(fehler)).toBe('voruebergehend')
      expect(istDauerhaft(fehler)).toBe(false)
    })
  }
})

describe('dauerhaft — sofort ins Dead Letter', () => {
  const faelle: Array<[string, unknown]> = [
    ['400 Validierung', { statusCode: 400, message: 'validation_error' }],
    ['422', { statusCode: 422 }],
    ['ungueltige Adresse', { statusCode: 400, message: 'invalid to email address' }],
    ['Postfach unbekannt', new Error('mailbox not found')],
    ['abgemeldet', 'recipient unsubscribed'],
    ['Sperrliste', 'address is on the suppression list'],
    ['harter Bounce', 'hard bounce'],
    ['Push-Abo abgelaufen', { statusCode: 410, message: 'unsubscribed or expired' }],
    ['WhatsApp-Nummer ungueltig', 'invalid phone number'],
    ['Datensatz weg', { statusCode: 404, message: 'not found' }],
  ]

  for (const [name, fehler] of faelle) {
    it(name, () => {
      expect(klassifiziereFehler(fehler)).toBe('dauerhaft')
      expect(istDauerhaft(fehler)).toBe(true)
    })
  }
})

describe('Vorrang der Regeln', () => {
  it('429 bleibt wiederholbar, auch wenn der Text nach Validierung klingt', () => {
    expect(klassifiziereFehler({ statusCode: 429, message: 'validation_error while rate limited' }))
      .toBe('voruebergehend')
  })

  it('ein 5xx im Objekt schlaegt ein dauerhaftes Textmuster', () => {
    expect(klassifiziereFehler({ statusCode: 503, message: 'invalid to email' }))
      .toBe('voruebergehend')
  })

  it('erfindet keine Klasse aus einem beliebigen Zahlenfeld', () => {
    expect(klassifiziereFehler({ message: 'kaputt', irgendwas: 400 })).toBe('voruebergehend')
  })
})
