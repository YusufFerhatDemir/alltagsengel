-- Rollback: Tarif-Verifizierungsstatus + Audit-Trail

BEGIN;

DROP TRIGGER IF EXISTS trg_billing_tariff_audit ON billing_tariffs;
DROP FUNCTION IF EXISTS trg_billing_tariff_audit();
DROP TABLE IF EXISTS billing_tariff_audit;

ALTER TABLE billing_tariffs
  DROP COLUMN IF EXISTS tarif_status,
  DROP COLUMN IF EXISTS verifiziert_am,
  DROP COLUMN IF EXISTS verifiziert_von,
  DROP COLUMN IF EXISTS verifizierungs_quelle;

COMMIT;
