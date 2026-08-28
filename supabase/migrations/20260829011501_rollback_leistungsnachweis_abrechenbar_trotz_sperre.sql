-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK zu 20260829011500_leistungsnachweis_abrechenbar_trotz_sperre.sql
--
-- WARNUNG — was dieses Rollback wiederherstellt, ist der P0 selbst:
-- danach kann ein unterschriebener Leistungsnachweis wieder NICHT
-- abgerechnet werden, und weil `create_invoice_draft_atomic` atomar ist,
-- scheitert die gesamte Rechnungserstellung.
--
-- Es ist ausschliesslich fuer den Fall gedacht, dass die neue Fassung
-- selbst Schaden anrichtet — nicht als Aufraeumschritt.
--
-- Wortgleiche Vorfassung, am 29.08.2026 aus pg_proc gelesen.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION public.prevent_locked_record_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.is_locked = true THEN
    IF NEW.proof_status = 'STORNIERT' THEN
      RETURN NEW;
    END IF;
    IF NEW.is_locked IS DISTINCT FROM OLD.is_locked AND NEW.is_locked = false THEN
      IF EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','superadmin')) THEN
        RETURN NEW;
      END IF;
    END IF;
    RAISE EXCEPTION 'Leistungsnachweis ist gesperrt -- Aenderungen sind nicht mehr moeglich.'
      USING HINT = 'Manipulationsschutz aktiv';
  END IF;
  RETURN NEW;
END;
$function$;

COMMIT;
