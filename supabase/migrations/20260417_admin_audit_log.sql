-- ═══════════════════════════════════════════════════════════
-- AUTH-012: Admin-Audit-Log (Compliance + Forensik)
--
-- Ziel:
--   Jede Admin-initiierte Zustandsänderung (Passwort-Reset, Rollen-
--   wechsel, User-Löschung, DSGVO-Datenexport) muss eine unveränderbare
--   Zeile in `mis_audit_log` erzeugen.
--
-- Anforderungen (DSGVO Art. 30 + ISO 27001 A.12.4.1):
--   - Actor, Ziel, Aktion, Before/After-Snapshot, IP, User-Agent, TS
--   - Read: nur Admin/Superadmin (keine externen Clients)
--   - Write: nur Server (service_role) über Helper-Funktion
--   - Update/Delete: für ALLE blockiert (auch service_role) per Trigger.
--     Einziger Ausnahme: SECURITY-DEFINER-Fn `admin_audit_log_purge()`
--     für gesetzlich erlaubte Retention-Cleanups nach 10 Jahren.
--
-- Analogie:
--   Ein Audit-Log ist wie ein Grundbuch. Jeder Eintrag wird in Stein
--   (= Append-Only) gemeißelt. Wer später sagen will „ich war's nicht",
--   kann nicht einfach seine Zeile ausradieren — und der Notar
--   (= unser Trigger) lässt auch „schnell mal nachbessern" nicht zu.
-- ═══════════════════════════════════════════════════════════

-- ── Schema erweitern ──────────────────────────────────────────
-- user_agent mitloggen (vorher nur ip_address da)
ALTER TABLE public.mis_audit_log
  ADD COLUMN IF NOT EXISTS user_agent text;

-- target_id separat von entity_id: entity_id = das veränderte Objekt,
-- target_id = die betroffene Person (oft gleich, manchmal verschieden,
-- z. B. wenn ein Admin die Rolle eines Profils ändert → entity = Profile,
-- target = User dahinter).
ALTER TABLE public.mis_audit_log
  ADD COLUMN IF NOT EXISTS target_id uuid;

-- target_email als Snapshot: wenn das Profil später gelöscht wird,
-- können Ermittler trotzdem sehen, welche E-Mail betroffen war.
ALTER TABLE public.mis_audit_log
  ADD COLUMN IF NOT EXISTS target_email text;

-- actor_role: erleichtert Queries „was haben Admins vs. Superadmins gemacht?"
ALTER TABLE public.mis_audit_log
  ADD COLUMN IF NOT EXISTS actor_role text;

-- entity_id darf NULL sein (z. B. rate-limit-reset hat keinen Ziel-User)
ALTER TABLE public.mis_audit_log
  ALTER COLUMN entity_id DROP NOT NULL;

-- Neue Action-Typen für Auth-Events zulassen.
-- Wir droppen den alten CHECK und setzen einen erweiterten.
ALTER TABLE public.mis_audit_log
  DROP CONSTRAINT IF EXISTS mis_audit_log_action_check;

ALTER TABLE public.mis_audit_log
  ADD CONSTRAINT mis_audit_log_action_check
  CHECK (action IN (
    -- Legacy MIS-Actions (weiter erlaubt für Abwärts-Kompatibilität)
    'create','read','update','delete','download','approve','reject','share','archive',
    -- Auth-Events (AUTH-012)
    'password_reset',      -- Admin setzt Passwort eines anderen Users zurück
    'role_grant',          -- Admin oder Superadmin vergibt Admin-Rolle
    'role_revoke',         -- Admin oder Superadmin entzieht Admin-Rolle
    'user_delete',         -- Admin löscht fremden User
    'user_self_delete',    -- User löscht sich selbst (DSGVO Art. 17)
    'data_export',         -- DSGVO Art. 15 / Art. 20 Datenexport
    'admin_login',         -- Admin-Login (optional, für Forensik)
    'rate_limit_reset'     -- Admin entsperrt Login-Rate-Limit
  ));

-- Zusätzliche Indizes für häufige Forensik-Queries
CREATE INDEX IF NOT EXISTS idx_audit_target ON public.mis_audit_log(target_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON public.mis_audit_log(action);

-- ── RLS: alte „FOR ALL"-Policy ersetzen ───────────────────────
-- Die bestehende Policy `Admin full access on mis_audit_log FOR ALL`
-- ist zu permissiv — sie erlaubt Admins auch UPDATE + DELETE. Ein
-- Audit-Log muss append-only sein, sonst kann ein bösartiger Admin
-- seine eigene Spur tilgen.
DROP POLICY IF EXISTS "Admin full access on mis_audit_log" ON public.mis_audit_log;

-- SELECT: Admin + Superadmin dürfen lesen
DROP POLICY IF EXISTS "audit_select_admin" ON public.mis_audit_log;
CREATE POLICY "audit_select_admin" ON public.mis_audit_log
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin','superadmin')
    )
  );

-- INSERT: verboten via RLS für alle normalen Clients.
-- Server nutzt service_role (bypasst RLS) oder die Helper-Fn unten.
-- Kein INSERT-Policy = nur service_role darf einfügen.

-- UPDATE + DELETE: KEINE Policy → für alle Non-Service-Clients geblockt.
-- Zusätzlich Trigger unten, der auch service_role stoppt (außer via
-- admin_audit_log_purge()).

-- ── Immutability-Trigger ──────────────────────────────────────
-- Kernidee: auch service_role bekommt hier „nein" zu hören. Einziger
-- Bypass ist ein expliziter GUC, den nur die Purge-Fn setzt.
CREATE OR REPLACE FUNCTION public.mis_audit_log_prevent_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- GUC-Check: wenn die Purge-Fn ihn gesetzt hat, ist es ein erlaubter
  -- Retention-Cleanup. In allen anderen Fällen → harter Block.
  IF current_setting('app.audit_log_purge', true) = 'on' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  RAISE EXCEPTION 'mis_audit_log ist append-only — % nicht erlaubt (AUTH-012)', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS trg_mis_audit_log_no_update ON public.mis_audit_log;
CREATE TRIGGER trg_mis_audit_log_no_update
  BEFORE UPDATE ON public.mis_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.mis_audit_log_prevent_mutation();

DROP TRIGGER IF EXISTS trg_mis_audit_log_no_delete ON public.mis_audit_log;
CREATE TRIGGER trg_mis_audit_log_no_delete
  BEFORE DELETE ON public.mis_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.mis_audit_log_prevent_mutation();

-- ── Retention-Purge (10 Jahre, DSGVO-Kompatibilität) ──────────
-- Gesetzliche Aufbewahrungsfristen für Audit-Logs im Gesundheitswesen
-- variieren (HGB 10 Jahre, DSGVO Art. 17 „so lange wie nötig").
-- Diese Fn ist die EINZIGE legitime Möglichkeit, Zeilen zu löschen.
-- Darf nur von Superadmins via manueller SQL-Session ausgeführt werden.
CREATE OR REPLACE FUNCTION public.admin_audit_log_purge(older_than interval)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer;
  v_caller_role text;
BEGIN
  -- Nur Superadmin darf purgen
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
  IF v_caller_role IS DISTINCT FROM 'superadmin' THEN
    RAISE EXCEPTION 'Nur Superadmins dürfen das Audit-Log purgen';
  END IF;

  -- Mindest-Retention: 10 Jahre (kürzere Intervalle abgelehnt)
  IF older_than < interval '10 years' THEN
    RAISE EXCEPTION 'Mindest-Retention 10 Jahre — Purge abgelehnt';
  END IF;

  -- Bypass-GUC für den Trigger setzen (nur in dieser Transaktion)
  PERFORM set_config('app.audit_log_purge', 'on', true);

  DELETE FROM public.mis_audit_log WHERE created_at < now() - older_than;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  -- Selbst-Audit: dokumentiere den Purge
  INSERT INTO public.mis_audit_log (
    entity_type, entity_id, action, actor_id, actor_role, details, created_at
  ) VALUES (
    'audit_log', NULL, 'delete', auth.uid(), v_caller_role,
    jsonb_build_object('purged_rows', v_deleted, 'older_than', older_than::text),
    now()
  );

  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_audit_log_purge(interval) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_audit_log_purge(interval) TO authenticated;

-- ── Kommentare für Supabase-Dashboard ─────────────────────────
COMMENT ON TABLE public.mis_audit_log IS
  'Append-only Audit-Log für alle Admin-Aktionen. Read: Admin/Superadmin. Write: nur Server. Update/Delete: via Trigger geblockt (AUTH-012).';
COMMENT ON COLUMN public.mis_audit_log.target_id IS
  'User-ID der betroffenen Person (AUTH-012). Kann gleich entity_id sein.';
COMMENT ON COLUMN public.mis_audit_log.target_email IS
  'E-Mail-Snapshot der betroffenen Person (überlebt Profil-Löschung).';
COMMENT ON COLUMN public.mis_audit_log.actor_role IS
  'Rolle des Actors zum Zeitpunkt der Aktion (admin/superadmin/…).';
COMMENT ON COLUMN public.mis_audit_log.user_agent IS
  'Browser-/Client-Info zum Actor.';
