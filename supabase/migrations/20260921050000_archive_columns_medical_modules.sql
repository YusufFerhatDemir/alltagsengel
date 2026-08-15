-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: archive_columns_medical_modules — Archiv-Spalten + Audit-Typen
-- Datum:     2026-08-15
-- Projekt:   Alltagsengel UG
-- ═══════════════════════════════════════════════════════════════════════════
-- BEFUND: Die medizinischen Modul-Tabellen lagerungsprotokolle,
--   pflege_verlauf und freiheitsentziehende_massnahmen haben noch keine
--   archiviert_am-Spalte fuer Soft-Delete/Archivierung. Gleichzeitig
--   fehlen im pflege_audit_log die Entitaetstypen und die Aktion
--   'archiviert', die fuer die neuen Module (Medikamente, Wunddoku,
--   Sturzprotokolle, FEM, Lagerung, Wund-Assessment/-Behandlung)
--   benoetigt werden.
--
-- FIX:
--   1. archiviert_am timestamptz auf die drei Tabellen (ADD COLUMN IF
--      NOT EXISTS — sicher bei Re-Apply).
--   2. pflege_audit_log CHECK-Constraints DROP + CREATE mit erweiterter
--      Werteliste (entity-Typen + 'archiviert'-Aktion).
--
-- IDEMPOTENT: ADD COLUMN IF NOT EXISTS fuer Spalten. CHECK-Constraints
--   werden per DROP IF EXISTS + ADD neu angelegt.
-- RLS:       Nicht betroffen — archiviert_am ist eine Datenspalte ohne
--   eigene Policy-Logik. Bestehende Policies bleiben unveraendert.
-- Rollback:  20260921050001_rollback_archive_columns_medical_modules.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. archiviert_am auf lagerungsprotokolle ────────────────────────────

ALTER TABLE public.lagerungsprotokolle
  ADD COLUMN IF NOT EXISTS archiviert_am timestamptz;

COMMENT ON COLUMN public.lagerungsprotokolle.archiviert_am IS
  'Soft-Delete / Archiv-Marker. NULL = aktiver Datensatz. Gesetzt = archiviert.';

-- ─── 2. archiviert_am auf pflege_verlauf ─────────────────────────────────

ALTER TABLE public.pflege_verlauf
  ADD COLUMN IF NOT EXISTS archiviert_am timestamptz;

COMMENT ON COLUMN public.pflege_verlauf.archiviert_am IS
  'Soft-Delete / Archiv-Marker. NULL = aktiver Datensatz. Gesetzt = archiviert.';

-- ─── 3. archiviert_am auf freiheitsentziehende_massnahmen ────────────────

ALTER TABLE public.freiheitsentziehende_massnahmen
  ADD COLUMN IF NOT EXISTS archiviert_am timestamptz;

COMMENT ON COLUMN public.freiheitsentziehende_massnahmen.archiviert_am IS
  'Soft-Delete / Archiv-Marker. NULL = aktiver Datensatz. Gesetzt = archiviert.';

-- ─── 4. pflege_audit_log — entitaet_typ CHECK erweitern ──────────────────
-- Alte Liste: aufnahme, anamnese, diagnose, risiko, verlauf, massnahme,
--             massnahmenplan
-- Neu dazu:   medikament, wunddokumentation, sturzprotokoll,
--             fixierungsprotokoll, lagerungsprotokoll, wund_assessment,
--             wund_behandlung, fem_ueberwachung

ALTER TABLE public.pflege_audit_log
  DROP CONSTRAINT IF EXISTS pflege_audit_log_typ_check;

ALTER TABLE public.pflege_audit_log
  ADD CONSTRAINT pflege_audit_log_typ_check CHECK (entitaet_typ IN (
    -- Original (20260921040000)
    'aufnahme', 'anamnese', 'diagnose', 'risiko',
    'verlauf', 'massnahme', 'massnahmenplan',
    -- Medizinische Module (neu)
    'medikament', 'wunddokumentation', 'sturzprotokoll',
    'fixierungsprotokoll', 'lagerungsprotokoll',
    'wund_assessment', 'wund_behandlung', 'fem_ueberwachung'
  ));

-- ─── 5. pflege_audit_log — aktion CHECK erweitern ────────────────────────
-- Alte Liste: erstellt, aktualisiert, geloescht, gesperrt, entsperrt,
--             freigegeben
-- Neu dazu:   archiviert

ALTER TABLE public.pflege_audit_log
  DROP CONSTRAINT IF EXISTS pflege_audit_log_aktion_check;

ALTER TABLE public.pflege_audit_log
  ADD CONSTRAINT pflege_audit_log_aktion_check CHECK (aktion IN (
    -- Original (20260921040000)
    'erstellt', 'aktualisiert', 'geloescht',
    'gesperrt', 'entsperrt', 'freigegeben',
    -- Archivierung (neu)
    'archiviert'
  ));

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFIKATION nach dem Apply:
--
--   a) Spalten existieren:
--      SELECT column_name, data_type
--      FROM information_schema.columns
--      WHERE table_name IN ('lagerungsprotokolle','pflege_verlauf',
--                           'freiheitsentziehende_massnahmen')
--        AND column_name = 'archiviert_am';
--      → erwartet: 3 Zeilen, alle timestamptz
--
--   b) Neuer Entitaetstyp akzeptiert:
--      INSERT INTO pflege_audit_log
--        (organization_id, entitaet_typ, entitaet_id, aktion, nachher)
--      VALUES ('<org>', 'medikament', gen_random_uuid(), 'erstellt', '{}');
--      → erwartet: erfolgreich
--
--   c) Neue Aktion akzeptiert:
--      INSERT INTO pflege_audit_log
--        (organization_id, entitaet_typ, entitaet_id, aktion, nachher)
--      VALUES ('<org>', 'aufnahme', gen_random_uuid(), 'archiviert', '{}');
--      → erwartet: erfolgreich
--
--   d) Unbekannter Typ wird abgelehnt:
--      INSERT INTO pflege_audit_log
--        (organization_id, entitaet_typ, entitaet_id, aktion, nachher)
--      VALUES ('<org>', 'foobar', gen_random_uuid(), 'erstellt', '{}');
--      → erwartet: CHECK constraint violation
-- ═══════════════════════════════════════════════════════════════════════════
