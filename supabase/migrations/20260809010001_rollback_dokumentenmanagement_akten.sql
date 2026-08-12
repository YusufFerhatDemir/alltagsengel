-- ════════════════════════════════════════════════════════════════════
-- ROLLBACK: 20260809010000_dokumentenmanagement_akten.sql
-- Entfernt: Dokumentenmanagement + Digitale Kundenakte + Mitarbeiterakte
--           + Verträge + Verordnungen-Erweiterung + Nachweise
-- Tabellen:  akten_dokumente, akten_dokument_versionen, akten_vertraege,
--            akten_kontaktpersonen, akten_zugriff_log
-- Views:     akten_ablauf_dashboard, kundenakte_uebersicht, mitarbeiterakte_uebersicht
-- Funktionen: prevent_modify_akten_audit, prevent_locked_document_edit,
--             prevent_signed_contract_edit
-- Spalten:   clients (8), caregivers (15), verordnungen (4)
-- Storage:   vertraege, mitarbeiter-dokumente, kunden-dokumente
-- ════════════════════════════════════════════════════════════════════

BEGIN;

-- ──────────────────────────────────────────────────────────────────
-- 13) Storage Buckets entfernen (reverse order: last created first)
-- ──────────────────────────────────────────────────────────────────

DELETE FROM storage.buckets WHERE id = 'kunden-dokumente';
DELETE FROM storage.buckets WHERE id = 'mitarbeiter-dokumente';
DELETE FROM storage.buckets WHERE id = 'vertraege';

-- ──────────────────────────────────────────────────────────────────
-- 12) Views entfernen
-- ──────────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS public.mitarbeiterakte_uebersicht;
DROP VIEW IF EXISTS public.kundenakte_uebersicht;
DROP VIEW IF EXISTS public.akten_ablauf_dashboard;

-- ──────────────────────────────────────────────────────────────────
-- 11) Audit-Trail Constraint zurücksetzen
-- ──────────────────────────────────────────────────────────────────

DO $audit_rollback$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'billing_audit_trail' AND column_name = 'entity_type'
    ) THEN
        ALTER TABLE public.billing_audit_trail
            DROP CONSTRAINT IF EXISTS billing_audit_trail_entity_type_check;
        -- Restore the pre-migration constraint (without dokument/vertrag/kontaktperson/kundenakte/mitarbeiterakte types)
        ALTER TABLE public.billing_audit_trail
            ADD CONSTRAINT billing_audit_trail_entity_type_check
            CHECK (entity_type IN (
                'invoice', 'tariff', 'correction', 'snapshot', 'credit_note',
                'payment', 'payment_allocation', 'dunning', 'payment_difference',
                'monthly_closing',
                'dta_lauf', 'dta_kostentraeger', 'dta_dakota_auftrag',
                'dta_ruecklaeufer', 'dta_fehlerprotokoll', 'dta_korrekturlauf',
                'dta_validierung', 'dta_lauf_rechnung', 'dta_annahmestelle',
                'dta_ruecklaeufer_position'
            ));
    END IF;
END
$audit_rollback$;

-- ──────────────────────────────────────────────────────────────────
-- 10) Triggers entfernen (reverse order)
-- ──────────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_locked_contract ON public.akten_vertraege;
DROP TRIGGER IF EXISTS trg_locked_document ON public.akten_dokumente;
DROP TRIGGER IF EXISTS trg_immutable_akten_versionen ON public.akten_dokument_versionen;
DROP TRIGGER IF EXISTS trg_immutable_akten_zugriff ON public.akten_zugriff_log;
DROP TRIGGER IF EXISTS trg_updated_at_akten_kontaktpersonen ON public.akten_kontaktpersonen;
DROP TRIGGER IF EXISTS trg_updated_at_akten_vertraege ON public.akten_vertraege;
DROP TRIGGER IF EXISTS trg_updated_at_akten_dokumente ON public.akten_dokumente;

-- Funktionen entfernen
DROP FUNCTION IF EXISTS public.prevent_signed_contract_edit();
DROP FUNCTION IF EXISTS public.prevent_locked_document_edit();
DROP FUNCTION IF EXISTS public.prevent_modify_akten_audit();

-- ──────────────────────────────────────────────────────────────────
-- 9) RLS Policies entfernen (reverse order)
-- ──────────────────────────────────────────────────────────────────

-- org_fence policies
DROP POLICY IF EXISTS "org_fence_akten_zugriff" ON public.akten_zugriff_log;
DROP POLICY IF EXISTS "org_fence_akten_kontaktpersonen" ON public.akten_kontaktpersonen;
DROP POLICY IF EXISTS "org_fence_akten_vertraege" ON public.akten_vertraege;
DROP POLICY IF EXISTS "org_fence_akten_versionen" ON public.akten_dokument_versionen;
DROP POLICY IF EXISTS "org_fence_akten_dokumente" ON public.akten_dokumente;

-- Engel policies
DROP POLICY IF EXISTS "engel_akten_vertraege_select" ON public.akten_vertraege;
DROP POLICY IF EXISTS "engel_akten_dokumente_select" ON public.akten_dokumente;

-- Kunden policies
DROP POLICY IF EXISTS "kunde_akten_vertraege_select" ON public.akten_vertraege;
DROP POLICY IF EXISTS "kunde_akten_dokumente_select" ON public.akten_dokumente;

-- Admin policies
DROP POLICY IF EXISTS "admin_akten_zugriff" ON public.akten_zugriff_log;
DROP POLICY IF EXISTS "admin_akten_kontaktpersonen" ON public.akten_kontaktpersonen;
DROP POLICY IF EXISTS "admin_akten_vertraege" ON public.akten_vertraege;
DROP POLICY IF EXISTS "admin_akten_versionen" ON public.akten_dokument_versionen;
DROP POLICY IF EXISTS "admin_akten_dokumente" ON public.akten_dokumente;

-- ──────────────────────────────────────────────────────────────────
-- 8) verordnungen — Spalten entfernen
-- ──────────────────────────────────────────────────────────────────

ALTER TABLE public.verordnungen DROP COLUMN IF EXISTS erinnerung_60_tage;
ALTER TABLE public.verordnungen DROP COLUMN IF EXISTS erinnerung_90_tage;
ALTER TABLE public.verordnungen DROP COLUMN IF EXISTS abrechnung_sperrgrund;
ALTER TABLE public.verordnungen DROP COLUMN IF EXISTS abrechnung_gesperrt;

-- ──────────────────────────────────────────────────────────────────
-- 7) caregivers — Spalten entfernen (reverse order)
-- ──────────────────────────────────────────────────────────────────

ALTER TABLE public.caregivers DROP COLUMN IF EXISTS sozialversicherungsnummer;
ALTER TABLE public.caregivers DROP COLUMN IF EXISTS steuer_id;
ALTER TABLE public.caregivers DROP COLUMN IF EXISTS geschlecht;
ALTER TABLE public.caregivers DROP COLUMN IF EXISTS geburtsdatum;
ALTER TABLE public.caregivers DROP COLUMN IF EXISTS bundesland;
ALTER TABLE public.caregivers DROP COLUMN IF EXISTS interne_notizen;
ALTER TABLE public.caregivers DROP COLUMN IF EXISTS erste_hilfe_gueltig_bis;
ALTER TABLE public.caregivers DROP COLUMN IF EXISTS erste_hilfe_datum;
ALTER TABLE public.caregivers DROP COLUMN IF EXISTS fuehrungszeugnis_gueltig_bis;
ALTER TABLE public.caregivers DROP COLUMN IF EXISTS fuehrungszeugnis_datum;
ALTER TABLE public.caregivers DROP COLUMN IF EXISTS einsatzfreigabe_am;
ALTER TABLE public.caregivers DROP COLUMN IF EXISTS einsatzfreigabe;
ALTER TABLE public.caregivers DROP COLUMN IF EXISTS austrittsdatum;
ALTER TABLE public.caregivers DROP COLUMN IF EXISTS eintrittsdatum;
ALTER TABLE public.caregivers DROP COLUMN IF EXISTS beschaeftigungsart;

-- ──────────────────────────────────────────────────────────────────
-- 6) clients — Spalten entfernen (reverse order)
-- ──────────────────────────────────────────────────────────────────

ALTER TABLE public.clients DROP COLUMN IF EXISTS aktenzeichen;
ALTER TABLE public.clients DROP COLUMN IF EXISTS bundesland;
ALTER TABLE public.clients DROP COLUMN IF EXISTS abtretungserklaerung_vorhanden;
ALTER TABLE public.clients DROP COLUMN IF EXISTS bevollmaechtigter_telefon;
ALTER TABLE public.clients DROP COLUMN IF EXISTS bevollmaechtigter_name;
ALTER TABLE public.clients DROP COLUMN IF EXISTS pflegegrad_bescheid_url;
ALTER TABLE public.clients DROP COLUMN IF EXISTS pflegegrad_seit;
ALTER TABLE public.clients DROP COLUMN IF EXISTS geschlecht;

-- ──────────────────────────────────────────────────────────────────
-- 5) Tabelle akten_zugriff_log entfernen (inkl. Indexes)
-- ──────────────────────────────────────────────────────────────────

DROP INDEX IF EXISTS public.idx_zugriff_zeit;
DROP INDEX IF EXISTS public.idx_zugriff_benutzer;
DROP INDEX IF EXISTS public.idx_zugriff_entitaet;
DROP INDEX IF EXISTS public.idx_zugriff_vertrag;
DROP INDEX IF EXISTS public.idx_zugriff_dok;
DROP INDEX IF EXISTS public.idx_zugriff_org;
DROP TABLE IF EXISTS public.akten_zugriff_log CASCADE;

-- ──────────────────────────────────────────────────────────────────
-- 4) Tabelle akten_kontaktpersonen entfernen (inkl. Indexes)
-- ──────────────────────────────────────────────────────────────────

DROP INDEX IF EXISTS public.idx_kontakt_rolle;
DROP INDEX IF EXISTS public.idx_kontakt_client;
DROP INDEX IF EXISTS public.idx_kontakt_org;
DROP TABLE IF EXISTS public.akten_kontaktpersonen CASCADE;

-- ──────────────────────────────────────────────────────────────────
-- 3) Tabelle akten_vertraege entfernen (inkl. Indexes)
-- ──────────────────────────────────────────────────────────────────

DROP INDEX IF EXISTS public.idx_vertraege_ende;
DROP INDEX IF EXISTS public.idx_vertraege_status;
DROP INDEX IF EXISTS public.idx_vertraege_caregiver;
DROP INDEX IF EXISTS public.idx_vertraege_client;
DROP INDEX IF EXISTS public.idx_vertraege_org;
DROP TABLE IF EXISTS public.akten_vertraege CASCADE;

-- ──────────────────────────────────────────────────────────────────
-- 2) Tabelle akten_dokument_versionen entfernen (inkl. Indexes)
-- ──────────────────────────────────────────────────────────────────

DROP INDEX IF EXISTS public.idx_akten_vers_org;
DROP INDEX IF EXISTS public.idx_akten_vers_dok;
DROP TABLE IF EXISTS public.akten_dokument_versionen CASCADE;

-- ──────────────────────────────────────────────────────────────────
-- 1) Tabelle akten_dokumente entfernen (inkl. Indexes)
-- ──────────────────────────────────────────────────────────────────

DROP INDEX IF EXISTS public.idx_akten_dok_tags;
DROP INDEX IF EXISTS public.idx_akten_dok_ablauf;
DROP INDEX IF EXISTS public.idx_akten_dok_status;
DROP INDEX IF EXISTS public.idx_akten_dok_typ;
DROP INDEX IF EXISTS public.idx_akten_dok_caregiver;
DROP INDEX IF EXISTS public.idx_akten_dok_client;
DROP INDEX IF EXISTS public.idx_akten_dok_org;
DROP TABLE IF EXISTS public.akten_dokumente CASCADE;

COMMIT;
