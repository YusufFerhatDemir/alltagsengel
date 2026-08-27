-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Rückwirkendes Anlegen von Verlaufseinträgen auch DB-seitig sperren
-- Datum:     2026-10-10
-- Projekt:   Alltagsengel UG
-- ═══════════════════════════════════════════════════════════════════════════
-- BEFUND: trg_locked_verlauf (20260810010000) blockt nur UPDATEs auf bereits
-- gesperrt=true-Zeilen. lib/pflege/verlauf.ts:createVerlauf() prüft seit
-- Commit c9d403e zusätzlich beim INSERT, ob für den Monat des
-- Eintragsdatums bereits eine abgeschlossene pflege_doku_periode existiert —
-- aber nur, wenn der Schreibzugriff durch dieses Modul läuft. Ein direkter
-- PostgREST-/service_role-Zugriff unter Umgehung von lib/pflege/verlauf.ts
-- konnte bislang rückwirkend einen neuen, unversperrten Eintrag in eine
-- bereits abgeschlossene Dokumentationsperiode einfügen.
--
-- HINWEIS ZUR REICHWEITE: pflege_doku_perioden ist per RLS nur für
-- admin/superadmin lesbar (org_fence_pflege_doku_perioden +
-- admin_pflege_doku_perioden). Der Trigger läuft als SECURITY INVOKER —
-- für einen RLS-gebundenen Engel-Insert (current_org_id()-Default) liefert
-- die interne Abfrage daher leer und die Prüfung greift nicht (dieselbe
-- Einschränkung wie in lib/pflege/verlauf.ts dokumentiert). Für einen
-- service_role-Insert (BYPASSRLS) — der eigentliche Befund — greift sie.
-- IDEMPOTENT: CREATE OR REPLACE FUNCTION, keine Datenaenderung.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION prevent_backdated_verlauf_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_utc    timestamp;
BEGIN
  v_utc := NEW.eintrag_datum AT TIME ZONE 'UTC';

  SELECT status INTO v_status
    FROM pflege_doku_perioden
   WHERE client_id = NEW.client_id
     AND organization_id = NEW.organization_id
     AND jahr  = EXTRACT(YEAR  FROM v_utc)::int
     AND monat = EXTRACT(MONTH FROM v_utc)::int;

  IF v_status = 'abgeschlossen' THEN
    RAISE EXCEPTION 'Die Dokumentationsperiode für diesen Zeitpunkt ist abgeschlossen — bitte zuerst wiedereröffnen.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_verlauf_periode_offen ON public.pflege_verlauf;
CREATE TRIGGER trg_verlauf_periode_offen
  BEFORE INSERT ON public.pflege_verlauf
  FOR EACH ROW EXECUTE FUNCTION prevent_backdated_verlauf_insert();

COMMENT ON FUNCTION prevent_backdated_verlauf_insert() IS
  'Blockt INSERT auf pflege_verlauf, wenn für Klient+Monat des Eintragsdatums '
  'bereits eine abgeschlossene pflege_doku_periode existiert. Ergänzt '
  'trg_locked_verlauf (blockt nur UPDATE auf gesperrte Zeilen).';
