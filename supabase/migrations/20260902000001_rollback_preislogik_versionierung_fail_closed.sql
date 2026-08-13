-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK zu 20260902000000_preislogik_versionierung_fail_closed.sql
--
-- ACHTUNG: Nach diesem Rollback ist leistungspreise wieder OHNE
-- Verifizierungsstatus — der Monatsabschluss verliert damit seine
-- Fail-Closed-Pruefung auf dieser Preisquelle. Der Anwendungscode in
-- lib/abrechnung/monatsabschluss.ts muss dann ebenfalls zurueckgerollt
-- werden, sonst liefert er 0 abrechenbare Positionen (die Spalte, auf die
-- er filtert, existiert nicht mehr).
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

DROP TRIGGER IF EXISTS trg_leistungspreise_verifizierung_verfaellt ON public.leistungspreise;
DROP TRIGGER IF EXISTS trg_billing_tariffs_verifizierung_verfaellt ON public.billing_tariffs;
DROP FUNCTION IF EXISTS public.trg_verifizierung_verfaellt();

DROP INDEX IF EXISTS public.idx_leistungspreise_lookup;

ALTER TABLE public.leistungspreise
  DROP CONSTRAINT IF EXISTS leistungspreise_preis_nicht_negativ,
  DROP CONSTRAINT IF EXISTS leistungspreise_valid_period,
  DROP CONSTRAINT IF EXISTS leistungspreise_tarif_status_check;

ALTER TABLE public.leistungspreise
  DROP COLUMN IF EXISTS verifizierungs_quelle,
  DROP COLUMN IF EXISTS verifiziert_von,
  DROP COLUMN IF EXISTS verifiziert_am,
  DROP COLUMN IF EXISTS tarif_status;

COMMENT ON TABLE public.leistungspreise IS NULL;

COMMIT;
