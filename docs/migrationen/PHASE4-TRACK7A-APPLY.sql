-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 4, Track 7a — zwei ausstehende Migrationen
-- Erstellt: 2026-08-23
--
-- ANWENDUNG: Supabase SQL-Editor (Projekt nnwyktkqibdjxgimjyuq) →
--            dieses gesamte Skript einfuegen → Run.
--
-- WARUM VON HAND: die Rolle service_role hat in diesem Projekt kein
-- CREATE auf schema public (alle Objekte gehoeren "postgres"). Der Weg
-- ueber scripts/apply-migration.mjs bricht deshalb ausdruecklich ab,
-- statt REVOKE/GRANT als WARNING durchlaufen zu lassen und Erfolg zu
-- melden. Ein Supabase-MCP steht in dieser Sitzung nicht zur Verfuegung.
--
-- Reihenfolge egal — die beiden Migrationen sind voneinander unabhaengig.
-- IDEMPOTENT: beide nutzen IF NOT EXISTS bzw. DO-Guards und koennen
-- gefahrlos erneut laufen.
--
-- DANACH PRUEFEN:
--     npm run verify:e2e-ketten
--   Erwartung nach dem Apply: PASS 38, FAIL 0, SKIP 0.
--   Vorher offen: K4_versuchsspur, K4_dead_letter_status,
--                 K4_versuche_nicht_negativ, K8_paarung.
--
-- Rollback (falls noetig, je einzeln):
--   supabase/migrations/20261001000001_rollback_mahnqueue_retry_dead_letter.sql
--   supabase/migrations/20261001010001_rollback_vpkzp_mandantenpaarung.sql
--
-- Beide Migrationen sind auf echtem PostgreSQL geprueft:
--   __tests__/migrations/phase4-track7a-rollback-pglite.test.ts (10 Tests)
--   __tests__/e2e/mahnkette-pglite.test.ts                      (20 Tests)
--   __tests__/e2e/vpkzp-kette-pglite.test.ts                    (36 Tests)
-- ═══════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION 1/2 — 20261001000000_mahnqueue_retry_dead_letter.sql
--
-- Die Mahn-Warteschlange kannte weder Versuchszaehler noch Endzustand.
-- Folge: was einmal auf 'fehlgeschlagen' stand, wurde nie wieder
-- angefasst (der Cron rief ohne `wiederholen` auf) — und wer doch
-- wiederholte, wiederholte ohne Obergrenze, auch an eine Adresse, die es
-- nicht gibt.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════
-- Mahn-Warteschlange: Wiederholung mit Obergrenze und Dead Letter
-- ═══════════════════════════════════════════════════════════════════════
--
-- BEFUND (Phase 4, Track 7a, Kette 4 "Mahnlauf"):
-- dunning_email_queue (20260918030000) kennt nur vier Zustaende —
-- wartend / versendet / fehlgeschlagen / storniert. Es gibt weder einen
-- Versuchszaehler noch eine Wartezeit noch einen Endzustand. Daraus
-- folgen zwei Fehler, die sich gegenseitig verdecken:
--
--   1. NICHTS WIRD WIEDERHOLT. app/api/cron/mahnlauf/route.ts ruft
--      verarbeiteMahnQueue() ohne `wiederholen` auf. Eine Zeile, die
--      einmal auf 'fehlgeschlagen' steht, wird von keinem Lauf je wieder
--      angefasst. Die Mahnung ist verloren, ohne dass es auffaellt.
--   2. WER DOCH WIEDERHOLT, WIEDERHOLT EWIG. reaktiviereFehlgeschlagene()
--      setzt ALLE fehlgeschlagenen Zeilen einer Organisation ohne
--      Bedingung auf 'wartend' zurueck. Eine dauerhaft unzustellbare
--      Adresse (Hard Bounce, 400 invalid_email) laeuft damit bei jedem
--      Aufruf erneut durch den Versand — ohne Obergrenze, ohne Ende.
--
-- Der Zustellweg der Benachrichtigungen (notification_delivery_log,
-- 20260927000000) loest genau dieselbe Aufgabe seit Phase 3 richtig:
-- Versuchszaehler, exponentielle Wartezeit, Obergrenze, Dead Letter mit
-- Grund. Diese Migration zieht die Mahn-Warteschlange auf denselben
-- Stand — bewusst mit denselben Begriffen, damit beide Wege gleich
-- gelesen werden koennen.
--
-- NEU
--   versuche              Zahl der tatsaechlich unternommenen Versuche.
--                         Ein uebersprungener Lauf (kein RESEND_API_KEY)
--                         zaehlt NICHT mit — sonst verbrennt eine
--                         fehlende Umgebungsvariable das Kontingent.
--   letzter_versuch_am    Zeitpunkt des letzten Versuchs.
--   naechster_versuch_ab  Fruehester Zeitpunkt des naechsten Versuchs
--                         (exponentiell: 1, 5, 15, 60, 240 Minuten).
--   status 'aufgegeben'   Dead Letter. Endzustand. Wird von keinem Lauf
--                         mehr aufgegriffen; fehler_details nennt den
--                         Grund. Nur eine ausdrueckliche Entscheidung
--                         der Verwaltung holt eine solche Zeile zurueck.
--
-- BESTAND: alle vorhandenen Zeilen bekommen versuche = 0. Das ist
-- absichtlich zu niedrig statt zu hoch geraten — eine bestehende
-- 'fehlgeschlagen'-Zeile bekommt damit ihre Versuche neu, statt
-- ungeprueft im Dead Letter zu landen. Die Zahl der bisherigen Versuche
-- ist nirgends festgehalten; sie laesst sich nicht rekonstruieren.
--
-- Rollback: 20261001000001_rollback_mahnqueue_retry_dead_letter.sql
-- ═══════════════════════════════════════════════════════════════════════


DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'dunning_email_queue'
  ) THEN
    RAISE EXCEPTION 'MAHNQUEUE_FEHLT: 20260918030000_dunning_email_queue.sql muss zuerst laufen.';
  END IF;
END;
$$;

-- ── 1) Versuchsspur ─────────────────────────────────────────────────
ALTER TABLE public.dunning_email_queue
  ADD COLUMN IF NOT EXISTS versuche             integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS letzter_versuch_am   timestamptz,
  ADD COLUMN IF NOT EXISTS naechster_versuch_ab timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'dunning_email_queue_versuche_nicht_negativ'
  ) THEN
    ALTER TABLE public.dunning_email_queue
      ADD CONSTRAINT dunning_email_queue_versuche_nicht_negativ CHECK (versuche >= 0);
  END IF;
END;
$$;

-- ── 2) Endzustand 'aufgegeben' in den Status-CHECK ──────────────────
-- Der CHECK aus 20260918030000 steht inline an der Spalte; Postgres hat
-- ihn selbst benannt. Statt den Namen zu raten wird jeder CHECK dieser
-- Tabelle gesucht, der die Statusliste traegt.
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.dunning_email_queue'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%wartend%'
  LOOP
    EXECUTE format('ALTER TABLE public.dunning_email_queue DROP CONSTRAINT %I', c.conname);
  END LOOP;

  ALTER TABLE public.dunning_email_queue
    ADD CONSTRAINT dunning_email_queue_status_check
    CHECK (status IN ('wartend', 'versendet', 'fehlgeschlagen', 'storniert', 'aufgegeben'));
END;
$$;

-- ── 3) Index fuer den Wiederholungslauf ─────────────────────────────
-- Der Lauf sucht je Organisation die faelligen fehlgeschlagenen Zeilen.
CREATE INDEX IF NOT EXISTS idx_dunning_email_queue_wiederholbar
  ON public.dunning_email_queue(organization_id, naechster_versuch_ab)
  WHERE status = 'fehlgeschlagen';

-- Dead Letter ist eine Betriebsansicht: „was ist liegengeblieben".
CREATE INDEX IF NOT EXISTS idx_dunning_email_queue_aufgegeben
  ON public.dunning_email_queue(organization_id, created_at)
  WHERE status = 'aufgegeben';

COMMENT ON COLUMN public.dunning_email_queue.versuche IS
  'Unternommene Versuche. Uebersprungene Laeufe (fehlender RESEND_API_KEY) '
  'zaehlen nicht mit. Ab MAX_VERSUCHE (lib/notifications/retry.ts) geht die '
  'Zeile in den Endzustand "aufgegeben".';
COMMENT ON COLUMN public.dunning_email_queue.naechster_versuch_ab IS
  'Fruehester Zeitpunkt des naechsten Versuchs. Exponentielle Wartezeit, '
  'gleiche Staffel wie der Zustellweg der Benachrichtigungen.';



-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION 2/2 — 20261001010000_vpkzp_mandantenpaarung.sql
--
-- vpkzp_buchungen hat zwei getrennte Fremdschluessel (organizations,
-- clients). Dass der Klient zu DIESEM Mandanten gehoert, prueft keiner —
-- die RESTRICTIVE org_fence auch nicht, sie sieht nur die
-- organization_id der Zeile. Ohne diesen Trigger schreibt der
-- Fortschreibungs-Trigger einen Jahresstand fuer einen fremden Klienten.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════
-- VP/KZP: client_id und organization_id muessen zusammenpassen
-- ═══════════════════════════════════════════════════════════════════════
--
-- BEFUND (Phase 4, Track 7a, Kette 8 "Mandantentrennung"):
-- vpkzp_buchungen hat zwei getrennte Fremdschluessel — einen auf
-- organizations(id), einen auf clients(id). Beide sind fuer sich erfuellt,
-- wenn beide Werte existieren. Dass der Klient auch ZU DIESEM Mandanten
-- gehoert, prueft niemand.
--
-- Folge: eine Zeile mit organization_id = A und client_id eines Klienten
-- von B wird angenommen. Der Fortschreibungs-Trigger legt daraufhin
-- unter Mandant A einen Jahresstand fuer einen fremden Klienten an. Die
-- RESTRICTIVE org_fence verhindert das NICHT — sie prueft nur die
-- organization_id der Zeile, und die ist ja A. Der Fence trennt
-- Mandanten, er prueft keine Paarungen.
--
-- Erreichbar ist das ueber jeden Weg, der eine client_id entgegennimmt
-- und die organization_id selbst setzt — also ueber den service-role-
-- Client der Anwendung, den SQL-Editor und jeden Import.
--
-- WARUM EIN TRIGGER UND KEIN FREMDSCHLUESSEL
-- Der saubere Weg waere ein zusammengesetzter Fremdschluessel auf
-- clients(id, organization_id). Der braucht dort einen UNIQUE-Index ueber
-- beide Spalten — eine Schemaaenderung an einer Kerntabelle, die jede
-- andere Beziehung mittraegt. Der Trigger erreicht dasselbe Ergebnis,
-- ohne clients anzufassen.
--
-- Rollback: 20261001010001_rollback_vpkzp_mandantenpaarung.sql
-- ═══════════════════════════════════════════════════════════════════════


DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'vpkzp_buchungen'
  ) THEN
    RAISE EXCEPTION 'VPKZP_BASIS_FEHLT: 20260926000000_vpkzp_zeitraum_budget.sql muss zuerst laufen.';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_vpkzp_mandantenpaarung()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $fn$
DECLARE
  v_org uuid;
BEGIN
  SELECT organization_id INTO v_org
    FROM public.clients
   WHERE id = NEW.client_id;

  -- Kein Klient: der Fremdschluessel faengt das ohnehin ab. Hier nichts
  -- zu entscheiden.
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Ein Klient ohne Mandanten ist Altbestand. Er wird NICHT stillschweigend
  -- der Zeile zugeschlagen, aber auch nicht zum Anlass genommen, eine
  -- ansonsten stimmige Buchung abzulehnen — sonst blockierte diese
  -- Migration den laufenden Betrieb fuer Datensaetze, die schon vor ihr
  -- unvollstaendig waren.
  IF v_org IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_org <> NEW.organization_id THEN
    RAISE EXCEPTION
      'VPKZP_MANDANT_PASST_NICHT: Klient % gehoert zu Mandant %, die Buchung steht auf Mandant %. Eine Buchung ueber die Mandantengrenze hinweg wuerde den Jahresstand eines fremden Klienten fortschreiben.',
      NEW.client_id, v_org, NEW.organization_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_vpkzp_mandantenpaarung ON public.vpkzp_buchungen;
CREATE TRIGGER trg_vpkzp_mandantenpaarung
  BEFORE INSERT OR UPDATE OF client_id, organization_id ON public.vpkzp_buchungen
  FOR EACH ROW EXECUTE FUNCTION public.trg_vpkzp_mandantenpaarung();

COMMENT ON FUNCTION public.trg_vpkzp_mandantenpaarung() IS
  'Erzwingt, dass vpkzp_buchungen.client_id zu vpkzp_buchungen.organization_id '
  'gehoert. Die RESTRICTIVE org_fence prueft nur die organization_id der '
  'Zeile und faengt eine falsche Paarung nicht ab.';

