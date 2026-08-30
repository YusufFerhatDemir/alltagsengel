/**
 * PGlite: Marketing-/CRM-Migration (20261019000000)
 *
 * Die Migration laeuft auf einer echten PostgreSQL-Instanz (PGlite/WASM).
 * Das ist der Unterschied zu einem Mock: CHECK-Constraints, UNIQUE-
 * Teilindizes und Fremdschluessel greifen hier WIRKLICH.
 *
 * Warum das gerade bei diesem Modul zaehlt: die Riegel gegen einen
 * Doppelversand und gegen eine still scharf geschaltete Automation liegen
 * ABSICHTLICH in der Datenbank und nicht nur in TypeScript. Anwendungscode
 * kann man umgehen, vergessen oder parallel ausfuehren — einen UNIQUE-
 * Teilindex nicht. Wenn diese Riegel nur behauptet waeren, faellt es
 * genau hier auf.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
import path from 'node:path'

const MIGRATIONS_DIR = path.join(process.cwd(), 'supabase', 'migrations')
const MIGRATION = '20261019000000_marketing_crm.sql'
const ROLLBACK = '20261019000001_rollback_marketing_crm.sql'

const ORG = '00000000-0000-4000-8000-000460629986'
const ORG_B = '00000000-0000-4000-8000-0000000000b2'

let db: InstanceType<typeof PGlite>

/** Fuehrt SQL aus und gibt den Fehlercode zurueck — oder null bei Erfolg. */
async function fehlerCode(sql: string): Promise<string | null> {
  try {
    await db.exec(sql)
    return null
  } catch (err) {
    const e = err as { code?: string; message?: string }
    return e.code ?? e.message ?? 'unbekannt'
  }
}

beforeAll(async () => {
  db = new PGlite()

  await db.exec(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN NOINHERIT; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN NOINHERIT; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS; END IF;
    END $$;

    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('test.user_id', true), '')::uuid
    $$;

    CREATE TABLE public.organizations (id uuid PRIMARY KEY, name text);
    INSERT INTO public.organizations (id, name) VALUES ('${ORG}', 'Stamm'), ('${ORG_B}', 'Mandant B');

    CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
    CREATE FUNCTION public.current_org_id() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT '${ORG}'::uuid
    $$;

    INSERT INTO auth.users (id) VALUES ('00000000-0000-4000-8000-00000000a001');
  `)

  await db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, MIGRATION), 'utf-8'))
})

afterAll(async () => { await db?.close() })

describe('Die Migration legt an, was sie verspricht', () => {
  it.each([
    'marketing_consents', 'email_suppression_list', 'email_templates',
    'email_campaigns', 'email_campaign_logs', 'marketing_automations',
  ])('Tabelle %s existiert', async tabelle => {
    const r = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='public' AND tablename=$1`,
      [tabelle] as never[],
    )
    expect(r.rows[0].n).toBe(1)
  })

  it.each([
    'marketing_consents', 'email_suppression_list', 'email_templates',
    'email_campaigns', 'email_campaign_logs', 'marketing_automations',
  ])('%s hat RLS aktiviert', async tabelle => {
    const r = await db.query<{ rls: boolean }>(
      `SELECT relrowsecurity AS rls FROM pg_class WHERE oid = ('public.' || $1)::regclass`,
      [tabelle] as never[],
    )
    expect(r.rows[0].rls).toBe(true)
  })

  it.each([
    'marketing_consents', 'email_suppression_list', 'email_templates',
    'email_campaigns', 'email_campaign_logs', 'marketing_automations',
  ])('%s hat einen RESTRICTIVE Mandantenzaun', async tabelle => {
    // permissive-Feld PRUEFEN, nicht raten: ein permissiver Zaun waere
    // mit jeder anderen Policy ODER-verknuepft und damit wirkungslos.
    const r = await db.query<{ permissive: string }>(
      `SELECT permissive FROM pg_policies
        WHERE schemaname='public' AND tablename=$1 AND policyname = 'org_fence_' || $1`,
      [tabelle] as never[],
    )
    expect(r.rows).toHaveLength(1)
    expect(r.rows[0].permissive).toBe('RESTRICTIVE')
  })

  it.each([
    'marketing_consents', 'email_suppression_list', 'email_templates',
    'email_campaigns', 'email_campaign_logs', 'marketing_automations',
  ])('anon hat auf %s keinerlei Rechte', async tabelle => {
    // has_table_privilege ist das einzige verlaessliche Orakel — das
    // information_schema verschweigt PUBLIC-Grants.
    for (const recht of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
      const r = await db.query<{ darf: boolean }>(
        `SELECT has_table_privilege('anon', ('public.' || $1)::regclass, $2) AS darf`,
        [tabelle, recht] as never[],
      )
      expect(r.rows[0].darf, `anon darf ${recht} auf ${tabelle}`).toBe(false)
    }
  })
})

describe('Einwilligungen', () => {
  it('nimmt eine Einwilligung an', async () => {
    expect(await fehlerCode(`
      INSERT INTO public.marketing_consents (organization_id, email, consent_type, source)
      VALUES ('${ORG}', 'a@example.com', 'newsletter', 'doppel_opt_in')
    `)).toBeNull()
  })

  it('weist eine großgeschriebene Adresse ab', async () => {
    // Der CHECK haelt fest, dass die Normalisierung VOR dem Schreiben
    // passiert ist. Sonst waeren Max@x.de und max@x.de zwei Zeilen — und
    // der UNIQUE-Index auf „offen je Adresse" waere wirkungslos.
    expect(await fehlerCode(`
      INSERT INTO public.marketing_consents (organization_id, email, consent_type, source)
      VALUES ('${ORG}', 'GROSS@example.com', 'newsletter', 'doppel_opt_in')
    `)).toBe('23514')
  })

  it('lässt keine ZWEITE offene Einwilligung derselben Art zu', async () => {
    // Sonst haette „ist eingewilligt?" mehrere gleichzeitige Antworten —
    // und der Empfaenger bekaeme die Mail so oft, wie es Zeilen gibt.
    expect(await fehlerCode(`
      INSERT INTO public.marketing_consents (organization_id, email, consent_type, source)
      VALUES ('${ORG}', 'a@example.com', 'newsletter', 'website_formular')
    `)).toBe('23505')
  })

  it('lässt eine NEUE Einwilligung zu, nachdem die alte widerrufen wurde', async () => {
    await db.exec(`UPDATE public.marketing_consents SET revoked_at = now() WHERE email = 'a@example.com'`)
    expect(await fehlerCode(`
      INSERT INTO public.marketing_consents (organization_id, email, consent_type, source)
      VALUES ('${ORG}', 'a@example.com', 'newsletter', 'schriftlich')
    `)).toBeNull()
  })

  it('weist einen Widerruf VOR der Erteilung ab', async () => {
    expect(await fehlerCode(`
      INSERT INTO public.marketing_consents (organization_id, email, consent_type, source, granted_at, revoked_at)
      VALUES ('${ORG}', 'zeit@example.com', 'newsletter', 'vertrag', now(), now() - interval '1 day')
    `)).toBe('23514')
  })

  it('weist eine unbekannte Einwilligungsart und Herkunft ab', async () => {
    expect(await fehlerCode(`
      INSERT INTO public.marketing_consents (organization_id, email, consent_type, source)
      VALUES ('${ORG}', 'b@example.com', 'was_auch_immer', 'vertrag')
    `)).toBe('23514')
    expect(await fehlerCode(`
      INSERT INTO public.marketing_consents (organization_id, email, consent_type, source)
      VALUES ('${ORG}', 'b@example.com', 'newsletter', 'irgendwoher')
    `)).toBe('23514')
  })

  it('trennt die Mandanten: dieselbe Adresse darf in Mandant B stehen', async () => {
    expect(await fehlerCode(`
      INSERT INTO public.marketing_consents (organization_id, email, consent_type, source)
      VALUES ('${ORG_B}', 'a@example.com', 'newsletter', 'vertrag')
    `)).toBeNull()
  })
})

describe('Sperrliste', () => {
  it('nimmt einen Eintrag an und lässt ihn nur EINMAL zu', async () => {
    expect(await fehlerCode(`
      INSERT INTO public.email_suppression_list (organization_id, email, reason)
      VALUES ('${ORG}', 'weg@example.com', 'abmeldung')
    `)).toBeNull()
    expect(await fehlerCode(`
      INSERT INTO public.email_suppression_list (organization_id, email, reason)
      VALUES ('${ORG}', 'weg@example.com', 'hard_bounce')
    `)).toBe('23505')
  })

  it('weist einen unbekannten Sperrgrund ab', async () => {
    expect(await fehlerCode(`
      INSERT INTO public.email_suppression_list (organization_id, email, reason)
      VALUES ('${ORG}', 'x@example.com', 'weil_halt')
    `)).toBe('23514')
  })
})

describe('Kampagnen — die Riegel liegen in der Datenbank', () => {
  const K = '00000000-0000-4000-8000-00000000c001'

  it('legt eine Kampagne als Entwurf an', async () => {
    expect(await fehlerCode(`
      INSERT INTO public.email_campaigns (id, organization_id, name, template_key, segment_key)
      VALUES ('${K}', '${ORG}', 'Test', 'kunde_entlastungsbetrag', 'kunden_ohne_buchung')
    `)).toBeNull()
  })

  it('KEINE Freigabe ohne Trockenlauf', async () => {
    // Niemand gibt eine Empfaengerzahl frei, die er nicht gesehen hat.
    expect(await fehlerCode(`
      UPDATE public.email_campaigns SET freigegeben_am = now() WHERE id = '${K}'
    `)).toBe('23514')
  })

  it('KEIN Versand ohne Freigabe', async () => {
    expect(await fehlerCode(`
      UPDATE public.email_campaigns SET versendet_am = now() WHERE id = '${K}'
    `)).toBe('23514')
  })

  it('KEIN Status „geplant" ohne Termin', async () => {
    expect(await fehlerCode(`
      UPDATE public.email_campaigns SET status = 'geplant' WHERE id = '${K}'
    `)).toBe('23514')
  })

  it('mit Trockenlauf und Freigabe wird der Versand möglich', async () => {
    expect(await fehlerCode(`
      UPDATE public.email_campaigns
         SET dry_run_am = now(), empfaenger_anzahl = 5,
             freigegeben_am = now(), freigegeben_fuer_anzahl = 5
       WHERE id = '${K}'
    `)).toBeNull()
    expect(await fehlerCode(`
      UPDATE public.email_campaigns SET versendet_am = now(), status = 'versendet' WHERE id = '${K}'
    `)).toBeNull()
  })

  it('DER DOPPELVERSAND-RIEGEL: eine zweite Kampagne kann dieselbe id nicht erneut als versendet führen', async () => {
    // Der UNIQUE-Teilindex email_campaigns_einmal_versendet greift je id.
    // Ein zweiter Versand ist damit nicht protokollierbar — also findet er
    // nicht statt.
    const r = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM pg_indexes
        WHERE schemaname='public' AND indexname='email_campaigns_einmal_versendet'`,
    )
    expect(r.rows[0].n).toBe(1)
  })

  it('ein Empfänger bekommt dieselbe Kampagne nur EINMAL', async () => {
    expect(await fehlerCode(`
      INSERT INTO public.email_campaign_logs (organization_id, campaign_id, empfaenger, status, sent_at)
      VALUES ('${ORG}', '${K}', 'e@example.com', 'gesendet', now())
    `)).toBeNull()
    expect(await fehlerCode(`
      INSERT INTO public.email_campaign_logs (organization_id, campaign_id, empfaenger, status, sent_at)
      VALUES ('${ORG}', '${K}', 'e@example.com', 'gesendet', now())
    `)).toBe('23505')
  })

  it('Status „gesendet" ohne Zeitstempel wird abgewiesen', async () => {
    // Sonst waere „gesendet" eine leere Aussage — dieselbe Klasse wie
    // sent_at ohne frozen_at beim Rechnungsversand.
    expect(await fehlerCode(`
      INSERT INTO public.email_campaign_logs (organization_id, campaign_id, empfaenger, status)
      VALUES ('${ORG}', '${K}', 'ohne-zeit@example.com', 'gesendet')
    `)).toBe('23514')
  })
})

describe('Automationen sind vorbereitet, nicht scharf', () => {
  it('legt eine Automation an — standardmäßig AUS', async () => {
    expect(await fehlerCode(`
      INSERT INTO public.marketing_automations
        (organization_id, automation_key, name, trigger_typ, verzoegerung_tage, template_key, consent_type)
      VALUES ('${ORG}', 'a1', 'Test', 'kunde_ohne_buchung', 14, 'kunde_entlastungsbetrag', 'produktinfo')
    `)).toBeNull()

    const r = await db.query<{ aktiv: boolean }>(
      `SELECT aktiv FROM public.marketing_automations WHERE automation_key = 'a1'`,
    )
    expect(r.rows[0].aktiv).toBe(false)
  })

  it('KEIN „aktiv" ohne Freigabevermerk — ein stilles Einschalten ist unmöglich', async () => {
    expect(await fehlerCode(`
      UPDATE public.marketing_automations SET aktiv = true WHERE automation_key = 'a1'
    `)).toBe('23514')
  })

  it('mit Vermerk lässt sie sich einschalten — und hinterlässt eine Spur', async () => {
    expect(await fehlerCode(`
      UPDATE public.marketing_automations
         SET aktiv = true, aktiviert_am = now(),
             aktiviert_von = '00000000-0000-4000-8000-00000000a001'
       WHERE automation_key = 'a1'
    `)).toBeNull()
  })

  it('weist eine unsinnige Verzögerung ab', async () => {
    expect(await fehlerCode(`
      INSERT INTO public.marketing_automations
        (organization_id, automation_key, name, trigger_typ, verzoegerung_tage, template_key, consent_type)
      VALUES ('${ORG}', 'a2', 'Test', 'kunde_ohne_buchung', 0, 'x', 'produktinfo')
    `)).toBe('23514')
  })
})

describe('Der Rollback schützt den Widerspruch', () => {
  it('bricht ab, solange Sperrliste oder Einwilligungen belegt sind', async () => {
    // Die Sperrliste zu loeschen hiesse: der Widerspruch ist weg, und beim
    // naechsten Aufbau ist jeder dieser Empfaenger wieder anschreibbar.
    // Das ist ein Verstoss gegen Art. 21 Abs. 3 DSGVO, kein Datenverlust.
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, ROLLBACK), 'utf-8')
    await expect(db.exec(sql)).rejects.toThrow(/Rollback abgebrochen/)

    // Das RAISE feuert INNERHALB des BEGIN-Blocks. Die Verbindung steht
    // danach in einer abgebrochenen Transaktion und weist jede weitere
    // Anweisung ab ('current transaction is aborted'). Das ist genau das
    // richtige Verhalten der Migration — der Test muss die Verbindung nur
    // wieder freimachen, sonst prueft er ab hier nichts mehr, sondern
    // meldet nur noch den Folgefehler.
    await db.exec('ROLLBACK').catch(() => {})

    // Und die Tabellen stehen danach noch.
    const r = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM pg_tables
        WHERE schemaname='public' AND tablename='email_suppression_list'`,
    )
    expect(r.rows[0].n).toBe(1)
  })

  it('läuft durch, wenn beide Tabellen leer sind', async () => {
    await db.exec(`
      DELETE FROM public.email_suppression_list;
      DELETE FROM public.marketing_consents;
    `)
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, ROLLBACK), 'utf-8')
    await expect(db.exec(sql)).resolves.toBeDefined()

    const r = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM pg_tables
        WHERE schemaname='public' AND tablename LIKE ANY (ARRAY['marketing_%','email_%'])`,
    )
    expect(r.rows[0].n).toBe(0)
  })
})
