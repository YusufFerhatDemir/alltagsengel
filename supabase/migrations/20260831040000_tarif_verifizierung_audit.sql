-- Migration: Tarif-Verifizierungsstatus + Audit-Trail
-- Fail-Closed: Nicht-verifizierte Kassentarife blockieren Rechnungserstellung

BEGIN;

-- ═══════════════════════════════════════════════════════════════════
-- 1. Neue Spalten auf billing_tariffs
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE billing_tariffs
  ADD COLUMN IF NOT EXISTS tarif_status TEXT NOT NULL DEFAULT 'unverified'
    CHECK (tarif_status IN ('verified', 'unverified', 'blocked')),
  ADD COLUMN IF NOT EXISTS verifiziert_am TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verifiziert_von TEXT,
  ADD COLUMN IF NOT EXISTS verifizierungs_quelle TEXT;

COMMENT ON COLUMN billing_tariffs.tarif_status IS
  'Verifizierungsstatus: verified=freigegeben, unverified=nicht geprueft, blocked=gesperrt';
COMMENT ON COLUMN billing_tariffs.verifiziert_am IS
  'Zeitpunkt der letzten Verifizierung/Sperrung';
COMMENT ON COLUMN billing_tariffs.verifiziert_von IS
  'Benutzer-ID oder Name der verifizierenden Person';
COMMENT ON COLUMN billing_tariffs.verifizierungs_quelle IS
  'Rechtsquelle der Verifizierung, z.B. "PfluV Hessen §1 Abs. 1 Nr. 12"';

-- ═══════════════════════════════════════════════════════════════════
-- 2. Audit-Tabelle
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS billing_tariff_audit (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tariff_id    UUID NOT NULL REFERENCES billing_tariffs(id) ON DELETE RESTRICT,
  organization_id UUID NOT NULL,
  aktion       TEXT NOT NULL,
  alter_betrag_cent INTEGER,
  neuer_betrag_cent INTEGER,
  alter_status TEXT,
  neuer_status TEXT,
  benutzer     TEXT,
  quelle       TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tariff_audit_tariff_id ON billing_tariff_audit(tariff_id);
CREATE INDEX IF NOT EXISTS idx_tariff_audit_org_id ON billing_tariff_audit(organization_id);

COMMENT ON TABLE billing_tariff_audit IS
  'Audit-Trail fuer alle Aenderungen an billing_tariffs (Preis, Status, Verifizierung)';

-- ═══════════════════════════════════════════════════════════════════
-- 3. RLS auf billing_tariff_audit (org_fence)
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE billing_tariff_audit ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'billing_tariff_audit' AND policyname = 'org_fence_tariff_audit'
  ) THEN
    CREATE POLICY org_fence_tariff_audit ON billing_tariff_audit
      FOR ALL
      USING (organization_id = (
        SELECT om.organization_id FROM organization_members om
        WHERE om.user_id = auth.uid()
        LIMIT 1
      ))
      WITH CHECK (organization_id = (
        SELECT om.organization_id FROM organization_members om
        WHERE om.user_id = auth.uid()
        LIMIT 1
      ));
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- 4. Audit-Trigger auf billing_tariffs
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION trg_billing_tariff_audit()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO billing_tariff_audit (
    tariff_id,
    organization_id,
    aktion,
    alter_betrag_cent,
    neuer_betrag_cent,
    alter_status,
    neuer_status,
    benutzer,
    quelle
  ) VALUES (
    NEW.id,
    NEW.organization_id,
    CASE
      WHEN TG_OP = 'INSERT' THEN 'erstellt'
      WHEN OLD.tarif_status IS DISTINCT FROM NEW.tarif_status THEN 'status_geaendert'
      WHEN OLD.preis_cent IS DISTINCT FROM NEW.preis_cent THEN 'preis_geaendert'
      ELSE 'aktualisiert'
    END,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.preis_cent ELSE NULL END,
    NEW.preis_cent,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.tarif_status ELSE NULL END,
    NEW.tarif_status,
    COALESCE(NEW.verifiziert_von, current_setting('request.jwt.claims', true)::json->>'sub'),
    NEW.verifizierungs_quelle
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_billing_tariff_audit ON billing_tariffs;
CREATE TRIGGER trg_billing_tariff_audit
  AFTER INSERT OR UPDATE ON billing_tariffs
  FOR EACH ROW
  EXECUTE FUNCTION trg_billing_tariff_audit();

-- ═══════════════════════════════════════════════════════════════════
-- 5. Initiale Status-Klassifizierung (bestehende 23 Tarife)
-- ═══════════════════════════════════════════════════════════════════

-- 5a. Privattarife → verified (Privatpreise frei waehlbar)
UPDATE billing_tariffs
SET tarif_status = 'verified',
    verifiziert_am = now(),
    verifiziert_von = 'system/migration',
    verifizierungs_quelle = 'Privatpreise: frei waehlbar, keine Obergrenze'
WHERE rechtsgrundlage = 'privat'
  AND deleted_at IS NULL;

-- 5b. Entlastungsbetrag 131€ → verified (gesetzlich festgelegt)
UPDATE billing_tariffs
SET tarif_status = 'verified',
    verifiziert_am = now(),
    verifiziert_von = 'system/migration',
    verifizierungs_quelle = '§45b SGB XI: 125 EUR/Monat gesetzlich, 131 EUR inkl. Erhoehung'
WHERE leistungsart = 'entlastungsbetrag'
  AND preis_cent = 13100
  AND deleted_at IS NULL;

-- 5c. Alltagsbegleitung §45a 25€/h → verified (PfluV-Obergrenze)
UPDATE billing_tariffs
SET tarif_status = 'verified',
    verifiziert_am = now(),
    verifiziert_von = 'system/migration',
    verifizierungs_quelle = 'PfluV Hessen: Alltagsbegleitung bis 25 EUR/h zulaessig'
WHERE leistungsart = 'alltagsbegleitung_45a'
  AND preis_cent = 2500
  AND deleted_at IS NULL;

-- 5d. §45b-Tarife à 35€/h → blocked (ueberschreiten PfluV-Obergrenze)
UPDATE billing_tariffs
SET tarif_status = 'blocked',
    verifiziert_am = now(),
    verifiziert_von = 'system/migration',
    verifizierungs_quelle = 'PfluV Hessen: 35 EUR/h ueberschreitet zulaessige Obergrenze (25 EUR/h)'
WHERE rechtsgrundlage = '§45b SGB XI'
  AND preis_cent = 3500
  AND deleted_at IS NULL;

-- 5e. LK-Positionen (Punktwert 0,0803) → unverified (kein Verguetungsvertrag)
UPDATE billing_tariffs
SET tarif_status = 'unverified',
    verifizierungs_quelle = 'Kein Verguetungsvertrag vorliegend, Punktwert 0,0803 nicht verifiziert'
WHERE leistungsart LIKE 'LK%'
  AND tarif_status = 'unverified'
  AND deleted_at IS NULL;

-- 5f. LK18 75€ → blocked (weicht stark vom Standard §37.3 ab)
UPDATE billing_tariffs
SET tarif_status = 'blocked',
    verifiziert_am = now(),
    verifiziert_von = 'system/migration',
    verifizierungs_quelle = 'LK18: 75 EUR weicht stark vom Standard §37.3 SGB XI ab'
WHERE leistungsart = 'LK18'
  AND preis_cent = 7500
  AND deleted_at IS NULL;

-- 5g. VP-Tarife → unverified (keine Verguetungsvereinbarung)
UPDATE billing_tariffs
SET tarif_status = 'unverified',
    verifizierungs_quelle = 'Keine verbindliche Verguetungsvereinbarung vorliegend'
WHERE leistungsart LIKE 'VP%'
  AND tarif_status = 'unverified'
  AND deleted_at IS NULL;

-- 5h. Wegepauschalen → verified (marktueblich)
UPDATE billing_tariffs
SET tarif_status = 'verified',
    verifiziert_am = now(),
    verifiziert_von = 'system/migration',
    verifizierungs_quelle = 'Wegepauschale: marktueblich, keine Obergrenze'
WHERE leistungsart LIKE 'wegepauschale%'
  AND deleted_at IS NULL;

COMMIT;
