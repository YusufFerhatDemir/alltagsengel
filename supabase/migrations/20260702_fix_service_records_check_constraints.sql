-- ════════════════════════════════════════════════════════════════════
-- Betriebssystem Phase 1 — Bugfix Check-Constraints + Budget-Automatik
-- ════════════════════════════════════════════════════════════════════
--
-- BEFUND (empirisch über die REST-API ermittelt, Stand 2026-07-02):
--
--  1) Es EXISTIERT bereits ein Trigger auf service_records, der
--     client_budgets.used_amount automatisch neu berechnet
--     (Summe der NICHT-'draft' Einsätze mit budget_type='entlastung').
--     → Nachgewiesen: Status eines Records draft→paid setzt used_amount
--       automatisch auf den Betrag, zurück auf draft → 0.
--     → Für used_amount ist KEIN neuer Trigger nötig.
--
--  2) Die beiden CHECK-Constraints waren mit einem FALSCHEN Werte-Set
--     angelegt und blockierten die App:
--       - service_records_status_check       erlaubte live nur
--         ('draft','paid','disputed')  — die App (RECORD_STATUS) schreibt
--         aber draft/incomplete/complete/signed/invoiced.
--       - service_records_budget_type_check   erlaubte live nur
--         ('entlastung') — die App (BUDGET_TYPE) kennt zusätzlich
--         verhinderung/carryover/private.
--     Folge: Weder ein unterschriebener Nachweis noch ein
--     Verhinderungspflege-Einsatz ließ sich speichern → Tabelle blieb leer.
--
--  Diese Migration korrigiert (2) auf das echte App-Werte-Set. Der
--  bestehende used_amount-Trigger (1) bleibt unangetastet.
--
--  Hinweis §42a: Für client_budgets.combined_used_amount
--  (Verhinderungspflege) existiert KEIN Trigger. Wer das automatisieren
--  will, findet am Ende dieser Datei eine optionale, auskommentierte
--  Trigger-Variante, die used_amount UND combined_used_amount pflegt
--  (dann den bestehenden used_amount-Trigger vorher ermitteln/entfernen,
--  sonst laufen zwei Trigger auf demselben Feld).
-- ════════════════════════════════════════════════════════════════════

BEGIN;

-- ── (2) service_records: status-Constraint auf App-Set ──────────────
-- Zuerst die alte (falsche) Constraint entfernen, DAMIT die folgende
-- Datenmigration überhaupt auf das neue Werte-Set schreiben darf.
ALTER TABLE public.service_records
  DROP CONSTRAINT IF EXISTS service_records_status_check;

-- ── (2a) BESTANDSDATEN-MIGRATION (Pflicht, sonst schlägt ADD CONSTRAINT fehl) ──
-- Die Seed-/Bestandsdaten liegen im ALTEN Werte-Set vor (live: 'paid'/'draft',
-- generell 'billed'/'disputed' möglich). Diese Alt-Werte sind im neuen App-Set
-- NICHT erlaubt → ADD CONSTRAINT würde an ihnen scheitern. Wir bilden die
-- Alt-Werte fachlich korrekt auf das neue Set ab (Budget-Trigger bleibt korrekt,
-- da alle Ziel-Status weiterhin NICHT-'draft' sind → used_amount unverändert):
--   • Einsatz hängt an einer Rechnung  → 'invoiced'
--   • sonstiger Nicht-draft-Alt-Wert   → 'signed'   (erfasst & unterschrieben)
--   • 'draft'                          → bleibt 'draft'
UPDATE public.service_records
   SET status = 'invoiced'
 WHERE status NOT IN ('draft', 'incomplete', 'complete', 'signed', 'invoiced')
   AND id IN (SELECT service_record_id FROM public.invoice_items WHERE service_record_id IS NOT NULL);

UPDATE public.service_records
   SET status = 'signed'
 WHERE status NOT IN ('draft', 'incomplete', 'complete', 'signed', 'invoiced');

-- Jetzt sind alle Zeilen im neuen Set → Constraint kann gesetzt werden.
ALTER TABLE public.service_records
  ADD CONSTRAINT service_records_status_check
  CHECK (status IN ('draft', 'incomplete', 'complete', 'signed', 'invoiced'));

-- ── (2) service_records + invoice_items: budget_type-Constraint ─────
ALTER TABLE public.service_records
  DROP CONSTRAINT IF EXISTS service_records_budget_type_check;
ALTER TABLE public.service_records
  ADD CONSTRAINT service_records_budget_type_check
  CHECK (budget_type IN ('entlastung', 'verhinderung', 'carryover', 'private'));

ALTER TABLE public.invoice_items
  DROP CONSTRAINT IF EXISTS invoice_items_budget_type_check;
ALTER TABLE public.invoice_items
  ADD CONSTRAINT invoice_items_budget_type_check
  CHECK (budget_type IN ('entlastung', 'verhinderung', 'carryover', 'private'));

COMMIT;

-- ════════════════════════════════════════════════════════════════════
-- OPTIONAL — Budget-Trigger, der BEIDE Töpfe pflegt (§45b + §42a).
-- Nur aktivieren, wenn der bestehende used_amount-Trigger vorher
-- entfernt wird (sonst doppelte Pflege von used_amount). Vorgehen:
--   1) SELECT tgname FROM pg_trigger
--        WHERE tgrelid = 'public.service_records'::regclass AND NOT tgisinternal;
--   2) Bestehenden used_amount-Trigger droppen.
--   3) Block unten einkommentieren.
-- ════════════════════════════════════════════════════════════════════
--
-- CREATE OR REPLACE FUNCTION public.recalc_client_budget_used()
-- RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
-- DECLARE
--   v_client uuid := COALESCE(NEW.client_id, OLD.client_id);
--   v_year   int  := EXTRACT(YEAR FROM COALESCE(NEW.date, OLD.date))::int;
-- BEGIN
--   UPDATE public.client_budgets b
--      SET used_amount = COALESCE((
--            SELECT SUM(sr.amount) FROM public.service_records sr
--             WHERE sr.client_id = v_client AND EXTRACT(YEAR FROM sr.date) = b.year
--               AND sr.budget_type IN ('entlastung','carryover') AND sr.status <> 'draft'), 0),
--          combined_used_amount = COALESCE((
--            SELECT SUM(sr.amount) FROM public.service_records sr
--             WHERE sr.client_id = v_client AND EXTRACT(YEAR FROM sr.date) = b.year
--               AND sr.budget_type = 'verhinderung' AND sr.status <> 'draft'), 0),
--          updated_at = now()
--    WHERE b.client_id = v_client AND b.year = v_year;
--   RETURN COALESCE(NEW, OLD);
-- END; $$;
-- DROP TRIGGER IF EXISTS trg_service_records_budget ON public.service_records;
-- CREATE TRIGGER trg_service_records_budget
--   AFTER INSERT OR UPDATE OR DELETE ON public.service_records
--   FOR EACH ROW EXECUTE FUNCTION public.recalc_client_budget_used();
