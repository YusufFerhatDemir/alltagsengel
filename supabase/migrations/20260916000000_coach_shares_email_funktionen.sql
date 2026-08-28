-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: coach_shares — Lookup-Funktionen für die Freigaben-Oberfläche
-- Datum:     2026-09-16
-- Projekt:   Alltagsengel UG — Digitaler PflegeCoach (Phase 3: GAP-SHARES-UI)
-- Rollback:  20260916000001_rollback_coach_shares_email_funktionen.sql
-- ═══════════════════════════════════════════════════════════════════════════
-- IDEMPOTENT: CREATE OR REPLACE, keine Änderung an bestehenden Tabellen.
--
-- LÜCKE, DIE DIESE MIGRATION SCHLIESST:
--   coach_shares.grantee_user_id verweist auf auth.users(id) — die Einladen-
--   Oberfläche kennt aber nur die E-Mail-Adresse der eingeladenen Person.
--   lib/coach/api-auth.ts verbietet bewusst createAdminClient() in
--   app/api/coach/**, damit RLS die einzige Zugriffs-Wahrheit bleibt. Ohne
--   Admin-Client kann eine E-Mail serverseitig nicht auf eine user_id
--   aufgelöst werden — dafür sind die beiden folgenden SECURITY-DEFINER-
--   Funktionen da. Sie lesen NICHT auth.users direkt, sondern public.profiles
--   (dorthin wird die E-Mail bereits beim Registrieren gespiegelt, siehe
--   20250101000000_core_tables_baseline.sql Trigger handle_new_user).
--
-- MINIMALE OFFENLEGUNG:
--   * coach_finde_nutzer_id: liefert nur eine user_id zurück, und nur, wenn
--     zu der E-Mail bereits ein PflegeCoach-Konto (coach_users) existiert —
--     sonst NULL. Keine weiteren Felder (kein Name, keine Rolle).
--   * coach_freigaben_liste: liefert ausschließlich die eigenen coach_shares-
--     Zeilen des Aufrufers (owner_coach_user_id = auth.uid()), ergänzt um die
--     E-Mail der jeweils eingeladenen Person — dieselbe Information, die der
--     Aufrufer beim Einladen selbst eingegeben hat.
--
-- BEKANNTE EINSCHRÄNKUNG (dokumentiert, nicht behoben): coach_finde_nutzer_id
-- ist eine Existenz-Oracle — ein angemeldeter Nutzer kann per Ausprobieren
-- herausfinden, ob eine E-Mail ein PflegeCoach-Konto hat. Das ist bei jedem
-- "Person per E-Mail einladen"-Flow so; ein Rate-Limit dafür existiert noch
-- nicht (TODO, siehe app/api/coach/freigaben/route.ts).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION coach_finde_nutzer_id(p_email text)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT cu.user_id
  FROM public.profiles p
  JOIN public.coach_users cu ON cu.user_id = p.id
  WHERE lower(p.email) = lower(p_email)
  LIMIT 1
$$;

COMMENT ON FUNCTION coach_finde_nutzer_id(text) IS
  'Löst eine E-Mail auf eine auth.users.id auf — nur wenn dazu ein coach_users-Konto existiert. Keine weiteren Felder. Für app/api/coach/freigaben (Person einladen).';

REVOKE ALL ON FUNCTION coach_finde_nutzer_id(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION coach_finde_nutzer_id(text) TO authenticated;

CREATE OR REPLACE FUNCTION coach_freigaben_liste()
RETURNS TABLE (
  id uuid,
  empfaenger_email text,
  empfaenger_rolle text,
  erstellt_am timestamptz,
  widerrufen_am timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT s.id, p.email, s.empfaenger_rolle, s.erstellt_am, s.widerrufen_am
  FROM public.coach_shares s
  JOIN public.coach_users cu ON cu.id = s.owner_coach_user_id
  JOIN public.profiles p ON p.id = s.grantee_user_id
  WHERE cu.user_id = auth.uid()
  ORDER BY s.erstellt_am DESC
$$;

COMMENT ON FUNCTION coach_freigaben_liste() IS
  'Eigene coach_shares-Zeilen (aktiv + widerrufen) inkl. E-Mail der eingeladenen Person, für /pflegecoach/einstellungen/freigaben.';

REVOKE ALL ON FUNCTION coach_freigaben_liste() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION coach_freigaben_liste() TO authenticated;
