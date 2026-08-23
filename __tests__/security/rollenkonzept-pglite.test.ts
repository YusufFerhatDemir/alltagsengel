/**
 * PGlite: Rollenkonzept (Migration 20260924000000)
 *
 * Die Migration laeuft auf einer echten PostgreSQL-Instanz (PGlite/WASM)
 * und wird auf ihr VERHALTEN geprueft. Der wichtigste Test ist der
 * Abgleich: public.rollen_matrix() in SQL muss Zelle fuer Zelle dasselbe
 * sagen wie ROLLEN_MATRIX in lib/auth/rollen.ts. Zwei Berechtigungs-
 * modelle, die auseinanderlaufen, sind schlimmer als eines — dann darf
 * jemand ueber die API mehr als ueber die Datenbank oder umgekehrt, und
 * niemand merkt es.
 *
 * Geprueft:
 *   1. Rollenkatalog (CHECK-Constraint)
 *   2. Matrix-Gleichstand SQL ↔ TypeScript
 *   3. darf() / ist_verwaltung() fail-closed
 *   4. Policies je Fachbereich, Audit-Tabellen ohne Schreibweg
 *   5. Rollenwechsel-Trigger (Selbstbefoerderung, Superadmin-Vorbehalt)
 *   6. Keine anon-Ausfuehrung
 *   7. Rollback
 */

import { PGlite } from '@electric-sql/pglite'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { ROLLEN, ROLLEN_MATRIX } from '@/lib/auth/rollen'

const MIGRATIONS_DIR = path.join(__dirname, '..', '..', 'supabase', 'migrations')
const MIGRATION = '20260924000000_rollenkonzept_least_privilege.sql'
const ROLLBACK = '20260924000001_rollback_rollenkonzept_least_privilege.sql'

const ADMIN_ID = '00000000-0000-4000-8000-00000000a001'
const SUPER_ID = '00000000-0000-4000-8000-00000000a002'
const PDL_ID = '00000000-0000-4000-8000-00000000a003'
const KUNDE_ID = '00000000-0000-4000-8000-00000000a004'

let db: InstanceType<typeof PGlite>

async function alsNutzer(id: string | null): Promise<void> {
  await db.exec(`SET test.user_id = '${id ?? ''}'`)
}

async function darf(berechtigung: string): Promise<boolean> {
  const r = await db.query<{ darf: boolean }>('SELECT public.darf($1) AS darf', [berechtigung] as never[])
  return r.rows[0].darf
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

  // auth.uid() ueber eine Sitzungsvariable steuerbar machen — damit laesst
  // sich „wer ist gerade angemeldet" im Test umschalten.
  await db.exec(`
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('test.user_id', true), '')::uuid
    $$;

    CREATE TABLE public.profiles (
      id         uuid PRIMARY KEY,
      role       text NOT NULL CHECK (role IN ('kunde','engel','admin','superadmin','fahrer')),
      deleted_at timestamptz
    );

    CREATE FUNCTION public.is_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
      SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = ANY (ARRAY['admin','superadmin']) AND deleted_at IS NULL
      );
    $$;

    -- Eine Auswahl der Zieltabellen. 'sepa_mandates' und 'audit_logs' sind
    -- da, 'wounds' bewusst NICHT — damit sich zeigt, dass die Migration
    -- fehlende Tabellen ueberspringt statt abzubrechen.
    CREATE TABLE public.clients (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
    CREATE TABLE public.invoices (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
    CREATE TABLE public.sepa_mandates (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
    CREATE TABLE public.billing_tariffs (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
    CREATE TABLE public.pflege_verlauf (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
    CREATE TABLE public.audit_logs (id uuid PRIMARY KEY DEFAULT gen_random_uuid());

    INSERT INTO public.profiles (id, role) VALUES
      ('${ADMIN_ID}', 'admin'),
      ('${SUPER_ID}', 'superadmin'),
      ('${KUNDE_ID}', 'kunde');
  `)

  // Die Trigger aus dem Bestand — die Migration ersetzt nur ihre Funktionen.
  await db.exec(`
    CREATE FUNCTION public.prevent_role_escalation() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
    BEGIN
      IF NEW.role IS NOT DISTINCT FROM OLD.role THEN RETURN NEW; END IF;
      IF coalesce(current_setting('request.jwt.claims', true), '') = '' THEN RETURN NEW; END IF;
      IF NOT public.is_admin() THEN RAISE EXCEPTION 'Rollenwechsel nicht erlaubt'; END IF;
      RETURN NEW;
    END; $$;

    CREATE FUNCTION public.prevent_privileged_role_insert() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
    BEGIN RETURN NEW; END; $$;

    CREATE TRIGGER trg_prevent_role_escalation
      BEFORE UPDATE ON public.profiles
      FOR EACH ROW EXECUTE FUNCTION public.prevent_role_escalation();
  `)

  await db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, MIGRATION), 'utf-8'))

  await db.exec(`INSERT INTO public.profiles (id, role) VALUES ('${PDL_ID}', 'pdl')`)
})

afterAll(async () => {
  await db?.close()
})

describe('Rollenkatalog', () => {
  it('nimmt die neuen Rollen an', async () => {
    for (const rolle of ['pdl', 'qm', 'buchhaltung', 'angehoerige']) {
      await db.query(
        `INSERT INTO public.profiles (id, role) VALUES (gen_random_uuid(), $1)`,
        [rolle] as never[],
      )
    }
    const res = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.profiles
        WHERE role IN ('pdl','qm','buchhaltung','angehoerige')`,
    )
    // pdl wurde in beforeAll schon einmal angelegt.
    expect(res.rows[0].n).toBe(5)
  })

  it('weist unbekannte Rollen weiterhin ab', async () => {
    await expect(
      db.query(`INSERT INTO public.profiles (id, role) VALUES (gen_random_uuid(), $1)`, ['root'] as never[]),
    ).rejects.toThrow()
  })
})

describe('Matrix-Gleichstand SQL ↔ TypeScript', () => {
  it.each(ROLLEN)('rollen_matrix(%s) stimmt mit ROLLEN_MATRIX ueberein', async rolle => {
    const res = await db.query<{ matrix: string[] }>(
      'SELECT public.rollen_matrix($1) AS matrix',
      [rolle] as never[],
    )
    const sql = [...(res.rows[0].matrix ?? [])].sort()
    const ts = [...ROLLEN_MATRIX[rolle]].sort()
    expect(sql).toEqual(ts)
  })

  it('gibt einer unbekannten Rolle ein leeres Ergebnis', async () => {
    const res = await db.query<{ matrix: string[] }>(
      'SELECT public.rollen_matrix($1) AS matrix', ['hausmeister'] as never[],
    )
    expect(res.rows[0].matrix).toEqual([])
  })
})

describe('darf() — fail-closed', () => {
  it('bejaht fuer die Administration alles', async () => {
    await alsNutzer(ADMIN_ID)
    for (const b of ROLLEN_MATRIX.admin) {
      expect(await darf(b), `admin fehlt ${b}`).toBe(true)
    }
  })

  it('verweigert der PDL Bankdaten und Tarifaenderungen', async () => {
    await alsNutzer(PDL_ID)
    expect(await darf('bankdaten.lesen')).toBe(false)
    expect(await darf('bankdaten.schreiben')).toBe(false)
    expect(await darf('tarife.schreiben')).toBe(false)
    expect(await darf('benutzer.verwalten')).toBe(false)
    expect(await darf('pflege.schreiben')).toBe(true)
  })

  it('verweigert Kundschaft alles', async () => {
    await alsNutzer(KUNDE_ID)
    for (const b of ROLLEN_MATRIX.admin) {
      expect(await darf(b), `kunde hat ${b}`).toBe(false)
    }
  })

  it('verweigert ohne Anmeldung alles', async () => {
    await alsNutzer(null)
    expect(await darf('stammdaten.lesen')).toBe(false)
    expect(await darf('audit.lesen')).toBe(false)
  })

  it('verweigert eine unbekannte Berechtigung', async () => {
    await alsNutzer(ADMIN_ID)
    expect(await darf('alles.duerfen')).toBe(false)
    expect(await darf('')).toBe(false)
  })

  it('entzieht einem soft-geloeschten Konto jede Berechtigung', async () => {
    await db.query(`UPDATE public.profiles SET deleted_at = now() WHERE id = $1`, [PDL_ID] as never[])
    await alsNutzer(PDL_ID)
    expect(await darf('pflege.lesen')).toBe(false)
    await db.query(`UPDATE public.profiles SET deleted_at = NULL WHERE id = $1`, [PDL_ID] as never[])
  })

  it('ist_verwaltung() trennt Fachrollen von Kundschaft', async () => {
    const frage = async (id: string) => {
      await alsNutzer(id)
      const r = await db.query<{ v: boolean }>('SELECT public.ist_verwaltung() AS v')
      return r.rows[0].v
    }
    expect(await frage(ADMIN_ID)).toBe(true)
    expect(await frage(PDL_ID)).toBe(true)
    expect(await frage(KUNDE_ID)).toBe(false)
  })
})

describe('Policies', () => {
  it('legt Lese- und Schreibpolicy je Fachtabelle an', async () => {
    const res = await db.query<{ tablename: string; policyname: string; qual: string }>(
      `SELECT tablename, policyname, qual FROM pg_policies
        WHERE schemaname = 'public' AND policyname LIKE 'rk\\_%'
        ORDER BY tablename, policyname`,
    )
    const namen = res.rows.map(r => `${r.tablename}:${r.policyname}`)
    expect(namen).toContain('clients:rk_clients_lesen')
    expect(namen).toContain('clients:rk_clients_schreiben')
    expect(namen).toContain('sepa_mandates:rk_sepa_mandates_lesen')
    expect(namen).toContain('billing_tariffs:rk_billing_tariffs_schreiben')
  })

  it('gibt Audit-Tabellen KEINEN Schreibweg', async () => {
    const res = await db.query<{ policyname: string }>(
      `SELECT policyname FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'audit_logs' AND policyname LIKE 'rk\\_%'`,
    )
    const namen = res.rows.map(r => r.policyname)
    expect(namen).toContain('rk_audit_logs_lesen')
    expect(namen).not.toContain('rk_audit_logs_schreiben')
  })

  it('bindet jede Policy an die richtige Berechtigung', async () => {
    const res = await db.query<{ policyname: string; qual: string }>(
      `SELECT policyname, qual FROM pg_policies
        WHERE schemaname = 'public' AND policyname LIKE 'rk\\_%'`,
    )
    const nach = (name: string) => res.rows.find(r => r.policyname === name)?.qual ?? ''
    expect(nach('rk_sepa_mandates_lesen')).toContain('bankdaten.lesen')
    expect(nach('rk_pflege_verlauf_schreiben')).toContain('pflege.schreiben')
    expect(nach('rk_billing_tariffs_schreiben')).toContain('tarife.schreiben')
    expect(nach('rk_audit_logs_lesen')).toContain('audit.lesen')
  })

  it('schaltet RLS auf allen betroffenen Tabellen ein', async () => {
    const res = await db.query<{ relname: string; relrowsecurity: boolean }>(
      `SELECT c.relname, c.relrowsecurity FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname IN ('clients','invoices','sepa_mandates','billing_tariffs','pflege_verlauf','audit_logs')`,
    )
    expect(res.rows).toHaveLength(6)
    for (const r of res.rows) {
      expect(r.relrowsecurity, `${r.relname} ohne RLS`).toBe(true)
    }
  })

  it('ueberspringt Tabellen, die es nicht gibt, ohne abzubrechen', async () => {
    const res = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'wounds'`,
    )
    expect(res.rows[0].n).toBe(0)
  })
})

describe('Rollenwechsel', () => {
  it('laesst einen Admin keine Superadmin-Rolle vergeben', async () => {
    await alsNutzer(ADMIN_ID)
    await db.exec(`SET request.jwt.claims = '{"sub":"${ADMIN_ID}"}'`)
    await expect(
      db.query(`UPDATE public.profiles SET role = 'superadmin' WHERE id = $1`, [KUNDE_ID] as never[]),
    ).rejects.toThrow(/Superadmin/)
    await db.exec(`SET request.jwt.claims = ''`)
  })

  it('laesst einen Superadmin die Superadmin-Rolle vergeben', async () => {
    await alsNutzer(SUPER_ID)
    await db.exec(`SET request.jwt.claims = '{"sub":"${SUPER_ID}"}'`)
    await db.query(`UPDATE public.profiles SET role = 'superadmin' WHERE id = $1`, [KUNDE_ID] as never[])
    const res = await db.query<{ role: string }>(
      `SELECT role FROM public.profiles WHERE id = $1`, [KUNDE_ID] as never[],
    )
    expect(res.rows[0].role).toBe('superadmin')
    await db.query(`UPDATE public.profiles SET role = 'kunde' WHERE id = $1`, [KUNDE_ID] as never[])
    await db.exec(`SET request.jwt.claims = ''`)
  })

  it('laesst einen Nicht-Admin ueberhaupt keine Rolle aendern', async () => {
    await alsNutzer(KUNDE_ID)
    await db.exec(`SET request.jwt.claims = '{"sub":"${KUNDE_ID}"}'`)
    await expect(
      db.query(`UPDATE public.profiles SET role = 'pdl' WHERE id = $1`, [KUNDE_ID] as never[]),
    ).rejects.toThrow(/Rollenwechsel nicht erlaubt/)
    await db.exec(`SET request.jwt.claims = ''`)
  })

  it('blockiert das Anlegen eines privilegierten Profils durch Nicht-Admins', async () => {
    await db.exec(`
      DROP TRIGGER IF EXISTS trg_prevent_privileged_role_insert ON public.profiles;
      CREATE TRIGGER trg_prevent_privileged_role_insert
        BEFORE INSERT ON public.profiles
        FOR EACH ROW EXECUTE FUNCTION public.prevent_privileged_role_insert();
    `)
    await alsNutzer(KUNDE_ID)
    await db.exec(`SET request.jwt.claims = '{"sub":"${KUNDE_ID}"}'`)
    for (const rolle of ['pdl', 'qm', 'buchhaltung', 'admin', 'superadmin']) {
      await expect(
        db.query(`INSERT INTO public.profiles (id, role) VALUES (gen_random_uuid(), $1)`, [rolle] as never[]),
        `Rolle ${rolle} durfte angelegt werden`,
      ).rejects.toThrow(/privilegierten Profils/)
    }
    // Eine harmlose Rolle darf jeder fuer sich selbst anlegen.
    await db.query(`INSERT INTO public.profiles (id, role) VALUES (gen_random_uuid(), 'kunde')`)
    await db.exec(`SET request.jwt.claims = ''`)
  })
})

describe('Keine anon-Ausfuehrung', () => {
  it.each(['darf', 'aktuelle_rolle', 'ist_verwaltung', 'rollen_matrix'])(
    '%s ist fuer anon gesperrt',
    async name => {
      const res = await db.query<{ erlaubt: boolean }>(
        `SELECT bool_or(has_function_privilege('anon', p.oid, 'EXECUTE')) AS erlaubt
           FROM pg_proc p
          WHERE p.proname = $1 AND p.pronamespace = 'public'::regnamespace`,
        [name] as never[],
      )
      expect(res.rows[0].erlaubt).toBe(false)
    },
  )

  it.each(['darf', 'aktuelle_rolle', 'ist_verwaltung'])(
    '%s ist SECURITY DEFINER mit festem search_path',
    async name => {
      const res = await db.query<{ prosecdef: boolean; proconfig: string[] | null }>(
        `SELECT prosecdef, proconfig FROM pg_proc
          WHERE proname = $1 AND pronamespace = 'public'::regnamespace`,
        [name] as never[],
      )
      expect(res.rows[0].prosecdef).toBe(true)
      expect((res.rows[0].proconfig ?? []).join(',')).toContain('search_path')
    },
  )
})

describe('Rollback', () => {
  it('entfernt Policies und Funktionen', async () => {
    // Konten mit neuer Rolle zuerst umsetzen — der Rollback stellt den
    // alten CHECK wieder her und muss sonst absichtlich scheitern.
    await db.exec(`UPDATE public.profiles SET role = 'kunde'
                    WHERE role IN ('pdl','qm','buchhaltung','angehoerige')`)
    await db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, ROLLBACK), 'utf-8'))

    const policies = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM pg_policies
        WHERE schemaname = 'public' AND policyname LIKE 'rk\\_%'`,
    )
    expect(policies.rows[0].n).toBe(0)

    const funktionen = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM pg_proc
        WHERE pronamespace = 'public'::regnamespace
          AND proname IN ('darf','ist_verwaltung','rollen_matrix','aktuelle_rolle')`,
    )
    expect(funktionen.rows[0].n).toBe(0)

    // Und der alte Rollenkatalog gilt wieder.
    await expect(
      db.query(`INSERT INTO public.profiles (id, role) VALUES (gen_random_uuid(), $1)`, ['pdl'] as never[]),
    ).rejects.toThrow()
  })
})
