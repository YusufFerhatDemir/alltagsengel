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
