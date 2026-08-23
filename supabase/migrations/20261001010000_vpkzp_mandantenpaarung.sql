-- ═══════════════════════════════════════════════════════════════════════
-- VP/KZP: client_id und organization_id muessen zusammenpassen
-- ═══════════════════════════════════════════════════════════════════════
--
-- BEFUND (Phase 4, Track 7a, Kette 8 "Mandantentrennung"):
-- vpkzp_buchungen hat zwei getrennte Fremdschluessel — einen auf
-- organizations(id), einen auf clients(id). Beide sind fuer sich erfuellt,
-- wenn beide Werte existieren. Dass der Klient auch ZU DIESEM Mandanten
-- gehoert, prueft niemand.
--
-- Folge: eine Zeile mit organization_id = A und client_id eines Klienten
-- von B wird angenommen. Der Fortschreibungs-Trigger legt daraufhin
-- unter Mandant A einen Jahresstand fuer einen fremden Klienten an. Die
-- RESTRICTIVE org_fence verhindert das NICHT — sie prueft nur die
-- organization_id der Zeile, und die ist ja A. Der Fence trennt
-- Mandanten, er prueft keine Paarungen.
--
-- Erreichbar ist das ueber jeden Weg, der eine client_id entgegennimmt
-- und die organization_id selbst setzt — also ueber den service-role-
-- Client der Anwendung, den SQL-Editor und jeden Import.
--
-- WARUM EIN TRIGGER UND KEIN FREMDSCHLUESSEL
-- Der saubere Weg waere ein zusammengesetzter Fremdschluessel auf
-- clients(id, organization_id). Der braucht dort einen UNIQUE-Index ueber
-- beide Spalten — eine Schemaaenderung an einer Kerntabelle, die jede
-- andere Beziehung mittraegt. Der Trigger erreicht dasselbe Ergebnis,
-- ohne clients anzufassen.
--
-- Rollback: 20261001010001_rollback_vpkzp_mandantenpaarung.sql
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'vpkzp_buchungen'
  ) THEN
    RAISE EXCEPTION 'VPKZP_BASIS_FEHLT: 20260926000000_vpkzp_zeitraum_budget.sql muss zuerst laufen.';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_vpkzp_mandantenpaarung()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $fn$
DECLARE
  v_org uuid;
BEGIN
  SELECT organization_id INTO v_org
    FROM public.clients
   WHERE id = NEW.client_id;

  -- Kein Klient: der Fremdschluessel faengt das ohnehin ab. Hier nichts
  -- zu entscheiden.
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Ein Klient ohne Mandanten ist Altbestand. Er wird NICHT stillschweigend
  -- der Zeile zugeschlagen, aber auch nicht zum Anlass genommen, eine
  -- ansonsten stimmige Buchung abzulehnen — sonst blockierte diese
  -- Migration den laufenden Betrieb fuer Datensaetze, die schon vor ihr
  -- unvollstaendig waren.
  IF v_org IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_org <> NEW.organization_id THEN
    RAISE EXCEPTION
      'VPKZP_MANDANT_PASST_NICHT: Klient % gehoert zu Mandant %, die Buchung steht auf Mandant %. Eine Buchung ueber die Mandantengrenze hinweg wuerde den Jahresstand eines fremden Klienten fortschreiben.',
      NEW.client_id, v_org, NEW.organization_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_vpkzp_mandantenpaarung ON public.vpkzp_buchungen;
CREATE TRIGGER trg_vpkzp_mandantenpaarung
  BEFORE INSERT OR UPDATE OF client_id, organization_id ON public.vpkzp_buchungen
  FOR EACH ROW EXECUTE FUNCTION public.trg_vpkzp_mandantenpaarung();

COMMENT ON FUNCTION public.trg_vpkzp_mandantenpaarung() IS
  'Erzwingt, dass vpkzp_buchungen.client_id zu vpkzp_buchungen.organization_id '
  'gehoert. Die RESTRICTIVE org_fence prueft nur die organization_id der '
  'Zeile und faengt eine falsche Paarung nicht ab.';

COMMIT;
