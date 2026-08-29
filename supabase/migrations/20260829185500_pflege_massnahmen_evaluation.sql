-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Massnahmenplanung — die EVALUATION (Pflegeprozess, Schritt 6)
--
-- BEFUND GAP-14 (29.08.2026):
--   Die Massnahmenplanung kennt Plaene, Einzelmassnahmen, Versionen,
--   Freigabe und Sperre — aber KEINE Evaluation. Damit fehlt der letzte
--   Schritt des Pflegeprozesses und der Schluss des Regelkreises: die
--   Feststellung, ob ein Pflegeziel erreicht wurde, und was daraus folgt.
--
--   Vorhanden waren zwei Felder, die danach aussehen und es nicht sind:
--     • `pflege_massnahmen.ergebnis` — ein Freitextfeld ohne Datum, ohne
--       Urheber, ohne Wiedervorlage. Ueberschreibbar, also ohne Historie:
--       die vorherige Beurteilung ist nach der naechsten weg.
--     • `pflege_massnahmen.status` — sagt, was mit der Massnahme geschieht
--       ('abgeschlossen'), nicht, ob ihr ZIEL erreicht wurde. Eine
--       abgebrochene Massnahme kann ihr Ziel erreicht haben, eine laufende
--       kann es verfehlen.
--
--   Praktische Folge: es gibt heute keine Abfrage, die „welche Massnahmen
--   sind zur Evaluation faellig?" beantwortet. Bei einer Qualitaetspruefung
--   nach § 114 SGB XI ist genau das die Frage, und die Antwort waere „das
--   wissen wir nicht" gewesen.
--
-- WAS DIESE MIGRATION TUT
--   1. `pflege_massnahmen` bekommt `evaluation_intervall_tage` und
--      `naechste_evaluation` — die Wiedervorlage.
--   2. Neue Tabelle `pflege_massnahmen_evaluationen`: je Evaluation eine
--      Zeile mit Datum, Zielerreichung, Beurteilung, Folgerung und
--      Urheber. Eine TABELLE, kein Feld: die Reihe der Beurteilungen IST
--      der Regelkreis, und eine ueberschriebene Beurteilung ist keine.
--   3. Die Zeilen sind unveraenderlich (Trigger) — mit der ueblichen
--      Ausnahme fuer die FK-Kaskade, damit eine DSGVO-Loeschung nicht an
--      ihnen haengenbleibt.
--   4. Ein AFTER-Trigger schreibt die Wiedervorlage an der Massnahme fort.
--
-- WAS SIE BEWUSST NICHT TUT
--   Sie aendert den `status` der Massnahme nicht automatisch. „Ziel nicht
--   erreicht" heisst nicht „Massnahme beenden" — welche Folge richtig ist,
--   entscheidet die Pflegefachkraft, und `folgerung` haelt genau diese
--   Entscheidung fest. Ein Automatismus haette sie ihr abgenommen.
--
-- Datum:     2026-08-29
-- Projekt:   Alltagsengel UG
-- IDEMPOTENT.
-- Rollback:  20260829185501_rollback_pflege_massnahmen_evaluation.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Wiedervorlage an der Massnahme ──────────────────────────────────────

ALTER TABLE public.pflege_massnahmen
  ADD COLUMN IF NOT EXISTS evaluation_intervall_tage integer,
  ADD COLUMN IF NOT EXISTS naechste_evaluation date;

ALTER TABLE public.pflege_massnahmen
  DROP CONSTRAINT IF EXISTS pflege_massnahmen_evaluation_intervall_check;
ALTER TABLE public.pflege_massnahmen
  ADD CONSTRAINT pflege_massnahmen_evaluation_intervall_check
  CHECK (evaluation_intervall_tage IS NULL
         OR (evaluation_intervall_tage BETWEEN 1 AND 365));

-- Teilindex auf die faelligen Wiedervorlagen: die Frage lautet immer
-- „was ist ueberfaellig", nie „was steht irgendwann an".
CREATE INDEX IF NOT EXISTS idx_pflege_massnahmen_evaluation_faellig
  ON public.pflege_massnahmen(organization_id, naechste_evaluation)
  WHERE naechste_evaluation IS NOT NULL AND status IN ('geplant','aktiv');

COMMENT ON COLUMN public.pflege_massnahmen.naechste_evaluation IS
  'Wiedervorlage: wann die Zielerreichung dieser Massnahme das naechste Mal zu beurteilen ist. Wird vom Trigger trg_pflege_evaluation_wiedervorlage fortgeschrieben.';

-- ── 2. Die Evaluationen ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.pflege_massnahmen_evaluationen (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT current_org_id(),
  massnahme_id    uuid NOT NULL REFERENCES public.pflege_massnahmen(id) ON DELETE CASCADE,

  evaluiert_am    date NOT NULL DEFAULT CURRENT_DATE,

  -- Wurde das ZIEL erreicht? Nicht: was ist mit der Massnahme geschehen.
  -- `nicht_beurteilbar` ist bewusst ein eigener Wert und kein Auslassen:
  -- „konnte nicht beurteilt werden, weil der Klient im Krankenhaus war"
  -- ist eine Feststellung, keine fehlende Angabe.
  zielerreichung  text NOT NULL,

  -- Die Beurteilung selbst. NOT NULL und nicht leer: eine Evaluation ohne
  -- Begruendung ist ein Haekchen, und ein Haekchen ist bei einer Pruefung
  -- nach § 114 SGB XI nichts wert.
  bewertung       text NOT NULL,

  -- Was daraus folgt. Der Regelkreis schliesst sich hier.
  folgerung       text NOT NULL,

  -- Die naechste Wiedervorlage, die aus DIESER Beurteilung folgt.
  naechste_evaluation date,

  evaluiert_von   uuid NOT NULL REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT pme_zielerreichung_check CHECK (zielerreichung IN
    ('erreicht','teilweise_erreicht','nicht_erreicht','nicht_beurteilbar')),
  CONSTRAINT pme_folgerung_check CHECK (folgerung IN
    ('fortfuehren','anpassen','beenden','neue_massnahme')),
  CONSTRAINT pme_bewertung_nicht_leer CHECK (length(btrim(bewertung)) >= 3),
  CONSTRAINT pme_wiedervorlage_nicht_rueckwaerts CHECK
    (naechste_evaluation IS NULL OR naechste_evaluation >= evaluiert_am)
);

CREATE INDEX IF NOT EXISTS idx_pme_massnahme
  ON public.pflege_massnahmen_evaluationen(massnahme_id, evaluiert_am DESC);
CREATE INDEX IF NOT EXISTS idx_pme_org
  ON public.pflege_massnahmen_evaluationen(organization_id);

ALTER TABLE public.pflege_massnahmen_evaluationen ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
    WHERE tablename = 'pflege_massnahmen_evaluationen' AND policyname = 'admin_pme') THEN
    CREATE POLICY admin_pme ON public.pflege_massnahmen_evaluationen FOR ALL
      USING (is_admin());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies
    WHERE tablename = 'pflege_massnahmen_evaluationen' AND policyname = 'org_fence_pme') THEN
    CREATE POLICY org_fence_pme ON public.pflege_massnahmen_evaluationen
      AS RESTRICTIVE FOR ALL
      USING (organization_id = current_org_id());
  END IF;

  -- Die betreuende Kraft darf die Beurteilungen zu IHREN Klienten lesen —
  -- ohne sie waere die Massnahme sichtbar und ihre Wirkung nicht.
  -- Bewusst ueber `eigene_caregiver_ids()` statt ueber einen Join auf
  -- `caregivers`: ein solcher Join blockt in diesem Projekt still (siehe
  -- die Policies auf pflege_massnahmen).
  IF NOT EXISTS (SELECT 1 FROM pg_policies
    WHERE tablename = 'pflege_massnahmen_evaluationen' AND policyname = 'engel_pme_select') THEN
    CREATE POLICY engel_pme_select ON public.pflege_massnahmen_evaluationen FOR SELECT
      USING (massnahme_id IN (
        SELECT m.id FROM public.pflege_massnahmen m
        JOIN public.pflege_massnahmenplaene p ON p.id = m.plan_id
        WHERE p.status IN ('aktiv','abgelaufen') AND p.client_id IN (
          SELECT a.client_id FROM public.assignments a
          WHERE a.caregiver_id IN (SELECT eigene_caregiver_ids())
            AND a.status IN ('active','GEPLANT','BESTAETIGT','UNTERWEGS','GESTARTET')
        )
      ));
  END IF;
END $$;

COMMENT ON TABLE public.pflege_massnahmen_evaluationen IS
  'Evaluation einer Pflegemassnahme (Pflegeprozess Schritt 6). Eine Zeile je Beurteilung — die Reihe ist der Regelkreis. Unveraenderlich.';

-- ── 2a. Das Pflege-Audit muss den neuen Typ kennen ─────────────────────────
--
-- BEFUND NEBENBEI: `pflege_audit_log.entitaet_typ` traegt einen CHECK mit
-- SIEBEN Werten, waehrend `PFLEGE_AUDIT_ENTITAET_TYP_WERTE` in
-- `lib/pflege/types.ts` FUENFZEHN kennt. Jeder Audit-Eintrag zu einem
-- Medikament, einer Wunddokumentation, einem Sturz- oder
-- Fixierungsprotokoll scheitert deshalb heute am Constraint. Er geht nicht
-- ganz lautlos verloren — `logPflegeAktivitaet` faengt den Fehler und
-- protokolliert ihn —, aber im Audit steht er nicht. Das faellt unter
-- dieselbe Falle wie `mis_audit_log.action`.
--
-- Die Liste wird hier auf den Stand des Anwendungscodes gezogen und um
-- `evaluation` erweitert. `__tests__/pflege/audit-typen-abgleich.test.ts`
-- haelt beide Seiten ab jetzt gegeneinander.

ALTER TABLE public.pflege_audit_log
  DROP CONSTRAINT IF EXISTS pflege_audit_log_typ_check;
ALTER TABLE public.pflege_audit_log
  ADD CONSTRAINT pflege_audit_log_typ_check CHECK (entitaet_typ IN (
    'aufnahme', 'anamnese', 'diagnose', 'risiko',
    'verlauf', 'massnahme', 'massnahmenplan',
    'medikament', 'wunddokumentation', 'sturzprotokoll',
    'fixierungsprotokoll', 'lagerungsprotokoll',
    'wund_assessment', 'wund_behandlung', 'fem_ueberwachung',
    'evaluation'
  ));

-- ── 3. Unveraenderlichkeit ─────────────────────────────────────────────────
--
-- Eine Evaluation ist eine Feststellung zu einem Zeitpunkt. Wer sie
-- nachtraeglich aendert, aendert die Vergangenheit; wer sie loescht,
-- unterbricht den Regelkreis. Eine falsche Beurteilung wird durch eine
-- NEUE korrigiert, nicht durch eine Aenderung der alten.
--
-- AUSNAHME FUER DIE KASKADE: ein RAISE im BEFORE DELETE blockiert auch das
-- Loeschen der Elternzeile — und damit die DSGVO-Loeschkette
-- (Klient → Plan → Massnahme → Evaluation). Der Kaskadenfall ist daran
-- erkennbar, dass die Massnahme in derselben Anweisung bereits weg ist.
-- Gleiches Muster wie 20260910010000_audit_logs_unveraenderlich.sql.

CREATE OR REPLACE FUNCTION public.pflege_evaluation_unveraenderlich()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF NOT EXISTS (SELECT 1 FROM public.pflege_massnahmen WHERE id = OLD.massnahme_id) THEN
      RETURN OLD;   -- Kaskade: die Massnahme ist bereits geloescht.
    END IF;
    RAISE EXCEPTION 'Evaluationen sind unveraenderlich. Eine abweichende Beurteilung wird als NEUE Evaluation erfasst.';
  END IF;

  RAISE EXCEPTION 'Evaluationen sind unveraenderlich. Eine abweichende Beurteilung wird als NEUE Evaluation erfasst.';
END;
$$;

DROP TRIGGER IF EXISTS trg_pme_unveraenderlich_update ON public.pflege_massnahmen_evaluationen;
CREATE TRIGGER trg_pme_unveraenderlich_update
  BEFORE UPDATE ON public.pflege_massnahmen_evaluationen
  FOR EACH ROW EXECUTE FUNCTION public.pflege_evaluation_unveraenderlich();

DROP TRIGGER IF EXISTS trg_pme_unveraenderlich_delete ON public.pflege_massnahmen_evaluationen;
CREATE TRIGGER trg_pme_unveraenderlich_delete
  BEFORE DELETE ON public.pflege_massnahmen_evaluationen
  FOR EACH ROW EXECUTE FUNCTION public.pflege_evaluation_unveraenderlich();

-- ── 4. Was nicht in Kraft ist, wird nicht beurteilt ────────────────────────
--
-- Ein Plan im Entwurf hat nie gewirkt; eine Massnahme daraus zu
-- „evaluieren" waere eine Feststellung ueber etwas, das nicht stattgefunden
-- hat. Ein ERSETZTER Plan ist dagegen beurteilbar — gerade die Frage, ob
-- die abgeloeste Fassung ihr Ziel erreicht hat, gehoert in den Regelkreis.

CREATE OR REPLACE FUNCTION public.pflege_evaluation_plan_in_kraft()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_status text;
BEGIN
  SELECT p.status INTO v_status
    FROM public.pflege_massnahmen m
    JOIN public.pflege_massnahmenplaene p ON p.id = m.plan_id
   WHERE m.id = NEW.massnahme_id;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Massnahme % existiert nicht.', NEW.massnahme_id;
  END IF;

  IF v_status = 'entwurf' THEN
    RAISE EXCEPTION 'Ein Massnahmenplan im Entwurf hat nie gewirkt und kann nicht evaluiert werden.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pme_plan_in_kraft ON public.pflege_massnahmen_evaluationen;
CREATE TRIGGER trg_pme_plan_in_kraft
  BEFORE INSERT ON public.pflege_massnahmen_evaluationen
  FOR EACH ROW EXECUTE FUNCTION public.pflege_evaluation_plan_in_kraft();

-- ── 5. Die Wiedervorlage fortschreiben ─────────────────────────────────────
--
-- Sie steht an der MASSNAHME, nicht nur an der Evaluation: die Frage
-- „was ist faellig" richtet sich an die Massnahmen, und ein Join auf die
-- jeweils juengste Evaluation waere dafuer der teure Umweg.
--
-- Reihenfolge der Quellen: die ausdrueckliche Angabe der Evaluation, sonst
-- das hinterlegte Intervall, sonst nichts. Kein Vorgabewert — eine
-- erfundene Wiedervorlage waere schlimmer als keine, weil sie eine
-- Verabredung vortaeuscht, die niemand getroffen hat.

CREATE OR REPLACE FUNCTION public.pflege_evaluation_wiedervorlage()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_intervall integer;
  v_naechste  date;
BEGIN
  SELECT evaluation_intervall_tage INTO v_intervall
    FROM public.pflege_massnahmen WHERE id = NEW.massnahme_id;

  v_naechste := COALESCE(
    NEW.naechste_evaluation,
    CASE WHEN v_intervall IS NOT NULL
         THEN NEW.evaluiert_am + v_intervall
         END
  );

  -- Beendet ist beendet: eine Wiedervorlage auf eine Massnahme, die nicht
  -- mehr laeuft, wuerde die Faelligkeitsliste dauerhaft verstopfen.
  IF NEW.folgerung = 'beenden' THEN
    v_naechste := NULL;
  END IF;

  UPDATE public.pflege_massnahmen
     SET naechste_evaluation = v_naechste
   WHERE id = NEW.massnahme_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pme_wiedervorlage ON public.pflege_massnahmen_evaluationen;
CREATE TRIGGER trg_pme_wiedervorlage
  AFTER INSERT ON public.pflege_massnahmen_evaluationen
  FOR EACH ROW EXECUTE FUNCTION public.pflege_evaluation_wiedervorlage();

COMMIT;
