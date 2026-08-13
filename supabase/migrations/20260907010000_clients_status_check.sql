-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: clients_status_check an die Statuswerte der App angleichen
-- Datum:     2026-08-14 (Befund Gegenprüfung B — realer Nutzerworkflow)
-- ═══════════════════════════════════════════════════════════════════════════
-- BEFUND (live reproduziert, synthetischer Datensatz in der E2E-Testorg):
--   INSERT INTO clients (…, status) VALUES (…, 'new')
--     → 23514  new row for relation "clients" violates check constraint
--              "clients_status_check"
--   Erlaubt sind live nur: 'active', 'paused', 'inactive'.
--
-- AUSWIRKUNG:
--   app/api/admin/clients (POST) setzte fest status='new'. Damit war die
--   Neuanlage eines Klienten über /admin/clients vollständig blockiert —
--   Schritt 2 der Kundenkette, also der Einstieg in den ganzen Prozess.
--   Der Admin sah nur die rohe Postgres-Meldung.
--
--   Dieselbe Lücke betrifft 'archived': die Statusliste der Oberfläche
--   (CLIENT_STATUS in lib/admin/ops.ts) kennt fünf Werte, die Datenbank drei.
--
-- LÖSUNG:
--   Den Constraint auf genau die fünf Werte setzen, die die App kennt.
--   Kein Wert wird entfernt, es kommen nur 'new' und 'archived' dazu —
--   bestehende Zeilen können den Constraint deshalb nicht verletzen.
--
-- NACH DEM ANWENDEN:
--   Der Fallback in app/api/admin/clients/route.ts greift nicht mehr; neue
--   Klienten werden wieder mit 'new' angelegt. Der Fallback kann stehen
--   bleiben (er kostet nichts) oder in einem eigenen Schritt entfernt werden.
--
-- IDEMPOTENT: DROP … IF EXISTS vor dem Neuanlegen.
-- ROLLBACK:   20260907010001_rollback_clients_status_check.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS clients_status_check;

ALTER TABLE public.clients
  ADD CONSTRAINT clients_status_check
  CHECK (status IN ('active', 'new', 'paused', 'inactive', 'archived'));

COMMIT;
