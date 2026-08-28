-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Zeitkorrektur — Akteur nachvollziehbar machen und die
--            Sperre zur echten Schranke ziehen
--
-- BEFUND 1 (live nachgemessen am 29.08.2026, GAP-8):
--   `log_arbeitszeit_korrektur()` schreibt `korrigiert_von = auth.uid()`,
--   und `personal_zeitkorrekturen.korrigiert_von` ist NOT NULL
--   (information_schema, live: nullable = NO).
--   Der EINZIGE Schreibweg der Zeiterfassung ist
--   `lib/personal/arbeitszeiten.ts`, aufgerufen aus
--   `app/api/personal/arbeitszeiten/*` — und der faehrt durchgehend mit
--   `createAdminClient()`. Unter dem Dienstschluessel liefert `auth.uid()`
--   live `NULL`; die JWT-Claims lauten dort
--   {"role":"service_role"} und tragen KEIN `sub` (ebenfalls live gelesen).
--
--   Folge: JEDE Korrektur einer Arbeitszeit, bei der sich start_zeit,
--   end_zeit, pause_minuten oder ist_minuten aendert, scheitert mit
--   23502 „null value in column korrigiert_von". Der Nutzer sieht
--   „Arbeitszeit konnte nicht aktualisiert werden: null value in column
--   …" — eine rohe Datenbankmeldung ohne erkennbare Ursache.
--
--   Aufgefallen ist das erst, als die Kette gegen echtes Postgres lief
--   (__tests__/e2e/zeiterfassung-kette-pglite.test.ts). Live ist es nie
--   aufgefallen, weil `personal_arbeitszeiten` 0 Zeilen traegt — niemand
--   hat je eine Zeit korrigiert. Das ist eine Aussage ueber den BESTAND,
--   nicht ueber den Code.
--
--   BEHOBEN in zwei Haelften, weil eine allein zu wenig ist:
--     • neue Spalte `personal_arbeitszeiten.geaendert_von` — den Akteur
--       kennt die Anwendung (admin.ctx.userId), sie konnte ihn bisher nur
--       nirgends hinschreiben, wo der Trigger ihn findet.
--     • der Trigger nimmt `COALESCE(auth.uid(), NEW.geaendert_von)` und
--       bricht FAIL-CLOSED mit Klartext ab, wenn beides fehlt. Ein
--       Revisionsprotokoll ohne Urheber waere schlimmer als gar keins:
--       es saehe vollstaendig aus.
--
--   VERWORFENE ALTERNATIVE: `korrigiert_von` nullable machen. Das haette
--   den Fehler beseitigt und die Frage „wer war das" mit „unbekannt"
--   beantwortet — bei einem Protokoll, das genau diese Frage beantworten
--   soll (§ 16 ArbZG-Aufzeichnungspflicht, Revisionssicherheit).
--   Ebenfalls verworfen: den Schreibweg auf den Nutzer-Client umstellen.
--   Dann greift RLS, und die Admin-Policy dieser Tabelle prueft
--   `role = 'admin'` — die PDL waere ausgesperrt.
--
-- BEFUND 2 (Befund I-6 der COMPLETION-MATRIX, hier geschlossen):
--   Die Sperre im Trigger lautet `IF OLD.gesperrt = true AND NEW.gesperrt
--   = true`. Wer `gesperrt = false` in dasselbe UPDATE haengt, faellt aus
--   der Bedingung heraus und aendert im selben Zug den abgerechneten
--   Zeitnachweis. Die echte Schranke war bisher allein der
--   TypeScript-Guard in `updateArbeitszeit()` — der haelt, aber er ist
--   umgehbar, sobald jemand an ihm vorbei schreibt (Skript, SQL-Editor,
--   eine zweite Route).
--
--   BEHOBEN: die Sperre haengt jetzt an der ABSICHT, nicht am Endzustand.
--   Blockiert wird jede Aenderung an einem NACHWEISFELD auf einer
--   gesperrten Zeile — start_zeit, end_zeit, pause_minuten, ist_minuten,
--   soll_minuten, status, bestaetigt_von, bestaetigt_am. Dieselbe Liste
--   wie NACHWEIS_FELDER in lib/personal/arbeitszeiten.ts.
--   Das reine Entsperren (gesperrt true → false, ggf. mit Bemerkung)
--   bleibt ausdruecklich erlaubt — sonst waere eine einmal gesperrte Zeit
--   fuer immer eingefroren und keine Korrektur mehr moeglich.
--
-- BEFUND 3 (beim selben Lauf gefunden, gleiches Muster wie
--            20260919010000_fix_akten_dokument_versionen_cascade.sql):
--   `prevent_zeitkorrektur_edit()` haengt an BEFORE UPDATE **und** BEFORE
--   DELETE von `personal_zeitkorrekturen` und wirft unbedingt. Der
--   Fremdschluessel `arbeitszeit_id` steht aber auf ON DELETE CASCADE.
--   Folge: sobald eine Arbeitszeit einmal korrigiert wurde, laesst sie
--   sich NIE MEHR loeschen — die Kaskade feuert den Trigger, der bricht
--   ab, und das DELETE auf `personal_arbeitszeiten` scheitert. Eine
--   versehentlich erfasste und danach korrigierte Zeit bleibt fuer immer
--   stehen. Ueber `caregivers.id → personal_arbeitszeiten.caregiver_id`
--   (ebenfalls ON DELETE CASCADE) trifft dasselbe jedes Loeschen eines
--   Mitarbeiters.
--
--   BEHOBEN nach demselben Muster wie die Akten-Migration: der
--   Kaskadenfall wird durchgelassen (die Elternzeile ist dann schon weg),
--   jedes DIREKTE Loeschen und jedes UPDATE bleibt abgewiesen. Die
--   Revisionssicherheit bleibt damit erhalten: ein Korrektureintrag
--   verschwindet nur zusammen mit der Zeit, zu der er gehoert.
--
-- Datum:     2026-08-29
-- Projekt:   Alltagsengel UG
-- IDEMPOTENT.
-- Rollback:  20261018000001_rollback_arbeitszeit_korrektur_akteur.sql
-- STATUS:    EINGECHECKT — NICHT ANGEWENDET (DDL laeuft ueber den
--            Dienstschluessel als 42501 auf; siehe Projekt-Gedaechtnis
--            „REVOKE braucht Owner-Rechte"). Die Anwendung ist so gebaut,
--            dass sie OHNE diese Migration weiterlaeuft und den Fehler
--            aus BEFUND 1 lesbar meldet, statt ihn roh durchzureichen.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── BEFUND 1, Haelfte 1: der Akteur bekommt einen Platz ────────────────────
ALTER TABLE public.personal_arbeitszeiten
  ADD COLUMN IF NOT EXISTS geaendert_von uuid;

COMMENT ON COLUMN public.personal_arbeitszeiten.geaendert_von IS
  'Wer diese Zeile zuletzt geschrieben hat. Gefuellt von der Anwendung, '
  'weil der Schreibweg mit dem Dienstschluessel faehrt und auth.uid() dort '
  'NULL ist. Quelle von personal_zeitkorrekturen.korrigiert_von.';

-- ── BEFUND 1, Haelfte 2 + BEFUND 2: der Trigger ────────────────────────────
CREATE OR REPLACE FUNCTION public.log_arbeitszeit_korrektur()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_akteur uuid := COALESCE(auth.uid(), NEW.geaendert_von);
  v_nachweis_geaendert boolean := (
    OLD.start_zeit     IS DISTINCT FROM NEW.start_zeit     OR
    OLD.end_zeit       IS DISTINCT FROM NEW.end_zeit       OR
    OLD.pause_minuten  IS DISTINCT FROM NEW.pause_minuten  OR
    OLD.ist_minuten    IS DISTINCT FROM NEW.ist_minuten    OR
    OLD.soll_minuten   IS DISTINCT FROM NEW.soll_minuten   OR
    OLD.status         IS DISTINCT FROM NEW.status         OR
    OLD.bestaetigt_von IS DISTINCT FROM NEW.bestaetigt_von OR
    OLD.bestaetigt_am  IS DISTINCT FROM NEW.bestaetigt_am
  );
  v_zeit_geaendert boolean := (
    OLD.start_zeit    IS DISTINCT FROM NEW.start_zeit    OR
    OLD.end_zeit      IS DISTINCT FROM NEW.end_zeit      OR
    OLD.pause_minuten IS DISTINCT FROM NEW.pause_minuten OR
    OLD.ist_minuten   IS DISTINCT FROM NEW.ist_minuten
  );
BEGIN
  -- BEFUND 2: die Sperre haengt an der Absicht, nicht am Endzustand.
  -- Ein mitgeschicktes `gesperrt = false` hilft nicht mehr weiter; reines
  -- Entsperren (v_nachweis_geaendert = false) bleibt erlaubt.
  IF OLD.gesperrt = true AND v_nachweis_geaendert THEN
    RAISE EXCEPTION 'Gesperrte Arbeitszeit kann nicht bearbeitet werden.';
  END IF;

  -- BEFUND 1: ohne Urheber wird NICHT protokolliert — und damit auch nicht
  -- geaendert. Fail-closed mit Klartext statt 23502 auf einer NOT-NULL-Spalte.
  IF v_zeit_geaendert AND v_akteur IS NULL THEN
    RAISE EXCEPTION 'Zeitkorrektur ohne Urheber: geaendert_von fehlt.'
      USING HINT = 'Die Anwendung muss den handelnden Benutzer mitgeben '
                   '(personal_arbeitszeiten.geaendert_von).';
  END IF;

  IF OLD.start_zeit IS DISTINCT FROM NEW.start_zeit THEN
    INSERT INTO personal_zeitkorrekturen (organization_id, arbeitszeit_id, caregiver_id, feld, alter_wert, neuer_wert, grund, korrigiert_von)
    VALUES (NEW.organization_id, NEW.id, NEW.caregiver_id, 'start_zeit', OLD.start_zeit::text, NEW.start_zeit::text, COALESCE(NEW.bemerkung, 'Korrektur'), v_akteur);
  END IF;

  IF OLD.end_zeit IS DISTINCT FROM NEW.end_zeit THEN
    INSERT INTO personal_zeitkorrekturen (organization_id, arbeitszeit_id, caregiver_id, feld, alter_wert, neuer_wert, grund, korrigiert_von)
    VALUES (NEW.organization_id, NEW.id, NEW.caregiver_id, 'end_zeit', OLD.end_zeit::text, NEW.end_zeit::text, COALESCE(NEW.bemerkung, 'Korrektur'), v_akteur);
  END IF;

  IF OLD.pause_minuten IS DISTINCT FROM NEW.pause_minuten THEN
    INSERT INTO personal_zeitkorrekturen (organization_id, arbeitszeit_id, caregiver_id, feld, alter_wert, neuer_wert, grund, korrigiert_von)
    VALUES (NEW.organization_id, NEW.id, NEW.caregiver_id, 'pause_minuten', OLD.pause_minuten::text, NEW.pause_minuten::text, COALESCE(NEW.bemerkung, 'Korrektur'), v_akteur);
  END IF;

  IF OLD.ist_minuten IS DISTINCT FROM NEW.ist_minuten THEN
    INSERT INTO personal_zeitkorrekturen (organization_id, arbeitszeit_id, caregiver_id, feld, alter_wert, neuer_wert, grund, korrigiert_von)
    VALUES (NEW.organization_id, NEW.id, NEW.caregiver_id, 'ist_minuten', OLD.ist_minuten::text, NEW.ist_minuten::text, COALESCE(NEW.bemerkung, 'Korrektur'), v_akteur);
  END IF;

  -- Unveraendert aus der Vorfassung: eine bereits bestaetigte Zeit gilt nach
  -- einer Zeitaenderung als korrigiert. Eine frisch erfasste bleibt erfasst.
  IF OLD.status NOT IN ('erfasst') AND v_zeit_geaendert THEN
    NEW.status := 'korrigiert';
  END IF;

  RETURN NEW;
END;
$function$;

-- ── BEFUND 3: Kaskade durchlassen, Direktloeschung weiter abweisen ─────────
CREATE OR REPLACE FUNCTION public.prevent_zeitkorrektur_edit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- Kaskade von der Arbeitszeit: die Elternzeile ist bereits weg.
    -- Durchlassen — sonst blockiert das Protokoll das Loeschen der Zeile,
    -- zu der es gehoert (und ueber caregivers auch das des Mitarbeiters).
    IF NOT EXISTS (
      SELECT 1 FROM public.personal_arbeitszeiten WHERE id = OLD.arbeitszeit_id
    ) THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION
      'Zeitkorrekturen sind unveränderlich (Revisionssicherheit). '
      'Ein Eintrag verschwindet nur zusammen mit der Arbeitszeit, zu der er gehört.';
  END IF;

  RAISE EXCEPTION 'Zeitkorrekturen sind unveränderlich (Revisionssicherheit).';
END;
$function$;

COMMIT;
