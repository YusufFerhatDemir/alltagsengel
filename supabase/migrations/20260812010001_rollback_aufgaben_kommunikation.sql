-- ============================================================================
-- ROLLBACK: AUFGABENMANAGEMENT + KOMMUNIKATION + BENACHRICHTIGUNGEN
--           + WIEDERVORLAGEN + ESKALATIONEN
-- Undoes:   20260812010000_aufgaben_kommunikation.sql
-- Drops all tables, views, functions, triggers, policies, indexes created
-- by the forward migration, in REVERSE order.
-- ============================================================================

BEGIN;

-- ═══════════════════════════════════════════════════════════════
-- TEIL 16 (reverse): Views
-- ═══════════════════════════════════════════════════════════════

DROP VIEW IF EXISTS public.ops_posteingang;
DROP VIEW IF EXISTS public.ops_benachrichtigungen_zaehler;
DROP VIEW IF EXISTS public.ops_wiedervorlagen_faellig;
DROP VIEW IF EXISTS public.ops_aufgaben_uebersicht;

-- ═══════════════════════════════════════════════════════════════
-- TEIL 15 (reverse): Recurring-Task Trigger + Function
-- ═══════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_recurring_aufgabe ON public.ops_aufgaben;
DROP FUNCTION IF EXISTS public.create_recurring_aufgabe();

-- ═══════════════════════════════════════════════════════════════
-- TEIL 14 (reverse): Auto-Eskalation Trigger + Function
-- ═══════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_aufgabe_eskalation ON public.ops_aufgaben;
DROP FUNCTION IF EXISTS public.check_aufgabe_eskalation();

-- ═══════════════════════════════════════════════════════════════
-- TEIL 13 (reverse): ops_aktivitaetslog
-- ═══════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_ops_log_immutable_delete ON public.ops_aktivitaetslog;
DROP TRIGGER IF EXISTS trg_ops_log_immutable_update ON public.ops_aktivitaetslog;
DROP FUNCTION IF EXISTS public.prevent_ops_log_delete();
DROP FUNCTION IF EXISTS public.prevent_ops_log_update();

DROP POLICY IF EXISTS "ops_log_admin_all" ON public.ops_aktivitaetslog;
DROP POLICY IF EXISTS "ops_log_org_fence" ON public.ops_aktivitaetslog;

DROP INDEX IF EXISTS public.idx_ops_log_akteur;
DROP INDEX IF EXISTS public.idx_ops_log_entitaet;
DROP INDEX IF EXISTS public.idx_ops_log_org;

DROP TABLE IF EXISTS public.ops_aktivitaetslog CASCADE;

-- ═══════════════════════════════════════════════════════════════
-- TEIL 12 (reverse): ops_ereignis_regeln
-- ═══════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_updated_at_ops_ereignis_regeln ON public.ops_ereignis_regeln;

DROP POLICY IF EXISTS "ops_ereignis_admin_all" ON public.ops_ereignis_regeln;
DROP POLICY IF EXISTS "ops_ereignis_org_fence" ON public.ops_ereignis_regeln;

DROP TABLE IF EXISTS public.ops_ereignis_regeln CASCADE;

-- ═══════════════════════════════════════════════════════════════
-- TEIL 11 (reverse): ops_benachrichtigungs_praeferenzen
-- ═══════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_updated_at_ops_praeferenzen ON public.ops_benachrichtigungs_praeferenzen;

DROP POLICY IF EXISTS "ops_praef_own_insert" ON public.ops_benachrichtigungs_praeferenzen;
DROP POLICY IF EXISTS "ops_praef_own_update" ON public.ops_benachrichtigungs_praeferenzen;
DROP POLICY IF EXISTS "ops_praef_own_select" ON public.ops_benachrichtigungs_praeferenzen;
DROP POLICY IF EXISTS "ops_praef_admin_all" ON public.ops_benachrichtigungs_praeferenzen;
DROP POLICY IF EXISTS "ops_praef_org_fence" ON public.ops_benachrichtigungs_praeferenzen;

DROP TABLE IF EXISTS public.ops_benachrichtigungs_praeferenzen CASCADE;

-- ═══════════════════════════════════════════════════════════════
-- TEIL 10 (reverse): ops_benachrichtigungen
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "ops_benach_own_update" ON public.ops_benachrichtigungen;
DROP POLICY IF EXISTS "ops_benach_own_select" ON public.ops_benachrichtigungen;
DROP POLICY IF EXISTS "ops_benach_admin_all" ON public.ops_benachrichtigungen;
DROP POLICY IF EXISTS "ops_benach_org_fence" ON public.ops_benachrichtigungen;

DROP INDEX IF EXISTS public.idx_ops_benach_kategorie;
DROP INDEX IF EXISTS public.idx_ops_benach_ungelesen;
DROP INDEX IF EXISTS public.idx_ops_benach_empfaenger;
DROP INDEX IF EXISTS public.idx_ops_benach_org;

DROP TABLE IF EXISTS public.ops_benachrichtigungen CASCADE;

-- ═══════════════════════════════════════════════════════════════
-- TEIL 9 (reverse): ops_nachrichten_empfaenger
-- (also drop the extra policy added on ops_nachrichten)
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "ops_nachrichten_empfaenger_select" ON public.ops_nachrichten;

DROP POLICY IF EXISTS "ops_empfaenger_own_update" ON public.ops_nachrichten_empfaenger;
DROP POLICY IF EXISTS "ops_empfaenger_own_select" ON public.ops_nachrichten_empfaenger;
DROP POLICY IF EXISTS "ops_empfaenger_admin_all" ON public.ops_nachrichten_empfaenger;
DROP POLICY IF EXISTS "ops_empfaenger_org_fence" ON public.ops_nachrichten_empfaenger;

DROP INDEX IF EXISTS public.idx_ops_empfaenger_ungelesen;
DROP INDEX IF EXISTS public.idx_ops_empfaenger_user;
DROP INDEX IF EXISTS public.idx_ops_empfaenger_nachricht;

DROP TABLE IF EXISTS public.ops_nachrichten_empfaenger CASCADE;

-- ═══════════════════════════════════════════════════════════════
-- TEIL 8 (reverse): ops_nachrichten
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "ops_nachrichten_insert_own" ON public.ops_nachrichten;
DROP POLICY IF EXISTS "ops_nachrichten_absender_select" ON public.ops_nachrichten;
DROP POLICY IF EXISTS "ops_nachrichten_admin_all" ON public.ops_nachrichten;
DROP POLICY IF EXISTS "ops_nachrichten_org_fence" ON public.ops_nachrichten;

DROP INDEX IF EXISTS public.idx_ops_nachrichten_eltern;
DROP INDEX IF EXISTS public.idx_ops_nachrichten_absender;
DROP INDEX IF EXISTS public.idx_ops_nachrichten_org;

DROP TABLE IF EXISTS public.ops_nachrichten CASCADE;

-- ═══════════════════════════════════════════════════════════════
-- TEIL 7 (reverse): ops_eskalationshistorie
-- ═══════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_ops_eskalation_immutable_delete ON public.ops_eskalationshistorie;
DROP TRIGGER IF EXISTS trg_ops_eskalation_immutable_update ON public.ops_eskalationshistorie;
DROP FUNCTION IF EXISTS public.prevent_ops_eskalation_delete();
DROP FUNCTION IF EXISTS public.prevent_ops_eskalation_update();

DROP POLICY IF EXISTS "ops_eskalation_admin_all" ON public.ops_eskalationshistorie;
DROP POLICY IF EXISTS "ops_eskalation_org_fence" ON public.ops_eskalationshistorie;

DROP INDEX IF EXISTS public.idx_ops_eskalation_aufgabe;

DROP TABLE IF EXISTS public.ops_eskalationshistorie CASCADE;

-- ═══════════════════════════════════════════════════════════════
-- TEIL 6 (reverse): ops_eskalationsregeln
-- ═══════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_updated_at_ops_eskalationsregeln ON public.ops_eskalationsregeln;

DROP POLICY IF EXISTS "ops_eskalationsregeln_admin_all" ON public.ops_eskalationsregeln;
DROP POLICY IF EXISTS "ops_eskalationsregeln_org_fence" ON public.ops_eskalationsregeln;

DROP TABLE IF EXISTS public.ops_eskalationsregeln CASCADE;

-- ═══════════════════════════════════════════════════════════════
-- TEIL 5 (reverse): ops_wiedervorlagen
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "ops_wiedervorlagen_engel_update" ON public.ops_wiedervorlagen;
DROP POLICY IF EXISTS "ops_wiedervorlagen_engel_select" ON public.ops_wiedervorlagen;
DROP POLICY IF EXISTS "ops_wiedervorlagen_admin_all" ON public.ops_wiedervorlagen;
DROP POLICY IF EXISTS "ops_wiedervorlagen_org_fence" ON public.ops_wiedervorlagen;

DROP INDEX IF EXISTS public.idx_ops_wiedervorlagen_empfaenger;
DROP INDEX IF EXISTS public.idx_ops_wiedervorlagen_faellig;
DROP INDEX IF EXISTS public.idx_ops_wiedervorlagen_org;

DROP TABLE IF EXISTS public.ops_wiedervorlagen CASCADE;

-- ═══════════════════════════════════════════════════════════════
-- TEIL 4 (reverse): ops_aufgaben_anhaenge
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "ops_anhaenge_engel_select" ON public.ops_aufgaben_anhaenge;
DROP POLICY IF EXISTS "ops_anhaenge_admin_all" ON public.ops_aufgaben_anhaenge;
DROP POLICY IF EXISTS "ops_anhaenge_org_fence" ON public.ops_aufgaben_anhaenge;

DROP INDEX IF EXISTS public.idx_ops_anhaenge_aufgabe;

DROP TABLE IF EXISTS public.ops_aufgaben_anhaenge CASCADE;

-- ═══════════════════════════════════════════════════════════════
-- TEIL 3 (reverse): ops_aufgaben_kommentare
-- ═══════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_updated_at_ops_kommentare ON public.ops_aufgaben_kommentare;

DROP POLICY IF EXISTS "ops_kommentare_engel_insert" ON public.ops_aufgaben_kommentare;
DROP POLICY IF EXISTS "ops_kommentare_engel_select" ON public.ops_aufgaben_kommentare;
DROP POLICY IF EXISTS "ops_kommentare_admin_all" ON public.ops_aufgaben_kommentare;
DROP POLICY IF EXISTS "ops_kommentare_org_fence" ON public.ops_aufgaben_kommentare;

DROP INDEX IF EXISTS public.idx_ops_kommentare_aufgabe;

DROP TABLE IF EXISTS public.ops_aufgaben_kommentare CASCADE;

-- ═══════════════════════════════════════════════════════════════
-- TEIL 2 (reverse): ops_aufgaben_checklisten
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "ops_checklisten_engel_update" ON public.ops_aufgaben_checklisten;
DROP POLICY IF EXISTS "ops_checklisten_engel_select" ON public.ops_aufgaben_checklisten;
DROP POLICY IF EXISTS "ops_checklisten_admin_all" ON public.ops_aufgaben_checklisten;
DROP POLICY IF EXISTS "ops_checklisten_org_fence" ON public.ops_aufgaben_checklisten;

DROP INDEX IF EXISTS public.idx_ops_checklisten_aufgabe;

DROP TABLE IF EXISTS public.ops_aufgaben_checklisten CASCADE;

-- ═══════════════════════════════════════════════════════════════
-- TEIL 1 (reverse): ops_aufgaben
-- ═══════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_updated_at_ops_aufgaben ON public.ops_aufgaben;

DROP POLICY IF EXISTS "ops_aufgaben_engel_update" ON public.ops_aufgaben;
DROP POLICY IF EXISTS "ops_aufgaben_engel_select" ON public.ops_aufgaben;
DROP POLICY IF EXISTS "ops_aufgaben_admin_all" ON public.ops_aufgaben;
DROP POLICY IF EXISTS "ops_aufgaben_org_fence" ON public.ops_aufgaben;

DROP INDEX IF EXISTS public.idx_ops_aufgaben_caregiver;
DROP INDEX IF EXISTS public.idx_ops_aufgaben_client;
DROP INDEX IF EXISTS public.idx_ops_aufgaben_kategorie;
DROP INDEX IF EXISTS public.idx_ops_aufgaben_faellig;
DROP INDEX IF EXISTS public.idx_ops_aufgaben_status;
DROP INDEX IF EXISTS public.idx_ops_aufgaben_verantwortlich;
DROP INDEX IF EXISTS public.idx_ops_aufgaben_org;

DROP TABLE IF EXISTS public.ops_aufgaben CASCADE;

COMMIT;
