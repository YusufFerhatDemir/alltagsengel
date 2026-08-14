-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK zu 20260907000000_coach_selbstzahler.sql
-- ═══════════════════════════════════════════════════════════════════════════
-- ACHTUNG — DATENVERLUST: Dieses Skript loescht Vertrags-, Zahlungs- und
-- Rechnungsdaten. Rechnungen unterliegen der Aufbewahrungspflicht
-- (§ 147 AO, 10 Jahre). Vor dem Ausfuehren MUSS coach_rechnungen exportiert
-- und ausserhalb der Datenbank archiviert sein. Nur fuer den Fall gedacht,
-- dass die Migration versehentlich auf der falschen Instanz gelandet ist
-- oder noch keine echte Bestellung existiert.
--
-- REIHENFOLGE: abhaengige Objekte zuerst.
-- ═══════════════════════════════════════════════════════════════════════════

-- Zuerst den Verweis aus coach_freischaltungen loesen, sonst blockiert der
-- Fremdschluessel das DROP von coach_bestellungen.
DROP INDEX IF EXISTS idx_coach_freischaltungen_bestellung;
ALTER TABLE coach_freischaltungen DROP COLUMN IF EXISTS bestellung_id;

-- CHECK auf den Stand vor der Migration zuruecksetzen.
-- Bestehende 'selbstzahler'-Zeilen wuerden den alten CHECK verletzen und
-- werden deshalb vorher auf 'hersteller_pilot' gehoben — sie zu loeschen
-- wuerde einem Nutzer den bezahlten Zugang entziehen.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'coach_freischaltungen'::regclass
      AND conname = 'coach_freischaltungen_quelle_check'
  ) THEN
    UPDATE coach_freischaltungen SET quelle = 'hersteller_pilot' WHERE quelle = 'selbstzahler';
    ALTER TABLE coach_freischaltungen DROP CONSTRAINT coach_freischaltungen_quelle_check;
    ALTER TABLE coach_freischaltungen
      ADD CONSTRAINT coach_freischaltungen_quelle_check
      CHECK (quelle IN ('pflegekasse','hersteller_pilot','testzugang'));
  END IF;
END $$;

DROP TABLE IF EXISTS coach_rechnungen CASCADE;
DROP TABLE IF EXISTS coach_zahlungen CASCADE;
DROP TABLE IF EXISTS coach_bestellungen CASCADE;

DROP FUNCTION IF EXISTS coach_naechste_rechnungsnummer();
DROP SEQUENCE IF EXISTS coach_rechnung_nummer_seq;
