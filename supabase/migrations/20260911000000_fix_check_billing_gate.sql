-- ═══════════════════════════════════════════════════════════════════════════
-- P0-1: check_billing_gate() liest eine Spalte, die es nicht gibt
-- Datum:  2026-08-14
-- ═══════════════════════════════════════════════════════════════════════════
--
-- BEFUND
--   supabase/migrations/20260808200000_einsatzplanung_leistungsnachweise.sql
--   definiert den BEFORE-INSERT/UPDATE-Trigger trg_check_billing_gate auf
--   public.service_records. Die Trigger-Funktion liest:
--
--       SELECT (s.kasse_status = 'ANERKANNT') INTO v_kasse_aktiv
--         FROM public.state_settings s
--        WHERE s.bundesland = v_bl;
--
--   public.state_settings hat KEINE Spalte kasse_status. Die Tabelle wurde in
--   20260808100000_expansion_deutschland.sql angelegt und führt statt dessen:
--       status                 TEXT  ('VORBEREITUNG' … 'ANERKANNT' | 'ABGELEHNT')
--       insurance_enabled      BOOLEAN   -- Hauptschalter Kassenabrechnung
--       kassentarife_enabled   BOOLEAN   -- fünf abhängige Kassenmodule,
--       budgetpruefung_enabled BOOLEAN   -- per CHECK an insurance_enabled
--       kassenrechnung_enabled BOOLEAN   -- gebunden, dieses wiederum per CHECK
--       elnw_enabled           BOOLEAN   -- an status='ANERKANNT' + hinterlegtem
--       dakota_export_enabled  BOOLEAN   -- Anerkennungsbescheid
--
--   Folge: JEDER INSERT/UPDATE auf service_records mit
--   billing_type <> 'PRIVAT' bricht mit SQLSTATE 42703 ab und wird
--   zurückgerollt. Der gesamte Kassen-Leistungsnachweis ist tot. Live ist das
--   bisher nicht aufgefallen, weil alle erfassten Nachweise billing_type
--   'PRIVAT' tragen (Kassenabrechnung ist in keinem Bundesland freigeschaltet).
--
-- ZWEITER, STILLER FEHLER IN DERSELBEN FUNKTION
--   Die Abfrage filtert nur auf bundesland, NICHT auf organization_id.
--   state_settings hat UNIQUE (organization_id, bundesland) — pro Bundesland
--   existiert also eine Zeile JE MANDANT (live: 6 Organisationen). Sobald ein
--   zweiter Mandant dasselbe Bundesland führt, liefert das SELECT ... INTO
--   einen beliebigen Treffer: die Freischaltung eines fremden Mandanten könnte
--   den eigenen Nachweis freigeben oder umgekehrt blockieren.
--
-- ABSICHT DER FUNKTION (unverändert)
--   Ein Leistungsnachweis, der über die Pflegekasse abgerechnet werden soll,
--   darf nur dann als offene Kassenforderung geführt werden, wenn die
--   Kassenabrechnung für das Bundesland des KLIENTEN und den Mandanten des
--   Klienten tatsächlich freigeschaltet ist. Sonst wird der Nachweis nicht
--   abgelehnt — er wird als
--       billing_status = 'KASSENABRECHNUNG_NOCH_NICHT_FREIGESCHALTET'
--   geparkt und bleibt nach der Anerkennung ohne Neuerfassung abrechenbar.
--   Der Nachweis selbst geht also nie verloren.
--
-- LÖSUNG
--   Die Freischaltungsfrage wird nicht erneut ausformuliert, sondern an den
--   bereits vorhandenen, fail-safe Lese-Helper public.state_flag(org, land,
--   flag) delegiert (20260808100000, Abschnitt 9). Denselben Helper benutzt
--   public.enforce_kassenrechnung_freigeschaltet() für Rechnungen — die
--   Leistungsnachweis-Ebene entscheidet damit nach exakt demselben Maßstab
--   wie die Rechnungsebene. state_flag liefert bei unbekannter Organisation,
--   unbekanntem Bundesland oder fehlender Zeile FALSE (fail-safe).
--
--   Geprüftes Flag: 'kassenrechnung'. Das ist das abhängige Modul, das über
--   den CHECK chk_kassenmodule_require_insurance zwingend insurance_enabled
--   voraussetzt, welches wiederum über chk_insurance_requires_anerkennung
--   status='ANERKANNT' UND einen hinterlegten Bescheid voraussetzt. Die
--   ursprünglich gemeinte Prüfung „kasse_status = 'ANERKANNT'" ist darin
--   vollständig enthalten und zusätzlich einzeln abschaltbar.
--
--   Mandant und Bundesland kommen aus dem KLIENTEN (clients.organization_id,
--   clients.zip_code) — nicht aus der Organisation des Schreibenden. Das ist
--   dieselbe Regel wie im B3/B4-Fix von 20260808120000/20260808120002:
--   maßgeblich ist der Wohnort des Klienten, sonst wäre nach Freischaltung
--   eines einzigen Bundeslands bundesweit abgerechnet worden.
--
-- WARUM SECURITY DEFINER (neu gegenüber der kaputten Fassung)
--   state_settings ist per RLS auf Admins der eigenen Organisation begrenzt
--   (Policy state_settings_admin_all). Eine Betreuungskraft, die ihren eigenen
--   Nachweis schreibt, sähe die Zeile nicht — der Gate hätte für sie IMMER
--   „nicht freigeschaltet" ergeben, unabhängig vom echten Stand. state_flag
--   ist selbst SECURITY DEFINER; damit die Entscheidung unabhängig vom
--   Schreibenden gleich ausfällt, wird auch die Trigger-Funktion mit fixem
--   search_path als SECURITY DEFINER geführt und EXECUTE anon/authenticated
--   entzogen (Muster aus 20260823010000_secdef_trigger_revoke.sql).
--
-- REIHENFOLGE DER TRIGGER (wichtig für NEW.bundesland)
--   Postgres feuert BEFORE-Trigger in alphabetischer Reihenfolge des
--   Triggernamens:
--       trg_check_billing_gate  <  trg_compute_signature_hash  <  trg_sr_bundesland
--   trg_sr_bundesland füllt NEW.bundesland erst NACH diesem Gate. Die Funktion
--   darf sich deshalb nicht auf NEW.bundesland verlassen und leitet das
--   Bundesland bei NULL selbst aus der Klienten-PLZ ab.
--
-- KEINE Dummy-Spalte, KEIN Workaround: state_settings bleibt unverändert.
--
-- IDEMPOTENT: reines CREATE OR REPLACE + Trigger-Neuanlage.
-- ROLLBACK:   20260911000001_rollback_fix_check_billing_gate.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION public.check_billing_gate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_org  UUID;
  v_land TEXT;
BEGIN
  -- Privatleistungen sind von der §45a-Anerkennung unabhängig.
  IF NEW.billing_type IS NULL OR NEW.billing_type = 'PRIVAT' THEN
    RETURN NEW;
  END IF;

  -- Mandant UND Bundesland stammen aus dem Klienten. NEW.bundesland ist an
  -- dieser Stelle noch NULL (trg_sr_bundesland läuft später), deshalb der
  -- eigene Fallback über die Klienten-PLZ. Grenz-PLZ ohne eindeutige
  -- Zuordnung ⇒ NULL ⇒ state_flag liefert FALSE ⇒ geparkt.
  SELECT c.organization_id,
         COALESCE(NEW.bundesland, public.eindeutiges_bundesland_fuer_plz(c.zip_code))
    INTO v_org, v_land
    FROM public.clients c
   WHERE c.id = NEW.client_id;

  IF public.state_flag(v_org, v_land, 'kassenrechnung') THEN
    -- Freigeschaltet: einen zuvor gesetzten Gate-Vermerk wieder aufheben,
    -- damit nach der Anerkennung nachbearbeitete Nachweise nicht dauerhaft
    -- geparkt bleiben. Alle anderen Werte (ZUGEORDNET, ABGERECHNET,
    -- STORNIERT) bleiben unangetastet.
    IF NEW.billing_status = 'KASSENABRECHNUNG_NOCH_NICHT_FREIGESCHALTET' THEN
      NEW.billing_status := 'OFFEN';
    END IF;
  ELSE
    -- Nicht freigeschaltet: parken statt ablehnen. Ein bereits abgerechneter
    -- oder stornierter Nachweis wird nicht zurückgesetzt.
    IF COALESCE(NEW.billing_status, 'OFFEN') NOT IN ('ABGERECHNET', 'STORNIERT') THEN
      NEW.billing_status := 'KASSENABRECHNUNG_NOCH_NICHT_FREIGESCHALTET';
    END IF;
  END IF;

  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION public.check_billing_gate IS
  'GATE: Kassen-Leistungsnachweise (billing_type <> ''PRIVAT'') werden auf '
  'billing_status=''KASSENABRECHNUNG_NOCH_NICHT_FREIGESCHALTET'' geparkt, solange '
  'fuer Mandant + Bundesland des KLIENTEN das Modul ''kassenrechnung'' nicht '
  'freigeschaltet ist. Entscheidet ueber public.state_flag() — dieselbe Quelle '
  'wie enforce_kassenrechnung_freigeschaltet(). Ersetzt die kaputte Fassung aus '
  '20260808200000, die die nicht existierende Spalte state_settings.kasse_status '
  'las (SQLSTATE 42703) und organization_id ignorierte.';

-- SECDEF-Haertung analog 20260823010000_secdef_trigger_revoke.sql:
-- Trigger-Funktionen brauchen kein EXECUTE fuer Endnutzerrollen.
REVOKE ALL ON FUNCTION public.check_billing_gate() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_billing_gate() TO service_role;

DROP TRIGGER IF EXISTS trg_check_billing_gate ON public.service_records;
CREATE TRIGGER trg_check_billing_gate
  BEFORE INSERT OR UPDATE ON public.service_records
  FOR EACH ROW EXECUTE FUNCTION public.check_billing_gate();

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFIKATION (nach Apply manuell ausführen)
--
--   -- 1. Funktion liest keine kasse_status-Spalte mehr:
--   SELECT prosrc LIKE '%kasse_status%' AS noch_kaputt
--     FROM pg_proc WHERE proname = 'check_billing_gate';
--   -- erwartet: false
--
--   -- 2. Kassen-Nachweis geht durch (statt 42703) und wird geparkt,
--   --    solange kein Bundesland freigeschaltet ist:
--   BEGIN;
--     INSERT INTO public.service_records
--       (client_id, caregiver_id, date, start_time, end_time,
--        service_type, budget_type, caregiver_initials, billing_type)
--     SELECT c.id, cg.id, current_date, '09:00', '10:00',
--            'Betreuung', 'entlastung', 'QA', '§45b'
--       FROM public.clients c, public.caregivers cg
--      LIMIT 1
--     RETURNING billing_status;
--   -- erwartet: KASSENABRECHNUNG_NOCH_NICHT_FREIGESCHALTET (kein Fehler)
--   ROLLBACK;
-- ═══════════════════════════════════════════════════════════════════════════
