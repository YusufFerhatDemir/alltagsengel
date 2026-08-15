-- Rollback fuer 20260921020000_pflege_uebersicht_care_level.sql
-- Stellt die View auf den Stand vor dem Hinzufuegen von care_level zurueck.
-- Sicherheitsfix security_invoker bleibt erhalten (aus 20260906000000).

BEGIN;

CREATE OR REPLACE VIEW public.pflege_uebersicht
WITH (security_invoker = true) AS
SELECT
  c.id AS client_id,
  c.organization_id,
  c.first_name,
  c.last_name,
  c.pflegegrad,
  c.aufnahmestatus,
  c.aufnahmedatum,
  (SELECT count(*) FROM pflege_aufnahmen pa WHERE pa.client_id = c.id) AS aufnahmen_count,
  (SELECT count(*) FROM pflege_anamnesen pan WHERE pan.client_id = c.id) AS anamnesen_count,
  (SELECT max(pan.anamnese_datum) FROM pflege_anamnesen pan WHERE pan.client_id = c.id) AS letzte_anamnese,
  (SELECT count(*) FROM pflege_diagnosen pd WHERE pd.client_id = c.id AND pd.aktiv = true) AS aktive_diagnosen,
  (SELECT count(*) FROM pflege_risiken pr WHERE pr.client_id = c.id AND pr.aktiv = true) AS aktive_risiken,
  (SELECT count(*) FROM pflege_massnahmenplaene pm WHERE pm.client_id = c.id AND pm.status = 'aktiv') AS aktive_plaene,
  (SELECT count(*) FROM pflege_verlauf pv WHERE pv.client_id = c.id) AS verlauf_count,
  (SELECT max(pv.eintrag_datum) FROM pflege_verlauf pv WHERE pv.client_id = c.id) AS letzter_verlauf
FROM clients c;

COMMIT;
