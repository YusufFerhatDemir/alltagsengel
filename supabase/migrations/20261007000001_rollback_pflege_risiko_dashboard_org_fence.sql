-- Rollback zu 20261007000000_pflege_risiko_dashboard_org_fence.sql
--
-- ACHTUNG: nach dem Rollback kann eine Zeile mit falscher client_id/
-- organization_id-Kombination wieder einen fremden Kundennamen im
-- Risiko-Dashboard zeigen (Cross-Tenant-Leak).
CREATE OR REPLACE VIEW pflege_risiko_dashboard AS
SELECT
  pr.id,
  pr.organization_id,
  pr.client_id,
  c.first_name || ' ' || c.last_name AS kunde_name,
  pr.risiko_typ,
  pr.bezeichnung,
  pr.schweregrad,
  pr.massnahmen,
  pr.naechste_pruefung,
  CASE
    WHEN pr.naechste_pruefung IS NULL THEN 'keine_pruefung'
    WHEN pr.naechste_pruefung < CURRENT_DATE THEN 'ueberfaellig'
    WHEN pr.naechste_pruefung <= CURRENT_DATE + interval '7 days' THEN 'bald_faellig'
    ELSE 'ok'
  END AS pruefstatus
FROM pflege_risiken pr
JOIN clients c ON c.id = pr.client_id
WHERE pr.aktiv = true;
