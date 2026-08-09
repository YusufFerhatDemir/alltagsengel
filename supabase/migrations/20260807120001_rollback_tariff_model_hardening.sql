-- Rollback: 20260807120000_tariff_model_hardening.sql
-- Entfernt Katalog-Tabellen, IK-Validierung, Overlap-Constraints, Feiertage

-- Overlap-Constraint entfernen
ALTER TABLE public.billing_tariffs DROP CONSTRAINT IF EXISTS no_overlapping_tariffs;

-- ist_aktiv Spalte entfernen
ALTER TABLE public.billing_tariffs DROP COLUMN IF EXISTS ist_aktiv;

-- FK-Constraints entfernen
ALTER TABLE public.billing_tariffs DROP CONSTRAINT IF EXISTS fk_tariff_leistungsart;
ALTER TABLE public.billing_tariffs DROP CONSTRAINT IF EXISTS fk_tariff_rechtsgrundlage;

-- IK-Check-Constraints entfernen
ALTER TABLE public.billing_tariffs DROP CONSTRAINT IF EXISTS chk_tariff_ik_valid;
ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS chk_client_ik_valid;

-- IK-Validierungsfunktion entfernen
DROP FUNCTION IF EXISTS public.validate_ik_nummer(TEXT);

-- Feiertage-Tabelle entfernen
DROP INDEX IF EXISTS unique_feiertag_datum_bl;
DROP TABLE IF EXISTS public.billing_feiertage;

-- Katalog-Tabellen entfernen (FK auf billing_tariffs ist bereits weg)
DROP TABLE IF EXISTS public.billing_rechtsgrundlagen;
DROP TABLE IF EXISTS public.billing_leistungsarten;
