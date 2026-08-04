-- ════════════════════════════════════════════════════════════════════
-- NACHHOL-MIGRATION: Fehlende Produktions-Trigger
-- ════════════════════════════════════════════════════════════════════
--
-- Zwei Trigger existieren in Produktion, haben aber keine versionierte
-- Migration im Repository:
--
--   1) trg_generate_referral_code (BEFORE INSERT ON profiles)
--      → Generiert automatisch einen 8-stelligen Referral-Code
--      → Funktion generate_referral_code() bereits in
--        20260101000100_baseline_live_only_functions.sql definiert
--
--   2) trg_prevent_role_escalation_insert (BEFORE INSERT ON profiles)
--      → Verhindert direktes Anlegen von Admin-/Superadmin-Profilen
--      → Funktion prevent_role_escalation() bereits in
--        20260101000100_baseline_live_only_functions.sql definiert
--      → Ergänzt den bestehenden UPDATE-Trigger (trg_prevent_role_escalation)
--        um den INSERT-Fall
--
-- Produktions-Äquivalente:
--   trg_generate_referral_code      → identischer Name
--   check_role_escalation_insert    → umbenannt zu trg_prevent_role_escalation_insert
--                                     (konsistent mit bestehendem UPDATE-Trigger)
--
-- Abhängigkeiten:
--   - Tabelle: public.profiles (20250101000000_core_tables_baseline.sql)
--   - Spalte: profiles.referral_code (20260101000100_baseline_live_only_functions.sql)
--   - Funktion: generate_referral_code() (20260101000100_baseline_live_only_functions.sql)
--   - Funktion: prevent_role_escalation() (20260101000100_baseline_live_only_functions.sql)
--
-- Risikobewertung:
--   trg_generate_referral_code: NIEDRIG
--     - Kosmetische Funktion (Referral-Code)
--     - Fehlender Trigger = neue Profile ohne Code (kein Datenverlust)
--     - Idempotent (nur wenn referral_code IS NULL)
--
--   trg_prevent_role_escalation_insert: MITTEL
--     - Sicherheitsrelevant: verhindert unautorisierte Admin-Erstellung
--     - Mitigiert durch: handle_new_user() setzt Default 'kunde',
--       service_role ist explizit erlaubt
--     - Angriffsszenario ohne Trigger: manipuliertes raw_user_meta_data
--       mit role='admin' bei Registrierung → Admin-Profil ohne Prüfung
--
-- Idempotent: DROP TRIGGER IF EXISTS vor jedem CREATE.
-- ════════════════════════════════════════════════════════════════════

-- ── 1) Referral-Code-Generierung bei Profil-Erstellung ─────────────
DROP TRIGGER IF EXISTS trg_generate_referral_code ON public.profiles;
CREATE TRIGGER trg_generate_referral_code
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.generate_referral_code();

-- ── 2) Role-Escalation-Schutz bei UPDATE ───────────────────────────
-- Produktions-Trigger heißt "check_role_escalation" — Umbenennung
-- zu "trg_prevent_role_escalation" für konsistente Namenskonvention.
-- WICHTIG: Zuerst neuen Trigger erstellen, dann alten droppen.
DROP TRIGGER IF EXISTS trg_prevent_role_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_role_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_role_escalation();

-- ── 3) Role-Escalation-Schutz bei INSERT ───────────────────────────
-- Verhindert, dass ein Nicht-Superadmin direkt ein Profil mit
-- role='admin' oder role='superadmin' anlegt.
-- service_role (Backend-API) ist explizit erlaubt.
DROP TRIGGER IF EXISTS trg_prevent_role_escalation_insert ON public.profiles;
CREATE TRIGGER trg_prevent_role_escalation_insert
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_role_escalation();

-- Alte Produktions-Namen droppen (jetzt durch trg_*-Varianten ersetzt):
DROP TRIGGER IF EXISTS check_role_escalation_insert ON public.profiles;
DROP TRIGGER IF EXISTS check_role_escalation ON public.profiles;
