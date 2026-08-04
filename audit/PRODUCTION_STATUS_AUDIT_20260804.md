# Alltagsengel — Vollständiger Produktions-Status-Audit

**Datum:** 04.08.2026  
**Typ:** READ-ONLY Gesamtstatus-Audit  
**Prüfer:** Automatisiert (Claude Agent)  
**Projekt:** alltagsengel.care | Supabase `nnwyktkqibdjxgimjyuq` | GitHub `YusufFerhatDemir/alltagsengel`

---

## 1. GitHub-Status

### 1a. main-Branch
- **Letzter Commit (remote):** `3e4bdd8` — „audit: E2E-Report mit Browser-Tests, Merge und Cleanup aktualisiert"
- **Letzter merge:** PR #28 (Delete-Button für Dokumente)
- **CI-Status:** ✅ Alle Runs grün (CI #37 + pages-build-deployment #675, beide heute 17:28)

### 1b. Offene PRs (4 Stück, alle alt vom März 2026)
| # | Titel | Status | Datum |
|---|-------|--------|-------|
| #21 | Claude/check status 4 ig ej | ✅ CI grün | 02.03.2026 |
| #20 | Post-merge security check | ✅ CI grün | 02.03.2026 |
| #19 | Development environment setup | ❌ CI fehlgeschlagen | 01.03.2026 |
| #18 | Uzman pazarlama önerileri | ❌ CI fehlgeschlagen | 01.03.2026 |

**Bewertung:** Alle 4 PRs sind >5 Monate alt und vermutlich obsolet. Sollten geschlossen werden.

### 1c. Offene Issues
- **0** offene Issues.

### 1d. CI/CD
- **Workflows:** `CI` (typecheck, lint, tests, build) + `pages-build-deployment`
- **Letzter CI-Run:** ✅ grün, 5m 5s
- **Deployment:** Vercel (automatisch via Push auf `main`)

### 1e. Nicht-gemergte Remote-Branches (7 Stück)
| Branch | Herkunft |
|--------|----------|
| `origin/claude/check-status-4IgEJ` | Agent |
| `origin/cleanup/bookings-policy-consolidation` | Cleanup |
| `origin/cursor/development-environment-setup-8be8` | Cursor |
| `origin/cursor/merged-prs-security-audit-6914` | Cursor |
| `origin/cursor/page-views-migration-and-ui-9915` | Cursor |
| `origin/cursor/post-merge-security-check-a007` | Cursor |
| `origin/cursor/uzman-pazarlama-nerileri-f2ce` | Cursor |

**Bewertung:** Altlasten-Branches. Sollten geprüft und ggf. gelöscht werden.

### 1f. Lokaler Status
- **Aktueller Branch:** `fix/documents-delete-and-upload-e2e` (3 Commits ahead von main)
- **13 lokale Branches** neben `main`, davon mehrere `claude/*`-Branches
- **Uncommitted changes:** `audit/DELETE_AND_15MB_E2E_REPORT.md` (modified)

---

## 2. Vercel-Produktion & Live-Site

### 2a. Live-Site-Status
| Seite | Status | Bemerkung |
|-------|--------|-----------|
| `alltagsengel.care/` (Startseite) | ✅ Lädt korrekt | Logo, CTA, Navigation sichtbar |
| `alltagsengel.care/auth/login` | ✅ Lädt korrekt | E-Mail/Passwort-Felder, Brute-Force-Schutz |
| `alltagsengel.care/auth/register` | ✅ Vorhanden | Rollen-Auswahl (kunde/engel/fahrer), Prefill von LP |

### 2b. Deployment
- **Plattform:** Vercel (via GitHub Push-Trigger)
- **Letzter Deploy:** Commit `3e4bdd8` (heute, 04.08.2026)
- **Build:** Next.js mit Sentry, Bundle-Analyzer (optional), Turbopack
- **Runtime-Logs:** Nicht über MCP abrufbar (API-Fehler)

### 2c. Konfiguration (next.config.ts)
- **Image-Optimierung:** AVIF → WebP Fallback, 31 Tage Cache
- **External Packages:** `ssh2`, `ssh2-sftp-client` (für EDIFACT/SFTP)
- **www → non-www Redirect:** Konfiguriert
- **Sentry:** Integriert

---

## 3. Supabase-Produktion

### 3a. Datenbankzustand
- **Tabellen (public):** 126
- **Migrationen:** 95 (letzte: `20260804122544_create_documents_table`)
- **Edge Functions:** 1 (`velora-mockup`, ACTIVE)
- **Cron-Schema:** ❌ Nicht vorhanden (`cron.job` existiert nicht)

### 3b. Auth-Statistik
| Metrik | Wert |
|--------|------|
| Gesamtnutzer | 56 |
| Bestätigt (email_confirmed_at) | 56 |
| Unbestätigt | 0 |

### 3c. Top-Tabellen nach Zeilenanzahl
| Tabelle | Zeilen (approx.) |
|---------|-------------------|
| page_views | 5.882 |
| visitor_locations | 3.374 |
| visitors | 3.046 |
| mis_auth_log | 229 |
| notifications | 137 |
| profiles | 55 |
| service_records | 31 |
| conversions | 30 |
| leistungspreise | 24 |
| lead_inquiries | 19 |
| bookings | 10 |
| angels | 13 |
| invoices | 5 |

### 3d. RLS-Status
- ✅ **Alle 126 public-Tabellen haben RLS aktiviert**
- ✅ **Alle Tabellen haben mindestens 1 Policy** (keine "locked out"-Tabellen)
- **Policy-Verteilung (Top):** profiles (13), krankenfahrten (10), care_notes (9), service_records (7)

### 3e. Org-Fence (RESTRICTIVE Policies)
- **66 Tabellen** haben eine `_org_fence` RESTRICTIVE Policy
- **60 Tabellen OHNE Org-Fence**, darunter:

**Erwartungsgemäß ohne Org-Fence (öffentlich/global):**
- `page_views`, `visitors`, `visitor_locations` (Analytics)
- `newsletter_subscribers`, `conversions` (Marketing)
- `login_rate_limits`, `account_deletion_tokens` (System)
- `organizations`, `organization_members`, `organization_subscriptions` (Meta)
- `profiles` (hat eigene user-basierte RLS)
- `app_settings`, `content_blocks` (Konfiguration)
- `kf_*`-Tabellen (Krankenfahrt-Pricing, global)

**Potenziell problematisch ohne Org-Fence:**
- `angel_reviews` — Bewertungen könnten org-übergreifend sichtbar sein
- `angels` — Engel-Profile könnten org-übergreifend sichtbar sein
- `chat_messages` — Chat-Nachrichten ohne Mandantentrennung
- `messages` — Nachrichten ohne Mandantentrennung
- `notifications` — Benachrichtigungen ohne Mandantentrennung
- `mis_ai_conversations` — KI-Gespräche ohne Org-Fence
- `mis_auth_log`, `mis_audit_log` — Auth/Audit-Logs ohne Org-Fence
- `mis_dataroom_access`, `mis_dataroom_sections` — Dataroom ohne Org-Fence
- `mis_document_categories` — Dokumentkategorien ohne Org-Fence
- `mis_privacy_*` — Datenschutz-Tabellen ohne Org-Fence

### 3f. Storage
| Bucket | Public | Größenlimit | MIME-Filter |
|--------|--------|-------------|-------------|
| abrechnung | ❌ privat | - | - |
| documents | ❌ privat | - | - |
| mis-documents | ❌ privat | - | - |
| service-proofs | ❌ privat | - | - |
| verordnungen | ❌ privat | - | - |

✅ Alle Buckets sind privat — gut für DSGVO.

**Storage-Policies (12 Stück):**
- `documents`: Admin (ALL), User (read own, upload own, delete own)
- `abrechnung`: Admin (SELECT/INSERT/UPDATE/DELETE)
- `service-proofs`: Admin (ALL), Service (ALL)
- `verordnungen`: Admin (ALL), Service (ALL)

⚠️ **Fehlend:** `file_size_limit` und `allowed_mime_types` sind auf allen Buckets `null` — kein serverseitiger Größen-/Typ-Filter.

### 3g. SECURITY DEFINER Funktionen (20 Stück)
| Funktion | Kritisch? |
|----------|-----------|
| `is_admin()` | ⚠️ Kern-Auth-Funktion |
| `is_org_member()` | ⚠️ Org-Fence-Basis |
| `current_org_id()` | ⚠️ Org-Fence-Basis |
| `has_org_role()` | ⚠️ Org-Fence-Basis |
| `handle_new_user()` | Profil-Erstellung |
| `prevent_role_escalation()` | Sicherheits-Trigger |
| `enforce_booking_status_transition()` | Workflow-Schutz |
| `get_emergency_info_with_pin()` | Notfall-Feature |
| `get_engel_cards()` | Engel-Suche |
| `cleanup_old_rate_limits()` | Wartung |
| `audit_*` (5 Stück) | Audit/RLS-Prüfung |
| `is_internal_staff()`, `is_own_caregiver()`, `is_own_client()` | Auth-Helpers |
| `is_profile_soft_deleted()` | DSGVO Soft-Delete |

### 3h. Trigger (32 Stück)
**Wichtige Trigger:**
- `trg_booking_status_transition` (bookings, BEFORE UPDATE) — Workflow-Validierung
- `trg_prevent_role_escalation` / `_insert` (profiles) — Sicherheit
- `trg_onboarding_new_kunde` (profiles, BEFORE INSERT) — Auto-Onboarding
- `trg_generate_referral_code` (profiles, BEFORE INSERT) — Referral
- `trg_audit_logs_no_delete` / `_no_update` (audit_logs) — Immutability
- `trg_invoices_no_finalized_edit` (invoices) — Rechnungsschutz
- `trg_service_records_no_finalized_edit` (service_records) — LN-Schutz
- `trg_monthly_closings_no_reopen` (monthly_closings) — Monatsabschluss-Schutz
- `trg_update_budget_on_service_record` (service_records, AFTER I/U/D) — Budget-Automatik

### 3i. Foreign Keys ohne Index (Performance-Risiko)
**79 FK-Spalten ohne dedizierten Index** (Auswahl der kritischsten):

| Tabelle | Spalte | Risiko |
|---------|--------|--------|
| `service_records` | `client_id`, `caregiver_id` | HOCH — JOIN-Tabelle, Abrechnung |
| `bookings` | `care_recipient_id` | MITTEL |
| `invoices` | `client_id` | HOCH — Rechnungsabfrage |
| `invoice_items` | `invoice_id`, `service_record_id` | HOCH |
| `budget_transactions` | `client_id`, `budget_id`, `service_record_id` | HOCH |
| `monthly_closings` | `invoice_id`, `closed_by` | MITTEL |
| `assignments` | `caregiver_id`, `client_id` | MITTEL |
| `krankenfahrten` | `customer_id`, `provider_id`, `fahrzeug_id` | MITTEL |
| `caregivers` | `user_id` | HOCH |
| `clients` | `user_id` | HOCH |

### 3j. Postgres-Fehler-Logs (letzte 24h)
| Fehler | Schwere | Auswirkung |
|--------|---------|------------|
| `relation "cron.job" does not exist` | ERROR | pg_cron Extension nicht aktiviert |
| `update or delete on table "users" violates FK constraint "mis_auth_log_user_id_fkey"` | ERROR | User-Löschung blockiert durch Auth-Log FK |

### 3k. Auth-Logs (letzte 24h)
- **Wiederkehrender Fehler:** `403: User from sub claim in JWT does not exist` — mehrere Requests von `alltagsengel.care` an `/user`. Ursache: Gelöschte User mit noch gültigen JWTs im Browser. `requireUser()`-Retry-Logik fängt das clientseitig ab.

---

## 4. Funktionale Kernabläufe

### 4a. Routen-Übersicht
- **Gesamte page.tsx:** ~105 Seiten
- **API-Routen:** ~58 route.ts-Dateien
- **Rollenportale:** `/kunde/*` (18), `/engel/*` (12), `/fahrer/*` (5), `/admin/*` (32), `/mis/*` (16)
- **Öffentliche Seiten:** Blog (~30), Landing Pages, Investor, Info-Seiten

### 4b. Auth-System
| Feature | Status | Beweis |
|---------|--------|--------|
| Registrierung Kunde | ✅ | `app/auth/register/page.tsx`, Rollen-Whitelist `['kunde','engel','fahrer']` |
| Registrierung Engel | ✅ | `app/engel/register/page.tsx` + `app/auth/register?role=engel` |
| Registrierung Fahrer | ✅ | `app/fahrer/register/page.tsx` |
| Login | ✅ | `app/auth/login/page.tsx`, Brute-Force-Schutz (5 Versuche / 15 Min) |
| Passwort-Reset | ✅ | `app/auth/forgot-password` → `app/auth/reset-password`, Recovery-Flow im Callback |
| Callback / Code-Exchange | ✅ | `app/auth/callback/route.ts` mit Recovery-Priorisierung |
| Session-Retry | ✅ | `lib/supabase/require-session.ts` (3 Versuche, Exponential Backoff) |
| Admin-Auth-Guard | ✅ | `app/admin/layout.tsx` — Rollen-Check via `app_metadata.role` |
| Rollen-Escalation-Schutz | ✅ | DB-Trigger `prevent_role_escalation`, Signup-Whitelist, Callback-Whitelist |

**⚠️ Kein Next.js Middleware vorhanden** (`middleware.ts` existiert nicht im Projektroot). Auth-Guards laufen ausschließlich clientseitig in Layout-Komponenten und per `requireUser()`. Serverseitige Route-Protection fehlt.

### 4c. Dokumente (kürzlich implementiert)
| Feature | Status | Beweis |
|---------|--------|--------|
| Upload (Kunde) | ✅ | `app/kunde/dokumente/page.tsx`, `lib/upload-document.ts` |
| Upload (Engel) | ✅ | `app/engel/dokumente/page.tsx` |
| Delete (DSGVO Art. 17) | ✅ | `deleteDocument()` in `lib/upload-document.ts`, PR #28 |
| Feature-Guard | ✅ | `checkDocumentsTableExists()` — graceful degradation |
| 15 MB Limit | ✅ | Client-Check + Upload-Timeout 60s |
| MIME-Validierung | ✅ | Client: `image/*`, `application/pdf` |
| Signed URLs | ✅ | Private Bucket, 7-Tage-signierte URLs |
| RLS | ✅ | 6 Policies + Org-Fence |
| Storage-Policies | ✅ | Read own, Upload own, Delete own, Admin all |

### 4d. Buchungen
| Feature | Status | Beweis |
|---------|--------|--------|
| Erstellen | ✅ | `app/kunde/buchen/[id]/page.tsx` |
| Annehmen/Ablehnen | ✅ | `app/api/bookings/respond/route.ts` |
| Status-Transitions | ✅ | DB-Trigger `enforce_booking_status_transition` |
| Benachrichtigung | ✅ | `app/api/bookings/notify/route.ts` |
| Status in DB | ✅ | 6 accepted, 3 cancelled, 1 completed |

### 4e. Nachrichten/Benachrichtigungen
| Feature | Status | Beweis |
|---------|--------|--------|
| Chat | ✅ | `chat_messages` Tabelle, `/kunde/chat/*`, `/engel/chat/*` |
| Push (Web) | ✅ | `lib/push.ts` (web-push + VAPID) |
| Push (FCM) | ✅ | `lib/fcm.ts`, `fcm_tokens` Tabelle |
| E-Mail | ✅ | `lib/notifications.ts` (Resend API) |
| WhatsApp | ✅ | `app/api/whatsapp/webhook/route.ts`, `whatsapp_conversations` |
| In-App Bell | ✅ | `components/NotificationBell.tsx` |

### 4f. Admin-Bereich
- **Dashboard:** ✅ `app/admin/dashboard/page.tsx`
- **Nutzerverwaltung:** ✅ `app/admin/users/page.tsx`
- **Caregivers/Clients:** ✅ Detail-Seiten mit `[id]`
- **Bookings/Schedule:** ✅ `app/admin/bookings/`, `app/admin/schedule/`
- **Verordnungen:** ✅ `app/admin/verordnungen/page.tsx`
- **Org-Switcher:** ✅ `components/OrgSwitcher.tsx`

---

## 5. Abrechnung & Pflegeprozesse

### 5a. Leistungsnachweis
| Feature | Status | Beweis |
|---------|--------|--------|
| Service Records (CRUD) | ✅ | `app/admin/records/`, `lib/admin/service-records.ts`, 31 Records in DB |
| Leistungsnachweis-PDF | ✅ | `lib/abrechnung/leistungsnachweis-pdf.ts` — kassenkonformes A4-HTML |
| Leistungsnachweis-Upload | ✅ | `app/admin/leistungsnachweis-upload/`, `app/api/native/leistungsnachweis-upload/` |
| Leistungsnachweis pro Verordnung | ✅ | `app/admin/leistungsnachweis/[verordnung_id]/` |
| Kunde-Ansicht | ✅ | `app/kunde/leistungsnachweis/page.tsx` |
| Status-Workflow | ✅ | 3 draft, 13 signed, 15 invoiced |

### 5b. Unterschriften
| Feature | Status | Beweis |
|---------|--------|--------|
| service_signatures Tabelle | ✅ | Spalten: signer_role, signer_name, signature_image, GPS, device_info |
| Native Signatur-API | ✅ | `app/api/native/signatures/route.ts` |
| MIS Signaturen | ✅ | `app/mis/signatures/page.tsx`, `mis_signature_requests` Tabelle |
| Handzeichen (Initials) | ✅ | `caregiver_initials_history` Tabelle |

### 5c. Budget / Entlastungsbetrag
| Feature | Status | Beweis |
|---------|--------|--------|
| client_budgets Tabelle | ✅ | year, monthly_amount, annual_amount, carryover, used_amount, private_amount |
| §42a Kombination | ✅ | `combined_annual_amount`, `combined_type`, `requires_application` |
| Budget-Transactions | ✅ | Tabelle mit client_id, budget_id, service_record_id, amount |
| Budget-Auto-Update | ✅ | Trigger `trg_update_budget_on_service_record` (AFTER I/U/D) |
| Kunden-Budget-Ansicht | ✅ | `app/kunde/budget/page.tsx` |
| Admin-Budget | ✅ | `app/admin/budgets/page.tsx` |
| Budgetrechner | ✅ | `app/budgetrechner/page.tsx` |

### 5d. Monatsabschluss
| Feature | Status | Beweis |
|---------|--------|--------|
| Monatsabschluss-Logik | ✅ | `lib/abrechnung/monatsabschluss.ts` — Vollständige Implementierung |
| Prüfungen | ✅ | Unterschrift, Abtretungserklärung, Bewilligungsstatus |
| Kostenträger-Gruppierung | ✅ | Nach Kasse/Sozialamt sortiert |
| monthly_closings Tabelle | ✅ | Ampel-System, total_records, total_amount, budget_used |
| No-Reopen Trigger | ✅ | `trg_monthly_closings_no_reopen` |
| Admin-Seite | ✅ | `app/admin/monatsabschluss/` + `[clientId]` |
| Rechnungserstellung | ✅ | `app/admin/rechnungserstellung/page.tsx` |

### 5e. Elektronische Abrechnung (GKV)
| Feature | Status | Beweis |
|---------|--------|--------|
| EDIFACT-Generator | ✅ | `lib/abrechnung/edifact-generator.ts` |
| EDIFACT-Segments | ✅ | `lib/abrechnung/edifact-segments.ts` |
| EDIFACT-Validator | ✅ | `lib/abrechnung/edifact-validator.ts` |
| SECON (Verschlüsselung) | ✅ | `lib/abrechnung/secon.ts` — CMS SignedData, AES-256, RSAES-OAEP |
| ITSG-Zertifikate | ✅ | `app/api/admin/abrechnung/zertifikat/`, Tabelle `abrechnung_zertifikate` |
| SFTP-Transport | ✅ | `app/api/admin/abrechnung/sftp-test/`, `sftp-key/` |
| Abrechnungsläufe | ✅ | Tabelle mit Status, EDIFACT-URL, Antwort-Tracking |
| Admin-Einstellungen | ✅ | `app/admin/abrechnung/einstellungen/` |
| Zahlungskontrolle | ✅ | `app/admin/zahlungskontrolle/page.tsx` |
| Leistungspreise | ✅ | Tabelle mit Bundesland, Leistungsart, gueltig_ab/bis |

### 5f. Schema-Duplikate (pflegegrad / care_level)
| Tabelle | Spalte | Typ |
|---------|--------|-----|
| `clients` | `pflegegrad` | ✅ |
| `clients` | `care_level` | ⚠️ Duplikat |
| `clients` | `care_level_since` | ⚠️ Duplikat |
| `care_recipients` | `pflegegrad` | ✅ |
| `hygienebox_orders` | `pflegegrad` | ✅ |
| `profiles` | (kein pflegegrad) | — bereinigt (PR #24) |

**Bewertung:** `clients.pflegegrad` und `clients.care_level` sind Duplikate. PR #24 hat das in `profiles` bereinigt, aber in `clients` existiert die Dualität noch.

---

## A. Was vollständig funktioniert

1. **Live-Site & Deployment** — Vercel-Deploy grün, Startseite + Login + Register laden fehlerfrei.
2. **CI/CD-Pipeline** — Typecheck, Lint, Tests, Build alle grün. Automatischer Deploy via Push.
3. **Auth-System** — Registrierung (3 Rollen), Login (Brute-Force-Schutz), Passwort-Reset, Session-Retry, Recovery-Flow, Rollen-Escalation-Schutz.
4. **RLS** — 126/126 Tabellen mit RLS aktiviert. 66 Tabellen mit Org-Fence. Keine Tabelle ohne Policy.
5. **Dokumente** — Upload, Download, Delete (DSGVO Art. 17), Feature-Guard, 15 MB Limit, Signed URLs.
6. **Buchungssystem** — Erstellen, Annehmen/Ablehnen, Status-Transitions (DB-Trigger), Benachrichtigungen.
7. **Service Records / Leistungsnachweis** — CRUD, Status-Workflow (draft → signed → invoiced), PDF-Generation.
8. **Unterschriften** — Digitale Signaturen mit GPS, Device-Info, Handzeichen-Historie.
9. **Budget-System** — §45b + §42a Kombination, automatische Aktualisierung via Trigger, Budgetrechner.
10. **Monatsabschluss** — Vollständige Implementierung mit Prüflogik, Kostenträger-Gruppierung, No-Reopen-Schutz.
11. **Elektronische Abrechnung** — EDIFACT-Generator, SECON-Verschlüsselung, SFTP-Transport, Zertifikat-Management.
12. **Nachrichten** — Chat, Web-Push, FCM, E-Mail (Resend), WhatsApp-Webhook, In-App-Bell.
13. **Storage** — 5 private Buckets mit RLS-Policies. Keine öffentlichen Buckets.
14. **Audit/Immutability** — `audit_logs` und `mis_audit_log` mit No-Delete/No-Update Triggers.
15. **Referral-System** — Auto-Generated Codes, Referral-Tracking.
16. **Multi-Mandant** — `organizations` + `organization_members`, `current_org_id()` RPC, 66 Org-Fence Policies.
17. **Krankenfahrten** — Vollständiges Modul (Buchung, Pricing, Reviews, Fahrer-Portal).
18. **MIS (Managementsystem)** — 16 Module (Analytics, Quality, Finance, CRM, etc.).

---

## B. Was nur teilweise funktioniert

1. **Middleware-basierter Auth-Schutz**
   - **Was geht:** Client-seitige Guards in Layout-Komponenten (`requireUser()`, `AdminAuthGuard`)
   - **Was fehlt:** Kein `middleware.ts` im Projektroot — keine serverseitige Route-Protection. Geschützte API-Routen sind nur über `requireUser()` im Client und `createAdminClient()` serverseitig geschützt.
   - **Risiko:** MITTEL — ein direkter API-Call ohne Auth-Cookie an geschützte Routen könnte durchgehen, wenn die Route selbst keine Session-Prüfung hat.

2. **Org-Fence Abdeckung**
   - **Was geht:** 66 der ~90 mandantenrelevanten Tabellen haben Org-Fence
   - **Was fehlt:** `chat_messages`, `messages`, `notifications`, `angel_reviews`, `angels`, `mis_ai_conversations`, `mis_dataroom_*`, `mis_document_categories`, `mis_privacy_*` — diese haben RLS, aber keine Mandantentrennung.
   - **Risiko:** NIEDRIG bis MITTEL — bei Einzelmandant kein Problem, wird kritisch bei Multi-Mandant-Betrieb.

3. **Storage-Bucket-Limits**
   - **Was geht:** Alle Buckets privat, RLS-Policies vorhanden
   - **Was fehlt:** `file_size_limit` und `allowed_mime_types` auf Bucket-Ebene sind `null`
   - **Risiko:** NIEDRIG — Client-Check (15 MB, image/pdf) existiert, aber serverseitiger Bucket-Level-Filter fehlt.

4. **User-Löschung (DSGVO)**
   - **Was geht:** `account_deletion_tokens` Tabelle, `is_profile_soft_deleted()`, `app/api/user/delete/` + `/undo/`
   - **Was fehlt:** `mis_auth_log_user_id_fkey` blockiert User-Löschung aus `auth.users` (Postgres-Error-Log bestätigt)
   - **Risiko:** HOCH — DSGVO-Löschung scheitert an FK-Constraint.

---

## C. Was nicht funktioniert

1. **pg_cron nicht aktiviert**
   - **Fehler:** `relation "cron.job" does not exist`
   - **Beweis:** Postgres-Error-Log, SQL-Query bestätigt
   - **Auswirkung:** Geplante Cron-Jobs (Rate-Limit-Cleanup, etc.) laufen nicht in der DB. Stattdessen existieren API-Cron-Routen (`/api/cron/drip`, `/api/cron/indexnow`, `/api/cron/review-request`).

2. **Auth-Log FK blockiert User-Deletion**
   - **Fehler:** `update or delete on table "users" violates foreign key constraint "mis_auth_log_user_id_fkey"`
   - **Beweis:** Postgres-Error-Log (heute)
   - **Auswirkung:** DSGVO-konforme Nutzer-Löschung scheitert

3. **Stale JWTs nach User-Löschung**
   - **Fehler:** `403: User from sub claim in JWT does not exist` (Auth-Logs, mehrfach heute)
   - **Auswirkung:** Gelöschte/deaktivierte User mit cached Tokens lösen 403-Fehler aus. Client-Retry-Logik fängt das ab, aber es ist ein UX-Problem.

---

## D. Offene Sicherheitsrisiken

| # | Risiko | Schwere | Beweis |
|---|--------|---------|--------|
| D1 | **Kein Next.js Middleware** — keine serverseitige Route-Protection | MITTEL | `middleware.ts` existiert nicht |
| D2 | **Chat/Nachrichten ohne Org-Fence** — Bei Multi-Mandant org-übergreifend lesbar | MITTEL | `chat_messages`, `messages`, `notifications` ohne `_org_fence` Policy |
| D3 | **Storage Bucket ohne Limits** — kein serverseitiger Größen-/Typ-Filter | NIEDRIG | Alle 5 Buckets: `file_size_limit=null`, `allowed_mime_types=null` |
| D4 | **Login-Seite zeigt Admin/MIS-Buttons** — Einladung für Angreifer | NIEDRIG | Screenshot Login-Seite: „ADMIN" + „MIS PORTAL" Buttons sichtbar |
| D5 | **79 FK-Spalten ohne Index** — bei Last können JOINs langsam werden, was zu Timeout-basierten Info-Leaks führen kann | NIEDRIG | SQL-Abfrage bestätigt |

---

## E. Offene Datenbank- und Architekturprobleme

| # | Problem | Schwere | Beweis |
|---|---------|---------|--------|
| E1 | **`clients.pflegegrad` + `clients.care_level` Duplikat** | MITTEL | `information_schema.columns` — beide Spalten existieren parallel |
| E2 | **79 Foreign Keys ohne Index** | MITTEL | SQL-Abfrage (service_records.client_id, invoices.client_id, etc.) |
| E3 | **pg_cron nicht aktiviert** | NIEDRIG | `cron.job` existiert nicht |
| E4 | **mis_auth_log FK blockiert User-Löschung** | HOCH | Postgres-Error-Log |
| E5 | **126 Tabellen für eine Plattform in diesem Stadium** — potenzieller Schema-Bloat | INFO | 55 Profiles, 10 Bookings — sehr geringe Nutzung vs. sehr große Schema-Komplexität |
| E6 | **Kein Middleware.ts** — Auth-Prüfung nur clientseitig | MITTEL | Dateisystem bestätigt |

---

## F. Fehlende Funktionen

| # | Feature | Referenz im Code | Status |
|---|---------|-----------------|--------|
| F1 | **EDIFACT tatsächliche Übermittlung** | `abrechnungslaeufe.uebermittelt_am` immer NULL | Generierung ✅, Versand ❌ ungetestet |
| F2 | **OCR für Verordnungen** | `app/api/admin/ocr/route.ts`, `ocr_results` Tabelle | Route existiert, Nutzung unklar |
| F3 | **Offline-Queue Sync** | `offline_queue`, `sync_conflicts`, `action_fingerprints` | Tabellen existieren, 0 Zeilen |
| F4 | **Cron-basierte Aufgaben** | `cleanup_old_rate_limits()` RPC existiert | pg_cron nicht aktiv, API-Cron als Workaround |
| F5 | **Stripe-Integration** | `app/api/stripe/*`, `organization_subscriptions` | Routen existieren, Nutzung unklar |
| F6 | **Native App (Capacitor/Tauri)** | `cap:sync`, `tauri:build` Scripts | Build-Scripts vorhanden, Release-Status unklar |

---

## G. Priorisierung

| # | Problem | Priorität | Bereich | Beweis |
|---|---------|-----------|---------|--------|
| 1 | mis_auth_log FK blockiert DSGVO User-Löschung | **BLOCKER** | Datenbank/DSGVO | Postgres-Error-Log |
| 2 | Kein Next.js Middleware (serverseitiger Auth-Schutz fehlt) | **HOCH** | Sicherheit | middleware.ts fehlt |
| 3 | Chat/Nachrichten/Notifications ohne Org-Fence | **HOCH** | Sicherheit/Multi-Mandant | pg_policies Query |
| 4 | `clients.pflegegrad` / `care_level` Duplikat bereinigen | **MITTEL** | Schema-Hygiene | information_schema |
| 5 | Storage-Buckets: file_size_limit + allowed_mime_types setzen | **MITTEL** | Sicherheit | storage.buckets Query |
| 6 | 79 FK-Spalten indizieren (kritischste zuerst) | **MITTEL** | Performance | SQL-Abfrage |
| 7 | 4 alte PRs (#18–#21) schließen | **NIEDRIG** | Hygiene | GitHub PRs |
| 8 | 7 nicht-gemergte Remote-Branches löschen | **NIEDRIG** | Hygiene | git branch -r --no-merged |
| 9 | pg_cron aktivieren oder API-Cron formalisieren | **NIEDRIG** | Infrastruktur | cron.job fehlt |
| 10 | Login-Seite: Admin/MIS-Buttons ausblenden | **NIEDRIG** | UX/Security | Screenshot |
| 11 | Stale JWTs nach User-Löschung behandeln | **NIEDRIG** | Auth/UX | Auth-Logs |

---

## H. Detailbeweis

### H1. mis_auth_log FK-Blocker
- **Datei/Tabelle:** `mis_auth_log.user_id_fkey → auth.users.id`
- **Fehler:** `update or delete on table "users" violates foreign key constraint`
- **Fix:** FK auf `ON DELETE SET NULL` oder `ON DELETE CASCADE` ändern, oder Auth-Log vor User-Löschung anonymisieren.

### H2. Fehlende Middleware
- **Geprüft:** `find . -name "middleware.ts"` — 0 Ergebnisse
- **Aktuell:** Auth-Guards nur in `app/admin/layout.tsx` (clientseitig), `lib/supabase/require-session.ts`
- **Risiko:** Direkte Navigation zu `/admin/*` oder `/kunde/*` ohne Auth-Cookie zeigt kurz die Seite bevor Client-Redirect greift.

### H3. Org-Fence Lücken
- **60 Tabellen ohne `_org_fence`** — die meisten sind erwartungsgemäß (Analytics, System, Meta)
- **Kritisch:** `chat_messages`, `messages`, `notifications`, `mis_ai_conversations` — diese enthalten nutzerspezifische Daten und sollten bei Multi-Mandant org-geschützt sein.

### H4. Schema-Duplikat
- `clients.pflegegrad` (INT) + `clients.care_level` (Text?) — Code sollte auf eine Spalte konsolidiert werden.

### H5. Storage-Limits
- Alle 5 Buckets: `file_size_limit = null`, `allowed_mime_types = null`
- Client-Check in `lib/upload-document.ts` (`MAX_FILE_SIZE_MB = 15`, `ALLOWED_MIME_PREFIXES = ['image/', 'application/pdf']`) existiert, aber kann umgangen werden.

---

## I. Empfohlenes nächstes Arbeitspaket

### Priorität 1 — DSGVO-Blocker (mis_auth_log FK)
FK `mis_auth_log_user_id_fkey` auf `ON DELETE SET NULL` ändern, damit User-Löschung nicht blockiert wird. Auth-Log-Einträge bleiben anonymisiert erhalten (Audit-Anforderung).

### Priorität 2 — Next.js Middleware einführen
`middleware.ts` im Projektroot mit Session-Check für `/admin/*`, `/kunde/*`, `/engel/*`, `/fahrer/*`, `/mis/*`. Redirect zu `/auth/login` wenn keine gültige Session.

### Priorität 3 — Org-Fence für Chat/Messages/Notifications
RESTRICTIVE Policies für `chat_messages`, `messages`, `notifications` hinzufügen. Vorbereitung für Multi-Mandant-Betrieb.

### Priorität 4 — Storage-Bucket-Limits setzen
`file_size_limit` (15 MB) und `allowed_mime_types` (image/*, application/pdf) auf allen 5 Buckets serverseitig konfigurieren.

### Priorität 5 — FK-Indizes (kritischste)
Indizes für die 10 meistgenutzten FK-Spalten anlegen: `service_records.client_id`, `service_records.caregiver_id`, `invoices.client_id`, `invoice_items.invoice_id`, `budget_transactions.client_id`, `clients.user_id`, `caregivers.user_id`, `assignments.caregiver_id`, `assignments.client_id`, `krankenfahrten.customer_id`.

---

*Audit abgeschlossen am 04.08.2026, 19:15 Uhr. Keine Änderungen an Code, Datenbank oder Produktion vorgenommen.*
