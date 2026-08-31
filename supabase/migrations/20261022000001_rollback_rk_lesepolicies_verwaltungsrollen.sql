-- Rollback zu 20261022000000_rk_lesepolicies_verwaltungsrollen.sql
--
-- Nimmt die 24 Lesepolicies wieder weg. Danach sehen pdl, qm und
-- buchhaltung auf diesen Tabellen wieder nichts — die Seiten sind dann
-- erneut still leer. Das ist kein Sicherheitsgewinn, sondern der Zustand
-- vom 31.08.2026; die Datei existiert, weil zu jeder Migration eine
-- Umkehrung gehoert (docs/MIGRATION_LEDGER.md).

DROP POLICY IF EXISTS rk_absences_lesen ON public.absences;
DROP POLICY IF EXISTS rk_applications_lesen ON public.applications;
DROP POLICY IF EXISTS rk_bookings_lesen ON public.bookings;
DROP POLICY IF EXISTS rk_care_notes_lesen ON public.care_notes;
DROP POLICY IF EXISTS rk_caregiver_bonuses_lesen ON public.caregiver_bonuses;
DROP POLICY IF EXISTS rk_caregiver_documents_lesen ON public.caregiver_documents;
DROP POLICY IF EXISTS rk_caregiver_initials_history_lesen ON public.caregiver_initials_history;
DROP POLICY IF EXISTS rk_caregiver_qualifications_lesen ON public.caregiver_qualifications;
DROP POLICY IF EXISTS rk_client_preferred_substitutes_lesen ON public.client_preferred_substitutes;
DROP POLICY IF EXISTS rk_cooperation_partners_lesen ON public.cooperation_partners;
DROP POLICY IF EXISTS rk_datenannahmestellen_lesen ON public.datenannahmestellen;
DROP POLICY IF EXISTS rk_dta_dakota_auftraege_lesen ON public.dta_dakota_auftraege;
DROP POLICY IF EXISTS rk_einsatz_absagen_lesen ON public.einsatz_absagen;
DROP POLICY IF EXISTS rk_kostentraeger_kontakte_lesen ON public.kostentraeger_kontakte;
DROP POLICY IF EXISTS rk_monthly_closings_lesen ON public.monthly_closings;
DROP POLICY IF EXISTS rk_ocr_results_lesen ON public.ocr_results;
DROP POLICY IF EXISTS rk_partner_visits_lesen ON public.partner_visits;
DROP POLICY IF EXISTS rk_payment_allocations_lesen ON public.payment_allocations;
DROP POLICY IF EXISTS rk_payment_status_lesen ON public.payment_status;
DROP POLICY IF EXISTS rk_review_errors_lesen ON public.review_errors;
DROP POLICY IF EXISTS rk_state_settings_lesen ON public.state_settings;
DROP POLICY IF EXISTS rk_substitution_requests_lesen ON public.substitution_requests;
DROP POLICY IF EXISTS rk_verordnung_leistungen_lesen ON public.verordnung_leistungen;
DROP POLICY IF EXISTS rk_verordnungen_lesen ON public.verordnungen;
