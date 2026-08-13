-- Rollback: Übergabeprotokolle (Schichtübergabe)
BEGIN;

DROP TRIGGER IF EXISTS trg_uebergabe_punkt_guard ON public.uebergabe_punkte;
DROP TRIGGER IF EXISTS trg_uebergabe_protokoll_abschluss ON public.uebergabe_protokolle;
DROP TRIGGER IF EXISTS trg_updated_at_uebergabe_punkte ON public.uebergabe_punkte;
DROP TRIGGER IF EXISTS trg_updated_at_uebergabe_protokolle ON public.uebergabe_protokolle;

DROP FUNCTION IF EXISTS public.uebergabe_punkt_guard();
DROP FUNCTION IF EXISTS public.uebergabe_protokoll_abschluss_guard();

DROP TABLE IF EXISTS public.uebergabe_kenntnisnahmen CASCADE;
DROP TABLE IF EXISTS public.uebergabe_punkte CASCADE;
DROP TABLE IF EXISTS public.uebergabe_protokolle CASCADE;

COMMIT;
