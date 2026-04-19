# RLS-Policy-Matrix

> Auto-generiert von `scripts/rls-matrix.ts` am 2026-04-19T22:00:19.880Z.
> NICHT manuell bearbeiten — Aenderungen werden ueberschrieben.

Status: 59 Tabellen, 156 Policies.

## ✅ Alle Tabellen haben RLS aktiviert

## Vollstaendige Policy-Liste

| Tabelle | RLS | Policy | Rolle(n) | CMD | USING | WITH CHECK |
|---------|-----|--------|----------|-----|-------|------------|
| angel_reviews | ✅ | Admin kann alle Bewertungen verwalten | public | ALL | `(EXISTS ( SELECT 1    FROM profiles   WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'superadmin'::text])))))` | `` |
| angel_reviews | ✅ | Jeder kann Bewertungen lesen | public | SELECT | `true` | `` |
| angel_reviews | ✅ | Kunde kann eigene Bewertung bearbeiten | public | UPDATE | `(auth.uid() = customer_id)` | `` |
| angel_reviews | ✅ | Kunde kann eigene Bewertung erstellen | public | INSERT | `` | `(auth.uid() = customer_id)` |
| angels | ✅ | Admin engelleri yönetebilir | public | ALL | `is_admin()` | `` |
| angels | ✅ | Angels can update own record | public | UPDATE | `(auth.uid() = id)` | `` |
| angels | ✅ | Angels can upsert own record | public | INSERT | `` | `(auth.uid() = id)` |
| angels | ✅ | Herkes engelleri okuyabilir | public | SELECT | `true` | `` |
| app_settings | ✅ | app_settings_read | public | SELECT | `true` | `` |
| app_settings | ✅ | app_settings_update | public | UPDATE | `(EXISTS ( SELECT 1    FROM profiles   WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'superadmin'::text))))` | `` |
| bookings | ✅ | Admin bookingleri yönetebilir | public | ALL | `is_admin()` | `` |
| bookings | ✅ | Admins can read all bookings | public | SELECT | `is_admin()` | `` |
| bookings | ✅ | Admins can update all bookings | public | UPDATE | `is_admin()` | `` |
| bookings | ✅ | Angels can update own bookings | public | UPDATE | `(auth.uid() = angel_id)` | `` |
| bookings | ✅ | Customers can insert bookings | public | INSERT | `` | `(auth.uid() = customer_id)` |
| bookings | ✅ | Customers can update own bookings | public | UPDATE | `(auth.uid() = customer_id)` | `` |
| bookings | ✅ | Kullanıcı kendi bookinglerini okuyabilir | public | SELECT | `((auth.uid() = customer_id) OR (auth.uid() = angel_id))` | `` |
| bookings | ✅ | Müşteri booking oluşturabilir | public | INSERT | `` | `(auth.uid() = customer_id)` |
| bookings | ✅ | bookings_insert | public | INSERT | `` | `(auth.uid() = customer_id)` |
| bookings | ✅ | bookings_select | public | SELECT | `((auth.uid() = customer_id) OR (auth.uid() = angel_id))` | `` |
| bookings | ✅ | bookings_update | public | UPDATE | `((auth.uid() = customer_id) OR (auth.uid() = angel_id))` | `` |
| bookings | ✅ | İlgili kişi bookingi güncelleyebilir | public | UPDATE | `((auth.uid() = customer_id) OR (auth.uid() = angel_id))` | `` |
| care_recipients | ✅ | Users can delete own care recipients | public | DELETE | `(auth.uid() = profile_id)` | `` |
| care_recipients | ✅ | Users can insert own care recipients | public | INSERT | `` | `(auth.uid() = profile_id)` |
| care_recipients | ✅ | Users can update own care recipients | public | UPDATE | `(auth.uid() = profile_id)` | `` |
| care_recipients | ✅ | Users can view own care recipients | public | SELECT | `(auth.uid() = profile_id)` | `` |
| care_recipients | ✅ | care_recipients_admin | public | ALL | `(EXISTS ( SELECT 1    FROM profiles   WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'superadmin'::text])))))` | `` |
| care_recipients | ✅ | care_recipients_owner | public | ALL | `(profile_id = auth.uid())` | `` |
| chat_messages | ✅ | Users can read their ride messages | public | SELECT | `(EXISTS ( SELECT 1    FROM krankenfahrten k   WHERE ((k.id = chat_messages.ride_id) AND ((k.customer_id = auth.uid()) OR (k.provider_id IN ( SELECT kp.id            FROM krankenfahrt_providers kp     ` | `` |
| chat_messages | ✅ | Users can send messages to their rides | public | INSERT | `` | `((sender_id = auth.uid()) AND (EXISTS ( SELECT 1    FROM krankenfahrten k   WHERE ((k.id = chat_messages.ride_id) AND ((k.customer_id = auth.uid()) OR (k.provider_id IN ( SELECT kp.id            FROM ` |
| content_blocks | ✅ | Admin manages all content | public | ALL | `is_admin()` | `` |
| content_blocks | ✅ | Public can read active content | public | SELECT | `((status = 'active'::text) AND (context = 'public'::text))` | `` |
| conversions | ✅ | Service role full access | service_role | ALL | `true` | `true` |
| fahrzeuge | ✅ | Customers can view active vehicles | public | SELECT | `(is_active = true)` | `` |
| fahrzeuge | ✅ | Providers can manage own vehicles | public | ALL | `(provider_id IN ( SELECT krankenfahrt_providers.id    FROM krankenfahrt_providers   WHERE (krankenfahrt_providers.user_id = auth.uid())))` | `` |
| fcm_tokens | ✅ | Service role can read all fcm tokens | public | SELECT | `(auth.role() = 'service_role'::text)` | `` |
| fcm_tokens | ✅ | Users can manage own fcm tokens | public | ALL | `(auth.uid() = user_id)` | `(auth.uid() = user_id)` |
| hygienebox_orders | ✅ | Users can insert own hygienebox orders | public | INSERT | `` | `(auth.uid() = user_id)` |
| hygienebox_orders | ✅ | Users can update own hygienebox orders | public | UPDATE | `(auth.uid() = user_id)` | `` |
| hygienebox_orders | ✅ | Users can view own hygienebox orders | public | SELECT | `(auth.uid() = user_id)` | `` |
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
| login_rate_limits | ✅ | service_role only | service_role | ALL | `true` | `true` |
| medikamentenplan | ✅ | Admins can view all medikamentenplan | public | SELECT | `is_admin()` | `` |
| medikamentenplan | ✅ | Users can delete own medikamentenplan | public | DELETE | `(auth.uid() = user_id)` | `` |
| medikamentenplan | ✅ | Users can insert own medikamentenplan | public | INSERT | `` | `(auth.uid() = user_id)` |
| medikamentenplan | ✅ | Users can update own medikamentenplan | public | UPDATE | `(auth.uid() = user_id)` | `` |
| medikamentenplan | ✅ | Users can view own medikamentenplan | public | SELECT | `(auth.uid() = user_id)` | `` |
| messages | ✅ | Receiver can mark as read | public | UPDATE | `(auth.uid() = receiver_id)` | `` |
| messages | ✅ | Users can send messages | public | INSERT | `` | `(auth.uid() = sender_id)` |
| messages | ✅ | Users can view own messages | public | SELECT | `((auth.uid() = sender_id) OR (auth.uid() = receiver_id))` | `` |
| mis_ai_conversations | ✅ | Authenticated users can read mis_ai_conversations | public | SELECT | `(auth.role() = 'authenticated'::text)` | `` |
| mis_audit_log | ✅ | audit_select_admin | public | SELECT | `(EXISTS ( SELECT 1    FROM profiles   WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'superadmin'::text])))))` | `` |
| mis_auth_log | ✅ | Admin can read auth log | public | SELECT | `is_admin()` | `` |
| mis_auth_log | ✅ | Users can insert own auth_log | anon, authenticated | INSERT | `` | `((user_id IS NULL) OR (user_id = auth.uid()))` |
| mis_budget_items | ✅ | Authenticated users can read mis_budget_items | public | SELECT | `(auth.role() = 'authenticated'::text)` | `` |
| mis_capa | ✅ | Admin can delete mis_capa | public | DELETE | `is_admin()` | `` |
| mis_capa | ✅ | Admin can insert mis_capa | public | INSERT | `` | `is_admin()` |
| mis_capa | ✅ | Admin can update mis_capa | public | UPDATE | `is_admin()` | `` |
| mis_capa | ✅ | Authenticated users can read mis_capa | public | SELECT | `(auth.role() = 'authenticated'::text)` | `` |
| mis_dataroom_access | ✅ | Authenticated users can read mis_dataroom_access | public | SELECT | `(auth.role() = 'authenticated'::text)` | `` |
| mis_dataroom_sections | ✅ | Authenticated users can read mis_dataroom_sections | public | SELECT | `(auth.role() = 'authenticated'::text)` | `` |
| mis_document_categories | ✅ | Authenticated users can read mis_document_categories | public | SELECT | `(auth.role() = 'authenticated'::text)` | `` |
| mis_document_versions | ✅ | Authenticated users can read mis_document_versions | public | SELECT | `(auth.role() = 'authenticated'::text)` | `` |
| mis_documents | ✅ | Admin full access on mis_documents | public | ALL | `is_admin()` | `` |
| mis_financial_reports | ✅ | Authenticated users can read mis_financial_reports | public | SELECT | `(auth.role() = 'authenticated'::text)` | `` |
| mis_kpis | ✅ | Admin full access on mis_kpis | public | ALL | `is_admin()` | `` |
| mis_notifications | ✅ | Users see own notifications | public | SELECT | `(user_id = auth.uid())` | `` |
| mis_purchase_orders | ✅ | Authenticated users can read mis_purchase_orders | public | SELECT | `(auth.role() = 'authenticated'::text)` | `` |
| mis_quality_audits | ✅ | Admin can delete mis_quality_audits | public | DELETE | `is_admin()` | `` |
| mis_quality_audits | ✅ | Admin can insert mis_quality_audits | public | INSERT | `` | `is_admin()` |
| mis_quality_audits | ✅ | Admin can update mis_quality_audits | public | UPDATE | `is_admin()` | `` |
| mis_quality_audits | ✅ | Authenticated users can read mis_quality_audits | public | SELECT | `(auth.role() = 'authenticated'::text)` | `` |
| mis_quality_processes | ✅ | Authenticated users can read mis_quality_processes | public | SELECT | `(auth.role() = 'authenticated'::text)` | `` |
| mis_suppliers | ✅ | Admin can delete mis_suppliers | public | DELETE | `is_admin()` | `` |
| mis_suppliers | ✅ | Admin can insert mis_suppliers | public | INSERT | `` | `is_admin()` |
| mis_suppliers | ✅ | Admin can update mis_suppliers | public | UPDATE | `is_admin()` | `` |
| mis_suppliers | ✅ | Authenticated users can read mis_suppliers | public | SELECT | `(auth.role() = 'authenticated'::text)` | `` |
| mis_tasks | ✅ | Admin full access on mis_tasks | public | ALL | `is_admin()` | `is_admin()` |
| mis_tasks | ✅ | Authenticated users can read mis_tasks | public | SELECT | `(auth.role() = 'authenticated'::text)` | `` |
| newsletter_subscribers | ✅ | Admin full access newsletter | public | ALL | `(EXISTS ( SELECT 1    FROM profiles   WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text))))` | `` |
| notfall_access_attempts | ✅ | Admins can view notfall_access_attempts | public | SELECT | `is_admin()` | `` |
| notfall_info | ✅ | Admins can view all notfall_info | public | SELECT | `is_admin()` | `` |
| notfall_info | ✅ | Users can insert own notfall_info | public | INSERT | `` | `(auth.uid() = user_id)` |
| notfall_info | ✅ | Users can update own notfall_info | public | UPDATE | `(auth.uid() = user_id)` | `` |
| notfall_info | ✅ | Users can view own notfall_info | public | SELECT | `(auth.uid() = user_id)` | `` |
| notifications | ✅ | Users can insert own notifications | authenticated | INSERT | `` | `(auth.uid() = user_id)` |
| notifications | ✅ | Users can update own notifications | public | UPDATE | `(auth.uid() = user_id)` | `(auth.uid() = user_id)` |
| notifications | ✅ | Users can view own notifications | public | SELECT | `(auth.uid() = user_id)` | `` |
| page_views | ✅ | Admins can read page_views | public | SELECT | `(EXISTS ( SELECT 1    FROM profiles   WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'superadmin'::text])))))` | `` |
| page_views | ✅ | Anyone can insert page_views | public | INSERT | `` | `true` |
| profiles | ✅ | Admin can delete profiles | public | DELETE | `is_admin()` | `` |
| profiles | ✅ | Admin can update all profiles | public | UPDATE | `((auth.uid() = id) OR is_admin())` | `` |
| profiles | ✅ | Kullanıcı kendi profilini güncelleyebilir | public | UPDATE | `(auth.uid() = id)` | `` |
| profiles | ✅ | Kullanıcı kendi profilini oluşturabilir | public | INSERT | `` | `(auth.uid() = id)` |
| profiles | ✅ | Users can update own profile | public | UPDATE | `(auth.uid() = id)` | `` |
| profiles | ✅ | profiles_insert | public | INSERT | `` | `(auth.uid() = id)` |
| profiles | ✅ | profiles_select_admin | public | SELECT | `is_admin()` | `` |
| profiles | ✅ | profiles_select_booking_partner | public | SELECT | `((auth.role() = 'authenticated'::text) AND ((EXISTS ( SELECT 1    FROM bookings b   WHERE (((b.customer_id = profiles.id) AND (b.angel_id = auth.uid())) OR ((b.angel_id = profiles.id) AND (b.customer_` | `` |
| profiles | ✅ | profiles_select_engels | public | SELECT | `((auth.role() = 'authenticated'::text) AND (role = 'engel'::text))` | `` |
| profiles | ✅ | profiles_select_own | public | SELECT | `(auth.uid() = id)` | `` |
| profiles | ✅ | profiles_update | public | UPDATE | `(auth.uid() = id)` | `` |
| push_subscriptions | ✅ | Service role full access | public | ALL | `(auth.role() = 'service_role'::text)` | `` |
| push_subscriptions | ✅ | Users can manage own subscriptions | public | ALL | `(auth.uid() = user_id)` | `` |
| referrals | ✅ | Admins sehen alle Referrals | public | SELECT | `(EXISTS ( SELECT 1    FROM profiles   WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'superadmin'::text])))))` | `` |
| referrals | ✅ | System kann Referrals erstellen | public | INSERT | `` | `(auth.uid() = referred_id)` |
| referrals | ✅ | Users sehen eigene Referrals | public | SELECT | `((auth.uid() = referrer_id) OR (auth.uid() = referred_id))` | `` |
| reviews | ✅ | Admins can read all reviews | public | SELECT | `is_admin()` | `` |
| reviews | ✅ | Herkes reviewleri okuyabilir | public | SELECT | `true` | `` |
| reviews | ✅ | Müşteri review yazabilir | public | INSERT | `` | `(auth.uid() = reviewer_id)` |
| reviews | ✅ | reviews_insert | public | INSERT | `` | `(auth.uid() = reviewer_id)` |
| reviews | ✅ | reviews_select | public | SELECT | `true` | `` |
| visitor_locations | ✅ | Admin can read all visits | public | SELECT | `is_admin()` | `` |
| visitor_locations | ✅ | Anyone can insert visitor_locations | public | INSERT | `` | `true` |
| visitors | ✅ | Admin can read visits | public | SELECT | `is_admin()` | `` |
| visitors | ✅ | Anyone can insert visitors | public | INSERT | `` | `true` |
