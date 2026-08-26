-- Rollback zu 20261005000000_pilot_send_gate.sql
--
-- ACHTUNG: entfernt die Doppelversand-Sperre auf Datenbankebene. Nach
-- diesem Rollback haengt sie ausschliesslich am Anwendungscode
-- (lib/pilot/send-gate.ts). Nur ausfuehren, solange kein echter
-- Erstversand ueber das Gate gelaufen ist.
BEGIN;

DROP POLICY IF EXISTS org_fence_pilot_versand_sperre ON public.pilot_versand_sperre;
DROP POLICY IF EXISTS pilot_versand_sperre_admin     ON public.pilot_versand_sperre;
DROP TABLE IF EXISTS public.pilot_versand_sperre;

DROP POLICY IF EXISTS org_fence_pilot_send_gate ON public.pilot_send_gate;
DROP POLICY IF EXISTS pilot_send_gate_admin     ON public.pilot_send_gate;
DROP TABLE IF EXISTS public.pilot_send_gate;

COMMIT;
