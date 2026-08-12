-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK: 20260810010000_pflegedokumentation.sql
-- Entfernt: Pflegedokumentation + Kundenaufnahme + Stammdaten + Anamnese
--           + Maßnahmenplan + Verlaufsdokumentation
-- Tabellen:  pflege_aufnahmen, pflege_anamnesen, pflege_diagnosen,
--            pflege_risiken, pflege_massnahmenplaene, pflege_massnahmen,
--            pflege_verlauf, pflege_doku_perioden
-- Views:     pflege_uebersicht, pflege_risiko_dashboard
-- Funktionen: prevent_locked_verlauf_edit, prevent_locked_anamnese_edit,
--             prevent_locked_plan_edit
-- Spalten:   clients (13 + 3 Constraints), care_notes (3 + 1 Constraint)
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- TEIL 12 (reverse): care_notes — Spalten + Constraint entfernen
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE care_notes DROP CONSTRAINT IF EXISTS care_notes_sichtbarkeit_check;
ALTER TABLE care_notes DROP COLUMN IF EXISTS sichtbarkeit;
ALTER TABLE care_notes DROP COLUMN IF EXISTS massnahme_id;
ALTER TABLE care_notes DROP COLUMN IF EXISTS verlauf_id;

-- ═══════════════════════════════════════════════════════════════════════════
-- TEIL 11 (reverse): Views entfernen
-- ═══════════════════════════════════════════════════════════════════════════

DROP VIEW IF EXISTS pflege_risiko_dashboard;
DROP VIEW IF EXISTS pflege_uebersicht;

-- ═══════════════════════════════════════════════════════════════════════════
-- TEIL 10 (reverse): Lock-Trigger + Funktionen entfernen
-- ═══════════════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_locked_plan ON pflege_massnahmenplaene;
DROP FUNCTION IF EXISTS prevent_locked_plan_edit();

DROP TRIGGER IF EXISTS trg_locked_anamnese ON pflege_anamnesen;
DROP FUNCTION IF EXISTS prevent_locked_anamnese_edit();

DROP TRIGGER IF EXISTS trg_locked_verlauf ON pflege_verlauf;
DROP FUNCTION IF EXISTS prevent_locked_verlauf_edit();

-- ═══════════════════════════════════════════════════════════════════════════
-- TEIL 9 (reverse): pflege_doku_perioden entfernen
-- ═══════════════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_updated_at_pflege_doku_perioden ON pflege_doku_perioden;

DROP POLICY IF EXISTS org_fence_pflege_doku_perioden ON pflege_doku_perioden;
DROP POLICY IF EXISTS admin_pflege_doku_perioden ON pflege_doku_perioden;

DROP INDEX IF EXISTS idx_pflege_doku_perioden_org;
DROP INDEX IF EXISTS idx_pflege_doku_perioden_client;

DROP TABLE IF EXISTS pflege_doku_perioden CASCADE;

-- ═══════════════════════════════════════════════════════════════════════════
-- TEIL 8 (reverse): pflege_verlauf entfernen
-- ═══════════════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_updated_at_pflege_verlauf ON pflege_verlauf;

DROP POLICY IF EXISTS kunde_pflege_verlauf_select ON pflege_verlauf;
DROP POLICY IF EXISTS engel_pflege_verlauf_insert ON pflege_verlauf;
DROP POLICY IF EXISTS engel_pflege_verlauf_select ON pflege_verlauf;
DROP POLICY IF EXISTS org_fence_pflege_verlauf ON pflege_verlauf;
DROP POLICY IF EXISTS admin_pflege_verlauf ON pflege_verlauf;

DROP INDEX IF EXISTS idx_pflege_verlauf_service;
DROP INDEX IF EXISTS idx_pflege_verlauf_datum;
DROP INDEX IF EXISTS idx_pflege_verlauf_org;
DROP INDEX IF EXISTS idx_pflege_verlauf_client;

DROP TABLE IF EXISTS pflege_verlauf CASCADE;

-- ═══════════════════════════════════════════════════════════════════════════
-- TEIL 7 (reverse): pflege_massnahmen entfernen
-- ═══════════════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_updated_at_pflege_massnahmen ON pflege_massnahmen;

DROP POLICY IF EXISTS engel_pflege_massnahmen_select ON pflege_massnahmen;
DROP POLICY IF EXISTS org_fence_pflege_massnahmen ON pflege_massnahmen;
DROP POLICY IF EXISTS admin_pflege_massnahmen ON pflege_massnahmen;

DROP INDEX IF EXISTS idx_pflege_massnahmen_org;
DROP INDEX IF EXISTS idx_pflege_massnahmen_plan;

DROP TABLE IF EXISTS pflege_massnahmen CASCADE;

-- ═══════════════════════════════════════════════════════════════════════════
-- TEIL 6 (reverse): pflege_massnahmenplaene entfernen
-- ═══════════════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_updated_at_pflege_massnahmenplaene ON pflege_massnahmenplaene;

DROP POLICY IF EXISTS kunde_pflege_massnahmenplaene_select ON pflege_massnahmenplaene;
DROP POLICY IF EXISTS engel_pflege_massnahmenplaene_select ON pflege_massnahmenplaene;
DROP POLICY IF EXISTS org_fence_pflege_massnahmenplaene ON pflege_massnahmenplaene;
DROP POLICY IF EXISTS admin_pflege_massnahmenplaene ON pflege_massnahmenplaene;

DROP INDEX IF EXISTS idx_pflege_massnahmenplaene_aktiv;
DROP INDEX IF EXISTS idx_pflege_massnahmenplaene_org;
DROP INDEX IF EXISTS idx_pflege_massnahmenplaene_client;

DROP TABLE IF EXISTS pflege_massnahmenplaene CASCADE;

-- ═══════════════════════════════════════════════════════════════════════════
-- TEIL 5 (reverse): pflege_risiken entfernen
-- ═══════════════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_updated_at_pflege_risiken ON pflege_risiken;

DROP POLICY IF EXISTS engel_pflege_risiken_select ON pflege_risiken;
DROP POLICY IF EXISTS org_fence_pflege_risiken ON pflege_risiken;
DROP POLICY IF EXISTS admin_pflege_risiken ON pflege_risiken;

DROP INDEX IF EXISTS idx_pflege_risiken_aktiv;
DROP INDEX IF EXISTS idx_pflege_risiken_org;
DROP INDEX IF EXISTS idx_pflege_risiken_client;

DROP TABLE IF EXISTS pflege_risiken CASCADE;

-- ═══════════════════════════════════════════════════════════════════════════
-- TEIL 4 (reverse): pflege_diagnosen entfernen
-- ═══════════════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_updated_at_pflege_diagnosen ON pflege_diagnosen;

DROP POLICY IF EXISTS engel_pflege_diagnosen_select ON pflege_diagnosen;
DROP POLICY IF EXISTS org_fence_pflege_diagnosen ON pflege_diagnosen;
DROP POLICY IF EXISTS admin_pflege_diagnosen ON pflege_diagnosen;

DROP INDEX IF EXISTS idx_pflege_diagnosen_aktiv;
DROP INDEX IF EXISTS idx_pflege_diagnosen_org;
DROP INDEX IF EXISTS idx_pflege_diagnosen_client;

DROP TABLE IF EXISTS pflege_diagnosen CASCADE;

-- ═══════════════════════════════════════════════════════════════════════════
-- TEIL 3 (reverse): pflege_anamnesen entfernen
-- ═══════════════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_updated_at_pflege_anamnesen ON pflege_anamnesen;

DROP POLICY IF EXISTS engel_pflege_anamnesen_insert ON pflege_anamnesen;
DROP POLICY IF EXISTS engel_pflege_anamnesen_select ON pflege_anamnesen;
DROP POLICY IF EXISTS org_fence_pflege_anamnesen ON pflege_anamnesen;
DROP POLICY IF EXISTS admin_pflege_anamnesen ON pflege_anamnesen;

DROP INDEX IF EXISTS idx_pflege_anamnesen_org;
DROP INDEX IF EXISTS idx_pflege_anamnesen_client;

DROP TABLE IF EXISTS pflege_anamnesen CASCADE;

-- ═══════════════════════════════════════════════════════════════════════════
-- TEIL 2 (reverse): pflege_aufnahmen entfernen
-- ═══════════════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_updated_at_pflege_aufnahmen ON pflege_aufnahmen;

DROP POLICY IF EXISTS engel_pflege_aufnahmen_select ON pflege_aufnahmen;
DROP POLICY IF EXISTS org_fence_pflege_aufnahmen ON pflege_aufnahmen;
DROP POLICY IF EXISTS admin_pflege_aufnahmen ON pflege_aufnahmen;

DROP INDEX IF EXISTS idx_pflege_aufnahmen_status;
DROP INDEX IF EXISTS idx_pflege_aufnahmen_org;
DROP INDEX IF EXISTS idx_pflege_aufnahmen_client;

DROP TABLE IF EXISTS pflege_aufnahmen CASCADE;

-- ═══════════════════════════════════════════════════════════════════════════
-- TEIL 1 (reverse): clients — Spalten + Constraints entfernen
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_wohnsituation_check;
ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_familienstand_check;
ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_aufnahmestatus_check;

ALTER TABLE clients DROP COLUMN IF EXISTS wohnungsbesonderheiten;
ALTER TABLE clients DROP COLUMN IF EXISTS haustiere;
ALTER TABLE clients DROP COLUMN IF EXISTS schluesseluebergabe;
ALTER TABLE clients DROP COLUMN IF EXISTS individuelle_wuensche;
ALTER TABLE clients DROP COLUMN IF EXISTS betreuungsbedarf_beschreibung;
ALTER TABLE clients DROP COLUMN IF EXISTS aufnahmestatus;
ALTER TABLE clients DROP COLUMN IF EXISTS aufgenommen_von;
ALTER TABLE clients DROP COLUMN IF EXISTS aufnahmedatum;
ALTER TABLE clients DROP COLUMN IF EXISTS religionszugehoerigkeit;
ALTER TABLE clients DROP COLUMN IF EXISTS staatsangehoerigkeit;
ALTER TABLE clients DROP COLUMN IF EXISTS familienstand;
ALTER TABLE clients DROP COLUMN IF EXISTS kommunikation_hinweise;
ALTER TABLE clients DROP COLUMN IF EXISTS wohnsituation;

COMMIT;
