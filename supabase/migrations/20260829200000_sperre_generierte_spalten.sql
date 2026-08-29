-- ════════════════════════════════════════════════════════════════════
-- Die Sperre ließ das Abrechnen weiterhin nicht durch — obwohl der Fix
-- dafür seit 20260829011500 live ist
-- ════════════════════════════════════════════════════════════════════
--
-- BEFUND (gemessen am 29.08.2026 mit `npm run verify:geldweg`, dem ersten
-- Lauf, der die Kette wirklich FAEHRT statt sie zu lesen):
--
--   Station nachweis      OK
--   Station unterschrift  OK   (signature_hash 64 hex, is_locked=true)
--   Station sperre        OK   (Betragsaenderung wird abgewiesen)
--   Station rechnung      ABBRUCH:
--     „Ein gesperrter Leistungsnachweis darf beim Abrechnen NUR den
--      Status erhalten." (SQLSTATE P0001)
--
-- Die Migration 20260829011500 hat `prevent_locked_record_change` genau um
-- diesen Ausnahmepfad ergaenzt: beim Wechsel `signed`/`complete` ->
-- `invoiced` darf sich AUSSER `status` und `updated_at` nichts aendern,
-- geprueft ueber `to_jsonb(OLD) = to_jsonb(NEW)`. Sie ist angewendet, der
-- Quelltext steht live so in `pg_proc` — und der Pfad ist trotzdem tot.
--
-- URSACHE: `service_records.duration_minutes` ist eine GENERIERTE Spalte
-- (`attgenerated = 's'`). PostgreSQL berechnet generierte Spalten ERST NACH
-- den BEFORE-Triggern. In einem BEFORE-Trigger steht deshalb
--
--     OLD.duration_minutes = 120      (der gespeicherte Wert)
--     NEW.duration_minutes = NULL     (noch nicht berechnet)
--
-- Der Vergleich findet also IMMER einen Unterschied, egal was die UPDATE-
-- Anweisung tatsaechlich setzt. Nachgestellt am 29.08.2026 an einer
-- Wegwerf-Tabelle mit genau einer generierten Spalte:
--
--     OLD.gen=10  NEW.gen=NULL  gleich_ohne_die_geaenderte_spalte=f
--
-- Bestaetigt wurde es zusaetzlich am echten Fall: auch ein gesperrter
-- Nachweis OHNE Unterschrift (dort ruehrt `compute_signature_hash` die
-- Zeile nicht an) und auch ein UPDATE, das NUR `status` setzt, laufen in
-- dieselbe Ausnahme. Es gibt keine Eingabe, mit der die Bedingung
-- erfuellbar waere.
--
-- FOLGE: die Kette Unterschrift -> Rechnung ist in der Produktion zu.
-- `create_invoice_draft_atomic` faellt beim abschliessenden UPDATE auf
-- `status = 'invoiced'` aus, und weil die RPC eine Transaktion ist, wird
-- die ganze Rechnung samt Positionen zurueckgerollt. Aufgefallen ist es
-- bisher niemandem, weil live noch KEIN Leistungsnachweis unterschrieben
-- ist (`is_locked` ist ueberall FALSE) — der Fehler wartet auf die erste
-- echte Unterschrift.
--
-- FIX: generierte Spalten aus dem Vergleich nehmen. Das reisst kein Loch:
-- eine generierte Spalte ist eine Funktion ihrer Basisspalten, und die
-- stehen weiterhin im Vergleich. Wer `start_time` veraendert, faellt
-- unveraendert auf — nur eben ueber `start_time` statt ueber die daraus
-- abgeleitete Minutenzahl.
--
-- Die Liste wird zur Laufzeit aus dem Katalog gelesen und nicht
-- fest eingetragen: sonst faellt der naechste Kollege, der eine zweite
-- generierte Spalte ergaenzt, in dieselbe Grube — und zwar wieder
-- lautlos, weil ein zu strenger Riegel keine Fehlermeldung erzeugt,
-- sondern nur eine Abrechnung, die nicht stattfindet.
--
-- GEPRUEFT, dass dasselbe Muster nirgends sonst als Riegel steht: vier
-- weitere Funktionen vergleichen OLD und NEW als Ganzes
-- (audit_service_record_change, coach_audit_trigger, trg_vpkzp_audit,
-- audit_state_settings_immer). Alle vier haengen an AFTER-Triggern — dort
-- sind generierte Spalten laengst berechnet — und sie protokollieren nur,
-- statt zu entscheiden.
--
-- STATUS: NICHT ANGEWENDET. Nur eingecheckt.
-- NACH DEM APPLY: `npm run verify:geldweg` muss 10 von 10 Stationen
-- melden. Der Lauf legt dabei nichts an: er endet immer mit RAISE
-- EXCEPTION und rollt sich damit selbst zurueck.
-- ════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION public.prevent_locked_record_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_alt         jsonb;
  v_neu         jsonb;
  v_abgeleitet  text[];
BEGIN
  IF OLD.is_locked = true THEN
    IF NEW.proof_status = 'STORNIERT' THEN
      RETURN NEW;
    END IF;

    IF NEW.is_locked IS DISTINCT FROM OLD.is_locked AND NEW.is_locked = false THEN
      IF EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','superadmin')) THEN
        RETURN NEW;
      END IF;
    END IF;

    IF NEW.status = 'invoiced' AND OLD.status IN ('signed', 'complete') THEN
      -- Generierte Spalten sind in einem BEFORE-Trigger in NEW noch NULL,
      -- in OLD aber gefuellt. Sie muessen aus dem Vergleich, sonst ist er
      -- nie erfuellbar. Siehe Kopf dieser Migration.
      SELECT coalesce(array_agg(a.attname::text), ARRAY[]::text[])
        INTO v_abgeleitet
        FROM pg_catalog.pg_attribute a
       WHERE a.attrelid = TG_RELID
         AND a.attgenerated <> ''
         AND NOT a.attisdropped;

      v_alt := to_jsonb(OLD) - 'status' - 'updated_at' - v_abgeleitet;
      v_neu := to_jsonb(NEW) - 'status' - 'updated_at' - v_abgeleitet;

      IF v_alt = v_neu THEN
        RETURN NEW;
      END IF;

      RAISE EXCEPTION
        'Ein gesperrter Leistungsnachweis darf beim Abrechnen NUR den Status erhalten.'
        USING HINT = 'Es wurde neben status noch mindestens ein weiteres Feld geaendert.';
    END IF;

    RAISE EXCEPTION 'Leistungsnachweis ist gesperrt -- Aenderungen sind nicht mehr moeglich.'
      USING HINT = 'Manipulationsschutz aktiv';
  END IF;
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.prevent_locked_record_change() IS
  'Manipulationsschutz fuer unterschriebene Leistungsnachweise. Laesst genau '
  'einen Weg offen: den Statuswechsel signed/complete -> invoiced bei sonst '
  'unveraenderter Zeile. Generierte Spalten bleiben aussen vor, weil sie in '
  'einem BEFORE-Trigger in NEW noch nicht berechnet sind (Migration '
  '20260829200000).';

COMMIT;
