-- Rollback: DiPA Block 15 — Freischaltung, Nutzungsnachweise, eUL
-- Gegenstueck zu 20260826010000_dipa_freischaltung_nachweise_eul.sql
--
-- ACHTUNG: Der Drop von coach_pseudonym_key vernichtet den HMAC-Schluessel.
-- Bereits erzeugte Pseudonyme (coach_freischaltcodes.eingeloest_pseudonym,
-- eul_erbringungen.coach_pseudonym) sind danach dauerhaft nicht mehr
-- zuordenbar. Das ist beim Rollback gewollt (Anonymisierung), aber
-- unumkehrbar — vorher pruefen, ob Nachweisdaten noch benoetigt werden.

DROP TABLE IF EXISTS eul_qualifikationen CASCADE;
DROP TABLE IF EXISTS eul_erbringungen CASCADE;
DROP TABLE IF EXISTS coach_abrechnungswege CASCADE;
DROP TABLE IF EXISTS coach_nutzungsereignisse CASCADE;
DROP TABLE IF EXISTS coach_anspruchspruefungen CASCADE;
DROP TABLE IF EXISTS coach_freischaltungen CASCADE;
DROP TABLE IF EXISTS coach_freischaltcodes CASCADE;

DROP FUNCTION IF EXISTS coach_mein_pseudonym();
DROP FUNCTION IF EXISTS coach_pseudonym(uuid);

DROP TABLE IF EXISTS coach_pseudonym_key CASCADE;

-- Nicht zurueckgebaut: pgcrypto (wird von anderen Modulen genutzt),
-- coach_set_updated_at() und coach_audit_trigger() (gehoeren zur
-- Basis-Migration 20260819010000).
