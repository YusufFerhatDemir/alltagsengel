-- Rollback: 20260807180000_tariff_stammdaten_v2.sql
-- Entfernt Tarifquellen-Katalog und tarifquelle-Spalte

-- FK-Constraint entfernen
ALTER TABLE public.billing_tariffs DROP CONSTRAINT IF EXISTS fk_tariff_tarifquelle;

-- tarifquelle-Spalte entfernen
ALTER TABLE public.billing_tariffs DROP COLUMN IF EXISTS tarifquelle;

-- Tarifquellen-Katalog entfernen
DROP TABLE IF EXISTS public.billing_tarifquellen;

-- service_pricing ist_internal Spalte entfernen (falls vorhanden)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'service_pricing'
      AND column_name = 'ist_internal'
  ) THEN
    ALTER TABLE public.service_pricing DROP COLUMN ist_internal;
  END IF;
END $$;
