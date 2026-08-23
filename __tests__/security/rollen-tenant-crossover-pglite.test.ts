/**
 * PGlite: Rollenmodell gegen echte Zeilen zweier Mandanten
 *
 * WARUM NOCH EIN PGLITE-TEST
 * rollenkonzept-pglite.test.ts prueft, DASS die Policies aus Migration
 * 20260924000000 existieren und wie sie heissen. Was es nicht prueft:
 * ob sie an echten Zeilen halten, was sie versprechen. Eine Policy, die
 * `organization_id = public.current_org_id()` im Text traegt, ist noch
 * kein Nachweis — current_org_id() kann fuer den Angreifer etwas anderes
 * liefern als gedacht (der Fallback auf die Stamm-Org ist genau so ein
 * Fall), und ein Policy-Text sagt nichts darueber, ob eine zweite,
 * grosszuegigere Policy daneben steht.
 *
 * Hier laufen deshalb ZWEI Mandanten mit je eigenen Zeilen und acht
 * Konten gegeneinander. Geprueft werden die Angriffswege:
 *
 *   1. Mandantenuebergriff lesend  (Org A liest Zeilen von Org B)
 *   2. Objekt-ID-Manipulation      (gezielt die fremde ID abfragen)
 *   3. Mandantenuebergriff schreibend (UPDATE/INSERT in die fremde Org)
 *   4. Fachliche Trennung          (Buchhaltung ↔ Pflege, PDL ↔ Bank)
 *   5. Rechteausweitung            (Selbstbefoerderung per UPDATE)
 *   6. Revisionsspuren             (kein Schreibweg fuer Fachrollen)
 *   7. service_role                (umgeht alles — bewusst, mit Folge)
 *
 * Der Aufbau spiegelt Produktion: current_org_id() WORTGLEICH aus
 * Migration 20260922020000 (inkl. Stamm-Org-Fallback), darf() und die
 * Policies wortgleich aus 20260924000000.
 */

import { PGlite } from '@electric-sql/pglite'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { BERECHTIGUNGEN } from '@/lib/auth/rollen'
import { funktionAusMigration } from '../helpers/sql-extract'

const MIGRATIONS_DIR = path.join(__dirname, '..', '..', 'supabase', 'migrations')
const ROLLENKONZEPT = '20260924000000_rollenkonzept_least_privilege.sql'
const HOCH1 = '20260922020000_hoch1_mandantentrennung.sql'

const STAMM_ORG = '00000000-0000-4000-8000-000460629986'
const ORG_A = 'aaaaaaaa-0000-4000-8000-000000000001'
const ORG_B = 'bbbbbbbb-0000-4000-8000-000000000001'

// Acht Konten: sieben Rollen in Org A, dazu eine Buchhaltung in Org B.
const ADMIN_A = '10000000-0000-4000-8000-000000000001'
const PDL_A = '20000000-0000-4000-8000-000000000001'
const QM_A = '30000000-0000-4000-8000-000000000001'
const BUCH_A = '40000000-0000-4000-8000-000000000001'
const ENGEL_A = '50000000-0000-4000-8000-000000000001'
const KUNDE_A = '60000000-0000-4000-8000-000000000001'
const ANGEH_A = '70000000-0000-4000-8000-000000000001'
const BUCH_B = '80000000-0000-4000-8000-000000000001'

const RECHNUNG_A = 'a1a1a1a1-0000-4000-8000-000000000001'
const RECHNUNG_B = 'b1b1b1b1-0000-4000-8000-000000000001'
const MANDAT_A = 'a2a2a2a2-0000-4000-8000-000000000001'
const MANDAT_B = 'b2b2b2b2-0000-4000-8000-000000000001'
const PFLEGE_A = 'a3a3a3a3-0000-4000-8000-000000000001'
const PFLEGE_B = 'b3b3b3b3-0000-4000-8000-000000000001'

type Zeile = Record<string, unknown>
type Fehler = { code?: string; message?: string } | undefined

describe('PGlite: Rollenmodell gegen zwei Mandanten', () => {
  let db: InstanceType<typeof PGlite>

  async function alsNutzer(userId: string | null, sql: string, params?: unknown[]) {
    try {
      const ergebnis = await db.transaction(async (tx) => {
        await tx.exec(
          `SET LOCAL ROLE ${userId ? 'authenticated' : 'anon'};` +
          (userId
            ? `SET LOCAL request.jwt.claims = '${JSON.stringify({ sub: userId, role: 'authenticated' })}';`
            : ''),
        )
        return tx.query(sql, params)
      })
      return { rows: ergebnis.rows as Zeile[], error: undefined as Fehler }
    } catch (e: unknown) {
      return { rows: [] as Zeile[], error: e as Fehler }
    }
  }

  /** Wie viele Zeilen der Tabelle sieht dieses Konto? */
  async function sichtbar(userId: string, tabelle: string): Promise<number> {
    const { rows } = await alsNutzer(userId, `SELECT count(*)::int AS n FROM public.${tabelle}`)
    return (rows[0]?.n as number | undefined) ?? 0
  }

  beforeAll(async () => {
    db = new PGlite()

    await db.exec(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN NOINHERIT; END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN NOINHERIT; END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS; END IF;
      END $$;
    `)

    await db.exec(`
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
        SELECT coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
      $$;
      CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
        SELECT nullif(auth.jwt() ->> 'sub', '')::uuid;
      $$;
      GRANT USAGE ON SCHEMA auth TO authenticated, anon, service_role;
      GRANT EXECUTE ON FUNCTION auth.jwt() TO authenticated, anon, service_role;
      GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, anon, service_role;

      GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
    `)

    await db.exec(`
      CREATE TABLE public.profiles (
        id uuid PRIMARY KEY,
        role text NOT NULL CHECK (role IN ('kunde','engel','admin','superadmin','fahrer')),
        deleted_at timestamptz
      );
      CREATE TABLE public.organization_members (
        user_id uuid NOT NULL,
        organization_id uuid NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE public.caregivers (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid, organization_id uuid
      );
      CREATE TABLE public.clients (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid, organization_id uuid, first_name text
      );
      CREATE TABLE public.invoices (
        id uuid PRIMARY KEY, organization_id uuid NOT NULL, total_amount numeric, status text
      );
      CREATE TABLE public.sepa_mandates (
        id uuid PRIMARY KEY, organization_id uuid NOT NULL, iban text
      );
      CREATE TABLE public.pflege_verlauf (
        id uuid PRIMARY KEY, organization_id uuid NOT NULL, notiz text
      );
      CREATE TABLE public.service_records (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, status text
      );
      CREATE TABLE public.billing_tariffs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, satz numeric
      );
      CREATE TABLE public.audit_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, aktion text
      );
    `)

    // is_admin() wie im Bestand.
    await db.exec(`
      CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean
      LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
        SELECT EXISTS (
          SELECT 1 FROM public.profiles
          WHERE id = auth.uid() AND role = ANY (ARRAY['admin','superadmin']) AND deleted_at IS NULL
        );
      $$;
      GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated, service_role;
    `)

    // current_org_id() WORTGLEICH aus der Produktionsmigration — samt
    // Stamm-Org-Fallback. Eine abgeschriebene Variante wuerde genau den
    // Fall verdecken, den man hier sehen will.
    await db.exec(funktionAusMigration(HOCH1, 'current_org_id') + ';')
    await db.exec(`GRANT EXECUTE ON FUNCTION public.current_org_id() TO anon, authenticated, service_role;`)

    // Bestandstrigger (die Migration ersetzt nur ihre Funktionen).
    await db.exec(`
      CREATE OR REPLACE FUNCTION public.prevent_role_escalation() RETURNS trigger
      LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
      BEGIN
        IF NEW.role IS NOT DISTINCT FROM OLD.role THEN RETURN NEW; END IF;
        IF coalesce(current_setting('request.jwt.claims', true), '') = '' THEN RETURN NEW; END IF;
        IF NOT public.is_admin() THEN RAISE EXCEPTION 'Rollenwechsel nicht erlaubt'; END IF;
        RETURN NEW;
      END; $$;

      CREATE OR REPLACE FUNCTION public.prevent_privileged_role_insert() RETURNS trigger
      LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
      BEGIN RETURN NEW; END; $$;

      CREATE TRIGGER trg_prevent_role_escalation
        BEFORE UPDATE ON public.profiles
        FOR EACH ROW EXECUTE FUNCTION public.prevent_role_escalation();
    `)

    // ── Die Migration unter Test ──
    await db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, ROLLENKONZEPT), 'utf-8'))

    // profiles selbst braucht eine Lesepolicy, sonst kaeme aktuelle_rolle()
    // nicht an die eigene Zeile. In Produktion existiert sie seit je.
    await db.exec(`
      ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
      CREATE POLICY profiles_selbst_lesen ON public.profiles FOR SELECT USING (id = auth.uid());
      -- Diese drei Policies gibt es in Produktion seit der Registrierung:
      -- jedes Konto pflegt seine eigene Zeile, die Administration pflegt
      -- die Konten ihrer Organisation. Ohne sie liefe jeder
      -- Rechteausweitungs-Versuch unten ins Leere, weil RLS schon keine
      -- Zeile traefe — und der Test wuerde eine Sperre bestaetigen, die
      -- gar nicht der Trigger ist.
      CREATE POLICY profiles_selbst_aendern ON public.profiles FOR UPDATE
        USING (id = auth.uid()) WITH CHECK (id = auth.uid());
      CREATE POLICY profiles_selbst_anlegen ON public.profiles FOR INSERT
        WITH CHECK (id = auth.uid());
      CREATE POLICY profiles_admin ON public.profiles FOR ALL
        USING (public.is_admin()) WITH CHECK (public.is_admin());
    `)

    await db.exec(`
      INSERT INTO public.profiles (id, role) VALUES
        ('${ADMIN_A}','admin'), ('${PDL_A}','pdl'), ('${QM_A}','qm'), ('${BUCH_A}','buchhaltung'),
        ('${ENGEL_A}','engel'), ('${KUNDE_A}','kunde'), ('${ANGEH_A}','angehoerige'),
        ('${BUCH_B}','buchhaltung');

      INSERT INTO public.organization_members (user_id, organization_id) VALUES
        ('${ADMIN_A}','${ORG_A}'), ('${PDL_A}','${ORG_A}'), ('${QM_A}','${ORG_A}'),
        ('${BUCH_A}','${ORG_A}'), ('${ENGEL_A}','${ORG_A}'), ('${KUNDE_A}','${ORG_A}'),
        ('${ANGEH_A}','${ORG_A}'), ('${BUCH_B}','${ORG_B}');

      INSERT INTO public.invoices (id, organization_id, total_amount, status) VALUES
        ('${RECHNUNG_A}','${ORG_A}', 131, 'entwurf'),
        ('${RECHNUNG_B}','${ORG_B}', 999, 'entwurf');
      INSERT INTO public.sepa_mandates (id, organization_id, iban) VALUES
        ('${MANDAT_A}','${ORG_A}','DE00 0000 0000 0000 0000 00'),
        ('${MANDAT_B}','${ORG_B}','DE11 1111 1111 1111 1111 11');
      INSERT INTO public.pflege_verlauf (id, organization_id, notiz) VALUES
        ('${PFLEGE_A}','${ORG_A}','Wunde links'),
        ('${PFLEGE_B}','${ORG_B}','Wunde rechts');
      INSERT INTO public.audit_logs (organization_id, aktion) VALUES
        ('${ORG_A}','anlegen'), ('${ORG_B}','anlegen');
    `)
  }, 60000)

  afterAll(async () => {
    await db?.close()
  })

  // ═══════════════════════════════════════════════════════════════════
  it('Aufbau: jedes Konto loest auf seine eigene Organisation auf', async () => {
    for (const [konto, erwartet] of [
      [ADMIN_A, ORG_A], [PDL_A, ORG_A], [QM_A, ORG_A], [BUCH_A, ORG_A],
      [ENGEL_A, ORG_A], [KUNDE_A, ORG_A], [ANGEH_A, ORG_A], [BUCH_B, ORG_B],
    ] as const) {
      const { rows } = await alsNutzer(konto, 'SELECT public.current_org_id() AS org')
      expect(rows[0]?.org, konto).toBe(erwartet)
    }
  })

  // ── 1. Mandantenuebergriff lesend ──────────────────────────────────
  describe('Angriff: Mandantenuebergriff', () => {
    it('Buchhaltung Org A sieht genau eine Rechnung — die eigene', async () => {
      expect(await sichtbar(BUCH_A, 'invoices')).toBe(1)
      const { rows } = await alsNutzer(BUCH_A, 'SELECT id FROM public.invoices')
      expect(rows[0].id).toBe(RECHNUNG_A)
    })

    it('Buchhaltung Org B sieht genau die andere', async () => {
      const { rows } = await alsNutzer(BUCH_B, 'SELECT id FROM public.invoices')
      expect(rows).toHaveLength(1)
      expect(rows[0].id).toBe(RECHNUNG_B)
    })

    it('auch die Administration kommt nicht in den fremden Mandanten', async () => {
      // Die Berechtigung ist nicht die Mandantengrenze. Ein Admin ist
      // Admin SEINER Organisation.
      const { rows } = await alsNutzer(ADMIN_A, 'SELECT id FROM public.invoices')
      expect(rows.map(r => r.id)).toEqual([RECHNUNG_A])
    })

    it('Bankdaten und Pflegedaten bleiben ebenso mandantengetrennt', async () => {
      expect(await sichtbar(BUCH_A, 'sepa_mandates')).toBe(1)
      expect(await sichtbar(PDL_A, 'pflege_verlauf')).toBe(1)
      expect(await sichtbar(ADMIN_A, 'audit_logs')).toBe(1)
    })
  })

  // ── 2. Objekt-ID-Manipulation ──────────────────────────────────────
  describe('Angriff: fremde Objekt-ID gezielt abfragen', () => {
    it('die fremde Rechnung ist ueber ihre ID nicht erreichbar', async () => {
      const { rows } = await alsNutzer(BUCH_A, 'SELECT * FROM public.invoices WHERE id = $1', [RECHNUNG_B])
      expect(rows).toHaveLength(0)
    })

    it('das fremde SEPA-Mandat ebenso wenig — auch die IBAN bleibt unsichtbar', async () => {
      const { rows } = await alsNutzer(BUCH_A, 'SELECT iban FROM public.sepa_mandates WHERE id = $1', [MANDAT_B])
      expect(rows).toHaveLength(0)
    })

    it('ein Aggregat verraet die fremde Zeile auch nicht indirekt', async () => {
      // count()/sum() laufen ueber dieselbe Policy — ein Angreifer kann
      // also nicht ueber Summen auf fremde Betraege schliessen.
      const { rows } = await alsNutzer(BUCH_A, 'SELECT coalesce(sum(total_amount),0)::int AS s FROM public.invoices')
      expect(rows[0].s).toBe(131)
    })
  })

  // ── 3. Mandantenuebergriff schreibend ──────────────────────────────
  describe('Angriff: in den fremden Mandanten schreiben', () => {
    it('UPDATE auf die fremde Rechnung trifft keine Zeile', async () => {
      const { rows, error } = await alsNutzer(
        BUCH_A,
        `UPDATE public.invoices SET total_amount = 1 WHERE id = $1 RETURNING id`,
        [RECHNUNG_B],
      )
      expect(error).toBeUndefined()
      expect(rows).toHaveLength(0)

      const { rows: unveraendert } = await alsNutzer(BUCH_B, 'SELECT total_amount FROM public.invoices WHERE id = $1', [RECHNUNG_B])
      expect(Number(unveraendert[0].total_amount)).toBe(999)
    })

    it('INSERT mit fremder organization_id wird abgewiesen', async () => {
      const { error } = await alsNutzer(
        BUCH_A,
        `INSERT INTO public.invoices (id, organization_id, total_amount, status)
         VALUES (gen_random_uuid(), $1, 1, 'entwurf')`,
        [ORG_B],
      )
      expect(error).toBeDefined()
      expect(String(error?.message)).toMatch(/row-level security/i)
    })

    it('DELETE auf die fremde Rechnung trifft keine Zeile', async () => {
      const { rows } = await alsNutzer(BUCH_A, 'DELETE FROM public.invoices WHERE id = $1 RETURNING id', [RECHNUNG_B])
      expect(rows).toHaveLength(0)
      expect(await sichtbar(BUCH_B, 'invoices')).toBe(1)
    })

    it('ein INSERT in die EIGENE Organisation geht weiterhin — Gegenprobe', async () => {
      const { error } = await alsNutzer(
        BUCH_A,
        `INSERT INTO public.invoices (id, organization_id, total_amount, status)
         VALUES (gen_random_uuid(), $1, 5, 'entwurf')`,
        [ORG_A],
      )
      expect(error).toBeUndefined()
      expect(await sichtbar(BUCH_A, 'invoices')).toBe(2)
      await db.exec(`DELETE FROM public.invoices WHERE id <> '${RECHNUNG_A}' AND organization_id = '${ORG_A}'`)
    })
  })

  // ── 4. Fachliche Trennung ──────────────────────────────────────────
  describe('Fachliche Trennung an echten Zeilen', () => {
    it('Buchhaltung sieht KEINE Pflegedokumentation', async () => {
      expect(await sichtbar(BUCH_A, 'pflege_verlauf')).toBe(0)
    })

    it('PDL und QM sehen KEINE Bankdaten', async () => {
      expect(await sichtbar(PDL_A, 'sepa_mandates')).toBe(0)
      expect(await sichtbar(QM_A, 'sepa_mandates')).toBe(0)
    })

    it('QM sieht keine Rechnungen', async () => {
      expect(await sichtbar(QM_A, 'invoices')).toBe(0)
    })

    it('QM darf Pflegedaten lesen, aber nicht aendern', async () => {
      expect(await sichtbar(QM_A, 'pflege_verlauf')).toBe(1)
      const { rows } = await alsNutzer(QM_A, `UPDATE public.pflege_verlauf SET notiz = 'geaendert' WHERE id = $1 RETURNING id`, [PFLEGE_A])
      expect(rows).toHaveLength(0)
      const { rows: gelesen } = await alsNutzer(PDL_A, 'SELECT notiz FROM public.pflege_verlauf WHERE id = $1', [PFLEGE_A])
      expect(gelesen[0].notiz).toBe('Wunde links')
    })

    it('PDL darf Pflegedaten aendern — Gegenprobe zur Schreibsperre des QM', async () => {
      const { rows } = await alsNutzer(PDL_A, `UPDATE public.pflege_verlauf SET notiz = 'durch PDL' WHERE id = $1 RETURNING id`, [PFLEGE_A])
      expect(rows).toHaveLength(1)
      await db.exec(`UPDATE public.pflege_verlauf SET notiz = 'Wunde links' WHERE id = '${PFLEGE_A}'`)
    })

    it('PDL darf Tarife lesen, aber nicht schreiben', async () => {
      await db.exec(`INSERT INTO public.billing_tariffs (organization_id, satz) VALUES ('${ORG_A}', 1)`)
      expect(await sichtbar(PDL_A, 'billing_tariffs')).toBe(1)
      const { error } = await alsNutzer(PDL_A, `INSERT INTO public.billing_tariffs (organization_id, satz) VALUES ($1, 99)`, [ORG_A])
      expect(error).toBeDefined()
    })

    it('Buchhaltung darf Tarife ebenfalls nur lesen — Preisentscheidung ist keine Buchung', async () => {
      expect(await sichtbar(BUCH_A, 'billing_tariffs')).toBe(1)
      // Ohne Schreibpolicy trifft das UPDATE keine Zeile. Das ist kein
      // Fehler, sondern die Sperre: Postgres meldet bei UPDATE nichts,
      // es passiert nur nichts. Deshalb wird der Satz gegengeprueft.
      const { rows, error } = await alsNutzer(
        BUCH_A,
        `UPDATE public.billing_tariffs SET satz = 99 WHERE organization_id = $1 RETURNING id`,
        [ORG_A],
      )
      expect(error).toBeUndefined()
      expect(rows).toHaveLength(0)
      const { rows: satz } = await db.query<{ satz: string }>(`SELECT satz FROM public.billing_tariffs WHERE organization_id = '${ORG_A}'`)
      expect(Number(satz[0].satz)).toBe(1)
    })
  })

  // ── 5. Rollen ohne Verwaltungsrechte ───────────────────────────────
  describe('Engel, Kundschaft und Angehoerige', () => {
    for (const [name, konto] of [['Engel', ENGEL_A], ['Kundschaft', KUNDE_A], ['Angehoerige', ANGEH_A]] as const) {
      it(`${name} sieht ueber das Rollenkonzept gar nichts`, async () => {
        for (const tabelle of ['invoices', 'sepa_mandates', 'pflege_verlauf', 'billing_tariffs', 'audit_logs']) {
          expect(await sichtbar(konto, tabelle), `${name} / ${tabelle}`).toBe(0)
        }
      })
    }

    it('anonym erst recht nichts', async () => {
      for (const tabelle of ['invoices', 'sepa_mandates', 'pflege_verlauf', 'audit_logs']) {
        const { rows } = await alsNutzer(null, `SELECT count(*)::int AS n FROM public.${tabelle}`)
        expect(rows[0]?.n ?? 0, tabelle).toBe(0)
      }
    })
  })

  // ── 6. Rechteausweitung ────────────────────────────────────────────
  describe('Angriff: Rechteausweitung', () => {
    it('ein Engel kann sich nicht selbst zum Admin machen', async () => {
      const { error } = await alsNutzer(ENGEL_A, `UPDATE public.profiles SET role = 'admin' WHERE id = $1`, [ENGEL_A])
      expect(String(error?.message)).toContain('Rollenwechsel nicht erlaubt')
      const { rows } = await alsNutzer(ENGEL_A, 'SELECT role FROM public.profiles WHERE id = $1', [ENGEL_A])
      expect(rows[0].role).toBe('engel')
    })

    it('auch nicht zur Buchhaltung — die neuen Rollen sind mit erfasst', async () => {
      const { error } = await alsNutzer(KUNDE_A, `UPDATE public.profiles SET role = 'buchhaltung' WHERE id = $1`, [KUNDE_A])
      expect(String(error?.message)).toContain('Rollenwechsel nicht erlaubt')
    })

    it('die Buchhaltung kann sich nicht selbst Pflegerechte geben', async () => {
      const { error } = await alsNutzer(BUCH_A, `UPDATE public.profiles SET role = 'pdl' WHERE id = $1`, [BUCH_A])
      expect(String(error?.message)).toContain('Rollenwechsel nicht erlaubt')
      expect(await sichtbar(BUCH_A, 'pflege_verlauf')).toBe(0)
    })

    it('ein Admin kann niemanden zum Superadmin machen', async () => {
      const { error } = await alsNutzer(ADMIN_A, `UPDATE public.profiles SET role = 'superadmin' WHERE id = $1`, [PDL_A])
      expect(String(error?.message)).toContain('Superadmin-Rolle darf nur ein Superadmin vergeben')
    })

    it('ein neu angelegtes Konto kann sich keine privilegierte Rolle geben', async () => {
      await db.exec(`
        DROP TRIGGER IF EXISTS trg_prevent_privileged_role_insert_test ON public.profiles;
        CREATE TRIGGER trg_prevent_privileged_role_insert_test
          BEFORE INSERT ON public.profiles
          FOR EACH ROW EXECUTE FUNCTION public.prevent_privileged_role_insert();
      `)
      const neu = '90000000-0000-4000-8000-000000000001'
      const { error } = await alsNutzer(neu, `INSERT INTO public.profiles (id, role) VALUES ($1, 'buchhaltung')`, [neu])
      expect(String(error?.message)).toContain('Anlegen eines privilegierten Profils nicht erlaubt')
    })
  })

  // ── 7. Revisionsspuren ─────────────────────────────────────────────
  describe('Revisionsspuren bleiben lesend', () => {
    it('keine Fachrolle hat einen Schreibweg in audit_logs', async () => {
      for (const konto of [PDL_A, QM_A, BUCH_A]) {
        const { error } = await alsNutzer(konto, `INSERT INTO public.audit_logs (organization_id, aktion) VALUES ($1, 'gefaelscht')`, [ORG_A])
        expect(error, konto).toBeDefined()
      }
    })

    it('bestehende Eintraege lassen sich nicht wegaendern', async () => {
      const { rows } = await alsNutzer(BUCH_A, `UPDATE public.audit_logs SET aktion = 'weg' WHERE organization_id = $1 RETURNING id`, [ORG_A])
      expect(rows).toHaveLength(0)
    })

    it('lesen darf, wer audit.lesen hat', async () => {
      expect(await sichtbar(BUCH_A, 'audit_logs')).toBe(1)
      expect(await sichtbar(QM_A, 'audit_logs')).toBe(1)
      expect(await sichtbar(ENGEL_A, 'audit_logs')).toBe(0)
    })
  })

  // ── 8. service_role ────────────────────────────────────────────────
  describe('service_role umgeht alles — mit Folge fuer die Routen', () => {
    it('sieht beide Mandanten', async () => {
      const ergebnis = await db.transaction(async (tx) => {
        await tx.exec(`SET LOCAL ROLE service_role;`)
        return tx.query('SELECT count(*)::int AS n FROM public.invoices')
      })
      expect((ergebnis.rows[0] as Zeile).n).toBe(2)
    })

    it('das ist kein Fehler, sondern der Grund fuer den Routentest', async () => {
      // BYPASSRLS ist gewollt: Server-Jobs muessen mandantenuebergreifend
      // arbeiten koennen. Die Folge ist, dass jede Route, die
      // createAdminClient() benutzt, den Mandanten SELBST in die Abfrage
      // schreiben muss — geprueft in rollen-angriffsvektoren.test.ts,
      // Abschnitt „Bestandsschutz: service_role ohne Mandantenfilter".
      const { rows } = await db.query<{ rolname: string; bypass: boolean }>(
        `SELECT rolname, rolbypassrls AS bypass FROM pg_roles WHERE rolname = 'service_role'`,
      )
      expect(rows[0].bypass).toBe(true)
    })
  })

  // ── 9. Abdeckung der Matrix in der Datenbank ───────────────────────
  describe('Welche Berechtigung schuetzt ueberhaupt eine Tabelle?', () => {
    it('benennt die Berechtigungen ohne einzige Zieltabelle', async () => {
      const { rows } = await db.query<{ qual: string }>(
        `SELECT coalesce(qual, with_check) AS qual FROM pg_policies
         WHERE schemaname = 'public' AND policyname LIKE 'rk\\_%'`,
      )
      const text = rows.map(r => r.qual).join(' ')
      const belegt = BERECHTIGUNGEN.filter(b => text.includes(`'${b}'`))
      const offen = BERECHTIGUNGEN.filter(b => !belegt.includes(b))

      // Erwartet und begruendet:
      //   benutzer.verwalten / system.verwalten — laufen ueber is_admin()
      //     bzw. ueber Supabase-Auth, nicht ueber eine Fachtabelle.
      //   berichte.lesen — Auswertungen entstehen in Routen mit
      //     service_role; es gibt keine „Berichte"-Tabelle.
      //   qm.lesen / qm.schreiben — OFFENER PUNKT. Die Matrix kennt die
      //     Berechtigung auf beiden Seiten, aber KEINE Tabelle ist damit
      //     geschuetzt. Die QM-Bereiche (Fristen, Wiedervorlagen,
      //     Eskalationen, Prüfprotokolle) laufen heute ausschliesslich
      //     ueber Routen mit service_role — dort greift der Guard, RLS
      //     nicht. Das ist fail-closed (zu wenig Zugriff, nicht zu viel),
      //     aber es heisst: eine Server-Komponente, die diese Tabellen
      //     mit dem Nutzer-Client liest, saehe fuer das QM nichts.
      expect(offen.sort()).toEqual(
        ['benutzer.verwalten', 'berichte.lesen', 'qm.lesen', 'qm.schreiben', 'system.verwalten'].sort(),
      )
    })
  })

  // ── 10. Stamm-Org-Fallback ─────────────────────────────────────────
  it('ein Konto ohne jede Org-Bindung landet in der Stamm-Org, nicht in Org A oder B', async () => {
    // Dokumentierter Restpunkt (siehe current_org_id(), HOCH-1): der
    // Fallback ist fail-open auf die Stamm-Org. Er darf aber niemals in
    // einen echten Fremdmandanten fallen — das waere der Uebergriff.
    const bindungslos = 'aaaa0000-0000-4000-8000-00000000000f'
    await db.exec(`INSERT INTO public.profiles (id, role) VALUES ('${bindungslos}', 'buchhaltung')`)
    const { rows } = await alsNutzer(bindungslos, 'SELECT public.current_org_id() AS org')
    expect(rows[0].org).toBe(STAMM_ORG)
    expect(rows[0].org).not.toBe(ORG_A)
    expect(rows[0].org).not.toBe(ORG_B)
    expect(await sichtbar(bindungslos, 'invoices')).toBe(0)
  })
})
