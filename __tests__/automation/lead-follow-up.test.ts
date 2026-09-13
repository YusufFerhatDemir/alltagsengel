/**
 * Kette 13 — Lead-Follow-up (24/48/72 h), Meldung nur nach innen.
 * @see lib/automation/lead-follow-up.ts
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createAutomationMock } from './_mock'

// Kein echter Resend-Aufruf aus dem Test — die E-Mail-Seite wird gezählt.
const emailSpy = vi.fn(async (..._a: unknown[]) => true)
vi.mock('@/lib/notifications', async (orig) => {
  const echt = await orig<typeof import('@/lib/notifications')>()
  return { ...echt, sendEmailNotification: (...a: unknown[]) => emailSpy(...a) }
})

import { erinnereAnLeadFollowUps, zaehleLeadFollowUps, LEAD_FOLLOW_UP_ART } from '@/lib/automation/lead-follow-up'

const ORG = 'org-1'
const JETZT = new Date('2026-09-11T05:00:00Z')
const vor = (h: number) => new Date(JETZT.getTime() - h * 3600_000).toISOString()

function mitEmpfaenger(mock: ReturnType<typeof createAutomationMock>) {
  mock.setzeAntwort('organization_members', 'select', [{ user_id: 'u-admin' }])
  // 1. Aufruf: Rollenfilter (rollentraegerDerOrg), 2.: E-Mail-Adressen
  mock.setzeAntwort('profiles', 'select', [{ id: 'u-admin' }])
  mock.setzeAntwort('profiles', 'select', [{ id: 'u-admin', email: 'verwaltung@example.org', first_name: 'V', last_name: null }])
}

describe('zaehleLeadFollowUps', () => {
  it('zählt Warteliste, Bewerbungen und Anfragen getrennt nach der Leiter', async () => {
    const mock = createAutomationMock()
    mock.setzeAntwort('state_waitlist', 'select', [
      { id: 'w1', status: 'neu', created_at: vor(30), updated_at: vor(30) },        // Erinnerung
      { id: 'w2', status: 'neu', created_at: vor(2), updated_at: vor(2) },          // frisch
      { id: 'w3', status: 'kontaktiert', created_at: vor(300), updated_at: vor(100) }, // 2 Tage + 52 h → dringend
    ])
    mock.setzeAntwort('lead_inquiries', 'select', [
      { id: 'b1', status: 'new', created_at: vor(80), updated_at: vor(80), follow_up_date: null, bewerbung_daten: null }, // dringend
      { id: 'b2', status: 'new', created_at: vor(50), updated_at: vor(50), follow_up_date: null, bewerbung_daten: null }, // eskalation
    ])
    mock.setzeAntwort('lead_inquiries', 'select', [
      { id: 'a1', status: 'new', created_at: vor(100), follow_up_date: null, source: 'rueckruf' }, // dringend
    ])

    const r = await zaehleLeadFollowUps(mock.client as any, ORG, JETZT)
    expect(r.warteliste).toEqual({ erinnerung: 1, eskalation: 0, dringend: 1, verschleppt: 0, gesamt: 2 })
    expect(r.bewerbungen).toEqual({ erinnerung: 0, eskalation: 1, dringend: 1, verschleppt: 0, gesamt: 2 })
    expect(r.anfragen).toEqual({ erinnerung: 0, eskalation: 0, dringend: 1, verschleppt: 0, gesamt: 1 })
    expect(r.fehler).toEqual([])
  })

  it('Lesefehler wird gemeldet statt als „nichts offen" verschluckt', async () => {
    const mock = createAutomationMock()
    mock.setzeAntwort('state_waitlist', 'select', null, { message: 'kaputt' })
    const r = await zaehleLeadFollowUps(mock.client as any, ORG, JETZT)
    expect(r.fehler.join()).toContain('state_waitlist')
  })
})

describe('erinnereAnLeadFollowUps', () => {
  let mock: ReturnType<typeof createAutomationMock>
  beforeEach(() => {
    mock = createAutomationMock()
    emailSpy.mockClear()
  })

  it('nichts überfällig → keine Meldung, kein Empfänger-Lookup', async () => {
    mock.setzeAntwort('state_waitlist', 'select', [{ id: 'w', status: 'neu', created_at: vor(1), updated_at: vor(1) }])
    mock.setzeAntwort('lead_inquiries', 'select', [])
    const r = await erinnereAnLeadFollowUps(mock.client as any, ORG, JETZT)
    expect(r.gesamt.gesamt).toBe(0)
    expect(r.benachrichtigt).toBe(0)
    expect(mock.aufrufe.some(a => a.table === 'organization_members')).toBe(false)
    expect(mock.inserts).toHaveLength(0)
  })

  it('Erinnerung (nur 24 h) → In-App-Meldung, KEINE E-Mail', async () => {
    mock.setzeAntwort('state_waitlist', 'select', [{ id: 'w', status: 'neu', created_at: vor(30), updated_at: vor(30) }])
    mock.setzeAntwort('lead_inquiries', 'select', [])
    mitEmpfaenger(mock)
    mock.setzeAntwort('notifications', 'select', [])   // heute noch nicht gemeldet
    mock.setzeAntwort('notifications', 'insert', null)

    const r = await erinnereAnLeadFollowUps(mock.client as any, ORG, JETZT)
    expect(r.benachrichtigt).toBe(1)
    expect(r.perEmail).toBe(0)
    expect(emailSpy).not.toHaveBeenCalled()

    const n = mock.inserts.find(i => i.table === 'notifications')!.payload
    expect(n.user_id).toBe('u-admin')
    expect(n.type).toBe('reminder')
    expect(n.title).toContain('Erinnerung')
    expect(n.link).toBe('/admin/posteingang?ampel=gelb')
    expect(n.data.art).toBe(LEAD_FOLLOW_UP_ART)
    expect(n.data.tag).toBe('2026-09-11')
  })

  it('Dringend (72 h) → In-App UND E-Mail an die Verwaltung, Link auf die dringendste Liste', async () => {
    mock.setzeAntwort('state_waitlist', 'select', [])
    mock.setzeAntwort('lead_inquiries', 'select', [
      { id: 'b', status: 'new', created_at: vor(90), updated_at: vor(90), follow_up_date: null, bewerbung_daten: null },
    ])
    mock.setzeAntwort('lead_inquiries', 'select', [])
    mitEmpfaenger(mock)
    mock.setzeAntwort('notifications', 'select', [])
    mock.setzeAntwort('notifications', 'insert', null)

    const r = await erinnereAnLeadFollowUps(mock.client as any, ORG, JETZT)
    expect(r.gesamt.dringend).toBe(1)
    expect(r.benachrichtigt).toBe(1)
    expect(r.perEmail).toBe(1)
    expect(emailSpy).toHaveBeenCalledTimes(1)
    const [an, , betreff, html] = emailSpy.mock.calls[0] as unknown as [string, string, string, string]
    expect(an).toBe('verwaltung@example.org')
    expect(betreff).toMatch(/^\[Alltagsengel\] Dringend/)
    expect(html).toContain('/admin/posteingang?ampel=rot')
    const n = mock.inserts.find(i => i.table === 'notifications')!.payload
    expect(n.title).toContain('Dringend')
  })

  it('höchstens EINE Meldung je Empfänger und Tag', async () => {
    mock.setzeAntwort('state_waitlist', 'select', [{ id: 'w', status: 'neu', created_at: vor(80), updated_at: vor(80) }])
    mock.setzeAntwort('lead_inquiries', 'select', [])
    mitEmpfaenger(mock)
    mock.setzeAntwort('notifications', 'select', [{ id: 'schon-da' }])

    const r = await erinnereAnLeadFollowUps(mock.client as any, ORG, JETZT)
    expect(r.bereitsHeute).toBe(1)
    expect(r.benachrichtigt).toBe(0)
    expect(mock.inserts).toHaveLength(0)
    expect(emailSpy).not.toHaveBeenCalled()
  })

  it('keine Admins in der Organisation → Fehler statt stiller Erfolg', async () => {
    mock.setzeAntwort('state_waitlist', 'select', [{ id: 'w', status: 'neu', created_at: vor(80), updated_at: vor(80) }])
    mock.setzeAntwort('lead_inquiries', 'select', [])
    mock.setzeAntwort('organization_members', 'select', [])
    const r = await erinnereAnLeadFollowUps(mock.client as any, ORG, JETZT)
    expect(r.benachrichtigt).toBe(0)
    expect(r.fehler.join()).toContain('Keine Empfaenger')
  })
})

// ═══════════════════════════════════════════════════════════════════════
// Funkstille — Kontaktalter neben der Leiter (13.09.2026)
// ═══════════════════════════════════════════════════════════════════════

describe('Funkstille', () => {
  const alt = (tage: number) => new Date(JETZT.getTime() - tage * 86_400_000).toISOString()

  it('zählt Vorgänge ohne Kontakt seit über 30 Tagen quellenübergreifend', async () => {
    const mock = createAutomationMock()
    mock.setzeAntwort('state_waitlist', 'select', [
      { id: 'w1', status: 'neu', created_at: alt(40), updated_at: alt(1) },   // still
      { id: 'w2', status: 'neu', created_at: alt(5), updated_at: alt(5) },    // frisch
    ])
    mock.setzeAntwort('lead_inquiries', 'select', [
      { id: 'b1', status: 'new', created_at: alt(90), updated_at: alt(1), follow_up_date: null, bewerbung_daten: null },
    ])
    mock.setzeAntwort('lead_inquiries', 'select', [
      { id: 'a1', status: 'new', created_at: alt(60), follow_up_date: null, source: 'rueckruf' },
    ])
    const r = await zaehleLeadFollowUps(mock.client as any, ORG, JETZT)
    expect(r.stille).toBe(3)
  })

  it('ein von Hand gesetzter Kontakt macht eine alte Bewerbung wieder still-frei', async () => {
    const mock = createAutomationMock()
    mock.setzeAntwort('state_waitlist', 'select', [])
    mock.setzeAntwort('lead_inquiries', 'select', [
      // 200 Tage alt, aber vor drei Tagen gesprochen.
      { id: 'b1', status: 'contacted', created_at: alt(200), updated_at: alt(1), follow_up_date: null,
        bewerbung_daten: { ats: { letzterKontakt: alt(3) } } },
    ])
    mock.setzeAntwort('lead_inquiries', 'select', [])
    const r = await zaehleLeadFollowUps(mock.client as any, ORG, JETZT)
    expect(r.stille).toBe(0)
  })

  it('`updated_at` macht einen vergessenen Vorgang NICHT wieder jung', async () => {
    // Sonst setzt jeder Trigger-Lauf die Uhr zurück und die Zahl ist wertlos.
    const mock = createAutomationMock()
    mock.setzeAntwort('state_waitlist', 'select', [])
    mock.setzeAntwort('lead_inquiries', 'select', [
      { id: 'b1', status: 'contacted', created_at: alt(90), updated_at: alt(0), follow_up_date: null, bewerbung_daten: null },
    ])
    mock.setzeAntwort('lead_inquiries', 'select', [])
    const r = await zaehleLeadFollowUps(mock.client as any, ORG, JETZT)
    expect(r.stille).toBe(1)
  })

  it('meldet auch dann, wenn die Leiter nichts hat — sonst schweigt die Kette genau hier', async () => {
    const mock = createAutomationMock()
    mitEmpfaenger(mock)
    mock.setzeAntwort('state_waitlist', 'select', [])
    mock.setzeAntwort('lead_inquiries', 'select', [
      // 40 Tage alt, aber Wiedervorlage liegt in der Zukunft: Leiter = keine.
      { id: 'b1', status: 'contacted', created_at: alt(40), updated_at: alt(40),
        follow_up_date: '2026-12-01', bewerbung_daten: null },
    ])
    mock.setzeAntwort('lead_inquiries', 'select', [])
    const r = await erinnereAnLeadFollowUps(mock.client as any, ORG, JETZT)
    expect(r.gesamt.gesamt).toBe(0)
    expect(r.stille).toBe(1)
    expect(r.benachrichtigt).toBeGreaterThan(0)
  })

  it('schweigt, wenn wirklich nichts da ist', async () => {
    const mock = createAutomationMock()
    mitEmpfaenger(mock)
    mock.setzeAntwort('state_waitlist', 'select', [])
    mock.setzeAntwort('lead_inquiries', 'select', [])
    mock.setzeAntwort('lead_inquiries', 'select', [])
    const r = await erinnereAnLeadFollowUps(mock.client as any, ORG, JETZT)
    expect(r.gesamt.gesamt).toBe(0)
    expect(r.stille).toBe(0)
    expect(r.benachrichtigt).toBe(0)
  })
})
