-- ============================================================================
-- pflege_risiko_dashboard: View zusaetzlich auf den Klienten-Mandanten fenzen
-- ============================================================================
--
-- BEFUND
--   Die View joint pflege_risiken (pr) gegen clients (c) nur ueber c.id =
--   pr.client_id, ohne zu pruefen, dass c.organization_id = pr.organization_id
--   gilt. lib/pflege/risiken.ts:getRisikoDashboard() filtert anschliessend nur
--   auf pr.organization_id.
--
--   Alle Schreibrouten (app/api/pflege/{aufnahmen,anamnesen,diagnosen,
--   risiken,massnahmenplaene,verlauf,sturzprotokoll,doku-perioden}/route.ts)
--   pruefen inzwischen vor dem Schreiben, dass eine uebergebene clientId zur
--   aktiven Organisation gehoert (lib/clients/organization-guard.ts). Diese
--   View-Fenzung ist die zusaetzliche DB-seitige Absicherung: sollte je ein
--   Datensatz mit falscher client_id/organization_id-Kombination entstehen
--   (Altdaten, ein kuenftiger Schreibpfad, ein direkter SQL-Zugriff), zeigt
--   der Dashboard-View trotzdem nie einen fremden Kundennamen an.
--
-- WIRKUNG
--   Kein Verhaltensunterschied fuer korrekt verknuepfte Zeilen. Eine Zeile
--   mit organization_id <> clients.organization_id verschwindet aus dem
--   Dashboard, statt den Klientennamen eines fremden Mandanten zu zeigen.
-- ============================================================================

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
JOIN clients c ON c.id = pr.client_id AND c.organization_id = pr.organization_id
WHERE pr.aktiv = true;
