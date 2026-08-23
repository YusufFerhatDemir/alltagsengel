// ═══════════════════════════════════════════════════════════════════════
// Resend-Integration — die gesamte Kette, ohne eine echte Mail
// ═══════════════════════════════════════════════════════════════════════
//
// WARUM DIESER TEST
// Ob der E-Mail-Versand funktioniert, war bisher nur an einer Stelle
// ablesbar: an `invoices.sent_at` nach einem echten Versand. Der Code
// dazwischen — Schluesselbeschaffung, Absender, Anhangkodierung,
// Fehlerbehandlung, Zustellspur — war ungeprueft.
//
// Der Test ersetzt das `resend`-Paket durch eine Attrappe und prueft die
// Kette bis zum Aufrufparameter. Es geht KEINE Mail raus, und es wird
// KEIN echter Schluessel gebraucht.
//
// Was er bewusst NICHT beweisen kann: dass der in Vercel hinterlegte
// Schluessel gueltig ist. Dafuer gibt es seit Phase 4 ein eigenes,
// rein lesendes Werkzeug — `node scripts/verify-resend.mjs` fragt
// GET /domains ab und verschickt dabei nichts.
//
// Die Fehlerpfade (abgelehnter Schluessel, Zeitueberschreitung, 4xx,
// 5xx, Erfolg ohne Beleg) stehen in
// __tests__/notifications/resend-fehlerpfade.test.ts.
// ═══════════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── Attrappen ─────────────────────────────────────────────────────────
// vi.hoisted, weil die Fabriken von vi.mock vor den Imports laufen.
const H = vi.hoisted(() => ({
  /** Jeder Aufruf von resend.emails.send(), in Reihenfolge. */
  gesendet: [] as Array<Record<string, unknown>>,
  /** Schluessel, mit dem `new Resend(...)` konstruiert wurde. */
  konstruiertMit: [] as string[],
  /** Antwort der naechsten send()-Aufrufe. Funktion ⇒ darf werfen. */
  antwort: null as unknown,
  /** Zeilen, die in notification_delivery_log geschrieben wurden. */
  protokoll: [] as Array<Record<string, unknown>>,
}))

vi.mock('resend', () => ({
  Resend: class {
    constructor(schluessel: string) {
      H.konstruiertMit.push(schluessel)
    }
    emails = {
      send: async (params: Record<string, unknown>) => {
        H.gesendet.push(params)
        if (typeof H.antwort === 'function') return (H.antwort as () => unknown)()
        return H.antwort as { data: { id: string } | null; error: unknown }
      },
    }
  },
}))

// Die Zustellspur laeuft ueber den Admin-Client. Hier ein Stub, der die
// eingefuegten Zeilen mitschreibt — der echte delivery-log-Code laeuft
// dabei unveraendert mit (Sanitisierung, Zeitstempel, Versuchszaehler).
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
          H.protokoll.push(zeile)
          return { error: null }
        },
      }
    },
  }),
}))

import {
  sendEmailNotification,
  sendRawEmail,
  ALLTAGSENGEL_ABSENDER,
} from '@/lib/notifications'

const ORG = '00000000-0000-4000-8000-0000000000aa'
const VORGANG = '00000000-0000-4000-8000-0000000000bb'
const spur = { organizationId: ORG, correlationId: VORGANG }

/** Offensichtlich unechter Wert — nur die FORM eines Resend-Schluessels. */
const ATTRAPPEN_SCHLUESSEL = 're_TESTSCHLUESSEL_ohne_Funktion'

const urspruenglicherKey = process.env.RESEND_API_KEY

beforeEach(() => {
  H.gesendet.length = 0
  H.konstruiertMit.length = 0
  H.protokoll.length = 0
  H.antwort = { data: { id: 'resend-msg-1' }, error: null }
  delete process.env.RESEND_API_KEY
})

afterEach(() => {
  if (urspruenglicherKey === undefined) delete process.env.RESEND_API_KEY
  else process.env.RESEND_API_KEY = urspruenglicherKey
})

// ═══════════════════════════════════════════════════════════════════════
describe('Absenderadresse', () => {
  it('ist die Marke, nie eine Person (CLAUDE.md, Kundenkommunikation)', () => {
    expect(ALLTAGSENGEL_ABSENDER).toBe('Alltagsengel <info@alltagsengel.care>')
    // Gegenprobe auf die Namen, die laut Namens-Policy nie kundengerichtet
    // auftauchen duerfen.
    expect(ALLTAGSENGEL_ABSENDER.toLowerCase()).not.toMatch(/yusuf|cilcioglu|abdullah/)
  })

  it('nutzt die Domain, fuer die der DKIM-Schluessel hinterlegt ist', () => {
    // resend._domainkey.alltagsengel.care traegt den DKIM-Public-Key,
    // send.alltagsengel.care den SPF-Eintrag. Weicht der Absender von
    // dieser Domain ab, scheitert DMARC (p=reject) und die Mail wird
    // beim Empfaenger verworfen — nicht im Spam, sondern abgewiesen.
    const domain = ALLTAGSENGEL_ABSENDER.match(/<[^@]+@([^>]+)>/)?.[1]
    expect(domain).toBe('alltagsengel.care')
  })
})

// ═══════════════════════════════════════════════════════════════════════
describe('sendEmailNotification', () => {
  it('versendet ohne Schluessel NICHT und protokolliert das als uebersprungen', async () => {
    const ok = await sendEmailNotification('kunde@example.org', 'Frau Muster', 'Betreff', '<p>x</p>', spur)

    expect(ok).toBe(false)
    expect(H.gesendet).toHaveLength(0)
    expect(H.protokoll).toHaveLength(1)
    expect(H.protokoll[0]).toMatchObject({
      channel: 'email',
      status: 'skipped',
      provider: 'resend',
      recipient: 'kunde@example.org',
    })
    // 'skipped' und nicht 'failed': ein fehlender Schluessel ist kein
    // Zustellversuch und darf die Versuchsobergrenze nicht verbrauchen.
    expect(H.protokoll[0].delivered_at).toBeNull()
    expect(H.protokoll[0].failed_at).toBeNull()
  })

  it('baut den Client aus der Umgebungsvariablen und versendet mit dem Marken-Absender', async () => {
    process.env.RESEND_API_KEY = ATTRAPPEN_SCHLUESSEL

    const ok = await sendEmailNotification('kunde@example.org', 'Frau Muster', 'Ihre Buchung', '<p>Inhalt</p>', spur)

    expect(ok).toBe(true)
    expect(H.konstruiertMit).toEqual([ATTRAPPEN_SCHLUESSEL])
    expect(H.gesendet).toHaveLength(1)
    expect(H.gesendet[0]).toMatchObject({
      from: ALLTAGSENGEL_ABSENDER,
      to: 'kunde@example.org',
      subject: 'Ihre Buchung',
    })
    // Der Template-Rahmen liegt drumherum, der Inhalt ist unveraendert drin.
    expect(String(H.gesendet[0].html)).toContain('<p>Inhalt</p>')
    expect(String(H.gesendet[0].html)).toContain('Hallo Frau Muster,')
  })

  it('schreibt bei Erfolg die Provider-Nachrichten-ID in die Zustellspur', async () => {
    process.env.RESEND_API_KEY = ATTRAPPEN_SCHLUESSEL

    await sendEmailNotification('kunde@example.org', 'Frau Muster', 'Betreff', '<p>x</p>', spur)

    expect(H.protokoll).toHaveLength(1)
    expect(H.protokoll[0]).toMatchObject({
      channel: 'email',
      status: 'sent',
      provider: 'resend',
      provider_message_id: 'resend-msg-1',
      correlation_id: VORGANG,
      organization_id: ORG,
    })
    expect(H.protokoll[0].delivered_at).not.toBeNull()
  })

  it('meldet einen Provider-Fehler als Fehlschlag, nicht als Erfolg', async () => {
    process.env.RESEND_API_KEY = ATTRAPPEN_SCHLUESSEL
    H.antwort = { data: null, error: { message: 'domain is not verified', name: 'validation_error' } }

    const ok = await sendEmailNotification('kunde@example.org', 'Frau Muster', 'Betreff', '<p>x</p>', spur)

    expect(ok).toBe(false)
    expect(H.protokoll[0]).toMatchObject({ channel: 'email', status: 'failed' })
    expect(H.protokoll[0].sanitized_error).toContain('domain is not verified')
    expect(H.protokoll[0].failed_at).not.toBeNull()
  })

  it('faengt eine Ausnahme aus dem SDK ab, statt den Aufrufer abstuerzen zu lassen', async () => {
    process.env.RESEND_API_KEY = ATTRAPPEN_SCHLUESSEL
    H.antwort = () => { throw new Error('fetch failed: ENOTFOUND api.resend.com') }

    const ok = await sendEmailNotification('kunde@example.org', 'Frau Muster', 'Betreff', '<p>x</p>', spur)

    expect(ok).toBe(false)
    expect(H.protokoll[0]).toMatchObject({ status: 'failed' })
    expect(H.protokoll[0].sanitized_error).toContain('ENOTFOUND')
  })

  it('liest den Schluessel bei JEDEM Aufruf, nicht einmalig beim Modulstart', async () => {
    // Sonst wuerde ein nachtraeglich in Vercel gesetzter Schluessel erst
    // nach einem Neustart aller Lambdas wirken — und ein Betriebsteam,
    // das ihn setzt und sofort testet, saehe faelschlich weiter nichts.
    const ohne = await sendEmailNotification('a@example.org', 'A', 'B', '<p>x</p>')
    expect(ohne).toBe(false)

    process.env.RESEND_API_KEY = ATTRAPPEN_SCHLUESSEL
    const mit = await sendEmailNotification('a@example.org', 'A', 'B', '<p>x</p>')
    expect(mit).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════
describe('sendRawEmail', () => {
  const basis = {
    to: 'kunde@example.org',
    subject: 'Rechnung 2026-0001',
    html: '<html><body>Rechnung</body></html>',
  }

  it('meldet ohne Schluessel "uebersprungen" — nicht "fehlgeschlagen"', async () => {
    const e = await sendRawEmail({ ...basis, zustellung: spur })

    expect(e).toEqual({
      ok: false,
      uebersprungen: true,
      grund: 'RESEND_API_KEY nicht konfiguriert',
    })
    // Der Unterschied ist fachlich entscheidend: der Rechnungsversand
    // setzt bei 'uebersprungen' KEIN sent_at und nimmt die Rechnung beim
    // naechsten Lauf wieder mit. Waere es 'fehlgeschlagen', zaehlte der
    // Lauf gegen die Versuchsobergrenze und die Rechnung bliebe liegen.
    expect(H.protokoll[0]).toMatchObject({ status: 'skipped', channel: 'email' })
  })

  it('legt KEINEN Template-Rahmen um das uebergebene HTML', async () => {
    process.env.RESEND_API_KEY = ATTRAPPEN_SCHLUESSEL

    await sendRawEmail(basis)

    expect(H.gesendet[0].html).toBe(basis.html)
    expect(String(H.gesendet[0].html)).not.toContain('Hallo ')
  })

  it('kodiert Anhaenge nach base64 und reicht contentType durch', async () => {
    process.env.RESEND_API_KEY = ATTRAPPEN_SCHLUESSEL
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46]) // "%PDF"

    await sendRawEmail({
      ...basis,
      attachments: [{ filename: 'Rechnung.pdf', content: pdf, contentType: 'application/pdf' }],
    })

    const anhaenge = H.gesendet[0].attachments as Array<Record<string, unknown>>
    expect(anhaenge).toHaveLength(1)
    expect(anhaenge[0].filename).toBe('Rechnung.pdf')
    expect(anhaenge[0].contentType).toBe('application/pdf')
    expect(anhaenge[0].content).toBe(Buffer.from(pdf).toString('base64'))
    // Gegenprobe: die Rohbytes duerfen NICHT durchgereicht werden — das
    // SDK erwartet base64 und wuerde sonst eine kaputte PDF verschicken.
    expect(anhaenge[0].content).not.toBe(pdf)
  })

  it('laesst text und replyTo weg, solange sie nicht gesetzt sind', async () => {
    process.env.RESEND_API_KEY = ATTRAPPEN_SCHLUESSEL

    await sendRawEmail(basis)

    expect(H.gesendet[0]).not.toHaveProperty('text')
    expect(H.gesendet[0]).not.toHaveProperty('replyTo')
    expect(H.gesendet[0]).not.toHaveProperty('attachments')
  })

  it('reicht text und replyTo durch, wenn sie gesetzt sind', async () => {
    process.env.RESEND_API_KEY = ATTRAPPEN_SCHLUESSEL

    await sendRawEmail({ ...basis, text: 'Nur-Text-Fassung', replyTo: 'buchhaltung@alltagsengel.care' })

    expect(H.gesendet[0].text).toBe('Nur-Text-Fassung')
    expect(H.gesendet[0].replyTo).toBe('buchhaltung@alltagsengel.care')
  })

  it('gibt bei Provider-Fehler uebersprungen=false zurueck', async () => {
    process.env.RESEND_API_KEY = ATTRAPPEN_SCHLUESSEL
    H.antwort = { data: null, error: { message: 'rate limit exceeded', statusCode: 429 } }

    const e = await sendRawEmail({ ...basis, zustellung: spur })

    // `fehler` und `statusCode` kommen mit: ohne den Statuscode kann der
    // Wiederholungslauf einen dauerhaft unzustellbaren 422 nicht von
    // einer kurzen Stoerung unterscheiden (siehe
    // __tests__/notifications/resend-fehlerpfade.test.ts).
    expect(e).toMatchObject({ ok: false, uebersprungen: false, grund: 'rate limit exceeded', statusCode: 429 })
    expect(H.protokoll[0]).toMatchObject({ status: 'failed' })
  })

  it('liefert die Nachrichten-ID bei Erfolg zurueck', async () => {
    process.env.RESEND_API_KEY = ATTRAPPEN_SCHLUESSEL

    const e = await sendRawEmail({ ...basis, zustellung: spur })

    expect(e).toEqual({ ok: true, messageId: 'resend-msg-1' })
    expect(H.protokoll[0]).toMatchObject({ status: 'sent', provider_message_id: 'resend-msg-1' })
  })
})

// ═══════════════════════════════════════════════════════════════════════
describe('Keine Geheimnisse in der Zustellspur', () => {
  it('entfernt einen Resend-Schluessel aus der Fehlermeldung des Providers', async () => {
    process.env.RESEND_API_KEY = ATTRAPPEN_SCHLUESSEL
    // Resend selbst gibt den Schluessel nicht zurueck; ein Proxy oder eine
    // eigene Wrapper-Schicht koennte es. Der Test haelt fest, dass die
    // Zustellspur das abfaengt, egal woher der Text kommt.
    H.antwort = {
      data: null,
      error: { message: `API request failed: Authorization: Bearer ${ATTRAPPEN_SCHLUESSEL} (kunde@example.org)` },
    }

    await sendRawEmail({ to: 'kunde@example.org', subject: 'x', html: '<p>x</p>', zustellung: spur })

    const fehler = String(H.protokoll[0].sanitized_error)
    expect(fehler).not.toContain(ATTRAPPEN_SCHLUESSEL)
    expect(fehler).not.toContain('kunde@example.org')
    expect(fehler).toContain('[entfernt]')
  })

  it('nimmt den Stacktrace nicht mit — er enthaelt Serverpfade', async () => {
    process.env.RESEND_API_KEY = ATTRAPPEN_SCHLUESSEL
    H.antwort = () => { throw new Error('Zeitueberschreitung') }

    await sendRawEmail({ to: 'kunde@example.org', subject: 'x', html: '<p>x</p>', zustellung: spur })

    const fehler = String(H.protokoll[0].sanitized_error)
    expect(fehler).toBe('Zeitueberschreitung')
    expect(fehler).not.toContain('/Users/')
    expect(fehler).not.toContain('at ')
  })
})
