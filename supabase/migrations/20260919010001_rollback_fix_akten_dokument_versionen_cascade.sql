-- ════════════════════════════════════════════════════════════════════
-- ROLLBACK zu 20260919010000_fix_akten_dokument_versionen_cascade.sql
-- ════════════════════════════════════════════════════════════════════
-- ACHTUNG: Danach blockiert akten_dokument_versionen wieder JEDES DELETE,
-- auch die Kaskade von akten_dokumente — eine DSGVO-Kontoloeschung ueber
-- kundenakte/akten_dokumente wuerde dann erneut fehlschlagen.
-- Nur ausfuehren, wenn die Haertung nachweislich einen Produktionsweg bricht.
-- ════════════════════════════════════════════════════════════════════

BEGIN;

DROP TRIGGER IF EXISTS trg_immutable_akten_versionen_update ON public.akten_dokument_versionen;
DROP TRIGGER IF EXISTS trg_immutable_akten_versionen_delete ON public.akten_dokument_versionen;
DROP FUNCTION IF EXISTS public.prevent_modify_akten_dokument_versionen();

-- Alten (kaputten) Trigger wiederherstellen, damit der Zustand identisch
-- zu vor 20260919010000 ist.
DROP TRIGGER IF EXISTS trg_immutable_akten_versionen ON public.akten_dokument_versionen;
CREATE TRIGGER trg_immutable_akten_versionen
    BEFORE UPDATE OR DELETE ON public.akten_dokument_versionen
    FOR EACH ROW EXECUTE FUNCTION public.prevent_modify_akten_audit();

COMMIT;
