-- ════════════════════════════════════════════════════════════════════════════
-- Migration: Preislogik — Versionierung + Fail-Closed-Vollstaendigkeit
-- Datum:     2026-09-02  (Stream 5)
--
-- BEFUND
--   Es gibt ZWEI Preistabellen:
--     a) billing_tariffs  — verbindliche Rechnungspreise. Hat gueltig_ab/
--        gueltig_bis (seit 20260806200000) UND tarif_status (seit 20260831040000).
--        Der Rechnungsweg ist fail-closed (20260831050000).
--     b) leistungspreise  — 24 Zeilen (Hessen-Leistungskomplexe LK1..LK18,
--        entlastung_45b, alltagsbegleitung_45a ...). Hat gueltig_ab/gueltig_bis,
--        aber KEINEN Verifizierungsstatus. Sie wird von
--        lib/abrechnung/monatsabschluss.ts als Vorschau-Preisquelle fuer den
--        Monatsabschluss/Kassen-Vorlauf gelesen und ist ueber
--        /admin/leistungspreise frei editierbar.
--
--   Damit war (b) die einzige Preisquelle im System ohne UNVERIFIED-Kennzeichnung
--   und ohne Fail-Closed. Kein Nutzer konnte erkennen, dass die Punktwerte
--   (0,0803 EUR/Punkt) und die daraus errechneten LK-Betraege NICHT aus einer
--   Primaerquelle stammen.
--
-- AENDERUNG
--   leistungspreise bekommt dieselben Verifizierungsfelder wie billing_tariffs.
--   Default ist 'unverified' — ALLE bestehenden 24 Zeilen bleiben damit
--   unverifiziert und werden vom Monatsabschluss ab sofort nicht mehr
--   stillschweigend als Preis verwendet (siehe lib/abrechnung/monatsabschluss.ts).
--
--   KEIN Preis wird geaendert. KEIN Wert wird erfunden. KEIN Tarif wird
--   automatisch auf 'verified' gesetzt — Verifizierung ist ein bewusster,
--   dokumentierter Akt mit Angabe der Rechtsquelle.
--
-- NICHT TEIL DIESER MIGRATION (bewusst offen, siehe Report)
--   Die PfluV-Hessen-Saetze (30 EUR/h fuer § 1 Abs. 1 Nr. 1+2, 25 EUR/h fuer
--   Nr. 3) existieren NICHT als Tarife in billing_tariffs. Sie werden hier
--   NICHT angelegt — ein selbst erfundener Tarif waere genau der Fehler, den
--   das Verifizierungssystem verhindern soll. Anlage nur nach Vorlage des
--   Verordnungstexts, dann per PATCH /api/billing/tariffs/[id]/verifizierung.
--
-- Rollback: 20260902000001_rollback_preislogik_versionierung_fail_closed.sql
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Verifizierungsfelder auf leistungspreise (identisch zu billing_tariffs)
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.leistungspreise
  ADD COLUMN IF NOT EXISTS tarif_status TEXT NOT NULL DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS verifiziert_am TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verifiziert_von TEXT,
  ADD COLUMN IF NOT EXISTS verifizierungs_quelle TEXT;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'leistungspreise_tarif_status_check'
      AND conrelid = 'public.leistungspreise'::regclass
  ) THEN
    ALTER TABLE public.leistungspreise
      ADD CONSTRAINT leistungspreise_tarif_status_check
      CHECK (tarif_status IN ('verified', 'unverified', 'blocked'));
  END IF;
END $$;

COMMENT ON COLUMN public.leistungspreise.tarif_status IS
  'Verifizierungsstatus: verified=aus Primaerquelle belegt und freigegeben, '
  'unverified=nicht geprueft (Default, wird NICHT abgerechnet), blocked=gesperrt. '
  'Analog billing_tariffs.tarif_status.';
COMMENT ON COLUMN public.leistungspreise.verifizierungs_quelle IS
  'Rechtsquelle/Primaerbeleg der Verifizierung, z.B. "PfluV Hessen § 1 Abs. 1 Nr. 3" '
  'oder "Verguetungsvereinbarung <Kasse> vom <Datum>". Pflicht fuer tarif_status=verified.';
COMMENT ON COLUMN public.leistungspreise.verifiziert_am IS
  'Zeitpunkt der letzten Verifizierung/Sperrung';
COMMENT ON COLUMN public.leistungspreise.verifiziert_von IS
  'Benutzer-ID oder Name der verifizierenden Person';

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Gueltigkeitszeitraum haerten
--    gueltig_ab ist bereits NOT NULL DEFAULT CURRENT_DATE (20260731010000).
--    Was fehlte: die Zusicherung, dass gueltig_bis nicht VOR gueltig_ab liegt —
--    sonst existiert eine Zeile, die an keinem einzigen Tag gilt und die
--    Preissuche still leer laufen laesst.
-- ────────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'leistungspreise_valid_period'
      AND conrelid = 'public.leistungspreise'::regclass
  ) THEN
    ALTER TABLE public.leistungspreise
      ADD CONSTRAINT leistungspreise_valid_period
      CHECK (gueltig_bis IS NULL OR gueltig_bis >= gueltig_ab);
  END IF;
END $$;

-- Preis darf nicht negativ sein (fehlte bisher komplett).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'leistungspreise_preis_nicht_negativ'
      AND conrelid = 'public.leistungspreise'::regclass
  ) THEN
    ALTER TABLE public.leistungspreise
      ADD CONSTRAINT leistungspreise_preis_nicht_negativ
      CHECK (preis_cent >= 0);
  END IF;
END $$;

-- Lookup-Index fuer die Preissuche (Mandant + Land + Leistungsart + Stichtag).
CREATE INDEX IF NOT EXISTS idx_leistungspreise_lookup
  ON public.leistungspreise (organization_id, bundesland, leistungsart, gueltig_ab DESC);

-- ────────────────────────────────────────────────────────────────────────────
-- 3. UNVERIFIED-Kennzeichnung der bestehenden Zeilen
--    Kein Statuswechsel (der Default hat bereits 'unverified' gesetzt),
--    sondern die fehlende BEGRUENDUNG nachtragen: ohne Text sieht 'unverified'
--    aus wie "noch nicht bearbeitet" statt "Quelle liegt nicht vor".
-- ────────────────────────────────────────────────────────────────────────────

UPDATE public.leistungspreise
SET verifizierungs_quelle =
      'UNVERIFIED: Keine Primaerquelle hinterlegt. Punktwert bzw. Betrag stammt '
      || 'aus der Ersteinrichtung, nicht aus einer Verguetungsvereinbarung oder '
      || 'Rechtsverordnung. Nicht fuer die Kassenabrechnung freigegeben.'
WHERE tarif_status = 'unverified'
  AND verifizierungs_quelle IS NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. Verifizierung verfaellt bei Preis-/Gueltigkeitsaenderung
--
--    LUECKE (galt fuer billing_tariffs UND leistungspreise):
--      Ein Tarif wurde auf 'verified' gesetzt, danach der Preis geaendert —
--      der Status blieb 'verified'. Die Freigabe galt damit fuer einen Betrag,
--      den nie jemand gegen eine Primaerquelle geprueft hat. Genau das ist der
--      Weg, auf dem ein nicht belegter Preis in eine Kassenrechnung kommt.
--
--    REGEL: Aendert sich preis_cent oder der Gueltigkeitszeitraum, ohne dass
--    im selben UPDATE auch tarif_status neu gesetzt wird, faellt der Tarif
--    automatisch auf 'unverified' zurueck. Verifizierung laeuft danach wieder
--    ueber PATCH /api/billing/tariffs/[id]/verifizierung (Admin + Pflichtquelle).
--
--    search_path ist gesetzt: eine SECURITY-DEFINER-Funktion ohne festen
--    search_path ist ueber eine untergeschobene Suchreihenfolge angreifbar.
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.trg_verifizierung_verfaellt()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_preis_geaendert     BOOLEAN;
  v_zeitraum_geaendert  BOOLEAN;
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  -- Ein explizit im selben UPDATE gesetzter Status ist der bewusste
  -- Freigabe-/Sperrakt und wird nicht ueberschrieben.
  IF NEW.tarif_status IS DISTINCT FROM OLD.tarif_status THEN
    RETURN NEW;
  END IF;

  IF OLD.tarif_status <> 'verified' THEN
    RETURN NEW;
  END IF;

  v_preis_geaendert    := NEW.preis_cent IS DISTINCT FROM OLD.preis_cent;
  v_zeitraum_geaendert := NEW.gueltig_ab  IS DISTINCT FROM OLD.gueltig_ab
                       OR NEW.gueltig_bis IS DISTINCT FROM OLD.gueltig_bis;

  IF NOT (v_preis_geaendert OR v_zeitraum_geaendert) THEN
    RETURN NEW;
  END IF;

  NEW.tarif_status          := 'unverified';
  NEW.verifiziert_am        := NULL;
  NEW.verifiziert_von       := NULL;
  NEW.verifizierungs_quelle :=
    'AUTOMATISCH ZURUECKGESETZT: '
    || CASE WHEN v_preis_geaendert
         THEN 'Preis ' || OLD.preis_cent || ' ct → ' || NEW.preis_cent || ' ct. '
         ELSE '' END
    || CASE WHEN v_zeitraum_geaendert
         THEN 'Gueltigkeit ' || OLD.gueltig_ab || '–' || COALESCE(OLD.gueltig_bis::TEXT, 'offen')
              || ' → ' || NEW.gueltig_ab || '–' || COALESCE(NEW.gueltig_bis::TEXT, 'offen') || '. '
         ELSE '' END
    || 'Die vorherige Verifizierung galt nicht fuer diesen Wert. Erneute Freigabe '
    || 'mit Angabe der Rechtsquelle erforderlich.';

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trg_verifizierung_verfaellt IS
  'Fail-Closed: setzt tarif_status auf ''unverified'' zurueck, wenn Preis oder '
  'Gueltigkeitszeitraum eines verifizierten Tarifs geaendert werden, ohne dass '
  'im selben UPDATE ein neuer Status gesetzt wird.';

DROP TRIGGER IF EXISTS trg_billing_tariffs_verifizierung_verfaellt ON public.billing_tariffs;
CREATE TRIGGER trg_billing_tariffs_verifizierung_verfaellt
  BEFORE UPDATE ON public.billing_tariffs
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_verifizierung_verfaellt();

DROP TRIGGER IF EXISTS trg_leistungspreise_verifizierung_verfaellt ON public.leistungspreise;
CREATE TRIGGER trg_leistungspreise_verifizierung_verfaellt
  BEFORE UPDATE ON public.leistungspreise
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_verifizierung_verfaellt();

-- ────────────────────────────────────────────────────────────────────────────
-- 5. Dokumentation der Tabellenrolle
-- ────────────────────────────────────────────────────────────────────────────

COMMENT ON TABLE public.leistungspreise IS
  'Bundesland-Preisliste fuer die Monatsabschluss-VORSCHAU. Verbindliche '
  'Rechnungspreise kommen ausschliesslich aus billing_tariffs ueber '
  'create_invoice_draft_atomic(). Seit 20260902000000 fail-closed: nur Zeilen '
  'mit tarif_status=''verified'' werden vom Monatsabschluss als Preis verwendet.';

COMMIT;
