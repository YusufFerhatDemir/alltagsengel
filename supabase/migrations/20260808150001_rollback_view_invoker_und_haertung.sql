-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK: Views auf Invoker-Rechte, SECURITY DEFINER-Härtung, Index
--           (20260808150000)
--
-- ACHTUNG: Setzt ein nachgewiesenes Kreuz-Mandanten-Leck wieder ein.
-- Ohne security_invoker lesen ALLE angemeldeten Nutzer die Bescheid-Felder
-- und Tarife JEDER Organisation. Nur ausfuehren, wenn die Umstellung selbst
-- ein Problem verursacht — und dann umgehend eine andere Absicherung setzen.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF to_regclass('public.state_expansion_dashboard') IS NOT NULL THEN
    ALTER VIEW public.state_expansion_dashboard SET (security_invoker = false);
  END IF;
  IF to_regclass('public.billing_preisschichten_uebersicht') IS NOT NULL THEN
    ALTER VIEW public.billing_preisschichten_uebersicht SET (security_invoker = false);
  END IF;
END $$;

DROP INDEX IF EXISTS public.idx_invoice_items_invoice;
DROP INDEX IF EXISTS public.idx_invoice_items_kassenpositionen;
DROP INDEX IF EXISTS public.idx_service_records_abrechnung;

-- search_path bleibt gesetzt: das Entfernen waere eine Verschlechterung
-- ohne jeden Nutzen.
