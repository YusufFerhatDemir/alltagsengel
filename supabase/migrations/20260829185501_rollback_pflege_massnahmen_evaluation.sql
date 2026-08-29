-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK zu 20260829185500_pflege_massnahmen_evaluation.sql
--
-- ACHTUNG — DATENVERLUST MIT ANSAGE: die Evaluationen werden mitsamt der
-- Tabelle geloescht. Die Wiedervorlage-Spalten an `pflege_massnahmen`
-- fallen ebenfalls weg.
--
-- Die beiden Unveraenderlichkeits-Trigger muessen VOR dem DROP TABLE weg:
-- ein `DROP TABLE` loest sie zwar nicht aus, aber die Reihenfolge macht
-- die Absicht lesbar und schuetzt vor einem teilweise ausgefuehrten Lauf.
--
-- Datum:   2026-08-29
-- IDEMPOTENT.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

DROP TRIGGER IF EXISTS trg_pme_wiedervorlage        ON public.pflege_massnahmen_evaluationen;
DROP TRIGGER IF EXISTS trg_pme_plan_in_kraft        ON public.pflege_massnahmen_evaluationen;
DROP TRIGGER IF EXISTS trg_pme_unveraenderlich_update ON public.pflege_massnahmen_evaluationen;
DROP TRIGGER IF EXISTS trg_pme_unveraenderlich_delete ON public.pflege_massnahmen_evaluationen;

DROP FUNCTION IF EXISTS public.pflege_evaluation_wiedervorlage();
DROP FUNCTION IF EXISTS public.pflege_evaluation_plan_in_kraft();
DROP FUNCTION IF EXISTS public.pflege_evaluation_unveraenderlich();

DROP TABLE IF EXISTS public.pflege_massnahmen_evaluationen;

-- Der Audit-Typ-CHECK geht auf die urspruengliche Liste zurueck. Zeilen mit
-- einem der neu zugelassenen Typen muessen vorher weg, sonst scheitert das
-- Wiederherstellen des Constraints an genau den Zeilen, die es zulassen
-- sollte.
DELETE FROM public.pflege_audit_log
  WHERE entitaet_typ NOT IN (
    'aufnahme', 'anamnese', 'diagnose', 'risiko',
    'verlauf', 'massnahme', 'massnahmenplan'
  );

ALTER TABLE public.pflege_audit_log
  DROP CONSTRAINT IF EXISTS pflege_audit_log_typ_check;
ALTER TABLE public.pflege_audit_log
  ADD CONSTRAINT pflege_audit_log_typ_check CHECK (entitaet_typ IN (
    'aufnahme', 'anamnese', 'diagnose', 'risiko',
    'verlauf', 'massnahme', 'massnahmenplan'
  ));

DROP INDEX IF EXISTS public.idx_pflege_massnahmen_evaluation_faellig;

ALTER TABLE public.pflege_massnahmen
  DROP CONSTRAINT IF EXISTS pflege_massnahmen_evaluation_intervall_check;
ALTER TABLE public.pflege_massnahmen
  DROP COLUMN IF EXISTS naechste_evaluation,
  DROP COLUMN IF EXISTS evaluation_intervall_tage;

COMMIT;
