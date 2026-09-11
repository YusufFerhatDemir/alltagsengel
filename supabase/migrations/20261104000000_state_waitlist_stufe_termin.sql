-- ═══════════════════════════════════════════════════════════════════════
-- state_waitlist: Bearbeitungsstufe „Termin" zulassen
-- ═══════════════════════════════════════════════════════════════════════
--
-- ANLASS (Auftrag 11.09.2026)
-- Die Admin-Inbox der Warteliste fuehrt sechs Stufen:
--   NEU → KONTAKTIERT → TERMIN → WARTELISTE → KUNDE, Ausstieg ABGELEHNT.
--
-- Fuenf davon bildet der bestehende CHECK schon ab (Uebersetzung in
-- lib/warteliste/katalog.ts, WARTELISTE_STUFEN):
--   warteliste → vorgemerkt,  kunde → aktiviert,  abgelehnt → abgemeldet
-- Die alten Werte bleiben BEWUSST stehen: das Expansion-Modul, das
-- Marketing-Dashboard (zaehlt `aktiviert` als Conversion) und der Rollback
-- 20261102000001 lesen sie. Umbenennen haette jeden Leser mitgerissen.
--
-- Nur „termin" hat keinen Wert. Live belegt am 11.09.2026:
--   PATCH state_waitlist SET status='termin'
--   → 23514 new row ... violates check constraint "state_waitlist_status_check"
--
-- WAS DIESE MIGRATION TUT
-- Genau eins: den CHECK um 'termin' erweitern. Keine Spalte, keine Daten,
-- kein Index. Bis sie angewendet ist, meldet die Server Action beim Klick
-- auf „→ Termin" einen Satz mit dieser Dateinummer statt der rohen
-- Postgres-Meldung; alle anderen Stufen laufen ohne sie.
--
-- DDL geht mit dem Dienstschluessel nicht (42501) — anwenden im
-- Supabase-SQL-Editor oder per MCP apply_migration.
--
-- Rollback: 20261104000001_rollback_state_waitlist_stufe_termin.sql
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.state_waitlist
  DROP CONSTRAINT IF EXISTS state_waitlist_status_check;

ALTER TABLE public.state_waitlist
  ADD CONSTRAINT state_waitlist_status_check
  CHECK (status IN ('neu', 'kontaktiert', 'termin', 'vorgemerkt', 'aktiviert', 'abgemeldet'));

COMMENT ON COLUMN public.state_waitlist.status IS
  'Bearbeitungsstand der Verwaltung (DB-Wert). Stufen in der Oberflaeche: '
  'neu → kontaktiert → termin → warteliste (=vorgemerkt) → kunde (=aktiviert), '
  'Ausstieg abgelehnt (=abgemeldet). Uebersetzung: lib/warteliste/katalog.ts. '
  'Unabhaengig von `notified_at` (Regionalstart-Versand des Expansion-Moduls).';

COMMIT;

-- Pruefung nach dem Anwenden (erwartet: HTTP 204, danach wieder zuruecksetzen
-- oder direkt ueber /admin/waitlist klicken):
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conname = 'state_waitlist_status_check';
