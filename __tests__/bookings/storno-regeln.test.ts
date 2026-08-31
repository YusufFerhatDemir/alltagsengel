/**
 * Tests fuer die Storno-Regeln einer Buchung.
 * @see lib/bookings/storno.ts
 *
 * BEFUND, den diese Suite absichert: der Storno war vollstaendig
 * vorgesehen (DB-Trigger erlaubt ihn, die Oberflaeche beschriftet ihn) und
 * an keiner Stelle angeschlossen. Beim Anschliessen ist die Kette die
 * eigentliche Schwierigkeit — eine angenommene Buchung haengt an einem
 * Einsatz und einem Leistungsnachweis. Wer nur den Buchungsstatus setzt,
 * schickt den Engel zu einem abgesagten Termin und laesst einen
 * abrechenbaren Entwurf stehen.
 */
import { describe, it, expect } from 'vitest'
import { UserFacingError } from '@/lib/api/user-facing-error'
import {
  assertBuchungStornierbar,
  darfStornieren,
  rolleAusBuchung,
  STORNIERBARE_BUCHUNGSSTATUS,
  ABSAGBARE_EINSATZSTATUS,
  ANGEFANGENE_EINSATZSTATUS,
} from '@/lib/bookings/storno'

const KUNDE = '11111111-1111-4111-8111-111111111111'
const ENGEL = '22222222-2222-4222-8222-222222222222'
const FREMD = '33333333-3333-4333-8333-333333333333'
const BUCHUNG = { customer_id: KUNDE, angel_id: ENGEL }

function fehlerVon(fn: () => void): UserFacingError | null {
  try { fn(); return null } catch (e) { return e as UserFacingError }
}

describe('Buchungsstatus', () => {
  it('erlaubt dem Kunden den Storno aus pending und accepted', () => {
    // Genau die beiden Uebergaenge, die enforce_booking_status_transition
    // dem Kunden zugesteht.
    for (const status of STORNIERBARE_BUCHUNGSSTATUS) {
      expect(() => assertBuchungStornierbar({ buchungsStatus: status }, 'kunde')).not.toThrow()
    }
  })

  it('lehnt einen zweiten Storno ab, statt ihn stumm zu wiederholen', () => {
    const f = fehlerVon(() => assertBuchungStornierbar({ buchungsStatus: 'cancelled' }, 'kunde'))
    expect(f?.status).toBe(409)
    expect(f?.message).toContain('bereits storniert')
  })

  it('lehnt den Storno eines abgeschlossenen Termins ab', () => {
    const f = fehlerVon(() => assertBuchungStornierbar({ buchungsStatus: 'completed' }, 'kunde'))
    expect(f?.status).toBe(409)
    expect(f?.message).toContain('abgeschlossen')
  })

  it('lehnt den Storno einer abgelehnten Anfrage ab', () => {
    const f = fehlerVon(() => assertBuchungStornierbar({ buchungsStatus: 'declined' }, 'kunde'))
    expect(f?.status).toBe(409)
  })

  it('verweist den Engel bei einer offenen Anfrage auf das Ablehnen', () => {
    // Sonst gaebe es zwei Wege in zwei Zustaende fuer dieselbe Handlung —
    // und die Absage-Nachricht an den Kunden haengt am Ablehnen-Weg.
    const f = fehlerVon(() => assertBuchungStornierbar({ buchungsStatus: 'pending' }, 'engel'))
    expect(f?.status).toBe(409)
    expect(f?.message).toContain('abgelehnt')
  })

  it('laesst den Engel eine angenommene Buchung stornieren', () => {
    expect(() => assertBuchungStornierbar({ buchungsStatus: 'accepted' }, 'engel')).not.toThrow()
  })

  it('behandelt einen leeren Status nicht als stornierbar', () => {
    expect(() => assertBuchungStornierbar({ buchungsStatus: null }, 'kunde')).toThrow()
    expect(() => assertBuchungStornierbar({ buchungsStatus: '' }, 'admin')).toThrow()
  })
})

describe('Einsatz in der Kette', () => {
  it('laesst einen geplanten Einsatz absagen', () => {
    for (const status of ABSAGBARE_EINSATZSTATUS) {
      expect(() =>
        assertBuchungStornierbar({ buchungsStatus: 'accepted', einsatzStatus: status }, 'kunde'),
      ).not.toThrow()
    }
  })

  it('lehnt den Storno ab, sobald der Einsatz begonnen hat', () => {
    // Der wichtigste Fall: es wurde bereits gearbeitet. Ein Storno wuerde
    // geleistete Zeit aus der Abrechnung nehmen.
    for (const status of ANGEFANGENE_EINSATZSTATUS) {
      const f = fehlerVon(() =>
        assertBuchungStornierbar({ buchungsStatus: 'accepted', einsatzStatus: status }, 'kunde'),
      )
      expect(f, `Status ${status} muesste blocken`).not.toBeNull()
      expect(f?.status).toBe(409)
      expect(f?.message).toContain('begonnen')
    }
  })

  it('ist eine Erlaubnisliste — ein unbekannter Einsatzstatus blockt', () => {
    // Sperrliste waere hier falsch herum: ein neu eingefuehrter Zustand
    // rutschte sonst stillschweigend durch einen Weg, an dem Geleistetes
    // zurueckgenommen wird.
    const f = fehlerVon(() =>
      assertBuchungStornierbar({ buchungsStatus: 'accepted', einsatzStatus: 'IRGENDWAS_NEUES' }, 'kunde'),
    )
    expect(f?.status).toBe(409)
    expect(f?.message).toContain('IRGENDWAS_NEUES')
  })

  it('kommt ohne Einsatz aus — eine offene Anfrage hat keine Kette', () => {
    expect(() =>
      assertBuchungStornierbar({ buchungsStatus: 'pending', einsatzStatus: null }, 'kunde'),
    ).not.toThrow()
  })
})

describe('Leistungsnachweis in der Kette', () => {
  it('laesst einen offenen Entwurf stornieren', () => {
    expect(() =>
      assertBuchungStornierbar(
        {
          buchungsStatus: 'accepted',
          einsatzStatus: 'GEPLANT',
          nachweis: { status: 'draft', proof_status: 'ENTWURF', billing_status: 'OFFEN' },
        },
        'kunde',
      ),
    ).not.toThrow()
  })

  it('lehnt den Storno ab, wenn der Nachweis auf einer Rechnung steht', () => {
    // Dieselbe Regel wie beim Storno von Hand — geprueft wird, dass der
    // Buchungsweg sie WIRKLICH mitbenutzt und nicht eine eigene Fassung hat.
    const f = fehlerVon(() =>
      assertBuchungStornierbar(
        {
          buchungsStatus: 'accepted',
          einsatzStatus: 'GEPLANT',
          nachweis: { status: 'invoiced', proof_status: 'ABGERECHNET', billing_status: 'ABGERECHNET' },
        },
        'kunde',
      ),
    )
    expect(f?.status).toBe(409)
    expect(f?.message).toMatch(/abgerechnet|Gutschrift/)
  })

  it('lehnt den Storno bei zugeordnetem Abrechnungsstatus ab', () => {
    const f = fehlerVon(() =>
      assertBuchungStornierbar(
        {
          buchungsStatus: 'accepted',
          einsatzStatus: 'GEPLANT',
          nachweis: { status: 'draft', proof_status: 'ENTWURF', billing_status: 'ZUGEORDNET' },
        },
        'kunde',
      ),
    )
    expect(f?.status).toBe(409)
  })

  it('prueft den Nachweis auch dann, wenn Buchung und Einsatz in Ordnung sind', () => {
    // Die Kette entscheidet als Ganzes: ein gruenes Glied macht die
    // anderen nicht gruen.
    const f = fehlerVon(() =>
      assertBuchungStornierbar(
        {
          buchungsStatus: 'accepted',
          einsatzStatus: 'GEPLANT',
          nachweis: { status: 'invoiced' },
        },
        'admin',
      ),
    )
    expect(f).not.toBeNull()
  })
})

describe('Berechtigung', () => {
  it('laesst nur die beiden Beteiligten und Admins stornieren', () => {
    expect(darfStornieren('kunde', BUCHUNG, KUNDE)).toBe(true)
    expect(darfStornieren('engel', BUCHUNG, ENGEL)).toBe(true)
    expect(darfStornieren('admin', BUCHUNG, FREMD)).toBe(true)
    expect(darfStornieren('kunde', BUCHUNG, FREMD)).toBe(false)
    expect(darfStornieren('engel', BUCHUNG, KUNDE)).toBe(false)
  })

  it('gibt einem Unbeteiligten keine Rolle', () => {
    expect(rolleAusBuchung(BUCHUNG, FREMD, false)).toBeNull()
  })

  it('leitet Kunde und Engel aus der Buchung ab', () => {
    expect(rolleAusBuchung(BUCHUNG, KUNDE, false)).toBe('kunde')
    expect(rolleAusBuchung(BUCHUNG, ENGEL, false)).toBe('engel')
  })

  it('laesst Admin gewinnen, auch wenn er zugleich Kunde ist', () => {
    // Sonst scheiterte eine Nachsteuerung daran, dass der Admin zufaellig
    // in der Buchung steht.
    expect(rolleAusBuchung(BUCHUNG, KUNDE, true)).toBe('admin')
  })
})
