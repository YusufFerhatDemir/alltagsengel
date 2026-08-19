# RLS-Policy-Matrix

> Auto-generiert von `scripts/rls-matrix.ts` am 2026-08-19T11:15:10.945Z.
> NICHT manuell bearbeiten — Aenderungen werden ueberschrieben.

Status: 298 Tabellen, 872 Policies.

## ✅ Alle Tabellen haben RLS aktiviert

## ⚠️ Tabellen ohne jegliche Policy

Diese Tabellen haben RLS-Status, aber KEINE Policy — d.h. niemand
ausser service_role darf zugreifen. Pruefen, ob beabsichtigt:

- `_sql_parts`
- `coach_pseudonym_key`

## Vollstaendige Policy-Liste

| Tabelle | RLS | Policy | Rolle(n) | CMD | USING | WITH CHECK |
|---------|-----|--------|----------|-----|-------|------------|
| _sql_parts | ✅ | — (keine Policy) |  |  | `` | `` |
| abrechnung_betriebsmodus | ✅ | admin_abrechnung_betriebsmodus_all | public | ALL | `is_admin()` | `` |
| abrechnung_betriebsmodus | ✅ | org_fence_abrechnung_betriebsmodus | public | ALL | `(organization_id = current_org_id())` | `` |
| abrechnung_betriebsmodus_historie | ✅ | admin_abrechnung_betriebsmodus_historie_all | public | ALL | `is_admin()` | `` |
| abrechnung_betriebsmodus_historie | ✅ | org_fence_abrechnung_betriebsmodus_historie | public | ALL | `(organization_id = current_org_id())` | `` |
| abrechnung_credential_rotationen | ✅ | admin_abrechnung_credential_rotationen_all | public | ALL | `is_admin()` | `` |
| abrechnung_credential_rotationen | ✅ | org_fence_abrechnung_credential_rotationen | public | ALL | `(organization_id = current_org_id())` | `` |
| abrechnung_zertifikate | ✅ | abrechnung_zertifikate_org_fence | public | ALL | `(organization_id = current_org_id())` | `(organization_id = current_org_id())` |
| abrechnung_zertifikate | ✅ | admin_zert | public | ALL | `is_admin()` | `is_admin()` |
| abrechnungslaeufe | ✅ | abrechnungslaeufe_org_fence | public | ALL | `(organization_id = current_org_id())` | `(organization_id = current_org_id())` |
| abrechnungslaeufe | ✅ | admin_abrechnung | public | ALL | `is_admin()` | `` |
| abrechnungslaeufe | ✅ | admin_abrechnungslaeufe | authenticated | ALL | `is_admin()` | `is_admin()` |
| abrechnungslaeufe | ✅ | org_fence_abrechnungslaeufe | public | ALL | `((organization_id IS NULL) OR (organization_id = current_org_id()))` | `` |
| absences | ✅ | absences_admin_all | public | ALL | `is_admin()` | `is_admin()` |
| absences | ✅ | absences_org_fence | public | ALL | `(organization_id = current_org_id())` | `(organization_id = current_org_id())` |
| absences | ✅ | absences_service_all | service_role | ALL | `true` | `true` |
| absences | ✅ | engel_absences_insert | authenticated | INSERT | `` | `((caregiver_id IN ( SELECT eigene_caregiver_ids() AS eigene_caregiver_ids)) AND (status = 'beantragt'::text))` |
| absences | ✅ | engel_absences_select | authenticated | SELECT | `(caregiver_id IN ( SELECT eigene_caregiver_ids() AS eigene_caregiver_ids))` | `` |
| account_deletion_tokens | ✅ | Service role only on deletion tokens | public | ALL | `false` | `false` |
| action_fingerprints | ✅ | action_fingerprints_admin_all | public | ALL | `is_admin()` | `is_admin()` |
| action_fingerprints | ✅ | action_fingerprints_service_all | service_role | ALL | `true` | `true` |
| aerzte_praxen | ✅ | admin_aerzte_praxen_all | public | ALL | `is_admin()` | `` |
| aerzte_praxen | ✅ | engel_aerzte_praxen_select | public | SELECT | `((auth.uid() IS NOT NULL) AND (aktiv = true))` | `` |
| aerzte_praxen | ✅ | org_fence_aerzte_praxen | public | ALL | `(organization_id = current_org_id())` | `` |
| akten_dokument_versionen | ✅ | admin_akten_versionen | public | ALL | `is_admin()` | `` |
| akten_dokument_versionen | ✅ | org_fence_akten_versionen | public | ALL | `(organization_id = current_org_id())` | `` |
| akten_dokumente | ✅ | admin_akten_dokumente | public | ALL | `is_admin()` | `` |
| akten_dokumente | ✅ | engel_akten_dokumente_select | public | SELECT | `((sichtbarkeit = ANY (ARRAY['engel'::text, 'alle'::text])) AND (deleted_at IS NULL) AND (caregiver_id IN ( SELECT eigene_caregiver_ids() AS eigene_caregiver_ids)))` | `` |
| akten_dokumente | ✅ | kunde_akten_dokumente_select | public | SELECT | `((sichtbarkeit = ANY (ARRAY['kunde'::text, 'alle'::text])) AND (deleted_at IS NULL) AND (client_id IN ( SELECT c.id    FROM clients c   WHERE (c.user_id = auth.uid()))))` | `` |
| akten_dokumente | ✅ | org_fence_akten_dokumente | public | ALL | `(organization_id = current_org_id())` | `` |
| akten_kontaktpersonen | ✅ | admin_akten_kontaktpersonen | public | ALL | `is_admin()` | `` |
| akten_kontaktpersonen | ✅ | org_fence_akten_kontaktpersonen | public | ALL | `(organization_id = current_org_id())` | `` |
| akten_vertraege | ✅ | admin_akten_vertraege | public | ALL | `is_admin()` | `` |
| akten_vertraege | ✅ | engel_akten_vertraege_select | public | SELECT | `((deleted_at IS NULL) AND (caregiver_id IN ( SELECT eigene_caregiver_ids() AS eigene_caregiver_ids)))` | `` |
| akten_vertraege | ✅ | kunde_akten_vertraege_select | public | SELECT | `((deleted_at IS NULL) AND (client_id IN ( SELECT c.id    FROM clients c   WHERE (c.user_id = auth.uid()))))` | `` |
| akten_vertraege | ✅ | org_fence_akten_vertraege | public | ALL | `(organization_id = current_org_id())` | `` |
| akten_zugriff_log | ✅ | admin_akten_zugriff | public | ALL | `is_admin()` | `` |
| akten_zugriff_log | ✅ | org_fence_akten_zugriff | public | ALL | `(organization_id = current_org_id())` | `` |
| analytics_events | ✅ | analytics_events_admin_read | authenticated | SELECT | `is_admin()` | `` |
| analytics_events | ✅ | analytics_events_service_insert | service_role | INSERT | `` | `true` |
| angehoerigen_audit_log | ✅ | admin_angeh_audit_all | public | ALL | `is_admin()` | `` |
| angehoerigen_audit_log | ✅ | org_fence_angeh_audit | public | ALL | `(organization_id = current_org_id())` | `` |
| angehoerigen_benachrichtigungen | ✅ | admin_angeh_benachr_all | public | ALL | `is_admin()` | `` |
| angehoerigen_benachrichtigungen | ✅ | angeh_eigene_benachr_select | public | SELECT | `(zugang_id IN ( SELECT angehoerigen_zugaenge.id    FROM angehoerigen_zugaenge   WHERE ((angehoerigen_zugaenge.user_id = auth.uid()) AND (angehoerigen_zugaenge.status = 'aktiv'::text))))` | `` |
| angehoerigen_benachrichtigungen | ✅ | org_fence_angeh_benachr | public | ALL | `(organization_id = current_org_id())` | `` |
| angehoerigen_nachrichten | ✅ | admin_angeh_nachr_all | public | ALL | `is_admin()` | `` |
| angehoerigen_nachrichten | ✅ | angeh_eigene_nachr_select | public | SELECT | `(zugang_id IN ( SELECT angehoerigen_zugaenge.id    FROM angehoerigen_zugaenge   WHERE ((angehoerigen_zugaenge.user_id = auth.uid()) AND (angehoerigen_zugaenge.status = 'aktiv'::text))))` | `` |
| angehoerigen_nachrichten | ✅ | angeh_nachr_insert | public | INSERT | `` | `((absender_id = auth.uid()) AND (absender_typ = 'angehoeriger'::text) AND (zugang_id IN ( SELECT angehoerigen_zugaenge.id    FROM angehoerigen_zugaenge   WHERE ((angehoerigen_zugaenge.user_id = auth.u` |
| angehoerigen_nachrichten | ✅ | org_fence_angeh_nachrichten | public | ALL | `(organization_id = current_org_id())` | `` |
| angehoerigen_zugaenge | ✅ | admin_angeh_zugaenge_all | public | ALL | `is_admin()` | `` |
| angehoerigen_zugaenge | ✅ | angeh_eigene_zugaenge_select | public | SELECT | `((user_id = auth.uid()) AND (status = 'aktiv'::text))` | `` |
| angehoerigen_zugaenge | ✅ | org_fence_angeh_zugaenge | public | ALL | `(organization_id = current_org_id())` | `` |
| angel_availability | ✅ | angel_availability_delete | authenticated | DELETE | `((angel_id = auth.uid()) OR is_admin())` | `` |
| angel_availability | ✅ | angel_availability_insert | authenticated | INSERT | `` | `((angel_id = auth.uid()) OR is_admin())` |
| angel_availability | ✅ | angel_availability_select | authenticated | SELECT | `true` | `` |
| angel_availability | ✅ | angel_availability_update | authenticated | UPDATE | `((angel_id = auth.uid()) OR is_admin())` | `((angel_id = auth.uid()) OR is_admin())` |
| angel_reviews | ✅ | angel_reviews_delete_eigene | authenticated | DELETE | `((customer_id = auth.uid()) OR (is_admin() AND buchung_in_aktiver_org(booking_id)))` | `` |
| angel_reviews | ✅ | angel_reviews_insert_eigene | authenticated | INSERT | `` | `((customer_id = auth.uid()) AND darf_buchung_bewerten(booking_id, angel_id))` |
| angel_reviews | ✅ | angel_reviews_select_beteiligte | authenticated | SELECT | `((customer_id = auth.uid()) OR (angel_id = auth.uid()) OR (is_admin() AND buchung_in_aktiver_org(booking_id)))` | `` |
| angel_reviews | ✅ | angel_reviews_update_eigene | authenticated | UPDATE | `(customer_id = auth.uid())` | `((customer_id = auth.uid()) AND darf_buchung_bewerten(booking_id, angel_id))` |
| angels | ✅ | Admin engelleri yönetebilir | public | ALL | `is_admin()` | `` |
| angels | ✅ | Angels can update own record | public | UPDATE | `(auth.uid() = id)` | `` |
| angels | ✅ | Angels can upsert own record | public | INSERT | `` | `(auth.uid() = id)` |
| angels | ✅ | Anyone can view angels | public | SELECT | `(NOT is_profile_soft_deleted(id))` | `` |
| angels | ✅ | Engel kendi profilini güncelleyebilir | public | UPDATE | `(auth.uid() = id)` | `` |
| angels | ✅ | Engel kendi profilini oluşturabilir | public | INSERT | `` | `(auth.uid() = id)` |
| angels | ✅ | Herkes engelleri okuyabilir | public | SELECT | `true` | `` |
| app_settings | ✅ | app_settings_read | public | SELECT | `((key <> 'demo_password'::text) OR is_admin())` | `` |
| app_settings | ✅ | app_settings_update | authenticated | UPDATE | `is_admin()` | `` |
| applications | ✅ | applications_admin_all | public | ALL | `is_admin()` | `is_admin()` |
| applications | ✅ | applications_org_fence | public | ALL | `(organization_id = current_org_id())` | `(organization_id = current_org_id())` |
| applications | ✅ | applications_service_all | service_role | ALL | `true` | `true` |
| approved_locations | ✅ | approved_locations_admin_all | public | ALL | `is_admin()` | `is_admin()` |
| approved_locations | ✅ | approved_locations_service_all | service_role | ALL | `true` | `true` |
| approved_locations | ✅ | approved_locations_staff_read | public | SELECT | `is_internal_staff()` | `` |
| arbeitszeit_verstoesse | ✅ | admin_arbeitszeit_verstoesse | public | ALL | `is_admin()` | `` |
| arbeitszeit_verstoesse | ✅ | org_fence_arbeitszeit_verstoesse | public | ALL | `(organization_id = current_org_id())` | `` |
| assignment_audit_log | ✅ | as_audit_admin_read | authenticated | SELECT | `is_admin()` | `` |
| assignment_audit_log | ✅ | as_audit_insert | authenticated | INSERT | `` | `is_admin()` |
| assignment_audit_log | ✅ | assignment_audit_log_org_fence | public | ALL | `(organization_id = current_org_id())` | `(organization_id = current_org_id())` |
| assignments | ✅ | assignments_admin_all | public | ALL | `is_admin()` | `is_admin()` |
| assignments | ✅ | assignments_admin_manage | authenticated | ALL | `is_admin()` | `is_admin()` |
| assignments | ✅ | assignments_engel_read | authenticated | SELECT | `((caregiver_id IN ( SELECT eigene_caregiver_ids() AS eigene_caregiver_ids)) OR (client_id IN ( SELECT eigene_client_ids() AS eigene_client_ids)) OR is_admin())` | `` |
| assignments | ✅ | assignments_engel_update | authenticated | UPDATE | `((caregiver_id IN ( SELECT eigene_caregiver_ids() AS eigene_caregiver_ids)) OR is_admin())` | `((caregiver_id IN ( SELECT eigene_caregiver_ids() AS eigene_caregiver_ids)) OR is_admin())` |
| assignments | ✅ | assignments_org_fence | public | ALL | `(organization_id = current_org_id())` | `(organization_id = current_org_id())` |
| assignments | ✅ | assignments_service_all | service_role | ALL | `true` | `true` |
| audit_logs | ✅ | audit_logs_admin_read | public | SELECT | `is_admin()` | `` |
| audit_logs | ✅ | audit_logs_service_all | service_role | ALL | `true` | `true` |
| billing_audit_trail | ✅ | billing_audit_trail_insert | authenticated | INSERT | `` | `is_admin()` |
| billing_audit_trail | ✅ | billing_audit_trail_org_fence | authenticated | ALL | `(organization_id = current_org_id())` | `(organization_id = current_org_id())` |
| billing_audit_trail | ✅ | billing_audit_trail_select | authenticated | SELECT | `(is_admin() OR is_internal_staff())` | `` |
| billing_feiertage | ✅ | billing_feiertage_admin | authenticated | ALL | `is_admin()` | `is_admin()` |
| billing_feiertage | ✅ | billing_feiertage_admin_write | authenticated | ALL | `is_admin()` | `is_admin()` |
| billing_feiertage | ✅ | billing_feiertage_read | authenticated | SELECT | `true` | `` |
| billing_fristen | ✅ | admin_crud_billing_fristen | public | ALL | `(EXISTS ( SELECT 1    FROM profiles   WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'superadmin'::text])))))` | `` |
| billing_fristen | ✅ | org_fence_billing_fristen | public | ALL | `(organization_id = (current_setting('app.current_org_id'::text, true))::uuid)` | `` |
| billing_gesetzliche_obergrenzen | ✅ | obergrenzen_admin_write | authenticated | ALL | `is_admin()` | `is_admin()` |
| billing_gesetzliche_obergrenzen | ✅ | obergrenzen_read | authenticated | SELECT | `true` | `` |
| billing_landesregel_keys | ✅ | landesregel_keys_read | authenticated | SELECT | `true` | `` |
| billing_landesregeln | ✅ | landesregeln_admin_write | authenticated | ALL | `is_admin()` | `is_admin()` |
| billing_landesregeln | ✅ | landesregeln_read | authenticated | SELECT | `((organization_id IS NULL) OR (organization_id = current_org_id()))` | `` |
| billing_leistungsarten | ✅ | billing_leistungsarten_admin | authenticated | ALL | `is_admin()` | `is_admin()` |
| billing_leistungsarten | ✅ | billing_leistungsarten_admin_write | authenticated | ALL | `is_admin()` | `is_admin()` |
| billing_leistungsarten | ✅ | billing_leistungsarten_read | authenticated | SELECT | `true` | `` |
| billing_number_sequences | ✅ | billing_number_sequences_insert | authenticated | INSERT | `` | `is_admin()` |
| billing_number_sequences | ✅ | billing_number_sequences_org_fence | authenticated | ALL | `(organization_id = current_org_id())` | `(organization_id = current_org_id())` |
| billing_number_sequences | ✅ | billing_number_sequences_select | authenticated | SELECT | `(is_admin() OR is_internal_staff())` | `` |
| billing_number_sequences | ✅ | billing_number_sequences_update | authenticated | UPDATE | `is_admin()` | `is_admin()` |
| billing_rechtsgrundlagen | ✅ | billing_rechtsgrundlagen_admin | authenticated | ALL | `is_admin()` | `is_admin()` |
| billing_rechtsgrundlagen | ✅ | billing_rechtsgrundlagen_admin_write | authenticated | ALL | `is_admin()` | `is_admin()` |
| billing_rechtsgrundlagen | ✅ | billing_rechtsgrundlagen_read | authenticated | SELECT | `true` | `` |
| billing_tarif_belege | ✅ | tarif_belege_admin_read | public | SELECT | `(is_admin() AND (organization_id IN ( SELECT om.organization_id    FROM organization_members om   WHERE (om.user_id = auth.uid()))))` | `` |
| billing_tariff_audit | ✅ | billing_tariff_audit_insert | authenticated | INSERT | `` | `(is_admin() AND (organization_id = current_org_id()))` |
| billing_tariff_audit | ✅ | billing_tariff_audit_select | authenticated | SELECT | `((is_admin() OR is_internal_staff()) AND (organization_id = current_org_id()))` | `` |
| billing_tariffs | ✅ | billing_tariffs_insert | authenticated | INSERT | `` | `is_admin()` |
| billing_tariffs | ✅ | billing_tariffs_org_fence | authenticated | ALL | `(organization_id = current_org_id())` | `(organization_id = current_org_id())` |
| billing_tariffs | ✅ | billing_tariffs_select | authenticated | SELECT | `(is_admin() OR is_internal_staff())` | `` |
| billing_tariffs | ✅ | billing_tariffs_update | authenticated | UPDATE | `is_admin()` | `is_admin()` |
| billing_tarifquellen | ✅ | billing_tarifquellen_admin | authenticated | ALL | `is_admin()` | `is_admin()` |
| billing_tarifquellen | ✅ | billing_tarifquellen_admin_write | authenticated | ALL | `is_admin()` | `is_admin()` |
| billing_tarifquellen | ✅ | billing_tarifquellen_read | authenticated | SELECT | `true` | `` |
| billing_wegepauschalen | ✅ | wegepauschalen_admin | authenticated | ALL | `is_admin()` | `is_admin()` |
| billing_wegepauschalen | ✅ | wegepauschalen_org_fence | authenticated | ALL | `(organization_id = current_org_id())` | `(organization_id = current_org_id())` |
| biografiebogen | ✅ | admin_biografiebogen | public | ALL | `is_admin()` | `` |
| biografiebogen | ✅ | engel_biografiebogen_select | public | SELECT | `engel_hat_aktiven_klienten(client_id)` | `` |
| biografiebogen | ✅ | org_fence_biografiebogen | public | ALL | `(organization_id = current_org_id())` | `` |
| bonus_berechnungen | ✅ | admin_bonus_berechnungen | authenticated | ALL | `is_admin()` | `is_admin()` |
| bonus_berechnungen | ✅ | org_fence_bonus_berechnungen | authenticated | ALL | `(organization_id = current_org_id())` | `` |
| bonus_freigaben | ✅ | admin_bonus_freigaben | authenticated | ALL | `is_admin()` | `is_admin()` |
| bonus_freigaben | ✅ | org_fence_bonus_freigaben | authenticated | ALL | `(organization_id = current_org_id())` | `` |
| bonus_regeln | ✅ | admin_bonus_regeln | authenticated | ALL | `is_admin()` | `is_admin()` |
| bonus_regeln | ✅ | org_fence_bonus_regeln | authenticated | ALL | `(organization_id = current_org_id())` | `` |
| bookings | ✅ | Kullanıcı kendi bookinglerini okuyabilir | public | SELECT | `((auth.uid() = customer_id) OR (auth.uid() = angel_id))` | `` |
| bookings | ✅ | Müşteri booking oluşturabilir | public | INSERT | `` | `(auth.uid() = customer_id)` |
| bookings | ✅ | bookings_admin | public | ALL | `is_admin()` | `` |
| bookings | ✅ | bookings_insert_customer | public | INSERT | `` | `((auth.uid() = customer_id) AND (NOT is_profile_soft_deleted(auth.uid())))` |
| bookings | ✅ | bookings_org_fence | public | ALL | `(organization_id = current_org_id())` | `(organization_id = current_org_id())` |
| bookings | ✅ | bookings_select_own | public | SELECT | `(((auth.uid() = customer_id) OR (auth.uid() = angel_id)) AND (NOT is_profile_soft_deleted(customer_id)) AND (NOT is_profile_soft_deleted(angel_id)))` | `` |
| bookings | ✅ | bookings_update_own | public | UPDATE | `(((auth.uid() = customer_id) OR (auth.uid() = angel_id)) AND (NOT is_profile_soft_deleted(auth.uid())))` | `` |
| bookings | ✅ | İlgili kişi bookingi güncelleyebilir | public | UPDATE | `((auth.uid() = customer_id) OR (auth.uid() = angel_id))` | `` |
| budget_reservations | ✅ | budget_res_admin | authenticated | ALL | `is_admin()` | `is_admin()` |
| budget_reservations | ✅ | budget_res_own | authenticated | SELECT | `(client_id IN ( SELECT clients.id    FROM clients   WHERE (clients.user_id = auth.uid())))` | `` |
| budget_reservations | ✅ | budget_reservations_org_fence | public | ALL | `(organization_id = current_org_id())` | `(organization_id = current_org_id())` |
| budget_transactions | ✅ | budget_transactions_org_fence | public | ALL | `(organization_id = current_org_id())` | `(organization_id = current_org_id())` |
| budget_transactions | ✅ | budget_tx_admin_all | public | ALL | `is_admin()` | `is_admin()` |
| budget_transactions | ✅ | budget_tx_service_all | service_role | ALL | `true` | `true` |
| bundeslaender | ✅ | bundeslaender_read | anon, authenticated | SELECT | `true` | `` |
| camt_imports | ✅ | admin_crud_camt_imports | authenticated | ALL | `is_admin()` | `` |
| camt_imports | ✅ | org_fence_camt_imports | public | ALL | `(organization_id = (current_setting('app.current_org_id'::text, true))::uuid)` | `` |
| care_notes | ✅ | care_notes_admin_all | public | ALL | `is_admin()` | `is_admin()` |
| care_notes | ✅ | care_notes_caregiver_insert | public | INSERT | `` | `((author_id = auth.uid()) AND (author_role = 'engel'::text))` |
| care_notes | ✅ | care_notes_caregiver_read | public | SELECT | `((author_id = auth.uid()) OR ((is_internal = false) AND (client_id IS NOT NULL) AND engel_hat_aktiven_klienten(client_id)))` | `` |
| care_notes | ✅ | care_notes_client_insert | public | INSERT | `` | `((author_id = auth.uid()) AND (author_role = 'kunde'::text))` |
| care_notes | ✅ | care_notes_client_read | public | SELECT | `((is_internal = false) AND (EXISTS ( SELECT 1    FROM clients cl   WHERE ((cl.id = care_notes.client_id) AND (cl.user_id = auth.uid())))))` | `` |
| care_notes | ✅ | care_notes_org_fence | public | ALL | `(organization_id = current_org_id())` | `(organization_id = current_org_id())` |
| care_notes | ✅ | care_notes_service_all | service_role | ALL | `true` | `true` |
| care_notes | ✅ | care_notes_staff_read | public | SELECT | `is_internal_staff()` | `` |
| care_notes | ✅ | care_notes_staff_write | public | INSERT | `` | `is_internal_staff()` |
| care_recipients | ✅ | Users can delete own care recipients | public | DELETE | `(auth.uid() = profile_id)` | `` |
| care_recipients | ✅ | Users can insert own care recipients | public | INSERT | `` | `(auth.uid() = profile_id)` |
| care_recipients | ✅ | Users can update own care recipients | public | UPDATE | `(auth.uid() = profile_id)` | `` |
| care_recipients | ✅ | Users can view own care recipients | public | SELECT | `(auth.uid() = profile_id)` | `` |
| care_recipients | ✅ | care_recipients_admin | authenticated | ALL | `is_admin()` | `is_admin()` |
| care_recipients | ✅ | care_recipients_org_fence | public | ALL | `(organization_id = current_org_id())` | `(organization_id = current_org_id())` |
| care_recipients | ✅ | care_recipients_owner | public | ALL | `(profile_id = auth.uid())` | `` |
| caregiver_bonuses | ✅ | caregiver_bonuses_org_fence | public | ALL | `(organization_id = current_org_id())` | `(organization_id = current_org_id())` |
| caregiver_bonuses | ✅ | cg_bonuses_admin_all | public | ALL | `is_admin()` | `is_admin()` |
| caregiver_bonuses | ✅ | cg_bonuses_service_all | service_role | ALL | `true` | `true` |
| caregiver_documents | ✅ | caregiver_documents_org_fence | public | ALL | `(organization_id = current_org_id())` | `(organization_id = current_org_id())` |
| caregiver_documents | ✅ | cg_docs_admin_all | public | ALL | `is_admin()` | `is_admin()` |
| caregiver_documents | ✅ | cg_docs_service_all | service_role | ALL | `true` | `true` |
| caregiver_initials_history | ✅ | caregiver_initials_history_org_fence | public | ALL | `(organization_id = current_org_id())` | `(organization_id = current_org_id())` |
| caregiver_initials_history | ✅ | cg_initials_admin_all | public | ALL | `is_admin()` | `is_admin()` |
| caregiver_initials_history | ✅ | cg_initials_service_all | service_role | ALL | `true` | `true` |
| caregiver_qualifications | ✅ | caregiver_qualifications_org_fence | public | ALL | `(organization_id = current_org_id())` | `(organization_id = current_org_id())` |
| caregiver_qualifications | ✅ | caregiver_quals_admin_all | public | ALL | `is_admin()` | `is_admin()` |
| caregiver_qualifications | ✅ | caregiver_quals_service_all | service_role | ALL | `true` | `true` |
| caregiver_qualifications | ✅ | engel_caregiver_quals_select | authenticated | SELECT | `(caregiver_id IN ( SELECT eigene_caregiver_ids() AS eigene_caregiver_ids))` | `` |
| caregivers | ✅ | caregivers_admin_all | public | ALL | `is_admin()` | `is_admin()` |
| caregivers | ✅ | caregivers_org_fence | public | ALL | `(organization_id = current_org_id())` | `(organization_id = current_org_id())` |
| caregivers | ✅ | caregivers_service_all | service_role | ALL | `true` | `true` |
| chat_messages | ✅ | chat_messages_insert_ride_participant | authenticated | INSERT | `` | `((sender_id = auth.uid()) AND (EXISTS ( SELECT 1    FROM krankenfahrten k   WHERE ((k.id = chat_messages.ride_id) AND ((k.customer_id = auth.uid()) OR (k.provider_id IN ( SELECT kp.id            FROM ` |
| chat_messages | ✅ | chat_messages_select_ride_participant | authenticated | SELECT | `((NOT is_profile_soft_deleted(auth.uid())) AND (EXISTS ( SELECT 1    FROM krankenfahrten k   WHERE ((k.id = chat_messages.ride_id) AND ((k.customer_id = auth.uid()) OR (k.provider_id IN ( SELECT kp.id` | `` |
| client_budgets | ✅ | client_budgets_admin_all | public | ALL | `is_admin()` | `is_admin()` |
| client_budgets | ✅ | client_budgets_client_read | public | SELECT | `(EXISTS ( SELECT 1    FROM clients cl   WHERE ((cl.user_id = auth.uid()) AND (cl.id = client_budgets.client_id))))` | `` |
| client_budgets | ✅ | client_budgets_org_fence | public | ALL | `(organization_id = current_org_id())` | `(organization_id = current_org_id())` |
| client_budgets | ✅ | client_budgets_service_all | service_role | ALL | `true` | `true` |
| client_preferred_substitutes | ✅ | client_preferred_substitutes_org_fence | public | ALL | `(organization_id = current_org_id())` | `(organization_id = current_org_id())` |
| client_preferred_substitutes | ✅ | preferred_subs_admin_all | public | ALL | `is_admin()` | `is_admin()` |
| client_preferred_substitutes | ✅ | preferred_subs_service_all | service_role | ALL | `true` | `true` |
| clients | ✅ | clients_admin_all | public | ALL | `is_admin()` | `is_admin()` |
| clients | ✅ | clients_caregiver_read | public | SELECT | `(EXISTS ( SELECT 1    FROM assignments a   WHERE ((a.caregiver_id IN ( SELECT eigene_caregiver_ids() AS eigene_caregiver_ids)) AND (a.client_id = clients.id) AND (a.status = ANY (ARRAY['active'::text,` | `` |
| clients | ✅ | clients_org_fence | public | ALL | `(organization_id = current_org_id())` | `(organization_id = current_org_id())` |
| clients | ✅ | clients_service_all | service_role | ALL | `true` | `true` |
| coach_abrechnungswege | ✅ | admin_coach_abrechnungswege | authenticated | ALL | `is_admin()` | `is_admin()` |
| coach_abrechnungswege | ✅ | org_fence_coach_abrechnungswege | authenticated | ALL | `(organization_id = current_org_id())` | `` |
| coach_activities | ✅ | coach_activities_owner_all | authenticated | ALL | `(coach_user_id IN ( SELECT cu.id    FROM coach_users cu   WHERE (cu.user_id = auth.uid())))` | `(coach_user_id IN ( SELECT cu.id    FROM coach_users cu   WHERE (cu.user_id = auth.uid())))` |
| coach_activities | ✅ | coach_activities_share_select | authenticated | SELECT | `(coach_user_id IN ( SELECT s.owner_coach_user_id    FROM coach_shares s   WHERE ((s.grantee_user_id = auth.uid()) AND (s.widerrufen_am IS NULL))))` | `` |
| coach_activity_log | ✅ | coach_activity_log_owner_all | authenticated | ALL | `(coach_user_id IN ( SELECT cu.id    FROM coach_users cu   WHERE (cu.user_id = auth.uid())))` | `(coach_user_id IN ( SELECT cu.id    FROM coach_users cu   WHERE (cu.user_id = auth.uid())))` |
| coach_activity_log | ✅ | coach_activity_log_share_select | authenticated | SELECT | `(coach_user_id IN ( SELECT s.owner_coach_user_id    FROM coach_shares s   WHERE ((s.grantee_user_id = auth.uid()) AND (s.widerrufen_am IS NULL))))` | `` |
| coach_anspruchspruefungen | ✅ | coach_anspruchspruefungen_owner_all | authenticated | ALL | `(coach_user_id IN ( SELECT cu.id    FROM coach_users cu   WHERE (cu.user_id = auth.uid())))` | `(coach_user_id IN ( SELECT cu.id    FROM coach_users cu   WHERE (cu.user_id = auth.uid())))` |
| coach_assessments | ✅ | coach_assessments_owner_all | authenticated | ALL | `(coach_user_id IN ( SELECT cu.id    FROM coach_users cu   WHERE (cu.user_id = auth.uid())))` | `(coach_user_id IN ( SELECT cu.id    FROM coach_users cu   WHERE (cu.user_id = auth.uid())))` |
| coach_assessments | ✅ | coach_assessments_share_select | authenticated | SELECT | `(coach_user_id IN ( SELECT s.owner_coach_user_id    FROM coach_shares s   WHERE ((s.grantee_user_id = auth.uid()) AND (s.widerrufen_am IS NULL))))` | `` |
| coach_audit_log | ✅ | coach_audit_log_select_self | authenticated | SELECT | `(coach_user_id IN ( SELECT cu.id    FROM coach_users cu   WHERE (cu.user_id = auth.uid())))` | `` |
| coach_bestellungen | ✅ | coach_bestellungen_select_self | authenticated | SELECT | `(coach_user_id IN ( SELECT cu.id    FROM coach_users cu   WHERE (cu.user_id = auth.uid())))` | `` |
| coach_consents | ✅ | coach_consents_insert_self | authenticated | INSERT | `` | `(coach_user_id IN ( SELECT cu.id    FROM coach_users cu   WHERE (cu.user_id = auth.uid())))` |
| coach_consents | ✅ | coach_consents_select_self | authenticated | SELECT | `(coach_user_id IN ( SELECT cu.id    FROM coach_users cu   WHERE (cu.user_id = auth.uid())))` | `` |
| coach_consents | ✅ | coach_consents_update_self | authenticated | UPDATE | `(coach_user_id IN ( SELECT cu.id    FROM coach_users cu   WHERE (cu.user_id = auth.uid())))` | `(coach_user_id IN ( SELECT cu.id    FROM coach_users cu   WHERE (cu.user_id = auth.uid())))` |
| coach_freischaltcodes | ✅ | admin_coach_freischaltcodes | authenticated | ALL | `is_admin()` | `is_admin()` |
| coach_freischaltcodes | ✅ | org_fence_coach_freischaltcodes | authenticated | ALL | `(organization_id = current_org_id())` | `` |
| coach_freischaltungen | ✅ | coach_freischaltungen_select_self | authenticated | SELECT | `(coach_user_id IN ( SELECT cu.id    FROM coach_users cu   WHERE (cu.user_id = auth.uid())))` | `` |
| coach_goals | ✅ | coach_goals_owner_all | authenticated | ALL | `(coach_user_id IN ( SELECT cu.id    FROM coach_users cu   WHERE (cu.user_id = auth.uid())))` | `(coach_user_id IN ( SELECT cu.id    FROM coach_users cu   WHERE (cu.user_id = auth.uid())))` |
| coach_goals | ✅ | coach_goals_share_select | authenticated | SELECT | `(coach_user_id IN ( SELECT s.owner_coach_user_id    FROM coach_shares s   WHERE ((s.grantee_user_id = auth.uid()) AND (s.widerrufen_am IS NULL))))` | `` |
| coach_measurements | ✅ | coach_measurements_owner_all | authenticated | ALL | `(coach_user_id IN ( SELECT cu.id    FROM coach_users cu   WHERE (cu.user_id = auth.uid())))` | `(coach_user_id IN ( SELECT cu.id    FROM coach_users cu   WHERE (cu.user_id = auth.uid())))` |
| coach_measurements | ✅ | coach_measurements_share_select | authenticated | SELECT | `(coach_user_id IN ( SELECT s.owner_coach_user_id    FROM coach_shares s   WHERE ((s.grantee_user_id = auth.uid()) AND (s.widerrufen_am IS NULL))))` | `` |
| coach_nutzungsereignisse | ✅ | coach_nutzungsereignisse_self_delete | authenticated | DELETE | `(pseudonym = coach_mein_pseudonym())` | `` |
| coach_nutzungsereignisse | ✅ | coach_nutzungsereignisse_self_insert | authenticated | INSERT | `` | `(pseudonym = coach_mein_pseudonym())` |
| coach_nutzungsereignisse | ✅ | coach_nutzungsereignisse_self_select | authenticated | SELECT | `(pseudonym = coach_mein_pseudonym())` | `` |
| coach_pseudonym_key | ✅ | — (keine Policy) |  |  | `` | `` |
| coach_rechnungen | ✅ | coach_rechnungen_select_self | authenticated | SELECT | `(coach_user_id IN ( SELECT cu.id    FROM coach_users cu   WHERE (cu.user_id = auth.uid())))` | `` |
| coach_reports | ✅ | coach_reports_insert_self | authenticated | INSERT | `` | `(coach_user_id IN ( SELECT cu.id    FROM coach_users cu   WHERE (cu.user_id = auth.uid())))` |
| coach_reports | ✅ | coach_reports_select_self | authenticated | SELECT | `(coach_user_id IN ( SELECT cu.id    FROM coach_users cu   WHERE (cu.user_id = auth.uid())))` | `` |
| coach_reports | ✅ | coach_reports_share_select | authenticated | SELECT | `(coach_user_id IN ( SELECT s.owner_coach_user_id    FROM coach_shares s   WHERE ((s.grantee_user_id = auth.uid()) AND (s.widerrufen_am IS NULL))))` | `` |
| coach_shares | ✅ | coach_shares_grantee_select | authenticated | SELECT | `(grantee_user_id = auth.uid())` | `` |
| coach_shares | ✅ | coach_shares_owner_all | authenticated | ALL | `(owner_coach_user_id IN ( SELECT cu.id    FROM coach_users cu   WHERE (cu.user_id = auth.uid())))` | `(owner_coach_user_id IN ( SELECT cu.id    FROM coach_users cu   WHERE (cu.user_id = auth.uid())))` |
| coach_users | ✅ | coach_users_self | authenticated | ALL | `(user_id = auth.uid())` | `(user_id = auth.uid())` |
| coach_zahlungen | ✅ | coach_zahlungen_select_self | authenticated | SELECT | `(coach_user_id IN ( SELECT cu.id    FROM coach_users cu   WHERE (cu.user_id = auth.uid())))` | `` |
| content_blocks | ✅ | Admin manages all content | public | ALL | `is_admin()` | `` |
| content_blocks | ✅ | Public can read active content | public | SELECT | `((status = 'active'::text) AND (context = 'public'::text))` | `` |
| conversions | ✅ | Service role full access | service_role | ALL | `true` | `true` |
| cooperation_partners | ✅ | coop_partners_admin_all | public | ALL | `is_admin()` | `is_admin()` |
| cooperation_partners | ✅ | coop_partners_service_all | service_role | ALL | `true` | `true` |
| cooperation_partners | ✅ | cooperation_partners_org_fence | public | ALL | `(organization_id = current_org_id())` | `(organization_id = current_org_id())` |
| datenannahmestellen | ✅ | admin_das | authenticated | ALL | `is_admin()` | `is_admin()` |
| datenannahmestellen | ✅ | org_fence_das | public | ALL | `((organization_id IS NULL) OR (organization_id = current_org_id()))` | `` |
| datev_exports | ✅ | admin_crud_datev_exports | authenticated | ALL | `is_admin()` | `` |
| datev_exports | ✅ | org_fence_datev_exports | public | ALL | `(organization_id = (current_setting('app.current_org_id'::text, true))::uuid)` | `` |
| datev_kontenzuordnung | ✅ | admin_crud_datev_kontenzuordnung | authenticated | ALL | `is_admin()` | `` |
| datev_kontenzuordnung | ✅ | org_fence_datev_kontenzuordnung | public | ALL | `(organization_id = (current_setting('app.current_org_id'::text, true))::uuid)` | `` |
| dienstplan_eintraege | ✅ | admin_dienstplan_eintraege | authenticated | ALL | `is_admin()` | `` |
| dienstplan_eintraege | ✅ | engel_dienstplan_eintraege_select | authenticated | SELECT | `(caregiver_id IN ( SELECT eigene_caregiver_ids() AS eigene_caregiver_ids))` | `` |
| dienstplan_eintraege | ✅ | org_fence_dienstplan_eintraege | authenticated | ALL | `(organization_id = current_org_id())` | `(organization_id = current_org_id())` |
| dienstplan_schichten | ✅ | admin_dienstplan_schichten | authenticated | ALL | `is_admin()` | `` |
| dienstplan_schichten | ✅ | engel_dienstplan_schichten_select | authenticated | SELECT | `(aktiv = true)` | `` |
| dienstplan_schichten | ✅ | org_fence_dienstplan_schichten | authenticated | ALL | `(organization_id = current_org_id())` | `(organization_id = current_org_id())` |
| dispatch_status | ✅ | dispatch_status_admin_all | public | ALL | `is_admin()` | `is_admin()` |
| dispatch_status | ✅ | dispatch_status_org_fence | public | ALL | `(organization_id = current_org_id())` | `(organization_id = current_org_id())` |
| dispatch_status | ✅ | dispatch_status_service_all | service_role | ALL | `true` | `true` |
| dispatch_status | ✅ | dispatch_status_staff_read | public | SELECT | `is_internal_staff()` | `` |
| documents | ✅ | documents_admin | public | ALL | `is_admin()` | `` |
| documents | ✅ | documents_admin_all | authenticated | ALL | `is_admin()` | `` |
| documents | ✅ | documents_delete_own | public | DELETE | `((auth.uid() = user_id) AND (NOT is_profile_soft_deleted(auth.uid())))` | `` |
| documents | ✅ | documents_insert_own | public | INSERT | `` | `((auth.uid() = user_id) AND (NOT is_profile_soft_deleted(auth.uid())))` |
| documents | ✅ | documents_org_fence | public | ALL | `(organization_id = current_org_id())` | `(organization_id = current_org_id())` |
| documents | ✅ | documents_select_own | public | SELECT | `((auth.uid() = user_id) AND (NOT is_profile_soft_deleted(auth.uid())))` | `` |
| documents | ✅ | documents_update_own | public | UPDATE | `((auth.uid() = user_id) AND (NOT is_profile_soft_deleted(auth.uid())))` | `((auth.uid() = user_id) AND (NOT is_profile_soft_deleted(auth.uid())))` |
| documents | ✅ | documents_user_delete | authenticated | DELETE | `(user_id = auth.uid())` | `` |
| documents | ✅ | documents_user_update | authenticated | UPDATE | `(user_id = auth.uid())` | `` |
| dta_dakota_auftraege | ✅ | admin_da | authenticated | ALL | `is_admin()` | `is_admin()` |
| dta_dakota_auftraege | ✅ | org_fence_da | public | ALL | `(organization_id = current_org_id())` | `` |
| dta_dead_letter | ✅ | admin_dta_dead_letter_all | public | ALL | `is_admin()` | `` |
| dta_dead_letter | ✅ | org_fence_dta_dead_letter | public | ALL | `(organization_id = current_org_id())` | `` |
| dta_fehlercode_katalog | ✅ | admin_dta_fehlercode_katalog_all | public | ALL | `is_admin()` | `` |
| dta_fehlercode_katalog | ✅ | org_fence_dta_fehlercode_katalog | public | ALL | `((organization_id IS NULL) OR (organization_id = current_org_id()))` | `` |
| dta_fehlerprotokoll | ✅ | admin_fp | authenticated | ALL | `is_admin()` | `is_admin()` |
| dta_fehlerprotokoll | ✅ | org_fence_fp | public | ALL | `(organization_id = current_org_id())` | `` |
| dta_korrekturlaeufe | ✅ | admin_kl | authenticated | ALL | `is_admin()` | `is_admin()` |
| dta_korrekturlaeufe | ✅ | org_fence_kl | public | ALL | `(organization_id = current_org_id())` | `` |
| dta_kostentraeger | ✅ | admin_kt | authenticated | ALL | `is_admin()` | `is_admin()` |
| dta_kostentraeger | ✅ | org_fence_kt | public | ALL | `(organization_id = current_org_id())` | `` |
| dta_lauf_rechnungen | ✅ | admin_dlr | authenticated | ALL | `is_admin()` | `is_admin()` |
| dta_lauf_rechnungen | ✅ | org_fence_dlr | public | ALL | `(organization_id = current_org_id())` | `` |
| dta_ruecklaeufer | ✅ | admin_rl | authenticated | ALL | `is_admin()` | `is_admin()` |
| dta_ruecklaeufer | ✅ | org_fence_rl | public | ALL | `(organization_id = current_org_id())` | `` |
| dta_ruecklaeufer_positionen | ✅ | admin_rlp | authenticated | ALL | `is_admin()` | `is_admin()` |
| dta_ruecklaeufer_positionen | ✅ | org_fence_rlp | public | ALL | `(organization_id = current_org_id())` | `` |
| dta_validierungen | ✅ | admin_val | authenticated | ALL | `is_admin()` | `is_admin()` |
| dta_validierungen | ✅ | org_fence_val | public | ALL | `(organization_id = current_org_id())` | `` |
| dta_versand_protokoll | ✅ | admin_dta_versand_protokoll_all | public | ALL | `is_admin()` | `` |
| dta_versand_protokoll | ✅ | org_fence_dta_versand_protokoll | public | ALL | `(organization_id = current_org_id())` | `` |
| dta_wiedervorlage | ✅ | admin_dta_wiedervorlage_all | public | ALL | `is_admin()` | `` |
| dta_wiedervorlage | ✅ | org_fence_dta_wiedervorlage | public | ALL | `(organization_id = current_org_id())` | `` |
| dunning_documents | ✅ | admin_crud_dunning_documents | authenticated | ALL | `is_admin()` | `` |
| dunning_documents | ✅ | org_fence_dunning_documents | public | ALL | `(organization_id = current_org_id())` | `(organization_id = current_org_id())` |
| dunning_email_queue | ✅ | dunning_email_queue_admin | public | ALL | `is_admin()` | `` |
| dunning_email_queue | ✅ | org_fence_dunning_email_queue | public | ALL | `(organization_id = current_org_id())` | `` |
| dunning_entries | ✅ | dunning_admin_all | authenticated | ALL | `is_admin()` | `` |
| dunning_entries | ✅ | org_fence_dunning_entries | public | ALL | `(organization_id = current_org_id())` | `` |
| einsatz_absagen | ✅ | admin_absagen | public | ALL | `is_admin()` | `is_admin()` |
| einsatz_absagen | ✅ | einsatz_absagen_org_fence | public | ALL | `(organization_id = current_org_id())` | `(organization_id = current_org_id())` |
| eul_erbringungen | ✅ | admin_eul_erbringungen | authenticated | ALL | `is_admin()` | `is_admin()` |
| eul_erbringungen | ✅ | org_fence_eul_erbringungen | authenticated | ALL | `(organization_id = current_org_id())` | `` |
| eul_qualifikationen | ✅ | admin_eul_qualifikationen | authenticated | ALL | `is_admin()` | `is_admin()` |
| eul_qualifikationen | ✅ | org_fence_eul_qualifikationen | authenticated | ALL | `(organization_id = current_org_id())` | `` |
| fahrzeuge | ✅ | Customers can view active vehicles | public | SELECT | `(is_active = true)` | `` |
| fahrzeuge | ✅ | Providers can manage own vehicles | public | ALL | `(provider_id IN ( SELECT krankenfahrt_providers.id    FROM krankenfahrt_providers   WHERE (krankenfahrt_providers.user_id = auth.uid())))` | `` |
| fahrzeuge | ✅ | fahrzeuge_org_fence | public | ALL | `(organization_id = current_org_id())` | `(organization_id = current_org_id())` |
| fcm_tokens | ✅ | Service role can read all fcm tokens | public | SELECT | `(auth.role() = 'service_role'::text)` | `` |
| fcm_tokens | ✅ | Users can manage own fcm tokens | public | ALL | `(auth.uid() = user_id)` | `(auth.uid() = user_id)` |
| fem_ueberwachungen | ✅ | admin_fem_ueberwachungen | public | ALL | `is_admin()` | `` |
| fem_ueberwachungen | ✅ | engel_fem_ueberwachungen_insert | public | INSERT | `` | `((kontrolliert_von = auth.uid()) AND (EXISTS ( SELECT 1    FROM freiheitsentziehende_massnahmen m   WHERE ((m.id = fem_ueberwachungen.massnahme_id) AND engel_hat_aktiven_klienten(m.client_id)))))` |
| fem_ueberwachungen | ✅ | engel_fem_ueberwachungen_select | public | SELECT | `(EXISTS ( SELECT 1    FROM freiheitsentziehende_massnahmen m   WHERE ((m.id = fem_ueberwachungen.massnahme_id) AND engel_hat_aktiven_klienten(m.client_id))))` | `` |
| fem_ueberwachungen | ✅ | org_fence_fem_ueberwachungen | public | ALL | `(organization_id = current_org_id())` | `` |
| fhir_audit_log | ✅ | admin_fhir_audit_log | authenticated | ALL | `is_admin()` | `is_admin()` |
| fhir_audit_log | ✅ | org_fence_fhir_audit_log | authenticated | ALL | `(organization_id = current_org_id())` | `(organization_id = current_org_id())` |
| freiheitsentziehende_massnahmen | ✅ | admin_fem | public | ALL | `is_admin()` | `` |
| freiheitsentziehende_massnahmen | ✅ | engel_fem_select | public | SELECT | `engel_hat_aktiven_klienten(client_id)` | `` |
| freiheitsentziehende_massnahmen | ✅ | org_fence_fem | public | ALL | `(organization_id = current_org_id())` | `` |
| geo_events | ✅ | geo_events_admin_all | public | ALL | `is_admin()` | `is_admin()` |
| geo_events | ✅ | geo_events_caregiver_read | public | SELECT | `is_own_caregiver(caregiver_id)` | `` |
| geo_events | ✅ | geo_events_service_all | service_role | ALL | `true` | `true` |
| geo_events | ✅ | geo_events_staff_read | public | SELECT | `is_internal_staff()` | `` |
| hygienebox_orders | ✅ | Users can insert own hygienebox orders | public | INSERT | `` | `(auth.uid() = user_id)` |
| hygienebox_orders | ✅ | Users can update own hygienebox orders | public | UPDATE | `(auth.uid() = user_id)` | `` |
| hygienebox_orders | ✅ | Users can view own hygienebox orders | public | SELECT | `(auth.uid() = user_id)` | `` |
| hygienebox_orders | ✅ | hygienebox_orders_org_fence | public | ALL | `(organization_id = current_org_id())` | `(organization_id = current_org_id())` |
| invoice_corrections | ✅ | invoice_corrections_insert | authenticated | INSERT | `` | `is_admin()` |
| invoice_corrections | ✅ | invoice_corrections_org_fence | authenticated | ALL | `(organization_id = current_org_id())` | `(organization_id = current_org_id())` |
| invoice_corrections | ✅ | invoice_corrections_select | authenticated | SELECT | `(is_admin() OR is_internal_staff())` | `` |
| invoice_corrections | ✅ | invoice_corrections_update | authenticated | UPDATE | `is_admin()` | `is_admin()` |
| invoice_disputes | ✅ | invoice_disputes_admin_all | public | ALL | `is_admin()` | `is_admin()` |
| invoice_disputes | ✅ | invoice_disputes_org_fence | authenticated | ALL | `(organization_id = current_org_id())` | `(organization_id = current_org_id())` |
| invoice_disputes | ✅ | invoice_disputes_service_all | service_role | ALL | `true` | `true` |
| invoice_items | ✅ | invoice_items_admin_all | public | ALL | `is_admin()` | `is_admin()` |
| invoice_items | ✅ | invoice_items_anon_deny | anon | ALL | `false` | `false` |
| invoice_items | ✅ | invoice_items_client_read | public | SELECT | `(EXISTS ( SELECT 1    FROM (invoices inv      JOIN clients cl ON ((cl.id = inv.client_id)))   WHERE ((inv.id = invoice_items.invoice_id) AND (cl.user_id = auth.uid()))))` | `` |
| invoice_items | ✅ | invoice_items_org_fence | authenticated | ALL | `(organization_id = current_org_id())` | `(organization_id = current_org_id())` |
| invoice_items | ✅ | invoice_items_service_all | service_role | ALL | `true` | `true` |
| invoice_line_snapshots | ✅ | invoice_line_snapshots_insert | authenticated | INSERT | `` | `is_admin()` |
| invoice_line_snapshots | ✅ | invoice_line_snapshots_org_fence | authenticated | ALL | `(organization_id = current_org_id())` | `(organization_id = current_org_id())` |
| invoice_line_snapshots | ✅ | invoice_line_snapshots_select | authenticated | SELECT | `(is_admin() OR is_internal_staff())` | `` |
| invoice_packages | ✅ | invoice_packages_admin_all | public | ALL | `is_admin()` | `is_admin()` |
| invoice_packages | ✅ | invoice_packages_org_fence | public | ALL | `(organization_id = current_org_id())` | `(organization_id = current_org_id())` |
| invoice_packages | ✅ | invoice_packages_service_all | service_role | ALL | `true` | `true` |
| invoice_packages | ✅ | invoice_packages_staff_read | public | SELECT | `is_internal_staff()` | `` |
| invoice_snapshots | ✅ | invoice_snapshots_insert | authenticated | INSERT | `` | `is_admin()` |
| invoice_snapshots | ✅ | invoice_snapshots_org_fence | authenticated | ALL | `(organization_id = current_org_id())` | `(organization_id = current_org_id())` |
| invoice_snapshots | ✅ | invoice_snapshots_select | authenticated | SELECT | `(is_admin() OR is_internal_staff())` | `` |
| invoices | ✅ | invoices_admin_all | public | ALL | `is_admin()` | `is_admin()` |
| invoices | ✅ | invoices_anon_deny | anon | ALL | `false` | `false` |
| invoices | ✅ | invoices_client_read | public | SELECT | `(EXISTS ( SELECT 1    FROM clients cl   WHERE ((cl.user_id = auth.uid()) AND (cl.id = invoices.client_id))))` | `` |
| invoices | ✅ | invoices_org_fence | authenticated | ALL | `(organization_id = current_org_id())` | `(organization_id = current_org_id())` |
| invoices | ✅ | invoices_service_all | service_role | ALL | `true` | `true` |
| kf_booking_reviews | ✅ | Admin manages booking reviews | public | ALL | `is_admin()` | `` |
| kf_feature_flags | ✅ | Admin manages feature flags | public | ALL | `is_admin()` | `` |
| kf_feature_flags | ✅ | Auth can read feature flags | public | SELECT | `true` | `` |
| kf_partner_availability | ✅ | Admin manages partner availability | public | ALL | `is_admin()` | `` |
| kf_partners | ✅ | Admin manages partners | public | ALL | `is_admin()` | `` |
| kf_pricing_audit | ✅ | Admin read audit | public | SELECT | `is_admin()` | `` |
| kf_pricing_audit | ✅ | Admins can insert audit entries | authenticated | INSERT | `` | `(actor_id = auth.uid())` |
| kf_pricing_config | ✅ | Admin full access config | public | ALL | `is_admin()` | `` |
| kf_pricing_config | ✅ | Anyone can read enabled config | public | SELECT | `(enabled = true)` | `` |
| kf_pricing_costs | ✅ | Admin manages costs | public | ALL | `is_admin()` | `` |
| kf_pricing_regions | ✅ | Admin full access regions | public | ALL | `is_admin()` | `` |
| kf_pricing_regions | ✅ | Anyone can read enabled regions | public | SELECT | `(enabled = true)` | `` |
| kf_pricing_rules | ✅ | Admin manages pricing rules | public | ALL | `is_admin()` | `` |
| kf_pricing_surcharges | ✅ | Admin full access surcharges | public | ALL | `is_admin()` | `` |
| kf_pricing_surcharges | ✅ | Anyone can read enabled surcharges | public | SELECT | `(enabled = true)` | `` |
| kf_pricing_tiers | ✅ | Admin full access tiers | public | ALL | `is_admin()` | `` |
| kf_pricing_tiers | ✅ | Anyone can read enabled tiers | public | SELECT | `(enabled = true)` | `` |
| kf_review_rules | ✅ | Admin manages review rules | public | ALL | `is_admin()` | `` |
| kf_review_rules | ✅ | Auth can read enabled review rules | public | SELECT | `(enabled = true)` | `` |
| kf_service_doc_requirements | ✅ | Admin manages doc requirements | public | ALL | `is_admin()` | `` |
| kf_service_doc_requirements | ✅ | Auth can read doc requirements | public | SELECT | `(enabled = true)` | `` |
| kim_addresses | ✅ | admin_kim_addresses_all | public | ALL | `is_admin()` | `` |
| kim_addresses | ✅ | org_fence_kim_addresses | public | ALL | `(organization_id = current_org_id())` | `` |
| kim_attachments | ✅ | admin_kim_attachments_all | public | ALL | `is_admin()` | `` |
| kim_attachments | ✅ | engel_kim_attachments_select | public | SELECT | `(EXISTS ( SELECT 1    FROM kim_messages m   WHERE ((m.id = kim_attachments.message_id) AND (((m.related_client_id IS NOT NULL) AND engel_hat_aktiven_klienten(m.related_client_id)) OR (m.related_caregi` | `` |
| kim_attachments | ✅ | org_fence_kim_attachments | public | ALL | `(organization_id = current_org_id())` | `` |
| kim_audit_log | ✅ | admin_kim_audit_log_all | public | ALL | `is_admin()` | `` |
| kim_audit_log | ✅ | org_fence_kim_audit_log | public | ALL | `(organization_id = current_org_id())` | `` |
| kim_formatversionen | ✅ | admin_kim_formatversionen_all | public | ALL | `is_admin()` | `` |
| kim_formatversionen | ✅ | org_fence_kim_formatversionen | public | ALL | `(organization_id = current_org_id())` | `` |
| kim_karten | ✅ | admin_kim_karten_all | public | ALL | `is_admin()` | `` |
| kim_karten | ✅ | org_fence_kim_karten | public | ALL | `(organization_id = current_org_id())` | `` |
| kim_konfiguration | ✅ | admin_kim_konfiguration_all | public | ALL | `is_admin()` | `` |
| kim_konfiguration | ✅ | org_fence_kim_konfiguration | public | ALL | `(organization_id = current_org_id())` | `` |
| kim_messages | ✅ | admin_kim_messages_all | public | ALL | `is_admin()` | `` |
| kim_messages | ✅ | engel_kim_messages_select | public | SELECT | `(((related_client_id IS NOT NULL) AND engel_hat_aktiven_klienten(related_client_id)) OR (related_caregiver_id IN ( SELECT eigene_caregiver_ids() AS eigene_caregiver_ids)))` | `` |
| kim_messages | ✅ | org_fence_kim_messages | public | ALL | `(organization_id = current_org_id())` | `` |
| kim_nachrichten | ✅ | admin_kim_nachrichten_all | public | ALL | `is_admin()` | `` |
| kim_nachrichten | ✅ | org_fence_kim_nachrichten | public | ALL | `(organization_id = current_org_id())` | `` |
| kim_provider_config | ✅ | admin_kim_provider_config_all | public | ALL | `is_admin()` | `` |
| kim_provider_config | ✅ | org_fence_kim_provider_config | public | ALL | `(organization_id = current_org_id())` | `` |
| klaerfaelle | ✅ | admin_crud_klaerfaelle | authenticated | ALL | `is_admin()` | `` |
| klaerfaelle | ✅ | org_fence_klaerfaelle | public | ALL | `(organization_id = (current_setting('app.current_org_id'::text, true))::uuid)` | `` |
| kostentraeger_kontakte | ✅ | admin_kostentraeger | public | ALL | `is_admin()` | `is_admin()` |
| kostentraeger_kontakte | ✅ | kostentraeger_kontakte_org_fence | public | ALL | `(organization_id = current_org_id())` | `(organization_id = current_org_id())` |
| krankenfahrt_providers | ✅ | Admins can delete providers | public | DELETE | `is_admin()` | `` |
| krankenfahrt_providers | ✅ | Admins can update all providers | public | UPDATE | `is_admin()` | `` |
| krankenfahrt_providers | ✅ | Admins can view all providers | public | SELECT | `is_admin()` | `` |
| krankenfahrt_providers | ✅ | Customers can view active providers | public | SELECT | `((is_active = true) AND (is_verified = true))` | `` |
| krankenfahrt_providers | ✅ | Providers can insert own data | public | INSERT | `` | `(auth.uid() = user_id)` |
| krankenfahrt_providers | ✅ | Providers can update own data | public | UPDATE | `(auth.uid() = user_id)` | `` |
| krankenfahrt_providers | ✅ | Providers can view own data | public | SELECT | `(auth.uid() = user_id)` | `` |
| krankenfahrt_reviews | ✅ | Admins can view all reviews | public | SELECT | `is_admin()` | `` |
| krankenfahrt_reviews | ✅ | Customers can insert own reviews | public | INSERT | `` | `(auth.uid() = customer_id)` |
| krankenfahrt_reviews | ✅ | Customers can view own reviews | public | SELECT | `(auth.uid() = customer_id)` | `` |
| krankenfahrt_reviews | ✅ | Providers can view own reviews | public | SELECT | `(provider_id IN ( SELECT krankenfahrt_providers.id    FROM krankenfahrt_providers   WHERE (krankenfahrt_providers.user_id = auth.uid())))` | `` |
| krankenfahrten | ✅ | Admins can delete krankenfahrten | public | DELETE | `is_admin()` | `` |
| krankenfahrten | ✅ | Admins can update all krankenfahrten | public | UPDATE | `is_admin()` | `` |
| krankenfahrten | ✅ | Admins can view all krankenfahrten | public | SELECT | `is_admin()` | `` |
| krankenfahrten | ✅ | Providers can claim pending rides | public | UPDATE | `((status = 'pending'::text) AND (provider_id IS NULL) AND (EXISTS ( SELECT 1    FROM krankenfahrt_providers   WHERE ((krankenfahrt_providers.user_id = auth.uid()) AND (krankenfahrt_providers.is_verifi` | `` |
| krankenfahrten | ✅ | Providers can update assigned rides | public | UPDATE | `(provider_id IN ( SELECT krankenfahrt_providers.id    FROM krankenfahrt_providers   WHERE (krankenfahrt_providers.user_id = auth.uid())))` | `` |
| krankenfahrten | ✅ | Providers can view assigned rides | public | SELECT | `(provider_id IN ( SELECT krankenfahrt_providers.id    FROM krankenfahrt_providers   WHERE (krankenfahrt_providers.user_id = auth.uid())))` | `` |
| krankenfahrten | ✅ | Providers can view pending rides | public | SELECT | `((status = 'pending'::text) AND (provider_id IS NULL) AND (EXISTS ( SELECT 1    FROM krankenfahrt_providers   WHERE ((krankenfahrt_providers.user_id = auth.uid()) AND (krankenfahrt_providers.is_verifi` | `` |
| krankenfahrten | ✅ | Users can insert own krankenfahrten | public | INSERT | `` | `(auth.uid() = customer_id)` |
| krankenfahrten | ✅ | Users can update own krankenfahrten | public | UPDATE | `(auth.uid() = customer_id)` | `` |
| krankenfahrten | ✅ | Users can view own krankenfahrten | public | SELECT | `(auth.uid() = customer_id)` | `` |
| lagerungsprotokolle | ✅ | admin_lagerungsprotokolle | public | ALL | `is_admin()` | `` |
| lagerungsprotokolle | ✅ | engel_lagerungsprotokolle_insert | public | INSERT | `` | `((durchgefuehrt_von = auth.uid()) AND engel_hat_aktiven_klienten(client_id))` |
| lagerungsprotokolle | ✅ | engel_lagerungsprotokolle_select | public | SELECT | `engel_hat_aktiven_klienten(client_id)` | `` |
| lagerungsprotokolle | ✅ | org_fence_lagerungsprotokolle | public | ALL | `(organization_id = current_org_id())` | `` |
| lead_inquiries | ✅ | Admin full access lead_inquiries | authenticated | ALL | `is_admin()` | `is_admin()` |
| lead_inquiries | ✅ | Anyone can submit lead inquiry | public | INSERT | `` | `true` |
| leistungspreise | ✅ | admin_leistungspreise | public | ALL | `is_admin()` | `is_admin()` |
| leistungspreise | ✅ | leistungspreise_org_fence | public | ALL | `(organization_id = current_org_id())` | `(organization_id = current_org_id())` |
| login_rate_limits | ✅ | service_role only | service_role | ALL | `true` | `true` |
| medikament_eingaben | ✅ | admin_med_eingaben_all | public | ALL | `is_admin()` | `` |
| medikament_eingaben | ✅ | engel_med_eingaben_insert | public | INSERT | `` | `((gegeben_von = auth.uid()) AND (client_id IN ( SELECT a.client_id    FROM assignments a   WHERE ((a.caregiver_id IN ( SELECT eigene_caregiver_ids() AS eigene_caregiver_ids)) AND (a.status = ANY (ARRA` |
| medikament_eingaben | ✅ | engel_med_eingaben_select | public | SELECT | `(client_id IN ( SELECT a.client_id    FROM assignments a   WHERE ((a.caregiver_id IN ( SELECT eigene_caregiver_ids() AS eigene_caregiver_ids)) AND (a.status = ANY (ARRAY['active'::text, 'GEPLANT'::tex` | `` |
| medikament_eingaben | ✅ | org_fence_medikament_eingaben | public | ALL | `(organization_id = current_org_id())` | `` |
| medikamente | ✅ | admin_medikamente_all | public | ALL | `is_admin()` | `` |
| medikamente | ✅ | engel_medikamente_select | public | SELECT | `(client_id IN ( SELECT a.client_id    FROM assignments a   WHERE ((a.caregiver_id IN ( SELECT eigene_caregiver_ids() AS eigene_caregiver_ids)) AND (a.status = ANY (ARRAY['active'::text, 'GEPLANT'::tex` | `` |
| medikamente | ✅ | org_fence_medikamente | public | ALL | `(organization_id = current_org_id())` | `` |
| medikamentenplan | ✅ | Admins can view all medikamentenplan | public | SELECT | `is_admin()` | `` |
| medikamentenplan | ✅ | Users can delete own medikamentenplan | public | DELETE | `(auth.uid() = user_id)` | `` |
| medikamentenplan | ✅ | Users can insert own medikamentenplan | public | INSERT | `` | `(auth.uid() = user_id)` |
| medikamentenplan | ✅ | Users can update own medikamentenplan | public | UPDATE | `(auth.uid() = user_id)` | `` |
| medikamentenplan | ✅ | Users can view own medikamentenplan | public | SELECT | `(auth.uid() = user_id)` | `` |
| medikamentenplan | ✅ | medikamentenplan_org_fence | public | ALL | `(organization_id = current_org_id())` | `(organization_id = current_org_id())` |
| messages | ✅ | messages_admin_all | authenticated | ALL | `is_admin()` | `` |
| messages | ✅ | messages_insert_booking_participant | authenticated | INSERT | `` | `((sender_id = auth.uid()) AND (EXISTS ( SELECT 1    FROM bookings b   WHERE ((b.id = messages.booking_id) AND (((b.customer_id = auth.uid()) AND (b.angel_id = messages.receiver_id)) OR ((b.angel_id = ` |
| messages | ✅ | messages_select_sender_or_receiver | authenticated | SELECT | `(((auth.uid() = sender_id) OR (auth.uid() = receiver_id)) AND (NOT is_profile_soft_deleted(auth.uid())))` | `` |
| messages | ✅ | messages_update_receiver_read_only | authenticated | UPDATE | `(auth.uid() = receiver_id)` | `(auth.uid() = receiver_id)` |
| mis_ai_conversations | ✅ | mis_ai_conversations_admin_select | public | SELECT | `is_admin()` | `` |
| mis_ai_conversations | ✅ | mis_ai_conversations_org_fence | public | ALL | `(organization_id = current_org_id())` | `(organization_id = current_org_id())` |
| mis_ai_conversations | ✅ | mis_ai_conversations_user_delete | authenticated | DELETE | `(user_id = auth.uid())` | `` |
| mis_ai_conversations | ✅ | mis_ai_conversations_user_insert | authenticated | INSERT | `` | `(user_id = auth.uid())` |
| mis_ai_conversations | ✅ | mis_ai_conversations_user_select | authenticated | SELECT | `(user_id = auth.uid())` | `` |
| mis_ai_conversations | ✅ | mis_ai_conversations_user_update | authenticated | UPDATE | `(user_id = auth.uid())` | `(user_id = auth.uid())` |
| mis_applicants | ✅ | mis_applicants_org_fence | public | ALL | `(organization_id = current_org_id())` | `(organization_id = current_org_id())` |
| mis_applicants | ✅ | mis_applicants_service | service_role | ALL | `true` | `true` |
| mis_applicants | ✅ | mis_applicants_staff_delete | public | DELETE | `is_admin()` | `` |
| mis_applicants | ✅ | mis_applicants_staff_insert | public | INSERT | `` | `is_internal_staff()` |
| mis_applicants | ✅ | mis_applicants_staff_select | public | SELECT | `is_internal_staff()` | `` |
| mis_applicants | ✅ | mis_applicants_staff_update | public | UPDATE | `is_internal_staff()` | `` |
| mis_audit_log | ✅ | audit_select_admin | authenticated | SELECT | `is_admin()` | `` |
| mis_audit_log | ✅ | mis_audit_log_admin_all | authenticated | ALL | `is_admin()` | `` |
| mis_audit_log | ✅ | mis_audit_log_anon_deny | anon | ALL | `false` | `false` |
| mis_audit_log | ✅ | mis_audit_log_org_fence | authenticated | ALL | `(organization_id = current_org_id())` | `(organization_id = current_org_id())` |
| mis_auth_log | ✅ | Admin can read auth log | public | SELECT | `is_admin()` | `` |
| mis_auth_log | ✅ | Users can insert own auth_log | anon, authenticated | INSERT | `` | `((user_id IS NULL) OR (user_id = auth.uid()))` |
| mis_availability | ✅ | mis_availability_org_fence | public | ALL | `(organization_id = current_org_id())` | `(organization_id = current_org_id())` |
| mis_availability | ✅ | mis_availability_service | service_role | ALL | `true` | `true` |
| mis_availability | ✅ | mis_availability_staff_all | public | ALL | `is_internal_staff()` | `is_internal_staff()` |
| mis_budget_items | ✅ | mis_budget_items_admin_select | public | SELECT | `is_admin()` | `` |
| mis_budget_items | ✅ | mis_budget_items_org_fence | public | ALL | `(organization_id = current_org_id())` | `(organization_id = current_org_id())` |
| mis_capa | ✅ | Admin can delete mis_capa | public | DELETE | `is_admin()` | `` |
| mis_capa | ✅ | Admin can insert mis_capa | public | INSERT | `` | `is_admin()` |
| mis_capa | ✅ | Admin can update mis_capa | public | UPDATE | `is_admin()` | `` |
| mis_capa | ✅ | mis_capa_admin_select | public | SELECT | `is_admin()` | `` |
| mis_capa | ✅ | mis_capa_org_fence | public | ALL | `(organization_id = current_org_id())` | `(organization_id = current_org_id())` |
| mis_complaints | ✅ | mis_complaints_org_fence | public | ALL | `(organization_id = current_org_id())` | `(organization_id = current_org_id())` |
| mis_complaints | ✅ | mis_complaints_service | service_role | ALL | `true` | `true` |
| mis_complaints | ✅ | mis_complaints_staff_delete | public | DELETE | `is_admin()` | `` |
| mis_complaints | ✅ | mis_complaints_staff_insert | public | INSERT | `` | `is_internal_staff()` |
| mis_complaints | ✅ | mis_complaints_staff_select | public | SELECT | `is_internal_staff()` | `` |
| mis_complaints | ✅ | mis_complaints_staff_update | public | UPDATE | `is_internal_staff()` | `` |
| mis_contracts | ✅ | mis_contracts_org_fence | public | ALL | `(organization_id = current_org_id())` | `(organization_id = current_org_id())` |
| mis_contracts | ✅ | mis_contracts_service | service_role | ALL | `true` | `true` |
| mis_contracts | ✅ | mis_contracts_staff_delete | public | DELETE | `is_admin()` | `` |
| mis_contracts | ✅ | mis_contracts_staff_insert | public | INSERT | `` | `is_internal_staff()` |
| mis_contracts | ✅ | mis_contracts_staff_select | public | SELECT | `is_internal_staff()` | `` |
| mis_contracts | ✅ | mis_contracts_staff_update | public | UPDATE | `is_internal_staff()` | `` |
| mis_crm_activities | ✅ | mis_crm_activities_org_fence | public | ALL | `(organization_id = current_org_id())` | `(organization_id = current_org_id())` |
| mis_crm_activities | ✅ | mis_crm_admin_delete | public | DELETE | `is_admin()` | `` |
| mis_crm_activities | ✅ | mis_crm_own_select | public | SELECT | `(performed_by = (auth.uid())::text)` | `` |
| mis_crm_activities | ✅ | mis_crm_staff_insert | public | INSERT | `` | `is_internal_staff()` |
| mis_crm_activities | ✅ | mis_crm_staff_select | public | SELECT | `is_internal_staff()` | `` |
| mis_crm_activities | ✅ | mis_crm_staff_update | public | UPDATE | `is_internal_staff()` | `` |
| mis_dataroom_access | ✅ | mis_dataroom_access_admin_select | public | SELECT | `is_admin()` | `` |
| mis_dataroom_sections | ✅ | mis_dataroom_sections_admin_select | public | SELECT | `is_admin()` | `` |
| mis_document_categories | ✅ | mis_document_categories_admin_select | public | SELECT | `is_admin()` | `` |
| mis_document_versions | ✅ | mis_document_versions_admin_select | public | SELECT | `is_admin()` | `` |
| mis_document_versions | ✅ | mis_document_versions_org_fence | public | ALL | `(organization_id = current_org_id())` | `(organization_id = current_org_id())` |
| mis_documents | ✅ | Admin full access on mis_documents | public | ALL | `is_admin()` | `` |
| mis_documents | ✅ | mis_documents_org_fence | public | ALL | `(organization_id = current_org_id())` | `(organization_id = current_org_id())` |
| mis_financial_reports | ✅ | mis_financial_reports_admin_select | public | SELECT | `is_admin()` | `` |
| mis_financial_reports | ✅ | mis_financial_reports_org_fence | public | ALL | `(organization_id = current_org_id())` | `(organization_id = current_org_id())` |
| mis_job_postings | ✅ | mis_job_postings_org_fence | public | ALL | `(organization_id = current_org_id())` | `(organization_id = current_org_id())` |
| mis_job_postings | ✅ | mis_job_postings_read | public | SELECT | `(auth.uid() IS NOT NULL)` | `` |
| mis_job_postings | ✅ | mis_job_postings_service | service_role | ALL | `true` | `true` |
| mis_job_postings | ✅ | mis_job_postings_staff_all | public | ALL | `is_internal_staff()` | `is_internal_staff()` |
| mis_kpis | ✅ | Admin full access on mis_kpis | public | ALL | `is_admin()` | `` |
| mis_kpis | ✅ | mis_kpis_org_fence | public | ALL | `(organization_id = current_org_id())` | `(organization_id = current_org_id())` |
| mis_notifications | ✅ | Users see own notifications | public | SELECT | `(user_id = auth.uid())` | `` |
| mis_notifications | ✅ | mis_notifications_org_fence | public | ALL | `(organization_id = current_org_id())` | `(organization_id = current_org_id())` |
| mis_privacy_audit_log | ✅ | mis_privacy_audit_service_insert | service_role | INSERT | `` | `true` |
| mis_privacy_audit_log | ✅ | mis_privacy_audit_service_select | service_role | SELECT | `true` | `` |
| mis_privacy_audit_log | ✅ | mis_privacy_audit_staff_select | public | SELECT | `is_admin()` | `` |
| mis_privacy_consents | ✅ | mis_privacy_consents_admin_delete | public | DELETE | `is_admin()` | `` |
| mis_privacy_consents | ✅ | mis_privacy_consents_service | service_role | ALL | `true` | `true` |
| mis_privacy_consents | ✅ | mis_privacy_consents_staff_insert | public | INSERT | `` | `is_internal_staff()` |
| mis_privacy_consents | ✅ | mis_privacy_consents_staff_select | public | SELECT | `is_internal_staff()` | `` |
| mis_privacy_consents | ✅ | mis_privacy_consents_staff_update | public | UPDATE | `is_internal_staff()` | `` |
| mis_privacy_records | ✅ | mis_privacy_records_admin_delete | public | DELETE | `is_admin()` | `` |
| mis_privacy_records | ✅ | mis_privacy_records_admin_insert | public | INSERT | `` | `is_admin()` |
| mis_privacy_records | ✅ | mis_privacy_records_admin_select | public | SELECT | `is_admin()` | `` |
| mis_privacy_records | ✅ | mis_privacy_records_admin_update | public | UPDATE | `is_admin()` | `` |
| mis_privacy_records | ✅ | mis_privacy_records_service | service_role | ALL | `true` | `true` |
| mis_privacy_requests | ✅ | mis_privacy_requests_admin_delete | public | DELETE | `is_admin()` | `` |
| mis_privacy_requests | ✅ | mis_privacy_requests_service | service_role | ALL | `true` | `true` |
| mis_privacy_requests | ✅ | mis_privacy_requests_staff_insert | public | INSERT | `` | `is_internal_staff()` |
| mis_privacy_requests | ✅ | mis_privacy_requests_staff_select | public | SELECT | `is_internal_staff()` | `` |
| mis_privacy_requests | ✅ | mis_privacy_requests_staff_update | public | UPDATE | `is_internal_staff()` | `` |
| mis_purchase_orders | ✅ | mis_purchase_orders_admin_select | public | SELECT | `is_admin()` | `` |
| mis_purchase_orders | ✅ | mis_purchase_orders_org_fence | public | ALL | `(organization_id = current_org_id())` | `(organization_id = current_org_id())` |
| mis_quality_audits | ✅ | Admin can delete mis_quality_audits | public | DELETE | `is_admin()` | `` |
| mis_quality_audits | ✅ | Admin can insert mis_quality_audits | public | INSERT | `` | `is_admin()` |
| mis_quality_audits | ✅ | Admin can update mis_quality_audits | public | UPDATE | `is_admin()` | `` |
| mis_quality_audits | ✅ | mis_quality_audits_admin_select | public | SELECT | `is_admin()` | `` |
| mis_quality_audits | ✅ | mis_quality_audits_org_fence | public | ALL | `(organization_id = current_org_id())` | `(organization_id = current_org_id())` |
| mis_quality_processes | ✅ | mis_quality_processes_admin_select | public | SELECT | `is_admin()` | `` |
| mis_quality_processes | ✅ | mis_quality_processes_org_fence | public | ALL | `(organization_id = current_org_id())` | `(organization_id = current_org_id())` |
| mis_shifts | ✅ | mis_shifts_org_fence | public | ALL | `(organization_id = current_org_id())` | `(organization_id = current_org_id())` |
| mis_shifts | ✅ | mis_shifts_service | service_role | ALL | `true` | `true` |
| mis_shifts | ✅ | mis_shifts_staff_all | public | ALL | `is_internal_staff()` | `is_internal_staff()` |
| mis_signature_requests | ✅ | mis_signature_requests_admin_delete | public | DELETE | `is_admin()` | `` |
| mis_signature_requests | ✅ | mis_signature_requests_org_fence | public | ALL | `(organization_id = current_org_id())` | `(organization_id = current_org_id())` |
| mis_signature_requests | ✅ | mis_signature_requests_service | service_role | ALL | `true` | `true` |
| mis_signature_requests | ✅ | mis_signature_requests_staff_insert | public | INSERT | `` | `is_internal_staff()` |
| mis_signature_requests | ✅ | mis_signature_requests_staff_select | public | SELECT | `is_internal_staff()` | `` |
| mis_signature_requests | ✅ | mis_signature_requests_staff_update | public | UPDATE | `is_internal_staff()` | `` |
| mis_suppliers | ✅ | Admin can delete mis_suppliers | public | DELETE | `is_admin()` | `` |
| mis_suppliers | ✅ | Admin can insert mis_suppliers | public | INSERT | `` | `is_admin()` |
| mis_suppliers | ✅ | Admin can update mis_suppliers | public | UPDATE | `is_admin()` | `` |
| mis_suppliers | ✅ | mis_suppliers_admin_select | public | SELECT | `is_admin()` | `` |
| mis_suppliers | ✅ | mis_suppliers_org_fence | public | ALL | `(organization_id = current_org_id())` | `(organization_id = current_org_id())` |
| mis_tasks | ✅ | Admin full access on mis_tasks | public | ALL | `is_admin()` | `is_admin()` |
| mis_tasks | ✅ | mis_tasks_admin_select | public | SELECT | `is_admin()` | `` |
| mis_tasks | ✅ | mis_tasks_org_fence | public | ALL | `(organization_id = current_org_id())` | `(organization_id = current_org_id())` |
| mis_training_catalog | ✅ | mis_training_catalog_org_fence | public | ALL | `(organization_id = current_org_id())` | `(organization_id = current_org_id())` |
| mis_training_catalog | ✅ | mis_training_catalog_read | public | SELECT | `(auth.uid() IS NOT NULL)` | `` |
| mis_training_catalog | ✅ | mis_training_catalog_service | service_role | ALL | `true` | `true` |
| mis_training_catalog | ✅ | mis_training_catalog_staff_all | public | ALL | `is_internal_staff()` | `is_internal_staff()` |
| mis_training_records | ✅ | mis_training_records_admin_delete | public | DELETE | `is_admin()` | `` |
| mis_training_records | ✅ | mis_training_records_org_fence | public | ALL | `(organization_id = current_org_id())` | `(organization_id = current_org_id())` |
| mis_training_records | ✅ | mis_training_records_service | service_role | ALL | `true` | `true` |
| mis_training_records | ✅ | mis_training_records_staff_insert | public | INSERT | `` | `is_internal_staff()` |
| mis_training_records | ✅ | mis_training_records_staff_select | public | SELECT | `is_internal_staff()` | `` |
| mis_training_records | ✅ | mis_training_records_staff_update | public | UPDATE | `is_internal_staff()` | `` |
| mis_vehicles | ✅ | mis_vehicles_org_fence | public | ALL | `(organization_id = current_org_id())` | `(organization_id = current_org_id())` |
| mis_vehicles | ✅ | mis_vehicles_service | service_role | ALL | `true` | `true` |
| mis_vehicles | ✅ | mis_vehicles_staff_all | public | ALL | `is_internal_staff()` | `is_internal_staff()` |
| mitarbeitergespraeche | ✅ | admin_mitarbeitergespraeche | public | ALL | `is_admin()` | `` |
| mitarbeitergespraeche | ✅ | org_fence_mitarbeitergespraeche | public | ALL | `(organization_id = current_org_id())` | `` |
| monthly_closings | ✅ | monthly_closings_admin_all | public | ALL | `is_admin()` | `is_admin()` |
| monthly_closings | ✅ | monthly_closings_client_read | public | SELECT | `is_own_client(client_id)` | `` |
| monthly_closings | ✅ | monthly_closings_org_fence | public | ALL | `(organization_id = current_org_id())` | `(organization_id = current_org_id())` |
| monthly_closings | ✅ | monthly_closings_service_all | service_role | ALL | `true` | `true` |
| monthly_closings | ✅ | monthly_closings_staff_read | public | SELECT | `is_internal_staff()` | `` |
| newsletter_subscribers | ✅ | Admin full access newsletter | authenticated | ALL | `is_admin()` | `is_admin()` |
| notfall_access_attempts | ✅ | Admins can view notfall_access_attempts | public | SELECT | `is_admin()` | `` |
| notfall_info | ✅ | Admins can view all notfall_info | public | SELECT | `is_admin()` | `` |
| notfall_info | ✅ | Users can insert own notfall_info | public | INSERT | `` | `(auth.uid() = user_id)` |
| notfall_info | ✅ | Users can update own notfall_info | public | UPDATE | `(auth.uid() = user_id)` | `` |
| notfall_info | ✅ | Users can view own notfall_info | public | SELECT | `(auth.uid() = user_id)` | `` |
| notfall_info | ✅ | notfall_info_org_fence | public | ALL | `(organization_id = current_org_id())` | `(organization_id = current_org_id())` |
| notifications | ✅ | notifications_admin_all | authenticated | ALL | `is_admin()` | `` |
| notifications | ✅ | notifications_insert_blocked | authenticated | INSERT | `` | `false` |
| notifications | ✅ | notifications_select_own | authenticated | SELECT | `((auth.uid() = user_id) AND (NOT is_profile_soft_deleted(auth.uid())))` | `` |
| notifications | ✅ | notifications_update_own | authenticated | UPDATE | `(auth.uid() = user_id)` | `(auth.uid() = user_id)` |
| ocr_results | ✅ | ocr_results_admin_all | public | ALL | `is_admin()` | `is_admin()` |
| ocr_results | ✅ | ocr_results_org_fence | public | ALL | `(organization_id = current_org_id())` | `(organization_id = current_org_id())` |
| ocr_results | ✅ | ocr_results_service_all | service_role | ALL | `true` | `true` |
| ocr_results | ✅ | ocr_results_staff_read | public | SELECT | `is_internal_staff()` | `` |
| offline_queue | ✅ | offline_queue_admin_all | public | ALL | `is_admin()` | `is_admin()` |
| offline_queue | ✅ | offline_queue_own_read | public | SELECT | `(user_id = auth.uid())` | `` |
| offline_queue | ✅ | offline_queue_service_all | service_role | ALL | `true` | `true` |
| ops_aktivitaetslog | ✅ | ops_log_admin_all | authenticated | ALL | `is_admin()` | `` |
| ops_aktivitaetslog | ✅ | ops_log_org_fence | public | ALL | `(organization_id = current_org_id())` | `` |
| ops_aufgaben | ✅ | ops_aufgaben_admin_all | authenticated | ALL | `is_admin()` | `` |
| ops_aufgaben | ✅ | ops_aufgaben_engel_select | public | SELECT | `((verantwortlich_id = auth.uid()) OR (stellvertreter_id = auth.uid()) OR (erstellt_von = auth.uid()) OR (caregiver_id IN ( SELECT eigene_caregiver_ids() AS eigene_caregiver_ids)))` | `` |
| ops_aufgaben | ✅ | ops_aufgaben_engel_update | public | UPDATE | `((verantwortlich_id = auth.uid()) OR (stellvertreter_id = auth.uid()))` | `` |
| ops_aufgaben | ✅ | ops_aufgaben_org_fence | public | ALL | `(organization_id = current_org_id())` | `` |
| ops_aufgaben_anhaenge | ✅ | ops_anhaenge_admin_all | authenticated | ALL | `is_admin()` | `` |
| ops_aufgaben_anhaenge | ✅ | ops_anhaenge_engel_select | public | SELECT | `(aufgabe_id IN ( SELECT a.id    FROM ops_aufgaben a   WHERE ((a.verantwortlich_id = auth.uid()) OR (a.stellvertreter_id = auth.uid()))))` | `` |
| ops_aufgaben_anhaenge | ✅ | ops_anhaenge_org_fence | public | ALL | `(organization_id = current_org_id())` | `` |
| ops_aufgaben_checklisten | ✅ | ops_checklisten_admin_all | authenticated | ALL | `is_admin()` | `` |
| ops_aufgaben_checklisten | ✅ | ops_checklisten_engel_select | public | SELECT | `(aufgabe_id IN ( SELECT a.id    FROM ops_aufgaben a   WHERE ((a.verantwortlich_id = auth.uid()) OR (a.stellvertreter_id = auth.uid()) OR (a.erstellt_von = auth.uid()))))` | `` |
| ops_aufgaben_checklisten | ✅ | ops_checklisten_engel_update | public | UPDATE | `(aufgabe_id IN ( SELECT a.id    FROM ops_aufgaben a   WHERE ((a.verantwortlich_id = auth.uid()) OR (a.stellvertreter_id = auth.uid()))))` | `` |
| ops_aufgaben_checklisten | ✅ | ops_checklisten_org_fence | public | ALL | `(organization_id = current_org_id())` | `` |
| ops_aufgaben_kommentare | ✅ | ops_kommentare_admin_all | authenticated | ALL | `is_admin()` | `` |
| ops_aufgaben_kommentare | ✅ | ops_kommentare_engel_insert | public | INSERT | `` | `((autor_id = auth.uid()) AND (ist_intern = false) AND (aufgabe_id IN ( SELECT a.id    FROM ops_aufgaben a   WHERE ((a.verantwortlich_id = auth.uid()) OR (a.stellvertreter_id = auth.uid())))))` |
| ops_aufgaben_kommentare | ✅ | ops_kommentare_engel_select | public | SELECT | `((ist_intern = false) AND (aufgabe_id IN ( SELECT a.id    FROM ops_aufgaben a   WHERE ((a.verantwortlich_id = auth.uid()) OR (a.stellvertreter_id = auth.uid()) OR (a.erstellt_von = auth.uid())))))` | `` |
| ops_aufgaben_kommentare | ✅ | ops_kommentare_org_fence | public | ALL | `(organization_id = current_org_id())` | `` |
| ops_benachrichtigungen | ✅ | ops_benach_admin_all | authenticated | ALL | `is_admin()` | `` |
| ops_benachrichtigungen | ✅ | ops_benach_org_fence | public | ALL | `(organization_id = current_org_id())` | `` |
| ops_benachrichtigungen | ✅ | ops_benach_own_select | public | SELECT | `(empfaenger_id = auth.uid())` | `` |
| ops_benachrichtigungen | ✅ | ops_benach_own_update | public | UPDATE | `(empfaenger_id = auth.uid())` | `` |
| ops_benachrichtigungs_praeferenzen | ✅ | ops_praef_admin_all | authenticated | ALL | `is_admin()` | `` |
| ops_benachrichtigungs_praeferenzen | ✅ | ops_praef_org_fence | public | ALL | `(organization_id = current_org_id())` | `` |
| ops_benachrichtigungs_praeferenzen | ✅ | ops_praef_own_insert | public | INSERT | `` | `(benutzer_id = auth.uid())` |
| ops_benachrichtigungs_praeferenzen | ✅ | ops_praef_own_select | public | SELECT | `(benutzer_id = auth.uid())` | `` |
| ops_benachrichtigungs_praeferenzen | ✅ | ops_praef_own_update | public | UPDATE | `(benutzer_id = auth.uid())` | `` |
| ops_ereignis_regeln | ✅ | ops_ereignis_admin_all | authenticated | ALL | `is_admin()` | `` |
| ops_ereignis_regeln | ✅ | ops_ereignis_org_fence | public | ALL | `(organization_id = current_org_id())` | `` |
| ops_eskalationshistorie | ✅ | ops_eskalation_admin_all | authenticated | ALL | `is_admin()` | `` |
| ops_eskalationshistorie | ✅ | ops_eskalation_org_fence | public | ALL | `(organization_id = current_org_id())` | `` |
| ops_eskalationsregeln | ✅ | ops_eskalationsregeln_admin_all | authenticated | ALL | `is_admin()` | `` |
| ops_eskalationsregeln | ✅ | ops_eskalationsregeln_org_fence | public | ALL | `(organization_id = current_org_id())` | `` |
| ops_nachrichten | ✅ | ops_nachrichten_absender_select | public | SELECT | `(absender_id = auth.uid())` | `` |
| ops_nachrichten | ✅ | ops_nachrichten_admin_all | authenticated | ALL | `is_admin()` | `` |
| ops_nachrichten | ✅ | ops_nachrichten_empfaenger_select | public | SELECT | `(id IN ( SELECT e.nachricht_id    FROM ops_nachrichten_empfaenger e   WHERE (e.empfaenger_id = auth.uid())))` | `` |
| ops_nachrichten | ✅ | ops_nachrichten_insert_own | public | INSERT | `` | `(absender_id = auth.uid())` |
| ops_nachrichten | ✅ | ops_nachrichten_org_fence | public | ALL | `(organization_id = current_org_id())` | `` |
| ops_nachrichten_empfaenger | ✅ | ops_empfaenger_admin_all | authenticated | ALL | `is_admin()` | `` |
| ops_nachrichten_empfaenger | ✅ | ops_empfaenger_org_fence | public | ALL | `(organization_id = current_org_id())` | `` |
| ops_nachrichten_empfaenger | ✅ | ops_empfaenger_own_select | public | SELECT | `(empfaenger_id = auth.uid())` | `` |
| ops_nachrichten_empfaenger | ✅ | ops_empfaenger_own_update | public | UPDATE | `(empfaenger_id = auth.uid())` | `` |
| ops_wiedervorlagen | ✅ | ops_wiedervorlagen_admin_all | authenticated | ALL | `is_admin()` | `` |
| ops_wiedervorlagen | ✅ | ops_wiedervorlagen_engel_select | public | SELECT | `((empfaenger_id = auth.uid()) OR (erstellt_von = auth.uid()))` | `` |
| ops_wiedervorlagen | ✅ | ops_wiedervorlagen_engel_update | public | UPDATE | `(empfaenger_id = auth.uid())` | `` |
| ops_wiedervorlagen | ✅ | ops_wiedervorlagen_org_fence | public | ALL | `(organization_id = current_org_id())` | `` |
| organization_members | ✅ | org_members_manage | public | ALL | `has_org_role(organization_id, ARRAY['owner'::text, 'admin'::text])` | `has_org_role(organization_id, ARRAY['owner'::text, 'admin'::text])` |
| organization_members | ✅ | org_members_select | public | SELECT | `((user_id = auth.uid()) OR is_org_member(organization_id))` | `` |
| organization_subscriptions | ✅ | org_subs_member_select | public | SELECT | `is_org_member(organization_id)` | `` |
| organizations | ✅ | orgs_member_select | public | SELECT | `is_org_member(id)` | `` |
| organizations | ✅ | orgs_owner_update | public | UPDATE | `has_org_role(id, ARRAY['owner'::text, 'admin'::text])` | `has_org_role(id, ARRAY['owner'::text, 'admin'::text])` |
| page_views | ✅ | Admins can read page_views | authenticated | SELECT | `is_admin()` | `` |
| page_views | ✅ | Anyone can insert page_views | public | INSERT | `` | `true` |
| page_views | ✅ | page_views_admin_select | authenticated | SELECT | `is_admin()` | `` |
| partner_visits | ✅ | partner_visits_admin_all | public | ALL | `is_admin()` | `is_admin()` |
| partner_visits | ✅ | partner_visits_service_all | service_role | ALL | `true` | `true` |
| payment_allocations | ✅ | alloc_admin_all | authenticated | ALL | `is_admin()` | `` |
| payment_allocations | ✅ | org_fence_payment_allocations | public | ALL | `(organization_id = current_org_id())` | `` |
| payment_differences | ✅ | diff_admin_all | authenticated | ALL | `is_admin()` | `` |
| payment_differences | ✅ | org_fence_payment_differences | public | ALL | `(organization_id = current_org_id())` | `` |
| payment_status | ✅ | payment_status_admin_all | public | ALL | `is_admin()` | `is_admin()` |
| payment_status | ✅ | payment_status_org_fence | public | ALL | `(organization_id = current_org_id())` | `(organization_id = current_org_id())` |
| payment_status | ✅ | payment_status_service_all | service_role | ALL | `true` | `true` |
| payment_status | ✅ | payment_status_staff_read | public | SELECT | `is_internal_staff()` | `` |
| payments | ✅ | org_fence_payments | public | ALL | `(organization_id = current_org_id())` | `` |
| payments | ✅ | payments_admin_all | authenticated | ALL | `is_admin()` | `` |
| personal_arbeitszeiten | ✅ | admin_personal_arbeitszeiten | authenticated | ALL | `is_admin()` | `` |
| personal_arbeitszeiten | ✅ | engel_personal_arbeitszeiten_insert | authenticated | INSERT | `` | `(caregiver_id IN ( SELECT eigene_caregiver_ids() AS eigene_caregiver_ids))` |
| personal_arbeitszeiten | ✅ | engel_personal_arbeitszeiten_select | authenticated | SELECT | `(caregiver_id IN ( SELECT eigene_caregiver_ids() AS eigene_caregiver_ids))` | `` |
| personal_arbeitszeiten | ✅ | org_fence_personal_arbeitszeiten | authenticated | ALL | `(organization_id = current_org_id())` | `(organization_id = current_org_id())` |
| personal_audit_log | ✅ | admin_personal_audit_log | authenticated | ALL | `is_admin()` | `` |
| personal_audit_log | ✅ | org_fence_personal_audit_log | authenticated | ALL | `(organization_id = current_org_id())` | `(organization_id = current_org_id())` |
| personal_schulungen | ✅ | admin_personal_schulungen | authenticated | ALL | `is_admin()` | `` |
| personal_schulungen | ✅ | engel_personal_schulungen_select | authenticated | SELECT | `(caregiver_id IN ( SELECT eigene_caregiver_ids() AS eigene_caregiver_ids))` | `` |
| personal_schulungen | ✅ | org_fence_personal_schulungen | authenticated | ALL | `(organization_id = current_org_id())` | `(organization_id = current_org_id())` |
| personal_urlaubskonto | ✅ | admin_personal_urlaubskonto | authenticated | ALL | `is_admin()` | `` |
| personal_urlaubskonto | ✅ | engel_personal_urlaubskonto_select | authenticated | SELECT | `(caregiver_id IN ( SELECT eigene_caregiver_ids() AS eigene_caregiver_ids))` | `` |
| personal_urlaubskonto | ✅ | org_fence_personal_urlaubskonto | authenticated | ALL | `(organization_id = current_org_id())` | `(organization_id = current_org_id())` |
| personal_zeitkorrekturen | ✅ | admin_personal_zeitkorrekturen | authenticated | ALL | `is_admin()` | `` |
| personal_zeitkorrekturen | ✅ | engel_personal_zeitkorrekturen_select | authenticated | SELECT | `(caregiver_id IN ( SELECT eigene_caregiver_ids() AS eigene_caregiver_ids))` | `` |
| personal_zeitkorrekturen | ✅ | org_fence_personal_zeitkorrekturen | authenticated | ALL | `(organization_id = current_org_id())` | `(organization_id = current_org_id())` |
| pflege_anamnesen | ✅ | admin_pflege_anamnesen | authenticated | ALL | `is_admin()` | `` |
| pflege_anamnesen | ✅ | engel_pflege_anamnesen_insert | authenticated | INSERT | `` | `(client_id IN ( SELECT a.client_id    FROM (assignments a      JOIN caregivers cg ON ((cg.id = a.caregiver_id)))   WHERE ((cg.user_id = auth.uid()) AND (a.status = ANY (ARRAY['active'::text, 'GEPLANT'` |
| pflege_anamnesen | ✅ | engel_pflege_anamnesen_select | authenticated | SELECT | `((client_id IS NOT NULL) AND engel_hat_aktiven_klienten(client_id))` | `` |
| pflege_anamnesen | ✅ | org_fence_pflege_anamnesen | public | ALL | `(organization_id = current_org_id())` | `` |
| pflege_audit_log | ✅ | pflege_audit_log_admin_select | public | SELECT | `is_admin()` | `` |
| pflege_audit_log | ✅ | pflege_audit_log_insert | public | INSERT | `` | `(organization_id = current_org_id())` |
| pflege_audit_log | ✅ | pflege_audit_log_org_fence | public | ALL | `(organization_id = current_org_id())` | `` |
| pflege_aufnahmen | ✅ | admin_pflege_aufnahmen | authenticated | ALL | `is_admin()` | `` |
| pflege_aufnahmen | ✅ | engel_pflege_aufnahmen_select | authenticated | SELECT | `((client_id IS NOT NULL) AND engel_hat_aktiven_klienten(client_id))` | `` |
| pflege_aufnahmen | ✅ | org_fence_pflege_aufnahmen | public | ALL | `(organization_id = current_org_id())` | `` |
| pflege_diagnosen | ✅ | admin_pflege_diagnosen | authenticated | ALL | `is_admin()` | `` |
| pflege_diagnosen | ✅ | engel_pflege_diagnosen_select | authenticated | SELECT | `((betreuungsrelevant = true) AND (aktiv = true) AND (client_id IS NOT NULL) AND engel_hat_aktiven_klienten(client_id))` | `` |
| pflege_diagnosen | ✅ | org_fence_pflege_diagnosen | public | ALL | `(organization_id = current_org_id())` | `` |
| pflege_doku_perioden | ✅ | admin_pflege_doku_perioden | authenticated | ALL | `is_admin()` | `` |
| pflege_doku_perioden | ✅ | org_fence_pflege_doku_perioden | public | ALL | `(organization_id = current_org_id())` | `` |
| pflege_massnahmen | ✅ | admin_pflege_massnahmen | authenticated | ALL | `is_admin()` | `` |
| pflege_massnahmen | ✅ | engel_pflege_massnahmen_select | public | SELECT | `(plan_id IN ( SELECT mp.id    FROM (pflege_massnahmenplaene mp      JOIN assignments a ON ((a.client_id = mp.client_id)))   WHERE ((a.caregiver_id IN ( SELECT eigene_caregiver_ids() AS eigene_caregive` | `` |
| pflege_massnahmen | ✅ | org_fence_pflege_massnahmen | public | ALL | `(organization_id = current_org_id())` | `` |
| pflege_massnahmenplaene | ✅ | admin_pflege_massnahmenplaene | authenticated | ALL | `is_admin()` | `` |
| pflege_massnahmenplaene | ✅ | engel_pflege_massnahmenplaene_select | authenticated | SELECT | `((status = ANY (ARRAY['aktiv'::text, 'abgelaufen'::text])) AND (client_id IS NOT NULL) AND engel_hat_aktiven_klienten(client_id))` | `` |
| pflege_massnahmenplaene | ✅ | kunde_pflege_massnahmenplaene_select | public | SELECT | `((status = 'aktiv'::text) AND (client_id IN ( SELECT c.id    FROM clients c   WHERE (c.user_id = auth.uid()))))` | `` |
| pflege_massnahmenplaene | ✅ | org_fence_pflege_massnahmenplaene | public | ALL | `(organization_id = current_org_id())` | `` |
| pflege_risiken | ✅ | admin_pflege_risiken | authenticated | ALL | `is_admin()` | `` |
| pflege_risiken | ✅ | engel_pflege_risiken_select | authenticated | SELECT | `((aktiv = true) AND (client_id IS NOT NULL) AND engel_hat_aktiven_klienten(client_id))` | `` |
| pflege_risiken | ✅ | org_fence_pflege_risiken | public | ALL | `(organization_id = current_org_id())` | `` |
| pflege_verlauf | ✅ | admin_pflege_verlauf | authenticated | ALL | `is_admin()` | `` |
| pflege_verlauf | ✅ | engel_pflege_verlauf_insert | authenticated | INSERT | `` | `(client_id IN ( SELECT a.client_id    FROM (assignments a      JOIN caregivers cg ON ((cg.id = a.caregiver_id)))   WHERE ((cg.user_id = auth.uid()) AND (a.status = ANY (ARRAY['active'::text, 'GEPLANT'` |
| pflege_verlauf | ✅ | engel_pflege_verlauf_select | authenticated | SELECT | `((sichtbarkeit = ANY (ARRAY['engel'::text, 'alle'::text])) AND (client_id IS NOT NULL) AND engel_hat_aktiven_klienten(client_id))` | `` |
| pflege_verlauf | ✅ | kunde_pflege_verlauf_select | public | SELECT | `((sichtbarkeit = ANY (ARRAY['kunde'::text, 'alle'::text])) AND (gesperrt = false) AND (client_id IN ( SELECT c.id    FROM clients c   WHERE (c.user_id = auth.uid()))))` | `` |
| pflege_verlauf | ✅ | org_fence_pflege_verlauf | public | ALL | `(organization_id = current_org_id())` | `` |
| pflegeueberleitungen | ✅ | admin_pflegeueberleitungen | public | ALL | `is_admin()` | `` |
| pflegeueberleitungen | ✅ | engel_pflegeueberleitungen_select | public | SELECT | `engel_hat_aktiven_klienten(client_id)` | `` |
| pflegeueberleitungen | ✅ | org_fence_pflegeueberleitungen | public | ALL | `(organization_id = current_org_id())` | `` |
| plz_bundesland_regeln | ✅ | plz_regeln_read | anon, authenticated | SELECT | `true` | `` |
| profiles | ✅ | Admin can delete profiles | public | DELETE | `is_admin()` | `` |
| profiles | ✅ | Admin can update all profiles | public | UPDATE | `((auth.uid() = id) OR is_admin())` | `` |
| profiles | ✅ | Admins can manage all profiles | public | ALL | `is_admin()` | `` |
| profiles | ✅ | Kullanıcı kendi profilini güncelleyebilir | public | UPDATE | `(auth.uid() = id)` | `` |
| profiles | ✅ | Kullanıcı kendi profilini oluşturabilir | public | INSERT | `` | `(auth.uid() = id)` |
| profiles | ✅ | Users can update own profile | public | UPDATE | `(auth.uid() = id)` | `` |
| profiles | ✅ | profiles_insert | public | INSERT | `` | `(auth.uid() = id)` |
| profiles | ✅ | profiles_select_admin | public | SELECT | `is_admin()` | `` |
| profiles | ✅ | profiles_select_booking_partner | public | SELECT | `((auth.role() = 'authenticated'::text) AND (deleted_at IS NULL) AND ((EXISTS ( SELECT 1    FROM bookings b   WHERE (((b.customer_id = profiles.id) AND (b.angel_id = auth.uid())) OR ((b.angel_id = prof` | `` |
| profiles | ✅ | profiles_select_own | public | SELECT | `(auth.uid() = id)` | `` |
| profiles | ✅ | profiles_update | public | UPDATE | `(auth.uid() = id)` | `` |
| push_subscriptions | ✅ | Service role full access | public | ALL | `(auth.role() = 'service_role'::text)` | `` |
| push_subscriptions | ✅ | Users can manage own subscriptions | public | ALL | `(auth.uid() = user_id)` | `` |
| qes_hooks | ✅ | admin_qes_hooks_all | public | ALL | `is_admin()` | `` |
| qes_hooks | ✅ | org_fence_qes_hooks | public | ALL | `(organization_id = current_org_id())` | `` |
| referrals | ✅ | Admins sehen alle Referrals | authenticated | SELECT | `is_admin()` | `` |
| referrals | ✅ | System kann Referrals erstellen | public | INSERT | `` | `(auth.uid() = referred_id)` |
| referrals | ✅ | Users sehen eigene Referrals | public | SELECT | `((auth.uid() = referrer_id) OR (auth.uid() = referred_id))` | `` |
| review_errors | ✅ | review_errors_admin_all | public | ALL | `is_admin()` | `is_admin()` |
| review_errors | ✅ | review_errors_org_fence | public | ALL | `(organization_id = current_org_id())` | `(organization_id = current_org_id())` |
| review_errors | ✅ | review_errors_service_all | service_role | ALL | `true` | `true` |
| review_errors | ✅ | review_errors_staff_read | public | SELECT | `is_internal_staff()` | `` |
| reviews | ✅ | reviews_delete_eigene | authenticated | DELETE | `((reviewer_id = auth.uid()) OR (is_admin() AND buchung_in_aktiver_org(booking_id)))` | `` |
| reviews | ✅ | reviews_insert_eigene | authenticated | INSERT | `` | `(reviewer_id = auth.uid())` |
| reviews | ✅ | reviews_select_beteiligte | authenticated | SELECT | `((reviewer_id = auth.uid()) OR (angel_id = auth.uid()) OR (is_admin() AND buchung_in_aktiver_org(booking_id)))` | `` |
| reviews | ✅ | reviews_update_eigene | authenticated | UPDATE | `(reviewer_id = auth.uid())` | `(reviewer_id = auth.uid())` |
| satisfaction_calls | ✅ | satisfaction_calls_admin_all | public | ALL | `is_admin()` | `is_admin()` |
| satisfaction_calls | ✅ | satisfaction_calls_org_fence | public | ALL | `(organization_id = current_org_id())` | `(organization_id = current_org_id())` |
| satisfaction_calls | ✅ | satisfaction_calls_service_all | service_role | ALL | `true` | `true` |
| sepa_batch_items | ✅ | admin_crud_sepa_batch_items | authenticated | ALL | `is_admin()` | `` |
| sepa_batch_items | ✅ | org_fence_sepa_batch_items | public | ALL | `(organization_id = current_org_id())` | `(organization_id = current_org_id())` |
| sepa_batches | ✅ | admin_crud_sepa_batches | authenticated | ALL | `is_admin()` | `` |
| sepa_batches | ✅ | org_fence_sepa_batches | public | ALL | `(organization_id = current_org_id())` | `(organization_id = current_org_id())` |
| sepa_mandates | ✅ | admin_crud_sepa_mandates | authenticated | ALL | `is_admin()` | `` |
| sepa_mandates | ✅ | org_fence_sepa_mandates | public | ALL | `(organization_id = current_org_id())` | `(organization_id = current_org_id())` |
| service_pricing | ✅ | service_pricing_admin_all | public | ALL | `is_admin()` | `is_admin()` |
| service_pricing | ✅ | service_pricing_auth_read | authenticated | SELECT | `(is_active = true)` | `` |
| service_pricing | ✅ | service_pricing_org_fence | public | ALL | `(organization_id = current_org_id())` | `(organization_id = current_org_id())` |
| service_pricing | ✅ | service_pricing_service_all | service_role | ALL | `true` | `true` |
| service_pricing | ✅ | service_pricing_staff_read | public | SELECT | `is_internal_staff()` | `` |
| service_record_audit_log | ✅ | service_record_audit_log_org_fence | public | ALL | `(organization_id = current_org_id())` | `(organization_id = current_org_id())` |
| service_record_audit_log | ✅ | sr_audit_admin_read | authenticated | SELECT | `is_admin()` | `` |
| service_record_audit_log | ✅ | sr_audit_insert | authenticated | INSERT | `` | `is_admin()` |
| service_record_items | ✅ | service_record_items_admin_all | public | ALL | `is_admin()` | `is_admin()` |
| service_record_items | ✅ | service_record_items_org_fence | public | ALL | `(organization_id = current_org_id())` | `(organization_id = current_org_id())` |
| service_record_items | ✅ | service_record_items_service_all | service_role | ALL | `true` | `true` |
| service_record_items | ✅ | service_record_items_staff_read | public | SELECT | `is_internal_staff()` | `` |
| service_records | ✅ | service_records_admin_all | public | ALL | `is_admin()` | `is_admin()` |
| service_records | ✅ | service_records_caregiver_insert | public | INSERT | `` | `((EXISTS ( SELECT 1    FROM caregivers c   WHERE ((c.user_id = auth.uid()) AND (c.id = service_records.caregiver_id)))) AND (status = 'draft'::text))` |
| service_records | ✅ | service_records_caregiver_read | public | SELECT | `(caregiver_id IN ( SELECT eigene_caregiver_ids() AS eigene_caregiver_ids))` | `` |
| service_records | ✅ | service_records_caregiver_update | public | UPDATE | `((caregiver_id IN ( SELECT eigene_caregiver_ids() AS eigene_caregiver_ids)) AND (status = ANY (ARRAY['draft'::text, 'incomplete'::text])))` | `` |
| service_records | ✅ | service_records_client_read | public | SELECT | `(EXISTS ( SELECT 1    FROM clients cl   WHERE ((cl.user_id = auth.uid()) AND (cl.id = service_records.client_id))))` | `` |
| service_records | ✅ | service_records_org_fence | public | ALL | `(organization_id = current_org_id())` | `(organization_id = current_org_id())` |
| service_records | ✅ | service_records_service_all | service_role | ALL | `true` | `true` |
| service_records | ✅ | sr_client_read | authenticated | SELECT | `(client_id IN ( SELECT clients.id    FROM clients   WHERE (clients.user_id = auth.uid())))` | `` |
| service_records | ✅ | sr_engel_own | authenticated | ALL | `((caregiver_id IN ( SELECT eigene_caregiver_ids() AS eigene_caregiver_ids)) OR is_admin())` | `((caregiver_id IN ( SELECT eigene_caregiver_ids() AS eigene_caregiver_ids)) OR is_admin())` |
| service_signatures | ✅ | service_signatures_admin_all | public | ALL | `is_admin()` | `is_admin()` |
| service_signatures | ✅ | service_signatures_caregiver_read | public | SELECT | `(EXISTS ( SELECT 1    FROM service_records sr   WHERE ((sr.id = service_signatures.service_record_id) AND is_own_caregiver(sr.caregiver_id))))` | `` |
| service_signatures | ✅ | service_signatures_org_fence | public | ALL | `(organization_id = current_org_id())` | `(organization_id = current_org_id())` |
| service_signatures | ✅ | service_signatures_service_all | service_role | ALL | `true` | `true` |
| service_signatures | ✅ | service_signatures_staff_read | public | SELECT | `is_internal_staff()` | `` |
| sgb_v_formatversionen | ✅ | admin_sgb_v_formatversionen_all | public | ALL | `is_admin()` | `` |
| sgb_v_formatversionen | ✅ | org_fence_sgb_v_formatversionen | public | ALL | `(organization_id = current_org_id())` | `` |
| sgb_v_korrekturlaeufe | ✅ | admin_sgb_v_korrekturlaeufe_all | public | ALL | `is_admin()` | `` |
| sgb_v_korrekturlaeufe | ✅ | org_fence_sgb_v_korrekturlaeufe | public | ALL | `(organization_id = current_org_id())` | `` |
| sgb_v_laeufe | ✅ | admin_sgb_v_laeufe_all | public | ALL | `is_admin()` | `` |
| sgb_v_laeufe | ✅ | org_fence_sgb_v_laeufe | public | ALL | `(organization_id = current_org_id())` | `` |
| sgb_v_routing | ✅ | admin_sgb_v_routing_all | public | ALL | `is_admin()` | `` |
| sgb_v_routing | ✅ | org_fence_sgb_v_routing | public | ALL | `(organization_id = current_org_id())` | `` |
| sgb_v_uebertragungsqueue | ✅ | admin_sgb_v_uebertragungsqueue_all | public | ALL | `is_admin()` | `` |
| sgb_v_uebertragungsqueue | ✅ | org_fence_sgb_v_uebertragungsqueue | public | ALL | `(organization_id = current_org_id())` | `` |
| signatur_audit_log | ✅ | admin_sig_audit_all | public | ALL | `is_admin()` | `` |
| signatur_audit_log | ✅ | org_fence_sig_audit | public | ALL | `(organization_id = current_org_id())` | `` |
| signatur_dokumente | ✅ | admin_sig_dok_all | public | ALL | `is_admin()` | `` |
| signatur_dokumente | ✅ | org_fence_sig_dokumente | public | ALL | `(organization_id = current_org_id())` | `` |
| signatur_dokumente | ✅ | signatar_dok_select | public | SELECT | `(id IN ( SELECT signaturen.dokument_id    FROM signaturen   WHERE (signaturen.signatar_id = auth.uid())))` | `` |
| signaturen | ✅ | admin_signaturen_all | public | ALL | `is_admin()` | `` |
| signaturen | ✅ | org_fence_signaturen | public | ALL | `(organization_id = current_org_id())` | `` |
| signaturen | ✅ | signatar_eigene_select | public | SELECT | `(signatar_id = auth.uid())` | `` |
| signaturen | ✅ | signatar_eigene_update | public | UPDATE | `((signatar_id = auth.uid()) AND (status = 'offen'::text))` | `(signatar_id = auth.uid())` |
| sis_assessments | ✅ | admin_sis_assessments | public | ALL | `is_admin()` | `is_admin()` |
| sis_assessments | ✅ | engel_sis_assessments_select | public | SELECT | `engel_hat_aktiven_klienten(client_id)` | `` |
| sis_assessments | ✅ | org_fence_sis_assessments | public | ALL | `(organization_id = current_org_id())` | `` |
| sis_risikomatrix | ✅ | admin_sis_risikomatrix | public | ALL | `is_admin()` | `is_admin()` |
| sis_risikomatrix | ✅ | engel_sis_risikomatrix_select | public | SELECT | `(EXISTS ( SELECT 1    FROM sis_assessments s   WHERE ((s.id = sis_risikomatrix.assessment_id) AND engel_hat_aktiven_klienten(s.client_id))))` | `` |
| sis_risikomatrix | ✅ | org_fence_sis_risikomatrix | public | ALL | `(organization_id = current_org_id())` | `` |
| sis_themenfelder | ✅ | admin_sis_themenfelder | public | ALL | `is_admin()` | `is_admin()` |
| sis_themenfelder | ✅ | engel_sis_themenfelder_select | public | SELECT | `(EXISTS ( SELECT 1    FROM sis_assessments s   WHERE ((s.id = sis_themenfelder.assessment_id) AND engel_hat_aktiven_klienten(s.client_id))))` | `` |
| sis_themenfelder | ✅ | org_fence_sis_themenfelder | public | ALL | `(organization_id = current_org_id())` | `` |
| state_settings | ✅ | state_settings_admin_all | authenticated | ALL | `(is_admin() AND (organization_id = current_org_id()))` | `(is_admin() AND (organization_id = current_org_id()))` |
| state_settings_audit | ✅ | state_audit_admin_read | authenticated | SELECT | `(is_admin() AND (organization_id = current_org_id()))` | `` |
| state_waitlist | ✅ | state_waitlist_admin_delete | authenticated | DELETE | `(is_admin() AND (organization_id = current_org_id()))` | `` |
| state_waitlist | ✅ | state_waitlist_admin_read | authenticated | SELECT | `((is_admin() AND (organization_id = current_org_id())) OR (user_id = auth.uid()))` | `` |
| state_waitlist | ✅ | state_waitlist_admin_write | authenticated | UPDATE | `(is_admin() AND (organization_id = current_org_id()))` | `(is_admin() AND (organization_id = current_org_id()))` |
| state_waitlist | ✅ | state_waitlist_insert | anon, authenticated | INSERT | `` | `((email IS NOT NULL) AND (email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$'::text) AND (notified_at IS NULL) AND ((user_id IS NULL) OR (user_id = auth.uid())) AND (state_flag(organization_i` |
| substitution_requests | ✅ | sub_requests_admin_all | public | ALL | `is_admin()` | `is_admin()` |
| substitution_requests | ✅ | sub_requests_service_all | service_role | ALL | `true` | `true` |
| substitution_requests | ✅ | substitution_requests_org_fence | public | ALL | `(organization_id = current_org_id())` | `(organization_id = current_org_id())` |
| sync_audit_log | ✅ | admin_sync_audit_log | authenticated | ALL | `is_admin()` | `is_admin()` |
| sync_audit_log | ✅ | engel_own_sync_audit_log | authenticated | SELECT | `(user_id = auth.uid())` | `` |
| sync_audit_log | ✅ | org_fence_sync_audit_log | authenticated | ALL | `(organization_id = current_org_id())` | `` |
| sync_conflicts | ✅ | sync_conflicts_admin_all | public | ALL | `is_admin()` | `is_admin()` |
| sync_conflicts | ✅ | sync_conflicts_service_all | service_role | ALL | `true` | `true` |
| sync_conflicts | ✅ | sync_conflicts_staff_read | public | SELECT | `is_internal_staff()` | `` |
| sync_konflikte | ✅ | admin_sync_konflikte | authenticated | ALL | `is_admin()` | `is_admin()` |
| sync_konflikte | ✅ | engel_own_sync_konflikte | authenticated | SELECT | `(user_id = auth.uid())` | `` |
| sync_konflikte | ✅ | org_fence_sync_konflikte | authenticated | ALL | `(organization_id = current_org_id())` | `` |
| tour_stops | ✅ | tour_stops_admin_manage | authenticated | ALL | `is_admin()` | `is_admin()` |
| tour_stops | ✅ | tour_stops_engel_read | authenticated | SELECT | `(tour_id IN ( SELECT t.id    FROM tours t   WHERE (t.caregiver_id IN ( SELECT eigene_caregiver_ids() AS eigene_caregiver_ids))))` | `` |
| tour_stops | ✅ | tour_stops_engel_update | authenticated | UPDATE | `(tour_id IN ( SELECT t.id    FROM tours t   WHERE (t.caregiver_id IN ( SELECT eigene_caregiver_ids() AS eigene_caregiver_ids))))` | `(tour_id IN ( SELECT t.id    FROM tours t   WHERE (t.caregiver_id IN ( SELECT eigene_caregiver_ids() AS eigene_caregiver_ids))))` |
| tour_stops | ✅ | tour_stops_org_fence | public | ALL | `(organization_id = current_org_id())` | `(organization_id = current_org_id())` |
| tour_templates | ✅ | tour_templates_admin_manage | authenticated | ALL | `is_admin()` | `is_admin()` |
| tour_templates | ✅ | tour_templates_org_fence | public | ALL | `(organization_id = current_org_id())` | `(organization_id = current_org_id())` |
| tours | ✅ | tours_admin_manage | authenticated | ALL | `is_admin()` | `is_admin()` |
| tours | ✅ | tours_engel_read | authenticated | SELECT | `(caregiver_id IN ( SELECT eigene_caregiver_ids() AS eigene_caregiver_ids))` | `` |
| tours | ✅ | tours_engel_update | authenticated | UPDATE | `(caregiver_id IN ( SELECT eigene_caregiver_ids() AS eigene_caregiver_ids))` | `(caregiver_id IN ( SELECT eigene_caregiver_ids() AS eigene_caregiver_ids))` |
| tours | ✅ | tours_org_fence | public | ALL | `(organization_id = current_org_id())` | `(organization_id = current_org_id())` |
| uebergabe_kenntnisnahmen | ✅ | admin_uebergabe_kenntnisnahmen_all | public | ALL | `is_admin()` | `` |
| uebergabe_kenntnisnahmen | ✅ | engel_uebergabe_kenntnisnahmen_insert | public | INSERT | `` | `(user_id = auth.uid())` |
| uebergabe_kenntnisnahmen | ✅ | engel_uebergabe_kenntnisnahmen_select | public | SELECT | `((user_id = auth.uid()) OR (EXISTS ( SELECT 1    FROM eigene_caregiver_ids() eigene_caregiver_ids(eigene_caregiver_ids))) OR (protokoll_id IN ( SELECT p.id    FROM uebergabe_protokolle p   WHERE (p.ue` | `` |
| uebergabe_kenntnisnahmen | ✅ | org_fence_uebergabe_kenntnisnahmen | public | ALL | `(organization_id = current_org_id())` | `` |
| uebergabe_protokolle | ✅ | admin_uebergabe_protokolle_all | public | ALL | `is_admin()` | `` |
| uebergabe_protokolle | ✅ | engel_uebergabe_protokolle_insert | public | INSERT | `` | `((uebergeber_id = auth.uid()) AND (status = 'offen'::text))` |
| uebergabe_protokolle | ✅ | engel_uebergabe_protokolle_select | public | SELECT | `((uebergeber_id = auth.uid()) OR (EXISTS ( SELECT 1    FROM eigene_caregiver_ids() eigene_caregiver_ids(eigene_caregiver_ids))))` | `` |
| uebergabe_protokolle | ✅ | engel_uebergabe_protokolle_update | public | UPDATE | `((uebergeber_id = auth.uid()) AND (status = 'offen'::text))` | `(uebergeber_id = auth.uid())` |
| uebergabe_protokolle | ✅ | org_fence_uebergabe_protokolle | public | ALL | `(organization_id = current_org_id())` | `` |
| uebergabe_punkte | ✅ | admin_uebergabe_punkte_all | public | ALL | `is_admin()` | `` |
| uebergabe_punkte | ✅ | engel_uebergabe_punkte_insert | public | INSERT | `` | `((erstellt_von = auth.uid()) AND ((client_id IS NULL) OR (client_id IN ( SELECT a.client_id    FROM assignments a   WHERE ((a.caregiver_id IN ( SELECT eigene_caregiver_ids() AS eigene_caregiver_ids)) ` |
| uebergabe_punkte | ✅ | engel_uebergabe_punkte_select | public | SELECT | `((client_id IS NULL) OR (client_id IN ( SELECT a.client_id    FROM assignments a   WHERE ((a.caregiver_id IN ( SELECT eigene_caregiver_ids() AS eigene_caregiver_ids)) AND (a.status = ANY (ARRAY['activ` | `` |
| uebergabe_punkte | ✅ | engel_uebergabe_punkte_update | public | UPDATE | `((client_id IS NULL) OR (client_id IN ( SELECT a.client_id    FROM assignments a   WHERE ((a.caregiver_id IN ( SELECT eigene_caregiver_ids() AS eigene_caregiver_ids)) AND (a.status = ANY (ARRAY['activ` | `` |
| uebergabe_punkte | ✅ | org_fence_uebergabe_punkte | public | ALL | `(organization_id = current_org_id())` | `` |
| verordnung_leistungen | ✅ | admin_only | public | ALL | `is_admin()` | `is_admin()` |
| verordnung_leistungen | ✅ | verordnung_leistungen_org_fence | public | ALL | `(organization_id = current_org_id())` | `(organization_id = current_org_id())` |
| verordnungen | ✅ | verordnungen_admin_all | public | ALL | `is_admin()` | `is_admin()` |
| verordnungen | ✅ | verordnungen_client_read | public | SELECT | `(EXISTS ( SELECT 1    FROM clients cl   WHERE ((cl.id = verordnungen.client_id) AND (cl.user_id = auth.uid()))))` | `` |
| verordnungen | ✅ | verordnungen_org_fence | public | ALL | `(organization_id = current_org_id())` | `(organization_id = current_org_id())` |
| verordnungen | ✅ | verordnungen_service_all | service_role | ALL | `true` | `true` |
| verordnungen | ✅ | verordnungen_staff_read | public | SELECT | `is_internal_staff()` | `` |
| visitor_locations | ✅ | Admin can read all visits | public | SELECT | `is_admin()` | `` |
| visitor_locations | ✅ | Anyone can insert visitor_locations | public | INSERT | `` | `true` |
| visitors | ✅ | Admin can read visits | public | SELECT | `is_admin()` | `` |
| visitors | ✅ | Anyone can insert visitors | public | INSERT | `` | `true` |
| vital_sign_thresholds | ✅ | admin_vital_sign_thresholds | public | ALL | `is_admin()` | `is_admin()` |
| vital_sign_thresholds | ✅ | engel_vital_sign_thresholds_select | public | SELECT | `(client_id IN ( SELECT a.client_id    FROM assignments a   WHERE ((a.caregiver_id IN ( SELECT eigene_caregiver_ids() AS eigene_caregiver_ids)) AND (a.status = ANY (ARRAY['active'::text, 'GEPLANT'::tex` | `` |
| vital_sign_thresholds | ✅ | org_fence_vital_sign_thresholds | public | ALL | `(organization_id = current_org_id())` | `` |
| vital_signs | ✅ | admin_vital_signs | public | ALL | `is_admin()` | `is_admin()` |
| vital_signs | ✅ | engel_vital_signs_insert | public | INSERT | `` | `((measured_by = auth.uid()) AND (client_id IN ( SELECT a.client_id    FROM assignments a   WHERE ((a.caregiver_id IN ( SELECT eigene_caregiver_ids() AS eigene_caregiver_ids)) AND (a.status = ANY (ARRA` |
| vital_signs | ✅ | engel_vital_signs_select | public | SELECT | `(client_id IN ( SELECT a.client_id    FROM assignments a   WHERE ((a.caregiver_id IN ( SELECT eigene_caregiver_ids() AS eigene_caregiver_ids)) AND (a.status = ANY (ARRAY['active'::text, 'GEPLANT'::tex` | `` |
| vital_signs | ✅ | org_fence_vital_signs | public | ALL | `(organization_id = current_org_id())` | `` |
| wf_aktionen | ✅ | wf_aktionen_admin_all | authenticated | ALL | `is_admin()` | `` |
| wf_aktionen | ✅ | wf_aktionen_org_fence | public | ALL | `(organization_id = current_org_id())` | `` |
| wf_audit_log | ✅ | wf_audit_admin_all | authenticated | ALL | `is_admin()` | `` |
| wf_audit_log | ✅ | wf_audit_org_fence | public | ALL | `(organization_id = current_org_id())` | `` |
| wf_ausfuehrungen | ✅ | wf_ausfuehrungen_admin_all | authenticated | ALL | `is_admin()` | `` |
| wf_ausfuehrungen | ✅ | wf_ausfuehrungen_org_fence | public | ALL | `(organization_id = current_org_id())` | `` |
| wf_dead_letter | ✅ | wf_dead_letter_admin_all | authenticated | ALL | `is_admin()` | `` |
| wf_dead_letter | ✅ | wf_dead_letter_org_fence | public | ALL | `(organization_id = current_org_id())` | `` |
| wf_events | ✅ | wf_events_admin_all | authenticated | ALL | `is_admin()` | `` |
| wf_events | ✅ | wf_events_org_fence | public | ALL | `(organization_id = current_org_id())` | `` |
| wf_regeln | ✅ | wf_regeln_admin_all | authenticated | ALL | `is_admin()` | `` |
| wf_regeln | ✅ | wf_regeln_org_fence | public | ALL | `(organization_id = current_org_id())` | `` |
| wf_warteschlange | ✅ | wf_warteschlange_admin_all | authenticated | ALL | `is_admin()` | `` |
| wf_warteschlange | ✅ | wf_warteschlange_org_fence | public | ALL | `(organization_id = current_org_id())` | `` |
| whatsapp_conversations | ✅ | whatsapp_admin_read | authenticated | SELECT | `is_admin()` | `` |
| wound_assessments | ✅ | admin_wound_assessments | public | ALL | `is_admin()` | `` |
| wound_assessments | ✅ | engel_wound_assessments_select | public | SELECT | `(EXISTS ( SELECT 1    FROM wounds w   WHERE ((w.id = wound_assessments.wound_id) AND engel_hat_aktiven_klienten(w.client_id))))` | `` |
| wound_assessments | ✅ | org_fence_wound_assessments | public | ALL | `(organization_id = current_org_id())` | `` |
| wound_photos | ✅ | admin_wound_photos | public | ALL | `is_admin()` | `` |
| wound_photos | ✅ | engel_wound_photos_select | public | SELECT | `(EXISTS ( SELECT 1    FROM wounds w   WHERE ((w.id = wound_photos.wound_id) AND engel_hat_aktiven_klienten(w.client_id))))` | `` |
| wound_photos | ✅ | org_fence_wound_photos | public | ALL | `(organization_id = current_org_id())` | `` |
| wound_treatments | ✅ | admin_wound_treatments | public | ALL | `is_admin()` | `` |
| wound_treatments | ✅ | engel_wound_treatments_select | public | SELECT | `(EXISTS ( SELECT 1    FROM wounds w   WHERE ((w.id = wound_treatments.wound_id) AND engel_hat_aktiven_klienten(w.client_id))))` | `` |
| wound_treatments | ✅ | org_fence_wound_treatments | public | ALL | `(organization_id = current_org_id())` | `` |
| wounds | ✅ | admin_wounds | public | ALL | `is_admin()` | `` |
| wounds | ✅ | engel_wounds_select | public | SELECT | `engel_hat_aktiven_klienten(client_id)` | `` |
| wounds | ✅ | org_fence_wounds | public | ALL | `(organization_id = current_org_id())` | `` |
| zahlungseingaenge | ✅ | admin_crud_zahlungseingaenge | authenticated | ALL | `is_admin()` | `` |
| zahlungseingaenge | ✅ | org_fence_zahlungseingaenge | public | ALL | `(organization_id = (current_setting('app.current_org_id'::text, true))::uuid)` | `` |
| zuzahlungen | ✅ | admin_zuzahlungen | public | ALL | `is_admin()` | `` |
| zuzahlungen | ✅ | org_fence_zuzahlungen | public | ALL | `(organization_id = current_org_id())` | `` |
