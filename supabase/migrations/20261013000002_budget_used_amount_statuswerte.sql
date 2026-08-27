-- ═══════════════════════════════════════════════════════════════════════════
-- update_budget_used_amount(): auf das echte Status-Vokabular ziehen
-- Datum: 2026-08-27
-- ═══════════════════════════════════════════════════════════════════════════
--
-- BEFUND (P0 — die Budgetverbrauchsanzeige stand seit dem 02.07.2026 auf 0)
--
-- `update_budget_used_amount()` (20250101000050, per 20260804100000 als
-- trg_update_budget_on_service_record gebunden) summiert
--
--     SELECT SUM(amount) FROM service_records
--      WHERE client_id = …
--        AND budget_type = 'entlastung'
--        AND status IN ('completed', 'billed', 'paid')
--
-- Zu dem Zeitpunkt, als die Funktion geschrieben wurde, war das richtig:
-- `service_records_status_check` erlaubte live ('draft','paid','disputed'),
-- und 'paid' traf zu — 20260702_fix_service_records_check_constraints.sql
-- haelt genau diesen Nachweis fest ("Status eines Records draft→paid setzt
-- used_amount automatisch auf den Betrag").
--
-- DIESELBE Migration hat dann aber das Werteset ausgetauscht:
--
--     UPDATE … SET status = 'invoiced' / 'signed' WHERE status NOT IN (…)
--     ADD CONSTRAINT service_records_status_check
--       CHECK (status IN ('draft','incomplete','complete','signed','invoiced'))
--
-- 'completed', 'billed' und 'paid' sind seitdem KEINE gueltigen Werte mehr
-- (beachte: 'completed' ist nicht 'complete' — ein Buchstabe). Die IN-Liste
-- trifft seither auf keine einzige Zeile zu, SUM(amount) ist ueber der leeren
-- Menge NULL, und COALESCE(…, 0) schreibt fuer JEDEN Klienten
-- used_amount = 0 — bei jedem Schreibvorgang aufs Neue.
--
-- Die Migration von damals hielt den Trigger ausdruecklich fuer unbedenklich
-- ("Budget-Trigger bleibt korrekt, da alle Ziel-Status weiterhin NICHT-'draft'
-- sind"). Diese Begruendung beschreibt einen Trigger, der auf `<> 'draft'`
-- prueft — der Code tut das nicht.
--
-- WAS DARAN HAENGT
--   • pruefeBudget() (lib/personal/einsatzfreigabe.ts) rechnet
--     prozent = used_amount / (annual_amount + carryover). Mit used_amount = 0
--     sind es immer 0 % — die 80-%-Warnung, die 95-%-Warnung und vor allem die
--     100-%-SPERRE haben seit dem 02.07.2026 nie ausgeloest. Das ist der
--     einzige Riegel gegen Einsatzplanung ueber das Budget hinaus.
--   • lib/automation/budget-warnung.ts (Automatisierungskette 5) meldet nie.
--   • Die Budgetseiten in /admin und /kunde und die Kennzahl
--     (used_amount / annual_amount) > 0.9 zeigen durchgaengig 0 %.
--
-- Der Rechnungsweg war NICHT betroffen: der Budgetdeckel
-- (lib/billing/core/budget-cap.ts) liest bewusst nicht used_amount, sondern
-- die tatsaechlich fakturierten Betraege.
--
-- Ausserdem fehlte `combined_used_amount` (§ 42a VP/KZP) ganz — die Spalte
-- wurde von keinem Trigger gepflegt, obwohl pruefeBudget() sie fuer
-- Verhinderungspflege auswertet. 20260702 nennt diese Luecke selbst als
-- offenen Punkt.
--
-- FIX
--   1. Zaehlbare Status: 'complete', 'signed', 'invoiced' — eine erbrachte
--      und dokumentierte Leistung. 'draft'/'incomplete' zaehlen nicht.
--   2. STORNIERTE Nachweise zaehlen nicht (proof_status/billing_status),
--      dieselbe Regel wie create_invoice_draft_atomic v10 — ein Storno laesst
--      `status` auf 'signed' stehen.
--   3. used_amount fuer den § 45b-Topf ('entlastung' + 'carryover'),
--      combined_used_amount fuer den § 42a-Topf ('verhinderung',
--      'verhinderungspflege', 'kurzzeitpflege'). Dieselbe Topf-Zuordnung wie
--      budgetTopfFuer() in lib/billing/core/budget-cap.ts.
--   4. Der Mandant wird mitgefuehrt: die alte Fassung schrieb ueber
--      client_id/year ohne organization_id.
--
-- Es wird KEINE Spalte `client_budgets.budget_type` angefasst: die Tabelle
-- fuehrt live EINE Zeile je (Klient, Jahr) mit beiden Ansprueche nebeneinander
-- (ausfuehrlich in lib/budget/auto-budget.ts). 20260831030000 setzt eine solche
-- Spalte voraus und ist deshalb nicht anwendbar.
--
-- ── ACHTUNG: SPUERBARE VERHALTENSAENDERUNG ────────────────────────────────
-- Nach dem Backfill unten tragen die Budgetzeilen erstmals seit dem
-- 02.07.2026 wieder echte Verbrauchswerte. Klienten, deren Budget
-- tatsaechlich ausgeschoepft ist, werden dadurch in der Einsatzplanung
-- GESPERRT (pruefeBudget, 100 %) — das ist der beabsichtigte Riegel, aber er
-- wird sofort sichtbar. Vor dem Einspielen lohnt ein Blick auf die
-- Vorschau-Abfrage am Ende dieser Datei.
--
-- Grundlage der Summe bleibt `service_records.amount` (der bei der Erfassung
-- gesetzte Betrag), nicht der Tarifpreis. Das war schon vorher so und ist
-- fuer eine Planungsgroesse richtig: die Rechnung entsteht spaeter aus
-- billing_tariffs, die Planung kennt zu diesem Zeitpunkt nur den erfassten
-- Wert.
--
-- Idempotent: CREATE OR REPLACE + DROP/CREATE TRIGGER.
-- ROLLBACK: 20261013000003_rollback_budget_used_amount_statuswerte.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION public.update_budget_used_amount()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_client_id UUID;
  v_org_id    UUID;
  v_year      INTEGER;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_client_id := OLD.client_id;
    v_org_id    := OLD.organization_id;
    v_year      := EXTRACT(YEAR FROM OLD.date)::INTEGER;
  ELSE
    v_client_id := NEW.client_id;
    v_org_id    := NEW.organization_id;
    v_year      := EXTRACT(YEAR FROM NEW.date)::INTEGER;
  END IF;

  PERFORM public.rechne_budget_verbrauch_neu(v_client_id, v_org_id, v_year);

  -- Beim Wechsel des Klienten, des Mandanten oder des Jahres muss auch die
  -- ALTE Budgetzeile neu gerechnet werden — sonst bleibt dort ein Verbrauch
  -- stehen, den es nicht mehr gibt.
  IF TG_OP = 'UPDATE' AND (
       OLD.client_id IS DISTINCT FROM NEW.client_id
    OR OLD.organization_id IS DISTINCT FROM NEW.organization_id
    OR EXTRACT(YEAR FROM OLD.date) IS DISTINCT FROM EXTRACT(YEAR FROM NEW.date)
  ) THEN
    PERFORM public.rechne_budget_verbrauch_neu(
      OLD.client_id, OLD.organization_id, EXTRACT(YEAR FROM OLD.date)::INTEGER
    );
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$fn$;

-- Die eigentliche Rechnung als eigene Funktion: so laesst sie sich fuer den
-- Backfill unten und fuer Nachlaeufe aufrufen, ohne den Trigger nachzubauen.
CREATE OR REPLACE FUNCTION public.rechne_budget_verbrauch_neu(
  p_client_id UUID,
  p_org_id    UUID,
  p_year      INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_entlastung NUMERIC;
  v_vpkzp      NUMERIC;
BEGIN
  IF p_client_id IS NULL OR p_year IS NULL THEN
    RETURN;
  END IF;

  SELECT
    COALESCE(SUM(sr.amount) FILTER (
      WHERE sr.budget_type IN ('entlastung', 'carryover')), 0),
    COALESCE(SUM(sr.amount) FILTER (
      WHERE sr.budget_type IN ('verhinderung', 'verhinderungspflege', 'kurzzeitpflege')), 0)
  INTO v_entlastung, v_vpkzp
  FROM public.service_records sr
  WHERE sr.client_id = p_client_id
    AND (p_org_id IS NULL OR sr.organization_id = p_org_id)
    AND EXTRACT(YEAR FROM sr.date) = p_year
    -- Erbracht und dokumentiert. 'draft'/'incomplete' zaehlen nicht.
    AND sr.status IN ('complete', 'signed', 'invoiced')
    -- Ein Storno laesst status auf 'signed' stehen; ohne diese beiden Zeilen
    -- verbrauchte eine widerrufene Leistung weiter Budget.
    AND COALESCE(sr.proof_status, '')   <> 'STORNIERT'
    AND COALESCE(sr.billing_status, '') <> 'STORNIERT';

  UPDATE public.client_budgets
     SET used_amount          = v_entlastung,
         combined_used_amount = v_vpkzp,
         updated_at           = now()
   WHERE client_id = p_client_id
     AND year = p_year
     AND (p_org_id IS NULL OR organization_id = p_org_id);
END;
$fn$;

REVOKE ALL ON FUNCTION public.rechne_budget_verbrauch_neu(UUID, UUID, INTEGER)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.update_budget_used_amount() IS
  'Schreibt client_budgets.used_amount (§45b) und combined_used_amount (§42a) '
  'aus service_records fort. Zaehlbare Status: complete/signed/invoiced; '
  'STORNIERTE Nachweise zaehlen nicht. Die frueheren Werte '
  'completed/billed/paid existieren seit 20260702 nicht mehr — die Summe lief '
  'seitdem ueber die leere Menge und schrieb ueberall 0.';

-- ── Trigger neu binden (idempotent, gleiche Bindung wie 20260804100000) ────
DROP TRIGGER IF EXISTS trg_update_budget_on_service_record ON public.service_records;
CREATE TRIGGER trg_update_budget_on_service_record
  AFTER INSERT OR UPDATE OR DELETE ON public.service_records
  FOR EACH ROW EXECUTE FUNCTION public.update_budget_used_amount();

-- ── Backfill: die seit 20260702 auf 0 stehenden Zeilen nachziehen ─────────
-- Nur Zeilen, zu denen es ueberhaupt Leistungsnachweise gibt. Budgetzeilen
-- ohne Nachweise bleiben unangetastet.
DO $backfill$
DECLARE
  v_zeile RECORD;
BEGIN
  FOR v_zeile IN
    SELECT DISTINCT cb.client_id, cb.organization_id, cb.year
      FROM public.client_budgets cb
     WHERE EXISTS (
       SELECT 1 FROM public.service_records sr
        WHERE sr.client_id = cb.client_id
          AND EXTRACT(YEAR FROM sr.date) = cb.year
     )
  LOOP
    PERFORM public.rechne_budget_verbrauch_neu(
      v_zeile.client_id, v_zeile.organization_id, v_zeile.year
    );
  END LOOP;
END
$backfill$;

COMMIT;

-- ── Vorschau vor dem Einspielen (nur lesend, hier auskommentiert) ─────────
-- Zeigt, welche Klienten nach dem Backfill in der Einsatzplanung gesperrt
-- waeren (pruefeBudget, 100 %):
--
--   SELECT cb.client_id, cb.year, cb.annual_amount, cb.carryover_amount,
--          COALESCE(SUM(sr.amount), 0) AS verbrauch_neu
--     FROM public.client_budgets cb
--     JOIN public.service_records sr
--       ON sr.client_id = cb.client_id
--      AND EXTRACT(YEAR FROM sr.date) = cb.year
--      AND sr.budget_type IN ('entlastung', 'carryover')
--      AND sr.status IN ('complete', 'signed', 'invoiced')
--      AND COALESCE(sr.proof_status, '')   <> 'STORNIERT'
--      AND COALESCE(sr.billing_status, '') <> 'STORNIERT'
--    GROUP BY cb.client_id, cb.year, cb.annual_amount, cb.carryover_amount
--   HAVING COALESCE(SUM(sr.amount), 0)
--          >= COALESCE(cb.annual_amount, 0) + COALESCE(cb.carryover_amount, 0)
--    ORDER BY verbrauch_neu DESC;
