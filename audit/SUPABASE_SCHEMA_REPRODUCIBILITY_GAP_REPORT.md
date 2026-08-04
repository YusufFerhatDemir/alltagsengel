# Supabase Schema-Reproduzierbarkeits-Gap-Bericht

**Datum:** 2026-08-04
**Branch:** bookings-policy-staging-pr23 (Preview Branch)
**Produktion:** nnwyktkqibdjxgimjyuq (eu-west-1)
**Autor:** Automatisierte Analyse (Phase 4, A-3)
**Status:** NO-GO — Schema nicht reproduzierbar

---

## 0. Zusammenfassung

Das Datenbankschema der Alltagsengel-Produktion kann **NICHT** ausschließlich aus Repository-Dateien reproduziert werden.

- **121 Tabellen** in Produktion
- **107 Tabellen** werden durch Migrationen erzeugt
- **4 Tabellen** fehlen vollständig in den Migrationen (profiles, bookings, angels, reviews)
- **5 Funktionen** existieren nur in Produktion, nirgends im Repository
- **6 Trigger** existieren nur in Produktion, nirgends im Repository
- **1 Auth-Trigger** (on_auth_user_created) nur in initial-setup.sql, nicht in Migrationen
- **Schema-Drift**: initial-setup.sql weicht signifikant vom Produktions-Schema ab

---

## 1. Architektur-Überblick: Schema-Quellen

Das Repository enthält drei Schema-Quellen, die **NICHT aufeinander abgestimmt** sind:

| Quelle | Pfad | Tabellen | Status |
|--------|------|----------|--------|
| initial-setup.sql | supabase/initial-setup.sql | 12 | Veraltet, 6 Tabellen nicht mehr in Produktion |
| Migrationen | supabase/migrations/*.sql (43 Dateien) | 107 | Aktiv, aber unvollständig |
| Shadow-Bootstrap | supabase/shadow/00_supabase_bootstrap.sql | 0 (emuliert auth/storage) | Nur für lokale Tests |

**Kernproblem:** Die 4 ältesten und kritischsten Tabellen (profiles, bookings, angels, reviews) wurden historisch über das Supabase-Dashboard erstellt und sind **nur** in initial-setup.sql dokumentiert — einer Datei, die nie als Migration ausgeführt wird.

---

## 2. Fehlende Tabellen-Migrationen

### 2.1 Tabellen nur in initial-setup.sql (NICHT in Migrationen)

#### profiles (18 Spalten in Produktion)

**initial-setup.sql definiert 11 Spalten** — Produktion hat 18. Schema-Drift:

| Spalte | initial-setup.sql | Produktion | Abweichung |
|--------|------------------|------------|------------|
| id | uuid PK, FK auth.users | uuid PK | ✓ |
| role | text NOT NULL default 'kunde', CHECK | text NOT NULL, kein default | Default fehlt in Prod |
| first_name | text NOT NULL default '' | text NOT NULL default '' | ✓ |
| last_name | text NOT NULL default '' | text NOT NULL default '' | ✓ |
| email | text (nullable) | text NOT NULL default '' | **Nullability geändert** |
| phone | text | text, default '' | ✓ |
| location | text | text, default '' | ✓ |
| latitude | **numeric** | **double precision** | **Typ geändert** |
| longitude | **numeric** | **double precision** | **Typ geändert** |
| avatar_color | text | text, default '#C8A45B' | Default in Prod hinzugefügt |
| created_at | timestamptz default now() | timestamptz default now() | ✓ |
| postal_code | — | text | Durch Migration 20260101000100 |
| is_test | — | boolean default false | Durch Migration 20260101000100 |
| referral_code | — | text | Durch Migration 20260101000100 |
| referred_by | — | uuid | Durch Migration 20260101000100 |
| referral_credit | — | numeric default 0 | Durch Migration 20260101000100 |
| onboarding_completed | — | boolean default true | Durch Migration 20260412 |
| deleted_at | — | timestamptz | Durch Migration 20260419 |

**Risiko:** KRITISCH — profiles ist FK-Ziel für fast alle anderen Tabellen. Falscher Spaltentyp (numeric vs. double precision) verursacht FK-Fehler oder Dateninkonsistenz.

#### bookings (20 Spalten in Produktion)

**initial-setup.sql definiert 15 Spalten** — Produktion hat 20. Massive Drift:

| Spalte | initial-setup.sql | Produktion | Abweichung |
|--------|------------------|------------|------------|
| customer_id | uuid, **ON DELETE SET NULL** | uuid, **NOT NULL** | **Constraint geändert** |
| angel_id | uuid, **ON DELETE SET NULL** | uuid, **NOT NULL** | **Constraint geändert** |
| time | time **(nullable)** | time **NOT NULL**, default '10:00:00' | **Nullability geändert** |
| duration_hours | **numeric** default 1 | **integer** default 2 | **Typ + Default geändert** |
| payment_method | default **'selbstzahler'** | default **'kasse'** | **Default geändert** |
| total_amount | **NOT NULL** default 0 | nullable, default 0 | **Nullability geändert** |
| platform_fee | **NOT NULL** default 0 | nullable, default 0 | **Nullability geändert** |
| is_flexible | — | boolean NOT NULL default false | Durch Migration 20260802000200 |
| care_recipient_id | — | uuid FK care_recipients | Durch Migration 20260802000200 |
| responded_at | — | timestamptz | Durch Migration 20260719 |
| decline_reason | — | text | Durch Migration 20260719 |
| organization_id | — | uuid NOT NULL default current_org_id() | Durch Migration 20260801 (dynamisch) |

**Risiko:** KRITISCH — bookings ist Ziel der RLS-Konsolidierung (PR #23). Falsche Constraints (nullable vs. NOT NULL) brechen die neuen Policies.

#### angels (13 Spalten in Produktion)

**initial-setup.sql definiert 13 Spalten** — gleiche Anzahl, aber Typ-Drift:

| Spalte | initial-setup.sql | Produktion | Abweichung |
|--------|------------------|------------|------------|
| hourly_rate | **numeric** default 30 | **integer** default 20 | **Typ + Default geändert** |
| is_certified | boolean **NOT NULL** default false | boolean default false | **Nullability geändert** |
| is_45b_capable | boolean **NOT NULL** default false | boolean default false | **Nullability geändert** |
| is_online | boolean **NOT NULL** default false | boolean default **true** | **Default geändert** |
| total_jobs | integer **NOT NULL** default 0 | integer default 0 | Nullability geändert |
| rating | numeric **NOT NULL** default 5.0 | numeric default 5.0 | Nullability geändert |
| satisfaction_pct | **numeric** **NOT NULL** default 100 | **integer** default 100 | **Typ geändert** |

**Risiko:** HOCH — angels ist FK-Quelle für bookings. Typ-Änderungen (numeric→integer) können CHECK-Constraints oder Anwendungslogik brechen.

#### reviews (7 Spalten in Produktion)

initial-setup.sql-Definition stimmt weitgehend überein. Abweichungen:

| Spalte | initial-setup.sql | Produktion |
|--------|------------------|------------|
| reviewer_id | ON DELETE SET NULL | NOT NULL |
| angel_id | ON DELETE CASCADE | NOT NULL |
| comment | text (nullable, kein default) | text default '' |

**Risiko:** MITTEL — reviews wird von keiner aktuellen Migration referenziert.

### 2.2 Tabellen in initial-setup.sql, aber NICHT in Produktion (toter Code)

Diese 6 Tabellen wurden nie deployed oder wurden entfernt:

1. **care_eligibility** — Pflegegrad-Tracking (nie umgesetzt)
2. **carebox_catalog_items** — Pflegehilfsmittel-Katalog (nie umgesetzt)
3. **carebox_cart** — Warenkorb (nie umgesetzt)
4. **carebox_order_requests** — Bestellungen (nie umgesetzt)
5. **documents** — Belge-Upload (nie umgesetzt)
6. **payments** — Zahlungen (nie umgesetzt)

**Risiko:** NIEDRIG für Produktion, aber initial-setup.sql würde bei Ausführung 6 überflüssige Tabellen erzeugen.

---

## 3. Fehlende Funktionen

### 3.1 Funktionen NIRGENDS im Repository (nur in Produktion)

| Funktion | Referenziert durch Trigger | Tabelle |
|----------|--------------------------|---------|
| prevent_closed_month_mutation() | trg_monthly_closings_no_reopen | monthly_closings |
| prevent_finalized_invoice_mutation() | trg_invoices_no_finalized_edit | invoices |
| prevent_finalized_service_record_mutation() | trg_service_records_no_finalized_edit | service_records |
| set_updated_at() | trg_abrechnung_zertifikate_updated, trg_datenannahmestellen_updated | abrechnung_zertifikate, datenannahmestellen |
| update_budget_used_amount() | trg_update_budget_on_service_record | service_records |

**Risiko:** KRITISCH — Diese Funktionen schützen Geschäftsregeln (Monatsabschluss-Sperre, Rechnungs-Schutz, Budget-Berechnung). Ohne sie fehlt auf einem reproduzierten System jeder Schutz gegen unkontrollierte Mutationen.

### 3.2 Funktion nur in initial-setup.sql (nicht in Migrationen)

| Funktion | Zweck | Notiz |
|----------|-------|-------|
| handle_new_user() | Auth-Trigger: erstellt automatisch profiles-Zeile bei Registrierung | REVOKE in Migration 20260502, aber CREATE nur in initial-setup.sql |

**Risiko:** KRITISCH — Ohne handle_new_user() werden keine Profile bei der Registrierung erstellt. Die gesamte Anwendung bricht zusammen.

---

## 4. Fehlende Trigger

### 4.1 Trigger NIRGENDS im Repository

| Trigger | Tabelle | Funktion | Risiko |
|---------|---------|----------|--------|
| trg_abrechnung_zertifikate_updated | abrechnung_zertifikate | set_updated_at() | MITTEL |
| trg_datenannahmestellen_updated | datenannahmestellen | set_updated_at() | MITTEL |
| trg_invoices_no_finalized_edit | invoices | prevent_finalized_invoice_mutation() | KRITISCH |
| trg_monthly_closings_no_reopen | monthly_closings | prevent_closed_month_mutation() | KRITISCH |
| trg_service_records_no_finalized_edit | service_records | prevent_finalized_service_record_mutation() | KRITISCH |
| trg_update_budget_on_service_record | service_records | update_budget_used_amount() | KRITISCH |

### 4.2 Trigger nur in initial-setup.sql

| Trigger | Tabelle | Funktion |
|---------|---------|----------|
| on_auth_user_created | auth.users | handle_new_user() |

**Risiko:** KRITISCH — Ohne diesen Trigger werden keine Profile bei Registrierung erstellt.

---

## 5. Storage Buckets

Alle 4 Produktions-Buckets sind in Migrationen vorhanden:

| Bucket | Migration | Status |
|--------|-----------|--------|
| mis-documents | 20260302_mis_schema.sql | ✓ |
| service-proofs | 20260706_monatsabschluss_ki_pruefzentrale.sql | ✓ |
| verordnungen | 20260730_verordnungen_workflow_complete.sql | ✓ |
| abrechnung | 20260802000200_baseline_live_only_columns_and_bucket.sql | ✓ |

**Risiko:** KEIN GAP

---

## 6. Enums und Extensions

- **Enums:** Keine custom Enums in Produktion → KEIN GAP
- **Extensions:** pgcrypto, uuid-ossp usw. werden von Supabase-Plattform bereitgestellt → KEIN GAP

---

## 7. RLS-Policies

### 7.1 Policies in initial-setup.sql (nicht in Migrationen)

initial-setup.sql definiert Legacy-RLS-Policies mit türkischen Namen für profiles, angels, bookings, reviews. Diese wurden in Produktion teilweise durch spätere Migrationen ersetzt/ergänzt, existieren aber in keiner Migration als Baseline.

**Betroffene Tabellen und Policy-Anzahl in Produktion:**

| Tabelle | Policies in Produktion | Policies in initial-setup.sql | Policies in Migrationen |
|---------|----------------------|------------------------------|------------------------|
| profiles | 13 | 3 + 1 admin | Teilweise durch spätere Migrationen |
| bookings | 15 | 3 + 1 admin | Teilweise (15→5 Konsolidierung ausstehend) |
| angels | 4 | 3 + 1 admin | Keine Migration verwaltet angels-Policies |
| reviews | 2 (geschätzt) | 2 | Keine Migration verwaltet reviews-Policies |

**Risiko:** HOCH — Ohne Baseline-Policies werden auf einem reproduzierten System die RLS-Regeln der Kern-Tabellen nicht gesetzt.

---

## 8. Bereits durchgeführte manuelle Änderungen am Preview-Branch

Folgende Objekte wurden VOR dem STOPP-Befehl improvisiert auf dem Preview-Branch erstellt:

| Objekt | Methode | Quelle | Reproduzierbar? |
|--------|---------|--------|-----------------|
| pre_baseline_core_tables | execute_sql (ad-hoc) | Aus Produktions-Metadaten rekonstruiert | **NEIN** — nicht aus Repo |
| 20260101000000_baseline_live_only_tables | apply_migration | Repo-Datei | JA |
| 20260101000100_baseline_live_only_functions | apply_migration | Repo-Datei | JA |
| 20260318_page_views | apply_migration | Repo-Datei | JA |
| 20260302_mis_schema | execute_sql | Repo-Datei (aber via execute_sql statt apply_migration) | TEILWEISE |

**Erforderliche Maßnahme:** Branch-Reset (alle 5 löschen) und sauberer Neuaufbau nur aus Repo-Migrationen.

---

## 9. Abhängigkeitsprobleme in den Migrationen

### 9.1 Forward-Reference: is_admin() in Trigger

Migration `20260101000100_baseline_live_only_functions.sql` definiert den Trigger `prevent_role_escalation()`, der `public.is_admin()` aufruft. Aber `is_admin()` wird erst in einer späteren Migration definiert. Bei serieller Ausführung auf einem leeren Schema scheitert die Trigger-Funktion.

### 9.2 handle_new_user() REVOKE ohne CREATE

Migration `20260502_revoke_anon_security_definer_funcs.sql` revoked Rechte von `handle_new_user()`, aber die Funktion wird von keiner Migration erzeugt.

### 9.3 Dynamische organization_id-Spalte setzt existierende Tabellen voraus

Migration `20260801_phase3_multi_mandant_saas.sql` fügt organization_id zu 50+ Tabellen hinzu — inkl. `bookings`. Wenn `bookings` nicht existiert (weil die Migration fehlt), überspringt die Schleife sie stillschweigend (IF NOT EXISTS-Check), und die Spalte fehlt.

---

## 10. Konkrete Maßnahmen (Remediation)

### Phase 1: Neue Baseline-Migration erstellen

**Datei:** `supabase/migrations/20250101000000_core_tables_baseline.sql`
(Timestamp VOR allen existierenden Migrationen)

Inhalt:
1. CREATE TABLE profiles — mit **Produktions-Schema** (18 Spalten, korrekte Typen)
2. CREATE TABLE angels — mit Produktions-Schema (13 Spalten)
3. CREATE TABLE bookings — mit **Basis-Schema** (15 Spalten ohne spätere Additions)
4. CREATE TABLE reviews — mit Produktions-Schema
5. handle_new_user() Funktion + on_auth_user_created Trigger
6. Basis-RLS-Policies für profiles, angels, bookings, reviews

**WICHTIG:** Die Baseline darf NUR die Spalten enthalten, die VOR allen existierenden Migrationen existierten. Spalten, die durch spätere Migrationen hinzugefügt werden (deleted_at, is_flexible, organization_id etc.), werden weiterhin von ihren jeweiligen Migrationen angelegt.

### Phase 2: Fehlende Funktionen und Trigger nachziehen

**Datei:** `supabase/migrations/20260101000050_missing_functions_baseline.sql`
(Nach core_tables, vor baseline_live_only_tables)

Inhalt:
1. set_updated_at() — Variante von update_updated_at() für Tabellen, die diese nutzen
2. prevent_closed_month_mutation()
3. prevent_finalized_invoice_mutation()
4. prevent_finalized_service_record_mutation()
5. update_budget_used_amount()
6. Zugehörige Trigger (6 Stück)

**Quelle:** Funktionsdefinitionen aus Produktion read-only exportieren (pg_get_functiondef).

### Phase 3: initial-setup.sql bereinigen

- Totem Code entfernen (6 nicht-existierende Tabellen)
- Datei als ARCHIV markieren (nicht für Migrationen verwenden)
- Alternativ: Datei löschen und auf Baseline-Migration verweisen

### Phase 4: Branch-Reset und sauberer Neuaufbau

1. Preview-Branch zurücksetzen (reset_branch)
2. Alle Migrationen sequenziell anwenden (neue Baseline zuerst)
3. Reproduzierbarkeits-Test: Zählung der Tabellen/Funktionen/Trigger vergleichen

---

## 11. GO/NO-GO-Bewertung

### ❌ NO-GO

**Begründung:**

1. **4 Kern-Tabellen** (profiles, bookings, angels, reviews) haben keine Migration.
2. **5 Geschäftsregel-Funktionen** existieren nirgends im Repository.
3. **6 Schutz-Trigger** existieren nirgends im Repository.
4. **initial-setup.sql** ist veraltet und weicht in 15+ Spalten-Definitionen von der Produktion ab.
5. Ein leeres Supabase-Projekt kann mit den vorhandenen Repository-Dateien **nicht** in einen funktionsfähigen Zustand gebracht werden.
6. Die bereits auf dem Preview-Branch durchgeführten manuellen Schritte (pre_baseline_core_tables) sind nicht reproduzierbar.

### Voraussetzungen für GO:

- [ ] Baseline-Migration für profiles, bookings, angels, reviews erstellt
- [ ] Alle 5 fehlenden Funktionen im Repository versioniert
- [ ] Alle 6 fehlenden Trigger im Repository versioniert
- [ ] handle_new_user() + on_auth_user_created in Migration überführt
- [ ] Preview-Branch reset und sauber NUR aus Repo-Migrationen aufgebaut
- [ ] Reproduzierbarkeits-Test bestanden (Tabellen-/Funktionen-/Trigger-Zählung = Produktion)
- [ ] Bookings-Policy-Konsolidierung auf sauberem Branch getestet
- [ ] Validierungsbericht aktualisiert

---

## 12. Risiko-Matrix

| Gap | Objekte | Risiko | DSGVO-Relevant | Blockiert PR #23 |
|-----|---------|--------|----------------|-----------------|
| Fehlende Kern-Tabellen | profiles, bookings, angels, reviews | KRITISCH | Ja (profiles.deleted_at) | Ja |
| Fehlende Funktionen | 5 Stück (prevent_*, set_updated_at, update_budget) | KRITISCH | Nein | Nein (indirekt) |
| Fehlende Trigger | 6 Stück + on_auth_user_created | KRITISCH | Nein | Nein (indirekt) |
| Schema-Drift initial-setup.sql | 15+ Spalten | HOCH | Ja | Ja |
| Policies ohne Migration | profiles, angels, reviews Baseline-Policies | HOCH | Ja | Ja (profiles-Policies) |
| Tote Tabellen in initial-setup.sql | 6 Tabellen | NIEDRIG | Nein | Nein |

---

## Anhang A: Produktions-Schema-Referenz (nur Struktur)

### Tabellen: 121 (vollständige Liste)

abrechnung_zertifikate, abrechnungslaeufe, absences, account_deletion_tokens, action_fingerprints, angel_availability, angel_reviews, angels, app_settings, applications, approved_locations, assignments, audit_logs, bookings, budget_transactions, care_notes, care_recipients, caregiver_bonuses, caregiver_documents, caregiver_initials_history, caregiver_qualifications, caregivers, chat_messages, client_budgets, client_preferred_substitutes, clients, content_blocks, conversions, cooperation_partners, datenannahmestellen, dispatch_status, einsatz_absagen, fahrzeuge, fcm_tokens, geo_events, hygienebox_orders, invoice_disputes, invoice_items, invoice_packages, invoices, kf_booking_reviews, kf_feature_flags, kf_partner_availability, kf_partners, kf_pricing_audit, kf_pricing_config, kf_pricing_costs, kf_pricing_regions, kf_pricing_rules, kf_pricing_surcharges, kf_pricing_tiers, kf_review_rules, kf_service_doc_requirements, kostentraeger_kontakte, krankenfahrt_providers, krankenfahrt_reviews, krankenfahrten, lead_inquiries, leistungspreise, login_rate_limits, medikamentenplan, messages, mis_ai_conversations, mis_applicants, mis_audit_log, mis_auth_log, mis_availability, mis_budget_items, mis_capa, mis_complaints, mis_contracts, mis_crm_activities, mis_dataroom_access, mis_dataroom_sections, mis_document_categories, mis_document_versions, mis_documents, mis_financial_reports, mis_job_postings, mis_kpis, mis_notifications, mis_privacy_audit_log, mis_privacy_consents, mis_privacy_records, mis_privacy_requests, mis_purchase_orders, mis_quality_audits, mis_quality_processes, mis_shifts, mis_signature_requests, mis_suppliers, mis_tasks, mis_training_catalog, mis_training_records, mis_vehicles, monthly_closings, newsletter_subscribers, notfall_access_attempts, notfall_info, notifications, ocr_results, offline_queue, organization_members, organization_subscriptions, organizations, page_views, partner_visits, payment_status, profiles, push_subscriptions, referrals, review_errors, reviews, satisfaction_calls, service_pricing, service_record_items, service_records, service_signatures, substitution_requests, sync_conflicts, verordnung_leistungen, verordnungen, visitor_locations, visitors, whatsapp_conversations

### Funktionen: 31

admin_audit_log_purge, audit_check_constraint_exists, audit_logs_prevent_mutation, audit_rls_all_policies, audit_rls_all_status, audit_rls_policies, audit_rls_status, cleanup_old_rate_limits, current_org_id, enforce_booking_status_transition, generate_referral_code, get_emergency_info_with_pin, get_engel_cards, handle_new_user, has_org_role, is_admin, is_internal_staff, is_org_member, is_own_caregiver, is_own_client, is_profile_soft_deleted, mis_audit_log_prevent_mutation, org_touch_updated_at, prevent_closed_month_mutation, prevent_finalized_invoice_mutation, prevent_finalized_service_record_mutation, prevent_role_escalation, set_onboarding_for_new_kunde, set_updated_at, update_budget_used_amount, update_updated_at

### Storage Buckets: 4

abrechnung, mis-documents, service-proofs, verordnungen

### Custom Enums: 0
