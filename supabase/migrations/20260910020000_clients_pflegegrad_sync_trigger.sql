-- ════════════════════════════════════════════════════════════════════════════
-- Migration: care_level und pflegegrad auf clients synchron halten
-- Datum:     2026-08-14  (M-3 aus dem Abschlussbericht, Ursache von H-2)
--
-- BEFUND:
--   `clients` fuehrt den Pflegegrad in zwei Spalten:
--     care_level  integer                              — fuehrend
--     pflegegrad  integer CHECK (pflegegrad BETWEEN 1 AND 5)  — nachgeordnet
--   Kein Trigger haelt sie synchron. Ob beide stimmen, haengt allein daran, ob
--   der jeweilige Schreibweg im Anwendungscode daran gedacht hat. Die
--   Eingabemaske und die Pflegegrad-Route tun es; jeder direkte PostgREST-
--   Schreibvorgang, jeder Import und jede kuenftige Route muessen es erneut
--   tun. Das ist die Ursache von H-2 gewesen: die Datenbank-VIEW
--   public.pflege_uebersicht liest `pflegegrad` direkt und zeigte bei allen
--   Bestandskunden „—", obwohl in care_level ein Grad stand. Der Backfill
--   (20260907000000) hat den Bestand geheilt, die Ursache aber nicht.
--
-- FIX: BEFORE INSERT OR UPDATE-Trigger, der beide Richtungen abdeckt.
--   Bei Konflikt gewinnt care_level — das ist die dokumentierte fuehrende
--   Spalte (lib/clients/pflegegrad.ts, pflegegradVon()).
--
-- ── WERTEBEREICH (wichtig, sonst bricht der Trigger Schreibwege) ────────────
--   care_level hat KEINEN Check-Constraint, pflegegrad schon (1..5).
--   Ein blindes `NEW.pflegegrad := NEW.care_level` wuerde deshalb bei
--   care_level = 0 („kein Pflegegrad") oder einem Tippfehler wie 6 den
--   Constraint verletzen und den gesamten INSERT/UPDATE scheitern lassen —
--   der Trigger wuerde also Klientenanlagen kaputtmachen, die vorher liefen.
--   Deshalb: Werte ausserhalb 1..5 werden nach pflegegrad als NULL
--   uebernommen (NULL heisst dort „kein Pflegegrad"). care_level selbst wird
--   nie beschnitten — die fuehrende Spalte behaelt, was eingetragen wurde.
--
-- Der Trigger ersetzt lib/clients/pflegegrad.ts NICHT. Die Lesefunktion bleibt
-- richtig, solange es zwei Spalten gibt; sie deckt zusaetzlich Bestandszeilen
-- ab, die vor dem Apply dieser Migration geschrieben wurden.
--
-- Rollback: 20260910020001_rollback_clients_pflegegrad_sync_trigger.sql
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- Hilfsfunktion: haelt den Wertebereich von pflegegrad ein (CHECK 1..5).
-- IMMUTABLE, damit sie auch in der Backfill-UPDATE-Klausel unten billig ist.
CREATE OR REPLACE FUNCTION public.pflegegrad_aus_care_level(p_care_level integer)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
           WHEN p_care_level BETWEEN 1 AND 5 THEN p_care_level
           ELSE NULL
         END;
$$;

COMMENT ON FUNCTION public.pflegegrad_aus_care_level(integer) IS
  'Bildet care_level auf den zulaessigen Wertebereich von clients.pflegegrad '
  '(CHECK 1..5) ab. Werte ausserhalb (z. B. 0 = kein Pflegegrad) werden NULL, '
  'damit der Sync-Trigger keinen Constraint-Verstoss erzeugt.';

-- SECURITY INVOKER (Default) mit Absicht: die Funktion greift ausschliesslich
-- auf NEW/OLD zu und braucht keine fremden Rechte. Ein SECURITY DEFINER waere
-- hier zusaetzliche Angriffsflaeche ohne Gegenwert. search_path wird trotzdem
-- gesetzt.
CREATE OR REPLACE FUNCTION public.sync_clients_pflegegrad()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_care_geaendert BOOLEAN;
  v_pfg_geaendert  BOOLEAN;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.care_level IS NOT NULL THEN
      -- care_level fuehrt: bei Konflikt oder leerem pflegegrad gewinnt sie.
      IF NEW.pflegegrad IS DISTINCT FROM NEW.care_level THEN
        NEW.pflegegrad := public.pflegegrad_aus_care_level(NEW.care_level);
      END IF;
    ELSIF NEW.pflegegrad IS NOT NULL THEN
      -- Nur der nachgeordnete Wert kam an → fuehrende Spalte nachziehen.
      NEW.care_level := NEW.pflegegrad;
    END IF;

    RETURN NEW;
  END IF;

  -- UPDATE: entscheidend ist, welche Spalte dieser Schreibvorgang angefasst hat.
  v_care_geaendert := NEW.care_level IS DISTINCT FROM OLD.care_level;
  v_pfg_geaendert  := NEW.pflegegrad IS DISTINCT FROM OLD.pflegegrad;

  IF v_care_geaendert AND NOT v_pfg_geaendert THEN
    NEW.pflegegrad := public.pflegegrad_aus_care_level(NEW.care_level);
  ELSIF v_pfg_geaendert AND NOT v_care_geaendert THEN
    NEW.care_level := NEW.pflegegrad;
  ELSIF v_care_geaendert AND v_pfg_geaendert
        AND NEW.pflegegrad IS DISTINCT FROM NEW.care_level THEN
    -- Beide gleichzeitig auf unterschiedliche Werte gesetzt: care_level fuehrt.
    NEW.pflegegrad := public.pflegegrad_aus_care_level(NEW.care_level);
  END IF;
  -- Sonst: nichts angefasst oder beide auf denselben Wert → unveraendert
  -- durchlassen. Bestehende Abweichungen werden bei unbeteiligten Updates
  -- bewusst NICHT stillschweigend geheilt; dafuer gibt es den Backfill unten.

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.sync_clients_pflegegrad() IS
  'Haelt clients.care_level und clients.pflegegrad synchron. Bidirektional; '
  'bei Konflikt fuehrt care_level (siehe lib/clients/pflegegrad.ts).';

DROP TRIGGER IF EXISTS trg_sync_clients_pflegegrad ON public.clients;
CREATE TRIGGER trg_sync_clients_pflegegrad
  BEFORE INSERT OR UPDATE OF care_level, pflegegrad ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.sync_clients_pflegegrad();

-- ─────────────────────────────────────────────────────────────────────
-- Backfill: bestehende Abweichungen einmalig angleichen
-- (Live am 14.08.2026: 0 betroffene Zeilen — der Backfill 20260907000000
--  hat die eine Richtung bereits erledigt. Hier idempotent und in BEIDE
--  Richtungen, damit die Migration auf jeder Umgebung denselben Zustand
--  herstellt.)
-- ─────────────────────────────────────────────────────────────────────

-- a) fuehrende Spalte vorhanden → nachgeordnete angleichen
UPDATE public.clients
   SET pflegegrad = public.pflegegrad_aus_care_level(care_level)
 WHERE care_level IS NOT NULL
   AND pflegegrad IS DISTINCT FROM public.pflegegrad_aus_care_level(care_level);

-- b) nur die nachgeordnete Spalte gefuellt → fuehrende nachziehen
UPDATE public.clients
   SET care_level = pflegegrad
 WHERE care_level IS NULL
   AND pflegegrad IS NOT NULL;

COMMIT;

-- ════════════════════════════════════════════════════════════════════
-- VERIFIKATION nach dem Apply (manuell):
--
--   a) keine Abweichung mehr im Bestand:
--      SELECT count(*) FROM clients
--       WHERE care_level IS DISTINCT FROM pflegegrad
--         AND NOT (care_level NOT BETWEEN 1 AND 5 AND pflegegrad IS NULL);
--      → erwartet 0
--
--   b) Schreiben nur einer Spalte zieht die andere nach:
--      UPDATE clients SET care_level = 4 WHERE id = '…';
--      SELECT care_level, pflegegrad FROM clients WHERE id = '…';  → 4 / 4
--      UPDATE clients SET pflegegrad = 3 WHERE id = '…';
--      SELECT care_level, pflegegrad FROM clients WHERE id = '…';  → 3 / 3
--
--   c) care_level ausserhalb 1..5 bricht nichts:
--      UPDATE clients SET care_level = 0 WHERE id = '…';
--      → erfolgreich, pflegegrad wird NULL
-- ════════════════════════════════════════════════════════════════════
