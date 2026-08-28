-- ═══════════════════════════════════════════════════════════════
-- coach_freischaltungen.bestellung_id: UNIQUE gegen doppelte Freischaltung
--
-- lib/coach/verkauf-server.ts::schalteZugangFrei() prüft per SELECT, ob zu
-- einer Bestellung schon eine Freischaltung existiert, und legt sonst eine
-- neue an (select-then-insert). Stripe liefert Webhook-Ereignisse
-- ausdrücklich "at least once" ohne Reihenfolgegarantie — zwei nahezu
-- gleichzeitige Zustellungen desselben checkout.session.completed-Events
-- können beide den SELECT vor dem jeweils anderen INSERT sehen (TOCTOU) und
-- erzeugen dann zwei aktive coach_freischaltungen-Zeilen für dieselbe
-- Bestellung. Der Modul-Kommentar in verkauf-server.ts behauptet
-- Idempotenz "durchgesetzt über die UNIQUE-Spalten stripe_invoice_id,
-- stripe_subscription_id und coach_rechnungen.nummer" — coach_freischaltungen
-- fehlte dabei. NULL bleibt bei UNIQUE mehrfach zulässig (Pilot-/Testzugänge
-- ohne Bestellung), betrifft also nur echte Bestellungen.
-- Rollback:  20261009000003_rollback_coach_freischaltung_bestellung_unique.sql
-- ═══════════════════════════════════════════════════════════════

BEGIN;

-- Ersetzt den bestehenden nicht-eindeutigen Teilindex durch einen
-- eindeutigen mit identischer Bedingung — kein zweiter, redundanter Index.
DROP INDEX IF EXISTS idx_coach_freischaltungen_bestellung;
CREATE UNIQUE INDEX IF NOT EXISTS idx_coach_freischaltungen_bestellung
  ON coach_freischaltungen(bestellung_id) WHERE bestellung_id IS NOT NULL;

COMMIT;
