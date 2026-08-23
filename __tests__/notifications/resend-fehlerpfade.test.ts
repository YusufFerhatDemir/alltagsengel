// ═══════════════════════════════════════════════════════════════════════
// Resend-Fehlerpfade — was passiert, wenn der Provider NICHT mitspielt
// ═══════════════════════════════════════════════════════════════════════
//
// WARUM DIESE SUITE
// __tests__/notifications/resend-integration.test.ts prueft den
// Gutfall und die Absenderregeln. Ungeprueft war der teure Teil: ein
// abgelehnter Schluessel, ein haengender Provider, ein 422 auf eine
// kaputte Adresse, ein 500 waehrend einer Stoerung. Genau dort
// entscheidet sich, ob eine Rechnung faelschlich als „versendet" gilt
// oder ob sie wiederholt wird.
//
// Die Kette laeuft ECHT durch — sendRawEmail, die Zustellspur, die
// Fehlerklassifizierung und versendeRechnungPerEmail. Ersetzt ist nur,
// was aussen liegt: das resend-Paket, der Admin-Client und die
// PDF-Erzeugung. Es geht keine Mail raus.
//
// Deckt die fuenf Szenarien aus dem Auftrag ab:
//   a) ungueltiger Schluessel  → Fehlschlag, NIE 'versendet'
//   b) Zeitueberschreitung     → wiederholbar eingestuft
//   c) 4xx (422)               → dauerhaft ⇒ Dead Letter
//   d) 5xx                     → voruebergehend ⇒ Wiederholung mit Staffel
//   e) Erfolg                  → 'versendet' erst mit Provider-Beleg
// ═══════════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── Attrappen ─────────────────────────────────────────────────────────
const H = vi.hoisted(() => ({
  gesendet: [] as Array<{ payload: Record<string, unknown>; optionen: unknown }>,
  /** Antwort des naechsten send(); Funktion ⇒ darf werfen oder haengen. */
  antwort: null as unknown,
  /** Zeilen in notification_delivery_log. */
  spur: [] as Array<Record<string, unknown>>,
}))

vi.mock('resend', () => ({
  Resend: class {
    emails = {
      send: async (payload: Record<string, unknown>, optionen?: unknown) => {
        H.gesendet.push({ payload, optionen })
        if (typeof H.antwort === 'function') return (H.antwort as () => unknown)()
        return H.antwort as { data: { id: string } | null; error: unknown }
      },
    }
  },
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from() {
      return {
        select: () => {
          const kette: Record<string, unknown> = {}
          kette.eq = () => kette
          kette.in = () => kette
          kette.order = () => kette
          kette.limit = () => kette
          kette.then = (auf: (w: unknown) => unknown) =>
            Promise.resolve({ data: [], count: 0, error: null }).then(auf)
          return kette
        },
        insert: async (zeile: Record<string, unknown>) => {
          H.spur.push(zeile)
          return { error: null }
        },
      }
    },
  }),
}))

vi.mock('@/lib/pdf/rechnung-paket', () => ({
  erzeugeRechnungsPaket: async () => ({
    pdfBytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
    pageCount: 2,
    checksum: 'pruefsumme',
    pdfUrl: 'https://storage.example/inv.pdf',
    storagePath: 'invoice-packages/x.pdf',
    invoiceNumber: 'RE-2026-00042',
    belegart: 'Rechnung',
    clientName: 'Erika Mustermann',
  }),
  RechnungsPaketError: class extends Error {},
}))

import { sendRawEmail } from '@/lib/notifications'
import { istDauerhaft, klassifiziereFehler, PROVIDER_OHNE_ID } from '@/lib/notifications/fehlerklassen'
import { wartezeitMinuten, MAX_VERSUCHE } from '@/lib/notifications/retry'
import { holeWiederhersteller } from '@/lib/notifications/wiederherstellung'
import { versendeRechnungPerEmail, RECHNUNG_VERSAND_ART } from '@/lib/billing/versand/rechnung-versand'
// Nebenwirkungs-Import: fuellt das Vorgangsregister (Buchung + Rechnung).
import '@/lib/notifications/vorgaenge'

const ORG = '00000000-0000-4000-8000-0000000000aa'
const INV = '00000000-0000-4000-8000-0000000000cc'
const ACTOR = '00000000-0000-4000-8000-0000000000bb'
const spur = { organizationId: ORG, correlationId: INV }

const urspruenglicherKey = process.env.RESEND_API_KEY

beforeEach(() => {
  H.gesendet.length = 0
  H.spur.length = 0
  H.antwort = { data: { id: 'resend-msg-1' }, error: null }
  process.env.RESEND_API_KEY = 're_TESTSCHLUESSEL_ohne_Funktion'
})

afterEach(() => {
  vi.useRealTimers()
  if (urspruenglicherKey === undefined) delete process.env.RESEND_API_KEY
  else process.env.RESEND_API_KEY = urspruenglicherKey
})

/** Fehlerantwort in der Form, die das Resend-SDK tatsaechlich liefert. */
function providerFehler(statusCode: number | null, name: string, message: string) {
  return { data: null, error: { statusCode, name, message } }
}

// ───────────────────────────────────────────────────────────────────────
// Rechnungs-Stub — nur so viel Datenbank, wie der Versandweg anfasst
// ───────────────────────────────────────────────────────────────────────

function rechnungsStub() {
  const protokoll = {
    invoiceUpdates: [] as Record<string, unknown>[],
    logInserts: [] as Record<string, unknown>[],
    auditInserts: [] as Record<string, unknown>[],
  }
  const invoice = {
    id: INV,
    invoice_number: 'RE-2026-00042',
    invoice_number_formatted: 'RE-2026-00042',
    status: 'freigegeben',
    correction_type: null,
    total_amount: 105,
    period_start: '2026-07-01',
    period_end: '2026-07-31',
    due_date: '2026-08-14',
    sent_at: null,
    frozen_at: '2026-07-31T10:00:00Z',
    deleted_at: null,
    client: { first_name: 'Erika', last_name: 'Mustermann', email: 'erika@example.org' },
  }

  const stub = {
    from(tabelle: string) {
      if (tabelle === 'invoices') {
        return {
          select: () => ({
            eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: invoice, error: null }) }) }),
          }),
          update: (werte: Record<string, unknown>) => {
            protokoll.invoiceUpdates.push(werte)
            return { eq: () => ({ eq: async () => ({ error: null }) }) }
          },
        } as never
      }
      if (tabelle === 'organizations') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { name: 'Alltagsengel UG (haftungsbeschränkt)', iban: 'DE02120300000000202051', bic: 'BYLADEM1001', bank_name: 'Sparkasse' },
                error: null,
              }),
            }),
          }),
        } as never
      }
      if (tabelle === 'invoice_email_log') {
        return {
          select: () => ({ eq: async () => ({ count: protokoll.logInserts.length, error: null }) }),
          insert: async (werte: Record<string, unknown>) => {
            protokoll.logInserts.push(werte)
            return { error: null }
          },
        } as never
      }
      if (tabelle === 'billing_audit_trail') {
        return {
          insert: async (werte: Record<string, unknown>) => {
            protokoll.auditInserts.push(werte)
            return { error: null }
          },
        } as never
      }
      throw new Error(`Unerwartete Tabelle im Stub: ${tabelle}`)
    },
  }
  return { stub: stub as never, protokoll }
}

const versende = () =>
  versendeRechnungPerEmail(rechnungsStub().stub, {
    invoiceId: INV, organizationId: ORG, actorId: ACTOR,
  })

/** Wie versende(), liefert aber auch das Stub-Protokoll zurueck. */
function versendeMitProtokoll() {
  const { stub, protokoll } = rechnungsStub()
  return versendeRechnungPerEmail(stub, {
    invoiceId: INV, organizationId: ORG, actorId: ACTOR,
  }).then(ergebnis => ({ ergebnis, protokoll }))
}

// ═══════════════════════════════════════════════════════════════════════
// a) Ungueltiger Schluessel
// ═══════════════════════════════════════════════════════════════════════
describe('a) Resend lehnt den Schluessel ab (401)', () => {
  beforeEach(() => {
    H.antwort = providerFehler(401, 'invalid_api_key', 'API key is invalid')
  })

  it('meldet Fehlschlag — nicht "uebersprungen" und nicht Erfolg', async () => {
    const e = await sendRawEmail({ to: 'a@b.de', subject: 'S', html: '<p>x</p>', zustellung: spur })
    expect(e.ok).toBe(false)
    expect(e.ok === false && e.uebersprungen).toBe(false)
    expect(e.ok === false && e.statusCode).toBe(401)
  })

  it('schreibt die Zustellspur als failed, nicht als sent', async () => {
    await sendRawEmail({ to: 'a@b.de', subject: 'S', html: '<p>x</p>', zustellung: spur })
    expect(H.spur).toHaveLength(1)
    expect(H.spur[0].status).toBe('failed')
    expect(H.spur[0].delivered_at).toBeNull()
    expect(H.spur[0].provider_message_id).toBeNull()
  })

  it('gilt als voruebergehend — nach dem Nachziehen des Schluessels wird zugestellt', async () => {
    const e = await sendRawEmail({ to: 'a@b.de', subject: 'S', html: '<p>x</p>' })
    // Der rohe Provider-Fehler traegt den Statuscode; genau darauf
    // stuetzt sich die Einstufung.
    expect(klassifiziereFehler(e.ok === false && e.fehler)).toBe('voruebergehend')
  })

  it('setzt weder sent_at noch invoice_email_log auf "versendet"', async () => {
    const { ergebnis, protokoll } = await versendeMitProtokoll()
    expect(ergebnis.status).toBe('fehlgeschlagen')
    expect(protokoll.invoiceUpdates).toHaveLength(0)
    expect(protokoll.logInserts.map(z => z.status)).toEqual(['fehlgeschlagen'])
    expect(protokoll.logInserts[0].versendet_am).toBeNull()
    expect(protokoll.logInserts[0].provider_message_id).toBeNull()
  })

  it('traegt den Schluessel nicht in den Fehlertext der Zustellspur', async () => {
    H.antwort = providerFehler(401, 'invalid_api_key', 'API key re_LEBENDIGES_GEHEIMNIS_1234 is invalid')
    await sendRawEmail({ to: 'a@b.de', subject: 'S', html: '<p>x</p>', zustellung: spur })
    expect(String(H.spur[0].sanitized_error)).not.toContain('LEBENDIGES_GEHEIMNIS')
  })
})

// ═══════════════════════════════════════════════════════════════════════
// b) Zeitueberschreitung
// ═══════════════════════════════════════════════════════════════════════
describe('b) Resend antwortet nicht', () => {
  it('bricht ab, statt bis zum Abraeumen der Funktion zu haengen', async () => {
    vi.useFakeTimers()
    // Ein Aufruf, der nie zurueckkommt.
    H.antwort = () => new Promise(() => {})

    const lauf = sendRawEmail({ to: 'a@b.de', subject: 'S', html: '<p>x</p>', zustellung: spur })
    await vi.advanceTimersByTimeAsync(20_000)
    const e = await lauf

    expect(e.ok).toBe(false)
    expect(e.ok === false && e.uebersprungen).toBe(false)
    expect(e.ok === false && e.statusCode).toBe(408)
    expect(e.ok === false && e.grund).toMatch(/Zeitüberschreitung/)
  })

  it('wird als voruebergehend eingestuft — der Wiederholungslauf greift', async () => {
    vi.useFakeTimers()
    H.antwort = () => new Promise(() => {})
    const lauf = sendRawEmail({ to: 'a@b.de', subject: 'S', html: '<p>x</p>' })
    await vi.advanceTimersByTimeAsync(20_000)
    const e = await lauf
    expect(istDauerhaft(e.ok === false && e.fehler)).toBe(false)
  })

  it('protokolliert den Abbruch als Fehlversuch', async () => {
    vi.useFakeTimers()
    H.antwort = () => new Promise(() => {})
    const lauf = sendRawEmail({ to: 'a@b.de', subject: 'S', html: '<p>x</p>', zustellung: spur })
    await vi.advanceTimersByTimeAsync(20_000)
    await lauf
    expect(H.spur).toHaveLength(1)
    expect(H.spur[0].status).toBe('failed')
    expect(String(H.spur[0].sanitized_error)).toMatch(/Zeitüberschreitung/)
  })

  it('gibt Resend einen Idempotenzschluessel mit — die Wiederholung darf nicht doppelt zustellen', async () => {
    await sendRawEmail({
      to: 'a@b.de', subject: 'S', html: '<p>x</p>',
      idempotenzSchluessel: 'rechnung:abc',
    })
    expect(H.gesendet[0].optionen).toEqual({ idempotencyKey: 'rechnung:abc' })
  })

  it('der Rechnungsversand setzt diesen Schluessel selbst', async () => {
    await versende()
    expect(H.gesendet[0].optionen).toEqual({ idempotencyKey: `rechnung:${INV}` })
  })
})

// ═══════════════════════════════════════════════════════════════════════
// c) 4xx
// ═══════════════════════════════════════════════════════════════════════
describe('c) Resend weist die Nachricht ab (4xx)', () => {
  it('422 gilt als dauerhaft — sofort Dead Letter statt fuenf Stunden Warten', async () => {
    H.antwort = providerFehler(422, 'validation_error', 'Invalid `to` field. Not a deliverable address.')
    const e = await sendRawEmail({ to: 'kaputt@', subject: 'S', html: '<p>x</p>' })
    expect(e.ok).toBe(false)
    expect(e.ok === false && e.statusCode).toBe(422)
    expect(istDauerhaft(e.ok === false && e.fehler)).toBe(true)
  })

  it('ohne den Statuscode waere derselbe Fall als voruebergehend durchgegangen', () => {
    // Regressionsschutz: genau das war der Befund. Reicht der Aufrufer
    // nur den Meldungstext weiter, verliert die Einstufung den 422.
    expect(klassifiziereFehler('Invalid `to` field. Not a deliverable address.')).toBe('voruebergehend')
    expect(klassifiziereFehler({ statusCode: 422, message: 'Invalid `to` field.' })).toBe('dauerhaft')
  })

  it('429 bleibt voruebergehend — ein Ratelimit geht vorbei', async () => {
    H.antwort = providerFehler(429, 'rate_limit_exceeded', 'Too many requests')
    const e = await sendRawEmail({ to: 'a@b.de', subject: 'S', html: '<p>x</p>' })
    expect(istDauerhaft(e.ok === false && e.fehler)).toBe(false)
  })

  it('setzt auch bei 4xx kein sent_at', async () => {
    H.antwort = providerFehler(422, 'validation_error', 'Invalid `to` field.')
    const { ergebnis, protokoll } = await versendeMitProtokoll()
    expect(ergebnis.status).toBe('fehlgeschlagen')
    expect(protokoll.invoiceUpdates).toHaveLength(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// d) 5xx
// ═══════════════════════════════════════════════════════════════════════
describe('d) Resend hat eine Stoerung (5xx)', () => {
  it('500 ist voruebergehend', async () => {
    H.antwort = providerFehler(500, 'application_error', 'Internal server error.')
    const e = await sendRawEmail({ to: 'a@b.de', subject: 'S', html: '<p>x</p>' })
    expect(klassifiziereFehler(e.ok === false && e.fehler)).toBe('voruebergehend')
  })

  it('ein Netzausfall ebenso — das SDK meldet ihn ohne Statuscode', async () => {
    // So sieht es aus, wenn fetch scheitert: das SDK wirft nicht, es
    // liefert einen Fehler mit statusCode null.
    H.antwort = providerFehler(null, 'application_error', 'Unable to fetch data. The request could not be resolved.')
    const e = await sendRawEmail({ to: 'a@b.de', subject: 'S', html: '<p>x</p>' })
    expect(e.ok).toBe(false)
    expect(klassifiziereFehler(e.ok === false && e.fehler)).toBe('voruebergehend')
  })

  it('die Wartezeit waechst exponentiell und deckelt bei 240 Minuten', () => {
    expect([1, 2, 3, 4, 5, 6].map(wartezeitMinuten)).toEqual([1, 5, 15, 60, 240, 240])
    expect(wartezeitMinuten(0)).toBe(0)
    // Vier Wartezeiten liegen zwischen den fuenf Versuchen: 1 + 5 + 15
    // + 60 = 81 Minuten. Erst der fuenfte Fehlversuch schliesst ab.
    const bisDeadLetter = [1, 2, 3, 4].map(wartezeitMinuten).reduce((a, b) => a + b, 0)
    expect(MAX_VERSUCHE).toBe(5)
    expect(bisDeadLetter).toBe(81)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// e) Erfolg
// ═══════════════════════════════════════════════════════════════════════
describe('e) Erfolg gilt erst mit Provider-Beleg', () => {
  it('setzt sent_at und "versendet" mit der Nachrichten-ID', async () => {
    H.antwort = { data: { id: 'resend-msg-42' }, error: null }
    const { ergebnis, protokoll } = await versendeMitProtokoll()
    expect(ergebnis.status).toBe('versendet')
    expect(protokoll.invoiceUpdates[0]).toMatchObject({ versand_elektronisch: true })
    expect(protokoll.invoiceUpdates[0].sent_at).toBeTruthy()
    expect(protokoll.logInserts[0]).toMatchObject({
      status: 'versendet',
      provider_message_id: 'resend-msg-42',
    })
  })

  it('eine Antwort OHNE Nachrichten-ID ist kein Erfolg', async () => {
    // Der Beleg ist die ID. Fehlt sie, waere 'versendet' eine
    // Behauptung — und sent_at wuerde die Rechnung fuer immer
    // stillstellen.
    H.antwort = { data: null, error: null }
    const { ergebnis, protokoll } = await versendeMitProtokoll()
    expect(ergebnis.status).toBe('fehlgeschlagen')
    expect(ergebnis.grund).toBe(PROVIDER_OHNE_ID)
    expect(protokoll.invoiceUpdates).toHaveLength(0)
    expect(protokoll.logInserts[0].status).toBe('fehlgeschlagen')
  })

  it('und wird dauerhaft eingestuft — keine zweite Mail auf Verdacht', async () => {
    H.antwort = { data: null, error: null }
    const e = await sendRawEmail({ to: 'a@b.de', subject: 'S', html: '<p>x</p>' })
    expect(istDauerhaft(e.ok === false && e.fehler)).toBe(true)
  })

  it('die Zustellspur traegt sent samt Provider-ID', async () => {
    H.antwort = { data: { id: 'resend-msg-7' }, error: null }
    await sendRawEmail({ to: 'a@b.de', subject: 'S', html: '<p>x</p>', zustellung: spur })
    expect(H.spur[0]).toMatchObject({ status: 'sent', provider_message_id: 'resend-msg-7' })
  })
})

// ═══════════════════════════════════════════════════════════════════════
// Wiederherstellbarkeit — der eigentliche Befund
// ═══════════════════════════════════════════════════════════════════════
describe('Eine gescheiterte Rechnungsmail ist wiederholbar', () => {
  it('das Vorgangsregister kennt den Rechnungsversand auf dem E-Mail-Kanal', () => {
    expect(holeWiederhersteller(RECHNUNG_VERSAND_ART, 'email')).toBeTypeOf('function')
    // Eine Rechnung geht nur per Mail raus — In-App und Push kennen den
    // Vorgang nicht.
    expect(holeWiederhersteller(RECHNUNG_VERSAND_ART, 'in_app')).toBeNull()
    expect(holeWiederhersteller(RECHNUNG_VERSAND_ART, 'push')).toBeNull()
  })

  it('die Protokollzeile traegt den Vorgangsbezug, sonst faende der Lauf nichts', async () => {
    H.antwort = providerFehler(500, 'application_error', 'Internal server error.')
    await versende()
    const zeile = H.spur.find(z => z.channel === 'email')
    expect(zeile).toBeDefined()
    expect(zeile!.vorgang_art).toBe(RECHNUNG_VERSAND_ART)
    expect(zeile!.vorgang_ref).toBe(INV)
    expect(zeile!.correlation_id).toBe(INV)
  })

  it('ohne Vorgangsart gibt es keinen Wiederhersteller — der Fall vor dem Fix', () => {
    expect(holeWiederhersteller(null, 'email')).toBeNull()
    expect(holeWiederhersteller('gibt-es-nicht', 'email')).toBeNull()
  })

  it('der Wiederholungslauf protokolliert nicht doppelt', async () => {
    // sendeIdempotent() schreibt die Zeile; wuerde der Versandweg
    // zusaetzlich protokollieren, waere die Versuchsobergrenze nach der
    // Haelfte erreicht.
    H.antwort = { data: { id: 'resend-msg-9' }, error: null }
    const { stub } = rechnungsStub()
    await versendeRechnungPerEmail(stub, {
      invoiceId: INV, organizationId: ORG, actorId: ACTOR, ohneZustellspur: true,
    })
    expect(H.spur).toHaveLength(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// Ohne Schluessel
// ═══════════════════════════════════════════════════════════════════════
describe('Kein RESEND_API_KEY', () => {
  beforeEach(() => {
    delete process.env.RESEND_API_KEY
  })

  it('ist "uebersprungen", nicht "fehlgeschlagen" — der Versuch darf nicht zaehlen', async () => {
    const e = await sendRawEmail({ to: 'a@b.de', subject: 'S', html: '<p>x</p>', zustellung: spur })
    expect(e.ok).toBe(false)
    expect(e.ok === false && e.uebersprungen).toBe(true)
    expect(H.spur[0].status).toBe('skipped')
    expect(H.gesendet).toHaveLength(0)
  })

  it('laesst die Rechnung unzugestellt, damit sie spaeter nachgeht', async () => {
    const { ergebnis, protokoll } = await versendeMitProtokoll()
    expect(ergebnis.status).toBe('uebersprungen')
    expect(protokoll.invoiceUpdates).toHaveLength(0)
    expect(protokoll.logInserts[0].status).toBe('uebersprungen')
  })
})
