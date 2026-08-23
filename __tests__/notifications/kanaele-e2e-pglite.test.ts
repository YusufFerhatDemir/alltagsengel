// ═══════════════════════════════════════════════════════════════════════
// Benachrichtigungen E2E — alle vier Kanaele gegen echtes Postgres
// ═══════════════════════════════════════════════════════════════════════
//
// WAS HIER ANDERS IST ALS IN DEN BESTEHENDEN TESTS
//   • __tests__/notifications/zustellspur.test.ts und
//     zustellung-retry.test.ts pruefen den TypeScript-Code gegen einen
//     JavaScript-Stub. Der Stub bildet den Partial-Unique-Index nach —
//     er ist damit Annahme, nicht Beweis.
//   • __tests__/migrations/notification-delivery-log-pglite.test.ts
//     prueft die MIGRATION gegen echtes Postgres, aber per rohem SQL —
//     der Anwendungscode kommt darin nicht vor.
//
// Dieser Test schliesst die Luecke dazwischen: der echte Versandcode
// (lib/notifications.ts, lib/push.ts, lib/whatsapp/send.ts,
// lib/notifications/retry.ts) laeuft unveraendert gegen eine echte
// PostgreSQL-Instanz mit der echten Migration. CHECK-Constraints,
// Fremdschluessel und der Idempotenz-Index greifen dabei WIRKLICH.
//
// Kein Netzverkehr: Resend, web-push und die WhatsApp-Cloud-API sind
// durch Attrappen ersetzt. Es geht keine Nachricht raus.
//
// Geprueft:
//   1. Jeder der vier Kanaele schreibt genau eine Zeile — richtiger
//      Kanal, richtiger Provider, richtiger Status
//   2. Dublettensperre je Kanal (echter Unique-Index, nicht Stub)
//   3. Wiederholung: Erfolg ⇒ kein zweiter Versand
//   4. Fehlschlag ⇒ wiederholbar ⇒ nach MAX_VERSUCHE Dead Letter
//   5. Parallele Zustellung: nur EINE Erfolgszeile ueberlebt
//   6. Fehlertexte ohne Geheimnisse und ohne PII
//   7. Aufraeum-Job loescht nur, was aelter als 400 Tage ist
// ═══════════════════════════════════════════════════════════════════════

import { PGlite } from '@electric-sql/pglite'
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { macheSupabaseClient, type PgliteSupabaseClient } from '@/__tests__/e2e/helpers/pglite-supabase'

// ── Umgebung und Attrappen ────────────────────────────────────────────
// vi.hoisted laeuft vor den Imports — lib/push.ts liest die VAPID-Keys
// beim Modulstart, danach gesetzte Werte kaemen zu spaet.
const H = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'test-vapid-public'
  process.env.VAPID_PRIVATE_KEY = 'test-vapid-private'
  process.env.WHATSAPP_ACCESS_TOKEN = 'test-whatsapp-token'
  process.env.WHATSAPP_PHONE_NUMBER_ID = '1234567890'
  process.env.RESEND_API_KEY = 're_TESTSCHLUESSEL_ohne_Funktion'
  return {
    /** Von beforeAll gesetzt: der Shim ueber die echte PGlite-Instanz. */
    client: null as PgliteSupabaseClient | null,
    /** Steuert, ob der jeweilige Kanal Erfolg meldet. */
    resendFehler: null as string | null,
    pushFehler: false,
    whatsappFehler: null as string | null,
    /** Zaehlt echte Sendeversuche je Kanal. */
    versuche: { email: 0, push: 0, whatsapp: 0 },
  }
})

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => H.client,
}))

vi.mock('resend', () => ({
  Resend: class {
    emails = {
      send: async () => {
        H.versuche.email++
        if (H.resendFehler) return { data: null, error: { message: H.resendFehler } }
        return { data: { id: 'resend-msg' }, error: null }
      },
    }
  },
}))

vi.mock('web-push', () => ({
  default: {
    setVapidDetails: () => {},
    sendNotification: async () => {
      H.versuche.push++
      if (H.pushFehler) {
        const e = new Error('push abgelehnt') as Error & { statusCode?: number }
        e.statusCode = 500
        throw e
      }
      return { statusCode: 201 }
    },
  },
}))

import { sendRawEmail, createNotification } from '@/lib/notifications'
import { sendPushToUser } from '@/lib/push'
import { sendWhatsAppMessage } from '@/lib/whatsapp/send'
import { sendeIdempotent, offeneZustellungen, MAX_VERSUCHE } from '@/lib/notifications/retry'
import { raeumeZustellspurAuf } from '@/lib/notifications/aufraeumen'
import type { SupabaseClient } from '@supabase/supabase-js'

const MIGRATION = path.join(
  __dirname, '..', '..', 'supabase', 'migrations',
  '20260923000000_notification_delivery_log.sql',
)

const ORG = '00000000-0000-4000-8000-0000000000aa'
const NUTZER = '00000000-0000-4000-8000-0000000000cc'
const EMPFAENGER = {
  email: 'kunde@example.org',
  push: NUTZER,
  in_app: NUTZER,
  whatsapp: '491701234567',
} as const

let db: InstanceType<typeof PGlite>

/** Der Shim, getypt als Supabase-Client — so nimmt ihn der Produktivcode. */
function alsSupabase(): SupabaseClient {
  return H.client as unknown as SupabaseClient
}

interface LogZeile {
  channel: string
  status: string
  provider: string | null
  recipient: string
  attempt_count: number
  provider_message_id: string | null
  sanitized_error: string | null
  correlation_id: string | null
  delivered_at: string | null
  failed_at: string | null
}

async function zeilen(correlationId?: string): Promise<LogZeile[]> {
  const res = await db.query<LogZeile>(
    correlationId
      ? `SELECT * FROM public.notification_delivery_log WHERE correlation_id = $1 ORDER BY created_at`
      : `SELECT * FROM public.notification_delivery_log ORDER BY created_at`,
    (correlationId ? [correlationId] : []) as never[],
  )
  return res.rows
}

/** Eigene Vorgangs-ID je Test, damit sich die Faelle nicht beeinflussen. */
let zaehler = 0
function neuerVorgang(): string {
  zaehler++
  return `00000000-0000-4000-8000-${String(zaehler).padStart(12, '0')}`
}

beforeAll(async () => {
  db = new PGlite()

  await db.exec(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon NOLOGIN NOINHERIT;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated NOLOGIN NOINHERIT;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
      END IF;
    END $$;
  `)

  // Bestand, den die Migration und der Versandcode voraussetzen.
  await db.exec(`
    CREATE TABLE public.organizations (id uuid PRIMARY KEY, name text);
    CREATE TABLE public.notifications (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid,
      type text,
      title text,
      body text,
      link text,
      data jsonb,
      email_sent boolean DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE public.push_subscriptions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL,
      endpoint text NOT NULL,
      p256dh text NOT NULL,
      auth text NOT NULL
    );
    CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
    CREATE FUNCTION public.current_org_id() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
    INSERT INTO public.organizations (id, name) VALUES ('${ORG}', 'Stamm');
    INSERT INTO public.push_subscriptions (user_id, endpoint, p256dh, auth)
      VALUES ('${NUTZER}', 'https://push.example.org/abc', 'p256dh-wert', 'auth-wert');
  `)

  await db.exec(fs.readFileSync(MIGRATION, 'utf-8'))

  H.client = macheSupabaseClient(db)
})

afterAll(async () => {
  await db?.close()
})

beforeEach(async () => {
  await db.exec('DELETE FROM public.notification_delivery_log')
  H.resendFehler = null
  H.pushFehler = false
  H.whatsappFehler = null
  H.versuche = { email: 0, push: 0, whatsapp: 0 }
  vi.stubGlobal('fetch', async () => {
    H.versuche.whatsapp++
    if (H.whatsappFehler) {
      return {
        ok: false,
        status: 400,
        json: async () => ({ error: { message: H.whatsappFehler } }),
      } as unknown as Response
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ messages: [{ id: 'wamid.TEST' }] }),
    } as unknown as Response
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 1. Alle vier Kanaele schreiben in dieselbe Spur
// ═══════════════════════════════════════════════════════════════════════
describe('Vier Kanaele, eine Zustellspur', () => {
  it('E-Mail: sendRawEmail protokolliert sent mit Provider resend', async () => {
    const vorgang = neuerVorgang()
    const e = await sendRawEmail({
      to: EMPFAENGER.email,
      subject: 'Rechnung',
      html: '<p>Rechnung</p>',
      zustellung: { organizationId: ORG, correlationId: vorgang },
    })

    expect(e).toEqual({ ok: true, messageId: 'resend-msg' })
    const [z] = await zeilen(vorgang)
    expect(z).toMatchObject({
      channel: 'email',
      status: 'sent',
      provider: 'resend',
      recipient: EMPFAENGER.email,
      provider_message_id: 'resend-msg',
      attempt_count: 1,
    })
    expect(z.delivered_at).not.toBeNull()
  })

  it('In-App: createNotification protokolliert delivered mit Provider supabase', async () => {
    const vorgang = neuerVorgang()
    const ok = await createNotification(
      alsSupabase(),
      { userId: NUTZER, type: 'booking', title: 'Neue Anfrage', body: 'Text' },
      { organizationId: ORG, correlationId: vorgang },
    )

    expect(ok).toBe(true)
    const [z] = await zeilen(vorgang)
    // 'delivered' und nicht 'sent': die Zeile in `notifications` IST die
    // Zustellung — sie liegt im Postfach. Ein Wiederholungslauf darf hier
    // nie nachlegen.
    expect(z).toMatchObject({
      channel: 'in_app',
      status: 'delivered',
      provider: 'supabase',
      recipient: NUTZER,
    })
    const n = await db.query<{ anzahl: number }>(
      'SELECT count(*)::int AS anzahl FROM public.notifications',
    )
    expect(n.rows[0].anzahl).toBe(1)
  })

  it('Push: sendPushToUser protokolliert sent mit Provider web_push', async () => {
    const vorgang = neuerVorgang()
    const e = await sendPushToUser(
      NUTZER,
      { title: 'Neue Anfrage', body: 'Text' },
      { organizationId: ORG, correlationId: vorgang },
    )

    expect(e).toEqual({ sent: 1, failed: 0 })
    const [z] = await zeilen(vorgang)
    expect(z).toMatchObject({
      channel: 'push',
      status: 'sent',
      provider: 'web_push',
      recipient: NUTZER,
    })
  })

  it('WhatsApp: sendWhatsAppMessage protokolliert sent mit wamid', async () => {
    const vorgang = neuerVorgang()
    const e = await sendWhatsAppMessage({
      to: EMPFAENGER.whatsapp,
      body: 'Ihr Termin morgen um 10 Uhr.',
      zustellung: { organizationId: ORG, correlationId: vorgang },
    })

    expect(e).toEqual({ ok: true, wamid: 'wamid.TEST' })
    const [z] = await zeilen(vorgang)
    expect(z).toMatchObject({
      channel: 'whatsapp',
      status: 'sent',
      provider: 'whatsapp_api',
      recipient: EMPFAENGER.whatsapp,
      provider_message_id: 'wamid.TEST',
    })
  })

  it('haelt die Kanaele auseinander: derselbe Vorgang darf ueber alle vier laufen', async () => {
    const vorgang = neuerVorgang()
    const kontext = { organizationId: ORG, correlationId: vorgang }

    await sendRawEmail({ to: EMPFAENGER.email, subject: 'x', html: '<p>x</p>', zustellung: kontext })
    await createNotification(alsSupabase(), { userId: NUTZER, type: 'system', title: 't', body: 'b' }, kontext)
    await sendPushToUser(NUTZER, { title: 't', body: 'b' }, kontext)
    await sendWhatsAppMessage({ to: EMPFAENGER.whatsapp, body: 'b', zustellung: kontext })

    const alle = await zeilen(vorgang)
    expect(alle).toHaveLength(4)
    expect(alle.map(z => z.channel).sort()).toEqual(['email', 'in_app', 'push', 'whatsapp'])
    expect(alle.every(z => ['sent', 'delivered'].includes(z.status))).toBe(true)
  })

  it('protokolliert Fehlschlaege je Kanal mit failed_at', async () => {
    const vorgang = neuerVorgang()
    const kontext = { organizationId: ORG, correlationId: vorgang }
    H.resendFehler = 'domain is not verified'
    H.pushFehler = true
    H.whatsappFehler = 'Recipient phone number not in allowed list'

    await sendRawEmail({ to: EMPFAENGER.email, subject: 'x', html: '<p>x</p>', zustellung: kontext })
    await sendPushToUser(NUTZER, { title: 't', body: 'b' }, kontext)
    await sendWhatsAppMessage({ to: EMPFAENGER.whatsapp, body: 'b', zustellung: kontext })

    const alle = await zeilen(vorgang)
    expect(alle).toHaveLength(3)
    expect(alle.every(z => z.status === 'failed')).toBe(true)
    expect(alle.every(z => z.failed_at !== null)).toBe(true)
    expect(alle.every(z => z.delivered_at === null)).toBe(true)
  })

  it('protokolliert fehlende Zugangsdaten als skipped, nicht als failed', async () => {
    const vorgang = neuerVorgang()
    const token = process.env.WHATSAPP_ACCESS_TOKEN
    delete process.env.WHATSAPP_ACCESS_TOKEN
    try {
      const e = await sendWhatsAppMessage({
        to: EMPFAENGER.whatsapp,
        body: 'b',
        zustellung: { organizationId: ORG, correlationId: vorgang },
      })
      expect(e.ok).toBe(false)
      const [z] = await zeilen(vorgang)
      expect(z.status).toBe('skipped')
      expect(H.versuche.whatsapp).toBe(0)
    } finally {
      process.env.WHATSAPP_ACCESS_TOKEN = token
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 2. Dublettensperre — echter Partial-Unique-Index
// ═══════════════════════════════════════════════════════════════════════
describe('Dublettensperre in der Datenbank', () => {
  it('laesst pro (Vorgang, Kanal) nur EINE Erfolgszeile zu — alle vier Kanaele', async () => {
    for (const kanal of ['email', 'push', 'in_app', 'whatsapp'] as const) {
      const vorgang = neuerVorgang()
      const einfuegen = () => db.query(
        `INSERT INTO public.notification_delivery_log
           (organization_id, channel, recipient, status, correlation_id)
         VALUES ($1, $2, $3, 'sent', $4)`,
        [ORG, kanal, EMPFAENGER[kanal], vorgang] as never[],
      )
      await einfuegen()
      await expect(einfuegen()).rejects.toThrow(/duplicate key|unique/i)
      expect(await zeilen(vorgang)).toHaveLength(1)
    }
  })

  it('greift auch ueber die Kette: zweiter sendRawEmail meldet die Dublette', async () => {
    const vorgang = neuerVorgang()
    const kontext = { organizationId: ORG, correlationId: vorgang }

    const erste = await sendRawEmail({ to: EMPFAENGER.email, subject: 'x', html: '<p>x</p>', zustellung: kontext })
    const zweite = await sendRawEmail({ to: EMPFAENGER.email, subject: 'x', html: '<p>x</p>', zustellung: kontext })

    // sendRawEmail selbst kennt keine Sperre — es versendet zweimal. Die
    // Sperre gehoert nach sendeIdempotent (siehe unten). Was die Datenbank
    // garantiert, ist die EINDEUTIGKEIT DES PROTOKOLLS: kein zweiter
    // Erfolgseintrag.
    expect(erste.ok).toBe(true)
    expect(zweite.ok).toBe(true)
    expect(await zeilen(vorgang)).toHaveLength(1)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 3. + 4. Wiederholung, Versuchsobergrenze, Dead Letter
// ═══════════════════════════════════════════════════════════════════════
describe('sendeIdempotent gegen echtes Postgres', () => {
  const kanaele = [
    { channel: 'email', provider: 'resend' },
    { channel: 'push', provider: 'web_push' },
    { channel: 'in_app', provider: 'supabase' },
    { channel: 'whatsapp', provider: 'whatsapp_api' },
  ] as const

  for (const { channel, provider } of kanaele) {
    it(`${channel}: erster Lauf versendet, zweiter Lauf nicht mehr`, async () => {
      const vorgang = neuerVorgang()
      const senden = vi.fn(async () => ({ ok: true, providerMessageId: `${channel}-1` }))
      const params = {
        kontext: { organizationId: ORG, correlationId: vorgang },
        channel, provider, recipient: EMPFAENGER[channel],
        senden, admin: alsSupabase(),
      }

      const erst = await sendeIdempotent(params)
      const zweit = await sendeIdempotent(params)

      expect(erst.status).toBe('versendet')
      expect(erst.versuch).toBe(1)
      expect(zweit.status).toBe('bereits_zugestellt')
      expect(senden).toHaveBeenCalledTimes(1)
      expect(await zeilen(vorgang)).toHaveLength(1)
    })
  }

  it('laesst nach einem Fehlschlag wiederholen und protokolliert jeden Versuch', async () => {
    const vorgang = neuerVorgang()
    const senden = vi.fn(async () => ({ ok: false, fehler: new Error('SMTP 421') }))
    const params = {
      kontext: { organizationId: ORG, correlationId: vorgang },
      channel: 'email' as const, provider: 'resend' as const,
      recipient: EMPFAENGER.email, senden, admin: alsSupabase(),
      sofort: true,
    }

    const a = await sendeIdempotent(params)
    const b = await sendeIdempotent(params)

    expect(a.status).toBe('fehlgeschlagen')
    expect(a.versuch).toBe(1)
    expect(b.status).toBe('fehlgeschlagen')
    expect(b.versuch).toBe(2)
    const alle = await zeilen(vorgang)
    expect(alle).toHaveLength(2)
    expect(alle.map(z => z.attempt_count)).toEqual([1, 2])
  })

  it('gibt nach MAX_VERSUCHE auf — Dead Letter, kein weiterer Versand', async () => {
    const vorgang = neuerVorgang()
    const senden = vi.fn(async () => ({ ok: false, fehler: 'dauerhaft kaputt' }))
    const params = {
      kontext: { organizationId: ORG, correlationId: vorgang },
      channel: 'email' as const, provider: 'resend' as const,
      recipient: EMPFAENGER.email, senden, admin: alsSupabase(),
      sofort: true,
    }

    for (let i = 0; i < MAX_VERSUCHE; i++) {
      const e = await sendeIdempotent(params)
      expect(e.status).toBe('fehlgeschlagen')
    }

    const aufgegeben = await sendeIdempotent(params)
    expect(aufgegeben.status).toBe('aufgegeben')
    expect(aufgegeben.grund).toContain(String(MAX_VERSUCHE))
    // Entscheidend: der Versand wird NICHT mehr angestossen.
    expect(senden).toHaveBeenCalledTimes(MAX_VERSUCHE)
    expect(await zeilen(vorgang)).toHaveLength(MAX_VERSUCHE)
  })

  it('zaehlt uebersprungene Laeufe nicht gegen die Obergrenze', async () => {
    const vorgang = neuerVorgang()
    const senden = vi.fn(async () => ({ ok: false, uebersprungen: true, fehler: 'kein Schluessel' }))
    const params = {
      kontext: { organizationId: ORG, correlationId: vorgang },
      channel: 'email' as const, provider: 'resend' as const,
      recipient: EMPFAENGER.email, senden, admin: alsSupabase(),
      sofort: true,
    }

    for (let i = 0; i < MAX_VERSUCHE + 3; i++) {
      const e = await sendeIdempotent(params)
      expect(e.status).toBe('uebersprungen')
    }

    // Sobald die Voraussetzung da ist, geht es raus — genau das Verhalten,
    // das der Rechnungsversand ohne RESEND_API_KEY braucht.
    const jetztGeht = await sendeIdempotent({
      ...params,
      senden: async () => ({ ok: true, providerMessageId: 'endlich' }),
    })
    expect(jetztGeht.status).toBe('versendet')
  })

  it('haelt die Wartezeit ein, wenn sofort NICHT gesetzt ist', async () => {
    const vorgang = neuerVorgang()
    const senden = vi.fn(async () => ({ ok: false, fehler: 'temporaer' }))
    const params = {
      kontext: { organizationId: ORG, correlationId: vorgang },
      channel: 'email' as const, provider: 'resend' as const,
      recipient: EMPFAENGER.email, senden, admin: alsSupabase(),
    }

    expect((await sendeIdempotent(params)).status).toBe('fehlgeschlagen')
    const zweit = await sendeIdempotent(params)

    expect(zweit.status).toBe('wartet')
    expect(senden).toHaveBeenCalledTimes(1)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 5. Parallele Zustellung
// ═══════════════════════════════════════════════════════════════════════
describe('Parallele Zustellung', () => {
  it('laesst bei zwei gleichzeitigen Laeufen genau EINE Erfolgszeile entstehen', async () => {
    const vorgang = neuerVorgang()
    const senden = vi.fn(async () => {
      // Beide Laeufe sind gleichzeitig im Versand — die Vorab-Abfrage
      // hat bei keinem von beiden etwas gesehen. Genau der Fall, gegen
      // den nur der Unique-Index hilft.
      await new Promise(r => setTimeout(r, 5))
      return { ok: true, providerMessageId: 'parallel' }
    })
    const params = {
      kontext: { organizationId: ORG, correlationId: vorgang },
      channel: 'email' as const, provider: 'resend' as const,
      recipient: EMPFAENGER.email, senden, admin: alsSupabase(),
    }

    const [a, b] = await Promise.all([sendeIdempotent(params), sendeIdempotent(params)])

    expect([a.status, b.status].every(s => s === 'versendet' || s === 'bereits_zugestellt')).toBe(true)
    const erfolge = await db.query<{ anzahl: number }>(
      `SELECT count(*)::int AS anzahl FROM public.notification_delivery_log
        WHERE correlation_id = $1 AND status IN ('sent','delivered')`,
      [vorgang] as never[],
    )
    expect(erfolge.rows[0].anzahl).toBe(1)
  })

  it('blockiert dabei NICHT den zweiten Kanal desselben Vorgangs', async () => {
    const vorgang = neuerVorgang()
    const mach = (channel: 'email' | 'whatsapp', provider: 'resend' | 'whatsapp_api') =>
      sendeIdempotent({
        kontext: { organizationId: ORG, correlationId: vorgang },
        channel, provider, recipient: EMPFAENGER[channel],
        senden: async () => ({ ok: true, providerMessageId: channel }),
        admin: alsSupabase(),
      })

    const [a, b] = await Promise.all([mach('email', 'resend'), mach('whatsapp', 'whatsapp_api')])

    expect(a.status).toBe('versendet')
    expect(b.status).toBe('versendet')
    expect(await zeilen(vorgang)).toHaveLength(2)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 6. Betriebsansicht + Fehlertexte
// ═══════════════════════════════════════════════════════════════════════
describe('offeneZustellungen', () => {
  it('listet den gescheiterten Vorgang und markiert ihn ab MAX_VERSUCHE als aufgegeben', async () => {
    const vorgang = neuerVorgang()
    const params = {
      kontext: { organizationId: ORG, correlationId: vorgang },
      channel: 'email' as const, provider: 'resend' as const,
      recipient: EMPFAENGER.email,
      senden: async () => ({ ok: false, fehler: 'dauerhaft' }),
      admin: alsSupabase(),
      sofort: true,
    }
    for (let i = 0; i < MAX_VERSUCHE; i++) await sendeIdempotent(params)

    const offen = await offeneZustellungen(ORG, { admin: alsSupabase() })
    const treffer = offen.filter(o => o.correlationId === vorgang)

    expect(treffer.length).toBeGreaterThan(0)
    expect(treffer.some(o => o.aufgegeben)).toBe(true)
    expect(treffer[0].channel).toBe('email')
  })

  it('blendet einen Vorgang aus, sobald er doch zugestellt wurde', async () => {
    const vorgang = neuerVorgang()
    const basis = {
      kontext: { organizationId: ORG, correlationId: vorgang },
      channel: 'email' as const, provider: 'resend' as const,
      recipient: EMPFAENGER.email, admin: alsSupabase(), sofort: true,
    }
    await sendeIdempotent({ ...basis, senden: async () => ({ ok: false, fehler: 'einmal daneben' }) })
    expect((await offeneZustellungen(ORG, { admin: alsSupabase() }))
      .some(o => o.correlationId === vorgang)).toBe(true)

    await sendeIdempotent({ ...basis, senden: async () => ({ ok: true, providerMessageId: 'ok' }) })

    expect((await offeneZustellungen(ORG, { admin: alsSupabase() }))
      .some(o => o.correlationId === vorgang)).toBe(false)
  })

  it('zeigt einen anderen Mandanten nicht', async () => {
    const vorgang = neuerVorgang()
    await sendeIdempotent({
      kontext: { organizationId: ORG, correlationId: vorgang },
      channel: 'email', provider: 'resend', recipient: EMPFAENGER.email,
      senden: async () => ({ ok: false, fehler: 'x' }),
      admin: alsSupabase(), sofort: true,
    })

    const fremd = await offeneZustellungen('00000000-0000-4000-8000-00000000ffff', { admin: alsSupabase() })
    expect(fremd).toHaveLength(0)
  })
})

describe('Fehlertexte ohne Geheimnisse', () => {
  it('speichert weder Schluessel noch Adresse noch Telefonnummer', async () => {
    const vorgang = neuerVorgang()
    await sendeIdempotent({
      kontext: { organizationId: ORG, correlationId: vorgang },
      channel: 'whatsapp', provider: 'whatsapp_api', recipient: EMPFAENGER.whatsapp,
      senden: async () => ({
        ok: false,
        fehler: new Error(
          'POST https://graph.facebook.com/v22.0/messages?access_token=EAAG_geheim_123456 ' +
          'Authorization: Bearer re_TESTSCHLUESSEL_ohne_Funktion — Empfaenger kunde@example.org / +49 170 1234567',
        ),
      }),
      admin: alsSupabase(), sofort: true,
    })

    const [z] = await zeilen(vorgang)
    const text = String(z.sanitized_error)
    expect(text).not.toContain('EAAG_geheim_123456')
    expect(text).not.toContain('re_TESTSCHLUESSEL_ohne_Funktion')
    expect(text).not.toContain('kunde@example.org')
    expect(text).not.toContain('1234567')
    expect(text.length).toBeLessThanOrEqual(500)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 7. Aufraeum-Job
// ═══════════════════════════════════════════════════════════════════════
describe('raeumeZustellspurAuf', () => {
  it('loescht nur Zeilen aelter als 400 Tage', async () => {
    await db.exec(`
      INSERT INTO public.notification_delivery_log
        (organization_id, channel, recipient, status, created_at)
      VALUES
        ('${ORG}', 'email', 'alt@example.org',  'sent', now() - interval '401 days'),
        ('${ORG}', 'email', 'neu@example.org',  'sent', now() - interval '399 days'),
        ('${ORG}', 'push',  '${NUTZER}',        'failed', now());
    `)

    const e = await raeumeZustellspurAuf(alsSupabase())

    expect(e).toEqual({ ok: true, geloescht: 1 })
    const rest = await zeilen()
    expect(rest).toHaveLength(2)
    expect(rest.map(z => z.recipient)).not.toContain('alt@example.org')
  })

  it('ist gefahrlos wiederholbar — zweiter Lauf loescht nichts mehr', async () => {
    await db.exec(`
      INSERT INTO public.notification_delivery_log
        (organization_id, channel, recipient, status, created_at)
      VALUES
        ('${ORG}', 'email', 'alt@example.org', 'sent', now() - interval '401 days'),
        ('${ORG}', 'email', 'neu@example.org', 'sent', now());
    `)

    expect((await raeumeZustellspurAuf(alsSupabase())).geloescht).toBe(1)
    expect((await raeumeZustellspurAuf(alsSupabase())).geloescht).toBe(0)
    expect(await zeilen()).toHaveLength(1)
  })

  it('meldet einen fehlenden RPC als ok:false, statt zu werfen', async () => {
    // So verhaelt es sich auf einer Datenbank ohne die Migration. Der
    // taegliche Cron-Lauf darf daran nicht scheitern.
    const kaputt = {
      rpc: async () => ({ data: null, error: { message: 'function does not exist' } }),
    } as unknown as SupabaseClient

    const e = await raeumeZustellspurAuf(kaputt)

    expect(e.ok).toBe(false)
    expect(e.geloescht).toBeNull()
    expect(e.grund).toContain('does not exist')
  })
})
