-- ════════════════════════════════════════════════════════════════════
-- SICHERHEITSFIX (2026-07-05): Engel-Discovery ohne PII-Leck
-- ════════════════════════════════════════════════════════════════════
-- Vorher: Kundenseiten (kunde/karte, kunde/buchen-service) luden Engel via
--   angels + profiles!inner(*)  → die KOMPLETTE profiles-Zeile (email, phone,
--   postal_code, latitude, longitude) floss in den Browser jedes Kunden.
--   Policy profiles_select_engels erlaubte JEDEM authentifizierten Nutzer
--   `select * from profiles where role='engel'` → scrapebare Massen-PII.
--
-- Fix: SECURITY DEFINER RPC get_engel_cards() liefert NUR nicht-sensible
--   Felder (Vorname, Nachname, Koordinaten für die Karte) + angels-Spalten.
--   Rückgabeform = wie das bisherige profiles!inner-Embedding, damit das
--   Frontend (a.profiles?.first_name / a.profiles?.latitude) unverändert läuft.
--   Danach wird profiles_select_engels gedroppt (Migration 20260705b).
--
-- Diese Migration wurde via Supabase MCP apply_migration angewendet
-- (Name: engel_cards_rpc_safe_columns) und ist hier zur Repo/DB-Synchronität
-- dokumentiert.
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_engel_cards(p_only_online boolean DEFAULT false)
RETURNS SETOF jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT to_jsonb(a)
         || jsonb_build_object(
              'profiles',
              jsonb_build_object(
                'first_name', p.first_name,
                'last_name',  p.last_name,
                'latitude',   p.latitude,
                'longitude',  p.longitude
              )
            )
  FROM public.angels a
  JOIN public.profiles p ON p.id = a.id
  WHERE p.role = 'engel'
    AND COALESCE(p.is_test, false) = false
    AND (NOT p_only_online OR a.is_online = true)
  ORDER BY a.rating DESC NULLS LAST;
$$;

REVOKE ALL ON FUNCTION public.get_engel_cards(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_engel_cards(boolean) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_engel_cards(boolean) IS
  'Sichere Engel-Discovery für Kunden: liefert angels-Spalten + nur nicht-sensible profiles-Felder (Vorname/Nachname/Koordinaten). Ersetzt den direkten profiles!inner(*)-Zugriff. Kein email/phone/postal_code.';
