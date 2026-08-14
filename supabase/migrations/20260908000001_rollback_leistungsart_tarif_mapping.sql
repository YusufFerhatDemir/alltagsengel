-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK: 20260908000000_leistungsart_tarif_mapping.sql
-- ════════════════════════════════════════════════════════════════════════════
-- Setzt create_invoice_draft_atomic auf v6 zurück (Stand 20260831050000,
-- reiner LOWER-Vergleich) und entfernt die beiden Zuordnungsfunktionen.
--
-- FOLGE DES ROLLBACKS: Leistungsnachweise mit den Erfassungs-Schreibweisen
-- 'Haushaltshilfe', 'Einkaufshilfe', 'Arztbegleitung',
-- 'Betreuung / Gesellschaft' und 'Spaziergang / Mobilität' sind danach
-- wieder NICHT abrechenbar (MISSING_VALID_TARIFF).
--
-- Die Erfassungsprüfung in lib/billing/leistungsarten.ts bleibt davon
-- unberührt und lehnt solche Nachweise weiterhin schon bei der Anlage ab —
-- der Rollback macht die Kette also nicht schlechter als vor der Migration,
-- verhindert aber die Abrechnung der 12 Altbestands-Nachweise.
--
-- VORGEHEN: v6 durch erneutes Ausführen von
--   supabase/migrations/20260831050000_fail_closed_tarif_status_rpcs.sql
-- wiederherstellen (idempotentes CREATE OR REPLACE), danach diese Datei
-- ausführen. Die Reihenfolge ist wichtig: solange die RPC noch
-- tarif_leistungsart() aufruft, würde ein DROP die Rechnungserstellung
-- mit „function does not exist" abbrechen.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'create_invoice_draft_atomic'
       AND pg_get_functiondef(p.oid) LIKE '%tarif_leistungsart%'
  ) THEN
    RAISE EXCEPTION
      'create_invoice_draft_atomic ruft noch tarif_leistungsart() auf. '
      'Zuerst 20260831050000_fail_closed_tarif_status_rpcs.sql erneut '
      'ausfuehren (stellt v6 wieder her), dann diesen Rollback.';
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.tarif_leistungsart(TEXT);
DROP FUNCTION IF EXISTS public.normalisiere_leistungsart(TEXT);

COMMIT;
