/**
 * Migrationstest für 20260921010000_sgb_v_302_pipeline_erweiterung.sql.
 *
 * Läuft die WORTGLEICHE Transaktion aus der Migrationsdatei (via
 * transaktionsInhalt) gegen ein minimales, aber echtes PGlite-Schema.
 * Geprüft wird die Struktur (neue Spalten/Tabellen/Constraints), nicht die
 * fachliche Business-Logik — die steht in sgb-v-302-erweiterung.test.ts.
 */
import { PGlite } from '@electric-sql/pglite'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { transaktionsInhalt } from '../helpers/sql-extract'

const MIGRATION = '20260921010000_sgb_v_302_pipeline_erweiterung.sql'

const ORG = '00000000-0000-4000-8000-000460629986'

const SCHEMA = `
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);

CREATE SCHEMA IF NOT EXISTS storage;
CREATE TABLE storage.buckets (
  id text PRIMARY KEY,
  name text NOT NULL,
  public boolean NOT NULL DEFAULT false,
  file_size_limit bigint,
  allowed_mime_types text[]
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon;
  END IF;
END $$;

CREATE TABLE public.organizations (id uuid PRIMARY KEY DEFAULT gen_random_uuid());

CREATE OR REPLACE FUNCTION public.current_org_id() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT '${ORG}'::uuid;
$$;

CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT true;
$$;

CREATE OR REPLACE FUNCTION public.set_updated_at_dta_versand()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;

CREATE TABLE public.sgb_v_laeufe (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'erstellt',
  gesamtbetrag_cent integer NOT NULL DEFAULT 0
);

CREATE TABLE public.dta_ruecklaeufer (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL
);

CREATE TABLE public.zahlungseingaenge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  betrag_cent bigint NOT NULL DEFAULT 0
);

CREATE TABLE public.billing_audit_trail (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id uuid,
  organization_id uuid
);

INSERT INTO public.organizations (id) VALUES ('${ORG}');
`

describe('Migration 20260921010000 — § 302 Pipeline-Erweiterung', () => {
  let db: InstanceType<typeof PGlite>

  beforeAll(async () => {
    db = new PGlite()
    await db.exec(SCHEMA)
    await db.exec(transaktionsInhalt(MIGRATION))
  }, 120_000)

  afterAll(async () => { await db?.close() })

  it('legt den privaten Prüf-Export-Bucket an', async () => {
    const res = await db.query(`SELECT public FROM storage.buckets WHERE id = 'sgb-v-pruefexporte'`)
    expect(res.rows).toHaveLength(1)
    expect((res.rows[0] as any).public).toBe(false)
  })

  it('fügt die Brücken-Spalten hinzu', async () => {
    const spalten = await db.query(`
      SELECT table_name, column_name FROM information_schema.columns
      WHERE (table_name = 'dta_ruecklaeufer' AND column_name = 'sgb_v_lauf_id')
         OR (table_name = 'zahlungseingaenge' AND column_name = 'sgb_v_lauf_id')
         OR (table_name = 'sgb_v_laeufe' AND column_name IN ('korrektur_von', 'storno_grund'))
    `)
    expect(spalten.rows).toHaveLength(4)
  })

  it('sgb_v_uebertragungsqueue lehnt unbekannte adapter_typ-Werte ab', async () => {
    const { rows: [lauf] } = await db.query<{ id: string }>(
      `INSERT INTO public.sgb_v_laeufe (organization_id) VALUES ('${ORG}') RETURNING id`,
    )
    await expect(db.query(
      `INSERT INTO public.sgb_v_uebertragungsqueue (organization_id, lauf_id, adapter_typ) VALUES ('${ORG}', '${lauf.id}', 'unbekannt')`,
    )).rejects.toMatchObject({ code: '23514' })

    const ok = await db.query(
      `INSERT INTO public.sgb_v_uebertragungsqueue (organization_id, lauf_id, adapter_typ) VALUES ('${ORG}', '${lauf.id}', 'mock') RETURNING id`,
    )
    expect(ok.rows).toHaveLength(1)
  })

  it('erlaubt nur einen offenen Korrekturvorgang je Original-Lauf', async () => {
    const { rows: [lauf] } = await db.query<{ id: string }>(
      `INSERT INTO public.sgb_v_laeufe (organization_id) VALUES ('${ORG}') RETURNING id`,
    )

    await db.query(
      `INSERT INTO public.sgb_v_korrekturlaeufe (organization_id, original_lauf_id, korrektur_typ, korrektur_grund, status)
       VALUES ('${ORG}', '${lauf.id}', 'storno', 'Testgrund', 'angelegt')`,
    )

    await expect(db.query(
      `INSERT INTO public.sgb_v_korrekturlaeufe (organization_id, original_lauf_id, korrektur_typ, korrektur_grund, status)
       VALUES ('${ORG}', '${lauf.id}', 'storno', 'Zweiter Versuch', 'angelegt')`,
    )).rejects.toMatchObject({ code: '23505' })

    // Nach Abschluss des ersten Vorgangs ist ein neuer erlaubt.
    await db.query(`UPDATE public.sgb_v_korrekturlaeufe SET status = 'ausgefuehrt' WHERE original_lauf_id = '${lauf.id}'`)
    const zweiter = await db.query(
      `INSERT INTO public.sgb_v_korrekturlaeufe (organization_id, original_lauf_id, korrektur_typ, korrektur_grund, status)
       VALUES ('${ORG}', '${lauf.id}', 'korrekturabrechnung', 'Nachträgliche Korrektur', 'angelegt') RETURNING id`,
    )
    expect(zweiter.rows).toHaveLength(1)
  })

  it('erweitert den Audit-Entity-Type-Constraint um die neuen § 302-Typen', async () => {
    for (const typ of ['sgb_v_korrekturlauf', 'sgb_v_uebertragung', 'sgb_v_zahlungszuordnung']) {
      const ok = await db.query(
        `INSERT INTO public.billing_audit_trail (entity_type, organization_id) VALUES ('${typ}', '${ORG}') RETURNING id`,
      )
      expect(ok.rows).toHaveLength(1)
    }

    await expect(db.query(
      `INSERT INTO public.billing_audit_trail (entity_type, organization_id) VALUES ('nicht_erlaubter_typ', '${ORG}')`,
    )).rejects.toMatchObject({ code: '23514' })
  })
})
