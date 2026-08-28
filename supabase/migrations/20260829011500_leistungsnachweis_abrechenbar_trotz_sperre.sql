-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Der Manipulationsschutz blockiert die Abrechnung — behoben
--
-- BEFUND (P0, live nachgemessen am 29.08.2026):
--   Ein ordnungsgemaess unterschriebener Leistungsnachweis kann NIE
--   abgerechnet werden. Die Kette Unterschrift → Rechnung ist auf
--   Datenbankebene geschlossen.
--
--   Drei Tatsachen, jede fuer sich richtig, treffen aufeinander:
--
--   1. `compute_signature_hash` setzt bei der Unterschrift
--      `is_locked = true` (Migration 20260814010000). Das ist der
--      Manipulationsschutz und soll genau so sein.
--
--   2. `prevent_locked_record_change` weist auf einer gesperrten Zeile
--      JEDE Aenderung ab. Erlaubt sind nur zwei Ausnahmen: ein Storno
--      (`proof_status = 'STORNIERT'`) und das Entsperren durch die
--      Administration ueber `auth.uid()`.
--
--   3. `create_invoice_draft_atomic` setzt nach dem Anlegen der Rechnung
--      `service_records.status = 'invoiced'` — und das ist eine Aenderung
--      an genau dieser Zeile. Live aus pg_get_functiondef gelesen:
--
--        UPDATE public.service_records
--           SET status = 'invoiced', updated_at = v_now
--         WHERE …
--
--   Ergebnis: der Trigger wirft „Leistungsnachweis ist gesperrt --
--   Aenderungen sind nicht mehr moeglich.", die RPC ist ATOMAR, also
--   rollt die gesamte Rechnungserstellung zurueck. Es entsteht keine
--   Rechnung, keine Position, kein Teilerfolg.
--
--   Und die zweite Haelfte der Klemme: Migration 20261017000000 verlangt
--   fuer die Rechnung ausdruecklich eine Unterschrift. Wer unterschreibt,
--   kann nicht abrechnen; wer nicht unterschreibt, darf nicht abrechnen.
--   Der Geldweg ist an beiden Enden zu.
--
--   WARUM DAS NIE AUFGEFALLEN IST: die beiden Wege sind sich live nie
--   begegnet. Befund I-5 der COMPLETION-MATRIX haelt fest, dass von 30
--   `service_records` KEINER `signature_hash` oder `client_signed_at`
--   traegt und `is_locked` ueberall `false` steht — auch auf den 15
--   bereits abgerechneten. Die 15 stammen aus der Zeit VOR der Sperre.
--   Gefunden wurde die Klemme erst, als die Vollkette des Pflegebetriebs
--   zum ersten Mal durchgefahren wurde
--   (__tests__/e2e/pflegebetrieb-vollkette-pglite.test.ts).
--
-- DIE BEHEBUNG IST BEWUSST ENG:
--   Erlaubt wird genau EIN Uebergang und sonst nichts — `status` von
--   `signed`/`complete` auf `invoiced`. Alles andere an der Zeile muss
--   dabei UNVERAENDERT bleiben; geprueft wird das nicht Spalte fuer
--   Spalte, sondern als Ganzes ueber `to_jsonb(NEW) - <erlaubte Felder>
--   = to_jsonb(OLD) - <erlaubte Felder>`.
--
--   Der Unterschied ist wichtig: eine Aufzaehlung verbotener Spalten
--   vergisst jede Spalte, die spaeter dazukommt. Der Vergleich ueber das
--   ganze Zeilenabbild kennt sie automatisch — wer kuenftig eine Spalte
--   ergaenzt, bekommt sie geschuetzt, ohne diese Funktion anzufassen.
--
--   Das ist KEINE Aufweichung des Manipulationsschutzes: `status =
--   'invoiced'` haelt fest, DASS der unveraenderte Nachweis abgerechnet
--   wurde. Zeiten, Dauer, Leistungsart, Unterschrift, Hash und
--   `is_locked` bleiben tabu — und ein Rueckweg von `invoiced` ebenfalls.
--
-- VERWORFENE ALTERNATIVEN:
--   • Den Trigger auf `service_records` fuer die RPC abschalten
--     (`session_replication_role`): damit faellt der Schutz fuer die
--     Dauer der Transaktion KOMPLETT, auch fuer alles andere, was die
--     RPC anfasst. Ein Riegel, der sich fuer einen Aufrufer ganz
--     ausschaltet, ist kein Riegel.
--   • Die RPC den Status nicht setzen lassen: dann bliebe der Nachweis
--     auf `signed` und die naechste Rechnung nimmt ihn erneut mit —
--     Doppelabrechnung statt gar keiner.
--   • Vor der Rechnung entsperren und danach wieder sperren: das
--     Entsperren haengt an `auth.uid()`, und das ist unter dem
--     Dienstschluessel NULL (siehe 20260829005500). Es waere ausserdem
--     ein Fenster, in dem die Zeile ungeschuetzt ist.
--
-- Datum:     2026-08-29
-- Projekt:   Alltagsengel UG
-- IDEMPOTENT.
-- Rollback:  20260829011501_rollback_leistungsnachweis_abrechenbar_trotz_sperre.sql
-- STATUS:    EINGECHECKT — NICHT ANGEWENDET (DDL laeuft ueber den
--            Dienstschluessel als 42501 auf). Bis zur Anwendung bleibt
--            die Kette Unterschrift → Rechnung geschlossen; das trifft
--            heute niemanden, weil live kein Nachweis unterschrieben ist
--            (Befund I-5), und JEDEN, sobald der erste es wird.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION public.prevent_locked_record_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  -- Felder, die sich beim Abrechnen aendern DUERFEN. Alles andere wird
  -- unten als Ganzes verglichen.
  v_alt jsonb;
  v_neu jsonb;
BEGIN
  IF OLD.is_locked = true THEN
    -- (1) Storno — unveraendert aus der Vorfassung.
    IF NEW.proof_status = 'STORNIERT' THEN
      RETURN NEW;
    END IF;

    -- (2) Entsperren durch die Administration — unveraendert.
    IF NEW.is_locked IS DISTINCT FROM OLD.is_locked AND NEW.is_locked = false THEN
      IF EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','superadmin')) THEN
        RETURN NEW;
      END IF;
    END IF;

    -- (3) NEU: die Abrechnung darf den unveraenderten Nachweis als
    --     abgerechnet kennzeichnen. Nur vorwaerts, nur dieser eine Wert.
    IF NEW.status = 'invoiced' AND OLD.status IN ('signed', 'complete') THEN
      v_alt := to_jsonb(OLD) - 'status' - 'updated_at';
      v_neu := to_jsonb(NEW) - 'status' - 'updated_at';
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
  'Manipulationsschutz fuer unterschriebene Leistungsnachweise. Erlaubt drei '
  'Ausnahmen: Storno, Entsperren durch die Administration, und die '
  'Kennzeichnung als abgerechnet (status -> invoiced) OHNE jede weitere '
  'Aenderung an der Zeile.';

-- Die Funktion ist SECURITY DEFINER; die Grants aus
-- 20260823010000_secdef_trigger_revoke.sql bleiben durch CREATE OR REPLACE
-- erhalten. Sicherheitshalber noch einmal ausdruecklich — der Block ist
-- idempotent und braucht Owner-Rechte (SQL-Editor).
DO $revoke$
DECLARE sig text;
BEGIN
  FOR sig IN
    SELECT p.oid::regprocedure::text
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prosecdef
       AND p.proname = 'prevent_locked_record_change'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', sig);
  END LOOP;
END $revoke$;

COMMIT;
