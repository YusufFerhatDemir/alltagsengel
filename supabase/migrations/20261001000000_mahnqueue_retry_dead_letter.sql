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

BEGIN;

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

COMMIT;
