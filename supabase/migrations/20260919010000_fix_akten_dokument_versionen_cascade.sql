-- ════════════════════════════════════════════════════════════════════════════
-- Migration: akten_dokument_versionen — Kaskaden-Loeschung durchlassen
-- Datum:     2026-08-15  (Audit Modul 22 Dokumentenmanagement)
--
-- BEFUND (gleiches Muster wie 20260910010000_audit_logs_unveraenderlich.sql):
--   prevent_modify_akten_audit() (20260809010000) wirft bei BEFORE UPDATE
--   *und* BEFORE DELETE unbedingt eine Exception. Sie haengt an zwei Tabellen:
--
--     akten_zugriff_log.dokument_id      → akten_dokumente(id)  (kein ON DELETE,
--                                           also NO ACTION/RESTRICT)
--     akten_dokument_versionen.dokument_id → akten_dokumente(id) ON DELETE CASCADE
--
--   Fuer akten_zugriff_log ist das unbedenklich (wie billing_tariff_audit):
--   RESTRICT blockiert das Loeschen des Elternsatzes ohnehin schon auf FK-Ebene,
--   der Trigger aendert daran nichts.
--
--   Fuer akten_dokument_versionen dagegen genau das Problem, das
--   20260910010000 fuer service_record_audit_log/assignment_audit_log bereits
--   gefixt hat (dessen Kommentar akten_dokument_versionen sogar explizit als
--   betroffen nennt, aber die eigentliche Korrektur dort ausgespart hat):
--   Loescht man ein akten_dokumente-Dokument (z.B. im Zuge einer DSGVO-
--   Kontoloeschung ueber kundenakte → akten_dokumente), kaskadiert Postgres
--   nach akten_dokument_versionen, feuert dort den BEFORE-DELETE-Trigger, der
--   unbedingt abbricht — und blockiert damit die gesamte Loeschkette.
--
-- FIX: dasselbe Muster — der DELETE-Trigger auf akten_dokument_versionen
--   laesst den Kaskadenfall durch (Elternzeile in akten_dokumente bereits
--   verschwunden), blockiert aber weiterhin jedes direkte
--   DELETE FROM akten_dokument_versionen WHERE id = '…' sowie jedes UPDATE.
--   akten_zugriff_log bleibt unveraendert (RESTRICT-FK, unbedenklich).
--
-- KEINE Datenaenderung. Rollback: 20260919010001_rollback_fix_akten_dokument_versionen_cascade.sql
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION public.prevent_modify_akten_dokument_versionen()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- Kaskade vom Dokument: Elternzeile ist bereits weg → durchlassen.
    IF NOT EXISTS (SELECT 1 FROM public.akten_dokumente WHERE id = OLD.dokument_id) THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION
      'akten_dokument_versionen ist unveraenderbar (append-only). '
      'Einzelne Versionen koennen nicht geloescht werden; sie verschwinden '
      'nur mit dem zugehoerigen Dokument.';
  END IF;

  RAISE EXCEPTION 'akten_dokument_versionen ist unveraenderbar (append-only).';
END;
$$;

COMMENT ON FUNCTION public.prevent_modify_akten_dokument_versionen() IS
  'BEFORE UPDATE/DELETE auf akten_dokument_versionen: bricht jede Aenderung ab. '
  'Ausnahme: DELETE aus der FK-Kaskade von akten_dokumente (Elternzeile bereits '
  'geloescht) — sonst waere die DSGVO-Loeschung ueber kundenakte/akten_dokumente '
  'blockiert.';

DROP TRIGGER IF EXISTS trg_immutable_akten_versionen ON public.akten_dokument_versionen;

DROP TRIGGER IF EXISTS trg_immutable_akten_versionen_update ON public.akten_dokument_versionen;
CREATE TRIGGER trg_immutable_akten_versionen_update
  BEFORE UPDATE ON public.akten_dokument_versionen
  FOR EACH ROW EXECUTE FUNCTION public.prevent_modify_akten_dokument_versionen();

DROP TRIGGER IF EXISTS trg_immutable_akten_versionen_delete ON public.akten_dokument_versionen;
CREATE TRIGGER trg_immutable_akten_versionen_delete
  BEFORE DELETE ON public.akten_dokument_versionen
  FOR EACH ROW EXECUTE FUNCTION public.prevent_modify_akten_dokument_versionen();

REVOKE ALL ON FUNCTION public.prevent_modify_akten_dokument_versionen() FROM PUBLIC, anon;

COMMIT;

-- ════════════════════════════════════════════════════════════════════
-- VERIFIKATION nach dem Apply (manuell, mit SERVICE-ROLE-Key):
--
--   a) UPDATE scheitert:
--      UPDATE akten_dokument_versionen SET dateiname = 'x' WHERE id = '…';
--      → erwartet: "akten_dokument_versionen ist unveraenderbar"
--
--   b) direktes DELETE scheitert:
--      DELETE FROM akten_dokument_versionen WHERE id = '…';
--      → erwartet: "akten_dokument_versionen ist unveraenderbar"
--
--   c) Kaskade funktioniert weiterhin:
--      DELETE FROM akten_dokumente WHERE id = '…';
--      → erwartet: erfolgreich, zugehoerige Versionszeilen sind mit weg
-- ════════════════════════════════════════════════════════════════════
