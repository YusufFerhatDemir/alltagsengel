-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK: 20260811010000_personalmanagement.sql
-- Entfernt: Personalmanagement + Qualifikationsverwaltung + Dienstplanung
--           + Arbeitszeiterfassung + Urlaubsverwaltung
-- Tabellen:  personal_schulungen, dienstplan_schichten, dienstplan_eintraege,
--            personal_urlaubskonto, personal_arbeitszeiten,
--            personal_zeitkorrekturen, personal_audit_log
-- Views:     dienstplan_tagesansicht, personal_arbeitszeitkonto,
--            qualifikation_ablauf_warnung, personal_urlaubsuebersicht
-- Funktionen: check_doppelbelegung, prevent_zeitkorrektur_edit,
--             prevent_personal_audit_edit, log_arbeitszeit_korrektur
-- Spalten:   caregivers (11 + 1 Constraint),
--            caregiver_qualifications (8 + 1 Policy),
--            absences (8 + 2 Constraints + 2 Policies + 1 Trigger)
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ╔═════════════════════════════════════════════════════════════════════════╗
-- ║ TEIL 13 (reverse): Views entfernen                                    ║
-- ╚═════════════════════════════════════════════════════════════════════════╝

DROP VIEW IF EXISTS personal_urlaubsuebersicht;
DROP VIEW IF EXISTS qualifikation_ablauf_warnung;
DROP VIEW IF EXISTS personal_arbeitszeitkonto;
DROP VIEW IF EXISTS dienstplan_tagesansicht;

-- ╔═════════════════════════════════════════════════════════════════════════╗
-- ║ TEIL 12 (reverse): Auto-Korrektur-Log Trigger + Funktion entfernen    ║
-- ╚═════════════════════════════════════════════════════════════════════════╝

DROP TRIGGER IF EXISTS trg_log_arbeitszeit_korrektur ON personal_arbeitszeiten;
DROP FUNCTION IF EXISTS log_arbeitszeit_korrektur();

-- ╔═════════════════════════════════════════════════════════════════════════╗
-- ║ TEIL 11 (reverse): personal_audit_log entfernen                       ║
-- ╚═════════════════════════════════════════════════════════════════════════╝

DROP TRIGGER IF EXISTS trg_immutable_personal_audit_delete ON personal_audit_log;
DROP TRIGGER IF EXISTS trg_immutable_personal_audit_update ON personal_audit_log;
DROP FUNCTION IF EXISTS prevent_personal_audit_edit();

DROP POLICY IF EXISTS admin_personal_audit_log ON personal_audit_log;
DROP POLICY IF EXISTS org_fence_personal_audit_log ON personal_audit_log;

DROP TABLE IF EXISTS personal_audit_log CASCADE;

-- ╔═════════════════════════════════════════════════════════════════════════╗
-- ║ TEIL 10 (reverse): personal_zeitkorrekturen entfernen                 ║
-- ╚═════════════════════════════════════════════════════════════════════════╝

DROP TRIGGER IF EXISTS trg_immutable_zeitkorrektur_delete ON personal_zeitkorrekturen;
DROP TRIGGER IF EXISTS trg_immutable_zeitkorrektur_update ON personal_zeitkorrekturen;
DROP FUNCTION IF EXISTS prevent_zeitkorrektur_edit();

DROP POLICY IF EXISTS engel_personal_zeitkorrekturen_select ON personal_zeitkorrekturen;
DROP POLICY IF EXISTS admin_personal_zeitkorrekturen ON personal_zeitkorrekturen;
DROP POLICY IF EXISTS org_fence_personal_zeitkorrekturen ON personal_zeitkorrekturen;

DROP TABLE IF EXISTS personal_zeitkorrekturen CASCADE;

-- ╔═════════════════════════════════════════════════════════════════════════╗
-- ║ TEIL 9 (reverse): personal_arbeitszeiten entfernen                    ║
-- ╚═════════════════════════════════════════════════════════════════════════╝

DROP TRIGGER IF EXISTS trg_updated_at_personal_arbeitszeiten ON personal_arbeitszeiten;

DROP POLICY IF EXISTS engel_personal_arbeitszeiten_insert ON personal_arbeitszeiten;
DROP POLICY IF EXISTS engel_personal_arbeitszeiten_select ON personal_arbeitszeiten;
DROP POLICY IF EXISTS admin_personal_arbeitszeiten ON personal_arbeitszeiten;
DROP POLICY IF EXISTS org_fence_personal_arbeitszeiten ON personal_arbeitszeiten;

DROP TABLE IF EXISTS personal_arbeitszeiten CASCADE;

-- ╔═════════════════════════════════════════════════════════════════════════╗
-- ║ TEIL 8 (reverse): personal_urlaubskonto entfernen                     ║
-- ╚═════════════════════════════════════════════════════════════════════════╝

DROP TRIGGER IF EXISTS trg_updated_at_personal_urlaubskonto ON personal_urlaubskonto;

DROP POLICY IF EXISTS engel_personal_urlaubskonto_select ON personal_urlaubskonto;
DROP POLICY IF EXISTS admin_personal_urlaubskonto ON personal_urlaubskonto;
DROP POLICY IF EXISTS org_fence_personal_urlaubskonto ON personal_urlaubskonto;

DROP TABLE IF EXISTS personal_urlaubskonto CASCADE;

-- ╔═════════════════════════════════════════════════════════════════════════╗
-- ║ TEIL 7 (reverse): Doppelbelegungs-Schutz Trigger + Funktion entfernen ║
-- ╚═════════════════════════════════════════════════════════════════════════╝

DROP TRIGGER IF EXISTS trg_check_doppelbelegung ON dienstplan_eintraege;
DROP FUNCTION IF EXISTS check_doppelbelegung();

-- ╔═════════════════════════════════════════════════════════════════════════╗
-- ║ TEIL 6 (reverse): dienstplan_eintraege entfernen                      ║
-- ╚═════════════════════════════════════════════════════════════════════════╝

DROP TRIGGER IF EXISTS trg_updated_at_dienstplan_eintraege ON dienstplan_eintraege;

DROP POLICY IF EXISTS engel_dienstplan_eintraege_select ON dienstplan_eintraege;
DROP POLICY IF EXISTS admin_dienstplan_eintraege ON dienstplan_eintraege;
DROP POLICY IF EXISTS org_fence_dienstplan_eintraege ON dienstplan_eintraege;

DROP TABLE IF EXISTS dienstplan_eintraege CASCADE;

-- ╔═════════════════════════════════════════════════════════════════════════╗
-- ║ TEIL 5 (reverse): dienstplan_schichten entfernen                      ║
-- ╚═════════════════════════════════════════════════════════════════════════╝

DROP TRIGGER IF EXISTS trg_updated_at_dienstplan_schichten ON dienstplan_schichten;

DROP POLICY IF EXISTS engel_dienstplan_schichten_select ON dienstplan_schichten;
DROP POLICY IF EXISTS admin_dienstplan_schichten ON dienstplan_schichten;
DROP POLICY IF EXISTS org_fence_dienstplan_schichten ON dienstplan_schichten;

DROP TABLE IF EXISTS dienstplan_schichten CASCADE;

-- ╔═════════════════════════════════════════════════════════════════════════╗
-- ║ TEIL 4 (reverse): personal_schulungen entfernen                       ║
-- ╚═════════════════════════════════════════════════════════════════════════╝

DROP TRIGGER IF EXISTS trg_updated_at_personal_schulungen ON personal_schulungen;

DROP POLICY IF EXISTS engel_personal_schulungen_select ON personal_schulungen;
DROP POLICY IF EXISTS admin_personal_schulungen ON personal_schulungen;
DROP POLICY IF EXISTS org_fence_personal_schulungen ON personal_schulungen;

DROP TABLE IF EXISTS personal_schulungen CASCADE;

-- ╔═════════════════════════════════════════════════════════════════════════╗
-- ║ TEIL 3 (reverse): absences — Spalten + Constraints + Policies         ║
-- ╚═════════════════════════════════════════════════════════════════════════╝

DROP TRIGGER IF EXISTS trg_updated_at_absences ON absences;

DROP POLICY IF EXISTS engel_absences_insert ON absences;
DROP POLICY IF EXISTS engel_absences_select ON absences;

-- Restore the original absence_type constraint (remove extended types)
ALTER TABLE absences DROP CONSTRAINT IF EXISTS absences_absence_type_check;
ALTER TABLE absences ADD CONSTRAINT absences_absence_type_check
  CHECK (absence_type IN ('sick','vacation','personal','other'));

ALTER TABLE absences DROP CONSTRAINT IF EXISTS absences_status_check;

ALTER TABLE absences DROP COLUMN IF EXISTS updated_at;
ALTER TABLE absences DROP COLUMN IF EXISTS erstellt_von;
ALTER TABLE absences DROP COLUMN IF EXISTS dokument_id;
ALTER TABLE absences DROP COLUMN IF EXISTS ablehnungsgrund;
ALTER TABLE absences DROP COLUMN IF EXISTS genehmigt_am;
ALTER TABLE absences DROP COLUMN IF EXISTS genehmigt_von;
ALTER TABLE absences DROP COLUMN IF EXISTS tage_berechnet;
ALTER TABLE absences DROP COLUMN IF EXISTS halber_tag;
ALTER TABLE absences DROP COLUMN IF EXISTS status;

-- ╔═════════════════════════════════════════════════════════════════════════╗
-- ║ TEIL 2 (reverse): caregiver_qualifications — Spalten + Policy         ║
-- ╚═════════════════════════════════════════════════════════════════════════╝

DROP POLICY IF EXISTS engel_caregiver_quals_select ON caregiver_qualifications;

ALTER TABLE caregiver_qualifications DROP COLUMN IF EXISTS updated_at;
ALTER TABLE caregiver_qualifications DROP COLUMN IF EXISTS einsatzrelevant;
ALTER TABLE caregiver_qualifications DROP COLUMN IF EXISTS pflicht;
ALTER TABLE caregiver_qualifications DROP COLUMN IF EXISTS verifiziert_am;
ALTER TABLE caregiver_qualifications DROP COLUMN IF EXISTS verifiziert_von;
ALTER TABLE caregiver_qualifications DROP COLUMN IF EXISTS bemerkung;
ALTER TABLE caregiver_qualifications DROP COLUMN IF EXISTS dokument_id;
ALTER TABLE caregiver_qualifications DROP COLUMN IF EXISTS ausstellende_stelle;

-- ╔═════════════════════════════════════════════════════════════════════════╗
-- ║ TEIL 1 (reverse): caregivers — Spalten + Constraint entfernen         ║
-- ╚═════════════════════════════════════════════════════════════════════════╝

ALTER TABLE caregivers DROP CONSTRAINT IF EXISTS caregivers_vertragsstatus_check;

ALTER TABLE caregivers DROP COLUMN IF EXISTS fuehrerschein_klassen;
ALTER TABLE caregivers DROP COLUMN IF EXISTS fahrzeug_kennzeichen;
ALTER TABLE caregivers DROP COLUMN IF EXISTS probezeitende;
ALTER TABLE caregivers DROP COLUMN IF EXISTS urlaubstage_jahresanspruch;
ALTER TABLE caregivers DROP COLUMN IF EXISTS wochenstunden_soll;
ALTER TABLE caregivers DROP COLUMN IF EXISTS einsatzgebiet_radius_km;
ALTER TABLE caregivers DROP COLUMN IF EXISTS einsatzgebiet_plz;
ALTER TABLE caregivers DROP COLUMN IF EXISTS vertragsstatus;
ALTER TABLE caregivers DROP COLUMN IF EXISTS notfallkontakt_beziehung;
ALTER TABLE caregivers DROP COLUMN IF EXISTS notfallkontakt_telefon;
ALTER TABLE caregivers DROP COLUMN IF EXISTS notfallkontakt_name;

COMMIT;
