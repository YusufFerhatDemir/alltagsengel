-- ═══════════════════════════════════════════════════════════════════════
-- P5 Auto-Kommunikation auf 16/16 bringen
-- ═══════════════════════════════════════════════════════════════════════
--
-- 1. profiles.welcome_email_sent_at — Idempotenz-Schutz fuer Welcome-Mail
-- 2. clients.user_id Fallback-Sicht fuer Termin-Erinnerungen
--
-- KEINE DATEN WERDEN VERAENDERT: Die Migration fuegt nur Spalten hinzu
-- und erstellt eine sichere View. Bestehende Datensaetze bleiben
-- unveraendert. Die user_id-Verknuepfung laueft NICHT automatisch —
-- sie wird nur ueber eine sichere Admin-Funktion angeboten.
-- ═══════════════════════════════════════════════════════════════════════

-- 1. Idempotenz-Spalte fuer Welcome-Mail
-- Zeitstempel statt Boolean, damit erkennbar ist, WANN die Mail rausging.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS welcome_email_sent_at timestamptz;

COMMENT ON COLUMN public.profiles.welcome_email_sent_at IS
  'Zeitstempel des Welcome-Mail-Versands. NULL = noch nicht gesendet. '
  'Dient als Idempotenz-Sperre: der Versandweg setzt den Wert atomar '
  'mit WHERE welcome_email_sent_at IS NULL.';

-- 2. Sichere Funktion zum Verknuepfen von clients.user_id
-- Verknuepft Klienten mit ihrem Auth-Nutzer anhand EXAKTER E-Mail-Uebereinstimmung.
-- Sicherheitsregeln:
--   a) Nur Klienten deren user_id noch NULL ist werden angefasst
--   b) Nur Klienten mit nicht-leerer E-Mail
--   c) Nur exakte Uebereinstimmung mit auth.users.email
--   d) Nur wenn genau EIN Auth-User diese E-Mail hat (Eindeutigkeit)
--   e) Nur innerhalb der eigenen Organisation (org_fence)
--   f) Gibt Bericht zurueck: wie viele verknuepft, wie viele uebersprungen
CREATE OR REPLACE FUNCTION public.safe_link_clients_user_id(p_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_verknuepft int := 0;
  v_uebersprungen int := 0;
  v_mehrdeutig int := 0;
  rec record;
BEGIN
  FOR rec IN
    SELECT c.id AS client_id, c.email AS client_email
    FROM clients c
    WHERE c.organization_id = p_organization_id
      AND c.user_id IS NULL
      AND c.email IS NOT NULL
      AND trim(c.email) <> ''
  LOOP
    DECLARE
      v_user_id uuid;
      v_count int;
    BEGIN
      -- Exakte Uebereinstimmung, case-insensitive
      SELECT count(*), min(au.id)
      INTO v_count, v_user_id
      FROM auth.users au
      WHERE lower(trim(au.email)) = lower(trim(rec.client_email));

      IF v_count = 1 AND v_user_id IS NOT NULL THEN
        UPDATE clients
        SET user_id = v_user_id, updated_at = now()
        WHERE id = rec.client_id
          AND user_id IS NULL;  -- Nochmal pruefen gegen Race Condition
        IF FOUND THEN
          v_verknuepft := v_verknuepft + 1;
        ELSE
          v_uebersprungen := v_uebersprungen + 1;
        END IF;
      ELSIF v_count > 1 THEN
        v_mehrdeutig := v_mehrdeutig + 1;
      ELSE
        v_uebersprungen := v_uebersprungen + 1;
      END IF;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'verknuepft', v_verknuepft,
    'uebersprungen', v_uebersprungen,
    'mehrdeutig', v_mehrdeutig,
    'organization_id', p_organization_id
  );
END;
$$;

-- Nur service_role darf diese Funktion ausfuehren
REVOKE ALL ON FUNCTION public.safe_link_clients_user_id(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.safe_link_clients_user_id(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.safe_link_clients_user_id(uuid) FROM authenticated;
