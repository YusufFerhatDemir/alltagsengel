-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Pflegedienstleitung — Dienstplanfreigabe je Woche
--
-- WARUM DIESES MODUL:
--   Die COMPLETION-MATRIX fuehrt die Pflegedienstleitung als Modul 3 und
--   vermerkt in der Spalte „Mock/Stub?" ausdruecklich: „**kein eigenes
--   Modul** — nur Kennzahlen-Cockpit ueber fremde Tabellen". Befund I-12
--   nennt dasselbe: „keine Dienstanweisung", kein eigenes Fachmodul.
--
--   Vorhanden ist `lib/analytics/pdl-cockpit.ts`: eine Lesesicht auf
--   Leistungen, Umsatz, Personal, Klienten, Budgets. Die PDL kann damit
--   SEHEN, aber nichts ENTSCHEIDEN.
--
-- DIE OFFENE ENTSCHEIDUNG, DIE DIESE MIGRATION SCHLIESST:
--   `20260920060000_arbeitszeit_verstoesse.sql` haelt in ihrem Kopf fest,
--   der ArbZG-Trigger blockiere BEWUSST nicht: „Stattdessen wird der
--   Verstoss protokolliert und im Fristen-Dashboard sichtbar gemacht —
--   **PDL entscheidet**."
--
--   Die zweite Haelfte dieses Satzes gab es nicht. Live liest genau EINE
--   Stelle die Tabelle (`lib/automation/fristen-sammler.ts`, Abschnitt 8),
--   und die zeigt Verstoesse nur an. Es existierte im ganzen Repo kein
--   Schreibweg auf `quittiert` — der Eintrag konnte die Liste also nie
--   verlassen, egal wie die PDL entschied. Ein Riegel, der bewusst auf
--   eine Entscheidung wartet, die niemand treffen kann, ist kein Riegel.
--
-- WAS DIE FREIGABE IST:
--   Der Dienstplan einer Woche ist bis zur Freigabe ein Entwurf. Mit der
--   Freigabe wird er verbindlich: die Mitarbeitenden richten ihre Woche
--   danach ein. Deshalb darf er sich danach nicht mehr stillschweigend
--   aendern — jede Aenderung braucht einen Grund, und der steht in der
--   Zeile.
--
--   Die Freigabe selbst ist FAIL-CLOSED gegen genau die Dinge, die eine
--   Woche untauglich machen: unquittierte ArbZG-Verstoesse und Dienste
--   ohne Besetzung. Beides prueft `lib/pdl/dienstplanfreigabe.ts` mit
--   lesbaren Meldungen; die Datenbank haelt hier nur das Ergebnis fest.
--
-- WOCHENSCHLUESSEL:
--   `woche_start` ist der MONTAG (date_trunc('week', …) in Postgres).
--   Er wird von der Anwendung gesetzt UND von einem CHECK erzwungen —
--   ein Freigabesatz auf einen Mittwoch waere eine Woche, die es nicht
--   gibt, und zwei ueberlappende Freigaben derselben Tage.
--
-- Datum:     2026-08-29
-- Projekt:   Alltagsengel UG
-- IDEMPOTENT.
-- Rollback:  20261020000001_rollback_dienstplan_freigabe.sql
-- STATUS:    EINGECHECKT — NICHT ANGEWENDET (DDL laeuft ueber den
--            Dienstschluessel als 42501 auf).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── Die Freigabe ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.dienstplan_freigaben (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL DEFAULT current_org_id() REFERENCES public.organizations(id),

  woche_start      date NOT NULL,
  status           text NOT NULL DEFAULT 'freigegeben',

  freigegeben_von  uuid NOT NULL REFERENCES auth.users(id),
  freigegeben_am   timestamptz NOT NULL DEFAULT now(),

  -- Der Stand zum Zeitpunkt der Freigabe. Er wird MITGESCHRIEBEN und nicht
  -- spaeter nachgerechnet: die PDL hat auf DIESE Zahlen hin freigegeben,
  -- und eine Woche spaeter sieht die Abfrage anders aus.
  dienste_gesamt        integer NOT NULL DEFAULT 0,
  dienste_unbesetzt     integer NOT NULL DEFAULT 0,
  verstoesse_quittiert  integer NOT NULL DEFAULT 0,

  hinweis          text,

  -- Rueckzug: die Freigabe wird nicht geloescht, sondern zurueckgezogen.
  -- Sonst laesst sich nicht mehr sagen, ob eine Woche je verbindlich war.
  zurueckgezogen_von  uuid REFERENCES auth.users(id),
  zurueckgezogen_am   timestamptz,
  zurueckziehungsgrund text,

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT dienstplan_freigaben_status_check CHECK (status IN ('freigegeben', 'zurueckgezogen')),
  -- woche_start MUSS ein Montag sein (ISO-Zaehlung: 1 = Montag).
  CONSTRAINT dienstplan_freigaben_montag CHECK (EXTRACT(ISODOW FROM woche_start) = 1),
  -- Ein Rueckzug ohne Grund ist keine Entscheidung, sondern ein Loeschen
  -- mit anderem Namen.
  CONSTRAINT dienstplan_freigaben_rueckzug_belegt CHECK (
    status <> 'zurueckgezogen'
    OR (zurueckgezogen_von IS NOT NULL
        AND zurueckgezogen_am IS NOT NULL
        AND zurueckziehungsgrund IS NOT NULL
        AND length(btrim(zurueckziehungsgrund)) > 0)
  ),
  -- Je Mandant und Woche hoechstens EINE Freigabe. Ein zweiter Satz waere
  -- eine zweite Wahrheit ueber dieselben Tage.
  CONSTRAINT dienstplan_freigaben_woche_unique UNIQUE (organization_id, woche_start)
);

CREATE INDEX IF NOT EXISTS idx_dienstplan_freigaben_org
  ON public.dienstplan_freigaben(organization_id, woche_start DESC);

-- ── Der Aenderungsgrund an der Dienstzeile ─────────────────────────────────
ALTER TABLE public.dienstplan_eintraege
  ADD COLUMN IF NOT EXISTS aenderung_grund text;

COMMENT ON COLUMN public.dienstplan_eintraege.aenderung_grund IS
  'Grund der letzten Aenderung. Pflicht, sobald die Woche freigegeben ist — '
  'ein freigegebener Dienstplan aendert sich nicht stillschweigend.';

-- ── Der Riegel ─────────────────────────────────────────────────────────────
--
-- Ein freigegebener Dienstplan ist eine Zusage an die Mitarbeitenden. Er
-- darf sich aendern (Krankheit, Ausfall, Notfall) — aber nicht unbemerkt.
--
-- ZWEI FEINHEITEN, die den Riegel erst tragfaehig machen:
--
--   1. Auf UPDATE muss der Grund SICH GEAENDERT haben. Sonst deckte ein
--      einmal gesetzter Grund („Krankmeldung Frau M.") jede weitere
--      Aenderung derselben Zeile mit ab, auf Dauer.
--   2. DELETE ist gesperrt. Ein freigegebener Dienst verschwindet nicht;
--      er faellt aus (status = 'ausgefallen') und bleibt sichtbar.
--
-- Der Riegel greift NICHT, solange die Woche unfreigegeben ist — dort ist
-- der Plan ein Entwurf und soll sich frei aendern lassen.
CREATE OR REPLACE FUNCTION public.pruefe_dienstplan_freigabe()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_zeile  public.dienstplan_eintraege%ROWTYPE;
  v_woche  date;
BEGIN
  v_zeile := COALESCE(NEW, OLD);
  v_woche := date_trunc('week', v_zeile.datum)::date;

  IF NOT EXISTS (
    SELECT 1 FROM public.dienstplan_freigaben
     WHERE organization_id = v_zeile.organization_id
       AND woche_start = v_woche
       AND status = 'freigegeben'
  ) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION
      'Ein Dienst in einer freigegebenen Woche kann nicht geloescht werden.'
      USING HINT = 'Statt zu loeschen: den Dienst auf ausgefallen setzen.';
  END IF;

  IF NEW.aenderung_grund IS NULL OR length(btrim(NEW.aenderung_grund)) = 0 THEN
    RAISE EXCEPTION
      'Die Woche ab % ist freigegeben — jede Aenderung braucht einen Grund.', v_woche
      USING HINT = 'dienstplan_eintraege.aenderung_grund setzen.';
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.aenderung_grund IS NOT DISTINCT FROM OLD.aenderung_grund THEN
    RAISE EXCEPTION
      'Der Aenderungsgrund gehoert zu dieser Aenderung, nicht zur vorigen.'
      USING HINT = 'Fuer jede Aenderung an einer freigegebenen Woche einen eigenen Grund angeben.';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_dienstplan_freigabe ON public.dienstplan_eintraege;
CREATE TRIGGER trg_dienstplan_freigabe
  BEFORE INSERT OR UPDATE OR DELETE ON public.dienstplan_eintraege
  FOR EACH ROW EXECUTE FUNCTION public.pruefe_dienstplan_freigabe();

-- ── updated_at ─────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_updated_at_dienstplan_freigaben ON public.dienstplan_freigaben;
CREATE TRIGGER trg_updated_at_dienstplan_freigaben BEFORE UPDATE ON public.dienstplan_freigaben
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE public.dienstplan_freigaben ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE tablename = 'dienstplan_freigaben'
                    AND policyname = 'org_fence_dienstplan_freigaben') THEN
    CREATE POLICY org_fence_dienstplan_freigaben ON public.dienstplan_freigaben
      AS RESTRICTIVE FOR ALL TO authenticated
      USING (organization_id = current_org_id())
      WITH CHECK (organization_id = current_org_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE tablename = 'dienstplan_freigaben'
                    AND policyname = 'intern_dienstplan_freigaben') THEN
    CREATE POLICY intern_dienstplan_freigaben ON public.dienstplan_freigaben
      FOR ALL TO authenticated
      USING (public.is_internal_staff()) WITH CHECK (public.is_internal_staff());
  END IF;
END $$;

COMMENT ON TABLE public.dienstplan_freigaben IS
  'Wochenweise Freigabe des Dienstplans durch die Pflegedienstleitung. '
  'Ab der Freigabe braucht jede Aenderung an einem Dienst dieser Woche '
  'einen Grund (Trigger pruefe_dienstplan_freigabe).';

COMMIT;
