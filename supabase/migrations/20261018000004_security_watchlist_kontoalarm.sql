-- ════════════════════════════════════════════════════════════════════
-- Kontobezogener Sicherheitsalarm (ACCOUNT_SECURITY_ALERTS)
-- ════════════════════════════════════════════════════════════════════
--
-- WAS DIESE MIGRATION HINZUFUEGT
-- security_watchlist bekommt drei Spalten, die den Unterschied zwischen
-- „privilegiertes Konto" und „ausdruecklich ueberwachtes Konto"
-- ausdruecken:
--
--   alle_ereignisse   Meldet nicht nur die im Katalog als meldepflichtig
--                     gefuehrten Ereignisse, sondern den vollen
--                     Ueberwachungssatz (Anmeldung, Fehlversuch,
--                     Abmeldung, App-Start, Geraetewechsel,
--                     Kontoaenderung, Rollenwechsel …). Siehe
--                     UEBERWACHUNGS_EREIGNISSE in
--                     lib/security/ereignisse.ts.
--
--   ohne_sperrfrist   Umgeht die 12-Stunden-Bremse. Bei einem
--                     ueberwachten Konto ist „jede Anmeldung" woertlich
--                     gemeint — sonst waere die Ueberwachung nach der
--                     ersten Meldung des Tages blind.
--
--   email_kontrolle   Die Adresse, wie sie beim Anlegen ANGEGEBEN wurde.
--                     Nicht zum Auffinden des Kontos (das laeuft ueber
--                     user_id), sondern als Gegenprobe: weicht sie von
--                     der Adresse des Kontos ab, wurde beim Einrichten
--                     eine andere Person gemeint als die eingetragene.
--                     Genau dieser Fall ist am 30.08.2026 eingetreten —
--                     die beauftragte Adresse trug ein doppeltes 'a',
--                     zu dem es kein Konto gibt.
--
-- WARUM EINE EIGENE MIGRATION
-- 20261018000002 ist zum Zeitpunkt dieser Datei noch nicht angewendet.
-- Sie koennte es aber jederzeit sein — eine bereits angewendete
-- Migration nachtraeglich zu aendern, waere ein Stand, den niemand mehr
-- nachvollziehen kann. Additive Migration statt Umschreiben.
--
-- KEIN PERSONENBEZUG IM REPOSITORY
-- Diese Datei traegt KEINE Adresse und KEINE Konto-Kennung. Wer
-- ueberwacht wird, ist eine Betriebsentscheidung und steht in der
-- Datenbank — eingetragen ueber `npm run security:watchlist` oder die
-- Oberflaeche unter /admin/security/audit-log. Ein Name in einer
-- Migration waere ein Personendatum in der Versionsgeschichte, das sich
-- nicht mehr loeschen laesst.
-- ════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.security_watchlist
  ADD COLUMN IF NOT EXISTS alle_ereignisse boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS ohne_sperrfrist boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_kontrolle text;

COMMENT ON COLUMN public.security_watchlist.aktiv IS
  'ACCOUNT_SECURITY_ALERTS fuer dieses Konto. true = Meldungen an, '
  'false = Eintrag bleibt bestehen, meldet aber nicht.';

COMMENT ON COLUMN public.security_watchlist.alle_ereignisse IS
  'true = voller Ueberwachungssatz (UEBERWACHUNGS_EREIGNISSE in '
  'lib/security/ereignisse.ts). false = nur die im Katalog als '
  'meldepflichtig gefuehrten Ereignisse, wie bei privilegierten Konten.';

COMMENT ON COLUMN public.security_watchlist.ohne_sperrfrist IS
  'true = keine 12-Stunden-Bremse. Jede Anmeldung meldet.';

COMMENT ON COLUMN public.security_watchlist.email_kontrolle IS
  'Adresse wie beim Anlegen angegeben. Gegenprobe zur Adresse des '
  'Kontos — NICHT die Kennung, ueber die das Konto gefunden wird.';

-- Der Meldeweg fragt bei JEDEM Sicherheitsereignis „ist dieses Konto
-- ueberwacht?". Ohne Index waere das ein Sequential Scan pro Anmeldung.
CREATE INDEX IF NOT EXISTS idx_security_watchlist_aktiv
  ON public.security_watchlist(user_id) WHERE aktiv;

-- ─────────────────────────────────────────────────────────────────────
-- Kontodaten-Aenderungen aus der Datenbank heraus mitschreiben
-- ─────────────────────────────────────────────────────────────────────
-- WARUM EIN TRIGGER UND NICHT EINE ROUTE
-- Die Profilseiten von Engeln, Kundschaft und Fahrdienst schreiben mit
-- dem BROWSER-Client direkt in public.profiles (RLS erlaubt die eigene
-- Zeile). Es gibt dort keine Serverroute, in die sich ein Aufruf
-- einhaengen liesse — ein Hook im Anwendungscode wuerde genau die
-- haeufigste Aenderung nicht sehen. Der Trigger sieht jede, egal ueber
-- welchen Weg sie kommt.
--
-- WAS ER SCHREIBT
-- Je geaenderter Spalte ein Ereignis mit Vorher/Nachher-Wert:
--   email      → email_change        (kritisch: wer die Adresse aendert,
--                                     bekommt danach den Reset-Link)
--   phone      → phone_change
--   role       → role_change         (kritisch)
--   Name       → account_data_change
--
-- WAS ER NICHT SCHREIBT
-- Keine IP, kein User-Agent, keine Plattform: die Datenbank sieht den
-- Aufruf nicht. Die Zeile traegt deshalb platform='server'. Wer den
-- Weg braucht, findet ihn im Anwendungs-Ereignis derselben Sekunde.
--
-- Die MAIL zu diesen Ereignissen verschickt der Nachzuegler-Lauf
-- (lib/security/nachzuegler.ts, alle 5 Minuten ueber
-- /api/cron/zustellung-retry) — ein Trigger kann keine Mail senden.
CREATE OR REPLACE FUNCTION public.security_audit_profil_aenderung()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_org uuid;
BEGIN
  -- Nur Zeilen, zu denen es ueberhaupt etwas zu melden gibt: entweder
  -- ein ueberwachtes Konto oder eine Verwaltungsrolle. Sonst schriebe
  -- jede Adressaenderung jedes Kunden in die Sicherheitsspur.
  IF NOT EXISTS (
        SELECT 1 FROM public.security_watchlist w
         WHERE w.user_id = NEW.id AND w.aktiv
      )
     AND COALESCE(NEW.role, '') NOT IN ('superadmin','admin','pdl','qm','buchhaltung')
     AND COALESCE(OLD.role, '') NOT IN ('superadmin','admin','pdl','qm','buchhaltung')
  THEN
    RETURN NEW;
  END IF;

  SELECT organization_id INTO v_org
    FROM public.organization_members WHERE user_id = NEW.id LIMIT 1;

  IF NEW.email IS DISTINCT FROM OLD.email THEN
    INSERT INTO public.security_audit_log (
      user_id, user_email, organization_id, event_type, event_category,
      platform, device_info, metadata, severity
    ) VALUES (
      NEW.id, NEW.email, v_org, 'email_change', 'data', 'server',
      jsonb_build_object('mac_address', 'not_available', 'quelle', 'db_trigger'),
      jsonb_build_object('funktion', 'profiles.email', 'vorher', OLD.email,
                         'nachher', NEW.email, 'ergebnis', 'SUCCESS'),
      'critical'
    );
  END IF;

  IF NEW.phone IS DISTINCT FROM OLD.phone THEN
    INSERT INTO public.security_audit_log (
      user_id, user_email, organization_id, event_type, event_category,
      platform, device_info, metadata, severity
    ) VALUES (
      NEW.id, NEW.email, v_org, 'phone_change', 'data', 'server',
      jsonb_build_object('mac_address', 'not_available', 'quelle', 'db_trigger'),
      jsonb_build_object('funktion', 'profiles.phone', 'vorher', OLD.phone,
                         'nachher', NEW.phone, 'ergebnis', 'SUCCESS'),
      'warning'
    );
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    INSERT INTO public.security_audit_log (
      user_id, user_email, organization_id, event_type, event_category,
      platform, device_info, metadata, severity
    ) VALUES (
      NEW.id, NEW.email, v_org, 'role_change', 'role', 'server',
      jsonb_build_object('mac_address', 'not_available', 'quelle', 'db_trigger'),
      jsonb_build_object('funktion', 'profiles.role', 'vorher', OLD.role,
                         'nachher', NEW.role, 'ergebnis', 'SUCCESS'),
      'critical'
    );
  END IF;

  IF NEW.first_name IS DISTINCT FROM OLD.first_name
     OR NEW.last_name IS DISTINCT FROM OLD.last_name THEN
    INSERT INTO public.security_audit_log (
      user_id, user_email, organization_id, event_type, event_category,
      platform, device_info, metadata, severity
    ) VALUES (
      NEW.id, NEW.email, v_org, 'account_data_change', 'data', 'server',
      jsonb_build_object('mac_address', 'not_available', 'quelle', 'db_trigger'),
      jsonb_build_object(
        'funktion', 'profiles.name',
        'vorher', btrim(coalesce(OLD.first_name,'') || ' ' || coalesce(OLD.last_name,'')),
        'nachher', btrim(coalesce(NEW.first_name,'') || ' ' || coalesce(NEW.last_name,'')),
        'ergebnis', 'SUCCESS'),
      'warning'
    );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.security_audit_profil_aenderung() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_security_audit_profil_aenderung ON public.profiles;
CREATE TRIGGER trg_security_audit_profil_aenderung
  AFTER UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.security_audit_profil_aenderung();

COMMIT;
