-- ═══════════════════════════════════════════════════════════════
-- FIX: Eskalationssystem — CHECK-Constraint + Cron-Funktion
-- ═══════════════════════════════════════════════════════════════
--
-- PROBLEM:
--   1. ops_aufgaben_status_check erlaubt NUR:
--      'offen','in_bearbeitung','warten','erledigt','storniert'
--      → Status 'ueberfaellig' ist verboten
--      → wf_trigger_aufgabe_ueberfaellig() kann NIEMALS feuern
--   2. check_aufgabe_eskalation() ist ein BEFORE UPDATE Trigger —
--      ohne periodischen Cron wird er nie für stille Aufgaben ausgelöst
--
-- FIX:
--   a) CHECK-Constraint erweitern um 'ueberfaellig'
--   b) Cron-Funktion: findet überfällige Aufgaben, setzt Status,
--      löst dadurch den Eskalations-Trigger aus
-- ═══════════════════════════════════════════════════════════════

-- 1) CHECK-Constraint erweitern
ALTER TABLE public.ops_aufgaben DROP CONSTRAINT IF EXISTS ops_aufgaben_status_check;
ALTER TABLE public.ops_aufgaben ADD CONSTRAINT ops_aufgaben_status_check CHECK (status IN (
  'offen', 'in_bearbeitung', 'warten', 'erledigt', 'storniert', 'ueberfaellig'
));

-- 2) Cron-Funktion: überfällige Aufgaben markieren + Eskalation auslösen
CREATE OR REPLACE FUNCTION public.cron_check_ueberfaellige_aufgaben()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  v_aufgabe RECORD;
BEGIN
  -- Alle offenen/in_bearbeitung/wartenden Aufgaben, deren Fälligkeit
  -- überschritten ist, auf 'ueberfaellig' setzen.
  -- Das UPDATE löst:
  --   a) check_aufgabe_eskalation (BEFORE UPDATE) → Eskalationsstufe + Historie
  --   b) wf_trigger_aufgabe_ueberfaellig (AFTER UPDATE) → Workflow-Event
  FOR v_aufgabe IN
    SELECT id
    FROM public.ops_aufgaben
    WHERE status IN ('offen', 'in_bearbeitung', 'warten')
      AND faellig_am IS NOT NULL
      AND faellig_am < CURRENT_DATE
  LOOP
    UPDATE public.ops_aufgaben
    SET status = 'ueberfaellig',
        updated_at = now()
    WHERE id = v_aufgabe.id
      AND status IN ('offen', 'in_bearbeitung', 'warten');

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'checked_at', now(),
    'marked_overdue', v_count
  );
END;
$$;

-- 3) pg_cron Schedule (benötigt pg_cron Extension)
-- Täglich um 06:00 UTC (08:00 Berlin Sommerzeit)
-- HINWEIS: pg_cron muss in Supabase aktiviert sein.
-- Falls pg_cron nicht verfügbar ist, ist die Funktion trotzdem
-- manuell via SELECT cron_check_ueberfaellige_aufgaben() aufrufbar.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('check-ueberfaellige-aufgaben');
    PERFORM cron.schedule(
      'check-ueberfaellige-aufgaben',
      '0 6 * * *',
      'SELECT public.cron_check_ueberfaellige_aufgaben()'
    );
    RAISE NOTICE 'pg_cron Job "check-ueberfaellige-aufgaben" eingeplant (06:00 UTC)';
  ELSE
    RAISE NOTICE 'pg_cron nicht verfuegbar — Funktion cron_check_ueberfaellige_aufgaben() manuell oder per Edge Function aufrufen';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron Scheduling fehlgeschlagen: % — Funktion bleibt manuell aufrufbar', SQLERRM;
END;
$$;
