/**
 * PGlite: SIS-Abschluss-Sperre haerten (Migration 20261007000000)
 *
 * Die urspruengliche Migration (20260818010000) blockte Direktschreiben
 * auf sis_assessments/sis_themenfelder/sis_risikomatrix nur, solange
 * `gesperrt = true` war. Die App-Schicht (lib/sis/*) verweigert Schreiben
 * zusaetzlich fuer `status = 'abgeschlossen'` — aber nur, wenn der
 * Schreibzugriff durch lib/sis laeuft. Die RLS-Policy `admin_sis_assessments`
 * prueft ausschliesslich is_admin(), nicht den Status: ein direkter
 * PostgREST-/service_role-Zugriff unter Umgehung von lib/sis konnte eine
 * abgeschlossene SIS bislang unveraendert durchschreiben.
 *
 * Dieser Test wendet echtes Postgres-Trigger-Verhalten an (PGlite/WASM) und
 * prueft genau das Szenario "direkter DB-Write auf eine abgeschlossene
 * Zeile, ohne durch lib/sis zu gehen":
 *
 *   1. Kopfsatz + Kindzeilen lassen sich im Entwurf normal aendern
 *   2. Nach Abschluss (status = 'abgeschlossen', gesperrt = false) blockt
 *      der Trigger jede weitere Aenderung am Kopfsatz UND an Kindzeilen
 *      (INSERT/UPDATE/DELETE) — nicht nur bei gesperrt = true
 *   3. Die vorgesehenen Statuswechsel bleiben moeglich: abgeschlossen →
 *      gesperrt, abgeschlossen → entwurf (Wiedereroeffnung)
 *   4. Nach Wiedereroeffnung (zurueck auf entwurf) sind Aenderungen wieder
 *      erlaubt
 *   5. Die alte Sperre (gesperrt = true) funktioniert unveraendert weiter
 *   6. Rollback stellt den alten (schwaecheren) Triggerstand wieder her
 */

import { PGlite } from '@electric-sql/pglite'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const MIGRATIONS_DIR = path.join(__dirname, '..', '..', 'supabase', 'migrations')
const BASIS = '20260818010000_sis_strukturierte_informationssammlung.sql'
const HAERTUNG = '20261007000000_sis_abschluss_sperre_haertung.sql'
const ROLLBACK = '20261007000001_rollback_sis_abschluss_sperre_haertung.sql'

const ORG = '00000000-0000-4000-8000-0000000000aa'
const CLIENT = '00000000-0000-4000-8000-0000000000ba'
const USER = '00000000-0000-4000-8000-0000000000c1'
const SIS = '00000000-0000-4000-8000-0000000000d1'

let db: InstanceType<typeof PGlite>

async function grundgeruest(target: InstanceType<typeof PGlite>) {
  await target.exec(`
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
    CREATE TABLE auth.users (id uuid PRIMARY KEY, email text);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
    CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
    CREATE FUNCTION public.current_org_id() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
    CREATE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN NEW.updated_at = now(); RETURN NEW; END;
    $$;

    CREATE TABLE public.organizations (id uuid PRIMARY KEY, name text);
    CREATE TABLE public.clients (
      id uuid PRIMARY KEY,
      organization_id uuid REFERENCES public.organizations(id)
    );
    -- Nur fuer engel_hat_aktiven_klienten() referenziert (LANGUAGE sql wird
    -- schon bei CREATE FUNCTION geplant, die Tabellen muessen existieren).
    CREATE TABLE public.caregivers (id uuid PRIMARY KEY, user_id uuid);
    CREATE TABLE public.assignments (
      client_id uuid, caregiver_id uuid, status text
    );

    INSERT INTO auth.users (id, email) VALUES ('${USER}', 'admin@shadow.test');
    INSERT INTO public.organizations (id, name) VALUES ('${ORG}', 'Stamm');
    INSERT INTO public.clients (id, organization_id) VALUES ('${CLIENT}', '${ORG}');
  `)
}

async function neuerKopfsatz(target: InstanceType<typeof PGlite>, id: string) {
  await target.query(
    `INSERT INTO public.sis_assessments
       (id, organization_id, client_id, erhoben_von, erstellt_von, versorgungsform)
     VALUES ($1, $2, $3, $4, $4, 'ambulant')`,
    [id, ORG, CLIENT, USER] as never[],
  )
  await target.query(
    `INSERT INTO public.sis_themenfelder (organization_id, assessment_id, feld_nr)
     SELECT $1, $2, nr FROM generate_series(1, 6) nr`,
    [ORG, id] as never[],
  )
  await target.query(
    `INSERT INTO public.sis_risikomatrix (organization_id, assessment_id, risiko)
     SELECT $1, $2, r FROM unnest(ARRAY['dekubitus','sturz','inkontinenz','schmerz','ernaehrung']) r`,
    [ORG, id] as never[],
  )
}

beforeAll(async () => {
  db = new PGlite()
  await grundgeruest(db)
  await db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, BASIS), 'utf-8'))
  await db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, HAERTUNG), 'utf-8'))
  await neuerKopfsatz(db, SIS)
})

afterAll(async () => {
  await db?.close()
})

describe('Entwurf — Aenderungen sind erlaubt', () => {
  it('Kopfsatz und Kindzeilen lassen sich im Entwurf beschreiben', async () => {
    await expect(
      db.query(`UPDATE public.sis_assessments SET bemerkung = 'Entwurfsnotiz' WHERE id = $1`, [SIS] as never[]),
    ).resolves.toBeDefined()
    await expect(
      db.query(
        `UPDATE public.sis_themenfelder SET einschaetzung_pflege = 'x' WHERE assessment_id = $1 AND feld_nr = 1`,
        [SIS] as never[],
      ),
    ).resolves.toBeDefined()
    await expect(
      db.query(
        `UPDATE public.sis_risikomatrix SET risiko_vorhanden = 'nein' WHERE assessment_id = $1 AND risiko = 'sturz'`,
        [SIS] as never[],
      ),
    ).resolves.toBeDefined()
  })
})

describe('Abschluss — direkter DB-Write ohne lib/sis wird blockiert', () => {
  it('markiert den Kopfsatz als abgeschlossen (der erlaubte Statuswechsel selbst)', async () => {
    await expect(
      db.query(
        `UPDATE public.sis_assessments
            SET status = 'abgeschlossen', abgeschlossen_am = now(), abgeschlossen_von = $2
          WHERE id = $1`,
        [SIS, USER] as never[],
      ),
    ).resolves.toBeDefined()
  })

  it('blockt ein weiteres Update am Kopfsatz, obwohl gesperrt = false ist', async () => {
    await expect(
      db.query(`UPDATE public.sis_assessments SET bemerkung = 'nachtraeglich' WHERE id = $1`, [SIS] as never[]),
    ).rejects.toThrow(/abgeschlossene informationssammlung.*wiedereröffnen/i)
  })

  it('blockt UPDATE auf ein Themenfeld unter abgeschlossenem Kopfsatz', async () => {
    await expect(
      db.query(
        `UPDATE public.sis_themenfelder SET bemerkung = 'nachtraeglich' WHERE assessment_id = $1 AND feld_nr = 2`,
        [SIS] as never[],
      ),
    ).rejects.toThrow(/abgeschlossen/i)
  })

  it('blockt DELETE auf eine Risikozeile unter abgeschlossenem Kopfsatz', async () => {
    await expect(
      db.query(`DELETE FROM public.sis_risikomatrix WHERE assessment_id = $1 AND risiko = 'schmerz'`, [SIS] as never[]),
    ).rejects.toThrow(/abgeschlossen/i)
  })

  it('blockt INSERT einer neuen Kindzeile unter abgeschlossenem Kopfsatz', async () => {
    const anderesSis = '00000000-0000-4000-8000-0000000000d9'
    await expect(
      db.query(
        `INSERT INTO public.sis_themenfelder (organization_id, assessment_id, feld_nr) VALUES ($1, $2, 3)`,
        [ORG, SIS] as never[],
      ),
    ).rejects.toThrow(/abgeschlossen/i)
    // Kontrolle: derselbe Insert unter einem eigenen (nicht abgeschlossenen) Kopfsatz geht durch
    await neuerKopfsatz(db, anderesSis)
    await expect(
      db.query(
        `INSERT INTO public.sis_risikomatrix (organization_id, assessment_id, risiko) VALUES ($1, $2, 'dekubitus') ON CONFLICT (assessment_id, risiko) DO UPDATE SET bemerkung = 'ok'`,
        [ORG, anderesSis] as never[],
      ),
    ).resolves.toBeDefined()
  })
})

describe('Vorgesehene Statuswechsel bleiben moeglich', () => {
  it('abgeschlossen → gesperrt aendert Status UND gesperrt in einem Schritt', async () => {
    await expect(
      db.query(
        `UPDATE public.sis_assessments SET status = 'gesperrt', gesperrt = true WHERE id = $1`,
        [SIS] as never[],
      ),
    ).resolves.toBeDefined()
  })

  it('gesperrt bleibt weiterhin die staerkste Sperre (Regressionsschutz)', async () => {
    await expect(
      db.query(`UPDATE public.sis_assessments SET bemerkung = 'x' WHERE id = $1`, [SIS] as never[]),
    ).rejects.toThrow(/gesperrt/i)
    await expect(
      db.query(
        `UPDATE public.sis_themenfelder SET bemerkung = 'x' WHERE assessment_id = $1 AND feld_nr = 1`,
        [SIS] as never[],
      ),
    ).rejects.toThrow(/gesperrt/i)
  })

  it('abgeschlossen → entwurf (Wiedereroeffnung) ist erlaubt und macht die Zeile wieder editierbar', async () => {
    const sis2 = '00000000-0000-4000-8000-0000000000d2'
    await neuerKopfsatz(db, sis2)
    await db.query(
      `UPDATE public.sis_assessments SET status = 'abgeschlossen', abgeschlossen_am = now(), abgeschlossen_von = $2 WHERE id = $1`,
      [sis2, USER] as never[],
    )
    await expect(
      db.query(
        `UPDATE public.sis_assessments SET status = 'entwurf', abgeschlossen_am = null, abgeschlossen_von = null WHERE id = $1`,
        [sis2] as never[],
      ),
    ).resolves.toBeDefined()

    await expect(
      db.query(`UPDATE public.sis_assessments SET bemerkung = 'wieder editierbar' WHERE id = $1`, [sis2] as never[]),
    ).resolves.toBeDefined()
    await expect(
      db.query(
        `UPDATE public.sis_themenfelder SET bemerkung = 'wieder editierbar' WHERE assessment_id = $1 AND feld_nr = 1`,
        [sis2] as never[],
      ),
    ).resolves.toBeDefined()
  })
})

describe('Rollback', () => {
  it('stellt den schwaecheren Vorzustand wieder her (nur gesperrt blockt, abgeschlossen nicht mehr)', async () => {
    const eigene = new PGlite()
    try {
      await grundgeruest(eigene)
      await eigene.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, BASIS), 'utf-8'))
      await eigene.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, HAERTUNG), 'utf-8'))
      await eigene.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, ROLLBACK), 'utf-8'))

      const sis = '00000000-0000-4000-8000-0000000000d3'
      await neuerKopfsatz(eigene, sis)
      await eigene.query(
        `UPDATE public.sis_assessments SET status = 'abgeschlossen', abgeschlossen_am = now(), abgeschlossen_von = $2 WHERE id = $1`,
        [sis, USER] as never[],
      )

      // Nach dem Rollback ist die Haertung weg: Direkt-Write auf 'abgeschlossen' geht wieder durch.
      await expect(
        eigene.query(`UPDATE public.sis_assessments SET bemerkung = 'nach rollback erlaubt' WHERE id = $1`, [sis] as never[]),
      ).resolves.toBeDefined()

      // gesperrt blockt weiterhin (unveraendert seit der Basis-Migration).
      await eigene.query(`UPDATE public.sis_assessments SET status = 'gesperrt', gesperrt = true WHERE id = $1`, [sis] as never[])
      await expect(
        eigene.query(`UPDATE public.sis_assessments SET bemerkung = 'x' WHERE id = $1`, [sis] as never[]),
      ).rejects.toThrow(/gesperrt/i)
    } finally {
      await eigene.close()
    }
  })
})
