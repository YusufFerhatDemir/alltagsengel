-- ═══════════════════════════════════════════════════════════════
-- Block 18 — KIM / TI-Anbindung: Gerüst
--
-- Legt die Verwaltungsschicht für eine künftige KIM-Anbindung
-- (Kommunikation im Medizinwesen, Teil der Telematikinfrastruktur/TI) an:
-- Postfach-Konfiguration, Formatversionsregister, eHBA/SMC-B-Kartenzuordnung
-- und eine Nachrichten-Warteschlange.
--
-- WICHTIG — was diese Migration ABSICHTLICH NICHT tut:
-- Sie legt KEINE KIM-Client-Protokolldetails, KEINE Nachrichtenformat-/
-- Segmentstrukturen der Technischen Anlage 5 und KEIN Kartenkommunikations-
-- protokoll (PIN, Zertifikats-Handshake, Konnektor-Schnittstelle) an. Diese
-- Werte stehen ausschliesslich in der gematik-Spezifikation, die hier nicht
-- vorliegt. Erfundene Werte wären in einem echten Gesundheitsnetz das
-- gefährlichste denkbare Ergebnis.
--
-- Stattdessen: ein FAIL-CLOSED-Register nach demselben Muster wie Block 17
-- (§ 302 SGB V, s. 20260826020000_sgb_v_302_geruest.sql). Solange eine
-- Formatversion nicht ausdrücklich als spec-bestätigt markiert ist
-- (spec_bestaetigt = false, der Default), UND solange lib/kim/versand.ts
-- keine tatsächliche Implementierung hat, findet KEIN Versand statt — auch
-- nicht versehentlich.
-- ═══════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. kim_konfiguration — Postfach-Konfiguration
-- ─────────────────────────────────────────────────────────────────────────────
-- Verwaltungsschicht für KIM-Postfächer. postfachadresse ist ein Freitextfeld,
-- das die Organisation selbst befüllt, sobald ein KIM-Provider-Vertrag
-- besteht — KEINE hartcodierte/erfundene Provider-URL.

CREATE TABLE IF NOT EXISTS public.kim_konfiguration (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL DEFAULT current_org_id()
                  REFERENCES public.organizations(id),

  bezeichnung         text NOT NULL,
  postfachadresse     text,
  provider_name       text,

  -- Fail-closed-relevanter Status: erst 'freigeschaltet' bedeutet, dass der
  -- KIM-Provider das Postfach tatsächlich aktiviert hat (extern, nicht durch
  -- diese Anwendung steuerbar).
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. kim_formatversionen — Versionsregister (fail-closed)
-- ─────────────────────────────────────────────────────────────────────────────
-- Hält fest, WELCHE TA5-Version ab wann gilt und ob ihre Spezifikation
-- tatsächlich vorliegt. `spec_bestaetigt` ist der Schalter — ohne ihn bleibt
-- lib/kim/versand.ts in jedem Fall gesperrt (doppelte Sperre: der Code wirft
-- auch dann, wenn dieses Flag versehentlich auf true steht).

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

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. kim_karten — eHBA/SMC-B-Zuordnung
-- ─────────────────────────────────────────────────────────────────────────────
-- Reine Verwaltungsschicht: welche Karte gehört welcher Person/Organisation.
-- kartennummer ist Freitext, vom Nutzer selbst befüllt — KEIN erratenes
-- gematik-Kartennummernformat. KEINE Kartenkommunikation.

CREATE TABLE IF NOT EXISTS public.kim_karten (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL DEFAULT current_org_id()
                  REFERENCES public.organizations(id),

  karten_typ      text NOT NULL CHECK (karten_typ IN ('smc_b', 'ehba')),
  kartennummer    text,

  -- Nur bei eHBA sinnvoll befüllt (personenbezogen) — SMC-B gehört der Institution.
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. kim_nachrichten — Nachrichten-Warteschlange (fail-closed)
-- ─────────────────────────────────────────────────────────────────────────────
-- Status bleibt bewusst klein: entwurf → wartend → gesperrt. Es gibt (noch)
-- keinen Status "versendet", weil lib/kim/versand.ts ausnahmslos wirft.

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

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. RLS — org_fence RESTRICTIVE + Admin-CRUD, anon ausgesperrt
-- ─────────────────────────────────────────────────────────────────────────────

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

  -- Reine Admin-Stammdaten — keine Engel-/Kunden-Policy. Bewusst analog zum
  -- § 302-SGB-V-Gerüst: dies ist kein Bereich, in dem operatives Personal
  -- selbst Postfächer/Karten anlegt.
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Audit-Entity-Typen erweitern
-- ─────────────────────────────────────────────────────────────────────────────
-- Muss deckungsgleich mit AUDIT_ENTITY_TYPES in lib/billing/core/audit.ts
-- bleiben — __tests__/kim/kim-block18.test.ts prüft das (analog zum
-- Schema-Konsistenz-Test aus Block 17).

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
          -- KIM/TI-Anbindung (Block 18) — Migration 20260830010000
          'kim_konfiguration', 'kim_formatversion', 'kim_karte', 'kim_nachricht'
        ])
      );
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Versionsregister vorbefüllen — Termine, KEINE Spec-Inhalte
-- ─────────────────────────────────────────────────────────────────────────────
-- Der Gültigkeitstermin ist der Roadmap entnommen (Block 18, dort wiederum
-- aus dem bereits im Projekt dokumentierten Kontext von Block 17). Der
-- Eintrag steht auf spec_bestaetigt = false: der Kanal ist damit
-- geschlossen, bis die offizielle Technische Anlage 5 vorliegt und im Code
-- hinterlegt ist.

INSERT INTO public.kim_formatversionen
  (organization_id, bezeichnung, ta_version, gueltig_von, gueltig_bis, spec_bestaetigt, hinweis)
VALUES
  ('00000000-0000-4000-8000-000460629986',
   'Technische Anlage 5 — Version 1.2.0',
   '1.2.0', '2027-02-01', NULL, false,
   'Gilt ab 02/2027 laut Roadmap. KIM-Client-Spezifikation liegt nicht vor — Versand bleibt in jedem Fall gesperrt (s. lib/kim/versand.ts).')
ON CONFLICT (organization_id, ta_version) DO NOTHING;

COMMIT;
