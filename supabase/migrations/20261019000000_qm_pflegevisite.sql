-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Qualitaetsmanagement — Pflegevisite mit Befunden und
--            Regelkreis (Antrag auf Massnahme)
--
-- WARUM DIESES MODUL:
--   Die COMPLETION-MATRIX fuehrt das Qualitaetsmanagement als Modul 29 auf
--   der Stufe DEPLOYED und haelt als Befund I-12 fest: „Beide Module (PDL
--   und QM) sind Lesesichten auf fremde Tabellen, kein eigenes Fachmodul.
--   Es gibt keine Pflegevisite, keine Dienstanweisung, kein QM-Handbuch,
--   keinen Beschwerde-Regelkreis. Das ist eine Produktluecke, kein Bug."
--
--   Vorhanden war ausschliesslich `lib/analytics/quality.ts` — ein
--   Kennzahlen-Dashboard, das Wunden, Stuerze, Vitalalarme und offene
--   Massnahmen ZAEHLT. Zaehlen ist keine Qualitaetssicherung: es sagt, wie
--   viele Wunden es gibt, aber nicht, ob die Versorgung stimmt.
--
--   Die Pflegevisite ist das Kerninstrument der internen Qualitaetspruefung
--   im ambulanten Dienst (§ 113 SGB XI / MD-Qualitaetspruefungs-Richtlinien):
--   eine angekuendigte, strukturierte Pruefung beim Klienten, mit
--   Checkliste, festgehaltenen Befunden und daraus abgeleiteten
--   Korrekturmassnahmen.
--
-- DER ZUSCHNITT FOLGT DER ROLLENMATRIX, NICHT DER BEQUEMLICHKEIT:
--   `lib/auth/rollen.ts` haelt fuer die Rolle `qm` ausdruecklich fest:
--   „prueft, dokumentiert Befunde, aendert aber die geprueften Daten NICHT
--   — sonst pruefte es die eigene Korrektur. Schreibrecht nur im eigenen
--   QM-Bestand." Genau deshalb schreibt dieses Modul NICHT in
--   `pflege_massnahmen`. Ein Befund kann eine Massnahme ANTRAGEN
--   (`massnahme_beantragt`), und wer `pflege.schreiben` hat — die PDL —
--   legt sie an und traegt sie mit `massnahme_id` zurueck. Das ist der
--   Regelkreis: Pruefung und Abstellung liegen in verschiedenen Haenden.
--
-- ZWEI TABELLEN:
--   qm_pflegevisiten   — die Visite: geplant, durchgefuehrt, ausgewertet,
--                        abgeschlossen. Nach dem Abschluss unveraenderlich
--                        (Trigger), weil eine nachtraeglich geaenderte
--                        Pruefung keine Pruefung mehr ist.
--   qm_visite_befunde  — je Pruefpunkt eine Zeile mit Bewertung. Ein Befund
--                        haengt an genau einer Visite und erbt deren Sperre.
--
-- DIE PRUEFPUNKTE stehen als kontrolliertes Vokabular im CHECK, nicht als
--   Freitext: eine Visite, deren Punkte jeder anders benennt, laesst sich
--   ueber die Zeit nicht vergleichen — und Vergleichbarkeit ist der ganze
--   Zweck einer wiederkehrenden Pruefung.
--
-- Datum:     2026-08-29
-- Projekt:   Alltagsengel UG
-- IDEMPOTENT.
-- Rollback:  20261019000001_rollback_qm_pflegevisite.sql
-- STATUS:    EINGECHECKT — NICHT ANGEWENDET (DDL laeuft ueber den
--            Dienstschluessel als 42501 auf). Die Anwendung meldet ohne
--            diese Migration einen klaren Hinweis statt einer rohen
--            Datenbankmeldung (siehe lib/qm/pflegevisite.ts).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── Die Visite ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.qm_pflegevisiten (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL DEFAULT current_org_id() REFERENCES public.organizations(id),
  client_id        uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,

  -- Wer geprueft wurde: die betreute Person. Wer die Leistung erbringt,
  -- steht in caregiver_id — beides gehoert in den Befund, weil eine
  -- Abweichung entweder an der Planung oder an der Ausfuehrung liegt.
  caregiver_id     uuid REFERENCES public.caregivers(id) ON DELETE SET NULL,

  visite_typ       text NOT NULL DEFAULT 'regelvisite',
  geplant_am       date NOT NULL,
  durchgefuehrt_am date,
  status           text NOT NULL DEFAULT 'geplant',

  -- Der Anlass zaehlt: eine Anlassvisite nach einer Beschwerde wird anders
  -- gelesen als die jaehrliche Regelvisite.
  anlass           text,
  zusammenfassung  text,

  -- Gesamturteil. Bewusst NICHT aus den Einzelbefunden gerechnet: die
  -- Pruefende faellt es, und ein einzelner schwerer Befund kann eine sonst
  -- gute Visite kippen.
  gesamtbewertung  text,

  durchgefuehrt_von uuid REFERENCES auth.users(id),
  abgeschlossen_am  timestamptz,
  abgeschlossen_von uuid REFERENCES auth.users(id),

  erstellt_von  uuid NOT NULL REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT qm_pflegevisiten_typ_check CHECK (visite_typ IN (
    'regelvisite', 'anlassvisite', 'einarbeitung', 'nachvisite'
  )),
  CONSTRAINT qm_pflegevisiten_status_check CHECK (status IN (
    'geplant', 'durchgefuehrt', 'ausgewertet', 'abgeschlossen', 'abgesagt'
  )),
  CONSTRAINT qm_pflegevisiten_bewertung_check CHECK (gesamtbewertung IS NULL OR gesamtbewertung IN (
    'ohne_beanstandung', 'geringe_abweichung', 'erhebliche_abweichung', 'sofortmassnahme'
  )),
  -- Eine Visite ohne Datum ist keine durchgefuehrte Visite. Der Riegel
  -- steht hier und nicht nur im Anwendungscode, weil `durchgefuehrt_am`
  -- die Frist fuer die naechste Visite bestimmt.
  CONSTRAINT qm_pflegevisiten_durchgefuehrt_datum CHECK (
    status IN ('geplant', 'abgesagt') OR durchgefuehrt_am IS NOT NULL
  ),
  CONSTRAINT qm_pflegevisiten_abschluss_belegt CHECK (
    status <> 'abgeschlossen' OR (abgeschlossen_am IS NOT NULL AND abgeschlossen_von IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_qm_pflegevisiten_org    ON public.qm_pflegevisiten(organization_id);
CREATE INDEX IF NOT EXISTS idx_qm_pflegevisiten_client ON public.qm_pflegevisiten(client_id, geplant_am DESC);
CREATE INDEX IF NOT EXISTS idx_qm_pflegevisiten_offen
  ON public.qm_pflegevisiten(organization_id, geplant_am)
  WHERE status IN ('geplant', 'durchgefuehrt', 'ausgewertet');

-- ── Die Befunde ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.qm_visite_befunde (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL DEFAULT current_org_id() REFERENCES public.organizations(id),
  visite_id        uuid NOT NULL REFERENCES public.qm_pflegevisiten(id) ON DELETE CASCADE,

  pruefpunkt       text NOT NULL,
  bewertung        text NOT NULL,
  feststellung     text,
  -- Was zu tun ist. QM formuliert es, QM setzt es NICHT um.
  empfehlung       text,
  frist            date,

  -- Der Regelkreis. `massnahme_beantragt` ist die Bitte des QM,
  -- `massnahme_id` die Antwort der Pflegedienstleitung.
  massnahme_beantragt boolean NOT NULL DEFAULT false,
  massnahme_id     uuid REFERENCES public.pflege_massnahmen(id) ON DELETE SET NULL,
  erledigt_am      date,

  erstellt_von  uuid NOT NULL REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  -- Kontrolliertes Vokabular, siehe Kopfkommentar: ohne es sind zwei
  -- Visiten desselben Klienten nicht vergleichbar.
  CONSTRAINT qm_visite_befunde_pruefpunkt_check CHECK (pruefpunkt IN (
    'pflegeplanung_aktuell',
    'dokumentation_vollstaendig',
    'medikamentengabe',
    'wundversorgung',
    'vitalwerte_erhebung',
    'sturzprophylaxe',
    'dekubitusprophylaxe',
    'ernaehrung_fluessigkeit',
    'hygiene',
    'hilfsmittel_zustand',
    'zufriedenheit_klient',
    'zufriedenheit_angehoerige',
    'einsatzzeiten_eingehalten',
    'schweigepflicht_datenschutz',
    'sonstiges'
  )),
  CONSTRAINT qm_visite_befunde_bewertung_check CHECK (bewertung IN (
    'erfuellt', 'teilweise_erfuellt', 'nicht_erfuellt', 'nicht_anwendbar'
  )),
  -- Ein „nicht erfuellt" ohne Feststellung ist ein Vorwurf ohne Sachverhalt.
  CONSTRAINT qm_visite_befunde_feststellung_belegt CHECK (
    bewertung NOT IN ('teilweise_erfuellt', 'nicht_erfuellt')
    OR (feststellung IS NOT NULL AND length(btrim(feststellung)) > 0)
  ),
  -- Je Visite jeder Pruefpunkt genau einmal — sonst stehen zwei
  -- Bewertungen desselben Punktes nebeneinander und keine gilt.
  CONSTRAINT qm_visite_befunde_punkt_unique UNIQUE (visite_id, pruefpunkt)
);

CREATE INDEX IF NOT EXISTS idx_qm_visite_befunde_visite ON public.qm_visite_befunde(visite_id);
CREATE INDEX IF NOT EXISTS idx_qm_visite_befunde_org    ON public.qm_visite_befunde(organization_id);
CREATE INDEX IF NOT EXISTS idx_qm_visite_befunde_offen
  ON public.qm_visite_befunde(organization_id, frist)
  WHERE bewertung IN ('teilweise_erfuellt', 'nicht_erfuellt') AND erledigt_am IS NULL;

-- ── Unveraenderlichkeit nach dem Abschluss ─────────────────────────────────
--
-- Eine abgeschlossene Visite ist ein Pruefergebnis. Wer es nachtraeglich
-- aendert, hat nicht geprueft, sondern das Ergebnis angepasst.
--
-- Die Sperre haengt AN DER ABSICHT, nicht am Endzustand: anders als bei
-- `prevent_locked_plan_edit` / `log_arbeitszeit_korrektur` (beide pruefen
-- `OLD.x AND NEW.x` und lassen sich deshalb umgehen, indem man die Sperre
-- im selben UPDATE mit aufhebt — belegt in
-- __tests__/e2e/zeiterfassung-kette-pglite.test.ts) wird hier jede
-- Aenderung an einer abgeschlossenen Visite abgewiesen. Erlaubt bleibt
-- ausschliesslich das Nachtragen der Erledigung eines Befundes: die
-- Abstellung geschieht NACH der Visite und muss dokumentierbar bleiben.
CREATE OR REPLACE FUNCTION public.prevent_abgeschlossene_visite_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'abgeschlossen' THEN
      RAISE EXCEPTION 'Abgeschlossene Pflegevisite kann nicht geloescht werden.';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status = 'abgeschlossen' THEN
    RAISE EXCEPTION 'Abgeschlossene Pflegevisite kann nicht mehr geaendert werden.';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.prevent_abgeschlossener_befund_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_status text;
BEGIN
  SELECT status INTO v_status FROM public.qm_pflegevisiten
   WHERE id = COALESCE(NEW.visite_id, OLD.visite_id);

  -- Kaskade von der Visite: die Elternzeile ist bereits weg → durchlassen.
  -- Gleiches Muster wie 20260919010000_fix_akten_dokument_versionen_cascade.
  IF v_status IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF v_status <> 'abgeschlossen' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Befund einer abgeschlossenen Pflegevisite kann nicht geloescht werden.';
  END IF;

  -- Nach dem Abschluss bleibt genau der Regelkreis offen: die Massnahme,
  -- die aus dem Befund entstanden ist, und ihre Erledigung. Alles andere
  -- waere eine nachtraegliche Aenderung des Pruefergebnisses.
  IF NEW.pruefpunkt      IS DISTINCT FROM OLD.pruefpunkt
     OR NEW.bewertung    IS DISTINCT FROM OLD.bewertung
     OR NEW.feststellung IS DISTINCT FROM OLD.feststellung
     OR NEW.empfehlung   IS DISTINCT FROM OLD.empfehlung
     OR NEW.frist        IS DISTINCT FROM OLD.frist
     OR NEW.massnahme_beantragt IS DISTINCT FROM OLD.massnahme_beantragt THEN
    RAISE EXCEPTION 'Befund einer abgeschlossenen Pflegevisite kann nicht mehr geaendert werden.'
      USING HINT = 'Nachtragbar bleiben nur massnahme_id und erledigt_am.';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_qm_visite_abgeschlossen ON public.qm_pflegevisiten;
CREATE TRIGGER trg_qm_visite_abgeschlossen
  BEFORE UPDATE OR DELETE ON public.qm_pflegevisiten
  FOR EACH ROW EXECUTE FUNCTION public.prevent_abgeschlossene_visite_change();

DROP TRIGGER IF EXISTS trg_qm_befund_abgeschlossen ON public.qm_visite_befunde;
CREATE TRIGGER trg_qm_befund_abgeschlossen
  BEFORE UPDATE OR DELETE ON public.qm_visite_befunde
  FOR EACH ROW EXECUTE FUNCTION public.prevent_abgeschlossener_befund_change();

-- Ein neuer Befund an einer bereits abgeschlossenen Visite waere ein
-- nachgereichtes Pruefergebnis — dafuer gibt es die Nachvisite.
CREATE OR REPLACE FUNCTION public.prevent_befund_an_abgeschlossener_visite()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.qm_pflegevisiten
     WHERE id = NEW.visite_id AND status = 'abgeschlossen'
  ) THEN
    RAISE EXCEPTION 'Zu einer abgeschlossenen Pflegevisite kann kein Befund mehr erfasst werden.'
      USING HINT = 'Dafuer ist eine Nachvisite vorgesehen.';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_qm_befund_insert_offen ON public.qm_visite_befunde;
CREATE TRIGGER trg_qm_befund_insert_offen
  BEFORE INSERT ON public.qm_visite_befunde
  FOR EACH ROW EXECUTE FUNCTION public.prevent_befund_an_abgeschlossener_visite();

-- ── updated_at ─────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_updated_at_qm_pflegevisiten ON public.qm_pflegevisiten;
CREATE TRIGGER trg_updated_at_qm_pflegevisiten BEFORE UPDATE ON public.qm_pflegevisiten
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_updated_at_qm_visite_befunde ON public.qm_visite_befunde;
CREATE TRIGGER trg_updated_at_qm_visite_befunde BEFORE UPDATE ON public.qm_visite_befunde
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── RLS ────────────────────────────────────────────────────────────────────
--
-- Der Schreibweg der Anwendung faehrt wie ueberall in diesem Repo mit dem
-- Dienstschluessel; RLS ist hier die zweite Linie fuer alles, was direkt
-- an PostgREST geht. Der RESTRICTIVE org_fence trennt die Mandanten, die
-- permissive Policy erteilt den internen Rollen den Zugang.
ALTER TABLE public.qm_pflegevisiten  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qm_visite_befunde ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['qm_pflegevisiten', 'qm_visite_befunde'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = 'org_fence_' || t) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO authenticated '
        || 'USING (organization_id = current_org_id()) '
        || 'WITH CHECK (organization_id = current_org_id())',
        'org_fence_' || t, t);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = 'intern_' || t) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO authenticated '
        || 'USING (public.is_internal_staff()) WITH CHECK (public.is_internal_staff())',
        'intern_' || t, t);
    END IF;
  END LOOP;
END $$;

COMMENT ON TABLE public.qm_pflegevisiten IS
  'Interne Pflegevisite (§ 113 SGB XI). Nach dem Abschluss unveraenderlich.';
COMMENT ON TABLE public.qm_visite_befunde IS
  'Einzelbefunde einer Pflegevisite. QM stellt fest und beantragt; die '
  'Massnahme selbst legt die Pflegedienstleitung an (Rollentrennung).';

COMMIT;
