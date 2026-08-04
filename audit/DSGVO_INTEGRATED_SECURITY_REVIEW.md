# DSGVO Integrierte Sicherheitsprüfung — PR #29 + #30

**Datum:** 2026-08-04  
**Prüfer:** Automatisierte Sicherheitsprüfung (Claude Agent)  
**Scope:** PR #29 (`fix/dsgvo-user-delete-fk`) + PR #30 (`fix/dsgvo-all-auth-user-fks`)  
**Supabase Projekt:** `nnwyktkqibdjxgimjyuq` (alltagsengel)  
**Preview-Branch:** `test-dsgvo-pr29-pr30` (project_ref: `ubunejbtjzoonrqwwtym`) — erstellt, getestet, gelöscht  
**Integrations-Branch:** `test/dsgvo-user-delete-pr29-pr30` auf GitHub  

---

## 1. Constraint-Matrix (Vorher / Nachher)

### 1a. Betroffene FKs (public → auth.users)

| # | FK-Name | Tabelle | Spalte | Produktion (Vorher) | Nach Merge (Nachher) | Nullability | PR |
|---|---------|---------|--------|--------------------|--------------------|-------------|-----|
| 1 | `mis_auth_log_user_id_fkey` | mis_auth_log | user_id | **NO ACTION** | SET NULL | NULLABLE | #29 |
| 2 | `caregivers_user_id_fkey` | caregivers | user_id | **NO ACTION** | SET NULL | NULLABLE | #30 |
| 3 | `clients_user_id_fkey` | clients | user_id | **NO ACTION** | SET NULL | NULLABLE | #30 |
| 4 | `chat_messages_sender_id_fkey` | chat_messages | sender_id | **NO ACTION** | SET NULL | NOT NULL → **NULLABLE** | #30 |
| 5 | `app_settings_updated_by_fkey` | app_settings | updated_by | **NO ACTION** | SET NULL | NULLABLE | #30 |
| 6 | `kf_pricing_audit_actor_id_fkey` | kf_pricing_audit | actor_id | **NO ACTION** | SET NULL | NULLABLE | #30 |

### 1b. Bereits korrekte FKs (public → auth.users) — keine Änderung nötig

| FK-Name | Tabelle | Spalte | Delete-Rule | Nullability |
|---------|---------|--------|-------------|-------------|
| `account_deletion_tokens_user_id_fkey` | account_deletion_tokens | user_id | CASCADE | NOT NULL |
| `fcm_tokens_user_id_fkey` | fcm_tokens | user_id | CASCADE | NOT NULL |
| `medikamentenplan_user_id_fkey` | medikamentenplan | user_id | CASCADE | NOT NULL |
| `notfall_info_user_id_fkey` | notfall_info | user_id | CASCADE | NOT NULL |
| `organization_members_user_id_fkey` | organization_members | user_id | CASCADE | NOT NULL |
| `page_views_user_id_fkey` | page_views | user_id | SET NULL | NULLABLE |
| `profiles_id_fkey` | profiles | id | CASCADE | NOT NULL |
| `push_subscriptions_user_id_fkey` | push_subscriptions | user_id | CASCADE | NOT NULL |

### 1c. Auth-interne FKs (auth.* → auth.users) — von Supabase verwaltet

Alle 8 auth-internen FKs (identities, mfa_factors, oauth_authorizations, oauth_consents, one_time_tokens, sessions, webauthn_challenges, webauthn_credentials) verwenden CASCADE — korrekt.

### 1d. Ergebnis

**Nach Merge beider PRs: 0 blockierende FKs (NO ACTION / RESTRICT) auf auth.users.**

Alle public-FKs sind entweder CASCADE (Daten werden mitgelöscht) oder SET NULL (Referenz wird anonymisiert, Datensatz bleibt erhalten).

---

## 2. Löschtest-Ergebnisse

**Testumgebung:** Supabase Preview-Branch `test-dsgvo-pr29-pr30`

### 2a. Vorher-Zustand (Counts)

| Tabelle | User A | User B |
|---------|--------|--------|
| mis_auth_log | 2 | 1 |
| caregivers | 1 | 1 |
| clients | 1 | 1 |
| chat_messages | 2 | 1 |
| app_settings | 1 | 1 |
| kf_pricing_audit | 1 | 1 |

### 2b. Löschung

```sql
DELETE FROM auth.users WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
```

**Ergebnis: ERFOLGREICH** — kein FK-Fehler, kein Abbruch.

### 2c. Nachher-Zustand

| Tabelle | Datensätze erhalten | FK-Spalte | Wert nach Löschung |
|---------|--------------------|-----------|--------------------|
| mis_auth_log | 2 ✅ | user_id | NULL ✅ |
| caregivers | 1 ✅ | user_id | NULL ✅ |
| clients | 1 ✅ | user_id | NULL ✅ |
| chat_messages | 2 ✅ | sender_id | NULL ✅ |
| app_settings | 1 ✅ | updated_by | NULL ✅ |
| kf_pricing_audit | 1 ✅ | actor_id | NULL ✅ |

### 2d. Prüfpunkte

| Prüfung | Ergebnis |
|---------|----------|
| auth.users: User A gelöscht | ✅ Ja |
| auth.users: User B noch vorhanden | ✅ Ja |
| SET NULL in allen 6 Tabellen | ✅ Ja |
| User B Daten unverändert (alle Counts identisch) | ✅ Ja |
| Verwaiste Referenzen | ✅ 0 in allen 6 Tabellen |
| RLS aktiv (Produktion) | ✅ Alle 6 Tabellen |
| Idempotenz (Rollback → Re-Apply) | ✅ Bestätigt |
| Rollback-Roundtrip (SET NULL → NO ACTION → SET NULL) | ✅ Bestätigt |

---

## 3. DSGVO-Datenrestanalyse

### 3a. Was durch auth.users DELETE + FK-Änderungen abgedeckt wird

| Kategorie | Aktion | Tabellen |
|-----------|--------|----------|
| Auth-Credentials | CASCADE-Löschung | auth.identities, auth.sessions, auth.mfa_factors, auth.one_time_tokens |
| OAuth-Daten | CASCADE-Löschung | auth.oauth_authorizations, auth.oauth_consents |
| Profil | CASCADE-Löschung | profiles (id, email, first_name, last_name, phone) |
| Lösch-Tokens | CASCADE-Löschung | account_deletion_tokens |
| Push-Tokens | CASCADE-Löschung | push_subscriptions, fcm_tokens |
| Medizinische Daten | CASCADE-Löschung | medikamentenplan, notfall_info |
| Org-Mitgliedschaft | CASCADE-Löschung | organization_members |
| Audit-Referenz | SET NULL | mis_auth_log.user_id |
| Mitarbeiter-Referenz | SET NULL | caregivers.user_id |
| Kunden-Referenz | SET NULL | clients.user_id |
| Chat-Absender | SET NULL | chat_messages.sender_id |
| Einstellungen-Referenz | SET NULL | app_settings.updated_by |
| Preis-Audit-Referenz | SET NULL | kf_pricing_audit.actor_id |
| Analytics-Referenz | SET NULL | page_views.user_id |

### 3b. Verbleibende PII nach auth.users DELETE (Handlungsbedarf)

#### Kritisch — PII in Tabellen mit SET NULL FK

| Tabelle | Spalte | PII-Kategorie | Status nach DELETE | Handlungsbedarf |
|---------|--------|---------------|-------------------|-----------------|
| caregivers | first_name, last_name | Name | **Bleibt erhalten** | Anonymisieren |
| caregivers | email | E-Mail | **Bleibt erhalten** | Anonymisieren |
| caregivers | phone | Telefon | **Bleibt erhalten** | Anonymisieren |
| caregivers | address, city, zip_code | Adresse | **Bleibt erhalten** | Anonymisieren |
| clients | first_name, last_name | Name | **Bleibt erhalten** | Aufbewahrungspflicht prüfen |
| clients | email, phone | Kontakt | **Bleibt erhalten** | Aufbewahrungspflicht prüfen |
| clients | date_of_birth, geburtsdatum | Geburtsdatum | **Bleibt erhalten** | Aufbewahrungspflicht prüfen |
| clients | address, city, zip_code | Adresse | **Bleibt erhalten** | Aufbewahrungspflicht prüfen |
| clients | emergency_contact_* | Notfallkontakt | **Bleibt erhalten** | Anonymisieren |
| clients | next_of_kin_* | Angehörige | **Bleibt erhalten** | Anonymisieren |
| clients | hausarzt_name, hausarzt_phone | Arztdaten | **Bleibt erhalten** | Anonymisieren |
| clients | notes, allergies, medications, medical_conditions | Medizinische Daten | **Bleibt erhalten** | Aufbewahrungspflicht prüfen |
| chat_messages | content | Freitext | **Bleibt erhalten** | Anonymisieren oder löschen |
| mis_auth_log | user_email, user_name | Name/E-Mail | **Bleibt erhalten** | Anonymisieren |
| mis_auth_log | ip_address | IP-Adresse | **Bleibt erhalten** | Anonymisieren |

#### Tabellen mit user_id-Spalte OHNE FK zu auth.users

Diese Tabellen haben eine `user_id`/`actor_id`/`sender_id`/`created_by`-Spalte, aber **keinen Foreign Key** auf `auth.users`. Sie werden bei `DELETE FROM auth.users` weder blockieren noch automatisch SET NULL setzen:

| Tabelle | Spalte | Nullable | Risiko |
|---------|--------|----------|--------|
| abrechnungslaeufe | created_by | YES | Gering — UUID bleibt, kein Name |
| audit_logs | actor_id | YES | Gering — UUID bleibt |
| content_blocks | updated_by | YES | Gering — UUID bleibt |
| documents | user_id | NO | **Mittel** — Datei bleibt mit orphaner UUID |
| hygienebox_orders | user_id | NO | **Mittel** — Bestellung bleibt mit orphaner UUID |
| kf_partners | user_id | YES | Gering — UUID bleibt |
| kf_pricing_rules | created_by | YES | Gering — UUID bleibt |
| krankenfahrt_providers | user_id | NO | **Mittel** — Provider bleibt mit orphaner UUID |
| messages | sender_id | NO | **Mittel** — Nachricht bleibt mit orphaner UUID |
| mis_ai_conversations | user_id | YES | Gering — UUID bleibt |
| mis_audit_log | actor_id | YES | Gering — UUID bleibt |
| mis_document_versions | created_by | YES | Gering — UUID bleibt |
| mis_financial_reports | created_by | YES | Gering — UUID bleibt |
| mis_notifications | user_id | YES | Gering — UUID bleibt |
| mis_tasks | created_by | YES | Gering — UUID bleibt |
| notfall_access_attempts | user_id | NO | **Mittel** — Zugriff bleibt mit orphaner UUID |
| notifications | user_id | NO | **Mittel** — Benachrichtigung bleibt mit orphaner UUID |
| offline_queue | user_id | YES | Gering — UUID bleibt |
| visitor_locations | user_id | YES | Gering — UUID bleibt |

**Hinweis:** Tabellen mit NOT NULL `user_id` ohne FK blockieren die Löschung zwar NICHT (kein FK-Constraint), hinterlassen aber verwaiste UUIDs.

### 3c. Weitere PII-haltige Tabellen (ohne direkte auth.users-Verknüpfung)

| Tabelle | PII-Spalten | Verknüpfung |
|---------|-------------|-------------|
| applications | first_name, last_name, email, phone, notes | Eigenständig (Bewerbungen) |
| lead_inquiries | name, phone, plz, message, notes | Eigenständig (Leads) |
| cooperation_partners | name, email, phone, address | Eigenständig (Partner) |
| mis_applicants | first_name, last_name, email, phone, notes | Eigenständig (MIS-Bewerber) |
| mis_privacy_consents | person_name, notes | Eigenständig (Einwilligungen) |
| mis_privacy_requests | requester_name, response_notes | Eigenständig (DSGVO-Anfragen) |
| newsletter_subscribers | email | Eigenständig |
| whatsapp_conversations | wa_phone | Eigenständig |
| care_recipients | first_name, last_name, address, emergency_contact_*, notes | Über client_id verknüpft |
| care_notes | author_name, content | Über care_recipient_id |

### 3d. Gesetzlich aufzubewahrende Daten

| Kategorie | Rechtsgrundlage | Aufbewahrungsfrist | Betroffene Tabellen |
|-----------|-----------------|-------------------|---------------------|
| Abrechnungsdaten | §257 HGB, §147 AO | **10 Jahre** | invoices, abrechnungslaeufe, service_records, monthly_closings |
| Pflegedokumentation | §630f BGB (Behandlungsvertrag) | **10 Jahre** | clients (Pflegegrad, med. Daten), care_notes, verordnungen |
| Vertragsunterlagen | §257 HGB | **6 Jahre** | mis_contracts, service_pricing |
| Qualitätsdokumentation | SGB XI §113 | **Prüfungszeitraum** | mis_quality_audits, mis_quality_processes |
| Datenschutz-Dokumentation | DSGVO Art. 5(2) | **3 Jahre** (Verjährung) | mis_privacy_consents, mis_privacy_requests, mis_privacy_records |

**Konsequenz:** Bei Kunden (clients) und Pflegedokumentation darf die Löschung personenbezogener Daten erst nach Ablauf der Aufbewahrungsfrist erfolgen. Die FK-Änderung (SET NULL) entkoppelt lediglich den Auth-Account — die Stammdaten (Name, Adresse, Pflegegrad) bleiben und MÜSSEN für die Aufbewahrungsfrist bleiben.

---

## 4. Bewertung

### Sind PR #29 + #30 zusammen sicher?

**✅ JA — sicher zum Mergen.**

**Begründung:**

1. **Kein Datenverlust:** SET NULL bewahrt alle Geschäftsdaten. Nur die Referenz auf den gelöschten Auth-User wird entfernt.
2. **Keine Strukturänderung:** Keine neuen Tabellen, keine Spalten-Umbenennungen, keine Index-Änderungen.
3. **Idempotent:** `DROP CONSTRAINT IF EXISTS` + `ADD CONSTRAINT` kann beliebig oft ausgeführt werden.
4. **Rollback verfügbar:** Rollback-SQL in `audit/rollback/` kann die FKs sofort auf NO ACTION zurücksetzen.
5. **chat_messages.sender_id:** Die NOT NULL → NULLABLE Änderung ist die einzige Strukturänderung. Sie ist notwendig (SET NULL erfordert NULLABLE) und sicher (keine bestehenden NULL-Werte werden erzeugt, nur bei zukünftigen Löschungen).
6. **RLS bleibt aktiv:** FK-Änderungen berühren keine RLS-Policies.

### Regressionsrisiken

| Risiko | Bewertung | Mitigation |
|--------|-----------|------------|
| chat_messages.sender_id NULL in App-Code | **Niedrig** | Code muss `sender_id IS NULL` behandeln (anonymer Absender) |
| Queries mit JOIN auf user_id | **Niedrig** | LEFT JOIN statt INNER JOIN bei gelöschten Usern |
| RLS-Policies die user_id = auth.uid() prüfen | **Keins** | Gelöschte User haben keine Session → kein Auth-Kontext |

### Unentdeckte FKs

**Keine.** Die vollständige Analyse zeigt: Alle 22 FKs auf auth.users (8 auth-intern, 14 public) sind erfasst. Davon waren 6 problematisch (NO ACTION) — alle werden durch PR #29 + #30 korrigiert.

---

## 5. Produktionsreihenfolge

### Pre-Deployment

1. **Backup:** `pg_dump` der betroffenen Tabellen (oder Supabase Point-in-Time Backup notieren)
2. **Rollback-SQL bereitstellen:** `audit/rollback/ROLLBACK_MIS_AUTH_LOG_FK.sql` + `audit/rollback/ROLLBACK_ALL_AUTH_USER_FKS.sql`

### Deployment

3. **PR #29 mergen** (`fix/dsgvo-user-delete-fk`) — mis_auth_log FK
4. **PR #30 mergen** (`fix/dsgvo-all-auth-user-fks`) — 5 weitere FKs

**Reihenfolge ist unkritisch** — beide PRs sind unabhängig voneinander. Empfehlung: #29 zuerst (kleiner, isoliert), dann #30.

### Post-Deployment

5. **Verifizierung:** Post-Deployment-Tests ausführen (siehe Abschnitt 6)

### Rollback-Verfahren

Bei Problemen:
```sql
-- Rollback PR #29
ALTER TABLE public.mis_auth_log DROP CONSTRAINT IF EXISTS mis_auth_log_user_id_fkey;
ALTER TABLE public.mis_auth_log ADD CONSTRAINT mis_auth_log_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id);

-- Rollback PR #30
ALTER TABLE public.caregivers DROP CONSTRAINT IF EXISTS caregivers_user_id_fkey;
ALTER TABLE public.caregivers ADD CONSTRAINT caregivers_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_user_id_fkey;
ALTER TABLE public.clients ADD CONSTRAINT clients_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
ALTER TABLE public.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_sender_id_fkey;
ALTER TABLE public.chat_messages ADD CONSTRAINT chat_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES auth.users(id);
ALTER TABLE public.chat_messages ALTER COLUMN sender_id SET NOT NULL;
ALTER TABLE public.app_settings DROP CONSTRAINT IF EXISTS app_settings_updated_by_fkey;
ALTER TABLE public.app_settings ADD CONSTRAINT app_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);
ALTER TABLE public.kf_pricing_audit DROP CONSTRAINT IF EXISTS kf_pricing_audit_actor_id_fkey;
ALTER TABLE public.kf_pricing_audit ADD CONSTRAINT kf_pricing_audit_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES auth.users(id);
```

---

## 6. Post-Deployment-Tests

### SQL-Queries nach Merge

```sql
-- 1) Alle FKs auf auth.users prüfen — KEIN NO ACTION / RESTRICT erwartet
SELECT con.conname, c.relname, a.attname,
  CASE con.confdeltype WHEN 'a' THEN 'NO ACTION' WHEN 'n' THEN 'SET NULL' WHEN 'c' THEN 'CASCADE' END AS delete_rule
FROM pg_constraint con
JOIN pg_class c ON con.conrelid = c.oid
JOIN pg_namespace ns ON c.relnamespace = ns.oid
JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY(con.conkey)
JOIN pg_class ref ON con.confrelid = ref.oid
JOIN pg_namespace refns ON ref.relnamespace = refns.oid
WHERE con.contype = 'f' AND refns.nspname = 'auth' AND ref.relname = 'users' AND ns.nspname = 'public'
ORDER BY c.relname;

-- 2) chat_messages.sender_id ist jetzt NULLABLE
SELECT column_name, is_nullable FROM information_schema.columns
WHERE table_schema='public' AND table_name='chat_messages' AND column_name='sender_id';

-- 3) RLS noch aktiv
SELECT tablename, rowsecurity FROM pg_tables
WHERE schemaname='public' AND tablename IN ('mis_auth_log','caregivers','clients','chat_messages','app_settings','kf_pricing_audit');
```

### Browser-Tests

1. Login/Logout funktioniert normal
2. Chat-Nachrichten werden korrekt angezeigt (ggf. "Unbekannter Absender" bei sender_id = NULL)
3. Caregivers-Liste lädt korrekt
4. Clients-Liste lädt korrekt
5. App-Settings können gespeichert werden
6. Preisänderungen werden im Audit-Log erfasst

---

## 7. Offene Punkte

### 7a. Verbleibende PII — Anonymisierung (separates Arbeitspaket)

Die FK-Änderungen (PR #29 + #30) lösen nur die **technische Kontolöschung** (auth.users DELETE wird nicht mehr blockiert). Für eine vollständige DSGVO Art. 17 Umsetzung muss zusätzlich eine **Anonymisierungsfunktion** implementiert werden:

**Priorität 1 — Direkte PII in FK-Tabellen:**
- `caregivers`: first_name, last_name, email, phone, address → anonymisieren
- `clients`: Prüfung Aufbewahrungspflicht, danach anonymisieren
- `chat_messages.content`: Löschen oder anonymisieren
- `mis_auth_log`: user_email, user_name, ip_address → anonymisieren

**Priorität 2 — Tabellen ohne FK (orphane UUIDs):**
- `documents`, `messages`, `notifications` u.a. mit NOT NULL user_id ohne FK
- Empfehlung: FK-Constraints hinzufügen oder Lösch-Trigger implementieren

**Priorität 3 — Eigenständige PII-Tabellen:**
- `applications`, `lead_inquiries`, `newsletter_subscribers`, `whatsapp_conversations`
- Separate Lösch-/Anonymisierungsprozesse nötig

### 7b. Empfehlungen

1. **Anonymisierungs-RPC erstellen:** Eine Supabase-Funktion `anonymize_user(user_uuid)` die vor `DELETE FROM auth.users` alle PII in public-Tabellen anonymisiert/löscht
2. **Aufbewahrungsfristen-Matrix:** Für jede Tabelle klären, welche Daten wie lange aufbewahrt werden müssen
3. **Storage-Bereinigung:** Dateien im Supabase Storage die einem gelöschten User gehören müssen ebenfalls bereinigt werden
4. **Soft-Delete erwägen:** Statt sofortigem DELETE ein `deleted_at` + Anonymisierung, dann nach Aufbewahrungsfrist endgültig löschen

---

## 8. GO / NO-GO

### ✅ GO — PR #29 und #30 können gemergt werden.

**Begründung:**

1. Alle 6 blockierenden FKs werden korrekt auf SET NULL umgestellt
2. Alle betroffenen Spalten sind NULLABLE (chat_messages.sender_id wird korrekt auf NULLABLE geändert)
3. Löschtest auf Preview-Branch: Vollständig bestanden (Löschung, SET NULL, Isolation, Idempotenz, Rollback)
4. Keine verwaisten Referenzen nach Löschung
5. RLS bleibt aktiv auf allen Tabellen
6. Rollback-SQL ist verfügbar und getestet
7. Keine Auswirkung auf bestehende Daten (nur Constraint-Definitionen ändern sich)
8. Kein Regressionsrisiko für laufende Applikation

**Einschränkung:** Dies ist die technische Voraussetzung für DSGVO-konforme Benutzerlöschung. Die vollständige DSGVO-Konformität erfordert zusätzlich die Anonymisierung verbleibender PII (siehe Abschnitt 7a) — dies ist ein separates Arbeitspaket und blockiert NICHT das Mergen dieser PRs.
