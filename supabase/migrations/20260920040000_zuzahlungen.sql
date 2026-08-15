-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Zuzahlungsverwaltung §61 SGB V — Eigenanteil bei häuslicher
--            Krankenpflege (10% der Kosten, max. 10€/Verordnung, angerechnet
--            auf max. 28 Kalendertage/Jahr) inkl. Befreiungsnachweis-Tracking.
--            NICHT für SGB-XI-Pflegesachleistung (dort keine Zuzahmungspflicht).
-- Datum:     2026-08-15
-- Projekt:   Alltagsengel UG
-- IDEMPOTENT / RLS-Muster identisch zu 20260818030000_wunddokumentation.
-- Rollback:  20260920040001_rollback_zuzahlungen.sql
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS zuzahlungen (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT current_org_id(),
  client_id       uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  verordnung_id   uuid REFERENCES verordnungen(id) ON DELETE SET NULL,
  invoice_id      uuid REFERENCES invoices(id) ON DELETE SET NULL,

  jahr    int NOT NULL,
  betrag  numeric(8,2) NOT NULL,
  tage    int NOT NULL DEFAULT 0,
  grundlage text NOT NULL DEFAULT '§61 SGB V',

  faellig_am  date,
  bezahlt     boolean NOT NULL DEFAULT false,
  bezahlt_am  date,

  befreit                       boolean NOT NULL DEFAULT false,
  befreiung_gueltig_von         date,
  befreiung_gueltig_bis         date,
  befreiung_nachweis_hochgeladen boolean NOT NULL DEFAULT false,

  bemerkung     text,
  erstellt_von  uuid NOT NULL REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT zuzahlung_jahr_check   CHECK (jahr >= 2020 AND jahr <= 2099),
  CONSTRAINT zuzahlung_betrag_check CHECK (betrag >= 0),
  CONSTRAINT zuzahlung_tage_check   CHECK (tage >= 0),
  CONSTRAINT zuzahlung_bezahlt_konsistenz_check CHECK ((bezahlt = false) OR (bezahlt_am IS NOT NULL)),
  CONSTRAINT zuzahlung_befreiung_konsistenz_check CHECK (
    (befreit = false) OR (befreiung_gueltig_von IS NOT NULL AND befreiung_gueltig_bis IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_zuzahlungen_org    ON zuzahlungen(organization_id);
CREATE INDEX IF NOT EXISTS idx_zuzahlungen_client  ON zuzahlungen(client_id, jahr);
CREATE INDEX IF NOT EXISTS idx_zuzahlungen_offen   ON zuzahlungen(organization_id, bezahlt) WHERE bezahlt = false;

ALTER TABLE zuzahlungen ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'zuzahlungen' AND policyname = 'admin_zuzahlungen') THEN
    CREATE POLICY admin_zuzahlungen ON zuzahlungen FOR ALL
      USING (is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'zuzahlungen' AND policyname = 'org_fence_zuzahlungen') THEN
    CREATE POLICY org_fence_zuzahlungen ON zuzahlungen AS RESTRICTIVE FOR ALL
      USING (organization_id = current_org_id());
  END IF;
END $$;
-- Keine Engel-Policy: Zuzahlung ist ein Abrechnungsvorgang (Admin/PDL-Sache),
-- kein Pflegedokumentationsinhalt — analog Rechnungen/Tarife.

DROP TRIGGER IF EXISTS trg_updated_at_zuzahlungen ON zuzahlungen;
CREATE TRIGGER trg_updated_at_zuzahlungen BEFORE UPDATE ON zuzahlungen
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
