-- ═══════════════════════════════════════════════════════════════════════════
-- KOMBINIERTES MIGRATIONS-SKRIPT — 6 ausstehende Migrationen
-- Erstellt: 2026-08-12
-- Anwendung: Supabase SQL Editor → dieses gesamte Skript einfügen → Run
--
-- Reihenfolge (sequenziell, jede baut auf der vorherigen auf):
--   1. 20260826010000_dipa_freischaltung_nachweise_eul.sql
--   2. 20260826020000_sgb_v_302_geruest.sql
--   3. 20260827010000_analytics_bonussystem.sql
--   4. 20260828010000_sync_offline.sql
--   5. 20260829010000_fhir_isip_audit_log.sql
--   6. 20260830010000_kim_ti_geruest.sql
--
-- IDEMPOTENT: Alle Statements nutzen IF NOT EXISTS / DO-Guards.
-- Kann bei Fehler erneut ausgeführt werden.
-- ═══════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION 1/6: DiPA Block 15 — Freischaltung, Nutzungsnachweise, eUL
-- (20260826010000_dipa_freischaltung_nachweise_eul.sql)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- TEIL 1: Pseudonymisierungs-Infrastruktur
CREATE TABLE IF NOT EXISTS coach_pseudonym_key (
  id          smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  schluessel  bytea NOT NULL DEFAULT extensions.gen_random_bytes(32),
  erzeugt_am  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE coach_pseudonym_key IS
  'Einzelner HMAC-Schluessel fuer die Pseudonymisierung der DiPA-Nutzungsnachweise. Nicht lesbar (keine Policy, keine Grants). Loeschen = irreversible Anonymisierung aller Nachweisdaten.';

INSERT INTO coach_pseudonym_key (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE coach_pseudonym_key ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON coach_pseudonym_key FROM anon, authenticated;

CREATE OR REPLACE FUNCTION coach_pseudonym(p_user_id uuid)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, extensions
AS $$
  SELECT CASE
    WHEN p_user_id IS NULL THEN NULL
    ELSE encode(extensions.hmac(p_user_id::text, k.schluessel, 'sha256'), 'hex')
  END
  FROM coach_pseudonym_key k
  WHERE k.id = 1;
$$;

REVOKE ALL ON FUNCTION coach_pseudonym(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION coach_pseudonym(uuid) TO service_role;

CREATE OR REPLACE FUNCTION coach_mein_pseudonym()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, extensions
AS $$
  SELECT coach_pseudonym(auth.uid());
$$;

REVOKE ALL ON FUNCTION coach_mein_pseudonym() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION coach_mein_pseudonym() TO authenticated, service_role;

-- TEIL 2: coach_freischaltcodes
CREATE TABLE IF NOT EXISTS coach_freischaltcodes (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid NOT NULL DEFAULT current_org_id(),
  code_hash             text NOT NULL UNIQUE,
  code_praefix          text NOT NULL,
  quelle                text NOT NULL DEFAULT 'pflegekasse'
                        CHECK (quelle IN ('pflegekasse','hersteller_pilot','testzugang')),
  kostentraeger_ik      text,
  genehmigt_am          date,
  gueltig_von           date NOT NULL DEFAULT CURRENT_DATE,
  gueltig_bis           date,
  status                text NOT NULL DEFAULT 'ausgegeben'
                        CHECK (status IN ('ausgegeben','eingeloest','abgelaufen','storniert')),
  abrechnungsweg_key    text,
  eingeloest_am         timestamptz,
  eingeloest_pseudonym  text,
  notiz                 text,
  erstellt_von          uuid REFERENCES auth.users(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coach_freischaltcodes_org
  ON coach_freischaltcodes(organization_id, status, created_at DESC);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_coach_freischaltcodes_updated_at') THEN
    CREATE TRIGGER trg_coach_freischaltcodes_updated_at BEFORE UPDATE ON coach_freischaltcodes
      FOR EACH ROW EXECUTE FUNCTION coach_set_updated_at();
  END IF;
END $$;

ALTER TABLE coach_freischaltcodes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'coach_freischaltcodes' AND policyname = 'admin_coach_freischaltcodes') THEN
    CREATE POLICY admin_coach_freischaltcodes ON coach_freischaltcodes FOR ALL
      TO authenticated USING (is_admin()) WITH CHECK (is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'coach_freischaltcodes' AND policyname = 'org_fence_coach_freischaltcodes') THEN
    CREATE POLICY org_fence_coach_freischaltcodes ON coach_freischaltcodes AS RESTRICTIVE FOR ALL
      TO authenticated USING (organization_id = current_org_id());
  END IF;
END $$;

REVOKE ALL ON coach_freischaltcodes FROM anon;

-- TEIL 3: coach_freischaltungen
CREATE TABLE IF NOT EXISTS coach_freischaltungen (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_user_id      uuid NOT NULL REFERENCES coach_users(id) ON DELETE CASCADE,
  code_id            uuid REFERENCES coach_freischaltcodes(id) ON DELETE SET NULL,
  code_praefix       text,
  quelle             text NOT NULL DEFAULT 'pflegekasse'
                     CHECK (quelle IN ('pflegekasse','hersteller_pilot','testzugang')),
  status             text NOT NULL DEFAULT 'aktiv'
                     CHECK (status IN ('aktiv','abgelaufen','widerrufen')),
  gueltig_von        date NOT NULL DEFAULT CURRENT_DATE,
  gueltig_bis        date,
  freigeschaltet_am  timestamptz NOT NULL DEFAULT now(),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coach_freischaltungen_user
  ON coach_freischaltungen(coach_user_id, status);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_coach_freischaltungen_updated_at') THEN
    CREATE TRIGGER trg_coach_freischaltungen_updated_at BEFORE UPDATE ON coach_freischaltungen
      FOR EACH ROW EXECUTE FUNCTION coach_set_updated_at();
  END IF;
END $$;

ALTER TABLE coach_freischaltungen ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'coach_freischaltungen' AND policyname = 'coach_freischaltungen_select_self') THEN
    CREATE POLICY coach_freischaltungen_select_self ON coach_freischaltungen FOR SELECT TO authenticated
      USING (coach_user_id IN (SELECT cu.id FROM coach_users cu WHERE cu.user_id = auth.uid()));
  END IF;
END $$;

REVOKE ALL ON coach_freischaltungen FROM anon;
REVOKE INSERT, UPDATE, DELETE ON coach_freischaltungen FROM authenticated;

-- TEIL 4: coach_anspruchspruefungen
CREATE TABLE IF NOT EXISTS coach_anspruchspruefungen (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_user_id         uuid NOT NULL REFERENCES coach_users(id) ON DELETE CASCADE,
  pflegegrad            integer CHECK (pflegegrad IS NULL OR pflegegrad BETWEEN 0 AND 5),
  pflegegrad_beantragt  boolean NOT NULL DEFAULT false,
  haeusliche_versorgung boolean,
  nutzung_durch         text CHECK (nutzung_durch IS NULL OR nutzung_durch IN ('pflegebeduerftig','angehoerig','gemeinsam')),
  ergebnis              text NOT NULL CHECK (ergebnis IN ('anspruch_moeglich','anspruch_unklar','kein_anspruch')),
  kriterien_version     text NOT NULL,
  hinweise              text[] NOT NULL DEFAULT '{}',
  geprueft_am           timestamptz NOT NULL DEFAULT now(),
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coach_anspruchspruefungen_user
  ON coach_anspruchspruefungen(coach_user_id, geprueft_am DESC);

ALTER TABLE coach_anspruchspruefungen ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'coach_anspruchspruefungen' AND policyname = 'coach_anspruchspruefungen_owner_all') THEN
    CREATE POLICY coach_anspruchspruefungen_owner_all ON coach_anspruchspruefungen FOR ALL TO authenticated
      USING (coach_user_id IN (SELECT cu.id FROM coach_users cu WHERE cu.user_id = auth.uid()))
      WITH CHECK (coach_user_id IN (SELECT cu.id FROM coach_users cu WHERE cu.user_id = auth.uid()));
  END IF;
END $$;

REVOKE ALL ON coach_anspruchspruefungen FROM anon;

-- TEIL 5: coach_nutzungsereignisse
CREATE TABLE IF NOT EXISTS coach_nutzungsereignisse (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pseudonym         text NOT NULL,
  ereignis          text NOT NULL CHECK (ereignis IN (
                      'sitzung_gestartet','modul_geoeffnet','modul_abgeschlossen',
                      'aktivitaet_erledigt','assessment_erfasst','ziel_angelegt',
                      'ziel_erreicht','messung_erfasst','bericht_erstellt','export_erstellt')),
  modul_key         text,
  rolle             text CHECK (rolle IS NULL OR rolle IN ('pflegebeduerftig','angehoerig','pflegedienst')),
  auswertungswoche  date NOT NULL DEFAULT (date_trunc('week', now())::date),
  anzahl            integer NOT NULL DEFAULT 1 CHECK (anzahl > 0)
);

CREATE INDEX IF NOT EXISTS idx_coach_nutzungsereignisse_woche
  ON coach_nutzungsereignisse(auswertungswoche, ereignis);
CREATE INDEX IF NOT EXISTS idx_coach_nutzungsereignisse_pseudonym
  ON coach_nutzungsereignisse(pseudonym, auswertungswoche);

ALTER TABLE coach_nutzungsereignisse ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'coach_nutzungsereignisse' AND policyname = 'coach_nutzungsereignisse_self_select') THEN
    CREATE POLICY coach_nutzungsereignisse_self_select ON coach_nutzungsereignisse FOR SELECT TO authenticated
      USING (pseudonym = coach_mein_pseudonym());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'coach_nutzungsereignisse' AND policyname = 'coach_nutzungsereignisse_self_insert') THEN
    CREATE POLICY coach_nutzungsereignisse_self_insert ON coach_nutzungsereignisse FOR INSERT TO authenticated
      WITH CHECK (pseudonym = coach_mein_pseudonym());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'coach_nutzungsereignisse' AND policyname = 'coach_nutzungsereignisse_self_delete') THEN
    CREATE POLICY coach_nutzungsereignisse_self_delete ON coach_nutzungsereignisse FOR DELETE TO authenticated
      USING (pseudonym = coach_mein_pseudonym());
  END IF;
END $$;

REVOKE ALL ON coach_nutzungsereignisse FROM anon;
REVOKE UPDATE ON coach_nutzungsereignisse FROM authenticated;

-- TEIL 6: coach_abrechnungswege
CREATE TABLE IF NOT EXISTS coach_abrechnungswege (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL DEFAULT current_org_id(),
  schluessel          text NOT NULL,
  bezeichnung         text NOT NULL,
  beschreibung        text,
  rechtsgrundlage     text,
  aktiv               boolean NOT NULL DEFAULT false,
  verguetung_geklaert boolean NOT NULL DEFAULT false,
  konfiguration       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, schluessel)
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_coach_abrechnungswege_updated_at') THEN
    CREATE TRIGGER trg_coach_abrechnungswege_updated_at BEFORE UPDATE ON coach_abrechnungswege
      FOR EACH ROW EXECUTE FUNCTION coach_set_updated_at();
  END IF;
END $$;

ALTER TABLE coach_abrechnungswege ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'coach_abrechnungswege' AND policyname = 'admin_coach_abrechnungswege') THEN
    CREATE POLICY admin_coach_abrechnungswege ON coach_abrechnungswege FOR ALL
      TO authenticated USING (is_admin()) WITH CHECK (is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'coach_abrechnungswege' AND policyname = 'org_fence_coach_abrechnungswege') THEN
    CREATE POLICY org_fence_coach_abrechnungswege ON coach_abrechnungswege AS RESTRICTIVE FOR ALL
      TO authenticated USING (organization_id = current_org_id());
  END IF;
END $$;

REVOKE ALL ON coach_abrechnungswege FROM anon;

-- TEIL 7: eul_erbringungen
CREATE TABLE IF NOT EXISTS eul_erbringungen (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id        uuid NOT NULL DEFAULT current_org_id(),
  booking_id             uuid REFERENCES bookings(id) ON DELETE SET NULL,
  client_id              uuid REFERENCES clients(id) ON DELETE SET NULL,
  coach_pseudonym        text,
  leistungsart           text NOT NULL CHECK (leistungsart IN (
                           'einweisung','technische_unterstuetzung','begleitete_nutzung',
                           'schulung_angehoerige','auswertungsgespraech')),
  datum                  date NOT NULL DEFAULT CURRENT_DATE,
  dauer_minuten          integer NOT NULL CHECK (dauer_minuten BETWEEN 1 AND 480),
  durchfuehrungsform     text NOT NULL DEFAULT 'persoenlich_vor_ort'
                         CHECK (durchfuehrungsform IN ('persoenlich_vor_ort','telefonisch','video')),
  inhalt                 text NOT NULL,
  erbracht_von           uuid REFERENCES auth.users(id),
  erbringer_name         text,
  qualifikation_geprueft boolean NOT NULL DEFAULT false,
  bestaetigt_am          timestamptz,
  bestaetigt_durch       text,
  abrechnungsweg_key     text,
  bemerkung              text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_eul_erbringungen_org
  ON eul_erbringungen(organization_id, datum DESC);
CREATE INDEX IF NOT EXISTS idx_eul_erbringungen_client
  ON eul_erbringungen(client_id, datum DESC);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_eul_erbringungen_updated_at') THEN
    CREATE TRIGGER trg_eul_erbringungen_updated_at BEFORE UPDATE ON eul_erbringungen
      FOR EACH ROW EXECUTE FUNCTION coach_set_updated_at();
  END IF;
END $$;

ALTER TABLE eul_erbringungen ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'eul_erbringungen' AND policyname = 'admin_eul_erbringungen') THEN
    CREATE POLICY admin_eul_erbringungen ON eul_erbringungen FOR ALL
      TO authenticated USING (is_admin()) WITH CHECK (is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'eul_erbringungen' AND policyname = 'org_fence_eul_erbringungen') THEN
    CREATE POLICY org_fence_eul_erbringungen ON eul_erbringungen AS RESTRICTIVE FOR ALL
      TO authenticated USING (organization_id = current_org_id());
  END IF;
END $$;

REVOKE ALL ON eul_erbringungen FROM anon;

-- TEIL 8: eul_qualifikationen
CREATE TABLE IF NOT EXISTS eul_qualifikationen (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL DEFAULT current_org_id(),
  user_id          uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  caregiver_id     uuid REFERENCES caregivers(id) ON DELETE CASCADE,
  erbringer_name   text,
  kriterium_key    text NOT NULL,
  erfuellt         boolean NOT NULL DEFAULT false,
  nachweis_art     text,
  geprueft_am      date,
  geprueft_durch   text,
  gueltig_bis      date,
  notiz            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_eul_qualifikationen_org
  ON eul_qualifikationen(organization_id, kriterium_key);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_eul_qualifikationen_updated_at') THEN
    CREATE TRIGGER trg_eul_qualifikationen_updated_at BEFORE UPDATE ON eul_qualifikationen
      FOR EACH ROW EXECUTE FUNCTION coach_set_updated_at();
  END IF;
END $$;

ALTER TABLE eul_qualifikationen ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'eul_qualifikationen' AND policyname = 'admin_eul_qualifikationen') THEN
    CREATE POLICY admin_eul_qualifikationen ON eul_qualifikationen FOR ALL
      TO authenticated USING (is_admin()) WITH CHECK (is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'eul_qualifikationen' AND policyname = 'org_fence_eul_qualifikationen') THEN
    CREATE POLICY org_fence_eul_qualifikationen ON eul_qualifikationen AS RESTRICTIVE FOR ALL
      TO authenticated USING (organization_id = current_org_id());
  END IF;
END $$;

REVOKE ALL ON eul_qualifikationen FROM anon;

-- TEIL 9: Audit-Trigger
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['coach_freischaltungen','coach_anspruchspruefungen'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_audit_' || t) THEN
      EXECUTE format(
        'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %I
           FOR EACH ROW EXECUTE FUNCTION coach_audit_trigger()',
        'trg_audit_' || t, t);
    END IF;
  END LOOP;
END $$;


-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION 2/6: § 302 SGB V — Gerüst
-- (20260826020000_sgb_v_302_geruest.sql)
-- ═══════════════════════════════════════════════════════════════════════════

-- abrechnungslaeufe: Rechtsgrundlage
ALTER TABLE public.abrechnungslaeufe
  ADD COLUMN IF NOT EXISTS rechtsgrundlage text NOT NULL DEFAULT 'sgb_xi_105',
  ADD COLUMN IF NOT EXISTS sgb_v_format text,
  ADD COLUMN IF NOT EXISTS sgb_v_ta_version text;

ALTER TABLE public.abrechnungslaeufe
  DROP CONSTRAINT IF EXISTS chk_lauf_rechtsgrundlage,
  ADD CONSTRAINT chk_lauf_rechtsgrundlage CHECK (rechtsgrundlage IN (
    'sgb_xi_105',
    'sgb_v_302'
  ));

ALTER TABLE public.abrechnungslaeufe
  DROP CONSTRAINT IF EXISTS chk_lauf_sgb_v_format,
  ADD CONSTRAINT chk_lauf_sgb_v_format CHECK (
    (rechtsgrundlage <> 'sgb_v_302' AND sgb_v_format IS NULL)
    OR (rechtsgrundlage = 'sgb_v_302' AND sgb_v_format IN ('edifact_slga_slla', 'xml_hkp'))
  );

CREATE INDEX IF NOT EXISTS idx_abrechnungslaeufe_rechtsgrundlage
  ON public.abrechnungslaeufe(rechtsgrundlage, abrechnungsmonat);

-- sgb_v_formatversionen
CREATE TABLE IF NOT EXISTS public.sgb_v_formatversionen (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL DEFAULT current_org_id()
                  REFERENCES public.organizations(id),
  bezeichnung     text NOT NULL,
  format          text NOT NULL
                  CHECK (format IN ('edifact_slga_slla', 'xml_hkp')),
  ta_version      text NOT NULL,
  gueltig_von     date NOT NULL,
  gueltig_bis     date,
  spec_bestaetigt boolean NOT NULL DEFAULT false,
  spec_quelle     text,
  spec_bestaetigt_am timestamptz,
  spec_bestaetigt_von uuid REFERENCES auth.users(id),
  hinweis         text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES auth.users(id),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz,
  CONSTRAINT chk_sgb_v_version_zeitraum CHECK (
    gueltig_bis IS NULL OR gueltig_von <= gueltig_bis
  ),
  CONSTRAINT chk_sgb_v_version_quelle CHECK (
    spec_bestaetigt = false OR spec_quelle IS NOT NULL
  ),
  CONSTRAINT unique_sgb_v_version UNIQUE (organization_id, format, ta_version)
);

CREATE INDEX IF NOT EXISTS idx_sgb_v_versionen_org
  ON public.sgb_v_formatversionen(organization_id);
CREATE INDEX IF NOT EXISTS idx_sgb_v_versionen_gueltig
  ON public.sgb_v_formatversionen(gueltig_von, gueltig_bis);

-- sgb_v_routing
CREATE TABLE IF NOT EXISTS public.sgb_v_routing (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL DEFAULT current_org_id()
                  REFERENCES public.organizations(id),
  kostentraeger_ik   text NOT NULL CHECK (kostentraeger_ik ~ '^\d{9}$'),
  kostentraeger_name text,
  kassenart          text,
  datenannahmestelle_ik   text CHECK (datenannahmestelle_ik IS NULL OR datenannahmestelle_ik ~ '^\d{9}$'),
  datenannahmestelle_name text,
  annahme_format     text CHECK (annahme_format IS NULL OR annahme_format IN ('edifact_slga_slla', 'xml_hkp')),
  gueltig_von     date,
  gueltig_bis     date,
  quelle          text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES auth.users(id),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz,
  CONSTRAINT chk_sgb_v_routing_zeitraum CHECK (
    gueltig_bis IS NULL OR gueltig_von IS NULL OR gueltig_von <= gueltig_bis
  ),
  CONSTRAINT unique_sgb_v_routing UNIQUE (organization_id, kostentraeger_ik, gueltig_von)
);

CREATE INDEX IF NOT EXISTS idx_sgb_v_routing_org
  ON public.sgb_v_routing(organization_id);
CREATE INDEX IF NOT EXISTS idx_sgb_v_routing_ik
  ON public.sgb_v_routing(kostentraeger_ik);

-- RLS
ALTER TABLE public.sgb_v_formatversionen ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sgb_v_routing         ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sgb_v_formatversionen' AND policyname = 'org_fence_sgb_v_formatversionen') THEN
    CREATE POLICY org_fence_sgb_v_formatversionen ON public.sgb_v_formatversionen AS RESTRICTIVE FOR ALL
      USING (organization_id = current_org_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sgb_v_routing' AND policyname = 'org_fence_sgb_v_routing') THEN
    CREATE POLICY org_fence_sgb_v_routing ON public.sgb_v_routing AS RESTRICTIVE FOR ALL
      USING (organization_id = current_org_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sgb_v_formatversionen' AND policyname = 'admin_sgb_v_formatversionen_all') THEN
    CREATE POLICY admin_sgb_v_formatversionen_all ON public.sgb_v_formatversionen FOR ALL
      USING (is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sgb_v_routing' AND policyname = 'admin_sgb_v_routing_all') THEN
    CREATE POLICY admin_sgb_v_routing_all ON public.sgb_v_routing FOR ALL
      USING (is_admin());
  END IF;
END $$;

-- Audit-Entity-Typen erweitern
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'billing_audit_trail_entity_type_check'
      AND pg_get_constraintdef(oid) LIKE '%sgb_v_lauf%'
  ) THEN
    ALTER TABLE public.billing_audit_trail
      DROP CONSTRAINT IF EXISTS billing_audit_trail_entity_type_check;
    ALTER TABLE public.billing_audit_trail
      ADD CONSTRAINT billing_audit_trail_entity_type_check CHECK (
        entity_type = ANY(ARRAY[
          'invoice', 'tariff', 'correction', 'snapshot', 'credit_note',
          'payment', 'payment_allocation', 'dunning', 'payment_difference',
          'monthly_closing',
          'dta_lauf', 'dta_kostentraeger', 'dta_dakota_auftrag',
          'dta_ruecklaeufer', 'dta_fehlerprotokoll', 'dta_korrekturlauf',
          'dta_validierung', 'dta_lauf_rechnung', 'dta_annahmestelle',
          'dta_ruecklaeufer_position',
          'dokument', 'dokument_version', 'vertrag', 'kontaktperson',
          'verordnung', 'kundenakte', 'mitarbeiterakte',
          'sepa_mandate', 'sepa_batch', 'dunning_document',
          'billing_fristen',
          'camt_import', 'zahlungseingang', 'klaerfall', 'ruecklastschrift',
          'datev_export', 'datev_kontenzuordnung',
          'sgb_v_lauf', 'sgb_v_formatversion', 'sgb_v_routing'
        ])
      );
  END IF;
END $$;

-- Versionsregister vorbefüllen
INSERT INTO public.sgb_v_formatversionen
  (organization_id, bezeichnung, format, ta_version, gueltig_von, gueltig_bis, spec_bestaetigt, hinweis)
VALUES
  ('00000000-0000-4000-8000-000460629986',
   'Technische Anlage 1 — Version 21',
   'edifact_slga_slla', '21', '2020-01-01', '2027-01-31', false,
   'Aktuell geltende Version. Segmentstrukturen und Schlüsselverzeichnisse liegen noch nicht vor — Export gesperrt.'),
  ('00000000-0000-4000-8000-000460629986',
   'Technische Anlage 1 — Version 22',
   'edifact_slga_slla', '22', '2027-02-01', NULL, false,
   'Gilt ab 02/2027. Spezifikation noch nicht hinterlegt — Export gesperrt.'),
  ('00000000-0000-4000-8000-000460629986',
   'HKP-XML-Anlage — Version 1.3.0',
   'xml_hkp', '1.3.0', '2027-02-01', NULL, false,
   'XML-Kanal für häusliche Krankenpflege ab 02/2027. Schema noch nicht hinterlegt — Export gesperrt.')
ON CONFLICT (organization_id, format, ta_version) DO NOTHING;


-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION 3/6: Analytics & Bonussystem
-- (20260827010000_analytics_bonussystem.sql)
-- ═══════════════════════════════════════════════════════════════════════════

-- bonus_regeln
CREATE TABLE IF NOT EXISTS public.bonus_regeln (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL DEFAULT current_org_id() REFERENCES public.organizations(id),
  name             text NOT NULL,
  kriterium_typ    text NOT NULL CHECK (kriterium_typ IN (
                     'keine_ausfaelle', 'vollstaendige_dokumentation', 'keine_offenen_pruefungen'
                   )),
  schwellenwert    numeric NOT NULL,
  punkte           integer NOT NULL CHECK (punkte > 0),
  aktiv            boolean NOT NULL DEFAULT true,
  created_by       uuid REFERENCES auth.users(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bonus_regeln_org ON public.bonus_regeln(organization_id);
CREATE INDEX IF NOT EXISTS idx_bonus_regeln_aktiv ON public.bonus_regeln(organization_id, aktiv);

ALTER TABLE public.bonus_regeln ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bonus_regeln' AND policyname = 'admin_bonus_regeln') THEN
    CREATE POLICY admin_bonus_regeln ON public.bonus_regeln FOR ALL TO authenticated
      USING (is_admin()) WITH CHECK (is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bonus_regeln' AND policyname = 'org_fence_bonus_regeln') THEN
    CREATE POLICY org_fence_bonus_regeln ON public.bonus_regeln AS RESTRICTIVE FOR ALL TO authenticated
      USING (organization_id = current_org_id());
  END IF;
END $$;

REVOKE ALL ON public.bonus_regeln FROM anon;

DROP TRIGGER IF EXISTS trg_updated_at_bonus_regeln ON public.bonus_regeln;
CREATE TRIGGER trg_updated_at_bonus_regeln BEFORE UPDATE ON public.bonus_regeln
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- bonus_berechnungen
CREATE TABLE IF NOT EXISTS public.bonus_berechnungen (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL DEFAULT current_org_id() REFERENCES public.organizations(id),
  regel_id         uuid NOT NULL REFERENCES public.bonus_regeln(id) ON DELETE CASCADE,
  caregiver_id     uuid NOT NULL REFERENCES public.caregivers(id) ON DELETE CASCADE,
  zeitraum_von     date NOT NULL,
  zeitraum_bis     date NOT NULL,
  erfuellt         boolean NOT NULL,
  messwert         numeric,
  punkte           integer NOT NULL DEFAULT 0,
  status           text NOT NULL DEFAULT 'berechnet' CHECK (status IN (
                     'berechnet', 'freigegeben', 'abgelehnt', 'ausgezahlt'
                   )),
  berechnet_am     timestamptz NOT NULL DEFAULT now(),
  berechnet_von    uuid REFERENCES auth.users(id),
  details          jsonb,
  CONSTRAINT bonus_berechnungen_zeitraum_check CHECK (zeitraum_bis >= zeitraum_von),
  CONSTRAINT bonus_berechnungen_unique UNIQUE (regel_id, caregiver_id, zeitraum_von, zeitraum_bis)
);

CREATE INDEX IF NOT EXISTS idx_bonus_berechnungen_org ON public.bonus_berechnungen(organization_id);
CREATE INDEX IF NOT EXISTS idx_bonus_berechnungen_status ON public.bonus_berechnungen(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_bonus_berechnungen_caregiver ON public.bonus_berechnungen(caregiver_id);

ALTER TABLE public.bonus_berechnungen ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bonus_berechnungen' AND policyname = 'admin_bonus_berechnungen') THEN
    CREATE POLICY admin_bonus_berechnungen ON public.bonus_berechnungen FOR ALL TO authenticated
      USING (is_admin()) WITH CHECK (is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bonus_berechnungen' AND policyname = 'org_fence_bonus_berechnungen') THEN
    CREATE POLICY org_fence_bonus_berechnungen ON public.bonus_berechnungen AS RESTRICTIVE FOR ALL TO authenticated
      USING (organization_id = current_org_id());
  END IF;
END $$;

REVOKE ALL ON public.bonus_berechnungen FROM anon;

-- bonus_freigaben
CREATE TABLE IF NOT EXISTS public.bonus_freigaben (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL DEFAULT current_org_id() REFERENCES public.organizations(id),
  berechnung_id    uuid NOT NULL REFERENCES public.bonus_berechnungen(id) ON DELETE CASCADE,
  entscheidung     text NOT NULL CHECK (entscheidung IN ('freigegeben', 'abgelehnt')),
  kommentar        text,
  entschieden_von  uuid NOT NULL REFERENCES auth.users(id),
  entschieden_am   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bonus_freigaben_org ON public.bonus_freigaben(organization_id);
CREATE INDEX IF NOT EXISTS idx_bonus_freigaben_berechnung ON public.bonus_freigaben(berechnung_id);

ALTER TABLE public.bonus_freigaben ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bonus_freigaben' AND policyname = 'admin_bonus_freigaben') THEN
    CREATE POLICY admin_bonus_freigaben ON public.bonus_freigaben FOR ALL TO authenticated
      USING (is_admin()) WITH CHECK (is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bonus_freigaben' AND policyname = 'org_fence_bonus_freigaben') THEN
    CREATE POLICY org_fence_bonus_freigaben ON public.bonus_freigaben AS RESTRICTIVE FOR ALL TO authenticated
      USING (organization_id = current_org_id());
  END IF;
END $$;

REVOKE ALL ON public.bonus_freigaben FROM anon;


-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION 4/6: Sync & Offline
-- (20260828010000_sync_offline.sql)
-- ═══════════════════════════════════════════════════════════════════════════

-- sync_audit_log
CREATE TABLE IF NOT EXISTS public.sync_audit_log (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL DEFAULT current_org_id() REFERENCES public.organizations(id),
  user_id          uuid NOT NULL REFERENCES auth.users(id),
  queue_item_id    text NOT NULL,
  idempotency_key  text NOT NULL,
  entity_typ       text NOT NULL,
  aktion           text NOT NULL CHECK (aktion IN (
                     'sync_start', 'sync_success', 'sync_error',
                     'conflict_detected', 'conflict_resolved', 'retry'
                   )),
  details          jsonb,
  erstellt_am      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sync_audit_log_org ON public.sync_audit_log(organization_id);
CREATE INDEX IF NOT EXISTS idx_sync_audit_log_user ON public.sync_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_sync_audit_log_idempotency ON public.sync_audit_log(organization_id, idempotency_key);
CREATE INDEX IF NOT EXISTS idx_sync_audit_log_aktion ON public.sync_audit_log(organization_id, aktion, erstellt_am DESC);

ALTER TABLE public.sync_audit_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sync_audit_log' AND policyname = 'admin_sync_audit_log') THEN
    CREATE POLICY admin_sync_audit_log ON public.sync_audit_log FOR ALL TO authenticated
      USING (is_admin()) WITH CHECK (is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sync_audit_log' AND policyname = 'org_fence_sync_audit_log') THEN
    CREATE POLICY org_fence_sync_audit_log ON public.sync_audit_log AS RESTRICTIVE FOR ALL TO authenticated
      USING (organization_id = current_org_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sync_audit_log' AND policyname = 'engel_own_sync_audit_log') THEN
    CREATE POLICY engel_own_sync_audit_log ON public.sync_audit_log FOR SELECT TO authenticated
      USING (user_id = auth.uid());
  END IF;
END $$;

REVOKE ALL ON public.sync_audit_log FROM anon;

-- sync_konflikte
CREATE TABLE IF NOT EXISTS public.sync_konflikte (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL DEFAULT current_org_id() REFERENCES public.organizations(id),
  user_id          uuid NOT NULL REFERENCES auth.users(id),
  queue_item_id    text NOT NULL,
  idempotency_key  text NOT NULL,
  entity_typ       text NOT NULL,
  entity_id        uuid,
  lokale_daten     jsonb NOT NULL,
  server_daten     jsonb,
  strategie        text NOT NULL CHECK (strategie IN ('last_write_wins', 'server_wins', 'manuell')),
  status           text NOT NULL DEFAULT 'offen' CHECK (status IN ('offen', 'aufgeloest', 'verworfen')),
  aufgeloest_mit   text CHECK (aufgeloest_mit IN ('lokal', 'server')),
  aufgeloest_von   uuid REFERENCES auth.users(id),
  aufgeloest_am    timestamptz,
  erstellt_am      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sync_konflikte_org ON public.sync_konflikte(organization_id);
CREATE INDEX IF NOT EXISTS idx_sync_konflikte_user ON public.sync_konflikte(user_id);
CREATE INDEX IF NOT EXISTS idx_sync_konflikte_status ON public.sync_konflikte(organization_id, status);

ALTER TABLE public.sync_konflikte ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sync_konflikte' AND policyname = 'admin_sync_konflikte') THEN
    CREATE POLICY admin_sync_konflikte ON public.sync_konflikte FOR ALL TO authenticated
      USING (is_admin()) WITH CHECK (is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sync_konflikte' AND policyname = 'org_fence_sync_konflikte') THEN
    CREATE POLICY org_fence_sync_konflikte ON public.sync_konflikte AS RESTRICTIVE FOR ALL TO authenticated
      USING (organization_id = current_org_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sync_konflikte' AND policyname = 'engel_own_sync_konflikte') THEN
    CREATE POLICY engel_own_sync_konflikte ON public.sync_konflikte FOR SELECT TO authenticated
      USING (user_id = auth.uid());
  END IF;
END $$;

REVOKE ALL ON public.sync_konflikte FROM anon;


-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION 5/6: FHIR / ISiP Audit-Log
-- (20260829010000_fhir_isip_audit_log.sql)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.fhir_audit_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT current_org_id(),
  actor_id        uuid NOT NULL,
  actor_name      text NOT NULL,
  action          text NOT NULL CHECK (action IN ('export', 'import_preview', 'import_commit')),
  resource_types  text[] NOT NULL DEFAULT '{}',
  client_id       uuid,
  resource_count  integer NOT NULL DEFAULT 0,
  details         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fhir_audit_log_org ON public.fhir_audit_log (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fhir_audit_log_client ON public.fhir_audit_log (client_id) WHERE client_id IS NOT NULL;

ALTER TABLE public.fhir_audit_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'fhir_audit_log' AND policyname = 'admin_fhir_audit_log') THEN
    CREATE POLICY admin_fhir_audit_log ON fhir_audit_log FOR ALL TO authenticated
      USING (is_admin()) WITH CHECK (is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'fhir_audit_log' AND policyname = 'org_fence_fhir_audit_log') THEN
    CREATE POLICY org_fence_fhir_audit_log ON fhir_audit_log AS RESTRICTIVE FOR ALL TO authenticated
      USING (organization_id = current_org_id()) WITH CHECK (organization_id = current_org_id());
  END IF;
END $$;

REVOKE ALL ON fhir_audit_log FROM anon;

COMMENT ON TABLE public.fhir_audit_log IS
  'Audit-Trail für FHIR-Exporte/-Importe (Block 21, ISiP-Sicherheitsmaßnahme). Wer, wann, welcher Klient, welche Ressourcentypen.';


-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION 6/6: KIM / TI-Anbindung — Gerüst
-- (20260830010000_kim_ti_geruest.sql)
-- ═══════════════════════════════════════════════════════════════════════════

-- kim_konfiguration
CREATE TABLE IF NOT EXISTS public.kim_konfiguration (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL DEFAULT current_org_id()
                  REFERENCES public.organizations(id),
  bezeichnung         text NOT NULL,
  postfachadresse     text,
  provider_name       text,
  freischaltungsstatus text NOT NULL DEFAULT 'nicht_beantragt'
                  CHECK (freischaltungsstatus IN ('nicht_beantragt', 'beantragt', 'freigeschaltet', 'gesperrt')),
  aktiv           boolean NOT NULL DEFAULT false,
  hinweis         text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES auth.users(id),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

CREATE INDEX IF NOT EXISTS idx_kim_konfiguration_org
  ON public.kim_konfiguration(organization_id);

-- kim_formatversionen
CREATE TABLE IF NOT EXISTS public.kim_formatversionen (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL DEFAULT current_org_id()
                  REFERENCES public.organizations(id),
  bezeichnung     text NOT NULL,
  ta_version      text NOT NULL,
  gueltig_von     date NOT NULL,
  gueltig_bis     date,
  spec_bestaetigt boolean NOT NULL DEFAULT false,
  spec_quelle     text,
  spec_bestaetigt_am timestamptz,
  spec_bestaetigt_von uuid REFERENCES auth.users(id),
  hinweis         text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES auth.users(id),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz,
  CONSTRAINT chk_kim_version_zeitraum CHECK (
    gueltig_bis IS NULL OR gueltig_von <= gueltig_bis
  ),
  CONSTRAINT chk_kim_version_quelle CHECK (
    spec_bestaetigt = false OR spec_quelle IS NOT NULL
  ),
  CONSTRAINT unique_kim_version UNIQUE (organization_id, ta_version)
);

CREATE INDEX IF NOT EXISTS idx_kim_versionen_org
  ON public.kim_formatversionen(organization_id);
CREATE INDEX IF NOT EXISTS idx_kim_versionen_gueltig
  ON public.kim_formatversionen(gueltig_von, gueltig_bis);

-- kim_karten
CREATE TABLE IF NOT EXISTS public.kim_karten (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL DEFAULT current_org_id()
                  REFERENCES public.organizations(id),
  karten_typ      text NOT NULL CHECK (karten_typ IN ('smc_b', 'ehba')),
  kartennummer    text,
  inhaber_user_id uuid REFERENCES auth.users(id),
  inhaber_name    text,
  status          text NOT NULL DEFAULT 'beantragt'
                  CHECK (status IN ('beantragt', 'aktiv', 'gesperrt', 'abgelaufen')),
  gueltig_von     date,
  gueltig_bis     date,
  hinweis         text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES auth.users(id),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz,
  CONSTRAINT chk_kim_karte_zeitraum CHECK (
    gueltig_bis IS NULL OR gueltig_von IS NULL OR gueltig_von <= gueltig_bis
  )
);

CREATE INDEX IF NOT EXISTS idx_kim_karten_org
  ON public.kim_karten(organization_id);
CREATE INDEX IF NOT EXISTS idx_kim_karten_inhaber
  ON public.kim_karten(inhaber_user_id);

-- kim_nachrichten
CREATE TABLE IF NOT EXISTS public.kim_nachrichten (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL DEFAULT current_org_id()
                  REFERENCES public.organizations(id),
  konfiguration_id uuid REFERENCES public.kim_konfiguration(id),
  betreff         text NOT NULL,
  empfaenger_adresse text,
  bezug_typ       text,
  bezug_id        uuid,
  status          text NOT NULL DEFAULT 'entwurf'
                  CHECK (status IN ('entwurf', 'wartend', 'gesperrt')),
  gesperrt_grund  text,
  erstellt_von    uuid REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

CREATE INDEX IF NOT EXISTS idx_kim_nachrichten_org
  ON public.kim_nachrichten(organization_id);
CREATE INDEX IF NOT EXISTS idx_kim_nachrichten_status
  ON public.kim_nachrichten(status);

-- RLS für alle KIM-Tabellen
ALTER TABLE public.kim_konfiguration  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kim_formatversionen ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kim_karten         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kim_nachrichten    ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'kim_konfiguration' AND policyname = 'org_fence_kim_konfiguration') THEN
    CREATE POLICY org_fence_kim_konfiguration ON public.kim_konfiguration AS RESTRICTIVE FOR ALL
      USING (organization_id = current_org_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'kim_formatversionen' AND policyname = 'org_fence_kim_formatversionen') THEN
    CREATE POLICY org_fence_kim_formatversionen ON public.kim_formatversionen AS RESTRICTIVE FOR ALL
      USING (organization_id = current_org_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'kim_karten' AND policyname = 'org_fence_kim_karten') THEN
    CREATE POLICY org_fence_kim_karten ON public.kim_karten AS RESTRICTIVE FOR ALL
      USING (organization_id = current_org_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'kim_nachrichten' AND policyname = 'org_fence_kim_nachrichten') THEN
    CREATE POLICY org_fence_kim_nachrichten ON public.kim_nachrichten AS RESTRICTIVE FOR ALL
      USING (organization_id = current_org_id());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'kim_konfiguration' AND policyname = 'admin_kim_konfiguration_all') THEN
    CREATE POLICY admin_kim_konfiguration_all ON public.kim_konfiguration FOR ALL
      USING (is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'kim_formatversionen' AND policyname = 'admin_kim_formatversionen_all') THEN
    CREATE POLICY admin_kim_formatversionen_all ON public.kim_formatversionen FOR ALL
      USING (is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'kim_karten' AND policyname = 'admin_kim_karten_all') THEN
    CREATE POLICY admin_kim_karten_all ON public.kim_karten FOR ALL
      USING (is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'kim_nachrichten' AND policyname = 'admin_kim_nachrichten_all') THEN
    CREATE POLICY admin_kim_nachrichten_all ON public.kim_nachrichten FOR ALL
      USING (is_admin());
  END IF;
END $$;

REVOKE ALL ON public.kim_konfiguration   FROM anon;
REVOKE ALL ON public.kim_formatversionen FROM anon;
REVOKE ALL ON public.kim_karten          FROM anon;
REVOKE ALL ON public.kim_nachrichten     FROM anon;

-- Audit-Entity-Typen mit KIM erweitern
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'billing_audit_trail_entity_type_check'
      AND pg_get_constraintdef(oid) LIKE '%kim_nachricht%'
  ) THEN
    ALTER TABLE public.billing_audit_trail
      DROP CONSTRAINT IF EXISTS billing_audit_trail_entity_type_check;
    ALTER TABLE public.billing_audit_trail
      ADD CONSTRAINT billing_audit_trail_entity_type_check CHECK (
        entity_type = ANY(ARRAY[
          'invoice', 'tariff', 'correction', 'snapshot', 'credit_note',
          'payment', 'payment_allocation', 'dunning', 'payment_difference',
          'monthly_closing',
          'dta_lauf', 'dta_kostentraeger', 'dta_dakota_auftrag',
          'dta_ruecklaeufer', 'dta_fehlerprotokoll', 'dta_korrekturlauf',
          'dta_validierung', 'dta_lauf_rechnung', 'dta_annahmestelle',
          'dta_ruecklaeufer_position',
          'dokument', 'dokument_version', 'vertrag', 'kontaktperson',
          'verordnung', 'kundenakte', 'mitarbeiterakte',
          'sepa_mandate', 'sepa_batch', 'dunning_document',
          'billing_fristen',
          'camt_import', 'zahlungseingang', 'klaerfall', 'ruecklastschrift',
          'datev_export', 'datev_kontenzuordnung',
          'sgb_v_lauf', 'sgb_v_formatversion', 'sgb_v_routing',
          'kim_konfiguration', 'kim_formatversion', 'kim_karte', 'kim_nachricht'
        ])
      );
  END IF;
END $$;

-- KIM-Versionsregister vorbefüllen
INSERT INTO public.kim_formatversionen
  (organization_id, bezeichnung, ta_version, gueltig_von, gueltig_bis, spec_bestaetigt, hinweis)
VALUES
  ('00000000-0000-4000-8000-000460629986',
   'Technische Anlage 5 — Version 1.2.0',
   '1.2.0', '2027-02-01', NULL, false,
   'Gilt ab 02/2027 laut Roadmap. KIM-Client-Spezifikation liegt nicht vor — Versand bleibt in jedem Fall gesperrt (s. lib/kim/versand.ts).')
ON CONFLICT (organization_id, ta_version) DO NOTHING;


-- ═══════════════════════════════════════════════════════════════════════════
-- POST-MIGRATION VERIFIKATION — direkt nach Anwendung ausführen
-- ═══════════════════════════════════════════════════════════════════════════
-- Dieses SELECT prüft, ob alle 20 erwarteten Tabellen existieren:

SELECT
  t.table_name,
  CASE WHEN t.table_name IS NOT NULL THEN 'EXISTS' ELSE 'MISSING' END as status,
  CASE WHEN rls.relrowsecurity THEN 'RLS ON' ELSE 'RLS OFF' END as rls_status,
  (SELECT count(*) FROM pg_policies p WHERE p.tablename = t.table_name) as policy_count
FROM (VALUES
  ('coach_pseudonym_key'), ('coach_freischaltcodes'), ('coach_freischaltungen'),
  ('coach_anspruchspruefungen'), ('coach_nutzungsereignisse'), ('coach_abrechnungswege'),
  ('eul_erbringungen'), ('eul_qualifikationen'),
  ('sgb_v_formatversionen'), ('sgb_v_routing'),
  ('bonus_regeln'), ('bonus_berechnungen'), ('bonus_freigaben'),
  ('sync_audit_log'), ('sync_konflikte'),
  ('fhir_audit_log'),
  ('kim_konfiguration'), ('kim_formatversionen'), ('kim_karten'), ('kim_nachrichten')
) AS expected(table_name)
LEFT JOIN information_schema.tables t
  ON t.table_schema = 'public' AND t.table_name = expected.table_name
LEFT JOIN pg_class rls
  ON rls.relname = expected.table_name AND rls.relnamespace = 'public'::regnamespace
ORDER BY expected.table_name;
