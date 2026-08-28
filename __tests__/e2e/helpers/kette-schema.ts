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
const M_DATEV         = '20260812180000_datev_export.sql'
const M_TARIF_AUDIT   = '20260831040000_tarif_verifizierung_audit.sql'
const M_BELEGPFLICHT  = '20260904000000_tarif_belege_belegpflicht.sql'
const M_NACHWEIS_HART = '20260814010000_leistungsnachweis_haertung.sql'
const M_SEARCH_PATH   = '20260914010000_security_search_path_und_profiles.sql'
const M_STATUS_SYNC   = '20260901010000_service_record_status_sync.sql'
const M_INTEGRITAET   = '20261017000000_abrechnungsintegritaet_leistungsnachweis.sql'

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

-- pgcrypto bringt digest() in ZWEI Ueberladungen mit, bytea und text.
-- Hier stand lange nur die bytea-Fassung, weil die Rechnungs-RPC nur
-- diese benutzt. compute_signature_hash uebergibt dagegen eine
-- Text-Verkettung — gegen das Testschema scheiterte der Trigger deshalb
-- mit „function extensions.digest(text, unknown) does not exist", waehrend
-- er live laeuft. Ein Testschema, das eine Ueberladung weglaesst, laesst
-- genau den Trigger scheitern, den es pruefen soll.
CREATE FUNCTION extensions.digest(p_data text, p_algo text) RETURNS bytea
  LANGUAGE sql IMMUTABLE AS $d$ SELECT sha256(convert_to(p_data, 'UTF8')) $d$;

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
  -- 20260808200000: billing_status. Fehlte hier, obwohl live vorhanden — und
  -- ein Testschema, das lockerer ist als die Produktion, beweist nichts. Die
  -- Spalte traegt (zusammen mit proof_status) das Storno eines
  -- Leistungsnachweises; die status-Spalte bleibt dabei auf signed stehen.
  ADD COLUMN IF NOT EXISTS billing_status TEXT DEFAULT 'OFFEN',    -- 20260808200000
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

-- profiles ────────────────────────────────────────────────────────────
-- postal_code kommt aus 20260101000100 (Live-Baseline). Sie fehlte hier,
-- obwohl registerAsEngel sie schreibt — die Server Action scheiterte gegen
-- das Testschema mit 42703 und lieferte { ok: false }, waehrend sie live
-- durchlaeuft. Genau der Fall aus dem Projekt-Gedaechtnis: ein Testschema,
-- das lockerer (hier: aermer) ist als die Produktion, prueft einen anderen
-- Code als den ausgelieferten.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS postal_code TEXT;                     -- 20260101000100

-- profiles_role_check aus 20260924000000_rollenkonzept_least_privilege.sql,
-- WORTGLEICH. Das Kettenschema schneidet profiles aus der Core-Baseline,
-- die die Rollen pdl/qm/buchhaltung noch nicht kennt — genau der Fall, den
-- die Migration selbst im Kopf beschreibt („role='pdl' scheitert an
-- profiles_role_check"). Ohne den Nachzug ist das Testschema STRENGER als
-- die Produktion und weist Rollen ab, die live laengst gelten.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN (
    'kunde', 'engel', 'fahrer', 'angehoerige',
    'pdl', 'qm', 'buchhaltung',
    'admin', 'superadmin'
  ));

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

/**
 * DATEV-Strecke: Exportprotokoll und Debitorenzuordnung.
 *
 * Beide Tabellen kommen WORTGLEICH aus 20260812180000_datev_export.sql —
 * einschliesslich `UNIQUE(organization_id, client_id)`, an dem die
 * Wiederverwendung einer Debitorennummer haengt, und der
 * `status`-CHECK-Liste des Exportprotokolls.
 *
 * `organizations.datev_config` ergaenzt dieselbe Migration per DO-Block;
 * hier steht sie als ALTER, weil der Block auf information_schema prueft
 * und in PGlite genauso laufen wuerde — nur ohne Mehrwert.
 *
 * Setzt baueKettenSchema() voraus (organizations, clients).
 */
export async function baueDatevTabellen(db: PGlite): Promise<void> {
  await db.exec(tabelleAusMigration(M_DATEV, 'datev_exports'))
  await db.exec(tabelleAusMigration(M_DATEV, 'datev_kontenzuordnung'))
  await db.exec(`
    ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS datev_config JSONB DEFAULT NULL;
  `)
}

/**
 * Freigabe-Strecke der Tarife: Verifizierungsstatus, Belegtabelle und das
 * Fail-Closed-Gate `trg_verifizierung_belegpflicht`.
 *
 * Der Trigger ist die EINZIGE nicht umgehbare Durchsetzung der Belegpflicht
 * (die Route und die Oberflaeche sind laut Kopfkommentar von
 * lib/billing/core/tarif-verifizierung.ts nur fuer lesbare Fehlermeldungen
 * da). Er wird deshalb WORTGLEICH aus der Migration gezogen, nicht
 * nachgebaut.
 *
 * NICHT enthalten: der Storage-Bucket 'tarif-belege' aus derselben
 * Migration — PGlite hat kein storage-Schema, und der Bucket traegt keine
 * der hier geprueften Regeln.
 *
 * Setzt baueKettenSchema() und baueMonatsabschlussTabellen() voraus
 * (billing_tariffs, leistungspreise).
 */
export async function baueTarifVerifizierung(db: PGlite): Promise<void> {
  // Verifizierungsspalten — wortgleich aus 20260831040000 (billing_tariffs)
  // bzw. 20260902000000 (leistungspreise).
  await db.exec(`
    ALTER TABLE public.billing_tariffs
      ADD COLUMN IF NOT EXISTS tarif_status TEXT NOT NULL DEFAULT 'unverified'
        CHECK (tarif_status IN ('verified', 'unverified', 'blocked')),
      ADD COLUMN IF NOT EXISTS verifiziert_am TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS verifiziert_von TEXT,
      ADD COLUMN IF NOT EXISTS verifizierungs_quelle TEXT;

    ALTER TABLE public.leistungspreise
      ADD COLUMN IF NOT EXISTS tarif_status TEXT NOT NULL DEFAULT 'unverified'
        CHECK (tarif_status IN ('verified', 'unverified', 'blocked')),
      ADD COLUMN IF NOT EXISTS verifiziert_am TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS verifiziert_von TEXT,
      ADD COLUMN IF NOT EXISTS verifizierungs_quelle TEXT;
  `)

  await db.exec(tabelleAusMigration(M_TARIF_AUDIT, 'billing_tariff_audit'))

  // billing_tariff_audit: leistungspreis_id + quell_tabelle aus 20260904000000,
  // beleg_id aus derselben Migration. Der FK auf billing_tariffs faellt weg —
  // eine Audit-Zeile fuer leistungspreise traegt dort NULL.
  await db.exec(`
    ALTER TABLE public.billing_tariff_audit
      ALTER COLUMN tariff_id DROP NOT NULL,
      ADD COLUMN IF NOT EXISTS leistungspreis_id UUID,
      ADD COLUMN IF NOT EXISTS quell_tabelle TEXT NOT NULL DEFAULT 'billing_tariffs',
      ADD COLUMN IF NOT EXISTS beleg_id UUID;
  `)

  await db.exec(tabelleAusMigration(M_BELEGPFLICHT, 'billing_tarif_belege'))

  await db.exec(`
    ALTER TABLE public.billing_tariffs   ADD COLUMN IF NOT EXISTS beleg_id UUID
      REFERENCES public.billing_tarif_belege(id) ON DELETE SET NULL;
    ALTER TABLE public.leistungspreise   ADD COLUMN IF NOT EXISTS beleg_id UUID
      REFERENCES public.billing_tarif_belege(id) ON DELETE SET NULL;
  `)

  // Das Gate selbst — wortgleich.
  await db.exec(funktionAusMigration(M_BELEGPFLICHT, 'trg_verifizierung_belegpflicht'))
  await db.exec(`
    CREATE TRIGGER trg_belegpflicht_billing_tariffs
      BEFORE INSERT OR UPDATE ON public.billing_tariffs
      FOR EACH ROW EXECUTE FUNCTION public.trg_verifizierung_belegpflicht();
    CREATE TRIGGER trg_belegpflicht_leistungspreise
      BEFORE INSERT OR UPDATE ON public.leistungspreise
      FOR EACH ROW EXECUTE FUNCTION public.trg_verifizierung_belegpflicht();
  `)
}

// ─────────────────────────────────────────────────────────────────────
// Manipulationsschutz des Leistungsnachweises
// ─────────────────────────────────────────────────────────────────────

/**
 * Haengt die VIER Trigger an `service_records`, die live zusammen den
 * Manipulationsschutz bilden — jeder wortgleich aus seiner Migration:
 *
 *   trg_sync_record_status     20260901010000  proof_status → status
 *   trg_a_unterschrift_beleg   20261017000000  kein Statuswert ohne Beleg
 *   trg_compute_signature_hash 20260814010000  Hash + is_locked
 *   trg_prevent_locked_record  20260814010000  gesperrt heisst gesperrt
 *
 * Die beiden Funktionskoerper stammen aus 20260914010000 — das ist die
 * JUENGSTE Fassung (SET search_path) und damit die, die live in pg_proc
 * steht; am 28.08.2026 gegen den Live-Quelltext gehalten und identisch.
 * Die Trigger-Anweisungen selbst stehen dort nicht, sie kommen samt ihrer
 * WHEN-Bedingungen aus 20260814010000. Diese WHEN-Bedingungen sind kein
 * Beiwerk: `trg_compute_signature_hash` feuert nur, wenn sich
 * proof_status ueberhaupt AENDERT, und `trg_prevent_locked_record` nur auf
 * einer bereits gesperrten Zeile. Wer sie weglaesst, baut einen strengeren
 * Prueflauf als die Produktion und beweist damit nichts ueber sie.
 *
 * Setzt baueKettenSchema() voraus.
 */
export async function baueNachweisManipulationsschutz(db: PGlite): Promise<void> {
  // client_signature stammt aus dem Live-Baseline-Schema und fehlt im
  // Kettenschema. enforce_unterschrift_beleg liest sie — ohne die Spalte
  // scheitert der Trigger mit 42703 statt zu pruefen.
  await db.exec(`
    ALTER TABLE public.service_records
      ADD COLUMN IF NOT EXISTS client_signature TEXT;   -- 20260101000000
  `)

  await db.exec(funktionAusMigration(M_STATUS_SYNC, 'sync_service_record_status'))
  await db.exec(funktionAusMigration(M_INTEGRITAET, 'enforce_unterschrift_beleg'))
  await db.exec(funktionAusMigration(M_SEARCH_PATH, 'compute_signature_hash'))
  await db.exec(funktionAusMigration(M_SEARCH_PATH, 'prevent_locked_record_change'))

  await db.exec(`
    DROP TRIGGER IF EXISTS trg_sync_record_status ON public.service_records;
    CREATE TRIGGER trg_sync_record_status
      BEFORE INSERT OR UPDATE ON public.service_records
      FOR EACH ROW
      EXECUTE FUNCTION public.sync_service_record_status();

    DROP TRIGGER IF EXISTS trg_a_unterschrift_beleg ON public.service_records;
    CREATE TRIGGER trg_a_unterschrift_beleg
      BEFORE INSERT OR UPDATE ON public.service_records
      FOR EACH ROW
      EXECUTE FUNCTION public.enforce_unterschrift_beleg();

    DROP TRIGGER IF EXISTS trg_compute_signature_hash ON public.service_records;
    CREATE TRIGGER trg_compute_signature_hash
      BEFORE UPDATE ON public.service_records
      FOR EACH ROW
      WHEN (NEW.proof_status = 'UNTERSCHRIEBEN'
            AND OLD.proof_status IS DISTINCT FROM NEW.proof_status)
      EXECUTE FUNCTION public.compute_signature_hash();

    DROP TRIGGER IF EXISTS trg_prevent_locked_record ON public.service_records;
    CREATE TRIGGER trg_prevent_locked_record
      BEFORE UPDATE ON public.service_records
      FOR EACH ROW
      WHEN (OLD.is_locked = true)
      EXECUTE FUNCTION public.prevent_locked_record_change();
  `)
}

// ─────────────────────────────────────────────────────────────────────
// Personalmanagement: Dienstplan, Zeiterfassung, ArbZG-Protokoll
// ─────────────────────────────────────────────────────────────────────

/**
 * Baut die Personal-Strecke auf: Abwesenheiten, Dienstplan, Zeiterfassung,
 * das unveraenderliche Korrekturprotokoll und die ArbZG-Verstossliste.
 *
 * Alles Tragende kommt WORTGLEICH aus den Migrationen — Tabellen samt
 * ihren CHECK-Constraints und UNIQUE-Bedingungen, die vier
 * Trigger-Funktionen und die Auswertungssicht. Das ist hier kein
 * Selbstzweck: die drei Aussagen, um die es in diesem Modul geht, sind
 * allesamt Aussagen ueber die DATENBANK —
 *
 *   • `personal_arbeitszeiten_unique` (eine Zeit je Kraft/Tag/Startzeit)
 *   • `ueberstunden_minuten` GENERATED ALWAYS (ist − soll, sonst 0)
 *   • `log_arbeitszeit_korrektur` (Sperre + Korrekturprotokoll + Status)
 *
 * — und ein handgeschriebenes Testschema haette jede davon bestaetigt,
 * egal was drinsteht (siehe testschema-lockerer-als-produktion).
 *
 * NACHZUG, mit Quelle je Zeile:
 *   • `absences.organization_id` — die Baseline-Tabelle kennt sie nicht;
 *     live haengt sie am Phase-3-DO-Block, der in baueKettenSchema() aber
 *     VOR dieser Tabelle laeuft. `check_doppelbelegung` liest die Spalte,
 *     ohne sie scheiterte der Trigger mit 42703 statt zu pruefen.
 *   • `set_updated_at()` aus 20250101000050 — Voraussetzung der
 *     updated_at-Trigger, die die Migration mitbringt.
 *
 * NICHT enthalten: die RLS-Policies der Personal-Tabellen. Die
 * Zeiterfassung faehrt live ueber `createAdminClient()` (BYPASSRLS); was
 * hier geprueft wird, ist der Fence IM ANWENDUNGSCODE
 * (`assertCaregiverInOrg`) und die DB-Riegel — nicht RLS.
 *
 * Setzt baueKettenSchema() voraus (caregivers, clients, assignments,
 * service_records, organizations).
 */
export async function bauePersonalTabellen(db: PGlite): Promise<void> {
  const M_PERSONAL = '20260811010000_personalmanagement.sql'
  const M_ARBZG    = '20260920060000_arbeitszeit_verstoesse.sql'
  const M_FUNKTIONEN = '20250101000050_missing_production_functions.sql'

  await db.exec(funktionAusMigration(M_FUNKTIONEN, 'set_updated_at'))

  // ── caregivers erweitern (TEIL 1 der Migration, wortgleich) ───────
  // `wochenstunden_soll` traegt die vertragliche Sollzeit und ist die
  // Bezugsgroesse der Auslastung in lib/pdl/dienstplanfreigabe.ts.
  await db.exec(`
    ALTER TABLE caregivers
      ADD COLUMN IF NOT EXISTS notfallkontakt_name text,
      ADD COLUMN IF NOT EXISTS notfallkontakt_telefon text,
      ADD COLUMN IF NOT EXISTS notfallkontakt_beziehung text,
      ADD COLUMN IF NOT EXISTS vertragsstatus text DEFAULT 'aktiv',
      ADD COLUMN IF NOT EXISTS einsatzgebiet_plz text[] DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS einsatzgebiet_radius_km int DEFAULT 25,
      ADD COLUMN IF NOT EXISTS wochenstunden_soll numeric(5,2),
      ADD COLUMN IF NOT EXISTS urlaubstage_jahresanspruch int DEFAULT 0,
      ADD COLUMN IF NOT EXISTS probezeitende date,
      ADD COLUMN IF NOT EXISTS fahrzeug_kennzeichen text,
      ADD COLUMN IF NOT EXISTS fuehrerschein_klassen text[] DEFAULT '{}';
  `)

  // ── Abwesenheiten ─────────────────────────────────────────────────
  await db.exec(tabelleAusMigration(M_LIVE, 'absences'))
  await db.exec(`
    -- TEIL 3 der Personalmanagement-Migration, wortgleich.
    ALTER TABLE absences
      ADD COLUMN IF NOT EXISTS status text DEFAULT 'beantragt',
      ADD COLUMN IF NOT EXISTS halber_tag boolean DEFAULT false,
      ADD COLUMN IF NOT EXISTS tage_berechnet numeric(5,1),
      ADD COLUMN IF NOT EXISTS genehmigt_von uuid,
      ADD COLUMN IF NOT EXISTS genehmigt_am timestamptz,
      ADD COLUMN IF NOT EXISTS ablehnungsgrund text,
      ADD COLUMN IF NOT EXISTS dokument_id uuid,
      ADD COLUMN IF NOT EXISTS erstellt_von uuid,
      ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

    ALTER TABLE absences ADD CONSTRAINT absences_status_check
      CHECK (status IS NULL OR status IN ('beantragt','genehmigt','abgelehnt','storniert'));
    ALTER TABLE absences DROP CONSTRAINT IF EXISTS absences_absence_type_check;
    ALTER TABLE absences ADD CONSTRAINT absences_absence_type_check
      CHECK (absence_type IN ('sick','vacation','personal','other',
        'fortbildung','mutterschutz','elternzeit','sonderurlaub','unbezahlt'));

    -- NACHZUG (Phase-3-Fence, siehe Kopfkommentar).
    ALTER TABLE absences
      ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id);
    ALTER TABLE absences ALTER COLUMN organization_id SET DEFAULT public.current_org_id();
  `)

  // ── Dienstplan ────────────────────────────────────────────────────
  await db.exec(tabelleAusMigration(M_PERSONAL, 'dienstplan_schichten'))
  await db.exec(tabelleAusMigration(M_PERSONAL, 'dienstplan_eintraege'))

  // ── Zeiterfassung + Protokolle ────────────────────────────────────
  await db.exec(tabelleAusMigration(M_PERSONAL, 'personal_arbeitszeiten'))
  await db.exec(tabelleAusMigration(M_PERSONAL, 'personal_zeitkorrekturen'))
  await db.exec(tabelleAusMigration(M_PERSONAL, 'personal_audit_log'))
  await db.exec(tabelleAusMigration(M_ARBZG, 'arbeitszeit_verstoesse'))

  // ── Trigger-Funktionen, wortgleich ────────────────────────────────
  await db.exec(funktionAusMigration(M_PERSONAL, 'check_doppelbelegung'))
  await db.exec(funktionAusMigration(M_PERSONAL, 'log_arbeitszeit_korrektur'))
  await db.exec(funktionAusMigration(M_PERSONAL, 'prevent_zeitkorrektur_edit'))
  await db.exec(funktionAusMigration(M_ARBZG, 'arbzg_pruefung'))

  await db.exec(`
    CREATE TRIGGER trg_check_doppelbelegung
      BEFORE INSERT OR UPDATE ON dienstplan_eintraege
      FOR EACH ROW EXECUTE FUNCTION check_doppelbelegung();

    CREATE TRIGGER trg_arbzg_pruefung
      AFTER INSERT OR UPDATE ON dienstplan_eintraege
      FOR EACH ROW EXECUTE FUNCTION arbzg_pruefung();

    CREATE TRIGGER trg_log_arbeitszeit_korrektur
      BEFORE UPDATE ON personal_arbeitszeiten
      FOR EACH ROW EXECUTE FUNCTION log_arbeitszeit_korrektur();

    CREATE TRIGGER trg_updated_at_personal_arbeitszeiten BEFORE UPDATE ON personal_arbeitszeiten
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();

    CREATE TRIGGER trg_immutable_zeitkorrektur_update BEFORE UPDATE ON personal_zeitkorrekturen
      FOR EACH ROW EXECUTE FUNCTION prevent_zeitkorrektur_edit();
    CREATE TRIGGER trg_immutable_zeitkorrektur_delete BEFORE DELETE ON personal_zeitkorrekturen
      FOR EACH ROW EXECUTE FUNCTION prevent_zeitkorrektur_edit();
  `)

  // ── Auswertungssicht, wortgleich aus TEIL 13 ──────────────────────
  // Sie joint caregivers OHNE Mandantenbedingung — genau der Grund,
  // warum assertCaregiverInOrg vor dem Schreiben stehen muss.
  await db.exec(`
    CREATE OR REPLACE VIEW personal_arbeitszeitkonto AS
    SELECT
      az.organization_id,
      az.caregiver_id,
      cg.first_name || ' ' || cg.last_name AS caregiver_name,
      EXTRACT(YEAR FROM az.datum)::int AS jahr,
      EXTRACT(MONTH FROM az.datum)::int AS monat,
      COUNT(*) AS anzahl_eintraege,
      SUM(az.ist_minuten) AS ist_minuten_gesamt,
      SUM(COALESCE(az.soll_minuten, 0)) AS soll_minuten_gesamt,
      SUM(CASE WHEN az.soll_minuten IS NOT NULL THEN az.ist_minuten - az.soll_minuten ELSE 0 END) AS ueberstunden_gesamt,
      SUM(az.pause_minuten) AS pausen_gesamt,
      COUNT(*) FILTER (WHERE az.status = 'korrigiert') AS korrigierte_eintraege
    FROM personal_arbeitszeiten az
    JOIN caregivers cg ON cg.id = az.caregiver_id
    GROUP BY az.organization_id, az.caregiver_id, cg.first_name, cg.last_name,
      EXTRACT(YEAR FROM az.datum), EXTRACT(MONTH FROM az.datum);
  `)
}

/**
 * Wendet Migration 20260829005500 auf ein bereits gebautes Personal-Schema
 * an — die Fassung, die den Akteur der Zeitkorrektur nachzieht und die
 * Sperre zur echten Schranke macht.
 *
 * Bewusst NICHT Teil von bauePersonalTabellen(): die Migration ist
 * eingecheckt und (Stand 29.08.2026) NICHT angewendet. Wer sie in den
 * Grundaufbau zoege, wuerde jede Suite gegen eine Datenbank fahren lassen,
 * die es so noch nicht gibt — und der Befund, den sie behebt, waere in
 * keinem Lauf mehr sichtbar. Die Kettensuite prueft deshalb BEIDE
 * Schemafassungen.
 *
 * Setzt bauePersonalTabellen() voraus.
 */
export async function wendeArbeitszeitAkteurMigrationAn(db: PGlite): Promise<void> {
  await db.exec(transaktionsInhalt('20260829005500_arbeitszeit_korrektur_akteur.sql'))
}

// ─────────────────────────────────────────────────────────────────────
// Pflegedokumentation: Massnahmenplanung
// ─────────────────────────────────────────────────────────────────────

/**
 * Baut die Massnahmenplanung auf: Plaene, Einzelmassnahmen, das
 * unveraenderliche Pflege-Audit-Log — und die beiden Riegel, an denen
 * dieses Modul haengt.
 *
 * Alles WORTGLEICH aus den Migrationen. Was hier zaehlt, sind genau die
 * Dinge, die nur eine echte Datenbank beantwortet:
 *
 *   • `uq_pflege_massnahmenplaene_ein_aktiver_plan` — ein TEILINDEX
 *     (`WHERE status = 'aktiv'`). Er ist laut Migration 20261009000000
 *     die EIGENTLICHE Absicherung der Freigabe, weil `freigebenPlan()`
 *     mit zwei getrennten UPDATE-Anweisungen ohne Transaktionsschutz
 *     arbeitet. Ein handgeschriebenes Testschema haette daraus leicht
 *     ein gewoehnliches UNIQUE gemacht — und damit einen Riegel geprueft,
 *     den es nicht gibt.
 *   • `prevent_locked_plan_edit()` — der Sperr-Trigger, mit derselben
 *     Bedingung `OLD.gesperrt AND NEW.gesperrt`, die in der Zeiterfassung
 *     die bekannte Luecke aufmacht.
 *   • die drei CHECK-Listen (plan_typ, status, kategorie/prioritaet).
 *
 * `auth.users` traegt die Fremdschluessel von `erstellt_von` und
 * `freigegeben_von`; die Aufrufer muessen ihre Akteure dort anlegen.
 *
 * Setzt baueKettenSchema() voraus (clients, organizations, auth.users).
 */
export async function bauePflegeplanungTabellen(db: PGlite): Promise<void> {
  const M_PFLEGEDOKU = '20260810010000_pflegedokumentation.sql'
  const M_EIN_AKTIVER = '20261009000000_pflege_massnahmenplaene_ein_aktiver_plan.sql'
  const M_PFLEGE_AUDIT = '20260921040000_pflege_audit_log.sql'
  const M_FUNKTIONEN = '20250101000050_missing_production_functions.sql'

  // set_updated_at() kann schon aus bauePersonalTabellen() stammen.
  await db.exec(funktionAusMigration(M_FUNKTIONEN, 'set_updated_at'))

  await db.exec(tabelleAusMigration(M_PFLEGEDOKU, 'pflege_massnahmenplaene'))
  await db.exec(tabelleAusMigration(M_PFLEGEDOKU, 'pflege_massnahmen'))
  await db.exec(tabelleAusMigration(M_PFLEGE_AUDIT, 'pflege_audit_log'))

  // Der Teilindex — Pruefgegenstand, deshalb wortgleich.
  await db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_pflege_massnahmenplaene_ein_aktiver_plan
      ON public.pflege_massnahmenplaene (organization_id, client_id)
      WHERE status = 'aktiv';
  `)

  await db.exec(funktionAusMigration(M_PFLEGEDOKU, 'prevent_locked_plan_edit'))
  await db.exec(funktionAusMigration(M_PFLEGE_AUDIT, 'prevent_pflege_audit_log_update'))
  await db.exec(funktionAusMigration(M_PFLEGE_AUDIT, 'prevent_pflege_audit_log_delete'))

  await db.exec(`
    CREATE TRIGGER trg_locked_plan BEFORE UPDATE ON pflege_massnahmenplaene
      FOR EACH ROW EXECUTE FUNCTION prevent_locked_plan_edit();

    CREATE TRIGGER trg_updated_at_pflege_massnahmenplaene BEFORE UPDATE ON pflege_massnahmenplaene
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    CREATE TRIGGER trg_updated_at_pflege_massnahmen BEFORE UPDATE ON pflege_massnahmen
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();

    CREATE TRIGGER trg_pflege_audit_log_immutable_update BEFORE UPDATE ON public.pflege_audit_log
      FOR EACH ROW EXECUTE FUNCTION public.prevent_pflege_audit_log_update();
    CREATE TRIGGER trg_pflege_audit_log_immutable_delete BEFORE DELETE ON public.pflege_audit_log
      FOR EACH ROW EXECUTE FUNCTION public.prevent_pflege_audit_log_delete();
  `)
}

/**
 * Qualitaetsmanagement: Pflegevisite mit Befunden und Regelkreis.
 *
 * Alles WORTGLEICH aus 20260829005600. Die drei Riegel, die nur eine
 * echte Datenbank beantwortet:
 *
 *   • `qm_visite_befunde_feststellung_belegt` — ein „nicht erfuellt"
 *     ohne Feststellung ist ein Vorwurf ohne Sachverhalt
 *   • `qm_visite_befunde_punkt_unique` — je Visite jeder Pruefpunkt
 *     genau einmal, sonst stehen zwei Bewertungen nebeneinander
 *   • `prevent_abgeschlossene_visite_change` / `…befund_change` — nach
 *     dem Abschluss unveraenderlich, mit genau EINER Ausnahme
 *     (massnahme_id und erledigt_am, weil die Abstellung nach der
 *     Pruefung geschieht)
 *
 * Setzt baueKettenSchema() und bauePflegeplanungTabellen() voraus
 * (clients, caregivers, auth.users, pflege_massnahmen).
 */
export async function baueQmTabellen(db: PGlite): Promise<void> {
  const M_QM = '20260829005600_qm_pflegevisite.sql'
  const M_FUNKTIONEN = '20250101000050_missing_production_functions.sql'
  const M_INTERN = '20260706_monatsabschluss_ki_pruefzentrale.sql'

  await db.exec(funktionAusMigration(M_FUNKTIONEN, 'set_updated_at'))
  await db.exec(funktionAusMigration(M_INTERN, 'is_internal_staff'))

  await db.exec(tabelleAusMigration(M_QM, 'qm_pflegevisiten'))
  await db.exec(tabelleAusMigration(M_QM, 'qm_visite_befunde'))

  await db.exec(funktionAusMigration(M_QM, 'prevent_abgeschlossene_visite_change'))
  await db.exec(funktionAusMigration(M_QM, 'prevent_abgeschlossener_befund_change'))
  await db.exec(funktionAusMigration(M_QM, 'prevent_befund_an_abgeschlossener_visite'))

  await db.exec(`
    CREATE TRIGGER trg_qm_visite_abgeschlossen
      BEFORE UPDATE OR DELETE ON public.qm_pflegevisiten
      FOR EACH ROW EXECUTE FUNCTION public.prevent_abgeschlossene_visite_change();
    CREATE TRIGGER trg_qm_befund_abgeschlossen
      BEFORE UPDATE OR DELETE ON public.qm_visite_befunde
      FOR EACH ROW EXECUTE FUNCTION public.prevent_abgeschlossener_befund_change();
    CREATE TRIGGER trg_qm_befund_insert_offen
      BEFORE INSERT ON public.qm_visite_befunde
      FOR EACH ROW EXECUTE FUNCTION public.prevent_befund_an_abgeschlossener_visite();

    CREATE TRIGGER trg_updated_at_qm_pflegevisiten BEFORE UPDATE ON public.qm_pflegevisiten
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
    CREATE TRIGGER trg_updated_at_qm_visite_befunde BEFORE UPDATE ON public.qm_visite_befunde
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  `)
}

/**
 * Dienstplanfreigabe (Migration 20260829005700) — die PDL-Strecke.
 *
 * Wie `wendeArbeitszeitAkteurMigrationAn` bewusst NICHT Teil von
 * `bauePersonalTabellen()`: die Migration ist eingecheckt und (Stand
 * 29.08.2026) nicht angewendet. Suiten, die den heutigen Zustand pruefen,
 * duerfen sie nicht sehen.
 *
 * Setzt bauePersonalTabellen() voraus (dienstplan_eintraege,
 * arbeitszeit_verstoesse, caregivers) und `is_internal_staff` fuer die
 * Policies — die kommt hier mit, weil die Personal-Strecke sie nicht baut.
 */
export async function wendeDienstplanFreigabeMigrationAn(db: PGlite): Promise<void> {
  await db.exec(
    funktionAusMigration('20260706_monatsabschluss_ki_pruefzentrale.sql', 'is_internal_staff'),
  )
  await db.exec(transaktionsInhalt('20260829005700_dienstplan_freigabe.sql'))
}
