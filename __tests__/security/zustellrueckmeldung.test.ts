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
  SICHERHEITSMELDUNG_ART, istEndzustand,
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

// ═══════════════════════════════════════════════════════════════════════
// Endzustand nach dauerhaftem Fehler (Befund 04.09.2026)
// ═══════════════════════════════════════════════════════════════════════
//
// DER FEHLER, DEN DIESE TESTS FESTHALTEN
// Der Erstversand schreibt eine Zeile mit status 'sent'. Ein Bounce hebt
// GENAU DIESE Zeile auf 'failed'. Danach gibt es fuer den Vorgang keine
// 'sent'/'delivered'-Zeile mehr — und beide Sperren des
// Wiederholungswegs fragen genau danach:
//
//   bereitsZugestellt()   zaehlt status IN ('sent','delivered')
//   offeneZustellungen()  waehlt status IN ('queued','failed') und
//                         schliesst nur Vorgaenge mit Erfolgszeile aus
//
// Der Vorgang sah damit wieder „offen" aus und wurde erneut versendet —
// an eine Adresse, von der der Empfangsserver bereits gesagt hat, dass
// es sie nicht gibt. Die Fehlerklassen-Sperre greift dabei NICHT: Resend
// nimmt den neuen Auftrag mit 2xx an, der Versuch gilt als 'versendet'.
//
// Der Riegel ist eine 'skipped'-Zeile mit grund 'dauerhaft_fehlgeschlagen'
// — genau darauf filtert offeneZustellungen() den Vorgang aus.

const KORRELATION = '6a1d3f2e-9c44-4b1a-9f0e-2d7c5b8a1e33'
const NACHRICHT = 'b2c9f0a1-3d5e-4f60-8a72-91c4d6e0f3b5'

/** Wie `fake()`, faengt aber zusaetzlich INSERTs ab (Dead-Letter-Zeile). */
function fakeMitInsert(zeile: Record<string, unknown> | null) {
  const geschrieben: unknown[] = []
  const eingefuegt: Record<string, unknown>[] = []
  const f = erstelleFakeSupabase((a: FakeAufruf) => {
    if (a.tabelle !== 'notification_delivery_log') return { data: null }
    if (a.operation === 'update') {
      geschrieben.push(a.payload)
      return { data: [{ id: 'z1' }] }
    }
    if (a.operation === 'insert') {
      eingefuegt.push(a.payload as Record<string, unknown>)
      return { data: [{ id: 'neu' }] }
    }
    return { data: zeile }
  })
  return { client: f.client as unknown as Client, eingefuegt, geschrieben }
}

const VOLLE_ZEILE = (felder: Record<string, unknown> = {}) => ZEILE({
  channel: 'email',
  correlation_id: KORRELATION,
  notification_id: NACHRICHT,
  attempt_count: 1,
  ...felder,
})

describe('istEndzustand', () => {
  it('ein dauerhafter Bounce ist ein Endzustand', () => {
    expect(istEndzustand('email.bounced', 'Permanent')).toBe(true)
    expect(istEndzustand('email.bounced', 'permanent')).toBe(true)
  })

  it('eine Beschwerde ist ein Endzustand', () => {
    // Nach „als Spam gemeldet" erneut zu senden ist die schlechteste
    // denkbare Reaktion.
    expect(istEndzustand('email.complained', null)).toBe(true)
  })

  it('ein voruebergehender Bounce ist KEIN Endzustand', () => {
    // Postfach voll, Server gerade weg — hier ist die Wiederholung richtig.
    expect(istEndzustand('email.bounced', 'Transient')).toBe(false)
    expect(istEndzustand('email.bounced', null)).toBe(false)
    expect(istEndzustand('email.bounced', 'Undetermined')).toBe(false)
  })

  it('email.failed ist KEIN Endzustand', () => {
    // Ein Providerfehler ist ein Betriebsproblem, kein Empfaengerproblem
    // — dieselbe Begruendung wie bei 401/403 in fehlerklassen.ts.
    expect(istEndzustand('email.failed', null)).toBe(false)
  })
})

describe('Hard Bounce beendet die Wiederholung', () => {
  it('schreibt eine Dead-Letter-Zeile mit grund dauerhaft_fehlgeschlagen', async () => {
    const { client, eingefuegt } = fakeMitInsert(VOLLE_ZEILE({ status: 'sent' }))
    const r = await verarbeiteTransaktionsRueckmeldung(client, {
      providerNachrichtId: PID, ereignis: 'email.bounced',
      zeitpunkt: ZEIT, bounceTyp: 'Permanent',
    })

    expect(r.beendet).toBe(true)
    expect(eingefuegt).toHaveLength(1)
    const zeile = eingefuegt[0]
    expect(zeile.status).toBe('skipped')
    expect(zeile.grund).toBe('dauerhaft_fehlgeschlagen')
    // Ohne correlation_id findet der Dead-Letter-Filter in
    // offeneZustellungen() den Vorgang nicht — die Zeile waere wirkungslos.
    expect(zeile.correlation_id).toBe(KORRELATION)
    expect(zeile.channel).toBe('email')
  })

  it('sagt es auch im Hinweis', async () => {
    const { client } = fakeMitInsert(VOLLE_ZEILE({ status: 'sent' }))
    const r = await verarbeiteTransaktionsRueckmeldung(client, {
      providerNachrichtId: PID, ereignis: 'email.bounced',
      zeitpunkt: ZEIT, bounceTyp: 'Permanent',
    })
    expect(r.hinweis).toMatch(/keine weitere Wiederholung/)
  })

  it('eine Beschwerde beendet ebenfalls', async () => {
    const { client, eingefuegt } = fakeMitInsert(VOLLE_ZEILE({ status: 'sent' }))
    const r = await verarbeiteTransaktionsRueckmeldung(client, {
      providerNachrichtId: PID, ereignis: 'email.complained', zeitpunkt: ZEIT,
    })
    expect(r.beendet).toBe(true)
    expect(eingefuegt[0].grund).toBe('dauerhaft_fehlgeschlagen')
  })
})

describe('Was NICHT beendet werden darf', () => {
  it('ein Soft Bounce bleibt wiederholbar', async () => {
    const { client, eingefuegt } = fakeMitInsert(VOLLE_ZEILE({ status: 'sent' }))
    const r = await verarbeiteTransaktionsRueckmeldung(client, {
      providerNachrichtId: PID, ereignis: 'email.bounced',
      zeitpunkt: ZEIT, bounceTyp: 'Transient',
    })
    expect(r.status).toBe('failed')      // der Bounce steht trotzdem an der Zeile
    expect(r.beendet).toBe(false)
    expect(eingefuegt).toHaveLength(0)
  })

  it('ein Providerfehler bleibt wiederholbar', async () => {
    const { client, eingefuegt } = fakeMitInsert(VOLLE_ZEILE({ status: 'sent' }))
    const r = await verarbeiteTransaktionsRueckmeldung(client, {
      providerNachrichtId: PID, ereignis: 'email.failed', zeitpunkt: ZEIT,
    })
    expect(r.beendet).toBe(false)
    expect(eingefuegt).toHaveLength(0)
  })

  it('eine erfolgreiche Zustellung schreibt keinen Endzustand', async () => {
    const { client, eingefuegt } = fakeMitInsert(VOLLE_ZEILE({ status: 'sent' }))
    const r = await verarbeiteTransaktionsRueckmeldung(client, {
      providerNachrichtId: PID, ereignis: 'email.delivered', zeitpunkt: ZEIT,
    })
    expect(r.beendet).toBe(false)
    expect(eingefuegt).toHaveLength(0)
  })
})

describe('Die Adresse bleibt erreichbar', () => {
  it('der Endzustand sperrt die Adresse NICHT', async () => {
    // Transaktionspost wird nicht gesperrt (siehe Modulkopf): der
    // naechste fachliche Vorgang hat eine eigene correlation_id und geht
    // wieder raus. Beendet wird nur die Wiederholung DIESES Vorgangs —
    // sonst verstummte man gegenueber dem, den man erreichen MUSS.
    const { client, eingefuegt } = fakeMitInsert(VOLLE_ZEILE({ status: 'sent' }))
    await verarbeiteTransaktionsRueckmeldung(client, {
      providerNachrichtId: PID, ereignis: 'email.bounced',
      zeitpunkt: ZEIT, bounceTyp: 'Permanent',
    })
    // Nur die eine Dead-Letter-Zeile, kein Eintrag auf einer Sperrliste.
    expect(eingefuegt).toHaveLength(1)
    expect(eingefuegt[0].status).toBe('skipped')
  })
})
