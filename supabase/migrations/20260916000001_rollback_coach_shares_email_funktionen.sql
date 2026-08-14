-- Rollback: coach_shares-Lookup-Funktionen entfernen
-- Keine Datenänderung — betrifft nur die beiden Funktionen.

DROP FUNCTION IF EXISTS coach_freigaben_liste();
DROP FUNCTION IF EXISTS coach_finde_nutzer_id(text);
