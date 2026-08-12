-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK: Tarifschichten bundeslandfähig (20260808110000)
--
-- Entfernt die Schichten 1/4/5 samt Guards und stellt den vorherigen
-- Zustand von billing_tariffs her.
--
-- HINWEIS: Die Normalisierung von organizations.bundesland und
--          billing_tariffs.bundesland auf Katalog-Codes ('hessen' statt
--          'Hessen') wird NICHT zurueckgedreht — die alte RPC vergleicht
--          ohnehin mit LOWER(), die Codes sind also abwaertskompatibel.
--          Nur die Fremdschluessel werden entfernt.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Guards ───────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_tariff_obergrenze          ON public.billing_tariffs;
DROP TRIGGER IF EXISTS trg_kassentarif_freigeschaltet ON public.billing_tariffs;
DROP TRIGGER IF EXISTS trg_kassenrechnung_freigeschaltet ON public.invoices;
DROP TRIGGER IF EXISTS trg_kassenrechnung_freigeschaltet ON public.invoice_items;
DROP TRIGGER IF EXISTS trg_booking_zahlungsart            ON public.bookings;

DROP FUNCTION IF EXISTS public.enforce_tariff_obergrenze();
DROP FUNCTION IF EXISTS public.enforce_kassentarif_freigeschaltet();
DROP FUNCTION IF EXISTS public.enforce_kassenrechnung_freigeschaltet();
DROP FUNCTION IF EXISTS public.enforce_booking_zahlungsart();

-- ── 2. View ─────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.billing_preisschichten_uebersicht;

-- ── 3. Policies ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS obergrenzen_read         ON public.billing_gesetzliche_obergrenzen;
DROP POLICY IF EXISTS obergrenzen_admin_write  ON public.billing_gesetzliche_obergrenzen;
DROP POLICY IF EXISTS landesregeln_read        ON public.billing_landesregeln;
DROP POLICY IF EXISTS landesregeln_admin_write ON public.billing_landesregeln;
DROP POLICY IF EXISTS landesregel_keys_read    ON public.billing_landesregel_keys;
DROP POLICY IF EXISTS wegepauschalen_org_fence ON public.billing_wegepauschalen;
DROP POLICY IF EXISTS wegepauschalen_admin     ON public.billing_wegepauschalen;

-- ── 4. Trigger auf den neuen Tabellen ───────────────────────────────────────
DROP TRIGGER IF EXISTS trg_obergrenzen_updated_at     ON public.billing_gesetzliche_obergrenzen;
DROP TRIGGER IF EXISTS trg_wegepauschalen_updated_at  ON public.billing_wegepauschalen;
DROP TRIGGER IF EXISTS trg_landesregeln_updated_at    ON public.billing_landesregeln;

-- ── 5. Helper ───────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.landesregel(TEXT, TEXT, DATE, TEXT);

-- ── 6. Tabellen (Daten vorher sichern) ──────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_schema = 'public' AND table_name = 'billing_wegepauschalen') THEN
    EXECUTE 'CREATE TABLE IF NOT EXISTS public.billing_wegepauschalen_archiv AS
             SELECT * FROM public.billing_wegepauschalen';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_schema = 'public' AND table_name = 'billing_gesetzliche_obergrenzen') THEN
    EXECUTE 'CREATE TABLE IF NOT EXISTS public.billing_obergrenzen_archiv AS
             SELECT * FROM public.billing_gesetzliche_obergrenzen';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_schema = 'public' AND table_name = 'billing_landesregeln') THEN
    EXECUTE 'CREATE TABLE IF NOT EXISTS public.billing_landesregeln_archiv AS
             SELECT * FROM public.billing_landesregeln';
  END IF;
END $$;

DROP TABLE IF EXISTS public.billing_wegepauschalen;
DROP TABLE IF EXISTS public.billing_landesregeln;
DROP TABLE IF EXISTS public.billing_landesregel_keys;
DROP TABLE IF EXISTS public.billing_gesetzliche_obergrenzen;

-- ── 7. Fremdschluessel auf den Bundesland-Katalog ───────────────────────────
ALTER TABLE public.billing_tariffs DROP CONSTRAINT IF EXISTS fk_tariff_bundesland;
ALTER TABLE public.organizations   DROP CONSTRAINT IF EXISTS fk_org_bundesland;

-- ── 8. Normalisierungsfunktion ──────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.normalize_bundesland(TEXT);
