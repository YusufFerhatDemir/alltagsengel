/**
 * Zustellrueckmeldungen fuer Transaktionspost
 *
 * DIE LUECKE DAHINTER
 * app/api/marketing/resend-webhook verwarf jede Rueckmeldung, zu der es
 * keinen Kampagneneintrag fand — und Transaktionspost laeuft nicht ueber
 * email_campaign_logs. Ein Hard Bounce auf eine Sicherheitsmeldung, also
 * genau der Fall „die Warnung hat niemanden erreicht", hinterliess im
 * Bestand nichts: in notification_delivery_log stand weiter `sent`, und
 * `sent` heisst nur „dem Provider uebergeben".
 *
 * Geprueft werden die Stellen, an denen ein Bounce wieder verloren gehen
 * oder faelschlich als Zustellung gelesen werden koennte.
 */

import { describe, it, expect, vi } from 'vitest'
import { erstelleFakeSupabase, hatFilter, type FakeAufruf } from '../helpers/supabase-fake'
import {
  verarbeiteTransaktionsRueckmeldung, istRueckmeldung, fehlertext, RANG,
  SICHERHEITSMELDUNG_ART,
} from '@/lib/notifications/zustellrueckmeldung'

const PID = 'ff275ea7-f382-43c0-a59c-e0c086bbf374'
const ZEIT = '2026-08-31T12:00:00.000Z'

type Client = Parameters<typeof verarbeiteTransaktionsRueckmeldung>[0]

function fake(zeile: Record<string, unknown> | null) {
  const geschrieben: unknown[] = []
  const f = erstelleFakeSupabase((a: FakeAufruf) => {
    if (a.tabelle !== 'notification_delivery_log') return { data: null }
    if (a.operation === 'update') {
      geschrieben.push(a.payload)
      return { data: [{ id: 'z1' }] }
    }
    return { data: zeile }
  })
  return { client: f.client as unknown as Client, aufrufe: f.aufrufe, geschrieben }
}

const ZEILE = (felder: Record<string, unknown> = {}) => ({
  id: 'z1',
  status: 'sent',
  recipient: 'info@alltagsengel.care',
  organization_id: '00000000-0000-4000-8000-000460629986',
  vorgang_art: SICHERHEITSMELDUNG_ART,
  vorgang_ref: 'cf56c43b-ed70-42c7-b8e5-686d4875761e',
  vorgang_empfaenger: '5fa1df42-8eb5-416b-abb5-0c85a057e957',
  ...felder,
})

describe('Rang — failed steht ueber delivered', () => {
  it('ein verspaetetes delivered kann einen Bounce nicht zudecken', () => {
    // Webhooks kommen unsortiert. Ohne diese Ordnung waere die
    // gescheiterte Zustellung nachtraeglich als erfolgreich gelesen
    // worden — die gefaehrlichste Verwechslung im ganzen Modul.
    expect(RANG.failed).toBeGreaterThan(RANG.delivered)
    expect(RANG.delivered).toBeGreaterThan(RANG.sent)
    expect(RANG.sent).toBeGreaterThan(RANG.queued)
  })
})

describe('verarbeiteTransaktionsRueckmeldung', () => {
  it('sucht ueber die Provider-Nachrichten-ID', async () => {
    const { client, aufrufe } = fake(ZEILE())
    await verarbeiteTransaktionsRueckmeldung(client, {
      providerNachrichtId: PID, ereignis: 'email.delivered', zeitpunkt: ZEIT,
    })
    expect(hatFilter(aufrufe[0], 'eq', 'provider_message_id', PID)).toBe(true)
  })

  it('hebt sent auf delivered', async () => {
    const { client, geschrieben } = fake(ZEILE({ status: 'sent' }))
    const r = await verarbeiteTransaktionsRueckmeldung(client, {
      providerNachrichtId: PID, ereignis: 'email.delivered', zeitpunkt: ZEIT,
    })
    expect(r.geaendert).toBe(true)
    expect(r.status).toBe('delivered')
    expect(geschrieben[0]).toEqual({ status: 'delivered' })
  })

  it('ein Hard Bounce setzt failed, failed_at und einen Klartext', async () => {
    const { client, geschrieben } = fake(ZEILE({ status: 'sent' }))
    const r = await verarbeiteTransaktionsRueckmeldung(client, {
      providerNachrichtId: PID, ereignis: 'email.bounced',
      zeitpunkt: ZEIT, bounceTyp: 'Permanent',
    })
    expect(r.status).toBe('failed')
    const f = geschrieben[0] as Record<string, unknown>
    expect(f.status).toBe('failed')
    expect(f.failed_at).toBe(ZEIT)
    expect(String(f.sanitized_error)).toMatch(/dauerhaft abgelehnt/)
  })

  it('ein verspaetetes delivered NACH einem Bounce aendert nichts', async () => {
    const { client, geschrieben } = fake(ZEILE({ status: 'failed' }))
    const r = await verarbeiteTransaktionsRueckmeldung(client, {
      providerNachrichtId: PID, ereignis: 'email.delivered', zeitpunkt: ZEIT,
    })
    expect(r.geaendert).toBe(false)
    expect(r.status).toBe('failed')
    expect(geschrieben).toHaveLength(0)
  })

  it('eine Verzoegerung ist kein Endzustand und aendert nichts', async () => {
    const { client, geschrieben } = fake(ZEILE({ status: 'sent' }))
    const r = await verarbeiteTransaktionsRueckmeldung(client, {
      providerNachrichtId: PID, ereignis: 'email.delivery_delayed', zeitpunkt: ZEIT,
    })
    expect(r.geaendert).toBe(false)
    expect(geschrieben).toHaveLength(0)
  })

  it('ein zweiter Bounce schreibt Zeitpunkt und Grund erneut, auch ohne Statuswechsel', async () => {
    const { client, geschrieben } = fake(ZEILE({ status: 'failed' }))
    const r = await verarbeiteTransaktionsRueckmeldung(client, {
      providerNachrichtId: PID, ereignis: 'email.complained', zeitpunkt: ZEIT,
    })
    expect(r.geaendert).toBe(true)
    const f = geschrieben[0] as Record<string, unknown>
    expect(f.status).toBeUndefined()
    expect(f.failed_at).toBe(ZEIT)
    expect(String(f.sanitized_error)).toMatch(/Spam/)
  })

  it('ohne Treffer wird nichts geschrieben', async () => {
    const { client, geschrieben } = fake(null)
    const r = await verarbeiteTransaktionsRueckmeldung(client, {
      providerNachrichtId: PID, ereignis: 'email.bounced', zeitpunkt: ZEIT,
    })
    expect(r.gefunden).toBe(false)
    expect(geschrieben).toHaveLength(0)
  })
})

describe('Eskalation', () => {
  it('eine gescheiterte SICHERHEITSMELDUNG eskaliert', async () => {
    const { client } = fake(ZEILE({ status: 'sent' }))
    const eskaliere = vi.fn().mockResolvedValue(undefined)
    const r = await verarbeiteTransaktionsRueckmeldung(client, {
      providerNachrichtId: PID, ereignis: 'email.bounced',
      zeitpunkt: ZEIT, bounceTyp: 'Permanent',
    }, eskaliere)

    expect(r.eskaliert).toBe(true)
    expect(eskaliere).toHaveBeenCalledWith(expect.objectContaining({
      empfaenger: 'info@alltagsengel.care',
      ereignisId: 'cf56c43b-ed70-42c7-b8e5-686d4875761e',
      userId: '5fa1df42-8eb5-416b-abb5-0c85a057e957',
    }))
  })

  it('eine ERFOLGREICHE Sicherheitsmeldung eskaliert nicht', async () => {
    const { client } = fake(ZEILE({ status: 'sent' }))
    const eskaliere = vi.fn()
    const r = await verarbeiteTransaktionsRueckmeldung(client, {
      providerNachrichtId: PID, ereignis: 'email.delivered', zeitpunkt: ZEIT,
    }, eskaliere)
    expect(r.eskaliert).toBe(false)
    expect(eskaliere).not.toHaveBeenCalled()
  })

  it('eine gescheiterte RECHNUNG eskaliert nicht als Sicherheitsvorfall', async () => {
    const { client } = fake(ZEILE({ status: 'sent', vorgang_art: 'rechnung' }))
    const eskaliere = vi.fn()
    const r = await verarbeiteTransaktionsRueckmeldung(client, {
      providerNachrichtId: PID, ereignis: 'email.bounced', zeitpunkt: ZEIT,
    }, eskaliere)
    expect(r.geaendert).toBe(true)
    expect(r.eskaliert).toBe(false)
    expect(eskaliere).not.toHaveBeenCalled()
  })

  it('eine gescheiterte Eskalation rollt die Rueckmeldung NICHT zurueck', async () => {
    // Fail-soft: der Bounce ist bereits festgehalten. Ihn wegen eines
    // Folgefehlers zu verwerfen waere der schlechtere Zustand.
    const { client, geschrieben } = fake(ZEILE({ status: 'sent' }))
    const r = await verarbeiteTransaktionsRueckmeldung(client, {
      providerNachrichtId: PID, ereignis: 'email.bounced', zeitpunkt: ZEIT,
    }, async () => { throw new Error('Audit kaputt') })

    expect(r.geaendert).toBe(true)
    expect(r.eskaliert).toBe(false)
    expect(geschrieben).toHaveLength(1)
  })
})

describe('fehlertext — kein Rohtext des Providers', () => {
  it('unterscheidet dauerhaft von voruebergehend', () => {
    expect(fehlertext('email.bounced', 'Permanent')).toMatch(/dauerhaft/)
    expect(fehlertext('email.bounced', 'Transient')).toMatch(/voruebergehend/)
    // Unbekannt gilt als NICHT dauerhaft — im Zweifel die mildere Aussage.
    expect(fehlertext('email.bounced', null)).toMatch(/voruebergehend/)
  })

  it('nennt weder Adresse noch Serverinterna', () => {
    for (const e of ['email.bounced', 'email.complained', 'email.failed'] as const) {
      const t = fehlertext(e, 'Permanent') ?? ''
      expect(t).not.toMatch(/@/)
      expect(t.length).toBeLessThan(120)
    }
  })
})

describe('istRueckmeldung', () => {
  it('kennt die sechs auswertbaren Ereignisse und nichts sonst', () => {
    for (const e of [
      'email.sent', 'email.delivered', 'email.delivery_delayed',
      'email.bounced', 'email.complained', 'email.failed',
    ]) expect(istRueckmeldung(e)).toBe(true)
    // Oeffnen und Klicken sind fuer Transaktionspost ohne Bedeutung und
    // wuerden bei einer Sicherheitsmeldung sogar falsche Schluesse nahelegen.
    for (const e of ['email.opened', 'email.clicked', '', null, 42]) {
      expect(istRueckmeldung(e)).toBe(false)
    }
  })
})
