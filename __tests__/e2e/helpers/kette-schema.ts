/**
 * Schema-Aufbau fuer den E2E-Kettentest auf PGlite
 * ═════════════════════════════════════════════════════════════════════
 *
 * Die Tabellen, Funktionen und Policies werden — soweit moeglich —
 * WORTGLEICH aus den Migrationsdateien geschnitten (`tabelleAusMigration`,
 * `funktionAusMigration`, `doBlockAusMigration`). Damit gilt fuer diese
 * Suite nicht der Fehler aus __tests__/../testschema-lockerer-als-produktion:
 * ein Testschema ohne die echten CHECK-Constraints haelt kaputte Pfade
 * wochenlang gruen.
 *
 * Alles, was NICHT aus einer Migration stammt, steht unten im Abschnitt
 * NACHZUG — mit Quellenangabe je Zeile. Das ist der ehrliche Rest:
 * Spalten, die spaetere ALTER-Migrationen ergaenzt haben und die hier
 * gebuendelt nachgezogen werden, statt 300 Migrationen abzuspielen.
 */

import { PGlite } from '@electric-sql/pglite'
import {
  tabelleAusMigration,
  funktionAusMigration,
  doBlockAusMigration,
  liesMigration,
  transaktionsInhalt,
} from '../../helpers/sql-extract'

// ── Quellmigrationen ─────────────────────────────────────────────────
const M_CORE          = '20250101000000_core_tables_baseline.sql'
const M_LIVE          = '20260101000000_baseline_live_only_tables.sql'
const M_SIGNATUREN    = '20260706_monatsabschluss_ki_pruefzentrale.sql'
const M_BILLING_CORE  = '20260806200000_billing_core_corrections.sql'
const M_TARIF_HARD    = '20260807120000_tariff_model_hardening.sql'
const M_EXPANSION     = '20260808100000_expansion_deutschland.sql'
const M_REVIEW_FIXES  = '20260808120000_expansion_review_fixes.sql'
const M_ZAHLUNGEN     = '20260808210000_zahlungen_forderungen_monatsabschluss.sql'
const M_MANDANT       = '20260801_phase3_multi_mandant_saas.sql'
const M_LEISTUNGSART  = '20260908000000_leistungsart_tarif_mapping.sql'
const M_RPC_V9        = '20260914000000_audit_persistenz_v9.sql'
const M_EMAIL_LOG     = '20260823000000_invoice_email_log.sql'
const M_ZUSTELLSPUR   = '20260923000000_notification_delivery_log.sql'
const M_HOCH1         = '20260922020000_hoch1_mandantentrennung.sql'
const M_MAHNUNG       = '20260812120000_sepa_mandate_and_mahnung.sql'
const M_MAHNQUEUE     = '20260918030000_dunning_email_queue.sql'
const M_MAHN_RETRY    = '20261001000000_mahnqueue_retry_dead_letter.sql'
const M_CAMT          = '20260825010000_zahlungseingang_opos.sql'

/** Stamm-Organisation — Rueckfallwert von current_org_id(). */
export const STAMM_ORG = '00000000-0000-4000-8000-000460629986'

// ─────────────────────────────────────────────────────────────────────
// Grundgeruest: Rollen, auth-Schema, pgcrypto-Ersatz
// ─────────────────────────────────────────────────────────────────────
const GRUNDGERUEST = `
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
CREATE SCHEMA IF NOT EXISTS extensions;

-- Stellvertreter fuer pgcrypto (in PGlite nicht verfuegbar): identische
-- Signatur, echtes SHA-256. Die RPC bildet damit dieselben Checksummen.
CREATE FUNCTION extensions.digest(p_data bytea, p_algo text) RETURNS bytea
  LANGUAGE sql IMMUTABLE AS $d$ SELECT sha256(p_data) $d$;

CREATE TABLE auth.users (
  id uuid PRIMARY KEY,
  email text
);

CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
$$;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(auth.jwt() ->> 'sub', '')::uuid;
$$;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT coalesce(auth.jwt() ->> 'role', current_setting('role', true));
$$;

GRANT USAGE ON SCHEMA auth, extensions, public TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.jwt(), auth.uid(), auth.role()
  TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
`

/**
 * is_admin() wortgleich aus 20260419000100_soft_delete.sql; current_org_id()
 * wortgleich aus 20260922020000_hoch1_mandantentrennung.sql. Beide werden
 * hier VOR den Tabellen gebraucht (Spalten-Defaults, Policies) und deshalb
 * zuerst mit einer Platzhalter-Definition angelegt und spaeter ersetzt.
 */
const PLATZHALTER_FUNKTIONEN = `
CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
CREATE FUNCTION public.current_org_id() RETURNS uuid LANGUAGE sql STABLE
  AS $$ SELECT '${STAMM_ORG}'::uuid $$;
`

/**
 * NACHZUG — Spalten, Constraints und Kleinigkeiten aus spaeteren
 * Migrationen. Jede Zeile nennt die Migration, aus der sie stammt.
 */
const NACHZUG = `
-- invoices ────────────────────────────────────────────────────────────
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS invoice_number_formatted TEXT,                -- 20260806200000
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,                         -- 20260806200000
  ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1,                    -- 20260806200000
  ADD COLUMN IF NOT EXISTS frozen_at TIMESTAMPTZ,                        -- 20260806200000
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,                       -- 20260806200000
  ADD COLUMN IF NOT EXISTS correction_type TEXT,                         -- 20260806200000
  ADD COLUMN IF NOT EXISTS correction_of UUID,                           -- 20260806200000
  ADD COLUMN IF NOT EXISTS bundesland TEXT,                              -- 20260808120002
  ADD COLUMN IF NOT EXISTS kostentraeger_ik TEXT,                        -- 20260808120000
  ADD COLUMN IF NOT EXISTS due_date DATE,                                -- 20260808210000
  ADD COLUMN IF NOT EXISTS dunning_level TEXT NOT NULL DEFAULT 'offen';  -- 20260808210000

-- Zahlungsziel: 20260901020000_invoice_due_date_default.sql hebt den
-- Default von 30 auf 14 Tage. Genau dieser Wert steuert die Faelligkeit,
-- die setzeFaelligkeitFallsLeer() spaeter nachzieht.
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS payment_terms_days INTEGER NOT NULL DEFAULT 14;

-- organizations ───────────────────────────────────────────────────────
-- WORTGLEICH aus 20260812120000_sepa_mandate_and_mahnung.sql (Abschnitt 1).
-- baueKettenSchema() schneidet organizations aus der Phase-3-Migration,
-- die diese vier Spalten noch nicht kennt. Ohne den Nachzug scheiterte
-- JEDE Abfrage, die sie mitliest, mit 42703 — mahnung-pdf.ts liest
-- iban und bic und brach damit den kompletten Mahnversand ab.
--
-- Der Platzhalter-UPDATE aus derselben Migration wird bewusst NICHT
-- mitgezogen: welche Glaeubiger-ID ein Mandant traegt, setzt der jeweilige
-- Test selbst — genau daran haengt die Fail-Closed-Pruefung in
-- lib/billing/sepa/glaeubiger-id.ts.
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS iban TEXT,
  ADD COLUMN IF NOT EXISTS bic TEXT,
  ADD COLUMN IF NOT EXISTS bank_name TEXT,
  ADD COLUMN IF NOT EXISTS sepa_creditor_id TEXT;

-- invoice_items ───────────────────────────────────────────────────────
-- 20260807110000_tariff_based_invoice_creation.sql: Tarif-Nachweis je Position
ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS organization_id UUID,
  ADD COLUMN IF NOT EXISTS tariff_id UUID,
  ADD COLUMN IF NOT EXISTS price_source TEXT DEFAULT 'service_records',
  ADD COLUMN IF NOT EXISTS tariff_gueltig_ab DATE,
  ADD COLUMN IF NOT EXISTS tariff_gueltig_bis DATE,
  ADD COLUMN IF NOT EXISTS tariff_preis_cent INTEGER,
  ADD COLUMN IF NOT EXISTS tariff_einheit TEXT,
  ADD COLUMN IF NOT EXISTS tariff_verguetungsart TEXT,
  ADD COLUMN IF NOT EXISTS abweichung_cent INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS abweichung_grund TEXT;

-- service_records ─────────────────────────────────────────────────────
ALTER TABLE public.service_records
  ADD COLUMN IF NOT EXISTS assignment_id UUID,                    -- 20260719_booking_request_workflow
  ADD COLUMN IF NOT EXISTS proof_status TEXT DEFAULT 'ENTWURF',   -- 20260706_monatsabschluss…
  ADD COLUMN IF NOT EXISTS signature_hash TEXT,                   -- 20260706_monatsabschluss…
  ADD COLUMN IF NOT EXISTS client_signed_at TIMESTAMPTZ,          -- 20260706_monatsabschluss…
  ADD COLUMN IF NOT EXISTS client_signer_name TEXT,               -- 20260706_monatsabschluss…
  ADD COLUMN IF NOT EXISTS caregiver_confirmed_at TIMESTAMPTZ,    -- 20260706_monatsabschluss…
  ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT false,       -- 20260706_monatsabschluss…
  ADD COLUMN IF NOT EXISTS bundesland TEXT;                       -- 20260808120002

-- billing_tariffs ─────────────────────────────────────────────────────
-- 20260807120000: ist_aktiv, 20260831040000: tarif_status (Fail-Closed),
-- 20260807180000: tarifquelle
ALTER TABLE public.billing_tariffs
  ADD COLUMN IF NOT EXISTS ist_aktiv BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS tarifquelle TEXT,
  ADD COLUMN IF NOT EXISTS verifizierungs_quelle TEXT,                    -- 20260831040000
  ADD COLUMN IF NOT EXISTS tarif_status TEXT NOT NULL DEFAULT 'unverified'
    CHECK (tarif_status IN ('verified', 'unverified', 'blocked'));

-- client_budgets ──────────────────────────────────────────────────────
ALTER TABLE public.client_budgets
  ADD COLUMN IF NOT EXISTS budget_type TEXT NOT NULL DEFAULT 'entlastung';  -- 20260805…

-- assignments / bookings ──────────────────────────────────────────────
ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS assignment_date DATE,          -- 20260719_booking_request_workflow
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS created_by UUID,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
`

/**
 * Die Postleitzahlen-Regeln sind live ein grosser Seed (scripts/
 * generate-plz-bundesland-sql.ts). Hier reichen die Praefixe, die der
 * Test verwendet — es sind Zuordnungsregeln, keine Preise.
 */
const PLZ_REGELN = `
INSERT INTO public.bundeslaender (code, bezeichnung, iso_code, sort_order) VALUES
  ('hessen', 'Hessen', 'DE-HE', 6),
  ('bayern', 'Bayern', 'DE-BY', 2)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.plz_bundesland_regeln (praefix, bundesland, sicher) VALUES
  ('60', 'hessen', true),
  ('80', 'bayern', true)
ON CONFLICT (praefix) DO NOTHING;
`

/**
 * Baut eine frische In-Process-Postgres-Instanz mit dem Ausschnitt des
 * Produktionsschemas auf, den die Abrechnungskette beruehrt.
 */
export async function baueKettenSchema(): Promise<PGlite> {
  const db = new PGlite()

  await db.exec(GRUNDGERUEST)
  await db.exec(PLATZHALTER_FUNKTIONEN)

  // ── Tabellen, wortgleich aus den Migrationen ───────────────────────
  await db.exec(tabelleAusMigration(M_MANDANT, 'organizations'))
  await db.exec(tabelleAusMigration(M_CORE, 'profiles'))
  await db.exec(tabelleAusMigration(M_CORE, 'angels'))
  await db.exec(tabelleAusMigration(M_CORE, 'bookings'))
  await db.exec(tabelleAusMigration(M_LIVE, 'caregivers'))
  await db.exec(tabelleAusMigration(M_LIVE, 'clients'))
  await db.exec(tabelleAusMigration(M_LIVE, 'client_budgets'))
  await db.exec(tabelleAusMigration(M_LIVE, 'assignments'))
  await db.exec(tabelleAusMigration(M_LIVE, 'service_records'))
  await db.exec(tabelleAusMigration(M_SIGNATUREN, 'service_signatures'))
  await db.exec(tabelleAusMigration(M_LIVE, 'invoices'))
  await db.exec(tabelleAusMigration(M_LIVE, 'invoice_items'))
  await db.exec(tabelleAusMigration(M_EXPANSION, 'bundeslaender'))
  await db.exec(tabelleAusMigration(M_REVIEW_FIXES, 'plz_bundesland_regeln'))
  await db.exec(tabelleAusMigration(M_BILLING_CORE, 'billing_tariffs'))
  await db.exec(tabelleAusMigration(M_BILLING_CORE, 'billing_number_sequences'))
  await db.exec(tabelleAusMigration(M_BILLING_CORE, 'billing_audit_trail'))
  await db.exec(tabelleAusMigration(M_BILLING_CORE, 'invoice_snapshots'))
  await db.exec(tabelleAusMigration(M_BILLING_CORE, 'invoice_line_snapshots'))
  await db.exec(tabelleAusMigration(M_TARIF_HARD, 'billing_feiertage'))
  await db.exec(tabelleAusMigration(M_ZAHLUNGEN, 'payments'))
  await db.exec(tabelleAusMigration(M_ZAHLUNGEN, 'payment_allocations'))
  await db.exec(tabelleAusMigration(M_ZAHLUNGEN, 'dunning_entries'))

  await db.exec(NACHZUG)

  // ── Funktionen, wortgleich aus den Migrationen ─────────────────────
  await db.exec(funktionAusMigration(M_BILLING_CORE, 'next_billing_number'))
  await db.exec(funktionAusMigration(M_REVIEW_FIXES, 'bundesland_fuer_plz'))
  await db.exec(funktionAusMigration(M_REVIEW_FIXES, 'eindeutiges_bundesland_fuer_plz'))
  await db.exec(funktionAusMigration(M_LEISTUNGSART, 'normalisiere_leistungsart'))
  await db.exec(funktionAusMigration(M_LEISTUNGSART, 'tarif_leistungsart'))

  // billing_audit_trail: CHECK-Constraint aus v9 TEIL 1 (enthaelt
  // 'invoice_draft' und 'tariff_lookup' — ohne sie scheitern die
  // Fail-Closed-Audit-INSERTs mit 23514 statt mit Klartext).
  await db.exec(doBlockAusMigration(M_RPC_V9, 1))

  // Die Rechnungs-RPC selbst — wortgleich aus v9.
  await db.exec(funktionAusMigration(M_RPC_V9, 'create_invoice_draft_atomic'))

  await db.exec(PLZ_REGELN)

  // ── Mandantenspalte + RESTRICTIVE org_fence ────────────────────────
  // Der DO-Block ist wortgleich aus der Phase-3-Migration und macht zwei
  // Dinge: er haengt `organization_id` an jede mandantenfaehige Tabelle
  // UND legt den Fence an. Beides gehoert in den Schemaaufbau — die
  // Spalte traegt die Mandantenzugehoerigkeit auch dann, wenn RLS (wie
  // beim service-role-Client der Anwendung) gar nicht mitlaeuft. Scharf
  // wird der Fence erst mit aktiviereMandantengrenze().
  await db.exec(`
    CREATE TABLE IF NOT EXISTS public.organization_members (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id uuid NOT NULL REFERENCES public.organizations(id),
      user_id uuid NOT NULL,
      role text NOT NULL DEFAULT 'staff',
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (organization_id, user_id)
    );
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
  `)
  await db.exec(doBlockAusMigration(M_MANDANT, letzterDoBlock(M_MANDANT)))
  await db.exec(funktionAusMigration(M_HOCH1, 'current_org_id'))

  return db
}

/**
 * Schaltet die echte Mandantentrennung scharf:
 *   • is_admin() / current_org_id() in Produktionsfassung
 *   • RESTRICTIVE org_fence auf allen mandantenfaehigen Tabellen
 *     (DO-Block wortgleich aus der Phase-3-Migration)
 *   • permissive Admin-Policy, damit der Fence ueberhaupt etwas
 *     zuschneiden kann — ohne sie waere jede Ablehnung trivial
 *
 * Getrennt vom Schemaaufbau, weil der Hauptdurchlauf mit dem
 * service-role-Client der Anwendung faehrt (BYPASSRLS) und RLS dort
 * bewusst nicht mitlaeuft.
 */
export async function aktiviereMandantengrenze(db: PGlite): Promise<void> {
  // is_admin() in Produktionsfassung — die Definition stammt aus
  // 20260419000100_soft_delete.sql (Rolle admin/superadmin, ein
  // soft-geloeschter Admin verliert ueberall seine Rechte). Sie steht
  // dort zwischen Policies und laesst sich nicht als Block schneiden.
  await db.exec(`
    CREATE OR REPLACE FUNCTION public.is_admin()
    RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
    AS $$
      SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
          AND role = ANY (ARRAY['admin','superadmin'])
          AND deleted_at IS NULL
      );
    $$;
  `)

  // Permissive Admin-Policy je Fence-Tabelle plus RLS scharf. Ohne die
  // permissive Policy greift gar keine und alles waere gesperrt — der
  // Fence-Beweis waere wertlos, weil „sieht nichts" dann trivial ist.
  await db.exec(`
    DO $$
    DECLARE t text;
    BEGIN
      FOREACH t IN ARRAY ARRAY[
        'clients','caregivers','assignments','bookings','client_budgets',
        'invoices','invoice_items','service_records','service_signatures'
      ] LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format(
          'CREATE POLICY "%s_admin_all" ON public.%I FOR ALL USING (public.is_admin()) '
          || 'WITH CHECK (public.is_admin())', t, t);
      END LOOP;
    END $$;
  `)
}

/** Index des DO-Blocks, der die Fence-Tabellen erzeugt (der letzte). */
function letzterDoBlock(datei: string): number {
  const sql = liesMigration(datei)
  return sql.split('DO $$').length - 1
}

/**
 * Spielt die beiden Protokoll-Migrationen wortgleich ein. Beide setzen
 * organizations/invoices, is_admin() und current_org_id() voraus.
 */
export async function baueProtokollTabellen(db: PGlite): Promise<void> {
  await db.exec(liesMigration(M_EMAIL_LOG))
  await db.exec(liesMigration(M_ZUSTELLSPUR))
}

/**
 * Mahnwesen: Dokumente, Warteschlange und die Blockade-Tabellen, die
 * checkDunningBlocks() abfragt.
 *
 * Die Warteschlange kommt wortgleich aus 20260918030000, die
 * Versuchsspur mit Dead Letter wortgleich aus 20261001000000. Damit
 * prueft der Kettentest genau den Status-CHECK und den
 * Negativ-CHECK, die live gelten — und nicht eine lockerere
 * Testfassung (siehe testschema-lockerer-als-produktion).
 *
 * Setzt baueKettenSchema() voraus (organizations, invoices,
 * dunning_entries).
 */
export async function baueMahnTabellen(db: PGlite): Promise<void> {
  await db.exec(tabelleAusMigration(M_MAHNUNG, 'dunning_documents'))

  // Blockade-Quellen von checkDunningBlocks(). Ohne sie liefe jede
  // Blockadepruefung ins Leere und der Test koennte „nicht blockiert"
  // nicht von „konnte nicht nachsehen" unterscheiden.
  await db.exec(tabelleAusMigration(M_LIVE, 'invoice_disputes'))
  await db.exec(tabelleAusMigration(M_ZAHLUNGEN, 'payment_differences'))
  await db.exec(tabelleAusMigration(M_BILLING_CORE, 'invoice_corrections'))

  await db.exec(tabelleAusMigration(M_MAHNQUEUE, 'dunning_email_queue'))
  await db.exec(transaktionsInhalt(M_MAHN_RETRY))
}

/**
 * CAMT-Strecke: Kontoauszugs-Import, Zahlungseingaenge, Klaerfaelle —
 * plus alles, woran der Ruecklastschrift-Handler und die
 * Matching-Engine haengen (SEPA-Mandate, Lastschriftposten,
 * Zahlungsdifferenzen).
 *
 * Die Tabellen kommen WORTGLEICH aus den Migrationen. Genau darauf
 * kommt es hier an: die beiden schwersten Befunde dieser Strecke sind
 * Verstoesse gegen CHECK-Constraints und Spaltentypen, die ein
 * handgeschriebenes Testschema nicht haette (siehe
 * testschema-lockerer-als-produktion).
 *
 * Zusaetzlich wird die Lockerung aus 20260806600000 nachgezogen:
 * billing_audit_trail.actor_id ist live nullable und traegt KEINEN
 * Fremdschluessel mehr. Ohne diesen Nachzug scheiterte hier jeder
 * Audit-Eintrag am FK statt am echten Grund.
 *
 * Setzt baueKettenSchema() voraus.
 */
export async function baueCamtTabellen(db: PGlite): Promise<void> {
  // billing_audit_trail wie live: actor_id nullable, kein FK.
  await db.exec(`
    DO $$
    DECLARE c text;
    BEGIN
      FOR c IN
        SELECT conname FROM pg_constraint
        WHERE conrelid = 'public.billing_audit_trail'::regclass AND contype = 'f'
      LOOP
        EXECUTE format('ALTER TABLE public.billing_audit_trail DROP CONSTRAINT %I', c);
      END LOOP;
    END $$;
    ALTER TABLE public.billing_audit_trail ALTER COLUMN actor_id DROP NOT NULL;
  `)

  // SEPA — Mandate, Sammler, Einzelposten.
  await db.exec(tabelleAusMigration(M_MAHNUNG, 'sepa_mandates'))
  await db.exec(tabelleAusMigration(M_MAHNUNG, 'sepa_batches'))
  await db.exec(tabelleAusMigration(M_MAHNUNG, 'sepa_batch_items'))

  // Zahlungsdifferenzen — Ziel der Ruecklastschriftgebuehr.
  await db.exec(tabelleAusMigration(M_ZAHLUNGEN, 'payment_differences'))

  // Die CAMT-Tabellen selbst.
  await db.exec(tabelleAusMigration(M_CAMT, 'camt_imports'))
  await db.exec(tabelleAusMigration(M_CAMT, 'zahlungseingaenge'))
  await db.exec(tabelleAusMigration(M_CAMT, 'klaerfaelle'))

  // Indizes wortgleich aus derselben Migration — dass der Hash-Index
  // NICHT unique ist, gehoert zum Pruefgegenstand.
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_zahlungseingaenge_org_status
      ON zahlungseingaenge(organization_id, zuordnungs_status);
    CREATE INDEX IF NOT EXISTS idx_zahlungseingaenge_hash
      ON zahlungseingaenge(quelldatei_hash);
  `)
}


/**
 * Monatsabschluss-Strecke: Verordnungen, Vorschau-Preistabelle und die
 * Abschluss-Zeilen.
 *
 * Die Tabellen kommen WORTGLEICH aus den Migrationen — inklusive der
 * CHECK-Constraints, an denen die Fail-Closed-Pruefungen haengen
 * (verordnung_type, genehmigung_status, kostentraeger_typ, bundesland,
 * monthly_closings.status/ampel).
 *
 * NACHZUG unten: Spalten aus spaeteren ALTER-Migrationen, je Zeile mit
 * Quelle. Und die Mandantenspalte inklusive Default `current_org_id()`,
 * wie sie der Phase-3-DO-Block auf monthly_closings/verordnungen/
 * leistungspreise gesetzt hat — genau dieser Default ist der Grund, warum
 * ein fehlendes `organization_id` im Anwendungscode NICHT auffaellt,
 * sondern still in der Stamm-Org landet.
 *
 * Setzt baueKettenSchema() voraus (clients, service_records).
 */
export async function baueMonatsabschlussTabellen(db: PGlite): Promise<void> {
  await db.exec(tabelleAusMigration('20260719000200_eylem_audit_complete_features.sql', 'verordnungen'))
  await db.exec(tabelleAusMigration('20260731010000_verordnungen_erweiterung.sql', 'leistungspreise'))
  await db.exec(tabelleAusMigration('20260706_monatsabschluss_ki_pruefzentrale.sql', 'monthly_closings'))

  await db.exec(`
    -- verordnungen ─────────────────────────────────────────────────────
    ALTER TABLE public.verordnungen
      ADD COLUMN IF NOT EXISTS kostentraeger_typ text NOT NULL DEFAULT 'krankenkasse'
        CHECK (kostentraeger_typ IN ('krankenkasse','sozialamt','privat','berufsgenossenschaft')),  -- 20260731010000
      ADD COLUMN IF NOT EXISTS kostentraeger_name text,                                             -- 20260731010000
      ADD COLUMN IF NOT EXISTS kostentraeger_ik_nummer text,                                        -- 20260731010000
      ADD COLUMN IF NOT EXISTS leistungsart text,                                                   -- 20260731010000
      ADD COLUMN IF NOT EXISTS abtretungserklaerung_vorhanden boolean DEFAULT false;                -- 20260731020000

    -- leistungspreise ──────────────────────────────────────────────────
    -- 20260902000000: Fail-Closed-Freigabe; 20260904000000: Belegpflicht
    ALTER TABLE public.leistungspreise
      ADD COLUMN IF NOT EXISTS tarif_status text NOT NULL DEFAULT 'unverified'
        CHECK (tarif_status IN ('verified','unverified','blocked')),
      ADD COLUMN IF NOT EXISTS verifizierungs_quelle text,
      ADD COLUMN IF NOT EXISTS beleg_id uuid;

    -- monthly_closings ─────────────────────────────────────────────────
    -- 20260808210000 ergaenzt die Summenspalten.
    ALTER TABLE public.monthly_closings
      ADD COLUMN IF NOT EXISTS total_invoiced numeric DEFAULT 0,
      ADD COLUMN IF NOT EXISTS total_paid numeric DEFAULT 0,
      ADD COLUMN IF NOT EXISTS total_open numeric DEFAULT 0;
  `)

  // Mandantenspalte wie der Phase-3-DO-Block sie setzt: NOT NULL mit
  // Default current_org_id(). Der Default ist hier Pruefgegenstand — er
  // laesst ein vergessenes organization_id still in die Stamm-Org laufen.
  await db.exec(`
    DO $$
    DECLARE t text;
    BEGIN
      FOREACH t IN ARRAY ARRAY['verordnungen','leistungspreise','monthly_closings'] LOOP
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = t AND column_name = 'organization_id'
        ) THEN
          EXECUTE format(
            'ALTER TABLE public.%I ADD COLUMN organization_id uuid REFERENCES public.organizations(id)', t);
          EXECUTE format(
            'ALTER TABLE public.%I ALTER COLUMN organization_id SET DEFAULT public.current_org_id()', t);
          EXECUTE format(
            'ALTER TABLE public.%I ALTER COLUMN organization_id SET NOT NULL', t);
        END IF;
      END LOOP;
    END $$;
  `)
}

/**
 * Tarif-Stammdaten: die drei kontrollierten Kataloge, ihre
 * Fremdschluessel auf billing_tariffs — und ein STELLVERTRETER fuer den
 * Ueberschneidungs-Constraint.
 *
 * Kataloge und Seeds kommen WORTGLEICH aus 20260807120000 bzw.
 * 20260807180000; die Codes sind kontrollierte Vokabulare, keine Preise.
 *
 * ── GRENZE, DIE HIER BENANNT WIRD ──────────────────────────────────────
 * `no_overlapping_tariffs` ist live ein
 *   EXCLUDE USING gist (… tariff_validity_range(…) WITH &&)
 * und braucht dafuer die Erweiterung btree_gist. PGlite liefert sie
 * NICHT („extension btree_gist is not available"). Der Constraint laesst
 * sich hier also nicht anlegen.
 *
 * Statt ihn stillschweigend wegzulassen — dann liefe der Ueberschneidungs-
 * fall im Test gruen durch und keiner saehe es — steht hier ein Trigger
 * mit demselben Namen im Fehlertext. Was damit geprueft wird, ist
 * ausschliesslich die REAKTION DER ANWENDUNG auf eine abgewiesene
 * Ueberschneidung. Ob der Constraint selbst richtig greift, beweist
 * dieser Stellvertreter NICHT — das kann nur eine Postgres-Instanz mit
 * btree_gist.
 *
 * Setzt baueKettenSchema() voraus (billing_tariffs).
 */
export async function baueTarifStammdaten(db: PGlite): Promise<void> {
  const M_HARDENING = '20260807120000_tariff_model_hardening.sql'
  const M_STAMM_V2 = '20260807180000_tariff_stammdaten_v2.sql'

  await db.exec(tabelleAusMigration(M_HARDENING, 'billing_leistungsarten'))
  await db.exec(tabelleAusMigration(M_HARDENING, 'billing_rechtsgrundlagen'))
  await db.exec(tabelleAusMigration(M_STAMM_V2, 'billing_tarifquellen'))

  // Seeds wortgleich aus denselben Migrationen.
  await db.exec(`
    INSERT INTO public.billing_leistungsarten (code, bezeichnung, sort_order) VALUES
      ('alltagsbegleitung',    'Alltagsbegleitung',         1),
      ('betreuung_45a',        'Betreuung nach §45a SGB XI', 2),
      ('verhinderungspflege',  'Verhinderungspflege',        3),
      ('hauswirtschaft',       'Hauswirtschaftliche Versorgung', 4),
      ('einkaufsservice',      'Einkaufsservice',            5),
      ('begleitservice',       'Begleitservice',             6),
      ('nachtbetreuung',       'Nachtbetreuung',             7),
      ('wochenendbetreuung',   'Wochenendbetreuung',         8),
      ('krankenfahrt',         'Krankenfahrt',               9),
      ('demenzbetreuung',      'Demenzbetreuung',           10),
      ('wegepauschale',        'Wegepauschale',             11),
      ('sonstige',             'Sonstige Leistung',         99)
    ON CONFLICT (code) DO NOTHING;

    INSERT INTO public.billing_rechtsgrundlagen (code, bezeichnung, sort_order) VALUES
      ('§45b SGB XI', 'Entlastungsleistungen',      1),
      ('§39 SGB XI',  'Verhinderungspflege',         2),
      ('§36 SGB XI',  'Haeusliche Pflegehilfe',      3),
      ('privat',      'Privatzahler (ohne Kasse)',    4)
    ON CONFLICT (code) DO NOTHING;

    INSERT INTO public.billing_tarifquellen (code, bezeichnung, sort_order) VALUES
      ('PRIVATE_PREISLISTE',       'Interne Preisliste fuer Privatzahler',                  1),
      ('ANERKENNUNGSBESCHEID',     'Preis aus Anerkennungsbescheid (Landesbehoerde)',        2),
      ('VERGUETUNGSVEREINBARUNG',  'Verguetungsvereinbarung mit Pflegekasse',               3),
      ('KASSENVEREINBARUNG',       'Rahmenvertrag / Kassenvereinbarung',                    4),
      ('MANUELL_FREIGEGEBEN',      'Manuell geprueft und von Geschaeftsfuehrung freigegeben', 5)
    ON CONFLICT (code) DO NOTHING;
  `)

  // Fremdschluessel wortgleich aus 20260807120000 (Abschnitt 3).
  await db.exec(`
    ALTER TABLE public.billing_tariffs
      ADD CONSTRAINT fk_tariff_leistungsart
      FOREIGN KEY (leistungsart) REFERENCES public.billing_leistungsarten(code);
    ALTER TABLE public.billing_tariffs
      ADD CONSTRAINT fk_tariff_rechtsgrundlage
      FOREIGN KEY (rechtsgrundlage) REFERENCES public.billing_rechtsgrundlagen(code);
  `)

  // STELLVERTRETER — siehe Kopfkommentar. Kein Ersatz fuer den echten
  // EXCLUDE-Constraint, nur ein Ausloeser mit demselben Namen im Text.
  await db.exec(`
    CREATE FUNCTION public.stellvertreter_overlap_guard() RETURNS trigger
    LANGUAGE plpgsql AS $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM public.billing_tariffs t
        WHERE t.organization_id = NEW.organization_id
          AND t.leistungsart    = NEW.leistungsart
          AND t.rechtsgrundlage = NEW.rechtsgrundlage
          AND COALESCE(t.kostentraeger_ik, '__ALL__') = COALESCE(NEW.kostentraeger_ik, '__ALL__')
          AND COALESCE(t.bundesland, '__ALL__')       = COALESCE(NEW.bundesland, '__ALL__')
          AND t.deleted_at IS NULL AND t.ist_aktiv = TRUE
          AND daterange(t.gueltig_ab, t.gueltig_bis, '[]')
              && daterange(NEW.gueltig_ab, NEW.gueltig_bis, '[]')
      ) THEN
        RAISE EXCEPTION
          'conflicting key value violates exclusion constraint "no_overlapping_tariffs"';
      END IF;
      RETURN NEW;
    END $$;

    CREATE TRIGGER trg_stellvertreter_overlap
      BEFORE INSERT ON public.billing_tariffs
      FOR EACH ROW EXECUTE FUNCTION public.stellvertreter_overlap_guard();
  `)
}
