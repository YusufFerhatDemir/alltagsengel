-- ════════════════════════════════════════════════════════════════════
-- ROLLBACK zu 20261018000002_security_audit_log.sql
-- ════════════════════════════════════════════════════════════════════
--
-- ACHTUNG — DATENVERLUST: dieser Rollback wirft die Sicherheitsspur weg.
-- Wer ihn faehrt, verliert das Protokoll. Vorher exportieren
-- (/admin/security/audit-log ⇒ CSV oder
--  `SELECT * FROM public.security_audit_log` als Sicherung).
--
-- Die Rollenmatrix bleibt unangetastet — sie wird von
-- 20261018000001_rollback_rollenmatrix_sicherheit_lesen.sql
-- zurueckgesetzt. Wer nur die Tabellen entfernen will, faehrt allein
-- diese Datei; 'sicherheit.lesen' bleibt dann als Berechtigung stehen,
-- ohne dass es etwas zu lesen gaebe. Das ist harmlos und beabsichtigt.
-- ════════════════════════════════════════════════════════════════════

BEGIN;

DO $$ BEGIN
  BEGIN
    DROP TRIGGER IF EXISTS trg_security_audit_auth_anmeldung ON auth.users;
  EXCEPTION WHEN insufficient_privilege OR undefined_table THEN
    RAISE WARNING 'Trigger auf auth.users konnte nicht entfernt werden (fehlende Rechte).';
  END;
END $$;

DROP FUNCTION IF EXISTS public.security_audit_auth_anmeldung();
DROP FUNCTION IF EXISTS public.security_audit_log_aufraeumen(integer);
DROP FUNCTION IF EXISTS public.log_security_event(uuid, text, text, jsonb, text, uuid, text, inet, text, text, jsonb, text, text);

DROP TRIGGER IF EXISTS trg_security_audit_log_unveraenderlich ON public.security_audit_log;
DROP FUNCTION IF EXISTS public.security_audit_log_unveraenderlich();

DROP TABLE IF EXISTS public.security_watchlist;
DROP TABLE IF EXISTS public.security_known_devices;
DROP TABLE IF EXISTS public.security_audit_log;

-- Erst NACH den Tabellen: die Policies haengen an dieser Funktion,
-- solange die Tabellen stehen ("cannot drop function ... because other
-- objects depend on it").
DROP FUNCTION IF EXISTS public.ist_sicherheitsadmin();

COMMIT;
