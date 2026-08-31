-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK zu 20261023000004_eingangsriegel_lauf_und_vpkzp.sql
--
-- Teil 1: der Eingangsriegel auf `abrechnungslaeufe` faellt weg — danach
--         ist jeder Status beim Anlegen eines Laufs wieder frei waehlbar.
-- Teil 2: `trg_vpkzp_usage_abgeleitet` steht wieder auf UPDATE-only und
--         in der Fassung vom 31.08.2026, ohne INSERT-Zweig.
-- ═══════════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_a_lauf_eingangsstatus ON public.abrechnungslaeufe;
DROP FUNCTION IF EXISTS public.enforce_lauf_eingangsstatus();

CREATE OR REPLACE FUNCTION public.trg_vpkzp_usage_abgeleitet()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  IF NEW.vp_days_used    IS DISTINCT FROM OLD.vp_days_used
  OR NEW.kzp_days_used   IS DISTINCT FROM OLD.kzp_days_used
  OR NEW.vp_amount_used  IS DISTINCT FROM OLD.vp_amount_used
  OR NEW.kzp_amount_used IS DISTINCT FROM OLD.kzp_amount_used THEN
    RAISE EXCEPTION 'VPKZP_STAND_ABGELEITET: Verbrauchswerte werden aus vpkzp_buchungen fortgeschrieben und nicht direkt gesetzt.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vpkzp_usage_abgeleitet ON public.client_vpkzp_usage;

CREATE TRIGGER trg_vpkzp_usage_abgeleitet
  BEFORE UPDATE ON public.client_vpkzp_usage
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_vpkzp_usage_abgeleitet();
