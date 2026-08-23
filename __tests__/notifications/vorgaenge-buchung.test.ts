// ═══════════════════════════════════════════════════════════════════════
// Buchungsnachrichten: eine Quelle fuer Erstversand und Wiederholung
// ═══════════════════════════════════════════════════════════════════════
//
// Der Nachrichtentext ist aus lib/notifications.ts nach
// lib/notifications/vorgaenge/buchung-inhalt.ts gewandert, damit der
// Wiederholungslauf dieselbe Nachricht bauen kann wie der Erstversand.
// Dieser Test haelt die Texte fest — eine stille Abweichung waere fuer
// den Kunden sichtbar.
// ═══════════════════════════════════════════════════════════════════════

import { describe, it, expect, vi } from 'vitest'

vi.mock('resend', () => ({ Resend: class { emails = { send: async () => ({ data: null, error: null }) } } }))
vi.mock('web-push', () => ({
  default: { setVapidDetails: () => {}, sendNotification: async () => ({ statusCode: 201 }) },
}))

import { baueBuchungsNachricht, BUCHUNGS_ARTEN } from '@/lib/notifications/vorgaenge/buchung-inhalt'
import { registrierteVorgaenge } from '@/lib/notifications/vorgaenge'

const DATEN = {
  bookingId: '00000000-0000-4000-8000-0000000000dd',
  customerName: 'Maria S.',
  angelName: 'Fatima K.',
  service: 'Alltagsbegleitung',
  date: '2026-09-01',
  time: '14:30',
  duration: 3,
  amount: 96.5,
}

describe('Register', () => {
  it('kennt alle drei Buchungsereignisse auf den drei Kanaelen des Erstversands', () => {
    const eintraege = registrierteVorgaenge()
    for (const art of BUCHUNGS_ARTEN) {
      const e = eintraege.find(x => x.art === art)
      expect(e, `Vorgang ${art} ist nicht registriert`).toBeDefined()
      expect(e!.kanaele.sort()).toEqual(['email', 'in_app', 'push'])
    }
  })

  it('registriert whatsapp NICHT — dafuer gibt es keinen Buchungsversand', () => {
    const e = registrierteVorgaenge().find(x => x.art === 'booking-neu')
    expect(e!.kanaele).not.toContain('whatsapp')
  })
})

describe('Nachrichtentexte', () => {
  it('neue Anfrage: Betreff, Titel und Betrag', () => {
    const n = baueBuchungsNachricht('booking-neu', DATEN)
    expect(n.inApp.title).toBe('Neue Buchungsanfrage')
    expect(n.email.subject).toBe('Neue Buchungsanfrage von Maria S.')
    expect(n.email.anredeFallback).toBe('Engel')
    expect(n.inApp.link).toBe('/engel/buchungen')
    expect(n.email.html).toContain('96.50€')
    expect(n.email.html).toContain('01. September 2026')
  })

  it('Zusage: Kundenlink und Versicherungshinweis', () => {
    const n = baueBuchungsNachricht('booking-zusage', DATEN)
    expect(n.inApp.title).toBe('Buchung bestätigt!')
    expect(n.email.subject).toBe('Fatima K. hat Ihre Buchung bestätigt')
    expect(n.inApp.link).toBe(`/kunde/bestaetigt/${DATEN.bookingId}`)
    expect(n.email.html).toContain('Versicherungsschutz aktiv')
  })

  it('Absage mit Grund — und dieselbe Nachricht ohne Grund', () => {
    const mit = baueBuchungsNachricht('booking-absage', DATEN, 'Bin im Urlaub')
    expect(mit.inApp.body).toContain('Grund: Bin im Urlaub')
    expect(mit.email.html).toContain('Begründung: Bin im Urlaub')

    const ohne = baueBuchungsNachricht('booking-absage', DATEN, null)
    expect(ohne.inApp.body).not.toContain('Grund:')
    expect(ohne.email.html).not.toContain('Begründung')
  })

  it('escapt Nutzereingaben im E-Mail-HTML', () => {
    const boese = { ...DATEN, angelName: '<img src=x onerror=alert(1)>' }
    const n = baueBuchungsNachricht('booking-absage', boese, '<script>alert(2)</script>')
    expect(n.email.html).not.toContain('<img')
    expect(n.email.html).not.toContain('<script>')
    expect(n.email.html).toContain('&lt;img')
  })

  it('Web-Push und FCM unterscheiden sich bei der Absage bewusst', () => {
    const n = baueBuchungsNachricht('booking-absage', DATEN)
    expect(n.push.body).toContain('Jetzt anderen Engel finden')
    // FCM hat keinen Aktionsknopf — die Aufforderung waere dort ins Leere gerichtet.
    expect(n.fcm.body).not.toContain('Jetzt anderen Engel finden')
    expect(n.push.actions[0].title).toBe('Anderen Engel finden')
  })

  it('ist deterministisch — zweimal derselbe Text', () => {
    for (const art of BUCHUNGS_ARTEN) {
      expect(JSON.stringify(baueBuchungsNachricht(art, DATEN, 'x')))
        .toBe(JSON.stringify(baueBuchungsNachricht(art, DATEN, 'x')))
    }
  })
})
