-- ═══════════════════════════════════════════════════════════════════════
-- EINE Warteliste: state_waitlist um den Kunden-Funnel erweitern
-- ═══════════════════════════════════════════════════════════════════════
--
-- ANLASS
-- Es waren zwei Strukturen im Umlauf:
--
--   public.state_waitlist      LIVE, 0 Zeilen, seit 20260808100000.
--                              Haengt am Expansion-Modul: /api/expansion/waitlist
--                              schreibt hinein, notify-waitlist liest daraus,
--                              /admin/expansion zeigt sie. RLS und vier
--                              Policies stehen.
--   public.waitlist_customers  NUR als Migration 20261031000000, NIE angewendet.
--                              Vom /warteliste-Funnel gebraucht.
--
-- Zwei Tabellen fuer denselben Geschaeftsvorgang — „ich moechte
-- benachrichtigt werden, sobald ihr bei mir startet" — sind eine Tabelle zu
-- viel. Wer dann fragt „wie viele Vormerkungen haben wir?", bekommt zwei
-- Antworten. Deshalb: die bestehende erweitern, die geplante zuruecknehmen.
--
-- ── WAS state_waitlist SCHON KONNTE ───────────────────────────────────
-- name, email, telefon, plz, ort, bundesland, interesse, quelle, user_id,
-- benachrichtigen, notified_at — dazu ein UNIQUE auf
-- (organization_id, bundesland, email) gegen Doppeleintraege.
--
-- ── WAS GEFEHLT HAT (und hier dazukommt) ──────────────────────────────
--   pflegegrad              freiwillige Angabe aus dem Formular
--   gewuenschte_leistungen  Mehrfachauswahl; `interesse` ist einwertig und
--                           meint etwas anderes (Kasse/privat), nicht die
--                           gewuenschte Leistung
--   nachricht               Freitext des Interessenten
--   status                  Bearbeitungsstand der Verwaltung. `notified_at`
--                           beantwortet nur „schon benachrichtigt?", nicht
--                           „wo steht der Vorgang?"
--   utm_medium, utm_campaign   `quelle` traegt nur eine der drei Angaben
--
-- ── WARUM KEIN NOT NULL UND KEIN NEUES PFLICHTFELD ────────────────────
-- Alle Spalten sind nullable mit Default. Die Tabelle steht live; eine
-- Pflichtspalte wuerde jeden bestehenden Schreibweg brechen — besonders
-- /api/expansion/waitlist, der von diesen Feldern nichts weiss und auch
-- nichts davon wissen muss.
--
-- Rollback: 20261102000001_rollback_state_waitlist_kundenfunnel.sql
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.state_waitlist
  ADD COLUMN IF NOT EXISTS pflegegrad             text,
  ADD COLUMN IF NOT EXISTS gewuenschte_leistungen text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS nachricht              text,
  ADD COLUMN IF NOT EXISTS status                 text NOT NULL DEFAULT 'neu',
  ADD COLUMN IF NOT EXISTS utm_medium             text,
  ADD COLUMN IF NOT EXISTS utm_campaign           text;

DO $$
BEGIN
  -- Wortschatz an der Datenbank festhalten: ein freier Wert erzeugt sonst
  -- eine Zeile, welche die Oberflaeche nicht kennt — der Eintrag ist dann
  -- unsichtbar, ohne geloescht zu sein. Dieselbe Ueberlegung wie bei
  -- lead_inquiries_status_check.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'state_waitlist_status_check') THEN
    ALTER TABLE public.state_waitlist
      ADD CONSTRAINT state_waitlist_status_check
      CHECK (status IN ('neu', 'kontaktiert', 'vorgemerkt', 'aktiviert', 'abgemeldet'));
  END IF;

  -- '0' = kein Pflegegrad, 'unbekannt' = weiss nicht. Beides sind echte
  -- Antworten und keine fehlenden Werte.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'state_waitlist_pflegegrad_check') THEN
    ALTER TABLE public.state_waitlist
      ADD CONSTRAINT state_waitlist_pflegegrad_check
      CHECK (pflegegrad IS NULL OR pflegegrad IN ('0','1','2','3','4','5','unbekannt'));
  END IF;
END;
$$;

-- Posteingang der Verwaltung: offene Vormerkungen, neueste zuerst.
CREATE INDEX IF NOT EXISTS idx_state_waitlist_status
  ON public.state_waitlist (organization_id, created_at DESC)
  WHERE status <> 'abgemeldet';

COMMENT ON COLUMN public.state_waitlist.gewuenschte_leistungen IS
  'Mehrfachauswahl aus WARTELISTE_LEISTUNGEN (lib/warteliste/katalog.ts). '
  'NICHT zu verwechseln mit `interesse` — das ist einwertig und meint die '
  'Finanzierungsart (kasse/privat/beides/mitarbeit).';

COMMENT ON COLUMN public.state_waitlist.status IS
  'Bearbeitungsstand der Verwaltung: neu → kontaktiert → vorgemerkt → '
  'aktiviert, Ausstieg abgemeldet. Unabhaengig von `notified_at`, das nur '
  'den Regionalstart-Versand des Expansion-Moduls festhaelt.';

COMMIT;

-- ══════════════════════════════════════════════════════════════════════
-- HINWEIS ZUR ZURUECKGENOMMENEN MIGRATION
-- ══════════════════════════════════════════════════════════════════════
-- 20261031000000_waitlist_customers.sql wird NICHT mehr angewendet. Die
-- Datei bleibt als Beleg im Repository stehen und traegt im Kopf einen
-- Vermerk; der Code spricht sie nicht mehr an. Wer sie versehentlich
-- doch anwendet, erzeugt eine zweite, leere Wartelistentabelle — dann
-- 20261031000001_rollback_waitlist_customers.sql ausfuehren.
