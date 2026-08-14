-- ════════════════════════════════════════════════════════════════════════════
-- Migration: assignment_audit_log + service_record_audit_log unveraenderlich
-- Datum:     2026-08-14  (M-2 aus dem Abschlussbericht)
--
-- BEFUND:
--   Von zehn Audit-Tabellen tragen acht einen BEFORE UPDATE/DELETE-Trigger,
--   der jede nachtraegliche Aenderung abbricht (wf_audit_log, personal_audit_log,
--   akten_zugriff_log, akten_dokument_versionen, billing_tariff_audit …).
--   Diese beiden nicht.
--
--   Rechteseitig sind sie seit 20260908020000 halb gedeckt: es gibt nur eine
--   SELECT- und eine INSERT-Policy, RLS verweigert authenticated damit
--   UPDATE/DELETE. Nicht gedeckt ist alles, was an RLS vorbeilaeuft — der
--   Service-Role-Key (jede API-Route dieser Anwendung), SECURITY-DEFINER-
--   Funktionen und direkter Datenbankzugriff. Genau dort muss ein
--   Aenderungsnachweis halten; RLS allein ist dafuer die falsche Ebene.
--
-- FIX: dasselbe Muster wie prevent_billing_tariff_audit_edit() (20260909000000)
--   — SECURITY DEFINER, SET search_path, BEFORE UPDATE und BEFORE DELETE,
--   Abbruch mit RAISE EXCEPTION.
--
-- ── UNTERSCHIED ZU billing_tariff_audit: der Loeschweg ─────────────────────
--   billing_tariff_audit.tariff_id ist ON DELETE RESTRICT — dort kann ein
--   unbedingtes RAISE im DELETE-Trigger nichts kaputt machen.
--
--   Hier ist es anders:
--     service_record_audit_log.record_id     → service_records(id) ON DELETE CASCADE
--     assignment_audit_log.assignment_id     → assignments(id)     ON DELETE CASCADE
--
--   Ein unbedingtes RAISE im BEFORE-DELETE-Trigger wuerde deshalb nicht nur
--   das Loeschen der Audit-Zeile blockieren, sondern das Loeschen des
--   Leistungsnachweises bzw. des Einsatzes selbst — und damit auch die
--   DSGVO-Kontoloeschung, die sich ueber clients → service_records bis hierher
--   durchkaskadiert (__tests__/shadow-db/dsgvo-account-deletion.test.ts).
--   Ein Audit-Trail zu haerten, indem man das Loeschrecht nach Art. 17 DSGVO
--   bricht, waere ein schlechter Tausch.
--
--   Deshalb: der DELETE-Trigger laesst genau den Kaskadenfall durch. Erkannt
--   wird er daran, dass die Elternzeile in derselben Transaktion bereits
--   geloescht ist — PostgreSQL loescht erst den Elternsatz und feuert danach
--   den RI-Trigger, der die Kinder abraeumt. Ein direktes
--     DELETE FROM service_record_audit_log WHERE id = '…'
--   findet die Elternzeile dagegen noch und wird abgewiesen.
--
--   UPDATE bleibt in jedem Fall verboten. Es gibt keinen legitimen Grund,
--   einen geschriebenen Audit-Eintrag zu veraendern.
--
-- Schreibwege heute (geprueft): beide Tabellen werden ausschliesslich per
--   INSERT befuellt (Trigger in 20260808200000 / 20260814010000) und per
--   SELECT gelesen (app/api/leistungsnachweis/crud, /admin/leistungsnachweis-
--   digital). Kein Produktionsweg macht UPDATE oder DELETE.
--
-- KEINE Datenaenderung. Rollback: 20260910010001_rollback_audit_logs_unveraenderlich.sql
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- 1) service_record_audit_log
-- ─────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.prevent_service_record_audit_edit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- Kaskade vom Leistungsnachweis: Elternzeile ist bereits weg → durchlassen.
    IF NOT EXISTS (SELECT 1 FROM public.service_records WHERE id = OLD.record_id) THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION
      'service_record_audit_log ist unveraenderlich (Revisionssicherheit). '
      'Einzelne Audit-Eintraege koennen nicht geloescht werden; sie verschwinden '
      'nur mit dem zugehoerigen Leistungsnachweis.';
  END IF;

  RAISE EXCEPTION 'service_record_audit_log ist unveraenderlich (Revisionssicherheit).';
END;
$$;

COMMENT ON FUNCTION public.prevent_service_record_audit_edit() IS
  'BEFORE UPDATE/DELETE auf service_record_audit_log: bricht jede Aenderung ab. '
  'Ausnahme: DELETE aus der FK-Kaskade von service_records (Elternzeile bereits '
  'geloescht) — sonst waere die DSGVO-Loeschung blockiert.';

DROP TRIGGER IF EXISTS trg_immutable_sr_audit_update ON public.service_record_audit_log;
CREATE TRIGGER trg_immutable_sr_audit_update
  BEFORE UPDATE ON public.service_record_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.prevent_service_record_audit_edit();

DROP TRIGGER IF EXISTS trg_immutable_sr_audit_delete ON public.service_record_audit_log;
CREATE TRIGGER trg_immutable_sr_audit_delete
  BEFORE DELETE ON public.service_record_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.prevent_service_record_audit_edit();

REVOKE ALL ON FUNCTION public.prevent_service_record_audit_edit() FROM PUBLIC, anon;

-- ─────────────────────────────────────────────────────────────────────
-- 2) assignment_audit_log
-- ─────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.prevent_assignment_audit_edit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- Kaskade vom Einsatz: Elternzeile ist bereits weg → durchlassen.
    IF NOT EXISTS (SELECT 1 FROM public.assignments WHERE id = OLD.assignment_id) THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION
      'assignment_audit_log ist unveraenderlich (Revisionssicherheit). '
      'Einzelne Audit-Eintraege koennen nicht geloescht werden; sie verschwinden '
      'nur mit dem zugehoerigen Einsatz.';
  END IF;

  RAISE EXCEPTION 'assignment_audit_log ist unveraenderlich (Revisionssicherheit).';
END;
$$;

COMMENT ON FUNCTION public.prevent_assignment_audit_edit() IS
  'BEFORE UPDATE/DELETE auf assignment_audit_log: bricht jede Aenderung ab. '
  'Ausnahme: DELETE aus der FK-Kaskade von assignments (Elternzeile bereits '
  'geloescht) — sonst waere die DSGVO-Loeschung blockiert.';

DROP TRIGGER IF EXISTS trg_immutable_as_audit_update ON public.assignment_audit_log;
CREATE TRIGGER trg_immutable_as_audit_update
  BEFORE UPDATE ON public.assignment_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.prevent_assignment_audit_edit();

DROP TRIGGER IF EXISTS trg_immutable_as_audit_delete ON public.assignment_audit_log;
CREATE TRIGGER trg_immutable_as_audit_delete
  BEFORE DELETE ON public.assignment_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.prevent_assignment_audit_edit();

REVOKE ALL ON FUNCTION public.prevent_assignment_audit_edit() FROM PUBLIC, anon;

COMMIT;

-- ════════════════════════════════════════════════════════════════════
-- VERIFIKATION nach dem Apply (manuell, mit SERVICE-ROLE-Key —
-- service_role umgeht RLS, der Trigger muss trotzdem greifen):
--
--   a) UPDATE scheitert:
--      UPDATE service_record_audit_log SET action = 'GEAENDERT' WHERE id = '…';
--      → erwartet: "service_record_audit_log ist unveraenderlich"
--
--   b) direktes DELETE scheitert:
--      DELETE FROM assignment_audit_log WHERE id = '…';
--      → erwartet: "assignment_audit_log ist unveraenderlich"
--
--   c) Kaskade funktioniert weiterhin:
--      DELETE FROM assignments WHERE id = '…';
--      → erwartet: erfolgreich, zugehoerige Audit-Zeilen sind mit weg
-- ════════════════════════════════════════════════════════════════════
