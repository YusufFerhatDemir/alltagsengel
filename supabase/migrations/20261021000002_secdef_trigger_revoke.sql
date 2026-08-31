-- ═══════════════════════════════════════════════════════════════════════════
-- SECURITY-DEFINER-Triggerfunktionen: EXECUTE von PUBLIC/anon/authenticated
-- zurueckziehen
--
-- BEFUND (verify:perimeter, Pruefung N2, 31.08.2026)
--
--   funktionen=381  anon_ausfuehrbar=249  secdef_und_anon=6
--
-- Sechs SECURITY-DEFINER-Funktionen waren fuer `anon` ausfuehrbar. Sie sind
-- nicht durch einen Fehler entstanden, sondern durch die Vorgabe von
-- Postgres: JEDE neue Funktion in `public` bekommt EXECUTE fuer PUBLIC,
-- und PUBLIC schliesst anon ein. Wer eine Funktion anlegt und nichts
-- weiter tut, hat sie veroeffentlicht (siehe Befund „SECDEF-RPCs &
-- Default-Privileges"). Genau deshalb macht die Standortfreigabe-Migration
-- 20261020000000 fuer ihre drei Triggerfunktionen ein ausdrueckliches
-- REVOKE — die aelteren Migrationen taten das nicht.
--
-- ── WIE SCHLIMM IST ES? EHRLICH: NICHT SEHR ───────────────────────────────
--
-- Alle sechs geben `trigger` zurueck und nehmen keine Argumente:
--
--   arbzg_pruefung_ist()                  Arbeitszeit
--   pflege_evaluation_plan_in_kraft()     Pflegeprozess / Evaluation
--   pflege_evaluation_unveraenderlich()   dito
--   pflege_evaluation_wiedervorlage()     dito
--   security_audit_auth_anmeldung()       Sicherheitsspur
--   security_audit_log_unveraenderlich()  dito
--
-- PostgREST stellt Funktionen mit Rueckgabetyp `trigger` gar nicht als RPC
-- bereit, und Postgres verweigert den Direktaufruf ohnehin
-- („trigger functions can only be called as triggers"). Ueber die
-- oeffentliche Schnittstelle war hier also nichts aufrufbar.
--
-- ── WARUM DANN UEBERHAUPT ─────────────────────────────────────────────────
--
-- Zwei Gruende, und der zweite ist der wichtigere:
--
--  1. Tiefenstaffelung. Der Schutz haengt sonst allein daran, dass
--     PostgREST diesen Rueckgabetyp heute nicht bedient. Das ist die
--     Eigenschaft eines fremden Werkzeugs, keine Zusage unseres Schemas.
--
--  2. Die Pruefung soll scharf bleiben. N2 zaehlt SECDEF-Funktionen, die
--     anon ausfuehren darf. Solange dort dauerhaft „6" steht, verschwindet
--     die siebte — eine mit echten Argumenten und echtem Schaden — im
--     Rauschen. Eine Pruefung, die immer rot ist, wird nicht mehr gelesen.
--     Nach dieser Migration steht dort 0, und jede Abweichung ist ein
--     Befund.
--
-- ── ANWENDEN ──────────────────────────────────────────────────────────────
-- NUR im Supabase-SQL-Editor als `postgres`. Ueber den Dienstschluessel
-- meldet ein REVOKE HTTP 204 OHNE Wirkung (Befund „REVOKE braucht
-- Owner-Rechte") — der Lauf saehe erfolgreich aus und haette nichts getan.
-- Nach dem Anwenden `npm run verify:perimeter` starten; N2 muss auf
-- secdef_und_anon=0 stehen.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  f record;
  anzahl integer := 0;
BEGIN
  -- Bewusst ueber den Katalog statt sechs fest verdrahteter Namen: kommt
  -- eine siebte SECDEF-Triggerfunktion dazu, faengt diese Migration beim
  -- erneuten Anwenden auch sie ein. Fest verdrahtete Namen waeren beim
  -- naechsten Mal schon wieder unvollstaendig.
  FOR f IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND p.prorettype = 'pg_catalog.trigger'::regtype
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', f.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', f.sig);
    anzahl := anzahl + 1;
  END LOOP;

  RAISE NOTICE 'SECDEF-Triggerfunktionen bereinigt: %', anzahl;
END $$;

-- Gegenprobe im selben Lauf. Bleibt etwas uebrig, ist das Ergebnis nicht
-- das, was der Kopf verspricht — dann soll die Migration scheitern statt
-- still einen Teilzustand zu hinterlassen.
DO $$
DECLARE
  rest integer;
BEGIN
  SELECT count(*) INTO rest
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prosecdef
    AND has_function_privilege('anon', p.oid, 'EXECUTE');

  IF rest > 0 THEN
    RAISE EXCEPTION
      'Nach dem REVOKE sind noch % SECURITY-DEFINER-Funktionen fuer anon ausfuehrbar. '
      'Diese Migration deckt nur Triggerfunktionen ab — die uebrigen sind aufrufbare '
      'RPCs und muessen einzeln geprueft werden (welche: siehe verify:perimeter N2).', rest;
  END IF;
END $$;
