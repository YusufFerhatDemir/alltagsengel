-- ═══════════════════════════════════════════════════════════════════════
-- lead_inquiries: Bewerbungen aufnehmen
-- ═══════════════════════════════════════════════════════════════════════
--
-- WARUM HIER UND NICHT IN applications
-- Es gibt eine Tabelle `applications` mit passend klingenden Spalten. Sie
-- ist im Code aber praktisch tot: genau zwei Dateien nennen sie, beide nur
-- in Berechtigungslisten. Es gibt keinen Schreibweg, keine Oberflaeche und
-- keine Ueberfuehrung nach `caregivers`. Die echten Bewerbungen laufen
-- seit jeher ueber das Website-Formular nach `lead_inquiries`
-- (components/EngelBewerbungForm.tsx → POST /api/lead-inquiry).
--
-- Eine tote Tabelle zu reaktivieren hiesse, den Bestand an zwei Orten zu
-- fuehren: die Formularbewerbungen hier, die Wizard-Bewerbungen dort. Wer
-- dann fragt „wie viele Bewerbungen haben wir?", bekommt zwei Antworten.
-- `applications` bleibt deshalb unberuehrt.
--
-- ── EINE SPALTE JE FRAGE, DER REST IN jsonb ────────────────────────────
-- Aufgenommen werden nur die Angaben, nach denen die Verwaltung FILTERT
-- oder SORTIERT (Art, E-Mail, Einreichungszeitpunkt). Die zwoelf Schritte
-- des Ablaufs stehen als Ganzes in `bewerbung_daten`. Zwanzig neue
-- Spalten waeren fuer Anfragen (der ueberwiegende Teil der Tabelle)
-- durchgehend NULL und muessten bei jeder Aenderung der Schrittfolge
-- migriert werden.
--
-- ── DER RIEGEL GEGEN DOPPELTE BEWERBUNGEN ──────────────────────────────
-- Der Teil-Unique-Index unten ist der eigentliche Grund dieser Migration.
-- Ein Doppelklick auf „Abschließen", ein wiederholter Request oder ein
-- zweiter Browsertab wuerden sonst zwei Bewerbungen derselben Person
-- erzeugen — und die Verwaltung fuehrt zwei Gespraeche zu einem Menschen.
-- Eine Vorabpruefung im Anwendungscode kann das bei parallelen Aufrufen
-- prinzipiell nicht; ein Index kann es.
--
-- Rollback: 20261027000001_rollback_lead_inquiries_bewerbung.sql
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.lead_inquiries
  -- Fehlte bisher ganz: das Website-Formular fragt keine E-Mail ab. Der
  -- Bewerberablauf braucht sie — ohne sie gibt es keine Erinnerung und
  -- keine Rueckmeldung.
  ADD COLUMN IF NOT EXISTS email                  text,
  ADD COLUMN IF NOT EXISTS art                    text NOT NULL DEFAULT 'anfrage',
  ADD COLUMN IF NOT EXISTS bewerbung_daten        jsonb,
  ADD COLUMN IF NOT EXISTS onboarding_progress_id uuid,
  ADD COLUMN IF NOT EXISTS eingereicht_am         timestamptz;

-- Anfrage (Kundschaft sucht Hilfe) oder Bewerbung (jemand moechte
-- arbeiten). Ohne diese Unterscheidung landen beide im selben Posteingang
-- und werden mit derselben Antwort bedient.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'lead_inquiries_art_check'
  ) THEN
    ALTER TABLE public.lead_inquiries
      ADD CONSTRAINT lead_inquiries_art_check
      CHECK (art IN ('anfrage', 'bewerbung'));
  END IF;
END;
$$;

-- Der Fremdschluessel wird defensiv gesetzt: onboarding_progress kommt aus
-- 20261026000000 und fehlt auf einer Shadow-DB ohne dieses Modul.
-- ON DELETE SET NULL, nicht CASCADE: wird ein Onboarding-Ablauf geloescht,
-- bleibt die eingegangene Bewerbung bestehen. Sie ist ein eigener Vorgang,
-- kein Anhaengsel des Ablaufs.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'onboarding_progress'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'lead_inquiries_onboarding_progress_fkey'
  ) THEN
    ALTER TABLE public.lead_inquiries
      ADD CONSTRAINT lead_inquiries_onboarding_progress_fkey
      FOREIGN KEY (onboarding_progress_id)
      REFERENCES public.onboarding_progress(id) ON DELETE SET NULL;
  END IF;
END;
$$;

-- Der Riegel: hoechstens EINE Bewerbung je Onboarding-Ablauf.
CREATE UNIQUE INDEX IF NOT EXISTS uq_lead_inquiries_bewerbung_je_ablauf
  ON public.lead_inquiries(onboarding_progress_id)
  WHERE onboarding_progress_id IS NOT NULL;

-- Posteingang der Verwaltung: Bewerbungen, neueste zuerst.
CREATE INDEX IF NOT EXISTS idx_lead_inquiries_bewerbungen
  ON public.lead_inquiries(organization_id, eingereicht_am DESC)
  WHERE art = 'bewerbung';

COMMENT ON COLUMN public.lead_inquiries.art IS
  'anfrage = Kundschaft sucht Hilfe, bewerbung = jemand moechte bei uns arbeiten.';
COMMENT ON COLUMN public.lead_inquiries.bewerbung_daten IS
  'Antworten der zwoelf Schritte aus onboarding_progress.schritte_daten, '
  'zum Zeitpunkt des Absendens eingefroren. Bewusst jsonb: die Schrittfolge '
  'aendert sich, die eingegangene Bewerbung darf sich nicht mitaendern.';
COMMENT ON COLUMN public.lead_inquiries.eingereicht_am IS
  'Zeitpunkt des Absendens. NULL bei Anfragen und bei noch nicht abgesendeten Ablaeufen.';

COMMIT;
