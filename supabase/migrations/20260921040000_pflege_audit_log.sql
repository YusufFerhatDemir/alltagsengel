-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: pflege_audit_log — Änderungshistorie Pflegedokumentation
-- Datum:     2026-08-15
-- Projekt:   Alltagsengel UG
-- ═══════════════════════════════════════════════════════════════════════════
-- BEFUND: lib/pflege/*.ts (Aufnahme, Anamnese, Diagnosen, Risiken, Verlauf,
--   Maßnahmen/-pläne) trug bisher nur erstellt_von/autor_id/updated_at als
--   minimale Spur — keine Änderungshistorie. Bei medizinischer Dokumentation
--   ist das fachlich/revisionssicherheitstechnisch relevant (wer hat wann
--   was an einer Diagnose/einem Risiko/einer Maßnahme geändert).
--
-- FIX: pflege_audit_log — 1:1 nach dem Muster ops_aktivitaetslog
--   (supabase/migrations/20260812010000_aufgaben_kommunikation.sql, TEIL 13):
--   vorher/nachher als jsonb, append-only per BEFORE UPDATE/DELETE-Trigger.
--   Schreibzugriff ausschließlich über lib/pflege/audit-log.ts
--   (logPflegeAktivitaet), aufgerufen aus den CRUD-Funktionen in
--   lib/pflege/{aufnahmen,anamnesen,diagnosen,risiken,verlauf,massnahmen,
--   massnahmenplaene}.ts.
--
-- IDEMPOTENT: Alle Statements mit IF NOT EXISTS / IF EXISTS Guards.
-- RLS:       is_admin() (SECURITY DEFINER, KEINE profiles-Subquery — 42P17!)
--            + org_fence current_org_id() RESTRICTIVE.
--            Kein Kunden-/Engel-SELECT — das Log ist ein internes
--            Revisionswerkzeug, keine Fachsicht.
-- STATUS:    WARTET AUF LIVE-APPLY — kein DB-Zugang in dieser Session
--            (siehe memory/supabase-mcp-nicht-verfuegbar.md). NICHT live
--            angewendet.
-- Rollback:  20260921040001_rollback_pflege_audit_log.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS public.pflege_audit_log (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL DEFAULT current_org_id(),

  entitaet_typ     text NOT NULL,
  entitaet_id      uuid NOT NULL,
  aktion           text NOT NULL,

  vorher           jsonb,
  nachher          jsonb,

  akteur_id        uuid REFERENCES public.profiles(id),
  ip_adresse       text,
  erstellt_am      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT pflege_audit_log_typ_check CHECK (entitaet_typ IN (
    'aufnahme', 'anamnese', 'diagnose', 'risiko',
    'verlauf', 'massnahme', 'massnahmenplan'
  )),
  CONSTRAINT pflege_audit_log_aktion_check CHECK (aktion IN (
    'erstellt', 'aktualisiert', 'geloescht',
    'gesperrt', 'entsperrt', 'freigegeben'
  ))
);

CREATE INDEX IF NOT EXISTS idx_pflege_audit_log_org ON public.pflege_audit_log(organization_id);
CREATE INDEX IF NOT EXISTS idx_pflege_audit_log_entitaet ON public.pflege_audit_log(entitaet_typ, entitaet_id);
CREATE INDEX IF NOT EXISTS idx_pflege_audit_log_akteur ON public.pflege_audit_log(akteur_id);
CREATE INDEX IF NOT EXISTS idx_pflege_audit_log_zeit ON public.pflege_audit_log(erstellt_am);

ALTER TABLE public.pflege_audit_log ENABLE ROW LEVEL SECURITY;

-- org_fence: RESTRICTIVE — Mandantentrennung, unabhängig von der Rolle
DROP POLICY IF EXISTS "pflege_audit_log_org_fence" ON public.pflege_audit_log;
CREATE POLICY "pflege_audit_log_org_fence"
  ON public.pflege_audit_log AS RESTRICTIVE FOR ALL
  USING (organization_id = current_org_id());

-- Nur Admin darf das Log lesen (kein UPDATE/DELETE-Weg — Trigger unten
-- blockt das ohnehin, aber die Policy erlaubt erst gar kein Schreiben
-- außer per INSERT über den service_role/authenticated Schreibpfad).
DROP POLICY IF EXISTS "pflege_audit_log_admin_select" ON public.pflege_audit_log;
CREATE POLICY "pflege_audit_log_admin_select"
  ON public.pflege_audit_log FOR SELECT
  USING (is_admin());

DROP POLICY IF EXISTS "pflege_audit_log_insert" ON public.pflege_audit_log;
CREATE POLICY "pflege_audit_log_insert"
  ON public.pflege_audit_log FOR INSERT
  WITH CHECK (organization_id = current_org_id());

-- Append-only: UPDATE/DELETE blockieren (analog prevent_modify_akten_audit /
-- prevent_ops_log_update, 20260809010000 / 20260812010000). Kein FK-Kaskaden-
-- Sonderfall nötig: entitaet_id ist eine lose uuid-Referenz ohne FK, daher
-- kann hier — anders als bei service_record_audit_log/assignment_audit_log
-- (20260910010000) — unbedingt geraist werden.
CREATE OR REPLACE FUNCTION public.prevent_pflege_audit_log_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RAISE EXCEPTION 'pflege_audit_log ist unveraenderlich (Revisionssicherheit) — UPDATE nicht erlaubt';
END;
$$;

DROP TRIGGER IF EXISTS trg_pflege_audit_log_immutable_update ON public.pflege_audit_log;
CREATE TRIGGER trg_pflege_audit_log_immutable_update
  BEFORE UPDATE ON public.pflege_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.prevent_pflege_audit_log_update();

CREATE OR REPLACE FUNCTION public.prevent_pflege_audit_log_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RAISE EXCEPTION 'pflege_audit_log ist unveraenderlich (Revisionssicherheit) — DELETE nicht erlaubt';
END;
$$;

DROP TRIGGER IF EXISTS trg_pflege_audit_log_immutable_delete ON public.pflege_audit_log;
CREATE TRIGGER trg_pflege_audit_log_immutable_delete
  BEFORE DELETE ON public.pflege_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.prevent_pflege_audit_log_delete();

REVOKE ALL ON FUNCTION public.prevent_pflege_audit_log_update() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.prevent_pflege_audit_log_delete() FROM PUBLIC, anon;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFIKATION nach dem Apply (manuell, mit SERVICE-ROLE-Key —
-- service_role umgeht RLS, der Trigger muss trotzdem greifen):
--
--   a) INSERT funktioniert:
--      INSERT INTO pflege_audit_log (organization_id, entitaet_typ, entitaet_id, aktion, nachher)
--      VALUES ('<org>', 'risiko', '<uuid>', 'erstellt', '{"bezeichnung":"Test"}');
--      → erwartet: erfolgreich
--
--   b) UPDATE scheitert:
--      UPDATE pflege_audit_log SET aktion = 'geloescht' WHERE id = '…';
--      → erwartet: "pflege_audit_log ist unveraenderlich"
--
--   c) DELETE scheitert:
--      DELETE FROM pflege_audit_log WHERE id = '…';
--      → erwartet: "pflege_audit_log ist unveraenderlich"
--
--   d) org_fence hält: Zeile einer fremden organization_id ist mit
--      anon/authenticated-Key nicht sichtbar.
-- ═══════════════════════════════════════════════════════════════════════════
