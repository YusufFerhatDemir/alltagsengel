/**
 * PGlite: Befristung der Kontoüberwachung (20261024000000)
 *
 * Zwei Fragen, die nur echtes Postgres beantworten kann — eine Fake-DB
 * kennt weder ON CONFLICT noch einen CHECK:
 *
 *   TEIL 1 — Was ein UPSERT mit `created_at` macht (und was nicht).
 *            Daran hing der Befund vom 01.09.2026: die Frist leitete sich
 *            aus `created_at` ab, und ein Upsert ohne diese Spalte ließ
 *            das alte Datum stehen. Ein abgelaufener Eintrag war damit
 *            nicht wieder anzuordnen — „Einschalten" schrieb `aktiv =
 *            true`, die Frist war im selben Moment erneut vorbei, und die
 *            Oberfläche meldete trotzdem „Alarm ist aktiv".
 *
 *   TEIL 2 — Der CHECK aus der Migration. Sie ist am 01.09.2026 NICHT
 *            angewendet (live geprüft: `befristet_bis` gibt es nicht).
 *            Sobald sie es ist, lässt ein aktiver Eintrag ohne Fristende
 *            sich nicht mehr schreiben. Der Schreibweg muss die Spalte
 *            also mitschicken — sonst stünde die Verwaltung der
 *            Überwachungsliste ab dem Anwenden still, und zwar mit einem
 *            23514, der in keinen Spalten-Rückfall fällt (der prüft auf
 *            42703).
 *
 *   TEIL 3 — Rücknahme.
 */

import { PGlite } from '@electric-sql/pglite'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { HOECHSTDAUER_TAGE } from '@/lib/security/befristung'

const MIGRATIONS_DIR = path.join(__dirname, '..', '..', 'supabase', 'migrations')
const M_MATRIX = '20261018000000_rollenmatrix_sicherheit_lesen.sql'
const M_SPUR = '20261018000002_security_audit_log.sql'
const M_ALARM = '20261018000004_security_watchlist_kontoalarm.sql'
const M_FRIST = '20261024000000_watchlist_befristung.sql'
const R_FRIST = '20261024000001_rollback_watchlist_befristung.sql'

const ORG = 'aaaaaaaa-0000-4000-8000-000000000002'
const KONTO = '11111111-0000-4000-8000-000000000002'
const ZWEITES = '22222222-0000-4000-8000-000000000002'
const EINRICHTER = '44444444-0000-4000-8000-000000000002'

type Zeile = Record<string, unknown>

function lies(datei: string): string {
  return fs.readFileSync(path.join(MIGRATIONS_DIR, datei), 'utf8')
}

describe('PGlite: Befristung der Kontoüberwachung', () => {
  let db: InstanceType<typeof PGlite>

  async function zeilen(sql: string, params?: unknown[]): Promise<Zeile[]> {
    const r = await db.query(sql, params as never[])
    return (r?.rows ?? []) as Zeile[]
  }

  /** Der Upsert, den lib/security/watchlist.ts fährt. */
  async function upsert(felder: Record<string, unknown>): Promise<void> {
    const spalten = Object.keys(felder)
    const platz = spalten.map((_, i) => `$${i + 1}`)
    const setzen = spalten
      .filter(s => s !== 'user_id')
      .map(s => `${s} = EXCLUDED.${s}`)
      .join(', ')
    await db.query(
      `INSERT INTO public.security_watchlist (${spalten.join(', ')})
       VALUES (${platz.join(', ')})
       ON CONFLICT (user_id) DO UPDATE SET ${setzen}`,
      Object.values(felder) as never[],
    )
  }

  async function eintrag(userId: string): Promise<Zeile> {
    const r = await zeilen('SELECT * FROM public.security_watchlist WHERE user_id = $1', [userId])
    return r[0]
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
      CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
        SELECT coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb); $$;
      CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
        SELECT nullif(auth.jwt() ->> 'sub', '')::uuid; $$;

      CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, last_sign_in_at timestamptz);
      CREATE TABLE public.organizations (id uuid PRIMARY KEY, name text NOT NULL);
      CREATE TABLE public.profiles (
        id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
        role text NOT NULL, first_name text DEFAULT '', last_name text DEFAULT '',
        email text DEFAULT '', phone text DEFAULT '', organization_id uuid
      );
      CREATE TABLE public.organization_members (
        user_id uuid, organization_id uuid, created_at timestamptz DEFAULT now()
      );

      CREATE FUNCTION public.aktuelle_rolle() RETURNS text
        LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog AS $$
        SELECT role FROM public.profiles WHERE id = auth.uid(); $$;
      CREATE FUNCTION public.is_admin() RETURNS boolean
        LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog AS $$
        SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','superadmin')); $$;
      CREATE FUNCTION public.current_org_id() RETURNS uuid
        LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog AS $$
        SELECT organization_id FROM public.profiles WHERE id = auth.uid(); $$;
      CREATE FUNCTION public.rollen_matrix(p_rolle text) RETURNS text[]
        LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY[]::text[]; $$;
      CREATE FUNCTION public.darf(p_berechtigung text) RETURNS boolean
        LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog AS $$
        SELECT COALESCE(p_berechtigung = ANY (public.rollen_matrix(public.aktuelle_rolle())), false); $$;

      GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
    `)

    await db.exec(`
      INSERT INTO public.organizations (id, name) VALUES ('${ORG}', 'Organisation B');
      INSERT INTO auth.users (id, email) VALUES
        ('${KONTO}',      'konto@example.test'),
        ('${ZWEITES}',    'zweites@example.test'),
        ('${EINRICHTER}', 'einrichter@example.test');
      INSERT INTO public.profiles (id, role, email, organization_id) VALUES
        ('${KONTO}',      'engel', 'konto@example.test',      '${ORG}'),
        ('${ZWEITES}',    'engel', 'zweites@example.test',    '${ORG}'),
        ('${EINRICHTER}', 'admin', 'einrichter@example.test', '${ORG}');
    `)

    await db.exec(lies(M_MATRIX))
    await db.exec(lies(M_SPUR))
    await db.exec(lies(M_ALARM))
  }, 120_000)

  afterAll(async () => { await db?.close() })

  // ═══════════════════════════════════════════════════════════════════
  // TEIL 1 — was ein UPSERT mit created_at macht
  // ═══════════════════════════════════════════════════════════════════
  describe('Anlagedatum und Upsert', () => {
    it('ein Upsert OHNE created_at lässt das alte Datum stehen — das war der Befund', async () => {
      // Genau hier lag der Fehler: der Schreibweg listete `created_at`
      // nicht auf, ON CONFLICT DO UPDATE fasst nur die genannten Spalten
      // an, und die Frist hing an einer Spalte, die nie mitwanderte.
      await upsert({
        user_id: KONTO, organization_id: ORG, aktiv: false,
        grund: 'Erstanlage', angelegt_von: EINRICHTER,
        created_at: new Date(Date.now() - (HOECHSTDAUER_TAGE + 10) * 86_400_000).toISOString(),
      })
      const vorher = await eintrag(KONTO)

      await upsert({
        user_id: KONTO, organization_id: ORG, aktiv: true,
        grund: 'Wieder eingeschaltet', angelegt_von: EINRICHTER,
      })
      const nachher = await eintrag(KONTO)

      expect(nachher.aktiv).toBe(true)
      expect(String(nachher.grund)).toBe('Wieder eingeschaltet')
      // Das Datum ist dasselbe geblieben — der Eintrag ist im selben
      // Moment wieder abgelaufen, in dem er eingeschaltet wurde.
      expect(new Date(nachher.created_at as string).getTime())
        .toBe(new Date(vorher.created_at as string).getTime())

      const alterAlsHoechstdauer =
        Date.now() - new Date(nachher.created_at as string).getTime()
        > HOECHSTDAUER_TAGE * 86_400_000
      expect(alterAlsHoechstdauer).toBe(true)
    })

    it('ein Upsert MIT created_at setzt es neu — der Rückweg ist auf DB-Ebene möglich', async () => {
      const jetzt = new Date().toISOString()
      await upsert({
        user_id: KONTO, organization_id: ORG, aktiv: true,
        grund: 'Neu angeordnet', angelegt_von: EINRICHTER, created_at: jetzt,
      })
      const nach = await eintrag(KONTO)
      expect(new Date(nach.created_at as string).getTime()).toBe(new Date(jetzt).getTime())

      const restMs = new Date(nach.created_at as string).getTime()
        + HOECHSTDAUER_TAGE * 86_400_000 - Date.now()
      expect(restMs).toBeGreaterThan(0)
    })
  })

  // ═══════════════════════════════════════════════════════════════════
  // TEIL 2 — der CHECK aus 20261024000000
  // ═══════════════════════════════════════════════════════════════════
  describe('Nach dem Anwenden der Migration', () => {
    beforeAll(async () => { await db.exec(lies(M_FRIST)) })

    it('legt die vier Spalten an', async () => {
      const r = await zeilen(`
        SELECT column_name FROM information_schema.columns
         WHERE table_schema='public' AND table_name='security_watchlist'
           AND column_name IN ('befristet_bis','zweck','rechtsgrundlage','person_informiert_am')
      `)
      expect(r.map(x => x.column_name).sort()).toEqual(
        ['befristet_bis', 'person_informiert_am', 'rechtsgrundlage', 'zweck'],
      )
    })

    it('trägt beim Bestand die Frist nach, ohne sie zu verändern', async () => {
      const e = await eintrag(KONTO)
      const abstand = new Date(e.befristet_bis as string).getTime()
        - new Date(e.created_at as string).getTime()
      expect(abstand).toBe(HOECHSTDAUER_TAGE * 86_400_000)
    })

    it('ein AKTIVER Eintrag ohne Fristende ist nicht mehr schreibbar (23514)', async () => {
      // DAS ist der Grund, warum der Schreibweg `befristet_bis`
      // mitschicken MUSS. Der alte Code hätte hier jedes Einschalten
      // verloren — und der Fehler ist kein 42703, fällt also durch keinen
      // Spalten-Rückfall.
      let code: string | null = null
      try {
        await upsert({
          user_id: ZWEITES, organization_id: ORG, aktiv: true,
          grund: 'Ohne Frist', angelegt_von: EINRICHTER,
        })
      } catch (e) {
        code = (e as { code?: string }).code ?? String(e)
      }
      expect(code).toBe('23514')
      expect(await eintrag(ZWEITES)).toBeUndefined()
    })

    it('mit Fristende geht derselbe Schreibvorgang durch', async () => {
      const ende = new Date(Date.now() + HOECHSTDAUER_TAGE * 86_400_000).toISOString()
      await upsert({
        user_id: ZWEITES, organization_id: ORG, aktiv: true,
        grund: 'Mit Frist', angelegt_von: EINRICHTER, befristet_bis: ende,
      })
      const e = await eintrag(ZWEITES)
      expect(e.aktiv).toBe(true)
      expect(new Date(e.befristet_bis as string).getTime()).toBe(new Date(ende).getTime())
    })

    it('ein ABGESCHALTETER Eintrag darf ohne Fristende bestehen', async () => {
      // Der CHECK fragt nur nach aktiven Einträgen: eine beendete
      // Maßnahme braucht kein Ende in der Zukunft.
      await upsert({
        user_id: ZWEITES, organization_id: ORG, aktiv: false,
        grund: 'Beendet', angelegt_von: EINRICHTER, befristet_bis: null,
      })
      const e = await eintrag(ZWEITES)
      expect(e.aktiv).toBe(false)
      expect(e.befristet_bis).toBeNull()
    })
  })

  // ═══════════════════════════════════════════════════════════════════
  // TEIL 3 — Rücknahme
  // ═══════════════════════════════════════════════════════════════════
  describe('Rollback', () => {
    it('nimmt CHECK und Spalten zurück', async () => {
      await db.exec(lies(R_FRIST))

      const spalten = await zeilen(`
        SELECT column_name FROM information_schema.columns
         WHERE table_schema='public' AND table_name='security_watchlist'
           AND column_name IN ('befristet_bis','zweck','rechtsgrundlage','person_informiert_am')
      `)
      expect(spalten).toHaveLength(0)

      const check = await zeilen(`
        SELECT conname FROM pg_constraint
         WHERE conname = 'security_watchlist_aktiv_braucht_frist'
      `)
      expect(check).toHaveLength(0)

      // Und danach schreibt der alte Weg wieder — die Rücknahme darf die
      // Liste nicht unbenutzbar zurücklassen.
      await upsert({
        user_id: ZWEITES, organization_id: ORG, aktiv: true,
        grund: 'Nach Rollback', angelegt_von: EINRICHTER,
      })
      expect((await eintrag(ZWEITES)).aktiv).toBe(true)
    })
  })
})
