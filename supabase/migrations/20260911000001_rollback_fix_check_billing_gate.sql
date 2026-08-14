-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK zu 20260911000000_fix_check_billing_gate.sql
-- ═══════════════════════════════════════════════════════════════════════════
--
-- WARNUNG — dieser Rollback stellt einen BEKANNT KAPUTTEN Zustand wieder her.
--   Die Originalfassung aus 20260808200000 liest state_settings.kasse_status.
--   Diese Spalte existiert nicht. Nach dem Rollback scheitert jeder
--   INSERT/UPDATE auf service_records mit billing_type <> 'PRIVAT' erneut mit
--   SQLSTATE 42703.
--
--   Er ist trotzdem enthalten, weil jede Migration in diesem Repo einen
--   vollständigen Rückweg haben muss. Solange live ausschließlich PRIVAT
--   erfasst wird, ist der Rollback ohne unmittelbare Wirkung.
--
--   Alternative statt Rollback: den Trigger vorübergehend abschalten
--     DROP TRIGGER IF EXISTS trg_check_billing_gate ON public.service_records;
--   Dann werden Kassennachweise NICHT mehr geparkt — sie stehen dann auf
--   billing_status='OFFEN', obwohl das Bundesland nicht freigeschaltet ist.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION public.check_billing_gate()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_bl text;
  v_kasse_aktiv boolean;
BEGIN
  IF NEW.billing_type = 'PRIVAT' THEN
    RETURN NEW;
  END IF;

  v_bl := COALESCE(NEW.bundesland, (
    SELECT public.eindeutiges_bundesland_fuer_plz(c.zip_code)
    FROM public.clients c WHERE c.id = NEW.client_id
  ));

  IF v_bl IS NOT NULL THEN
    SELECT (s.kasse_status = 'ANERKANNT') INTO v_kasse_aktiv
    FROM public.state_settings s
    WHERE s.bundesland = v_bl;

    IF v_kasse_aktiv IS NOT TRUE THEN
      NEW.billing_status := 'KASSENABRECHNUNG_NOCH_NICHT_FREIGESCHALTET';
    END IF;
  END IF;

  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION public.check_billing_gate IS NULL;

GRANT EXECUTE ON FUNCTION public.check_billing_gate() TO authenticated, service_role;

DROP TRIGGER IF EXISTS trg_check_billing_gate ON public.service_records;
CREATE TRIGGER trg_check_billing_gate
  BEFORE INSERT OR UPDATE ON public.service_records
  FOR EACH ROW EXECUTE FUNCTION public.check_billing_gate();

COMMIT;
