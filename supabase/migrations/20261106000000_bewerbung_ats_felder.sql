-- ATS-Arbeitsfelder als echte Spalten — Zielform.
--
-- STAND: geschrieben 13.09.2026, NICHT angewendet. DDL ist aus der
-- Agentensitzung nicht moeglich (42501); der SQL-Editor ist der Weg.
--
-- WAS HEUTE GILT
-- Die fuenfzehn Arbeitsfelder liegen in `lead_inquiries.bewerbung_daten.ats`
-- (jsonb) — derselbe Weg wie `pipeline`, `prio` und `blocker`. Der Code in
-- lib/bewerbung/ats-felder.ts liest und schreibt dort. Diese Migration
-- aendert daran nichts; sie beschreibt, wohin die Felder gehoeren, wenn
-- jemand DDL ausfuehren kann.
--
-- WARUM UEBERHAUPT SPALTEN
-- jsonb traegt die Daten zuverlaessig, aber drei Dinge kann es nicht:
--   1. einen Index auf `startdatum` fuer „wer kann ab naechster Woche"
--   2. einen CHECK auf `prioritaet` zwischen 1 und 5
--   3. eine Fremdschluesselpruefung auf `fz_status`
-- Solange die Zahl der Bewerbungen zweistellig ist, faellt das nicht ins
-- Gewicht. Bei vierstelliger Zahl schon.
--
-- VIER FELDER FEHLEN HIER ABSICHTLICH
-- qualifikation, fuehrerschein, verfuegbarkeit und sprachen stehen bereits
-- im Formularkatalog (`bewerbung_daten`). Sie hier zu spiegeln hiesse, sie
-- an zwei Orten pflegen zu muessen — und an einem davon veralten zu lassen.
--
-- Rollback: 20261106000001_rollback_bewerbung_ats_felder.sql

ALTER TABLE public.lead_inquiries
  ADD COLUMN IF NOT EXISTS ats_startdatum        date,
  ADD COLUMN IF NOT EXISTS ats_fz_status         text,
  ADD COLUMN IF NOT EXISTS ats_fz_datum          date,
  ADD COLUMN IF NOT EXISTS ats_erfahrung_jahre   smallint,
  ADD COLUMN IF NOT EXISTS ats_mobilitaet        text,
  ADD COLUMN IF NOT EXISTS ats_stunden_pro_woche smallint,
  ADD COLUMN IF NOT EXISTS ats_einsatzgebiet     text[],
  ADD COLUMN IF NOT EXISTS ats_notizen           text,
  ADD COLUMN IF NOT EXISTS ats_letzter_kontakt   timestamptz,
  ADD COLUMN IF NOT EXISTS ats_naechste_aktion   text,
  ADD COLUMN IF NOT EXISTS ats_prioritaet        smallint;

-- CHECKs: dieselben Grenzen, die pruefeAtsFelder() im Code zieht. Zwei
-- Riegel an derselben Regel sind kein Zufall — der Code faengt den
-- Tippfehler in der Maske, die Datenbank den Schreibweg, der an der Maske
-- vorbeigeht (Dienstschluessel, Import, Konsole).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'lead_inquiries_ats_fz_status_check') THEN
    ALTER TABLE public.lead_inquiries
      ADD CONSTRAINT lead_inquiries_ats_fz_status_check
      CHECK (ats_fz_status IS NULL OR ats_fz_status IN
             ('nicht_beantragt', 'beantragt', 'eingetroffen', 'abgelehnt'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'lead_inquiries_ats_mobilitaet_check') THEN
    ALTER TABLE public.lead_inquiries
      ADD CONSTRAINT lead_inquiries_ats_mobilitaet_check
      CHECK (ats_mobilitaet IS NULL OR ats_mobilitaet IN
             ('eigenes_auto', 'oepnv', 'fahrrad', 'zu_fuss', 'unklar'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'lead_inquiries_ats_prioritaet_check') THEN
    ALTER TABLE public.lead_inquiries
      ADD CONSTRAINT lead_inquiries_ats_prioritaet_check
      CHECK (ats_prioritaet IS NULL OR ats_prioritaet BETWEEN 1 AND 5);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'lead_inquiries_ats_erfahrung_check') THEN
    ALTER TABLE public.lead_inquiries
      ADD CONSTRAINT lead_inquiries_ats_erfahrung_check
      CHECK (ats_erfahrung_jahre IS NULL OR ats_erfahrung_jahre BETWEEN 0 AND 60);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'lead_inquiries_ats_stunden_check') THEN
    ALTER TABLE public.lead_inquiries
      ADD CONSTRAINT lead_inquiries_ats_stunden_check
      CHECK (ats_stunden_pro_woche IS NULL OR ats_stunden_pro_woche BETWEEN 1 AND 60);
  END IF;

  -- Ein Datum zum Fuehrungszeugnis ohne Stand ist eine Angabe ueber nichts.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'lead_inquiries_ats_fz_datum_braucht_status') THEN
    ALTER TABLE public.lead_inquiries
      ADD CONSTRAINT lead_inquiries_ats_fz_datum_braucht_status
      CHECK (ats_fz_datum IS NULL OR ats_fz_status IS NOT NULL);
  END IF;
END;
$$;

-- Teilindex: nur Zeilen MIT Startdatum. Die Frage lautet „wer kann ab
-- wann", nicht „wer hat kein Datum" — ein Vollindex traegt hier 36 NULLs
-- mit, die nie gesucht werden.
CREATE INDEX IF NOT EXISTS lead_inquiries_ats_startdatum_idx
  ON public.lead_inquiries (ats_startdatum)
  WHERE ats_startdatum IS NOT NULL;

COMMENT ON COLUMN public.lead_inquiries.ats_notizen IS
  'Interne Notiz der Verwaltung. Gehoert NIE in Kundenkommunikation.';
COMMENT ON COLUMN public.lead_inquiries.ats_fz_status IS
  'Selbstauskunft bzw. Notiz — KEIN Nachweis. Siehe darfAlsVerifiziertGelten().';
