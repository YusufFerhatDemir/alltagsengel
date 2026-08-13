-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: clients.pflegegrad an care_level angleichen (Backfill)
-- Datum:     2026-08-14 (Befund Gegenprüfung B — realer Nutzerworkflow)
-- ═══════════════════════════════════════════════════════════════════════════
-- BEFUND (live reproduziert):
--   SELECT care_level, pflegegrad FROM clients;
--     → care_level = 2 / 3, pflegegrad = NULL bei ALLEN Bestandskunden.
--
--   `clients` führt den Pflegegrad in zwei Spalten. Führend ist care_level:
--   das schreibt die Eingabemaske, das liest die Klientenakte, danach richtet
--   sich die Budgetanlage. `pflegegrad` wird erst seit der Pflegegrad-Route
--   (app/api/admin/clients/[id]/pflegegrad) mitgeschrieben — bei allen vorher
--   angelegten Klienten ist sie leer geblieben.
--
-- AUSWIRKUNG:
--   Jede Auswertung, die nur `pflegegrad` liest, sieht „kein Pflegegrad".
--   Im Code ist das mit lib/clients/pflegegrad.ts (pflegegradVon) erledigt.
--   Die Datenbank-VIEW public.pflege_uebersicht liest die Spalte aber direkt
--   und liefert deshalb weiterhin NULL — sichtbar in /admin/pflegedoku und
--   /admin/fhir als „—" statt des erfassten Pflegegrads.
--
-- LÖSUNG:
--   Reine Datenkorrektur: die nachgeordnete Spalte auf den Wert der führenden
--   ziehen. Kein DDL, keine Änderung an Views oder Constraints.
--
-- BEWUSST NICHT:
--   * die Doppelspalte auflösen. Das ist der richtige Endzustand, betrifft
--     aber FHIR-Mapper, EDIFACT-Generator und mehrere Views gleichzeitig und
--     gehört in einen eigenen, getesteten Schritt.
--   * einen Trigger nachrüsten. Beide Schreibwege (Anlage und Änderung)
--     setzen bereits beide Spalten; ein Trigger wäre eine zweite Wahrheit.
--
-- IDEMPOTENT: die WHERE-Klausel trifft beim zweiten Lauf 0 Zeilen.
-- ROLLBACK:   20260907000001_rollback_pflegegrad_backfill.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

UPDATE public.clients
   SET pflegegrad = care_level
 WHERE care_level IS NOT NULL
   AND pflegegrad IS DISTINCT FROM care_level;

COMMIT;
