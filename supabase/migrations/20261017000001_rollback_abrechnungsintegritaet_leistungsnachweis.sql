-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK zu 20261017000000_abrechnungsintegritaet_leistungsnachweis.sql
--
-- Stellt den Stand vor der Migration wieder her. Die Policy `sr_engel_own`
-- wird mit exakt dem Ausdruck neu angelegt, den sie live am 28.08.2026
-- trug (aus pg_policies gelesen).
--
-- ACHTUNG: dieser Rollback macht die drei Befunde wieder auf. Er ist fuer
-- den Fall gedacht, dass ein unerwarteter Schreibweg an der Beleg-Pflicht
-- scheitert und der Betrieb nicht warten kann — nicht als Dauerzustand.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

DROP TRIGGER IF EXISTS trg_a_unterschrift_beleg ON public.service_records;
DROP FUNCTION IF EXISTS public.enforce_unterschrift_beleg();

ALTER TABLE public.service_records
  DROP CONSTRAINT IF EXISTS service_records_zeitfenster_gueltig;

DROP POLICY IF EXISTS "sr_engel_own" ON public.service_records;
CREATE POLICY "sr_engel_own" ON public.service_records
  FOR ALL
  TO authenticated
  USING (
    (caregiver_id IN (SELECT public.eigene_caregiver_ids() AS eigene_caregiver_ids))
    OR public.is_admin()
  )
  WITH CHECK (
    (caregiver_id IN (SELECT public.eigene_caregiver_ids() AS eigene_caregiver_ids))
    OR public.is_admin()
  );

COMMIT;
