-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK: RLS für die Billing-Katalogtabellen (20260808140000)
--
-- ACHTUNG: Danach sind die vier Katalogtabellen wieder ohne RLS und mit dem
-- oeffentlichen anon-Key beschreibbar. Nur ausfuehren, wenn die RLS selbst
-- ein Problem verursacht.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_tabelle TEXT;
  v_kataloge TEXT[] := ARRAY[
    'billing_leistungsarten',
    'billing_rechtsgrundlagen',
    'billing_tarifquellen',
    'billing_feiertage'
  ];
BEGIN
  FOREACH v_tabelle IN ARRAY v_kataloge LOOP
    IF to_regclass('public.' || v_tabelle) IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_tabelle || '_read', v_tabelle);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_tabelle || '_admin_write', v_tabelle);
    EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', v_tabelle);
    EXECUTE format('GRANT SELECT ON public.%I TO anon, authenticated', v_tabelle);
  END LOOP;
END $$;
