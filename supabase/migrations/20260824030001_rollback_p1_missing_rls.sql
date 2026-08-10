-- Rollback P1-7 + P1-8: RLS-Policies entfernen und RLS deaktivieren

DROP POLICY IF EXISTS billing_feiertage_read_auth ON public.billing_feiertage;
ALTER TABLE public.billing_feiertage DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS billing_leistungsarten_read_auth ON public.billing_leistungsarten;
ALTER TABLE public.billing_leistungsarten DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS billing_rechtsgrundlagen_read_auth ON public.billing_rechtsgrundlagen;
ALTER TABLE public.billing_rechtsgrundlagen DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS billing_tarifquellen_read_auth ON public.billing_tarifquellen;
ALTER TABLE public.billing_tarifquellen DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS billing_landesregeln_archiv_read_auth ON public.billing_landesregeln_archiv;
ALTER TABLE public.billing_landesregeln_archiv DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS billing_obergrenzen_archiv_read_auth ON public.billing_obergrenzen_archiv;
ALTER TABLE public.billing_obergrenzen_archiv DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS billing_wegepauschalen_archiv_read_auth ON public.billing_wegepauschalen_archiv;
ALTER TABLE public.billing_wegepauschalen_archiv DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS state_settings_audit_archiv_read_auth ON public.state_settings_audit_archiv;
ALTER TABLE public.state_settings_audit_archiv DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS state_waitlist_archiv_read_auth ON public.state_waitlist_archiv;
ALTER TABLE public.state_waitlist_archiv DISABLE ROW LEVEL SECURITY;
