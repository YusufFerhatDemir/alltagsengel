-- P1-7 + P1-8: Billing- und Rollback-Archiv-Tabellen ohne RLS absichern
-- Alle Tabellen erhalten RLS + eine Read-Only-Policy für authentifizierte Benutzer.
-- Idempotent: DROP POLICY IF EXISTS vor CREATE, ENABLE RLS ist wiederholbar.

-- ══════════════════════════════════════════════════════════════
-- Billing-Stammdaten (read-only für alle authentifizierten)
-- ══════════════════════════════════════════════════════════════

ALTER TABLE public.billing_feiertage ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS billing_feiertage_read_auth ON public.billing_feiertage;
CREATE POLICY billing_feiertage_read_auth ON public.billing_feiertage
  FOR SELECT USING (auth.role() = 'authenticated');

ALTER TABLE public.billing_leistungsarten ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS billing_leistungsarten_read_auth ON public.billing_leistungsarten;
CREATE POLICY billing_leistungsarten_read_auth ON public.billing_leistungsarten
  FOR SELECT USING (auth.role() = 'authenticated');

ALTER TABLE public.billing_rechtsgrundlagen ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS billing_rechtsgrundlagen_read_auth ON public.billing_rechtsgrundlagen;
CREATE POLICY billing_rechtsgrundlagen_read_auth ON public.billing_rechtsgrundlagen
  FOR SELECT USING (auth.role() = 'authenticated');

ALTER TABLE public.billing_tarifquellen ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS billing_tarifquellen_read_auth ON public.billing_tarifquellen;
CREATE POLICY billing_tarifquellen_read_auth ON public.billing_tarifquellen
  FOR SELECT USING (auth.role() = 'authenticated');

-- ══════════════════════════════════════════════════════════════
-- Archiv-Tabellen (read-only für alle authentifizierten)
-- ══════════════════════════════════════════════════════════════

ALTER TABLE public.billing_landesregeln_archiv ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS billing_landesregeln_archiv_read_auth ON public.billing_landesregeln_archiv;
CREATE POLICY billing_landesregeln_archiv_read_auth ON public.billing_landesregeln_archiv
  FOR SELECT USING (auth.role() = 'authenticated');

ALTER TABLE public.billing_obergrenzen_archiv ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS billing_obergrenzen_archiv_read_auth ON public.billing_obergrenzen_archiv;
CREATE POLICY billing_obergrenzen_archiv_read_auth ON public.billing_obergrenzen_archiv
  FOR SELECT USING (auth.role() = 'authenticated');

ALTER TABLE public.billing_wegepauschalen_archiv ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS billing_wegepauschalen_archiv_read_auth ON public.billing_wegepauschalen_archiv;
CREATE POLICY billing_wegepauschalen_archiv_read_auth ON public.billing_wegepauschalen_archiv
  FOR SELECT USING (auth.role() = 'authenticated');

ALTER TABLE public.state_settings_audit_archiv ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS state_settings_audit_archiv_read_auth ON public.state_settings_audit_archiv;
CREATE POLICY state_settings_audit_archiv_read_auth ON public.state_settings_audit_archiv
  FOR SELECT USING (auth.role() = 'authenticated');

ALTER TABLE public.state_waitlist_archiv ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS state_waitlist_archiv_read_auth ON public.state_waitlist_archiv;
CREATE POLICY state_waitlist_archiv_read_auth ON public.state_waitlist_archiv
  FOR SELECT USING (auth.role() = 'authenticated');
