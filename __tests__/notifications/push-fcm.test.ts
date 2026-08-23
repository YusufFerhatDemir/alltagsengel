// ═══════════════════════════════════════════════════════════════════════
// Nativer Push (FCM) — Token-Verwaltung, Versand, Zustellspur
// ═══════════════════════════════════════════════════════════════════════
//
// Laeuft gegen ECHTES Postgres (PGlite/WASM) mit der echten Migration
// 20260928000000. Der Unique-Index auf (user_id, token), der
// platform-CHECK und die Mandantenspalte greifen damit wirklich — eine
// Fake-DB haette genau die Fehler durchgelassen, wegen derer diese
// Migration ueberhaupt noetig war (siehe Kopfkommentar dort).
//
// Kein Netzverkehr: FCM ist durch eine Attrappe ersetzt, die
// Antwortstatus und -koerper vorgibt. Es geht keine Nachricht raus.
//
// Geprueft:
//   1. Registrierung, doppelte Registrierung, Abmeldung
//   2. Versand an mehrere Geraete
//   3. Toter Token wird geloescht (Rotation)
//   4. INVALID_ARGUMENT ohne Token-Bezug loescht NICHTS
//   5. 429/5xx werden wiederholt, dauerhafte Fehler nicht
//   6. Mandantentrennung
//   7. Widerspruch (Opt-out) verhindert den Versand
//   8. Fehlende Zugangsdaten ⇒ uebersprungen, nicht fehlgeschlagen
//   9. Idempotenz ueber die Zustellspur, getrennt vom Web-Push
// ═══════════════════════════════════════════════════════════════════════

import { PGlite } from '@electric-sql/pglite'
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { macheSupabaseClient, type PgliteSupabaseClient } from '@/__tests__/e2e/helpers/pglite-supabase'

const MIGRATIONS_DIR = path.join(__dirname, '..', '..', 'supabase', 'migrations')
const STAMM = '00000000-0000-4000-8000-000460629986'
const ORG_B = '00000000-0000-4000-8000-0000000000ab'
const ANNA = '00000000-0000-4000-8000-0000000000a1'
const BERND = '00000000-0000-4000-8000-0000000000a2'
const BUCHUNG = '00000000-0000-4000-8000-0000000000f1'

const TOKEN_HANDY = 'token-anna-handy-000000000000'
const TOKEN_TABLET = 'token-anna-tablet-00000000000'

// ── Attrappen ─────────────────────────────────────────────────────────
const H = vi.hoisted(() => ({
  client: null as PgliteSupabaseClient | null,
  /** Antworten, die die FCM-Attrappe der Reihe nach liefert. */
  antworten: [] as Array<{ status: number; body: string }>,
  /**
   * Feste Antwort je Token. Noetig, sobald mehrere Geraete GLEICHZEITIG
   * bedient werden: eine gemeinsame Warteschlange saehe dann je nach
   * Reihenfolge anders aus, und der Test pruefte nicht mehr das, was
   * dranstand.
   */
  proToken: {} as Record<string, { status: number; body: string }>,
  /** Jeder Aufruf mit dem gesendeten Token. */
  aufrufe: [] as string[],
  zugangstoken: 'ya29.test-access-token' as string | null,
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => H.client,
}))

vi.mock('google-auth-library', () => ({
  GoogleAuth: class {
    async getClient() {
      return { getAccessToken: async () => ({ token: H.zugangstoken }) }
    }
  },
}))

vi.stubGlobal('fetch', async (_url: string, init?: { body?: string }) => {
  const nutzlast = JSON.parse(String(init?.body ?? '{}')) as { message?: { token?: string } }
  H.aufrufe.push(nutzlast.message?.token ?? '')
  const token = nutzlast.message?.token ?? ''
  const naechste = H.proToken[token] ??
    H.antworten.shift() ?? {
      status: 200,
      body: JSON.stringify({ name: 'projects/p/messages/1' }),
    }
  return {
    ok: naechste.status >= 200 && naechste.status < 300,
    status: naechste.status,
    json: async () => JSON.parse(naechste.body || '{}'),
    text: async () => naechste.body,
  } as unknown as Response
})

import {
  registriereGeraet,
  entferneGeraet,
  geraeteFuerNutzer,
  pushErlaubt,
  setzePushErlaubnis,
  sendePushAnNutzer,
  sendePushIdempotent,
  pushVorgangsId,
  deuteFcmFehler,
} from '@/lib/notifications/push'
import { vorgangsId } from '@/lib/notifications/delivery-log'

let db: InstanceType<typeof PGlite>

/** Antwortkoerper, wie FCM ihn bei totem Geraet liefert. */
const UNREGISTERED = JSON.stringify({
  error: {
    status: 'NOT_FOUND',
    message: 'Requested entity was not found.',
    details: [{ errorCode: 'UNREGISTERED' }],
  },
})

/** Nutzlastfehler — das GERAET ist in Ordnung. */
const NUTZLAST_KAPUTT = JSON.stringify({
  error: {
    status: 'INVALID_ARGUMENT',
    message: 'Invalid value at message.data',
    details: [{ fieldViolations: [{ field: 'message.data' }] }],
  },
})

/** FCM beanstandet ausdruecklich das Token. */
const TOKEN_KAPUTT = JSON.stringify({
  error: {
    status: 'INVALID_ARGUMENT',
    message: 'The registration token is not a valid FCM registration token',
    details: [{ fieldViolations: [{ field: 'message.token' }] }],
  },
})

beforeAll(async () => {
  process.env.FCM_CLIENT_EMAIL = 'test@alltagsengel.iam.gserviceaccount.com'
  process.env.FCM_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\\ntest\\n-----END PRIVATE KEY-----'
  process.env.FCM_PROJECT_ID = 'alltagsengel-test'
  delete process.env.FIREBASE_SERVICE_ACCOUNT_KEY

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

    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
    CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
    CREATE FUNCTION public.current_org_id() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;

    CREATE TABLE public.organizations (id uuid PRIMARY KEY, name text);
    INSERT INTO public.organizations (id, name)
      VALUES ('${STAMM}', 'Alltagsengel'), ('${ORG_B}', 'Zweiter Mandant');

    CREATE TABLE public.organization_members (
      user_id uuid NOT NULL, organization_id uuid NOT NULL, role text,
      created_at timestamptz DEFAULT now()
    );
    CREATE TABLE public.notifications (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid);

    CREATE TABLE public.fcm_tokens (
      id uuid DEFAULT gen_random_uuid() NOT NULL,
      user_id uuid NOT NULL,
      token text NOT NULL,
      platform text DEFAULT 'android'::text NOT NULL,
      device_info text,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now(),
      PRIMARY KEY (id)
    );
  `)

  await db.exec(
    fs.readFileSync(path.join(MIGRATIONS_DIR, '20260923000000_notification_delivery_log.sql'), 'utf-8'))
  await db.exec(
    fs.readFileSync(path.join(MIGRATIONS_DIR, '20260928000000_push_geraete_token.sql'), 'utf-8'))

  H.client = macheSupabaseClient(db)
})

afterAll(async () => {
  await db?.close()
})

beforeEach(async () => {
  H.antworten = []
  H.proToken = {}
  H.aufrufe = []
  H.zugangstoken = 'ya29.test-access-token'
  process.env.FCM_CLIENT_EMAIL = 'test@alltagsengel.iam.gserviceaccount.com'
  process.env.FCM_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\\ntest\\n-----END PRIVATE KEY-----'
  await db.exec(`
    DELETE FROM public.fcm_tokens;
    DELETE FROM public.notification_preferences;
    DELETE FROM public.notification_delivery_log;
  `)
})

// ═══════════════════════════════════════════════════════════════════
// 1) Registrierung
// ═══════════════════════════════════════════════════════════════════

describe('Geraete-Registrierung', () => {
  it('legt ein Geraet an', async () => {
    const e = await registriereGeraet({
      userId: ANNA, organizationId: STAMM, token: TOKEN_HANDY, platform: 'ios',
    })
    expect(e.ok).toBe(true)
    expect(e.bekannt).toBe(false)

    const geraete = await geraeteFuerNutzer(ANNA, STAMM)
    expect(geraete).toHaveLength(1)
    expect(geraete[0].platform).toBe('ios')
    expect(geraete[0].organizationId).toBe(STAMM)
  })

  it('meldet dasselbe Geraet doppelt an, ohne zu scheitern und ohne Dublette', async () => {
    // Der haeufigste Fall ueberhaupt: die App meldet sich bei JEDEM Start
    // an. Ohne Idempotenz bekaeme der Nutzer jede Nachricht mehrfach.
    await registriereGeraet({ userId: ANNA, organizationId: STAMM, token: TOKEN_HANDY })
    const zweite = await registriereGeraet({
      userId: ANNA, organizationId: STAMM, token: TOKEN_HANDY,
    })
    expect(zweite.ok).toBe(true)
    expect(zweite.bekannt).toBe(true)
    expect(await geraeteFuerNutzer(ANNA)).toHaveLength(1)
  })

  it('zieht ein Geraet in die neue Organisation mit', async () => {
    await registriereGeraet({ userId: ANNA, organizationId: STAMM, token: TOKEN_HANDY })
    await registriereGeraet({ userId: ANNA, organizationId: ORG_B, token: TOKEN_HANDY })
    const geraete = await geraeteFuerNutzer(ANNA)
    expect(geraete).toHaveLength(1)
    expect(geraete[0].organizationId).toBe(ORG_B)
  })

  it('weist einen zu kurzen Token ab, bevor er in die Datenbank kommt', async () => {
    const e = await registriereGeraet({ userId: ANNA, organizationId: STAMM, token: 'kurz' })
    expect(e.ok).toBe(false)
    expect(await geraeteFuerNutzer(ANNA)).toHaveLength(0)
  })

  it('faellt bei unbekannter Plattform auf android zurueck statt am CHECK zu scheitern', async () => {
    const e = await registriereGeraet({
      userId: ANNA, organizationId: STAMM, token: TOKEN_HANDY, platform: 'symbian',
    })
    expect(e.ok).toBe(true)
    expect((await geraeteFuerNutzer(ANNA))[0].platform).toBe('android')
  })
})

describe('Abmeldung', () => {
  it('entfernt das eigene Geraet', async () => {
    await registriereGeraet({ userId: ANNA, organizationId: STAMM, token: TOKEN_HANDY })
    const e = await entferneGeraet(ANNA, TOKEN_HANDY)
    expect(e.ok).toBe(true)
    expect(await geraeteFuerNutzer(ANNA)).toHaveLength(0)
  })

  it('laesst ein fremdes Geraet unberuehrt', async () => {
    await registriereGeraet({ userId: ANNA, organizationId: STAMM, token: TOKEN_HANDY })
    const e = await entferneGeraet(BERND, TOKEN_HANDY)
    expect(e.ok).toBe(true) // kein Orakel: der Aufrufer erfaehrt nichts
    expect(await geraeteFuerNutzer(ANNA)).toHaveLength(1)
  })
})

// ═══════════════════════════════════════════════════════════════════
// 2) Versand
// ═══════════════════════════════════════════════════════════════════

describe('Versand', () => {
  beforeEach(async () => {
    await registriereGeraet({ userId: ANNA, organizationId: STAMM, token: TOKEN_HANDY })
    await registriereGeraet({ userId: ANNA, organizationId: STAMM, token: TOKEN_TABLET, platform: 'web' })
  })

  it('erreicht alle Geraete des Nutzers', async () => {
    const e = await sendePushAnNutzer({
      userId: ANNA, organizationId: STAMM,
      nachricht: { title: 'Neue Buchungsanfrage', body: 'Frau Meier fragt an.' },
      optionen: { wartezeitMs: 0 },
    })
    expect(e.zugestellt).toBe(2)
    expect(e.fehlgeschlagen).toBe(0)
    expect(H.aufrufe.sort()).toEqual([TOKEN_HANDY, TOKEN_TABLET].sort())
  })

  it('zaehlt als zugestellt, sobald EIN Geraet erreicht wurde', async () => {
    // Das Tablet ist dauerhaft gestoert, das Handy nicht. Der Nutzer hat
    // die Nachricht gesehen — der Vorgang ist zugestellt.
    H.proToken[TOKEN_TABLET] = { status: 403, body: '{}' }
    const e = await sendePushAnNutzer({
      userId: ANNA, organizationId: STAMM,
      nachricht: { title: 'T', body: 'B' },
      optionen: { wartezeitMs: 0 },
    })
    expect(e.zugestellt).toBe(1)
    expect(e.fehlgeschlagen).toBe(1)
  })

  it('merkt den Zustellzeitpunkt am Geraet', async () => {
    await sendePushAnNutzer({
      userId: ANNA, organizationId: STAMM,
      nachricht: { title: 'T', body: 'B' }, optionen: { wartezeitMs: 0 },
    })
    const { rows } = await db.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM public.fcm_tokens WHERE last_used_at IS NOT NULL`)
    expect(rows[0].n).toBe('2')
  })
})

// ═══════════════════════════════════════════════════════════════════
// 3) Token-Rotation
// ═══════════════════════════════════════════════════════════════════

describe('Token-Rotation', () => {
  beforeEach(async () => {
    await registriereGeraet({ userId: ANNA, organizationId: STAMM, token: TOKEN_HANDY })
  })

  it('loescht einen von FCM als unbekannt gemeldeten Token', async () => {
    H.antworten = [{ status: 404, body: UNREGISTERED }]
    const e = await sendePushAnNutzer({
      userId: ANNA, organizationId: STAMM,
      nachricht: { title: 'T', body: 'B' }, optionen: { wartezeitMs: 0 },
    })
    expect(e.entfernt).toBe(1)
    expect(e.fehlgeschlagen).toBe(0)
    expect(await geraeteFuerNutzer(ANNA)).toHaveLength(0)
  })

  it('loescht bei ausdruecklich beanstandetem Token', async () => {
    H.antworten = [{ status: 400, body: TOKEN_KAPUTT }]
    await sendePushAnNutzer({
      userId: ANNA, organizationId: STAMM,
      nachricht: { title: 'T', body: 'B' }, optionen: { wartezeitMs: 0 },
    })
    expect(await geraeteFuerNutzer(ANNA)).toHaveLength(0)
  })

  it('loescht NICHTS, wenn INVALID_ARGUMENT die Nutzlast meint', async () => {
    // Der Regressionsfall: eine kaputte Nutzlast haette frueher reihum
    // jeden Token im Bestand geloescht und den Kanal leergeraeumt.
    H.antworten = [{ status: 400, body: NUTZLAST_KAPUTT }]
    const e = await sendePushAnNutzer({
      userId: ANNA, organizationId: STAMM,
      nachricht: { title: 'T', body: 'B' }, optionen: { wartezeitMs: 0 },
    })
    expect(e.entfernt).toBe(0)
    expect(e.fehlgeschlagen).toBe(1)
    expect(await geraeteFuerNutzer(ANNA)).toHaveLength(1)
  })

  it('deutet die Fehlerlage richtig', () => {
    expect(deuteFcmFehler(404, UNREGISTERED)).toMatchObject({ tokenTot: true, wiederholbar: false })
    expect(deuteFcmFehler(400, NUTZLAST_KAPUTT)).toMatchObject({ tokenTot: false, wiederholbar: false })
    expect(deuteFcmFehler(429, '{}')).toMatchObject({ tokenTot: false, wiederholbar: true })
    expect(deuteFcmFehler(503, '{}')).toMatchObject({ tokenTot: false, wiederholbar: true })
    expect(deuteFcmFehler(401, '{}')).toMatchObject({ tokenTot: false, wiederholbar: false })
  })
})

// ═══════════════════════════════════════════════════════════════════
// 4) Wiederholung innerhalb eines Sendevorgangs
// ═══════════════════════════════════════════════════════════════════

describe('Wiederholung bei Stoerung', () => {
  beforeEach(async () => {
    await registriereGeraet({ userId: ANNA, organizationId: STAMM, token: TOKEN_HANDY })
  })

  it('wiederholt nach 429 und stellt dann zu', async () => {
    H.antworten = [
      { status: 429, body: '{}' },
      { status: 200, body: JSON.stringify({ name: 'projects/p/messages/9' }) },
    ]
    const e = await sendePushAnNutzer({
      userId: ANNA, organizationId: STAMM,
      nachricht: { title: 'T', body: 'B' }, optionen: { wartezeitMs: 0 },
    })
    expect(e.zugestellt).toBe(1)
    expect(H.aufrufe).toHaveLength(2)
  })

  it('gibt nach drei Anlaeufen auf und behaelt den Token', async () => {
    H.antworten = [
      { status: 500, body: '{}' }, { status: 500, body: '{}' }, { status: 500, body: '{}' },
    ]
    const e = await sendePushAnNutzer({
      userId: ANNA, organizationId: STAMM,
      nachricht: { title: 'T', body: 'B' }, optionen: { wartezeitMs: 0 },
    })
    expect(e.fehlgeschlagen).toBe(1)
    expect(H.aufrufe).toHaveLength(3)
    expect(await geraeteFuerNutzer(ANNA)).toHaveLength(1)
  })

  it('wiederholt einen dauerhaften Fehler NICHT', async () => {
    H.antworten = [{ status: 403, body: '{}' }]
    await sendePushAnNutzer({
      userId: ANNA, organizationId: STAMM,
      nachricht: { title: 'T', body: 'B' }, optionen: { wartezeitMs: 0 },
    })
    expect(H.aufrufe).toHaveLength(1)
  })
})

// ═══════════════════════════════════════════════════════════════════
// 5) Mandantentrennung
// ═══════════════════════════════════════════════════════════════════

describe('Mandantentrennung', () => {
  it('sieht ein Geraet aus einem fremden Mandanten nicht', async () => {
    await registriereGeraet({ userId: ANNA, organizationId: ORG_B, token: TOKEN_HANDY })

    expect(await geraeteFuerNutzer(ANNA, STAMM)).toHaveLength(0)
    expect(await geraeteFuerNutzer(ANNA, ORG_B)).toHaveLength(1)

    const e = await sendePushAnNutzer({
      userId: ANNA, organizationId: STAMM,
      nachricht: { title: 'T', body: 'B' }, optionen: { wartezeitMs: 0 },
    })
    expect(e.uebersprungen).toBe(true)
    expect(H.aufrufe).toHaveLength(0)
  })

  it('sendet nicht an die Geraete eines anderen Nutzers', async () => {
    await registriereGeraet({ userId: BERND, organizationId: STAMM, token: TOKEN_TABLET })
    await registriereGeraet({ userId: ANNA, organizationId: STAMM, token: TOKEN_HANDY })

    await sendePushAnNutzer({
      userId: ANNA, organizationId: STAMM,
      nachricht: { title: 'T', body: 'B' }, optionen: { wartezeitMs: 0 },
    })
    expect(H.aufrufe).toEqual([TOKEN_HANDY])
  })
})

// ═══════════════════════════════════════════════════════════════════
// 6) Widerspruch
// ═══════════════════════════════════════════════════════════════════

describe('Widerspruch', () => {
  beforeEach(async () => {
    await registriereGeraet({ userId: ANNA, organizationId: STAMM, token: TOKEN_HANDY })
  })

  it('erlaubt Push, solange keine Zeile existiert', async () => {
    expect(await pushErlaubt(ANNA, STAMM)).toMatchObject({ erlaubt: true })
  })

  it('sendet nach Abwahl nicht mehr', async () => {
    await setzePushErlaubnis(ANNA, STAMM, false)
    const e = await sendePushAnNutzer({
      userId: ANNA, organizationId: STAMM,
      nachricht: { title: 'T', body: 'B' }, optionen: { wartezeitMs: 0 },
    })
    expect(e.uebersprungen).toBe(true)
    expect(e.zugestellt).toBe(0)
    expect(H.aufrufe).toHaveLength(0)
  })

  it('sendet nach Ruecknahme der Abwahl wieder', async () => {
    await setzePushErlaubnis(ANNA, STAMM, false)
    await setzePushErlaubnis(ANNA, STAMM, true)
    const e = await sendePushAnNutzer({
      userId: ANNA, organizationId: STAMM,
      nachricht: { title: 'T', body: 'B' }, optionen: { wartezeitMs: 0 },
    })
    expect(e.zugestellt).toBe(1)
  })
})

// ═══════════════════════════════════════════════════════════════════
// 7) Fehlende Zugangsdaten
// ═══════════════════════════════════════════════════════════════════

describe('FCM nicht konfiguriert', () => {
  it('ueberspringt, statt einen Fehlversuch zu erzeugen', async () => {
    await registriereGeraet({ userId: ANNA, organizationId: STAMM, token: TOKEN_HANDY })
    delete process.env.FCM_CLIENT_EMAIL
    delete process.env.FCM_PRIVATE_KEY

    const e = await sendePushAnNutzer({
      userId: ANNA, organizationId: STAMM,
      nachricht: { title: 'T', body: 'B' }, optionen: { wartezeitMs: 0 },
    })
    expect(e.uebersprungen).toBe(true)
    expect(e.grund).toMatch(/Zugangsdaten/)
    expect(H.aufrufe).toHaveLength(0)
  })

  it('protokolliert den Vorgang als uebersprungen, nicht als fehlgeschlagen', async () => {
    await registriereGeraet({ userId: ANNA, organizationId: STAMM, token: TOKEN_HANDY })
    delete process.env.FCM_CLIENT_EMAIL
    delete process.env.FCM_PRIVATE_KEY

    const e = await sendePushIdempotent({
      userId: ANNA, organizationId: STAMM,
      correlationId: vorgangsId('booking-neu', BUCHUNG, ANNA),
      nachricht: { title: 'T', body: 'B' },
    })
    expect(e.status).toBe('uebersprungen')

    const { rows } = await db.query<{ status: string }>(
      `SELECT status FROM public.notification_delivery_log WHERE channel='push'`)
    expect(rows.map(r => r.status)).toEqual(['skipped'])
  })
})

// ═══════════════════════════════════════════════════════════════════
// 8) Zustellspur und Idempotenz
// ═══════════════════════════════════════════════════════════════════

describe('Zustellspur', () => {
  const VORGANG = () => vorgangsId('booking-neu', BUCHUNG, ANNA)

  beforeEach(async () => {
    await registriereGeraet({ userId: ANNA, organizationId: STAMM, token: TOKEN_HANDY })
  })

  it('schreibt eine Zeile mit Kanal push und Provider fcm', async () => {
    const e = await sendePushIdempotent({
      userId: ANNA, organizationId: STAMM, correlationId: VORGANG(),
      nachricht: { title: 'T', body: 'B' }, optionen: { wartezeitMs: 0 },
    })
    expect(e.status).toBe('versendet')

    const { rows } = await db.query<{ channel: string; provider: string; recipient: string; status: string }>(
      `SELECT channel, provider, recipient, status FROM public.notification_delivery_log`)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      channel: 'push', provider: 'fcm', recipient: ANNA, status: 'sent',
    })
  })

  it('sendet denselben Vorgang kein zweites Mal', async () => {
    await sendePushIdempotent({
      userId: ANNA, organizationId: STAMM, correlationId: VORGANG(),
      nachricht: { title: 'T', body: 'B' }, optionen: { wartezeitMs: 0 },
    })
    H.aufrufe = []

    const zweite = await sendePushIdempotent({
      userId: ANNA, organizationId: STAMM, correlationId: VORGANG(),
      nachricht: { title: 'T', body: 'B' }, optionen: { wartezeitMs: 0 },
    })
    expect(zweite.status).toBe('bereits_zugestellt')
    expect(H.aufrufe).toHaveLength(0)
  })

  it('haelt nativen Push und Web-Push auseinander', async () => {
    // Beide teilen sich den Kanal 'push'. Mit derselben Vorgangs-ID waere
    // der native Push nach einem erfolgreichen Web-Push still gesperrt.
    const fachlich = VORGANG()
    expect(pushVorgangsId(fachlich)).not.toBe(fachlich)

    await db.query(
      `INSERT INTO public.notification_delivery_log
         (organization_id, channel, recipient, status, provider, correlation_id)
       VALUES ($1, 'push', $2, 'sent', 'web_push', $3)`,
      [STAMM, ANNA, fachlich] as never[])

    const e = await sendePushIdempotent({
      userId: ANNA, organizationId: STAMM, correlationId: fachlich,
      nachricht: { title: 'T', body: 'B' }, optionen: { wartezeitMs: 0 },
    })
    expect(e.status).toBe('versendet')
    expect(H.aufrufe).toEqual([TOKEN_HANDY])
  })

  it('protokolliert einen Fehlversuch als failed und laesst ihn wiederholbar', async () => {
    H.antworten = [
      { status: 500, body: '{}' }, { status: 500, body: '{}' }, { status: 500, body: '{}' },
    ]
    const e = await sendePushIdempotent({
      userId: ANNA, organizationId: STAMM, correlationId: VORGANG(),
      nachricht: { title: 'T', body: 'B' }, optionen: { wartezeitMs: 0 },
    })
    expect(e.status).toBe('fehlgeschlagen')

    const { rows } = await db.query<{ status: string; sanitized_error: string | null }>(
      `SELECT status, sanitized_error FROM public.notification_delivery_log`)
    expect(rows[0].status).toBe('failed')
    expect(rows[0].sanitized_error).toBeTruthy()
  })
})
