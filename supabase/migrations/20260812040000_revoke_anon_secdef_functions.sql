-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: REVOKE anon-EXECUTE von allen SECURITY DEFINER Funktionen
-- Datum:     2026-08-12
-- Grund:     Defense-in-depth — keine SECDEF-Funktion sollte von anon aufrufbar sein
-- ═══════════════════════════════════════════════════════════════════════════
-- Analyse: 15 SECDEF-Funktionen waren für anon callable.
-- - Trigger-Funktionen (RETURNS trigger) sind über PostgREST nicht aufrufbar,
--   aber REVOKE ist trotzdem Best Practice.
-- - Utility-Funktionen (is_admin, current_org_id etc.) geben false/NULL für anon
--   zurück, aber die Exposition ist unnötig.
-- - state_flag() könnte State-Settings-Daten leaken.
-- ═══════════════════════════════════════════════════════════════════════════

-- Batch 1: REVOKE anon (direkte Grants)
REVOKE EXECUTE ON FUNCTION public.current_org_id() FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_org_role(uuid, text[]) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_internal_staff() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_org_member(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_profile_soft_deleted(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.state_flag(uuid, text, text) FROM anon;

-- Batch 2: REVOKE PUBLIC (anon erbt von PUBLIC) + re-GRANT authenticated/service_role
REVOKE EXECUTE ON FUNCTION public.enforce_booking_status_transition() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enforce_booking_status_transition() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.is_own_caregiver(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_own_caregiver(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.is_own_client(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_own_client(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.wf_trigger_aufgabe_ueberfaellig() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wf_trigger_aufgabe_ueberfaellig() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.wf_trigger_dienstplan() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wf_trigger_dienstplan() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.wf_trigger_dta_fehler() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wf_trigger_dta_fehler() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.wf_trigger_dta_ruecklaeufer() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wf_trigger_dta_ruecklaeufer() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.wf_trigger_zahlung() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wf_trigger_zahlung() TO authenticated, service_role;
