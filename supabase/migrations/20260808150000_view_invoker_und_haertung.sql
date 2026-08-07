-- ════════════════════════════════════════════════════════════════════════════
-- Migration: Views auf Invoker-Rechte, SECURITY DEFINER-Härtung, Index
-- Datum:     2026-08-08
-- Branch:    staging/expansion-abnahme
-- Voraussetzung: 20260808110000, 20260808130000
--
-- BEFUNDE AUS DEM PHASE-4-AUDIT
--
-- P1  KREUZ-MANDANTEN-LECK (schwerwiegend)
--     state_expansion_dashboard und billing_preisschichten_uebersicht
--     wurden ohne security_invoker angelegt. Views laufen dann mit den
--     Rechten ihres EIGENTUEMERS und umgehen die RLS der zugrunde
--     liegenden Tabellen. Beide sind an `authenticated` freigegeben.
--
--     Nachgewiesen auf Staging: ein gewoehnlicher Kunde (is_admin = false)
--     las 48 Dashboard-Zeilen ueber 3 Organisationen — inklusive
--     approval_document (Pfad des Anerkennungsbescheids),
--     approval_reference, approval_authority und der internen notes.
--     Ueber die Preisschichten-Sicht waren zusaetzlich die Tarife
--     fremder Organisationen lesbar.
--
--     Fix: security_invoker = true. Damit greift die RLS des Aufrufers:
--     ein Kunde sieht nichts, ein Admin nur die eigene Organisation.
--
--     state_settings_public bleibt BEWUSST auf Definer-Semantik — das ist
--     der oeffentliche Kundenendpunkt, er enthaelt ausschliesslich
--     unkritische Felder und muss auch fuer anon lesbar sein.
--
-- P2  audit_invoice_status_change ist SECURITY DEFINER OHNE festen
--     search_path. Ein Aufrufer koennte eigene Objekte unterschieben und
--     Code mit den Rechten des Eigentuemers ausfuehren.
--
-- P3  invoice_items.invoice_id hatte keinen Index. Der Guard
--     enforce_kassenrechnung_freigeschaltet zaehlt bei JEDEM
--     Statuswechsel einer Rechnung die Kassenpositionen — ohne Index ein
--     Sequential Scan ueber die gesamte Tabelle, pro Uebergang.
--
-- KEINE Datenaenderung. KEINE Production-Migration.
-- Rollback: 20260808150001_rollback_view_invoker_und_haertung.sql
-- ════════════════════════════════════════════════════════════════════════════

-- ── P1: Views auf die Rechte des Aufrufers umstellen ────────────────────────
DO $$
BEGIN
  IF to_regclass('public.state_expansion_dashboard') IS NOT NULL THEN
    ALTER VIEW public.state_expansion_dashboard SET (security_invoker = true);
  END IF;
  IF to_regclass('public.billing_preisschichten_uebersicht') IS NOT NULL THEN
    ALTER VIEW public.billing_preisschichten_uebersicht SET (security_invoker = true);
  END IF;
END $$;

COMMENT ON VIEW public.state_expansion_dashboard IS
  'Kennzahlen je Organisation und Bundesland fuer das Admin-Dashboard. '
  'security_invoker = true: die RLS von state_settings gilt, ein Nicht-Admin '
  'sieht nichts und ein Admin nur die eigene Organisation. '
  'Enthaelt Bescheid-Felder — NIEMALS an anon freigeben.';

COMMENT ON VIEW public.billing_preisschichten_uebersicht IS
  'Diagnose-Sicht ueber die Preisschichten 1-4. security_invoker = true, '
  'damit der Org-Fence von billing_tariffs und billing_wegepauschalen greift.';

-- anon hat auf beiden Sichten nichts zu suchen.
DO $$
BEGIN
  IF to_regclass('public.state_expansion_dashboard') IS NOT NULL THEN
    REVOKE ALL ON public.state_expansion_dashboard FROM anon;
    GRANT SELECT ON public.state_expansion_dashboard TO authenticated;
  END IF;
  IF to_regclass('public.billing_preisschichten_uebersicht') IS NOT NULL THEN
    REVOKE ALL ON public.billing_preisschichten_uebersicht FROM anon;
    GRANT SELECT ON public.billing_preisschichten_uebersicht TO authenticated;
  END IF;
END $$;

-- ── P2: search_path für die letzte SECURITY DEFINER-Funktion ohne ───────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'audit_invoice_status_change'
  ) THEN
    ALTER FUNCTION public.audit_invoice_status_change() SET search_path = public, pg_temp;
  END IF;
END $$;

-- ── P3: Index für den Kassenrechnungs-Guard ─────────────────────────────────
-- Ohne ihn kostet jeder Statuswechsel einer Rechnung einen vollstaendigen
-- Scan von invoice_items.
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice
  ON public.invoice_items (invoice_id);

-- Der Guard filtert zusaetzlich auf budget_type <> 'private'. Ein Teilindex
-- deckt genau die Zeilen ab, auf die es ankommt, und bleibt klein.
CREATE INDEX IF NOT EXISTS idx_invoice_items_kassenpositionen
  ON public.invoice_items (invoice_id)
  WHERE budget_type IS NOT NULL AND budget_type <> 'private';

-- Die Rechnungs-RPC liest Leistungen je Klient, Budget-Typ und Zeitraum.
CREATE INDEX IF NOT EXISTS idx_service_records_abrechnung
  ON public.service_records (client_id, budget_type, date)
  WHERE status IN ('signed', 'complete');
