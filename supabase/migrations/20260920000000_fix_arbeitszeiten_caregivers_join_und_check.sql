-- Fix 1: engel_personal_arbeitszeiten_select/_insert und
--        engel_personal_zeitkorrekturen_select haben die bekannte
--        caregivers-Join-Falle (siehe Commit 6b6dc33 / Migration
--        20260917000000_fix_engel_pflege_massnahmen_rls.sql).
-- Die caregivers-Tabelle hat seit 20260704_rls_lockdown_internal_tables.sql
-- keine Engel-Lesepolicy mehr (nur caregivers_admin_all + org_fence).
-- Ein direktes "SELECT cg.id FROM caregivers cg WHERE cg.user_id = auth.uid()"
-- innerhalb einer anderen Policy liefert für den Engel deshalb still 0 Zeilen
-- zurück -- SELECT auf personal_arbeitszeiten/personal_zeitkorrekturen bleibt
-- für den Engel leer, INSERT via direktem RLS-Client (nicht über die API mit
-- Admin-Client) schlägt mit "permission denied" fehl.
-- Ersetzt durch eigene_caregiver_ids() (SECURITY DEFINER, umgeht caregivers-RLS).

DROP POLICY IF EXISTS engel_personal_arbeitszeiten_select ON public.personal_arbeitszeiten;
CREATE POLICY engel_personal_arbeitszeiten_select ON public.personal_arbeitszeiten
  FOR SELECT TO authenticated
  USING (caregiver_id IN (SELECT public.eigene_caregiver_ids()));

DROP POLICY IF EXISTS engel_personal_arbeitszeiten_insert ON public.personal_arbeitszeiten;
CREATE POLICY engel_personal_arbeitszeiten_insert ON public.personal_arbeitszeiten
  FOR INSERT TO authenticated
  WITH CHECK (caregiver_id IN (SELECT public.eigene_caregiver_ids()));

DROP POLICY IF EXISTS engel_personal_zeitkorrekturen_select ON public.personal_zeitkorrekturen;
CREATE POLICY engel_personal_zeitkorrekturen_select ON public.personal_zeitkorrekturen
  FOR SELECT TO authenticated
  USING (caregiver_id IN (SELECT public.eigene_caregiver_ids()));

-- Fix 2: Keine CHECK-Constraints auf ist_minuten/pause_minuten -- die
-- Anwendungsschicht (lib/personal/arbeitszeiten.ts) validiert seit diesem
-- Fix zwar, aber Inserts über andere Wege (Import, direkte SQL) blieben
-- ungeschützt. Defense-in-depth auf DB-Ebene nachziehen.
--
-- VOR LIVE-APPLY PRÜFEN (kein DB-Zugang in dieser Session, daher ungeprüft):
--   SELECT count(*) FROM public.personal_arbeitszeiten
--     WHERE ist_minuten <= 0 OR ist_minuten > 1440
--        OR pause_minuten < 0 OR pause_minuten > 1440;
--   Falls > 0: verletzende Zeilen erst bereinigen, sonst schlägt ADD CONSTRAINT fehl.
ALTER TABLE public.personal_arbeitszeiten
  DROP CONSTRAINT IF EXISTS personal_arbeitszeiten_ist_minuten_check;
ALTER TABLE public.personal_arbeitszeiten
  ADD CONSTRAINT personal_arbeitszeiten_ist_minuten_check
  CHECK (ist_minuten > 0 AND ist_minuten <= 1440);

ALTER TABLE public.personal_arbeitszeiten
  DROP CONSTRAINT IF EXISTS personal_arbeitszeiten_pause_minuten_check;
ALTER TABLE public.personal_arbeitszeiten
  ADD CONSTRAINT personal_arbeitszeiten_pause_minuten_check
  CHECK (pause_minuten >= 0 AND pause_minuten <= 1440);
