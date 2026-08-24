-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Dublettensperre fuer CAMT-Buchungen
-- Datum: 2026-08-24 (Phase 5, Sektion 3 — CAMT-Produktionsreife)
--
-- BEFUND
--   Die Dublettenpruefung des Kontoauszugs-Imports lag ausschliesslich auf
--   DATEIebene (camt_imports.quelldatei_hash, UNIQUE je Organisation).
--   Banken schneiden Auszuege aber ueberlappend: das camt.054-Avis vom
--   Vortag, danach der camt.053-Auszug derselben Periode, oder ein neu
--   gezogener Auszug ueber einen groesseren Zeitraum. Der Dateihash ist dann
--   ein anderer — und JEDE darin enthaltene, bereits verbuchte Zahlung wurde
--   ein zweites Mal als Zahlungseingang angelegt, ein zweites Mal gematcht
--   und ein zweites Mal einer Rechnung zugeordnet.
--
--   zahlungseingaenge.quelldatei_hash traegt seit jeher den Buchungshash aus
--   dem Parser (SHA-256 ueber Betrag, Waehrung, Buchungs- und Valutadatum,
--   Zahler-IBAN, Verwendungszweck, EndToEndId und Buchungsreferenz). Er wurde
--   geschrieben, aber nie gelesen; der bestehende Index
--   idx_zahlungseingaenge_hash ist NICHT unique.
--
-- LOESUNG
--   Anwendungsseitig prueft die Route die Hashes jetzt vor dem Import
--   (app/api/billing/camt/import/route.ts). Diese Migration zieht die harte
--   Grenze nach: zwei gleichzeitige Importlaeufe kann eine Vorab-Abfrage
--   prinzipiell nicht abfangen, ein UNIQUE-Index schon.
--
--   Der Index ist mandantenbezogen — derselbe Auszug darf bei zwei
--   Mandanten liegen, nur nicht zweimal beim selben.
--
-- VORAUSSETZUNG
--   Bestehende Dubletten muessen vorher bereinigt sein, sonst scheitert die
--   Index-Erstellung. Der DO-Block unten meldet das im Klartext, statt die
--   Migration mit 23505 abbrechen zu lassen.
--
-- ROLLBACK: 20261003000001_rollback_camt_buchungsdublette.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
DECLARE
  dubletten INT;
BEGIN
  SELECT count(*) INTO dubletten FROM (
    SELECT organization_id, quelldatei_hash
    FROM public.zahlungseingaenge
    GROUP BY organization_id, quelldatei_hash
    HAVING count(*) > 1
  ) d;

  IF dubletten > 0 THEN
    RAISE EXCEPTION
      'Es gibt % (organization_id, quelldatei_hash)-Paare mit mehr als einer Zeile in zahlungseingaenge. '
      'Diese Doppelbuchungen muessen vor dem Anlegen der Sperre geprueft und aufgeloest werden.',
      dubletten;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_zahlungseingaenge_org_buchungshash
  ON public.zahlungseingaenge (organization_id, quelldatei_hash);

COMMIT;
