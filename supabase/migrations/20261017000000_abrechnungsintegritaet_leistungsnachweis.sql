-- ═══════════════════════════════════════════════════════════════════════
-- Track 12: Abrechnung & Finanzfluesse — Integritaet des Leistungsnachweises
--
-- NICHT ANGEWENDET. Diese Datei ist eingecheckt und wartet auf die
-- manuelle Ausfuehrung im SQL-Editor (DDL ueber den Dienstschluessel wird
-- live mit 42501 abgewiesen). Rollback: 20261017000001.
--
-- ─────────────────────────────────────────────────────────────────────
-- BEFUND B2 (P1) — "unterschrieben" ohne Unterschrift, an der Datenbank
-- ─────────────────────────────────────────────────────────────────────
-- Die Unterschriftspflicht wird bisher nur im Anwendungscode durchgesetzt
-- (lib/leistungsnachweis/nachweis-regeln.ts::assertKlientenUnterschrift auf
-- dem Weg /api/leistungsnachweis/crud). Daneben liegt ein zweiter Weg, der
-- diese Route nicht benutzt:
--
--   * `authenticated` hat live UPDATE auf public.service_records
--     (has_table_privilege = true, ohne Spalteneinschraenkung), und
--   * die Policy `sr_engel_own` ist FOR ALL, PERMISSIVE, mit
--     USING/CHECK = caregiver_id IN (SELECT eigene_caregiver_ids()) OR is_admin()
--
-- Permissive Policies werden ODER-verknuepft. Die eng gefasste Policy
-- `service_records_caregiver_update` (nur status IN ('draft','incomplete'))
-- hat deshalb KEINE einschraenkende Wirkung — `sr_engel_own` laesst
-- denselben Schreibvorgang in jedem Status durch.
--
-- Eine Pflegekraft kann damit auf ihrer eigenen Zeile
--     PATCH /rest/v1/service_records?id=eq.<eigene Zeile>
--     { "proof_status": "UNTERSCHRIEBEN" }
-- setzen. Danach:
--   1. sync_service_record_status hebt `status` auf 'signed' → abrechenbar.
--   2. compute_signature_hash laeuft NICHT (verlangt client_signed_at),
--      also bleibt signature_hash NULL und is_locked FALSE.
--   3. create_invoice_draft_atomic zaehlt einen Nachweis nur dann als
--      unsigniert, wenn proof_status <> 'UNTERSCHRIEBEN' UND
--      signature_hash IS NULL — eine ODER-Annahme. Der Statuswert allein
--      genuegt der Sperre.
--
-- Ueber POST /api/billing/auto-invoice (Auth laesst ausdruecklich auch die
-- Pflegekraft mit Native-Bearer-Token zu) laeuft die Kette bis zur fertigen
-- Rechnung durch, ohne dass je ein Kunde unterschrieben hat.
--
-- BESTANDSLAGE, live am 28.08.2026 gemessen: KEINE der 30 Zeilen traegt
-- signature_hash oder client_signed_at, is_locked ist ueberall FALSE — auch
-- auf den 15 Zeilen mit status='invoiced'. Der Manipulationsschutz
-- `prevent_locked_record_change` hat in dieser Datenbank also noch nie
-- gegriffen. Und weil proof_status auf ALLEN Zeilen 'ENTWURF' ist,
-- verletzt der neue Trigger unten heute NULL Zeilen — er ist reine
-- Vorsorge, kein Eingriff in den Bestand.
--
-- ABHILFE: die Frage an der QUELLE stellen statt am Tor. Wer den Nachweis
-- auf "unterschrieben" setzt, muss einen Beleg vorweisen. Bewusst NICHT
-- ueber signature_hash geprueft: den setzt compute_signature_hash selbst,
-- und die Ausfuehrungsreihenfolge zweier BEFORE-Trigger haengt an ihren
-- Namen. Geprueft werden die Belege, die von aussen kommen.
--
-- ─────────────────────────────────────────────────────────────────────
-- BEFUND B5 (P1) — negative Einsatzdauer
-- ─────────────────────────────────────────────────────────────────────
-- duration_minutes ist eine GENERATED-Spalte:
--     (EXTRACT(epoch FROM (end_time - start_time)))::integer / 60
-- und genau dieser Wert bestimmt in create_invoice_draft_atomic den
-- Rechnungsbetrag. Es gibt live weder einen CHECK noch eine Pruefung im
-- Anwendungscode, die end_time > start_time verlangt. Ein Nachtdienst von
-- 22:00 bis 06:00 ergibt duration_minutes = -960 und damit eine
-- Rechnungsposition mit NEGATIVEM Betrag: sie zieht Geld ab, statt es zu
-- fordern. Nachtzuschlaege sind in billing_tariffs ausdruecklich vorgesehen
-- (nacht_von, nacht_bis, zuschlag_nacht_prozent) — der Einsatz ueber
-- Mitternacht ist ein VORGESEHENER Fall, kein Ausreisser.
--
-- Dass die richtige Antwort im Repo bekannt ist, steht in der Datenbank:
-- angel_availability traegt den CHECK `angel_availability_zeitfenster_gueltig`.
-- Fuer service_records fehlte das Gegenstueck.
--
-- Live verletzt heute KEINE der 30 Zeilen die neue Bedingung
-- (end_time < start_time: 0, NULL-Zeiten: 0) — der Constraint laesst sich
-- ohne Bereinigung anlegen.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- 1. Unterschriftsbeleg erzwingen
-- ─────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.enforce_unterschrift_beleg()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_beleg BOOLEAN;
BEGIN
  -- Nur die beiden Zustaende, die "es liegt eine Unterschrift vor" behaupten.
  IF NEW.proof_status IS NULL OR NEW.proof_status NOT IN ('UNTERSCHRIEBEN', 'ABGERECHNET') THEN
    RETURN NEW;
  END IF;

  -- Trug die Zeile den Anspruch schon vorher, ist das hier kein neuer
  -- Vorgang. Ein Bestandssatz aus der Zeit vor dieser Regel soll nicht
  -- bei jedem beliebigen spaeteren UPDATE (etwa einer Notiz) blockieren.
  IF TG_OP = 'UPDATE'
     AND OLD.proof_status IN ('UNTERSCHRIEBEN', 'ABGERECHNET')
     AND NEW.proof_status = OLD.proof_status THEN
    RETURN NEW;
  END IF;

  -- Belege, die von AUSSEN kommen. signature_hash steht bewusst nicht in
  -- dieser Liste: den setzt compute_signature_hash selbst, und welcher der
  -- beiden BEFORE-Trigger zuerst laeuft, entscheidet die alphabetische
  -- Reihenfolge ihrer Namen — eine Pruefung darauf waere von einer
  -- Umbenennung abhaengig.
  v_beleg := (
    NEW.client_signed_at IS NOT NULL
    AND COALESCE(BTRIM(NEW.client_signature), '') NOT IN ('', 'false')
  ) OR EXISTS (
    SELECT 1
      FROM public.service_signatures s
     WHERE s.service_record_id = NEW.id
       AND s.signer_role = 'client'
  );

  IF NOT v_beleg THEN
    RAISE EXCEPTION
      'Leistungsnachweis % kann nicht auf "%" gesetzt werden: es liegt kein '
      'Unterschriftsbeleg vor (weder client_signature mit client_signed_at '
      'noch eine Zeile in service_signatures mit signer_role=''client''). '
      'Der Statuswert allein ist eine Behauptung ueber die Unterschrift, '
      'kein Nachweis — und er macht den Nachweis abrechenbar.',
      NEW.id, NEW.proof_status
      USING ERRCODE = 'check_violation',
            HINT = 'Unterschrift ueber /api/leistungsnachweis/crud (action: sign) erfassen.';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_unterschrift_beleg() IS
  'Track 12/B2: verlangt einen Unterschriftsbeleg, bevor ein Leistungsnachweis '
  'als unterschrieben gilt. Der Statuswert allein machte ihn sonst abrechenbar.';

-- Name mit "a_" vorn, damit der Trigger VOR trg_compute_signature_hash und
-- trg_sync_record_status laeuft: die Pruefung soll den Eingabewert sehen,
-- nicht das, was andere Trigger daraus schon gemacht haben.
DROP TRIGGER IF EXISTS trg_a_unterschrift_beleg ON public.service_records;
CREATE TRIGGER trg_a_unterschrift_beleg
  BEFORE INSERT OR UPDATE ON public.service_records
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_unterschrift_beleg();

-- ─────────────────────────────────────────────────────────────────────
-- 2. Einsatzdauer darf nicht negativ sein
-- ─────────────────────────────────────────────────────────────────────
-- NULL-Zeiten passieren bewusst: ein CHECK ist nur verletzt, wenn er FALSE
-- ergibt. Ein Nachweis ohne Zeiten ist ein anderes Problem (und wird an den
-- Schreibwegen abgefangen), nicht dieses.

ALTER TABLE public.service_records
  DROP CONSTRAINT IF EXISTS service_records_zeitfenster_gueltig;

ALTER TABLE public.service_records
  ADD CONSTRAINT service_records_zeitfenster_gueltig
  CHECK (start_time IS NULL OR end_time IS NULL OR end_time > start_time);

COMMENT ON CONSTRAINT service_records_zeitfenster_gueltig ON public.service_records IS
  'Track 12/B5: duration_minutes ist generiert aus (end_time - start_time). '
  'Ein Ende vor dem Beginn ergaebe eine negative Dauer und damit eine '
  'Rechnungsposition, die Geld abzieht. Einsaetze ueber Mitternacht sind als '
  'zwei Nachweise zu erfassen. Gegenstueck zu angel_availability_zeitfenster_gueltig.';

-- ─────────────────────────────────────────────────────────────────────
-- 3. Die FOR-ALL-Policy, die alle engeren Policies aufhebt
-- ─────────────────────────────────────────────────────────────────────
-- `sr_engel_own` deckte SELECT, INSERT, UPDATE und DELETE in einem ab und
-- machte damit die drei daneben liegenden, richtig gefassten Policies
-- wirkungslos. Was der Engel braucht, steht bereits einzeln da:
--
--   service_records_caregiver_read    SELECT  eigene Zeilen
--   service_records_caregiver_insert  INSERT  eigene Zeilen, nur status='draft'
--   service_records_caregiver_update  UPDATE  eigene Zeilen, nur draft/incomplete
--   service_records_admin_all         ALL     is_admin()
--
-- Ein DELETE-Recht fuer die Pflegekraft entfaellt damit. Das ist die Absicht:
-- ein Leistungsnachweis ist ein Beleg (§ 630f BGB, § 147 AO) und wird
-- storniert, nicht geloescht — genau die Unterscheidung, die
-- assertStornierbar im Anwendungscode schon trifft.
DROP POLICY IF EXISTS "sr_engel_own" ON public.service_records;

COMMIT;
