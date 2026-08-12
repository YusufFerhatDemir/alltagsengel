-- ═══════════════════════════════════════════════════════════════
-- Block 17 — § 302 SGB V (Sonstige Leistungserbringer): Gerüst
--
-- Bislang kann die Plattform NUR nach § 105 SGB XI abrechnen
-- (PLGA/PLAA, EDIFACT, TA1 6.5.1 — s. lib/abrechnung/edifact-*).
-- Häusliche Krankenpflege (§ 37 SGB V) läuft über einen ANDEREN Kanal:
-- die Vereinbarung nach § 302 Abs. 2 SGB V mit eigener Technischer
-- Anlage 1, eigenen Nachrichtentypen (SLGA/SLLA) und eigenen
-- Schlüsselverzeichnissen.
--
-- WICHTIG — was diese Migration ABSICHTLICH NICHT tut:
-- Sie legt KEINE Segmentstrukturen, KEINE Leistungserbringergruppen-
-- schlüssel, KEINE Abrechnungscodes und KEINE Tarifkennzeichen an.
-- Diese Werte stehen ausschliesslich in der offiziellen Technischen
-- Anlage 1 zur § 302-Vereinbarung. Erfundene Werte würden zu Datensätzen
-- führen, die formal plausibel aussehen und von den Krankenkassen
-- abgelehnt werden — oder schlimmer: falsch verarbeitet werden.
--
-- Stattdessen: ein FAIL-CLOSED-Register. Solange eine Formatversion nicht
-- ausdrücklich als spec-bestätigt markiert ist (spec_bestaetigt = false,
-- der Default), verweigert der Generator in lib/abrechnung/sgb-v/ den
-- Export. Gleiches Prinzip wie beim SECON-Stub.
-- ═══════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. abrechnungslaeufe: Rechtsgrundlage unterscheidbar machen
-- ─────────────────────────────────────────────────────────────────────────────
-- Bisher war jeder Lauf implizit ein § 105-SGB-XI-Lauf. Ohne diese Spalte
-- liessen sich SGB-V-Läufe nicht von Pflegekassen-Läufen trennen — weder in
-- der Liste noch in den Auswertungen.

ALTER TABLE public.abrechnungslaeufe
  ADD COLUMN IF NOT EXISTS rechtsgrundlage text NOT NULL DEFAULT 'sgb_xi_105',
  ADD COLUMN IF NOT EXISTS sgb_v_format text,
  ADD COLUMN IF NOT EXISTS sgb_v_ta_version text;

ALTER TABLE public.abrechnungslaeufe
  DROP CONSTRAINT IF EXISTS chk_lauf_rechtsgrundlage,
  ADD CONSTRAINT chk_lauf_rechtsgrundlage CHECK (rechtsgrundlage IN (
    'sgb_xi_105',  -- Pflege, PLGA/PLAA (implementiert)
    'sgb_v_302'    -- Sonstige Leistungserbringer, SLGA/SLLA bzw. HKP-XML
  ));

-- Format nur bei SGB-V-Läufen, und dann nur die beiden vereinbarten Kanäle.
ALTER TABLE public.abrechnungslaeufe
  DROP CONSTRAINT IF EXISTS chk_lauf_sgb_v_format,
  ADD CONSTRAINT chk_lauf_sgb_v_format CHECK (
    (rechtsgrundlage <> 'sgb_v_302' AND sgb_v_format IS NULL)
    OR (rechtsgrundlage = 'sgb_v_302' AND sgb_v_format IN ('edifact_slga_slla', 'xml_hkp'))
  );

CREATE INDEX IF NOT EXISTS idx_abrechnungslaeufe_rechtsgrundlage
  ON public.abrechnungslaeufe(rechtsgrundlage, abrechnungsmonat);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. sgb_v_formatversionen — Versionsregister (fail-closed)
-- ─────────────────────────────────────────────────────────────────────────────
-- Hält fest, WELCHE Formatversion ab wann gilt und ob ihre Spezifikation
-- tatsächlich vorliegt. `spec_bestaetigt` ist der Schalter, den der Generator
-- prüft; `spec_quelle` dokumentiert, woher die Werte kommen (Dokumentname +
-- Stand). Ohne beides bleibt der Kanal geschlossen.

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

  -- Fail-closed: erst true, wenn die offizielle TA vorliegt UND die
  -- Segment-/Feldwerte im Code hinterlegt sind.
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
  -- Eine Bestätigung ohne Quellenangabe wäre nicht nachvollziehbar.
  CONSTRAINT chk_sgb_v_version_quelle CHECK (
    spec_bestaetigt = false OR spec_quelle IS NOT NULL
  ),
  CONSTRAINT unique_sgb_v_version UNIQUE (organization_id, format, ta_version)
);

CREATE INDEX IF NOT EXISTS idx_sgb_v_versionen_org
  ON public.sgb_v_formatversionen(organization_id);
CREATE INDEX IF NOT EXISTS idx_sgb_v_versionen_gueltig
  ON public.sgb_v_formatversionen(gueltig_von, gueltig_bis);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. sgb_v_routing — Krankenkassen-Routing
-- ─────────────────────────────────────────────────────────────────────────────
-- Krankenkassen routen ANDERS als Pflegekassen: eigene Datenannahmestellen,
-- eigene Annahmeformate. Die Tabelle bleibt bewusst LEER — Routing-Stammdaten
-- werden nie geraten, sondern aus den Verzeichnissen der Kassen übernommen
-- (gleiche Regel wie bei den § 105-Stammdaten).

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

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. RLS — org_fence RESTRICTIVE + Admin-CRUD
-- ─────────────────────────────────────────────────────────────────────────────

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

  -- Abrechnungsstammdaten sind reine Admin-Daten — keine Engel-/Kunden-Policy.
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sgb_v_formatversionen' AND policyname = 'admin_sgb_v_formatversionen_all') THEN
    CREATE POLICY admin_sgb_v_formatversionen_all ON public.sgb_v_formatversionen FOR ALL
      USING (is_admin());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sgb_v_routing' AND policyname = 'admin_sgb_v_routing_all') THEN
    CREATE POLICY admin_sgb_v_routing_all ON public.sgb_v_routing FOR ALL
      USING (is_admin());
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Audit-Entity-Typen erweitern
-- ─────────────────────────────────────────────────────────────────────────────
-- Muss deckungsgleich mit AUDIT_ENTITY_TYPES in lib/billing/core/audit.ts
-- bleiben — __tests__/abrechnung/schema-konsistenz.test.ts prüft das.

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

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Versionsregister vorbefüllen — Termine, KEINE Spec-Inhalte
-- ─────────────────────────────────────────────────────────────────────────────
-- Die Gültigkeitstermine sind der Roadmap entnommen (Block 17). Alle Einträge
-- stehen auf spec_bestaetigt = false: der Kanal ist damit geschlossen, bis die
-- offizielle Technische Anlage vorliegt und im Code hinterlegt ist.

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

COMMIT;
