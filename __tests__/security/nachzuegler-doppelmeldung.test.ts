/**
 * Nachzuegler — eine Anmeldung, EINE Meldung
 *
 * BEFUND 31.08.2026, live gemessen: jede Anmeldung erzeugt zwei Zeilen.
 * Zuerst der Trigger auf auth.users (platform 'server'), drei bis fuenf
 * Sekunden spaeter die Anmelderoute (platform 'web'):
 *
 *   07:50:26  login_success  server  herkunft=auth.users.last_sign_in_at
 *   07:50:29  login_success  web     geraet_hash=bd89aa76…
 *
 * Die Route meldet sofort, der Nachzuegler die Trigger-Zeile hinterher —
 * zwei Mails zu EINER Anmeldung. Die bestehenden Riegel vergleichen
 * Kennungen und erkennen deshalb nicht, dass beide Zeilen dasselbe
 * Ereignis in der Welt beschreiben.
 *
 * Bei einem ueberwachten Konto mit ohne_sperrfrist=true greift auch die
 * 12-Stunden-Bremse nicht — also genau bei der Einstellung, fuer die man
 * die Ueberwachung ueberhaupt einschaltet.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const gemeldet = vi.fn()

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/security/benachrichtigung', async () => {
  const echt = await vi.importActual<typeof import('@/lib/security/benachrichtigung')>(
    '@/lib/security/benachrichtigung',
  )
  return {
    ...echt,
    meldeSicherheitsereignis: (...args: unknown[]) => {
      gemeldet(...args)
      return Promise.resolve({ gesendet: true, grund: 'Test', empfaenger: ['x@y.de'] })
    },
  }
})

const { sendeOffeneSicherheitsmeldungen, DOPPELFENSTER_SEKUNDEN } =
  await import('@/lib/security/nachzuegler')
const { erstelleFakeSupabase } = await import('../helpers/supabase-fake')

const KONTO = '5fa1df42-8eb5-416b-abb5-0c85a057e957'
const T = (versatzSekunden: number) =>
  new Date(Date.now() + versatzSekunden * 1000).toISOString()

const TRIGGERZEILE = (felder: Record<string, unknown> = {}) => ({
  id: 'trigger-1',
  user_id: KONTO,
  user_email: 'jemand@example.de',
  organization_id: '00000000-0000-4000-8000-000460629986',
  event_type: 'login_success',
  severity: 'info',
  created_at: T(-60),
  ip_address: null,
  user_agent: null,
  platform: 'server',
  device_info: { quelle: 'db_trigger' },
  app_version: null,
  session_reference: null,
  metadata: { herkunft: 'auth.users.last_sign_in_at' },
  ...felder,
})

/**
 * @param anwendungsZeilen  was die ANWENDUNG (nicht der Trigger) im
 *                          Fenster geschrieben hat
 */
function fake(trigger: unknown[], anwendungsZeilen: unknown[]) {
  let auditAufruf = 0
  return erstelleFakeSupabase((a) => {
    if (a.tabelle === 'notification_delivery_log') return { data: [] }
    if (a.tabelle !== 'security_audit_log') return { data: [] }
    auditAufruf++
    // 1: Trigger-Zeilen · 2: Versandnachweise · 3: Anwendungs-Zeilen
    if (auditAufruf === 1) return { data: trigger }
    if (auditAufruf === 2) return { data: [] }
    return { data: anwendungsZeilen }
  }).client as never
}

beforeEach(() => gemeldet.mockClear())

describe('Riegel c — dieselbe Anmeldung wird nur einmal gemeldet', () => {
  it('die Trigger-Zeile faellt weg, wenn die Anwendung dieselbe Anmeldung schrieb', async () => {
    const r = await sendeOffeneSicherheitsmeldungen(fake(
      [TRIGGERZEILE()],
      [{ user_id: KONTO, event_type: 'login_success', created_at: T(-57) }],
    ))

    expect(r.doppelt).toBe(1)
    expect(r.gemeldet).toBe(0)
    expect(gemeldet).not.toHaveBeenCalled()
  })

  it('ohne Anwendungszeile wird weiterhin gemeldet — Magic-Link, App, OAuth', async () => {
    // Genau die Faelle, fuer die dieser Lauf existiert. Sie duerfen NICHT
    // wegfallen, sonst verschluckt der Riegel echte Meldungen.
    const r = await sendeOffeneSicherheitsmeldungen(fake([TRIGGERZEILE()], []))

    expect(r.doppelt).toBe(0)
    expect(r.gemeldet).toBe(1)
    expect(gemeldet).toHaveBeenCalledTimes(1)
  })

  it('eine Anwendungszeile zu einem ANDEREN Ereignistyp zaehlt nicht als Partner', async () => {
    const r = await sendeOffeneSicherheitsmeldungen(fake(
      [TRIGGERZEILE()],
      [{ user_id: KONTO, event_type: 'logout', created_at: T(-57) }],
    ))
    expect(r.gemeldet).toBe(1)
  })

  it('eine Anwendungszeile zu einem ANDEREN Konto zaehlt nicht als Partner', async () => {
    const r = await sendeOffeneSicherheitsmeldungen(fake(
      [TRIGGERZEILE()],
      [{ user_id: 'ffffffff-9999-4999-8999-999999999999', event_type: 'login_success', created_at: T(-57) }],
    ))
    expect(r.gemeldet).toBe(1)
  })

  it('eine Anwendungszeile weit ausserhalb des Fensters zaehlt nicht als Partner', async () => {
    // Eine echte zweite Anmeldung Stunden spaeter ist eine eigene
    // Meldung — sie darf die erste nicht stumm schalten.
    const r = await sendeOffeneSicherheitsmeldungen(fake(
      [TRIGGERZEILE({ created_at: T(-60) })],
      [{ user_id: KONTO, event_type: 'login_success', created_at: T(-60 - DOPPELFENSTER_SEKUNDEN - 60) }],
    ))
    expect(r.doppelt).toBe(0)
    expect(r.gemeldet).toBe(1)
  })

  it('das Fenster gilt in BEIDE Richtungen — die Anwendung kann auch frueher schreiben', async () => {
    // Gemessen wurde Trigger zuerst; verlassen darf man sich darauf
    // nicht. Ein Reihenfolgewechsel duerfte die Doppelmeldung nicht
    // zurueckbringen.
    const r = await sendeOffeneSicherheitsmeldungen(fake(
      [TRIGGERZEILE({ created_at: T(-60) })],
      [{ user_id: KONTO, event_type: 'login_success', created_at: T(-63) }],
    ))
    expect(r.doppelt).toBe(1)
    expect(r.gemeldet).toBe(0)
  })

  it('das Fenster ist grosszuegig gegenueber den gemessenen Sekunden', () => {
    // Gemessen: 3 Sekunden. Das Fenster muss einen langsamen
    // Trigger-Lauf abdecken, ohne eine echte zweite Anmeldung zu
    // verschlucken.
    expect(DOPPELFENSTER_SEKUNDEN).toBeGreaterThanOrEqual(60)
    expect(DOPPELFENSTER_SEKUNDEN).toBeLessThanOrEqual(900)
  })
})
