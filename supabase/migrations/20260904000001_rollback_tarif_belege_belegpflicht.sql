-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK: 20260904000000_tarif_belege_belegpflicht.sql
--
-- ACHTUNG — was dieses Rollback bedeutet:
--   Es entfernt die Belegpflicht. Danach kann ein Tarif wieder ohne
--   hinterlegten Primaerbeleg auf 'verified' gesetzt werden, auch per
--   direktem PostgREST-UPDATE unter Umgehung der API-Route. Nur ausfuehren,
--   wenn die Belegpflicht nachweislich den Betrieb blockiert.
--
--   Hochgeladene Belegdateien im Bucket 'tarif-belege' werden NICHT geloescht
--   und der Bucket bleibt bestehen — ein Rollback darf keine Nachweise
--   vernichten. Die Zeilen in billing_tarif_belege bleiben ebenfalls erhalten;
--   nur die Verknuepfungsspalten fallen weg.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Belegpflicht-Trigger entfernen
DROP TRIGGER IF EXISTS trg_belegpflicht_billing_tariffs ON public.billing_tariffs;
DROP TRIGGER IF EXISTS trg_belegpflicht_leistungspreise ON public.leistungspreise;
DROP FUNCTION IF EXISTS public.trg_verifizierung_belegpflicht();

-- 2. Audit-Trigger fuer leistungspreise entfernen
DROP TRIGGER IF EXISTS trg_leistungspreis_audit ON public.leistungspreise;
DROP FUNCTION IF EXISTS public.trg_leistungspreis_audit();

-- 3. billing_tariffs-Audit-Trigger auf den Stand vor dieser Migration
--    (20260831040000) zuruecksetzen: ohne beleg_id, ohne quell_tabelle.
CREATE OR REPLACE FUNCTION public.trg_billing_tariff_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.billing_tariff_audit (
    tariff_id, organization_id, aktion,
    alter_betrag_cent, neuer_betrag_cent,
    alter_status, neuer_status,
    benutzer, quelle
  ) VALUES (
    NEW.id,
    NEW.organization_id,
    CASE
      WHEN TG_OP = 'INSERT' THEN 'erstellt'
      WHEN OLD.tarif_status IS DISTINCT FROM NEW.tarif_status THEN 'status_geaendert'
      WHEN OLD.preis_cent IS DISTINCT FROM NEW.preis_cent THEN 'preis_geaendert'
      ELSE 'aktualisiert'
    END,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.preis_cent ELSE NULL END,
    NEW.preis_cent,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.tarif_status ELSE NULL END,
    NEW.tarif_status,
    COALESCE(NEW.verifiziert_von, current_setting('request.jwt.claims', true)::json->>'sub'),
    NEW.verifizierungs_quelle
  );
  RETURN NEW;
END;
$$;

-- 4. View entfernen
DROP VIEW IF EXISTS public.v_tarife_ohne_beleg;

-- 5. Verknuepfungsspalten entfernen (Belegzeilen selbst bleiben erhalten)
ALTER TABLE public.billing_tariffs  DROP COLUMN IF EXISTS beleg_id;
ALTER TABLE public.leistungspreise  DROP COLUMN IF EXISTS beleg_id;

ALTER TABLE public.billing_tariff_audit
  DROP COLUMN IF EXISTS beleg_id,
  DROP COLUMN IF EXISTS leistungspreis_id;

ALTER TABLE public.billing_tariff_audit
  DROP CONSTRAINT IF EXISTS tariff_audit_quell_tabelle_check;
ALTER TABLE public.billing_tariff_audit
  DROP COLUMN IF EXISTS quell_tabelle;

-- tariff_id wieder NOT NULL — nur moeglich, wenn keine leistungspreis-Zeilen
-- ohne tariff_id uebrig sind. Die werden vorher entfernt, weil sie ohne
-- quell_tabelle nicht mehr zuzuordnen waeren.
DELETE FROM public.billing_tariff_audit WHERE tariff_id IS NULL;
ALTER TABLE public.billing_tariff_audit ALTER COLUMN tariff_id SET NOT NULL;

-- organization_id bleibt bewusst nullable: ein erneutes SET NOT NULL wuerde
-- an Audit-Zeilen ohne Org scheitern und das Rollback abbrechen.

COMMIT;

-- Bucket und Belegtabelle bewusst NICHT entfernt:
--   DROP TABLE public.billing_tarif_belege;
--   DELETE FROM storage.buckets WHERE id = 'tarif-belege';
-- Beides nur manuell und nur, wenn die Nachweise nachweislich nicht mehr
-- aufbewahrungspflichtig sind.
