-- ═══════════════════════════════════════════════════════════════════════════
-- Fix: Restliche "engel_*"-Policies aus der Personalmanagement-Migration
--      haben die caregivers-Join-Falle
-- Datum:     2026-08-15 (Audit Mitarbeiterverwaltung)
-- ═══════════════════════════════════════════════════════════════════════════
-- BEFUND:
--   20260811010000_personalmanagement.sql legt 9 Engel-Self-Service-Policies
--   an, die alle denselben Fehler enthalten:
--
--     caregiver_id IN (SELECT cg.id FROM caregivers cg WHERE cg.user_id = auth.uid())
--
--   `caregivers` hat live NUR `caregivers_admin_all` (is_admin()) — keine
--   Engel-Lesepolicy. Die Subquery `FROM caregivers cg WHERE cg.user_id =
--   auth.uid()` liefert für einen Engel deshalb IMMER 0 Zeilen (RLS blockiert
--   den eigenen Read), und `caregiver_id IN (...)` ist für JEDEN Engel-Zugriff
--   FALSE.
--
--   3 der 9 Policies (engel_personal_arbeitszeiten_select/_insert,
--   engel_personal_zeitkorrekturen_select) sind bereits in
--   20260920000000_fix_arbeitszeiten_caregivers_join_und_check.sql
--   (paralleler Audit-Task) auf eigene_caregiver_ids() umgestellt. Diese
--   Migration deckt die verbleibenden 6 Policies ab, die dort nicht
--   angefasst wurden:
--
--     - engel_caregiver_quals_select   (caregiver_qualifications, SELECT)
--     - engel_absences_select          (absences, SELECT)
--     - engel_absences_insert          (absences, INSERT — inkl. der
--                                        status='beantragt'-Erweiterung aus
--                                        20260917000002_fix_absences_self_approval.sql,
--                                        die denselben Fehler unverändert
--                                        übernommen hat)
--     - engel_personal_schulungen_select     (personal_schulungen, SELECT)
--     - engel_dienstplan_eintraege_select    (dienstplan_eintraege, SELECT)
--     - engel_personal_urlaubskonto_select   (personal_urlaubskonto, SELECT)
--
--   Exakt dasselbe Muster wurde bereits in vitalwerte (09.08.),
--   pflege_verlauf/pflege_aufnahmen, engel_pflege_massnahmen_select
--   (20260917000000) und clients_caregiver_read (20260920000000) gefunden
--   und über eigene_caregiver_ids() (SECURITY DEFINER, umgeht caregivers-RLS)
--   behoben — die Personalmanagement-Migration datiert vom 11.08., einen Tag
--   VOR der eigene_caregiver_ids()-Helper-Migration (20260812010100), und
--   wurde beim Nachziehen der anderen Module übersehen.
--
-- LIVE-AUSWIRKUNG (bestätigt durch Code-Audit der zugehörigen Engel-Seiten):
--   app/engel/qualifikationen/page.tsx, app/engel/urlaub/page.tsx und
--   app/engel/dienstplan/page.tsx lesen zusätzlich VOR jedem Request die
--   eigene caregiver_id über einen direkten
--   `.from('caregivers').select('id').eq('user_id', user.id)` — das schlägt
--   aus demselben Grund fehl (0 Zeilen) und zeigt jedem echten Engel dauerhaft
--   "Kein Engel-Profil gefunden." Dieser Anwendungscode wurde im selben
--   Audit-Durchgang bereits auf eigene_caregiver_ids() (RPC) umgestellt
--   (ebenso lib/personal/api-auth.ts requirePersonalUser()). Selbst mit
--   korrekt aufgelöster caregiver_id hätten die hier gefixten Policies aber
--   weiterhin 0 Zeilen geliefert — die App-Code-Fixes ohne diese Migration
--   reichen NICHT aus.
--
-- FIX:
--   Ersetzt in den 6 verbleibenden Policies die caregivers-Subquery durch
--   `caregiver_id IN (SELECT public.eigene_caregiver_ids())`.
--
-- STATUS: NICHT angewendet — wartet auf manuellen Live-Apply (kein
--   DB-Zugang in dieser Session). Getestet gegen die lokale Shadow-DB
--   (scripts/shadow-db.sh reset) — Migration wendet fehlerfrei an.
--
-- ROLLBACK: stellt die ursprünglichen (fehlerhaften) Policies wieder her —
--   siehe 20260921000001_rollback_fix_personalmanagement_caregivers_join_falle.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- caregiver_qualifications
DROP POLICY IF EXISTS engel_caregiver_quals_select ON caregiver_qualifications;
CREATE POLICY engel_caregiver_quals_select ON caregiver_qualifications
  FOR SELECT TO authenticated
  USING (
    caregiver_id IN (SELECT public.eigene_caregiver_ids())
  );

-- absences (SELECT)
DROP POLICY IF EXISTS engel_absences_select ON absences;
CREATE POLICY engel_absences_select ON absences
  FOR SELECT TO authenticated
  USING (
    caregiver_id IN (SELECT public.eigene_caregiver_ids())
  );

-- absences (INSERT) — status-Check aus 20260917000002 bleibt erhalten
DROP POLICY IF EXISTS engel_absences_insert ON absences;
CREATE POLICY engel_absences_insert ON absences
  FOR INSERT TO authenticated
  WITH CHECK (
    caregiver_id IN (SELECT public.eigene_caregiver_ids())
    AND status = 'beantragt'
  );

-- personal_schulungen
DROP POLICY IF EXISTS engel_personal_schulungen_select ON personal_schulungen;
CREATE POLICY engel_personal_schulungen_select ON personal_schulungen
  FOR SELECT TO authenticated
  USING (
    caregiver_id IN (SELECT public.eigene_caregiver_ids())
  );

-- dienstplan_eintraege
DROP POLICY IF EXISTS engel_dienstplan_eintraege_select ON dienstplan_eintraege;
CREATE POLICY engel_dienstplan_eintraege_select ON dienstplan_eintraege
  FOR SELECT TO authenticated
  USING (
    caregiver_id IN (SELECT public.eigene_caregiver_ids())
  );

-- personal_urlaubskonto
DROP POLICY IF EXISTS engel_personal_urlaubskonto_select ON personal_urlaubskonto;
CREATE POLICY engel_personal_urlaubskonto_select ON personal_urlaubskonto
  FOR SELECT TO authenticated
  USING (
    caregiver_id IN (SELECT public.eigene_caregiver_ids())
  );

COMMIT;

-- ════════════════════════════════════════════════════════════════════
-- VERIFIKATION (nach Apply manuell, in Shadow-DB oder als service_role):
--   SET LOCAL ROLE authenticated;
--   SELECT set_config('request.jwt.claims', json_build_object('sub', '<engel-user-id>')::text, true);
--   SELECT * FROM public.caregiver_qualifications; -- erwartet: eigene Zeilen (vorher: 0)
--   SELECT * FROM public.dienstplan_eintraege;      -- erwartet: eigene Zeilen (vorher: 0)
--   INSERT INTO public.absences (caregiver_id, absence_type, start_date, end_date, status)
--     VALUES ('<eigene-caregiver-id>', 'vacation', CURRENT_DATE, CURRENT_DATE, 'beantragt');
--   -- erwartet: Erfolg (vorher: RLS-Fehler)
-- ════════════════════════════════════════════════════════════════════
