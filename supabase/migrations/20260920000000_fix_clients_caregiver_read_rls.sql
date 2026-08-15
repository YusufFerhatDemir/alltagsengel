-- ═══════════════════════════════════════════════════════════════════════════
-- Fix: clients_caregiver_read hat die caregivers-Join-Falle
-- Datum:     2026-08-15 (Audit Klientenverwaltung)
-- ═══════════════════════════════════════════════════════════════════════════
-- BEFUND:
--   clients_caregiver_read (20260719000200_eylem_audit_complete_features.sql)
--   prüft den Engel-Zugriff über
--     EXISTS (SELECT 1 FROM public.caregivers c
--             JOIN public.assignments a ON a.caregiver_id = c.id
--             WHERE c.user_id = auth.uid() AND a.client_id = clients.id
--               AND a.status = 'active')
--
--   `caregivers` hat live NUR `caregivers_admin_all` (is_admin()) +
--   `caregivers_org_fence` (RESTRICTIVE) — keine Engel-Lesepolicy. Die
--   Subquery `FROM caregivers c WHERE c.user_id = auth.uid()` liefert für
--   einen Engel deshalb IMMER 0 Zeilen (RLS blockiert den eigenen Read),
--   und clients_caregiver_read liefert für JEDEN Engel-Zugriff FALSE — der
--   Client bleibt für den zugewiesenen Engel unsichtbar. Genau das Muster,
--   das bereits in vitalwerte (09.08.), pflege_verlauf/pflege_aufnahmen und
--   zuletzt engel_pflege_massnahmen_select (20260917000000) gefunden und
--   über eigene_caregiver_ids() (SECURITY DEFINER, umgeht caregivers-RLS)
--   behoben wurde. clients_caregiver_read wurde dabei übersehen.
--
-- LIVE-AUSWIRKUNG (bestätigt):
--   app/engel/pflegedoku/page.tsx und
--   app/engel/pflegedoku/[clientId]/page.tsx lesen `clients` direkt über
--   den Browser-Client (RLS). Der Klientenname fällt für den Engel still
--   auf den Platzhalter "Kunde" zurück (Code hat dafür bereits einen
--   Fallback, siehe `c ? ... : 'Kunde'` in pflegedoku/page.tsx) — kein
--   Crash, aber der Engel sieht nie den echten Namen.
--
-- FIX:
--   Ersetzt den caregivers-Join durch eigene_caregiver_ids() und liest nur
--   noch aus `assignments` (hat eine funktionierende Engel-Read-Policy).
--   Status-Liste an engel_pflege_massnahmen_select (20260917000000)
--   angeglichen, damit auch laufende (nicht nur 'active') Einsätze zählen.
--
-- STATUS: NICHT angewendet — wartet auf manuellen Live-Apply (kein
--   DB-Zugang in dieser Session). Bis dahin bleibt der o. g. Fallback
--   ("Kunde" statt echtem Namen) aktiv, aber harmlos (kein Fehler/Crash).
--
-- ROLLBACK: stellt die ursprüngliche (fehlerhafte) Policy wieder her —
--   siehe 20260920000001_rollback_fix_clients_caregiver_read_rls.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

DROP POLICY IF EXISTS clients_caregiver_read ON public.clients;

CREATE POLICY clients_caregiver_read ON public.clients
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.assignments a
      WHERE a.caregiver_id IN (SELECT public.eigene_caregiver_ids())
        AND a.client_id = clients.id
        AND a.status IN ('active', 'GEPLANT', 'BESTAETIGT', 'UNTERWEGS', 'GESTARTET')
    )
  );

COMMIT;

-- ════════════════════════════════════════════════════════════════════
-- VERIFIKATION (nach Apply manuell, in Shadow-DB oder als service_role):
--   SET LOCAL ROLE authenticated;
--   SELECT set_config('request.jwt.claims', json_build_object('sub', '<engel-user-id>')::text, true);
--   SELECT * FROM public.clients WHERE id = '<zugewiesener-client-id>';
--   -- erwartet: 1 Zeile (vorher: 0 Zeilen)
-- ════════════════════════════════════════════════════════════════════
