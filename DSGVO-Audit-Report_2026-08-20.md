# DSGVO-Compliance & Audit-Logging Report

**Datum:** 20.08.2026
**Prüfer:** Automatisierter Audit via Supabase SQL-Analyse
**Projekte:** Alltagsengel (nnwyktkqibdjxgimjyuq) · ChairMatch (pwdbjqfpgumyfktbfswg)
**Methodik:** Direkte SQL-Abfragen auf Datenbankebene — keine Annahmen, nur geprüfte Fakten.

---

## Zusammenfassung der Risikobewertung

| Prüfpunkt | Alltagsengel | ChairMatch |
|---|---|---|
| 1. Audit-Tabellen vorhanden | ✅ LOW | ⚠️ HIGH |
| 2. Unveränderbarkeit Audit | ⚠️ MEDIUM | 🔴 HIGH |
| 3. DSGVO-Löschkonzept | ⚠️ MEDIUM | 🔴 HIGH |
| 4. Einwilligungen / Consent | 🔴 HIGH | ⚠️ MEDIUM |
| 5. Datenminimierung | 🔴 HIGH | ⚠️ MEDIUM |
| 6. Aufbewahrungsfristen | ⚠️ MEDIUM | 🔴 HIGH |
| 7. Zugriffsprotokollierung | ✅ LOW | 🔴 HIGH |
| 8. DSFA (Datenschutz-Folgenabschätzung) | 🔴 HIGH | ✅ LOW |
| 9. AVV (Auftragsverarbeitung) | 🔴 HIGH | 🔴 HIGH |
| 10. C5-Attestation | 🔴 HIGH | 🔴 HIGH |

**Gesamtrisiko Alltagsengel: MEDIUM-HIGH** — Gute technische Basis, aber kritische Lücken bei Consent-Nachweisbarkeit, IP-Klartext-Speicherung und fehlender DSFA.

**Gesamtrisiko ChairMatch: HIGH** — Grundlegende DSGVO-Infrastruktur fehlt weitgehend.

---

## 1. Audit-Tabellen und Logging

### Alltagsengel — Risiko: LOW ✅

20+ dedizierte Audit-/Log-Tabellen nachgewiesen:

| Audit-Tabelle | Geloggte Felder | Bereich |
|---|---|---|
| `audit_logs` | entity_type, action, actor_id, actor_role, before/after (JSONB), ip_address | Allgemein |
| `billing_audit_trail` | entity_type, action, previous/new_state, reason, actor_ip, checksum | Abrechnung |
| `billing_tariff_audit` | aktion, alter/neuer_betrag, alter/neuer_status, benutzer, quelle | Tarife |
| `pflege_audit_log` | entitaet_typ/id, aktion, vorher/nachher, akteur_id, ip_adresse | Pflege |
| `personal_audit_log` | entitaet_typ, caregiver_id, aktion, vorher/nachher, grund, benutzer_rolle | Personal |
| `mis_audit_log` | entity_type, action, actor_id/name/role, ip_address, user_agent, target_id/email | MIS |
| `mis_auth_log` | user_id/email/name, action, ip_address, user_agent, location, device, status | Auth |
| `mis_privacy_audit_log` | action, entity_type, performed_by, details | Datenschutz |
| `service_record_audit_log` | action, changed_by, old/new_values, ip_address | Leistungsnachweise |
| `assignment_audit_log` | action, changed_by, old/new_values | Einsatzplanung |
| `akten_zugriff_log` | entitaet_typ/id, aktion, benutzer_id/rolle, details | Aktenzugriff |
| `angehoerigen_audit_log` | zugang_id, user_id, client_id, aktion, ip_adresse, user_agent | Angehörige |
| `signatur_audit_log` | dokument_id, signatur_id, aktion, akteur_id/name | Signaturen |
| `fhir_audit_log` | actor_id/name, action, resource_types, client_id, resource_count | FHIR |
| `kim_audit_log` | message_id, aktion, actor_id, details | KIM |
| `coach_audit_log` | coach_user_id, actor_user_id, tabelle, aktion, zeilen_id, geaenderte_felder | Coach |
| `wf_audit_log` | typ, entitaet_typ/id, aktion, akteur_id | Workflow |
| `ops_aktivitaetslog` | entitaet_typ/id, aktion, vorher/nachher, akteur_id, ip_adresse | Betrieb |
| `sync_audit_log` | user_id, queue_item_id, idempotency_key, entity_typ, aktion | Sync |
| `state_settings_audit` | bundesland, action, previous/new_state, actor_id, begruendung, checksum | Landesregeln |

**Bewertung:** Umfangreiche, domänenspezifische Audit-Infrastruktur. Before/After-Snapshots (JSONB), Actor-Tracking, IP-Logging vorhanden. billing_audit_trail und state_settings_audit nutzen Checksummen für Integritätsprüfung.

### ChairMatch — Risiko: HIGH 🔴

Nur 1 allgemeine Audit-Tabelle nachgewiesen:

| Audit-Tabelle | Geloggte Felder | Einträge |
|---|---|---|
| `audit_logs` | user_id, action, entity, entity_id, details (JSONB) | **1** |
| `error_logs` | message, stack, url, user_agent, ip, severity, component | Fehlerlog |
| `login_attempts` | ip, email, success | 28 |
| `visit_logs` | salon_id, page, ip_hash, user_agent, referrer | Besuchslog |
| `notification_log` | user_id, title, body, type, reference_id | Benachrichtigungen |

**Befund:** Die zentrale `audit_logs`-Tabelle enthält nur **1 einzigen Eintrag**. De facto findet kein systematisches Audit-Logging statt. Es fehlen: Actor-Rolle, IP-Adresse, Before/After-Snapshots. Kritische Geschäftsvorgänge (Buchungen, Zahlungen, Profiländerungen) werden nicht auditiert.

---

## 2. Unveränderbarkeit der Audit-Einträge

### Alltagsengel — Risiko: MEDIUM ⚠️

**Geschützte Tabellen (DELETE+UPDATE-Trigger aktiv):** 12 von 20

| Tabelle | DELETE-Trigger | UPDATE-Trigger |
|---|---|---|
| `audit_logs` | ✅ trg_audit_logs_no_delete | ✅ trg_audit_logs_no_update |
| `billing_audit_trail` | ✅ trg_audit_trail_no_delete | ✅ trg_audit_trail_no_update |
| `billing_tariff_audit` | ✅ trg_immutable_billing_tariff_audit_delete | ✅ trg_immutable_billing_tariff_audit_update |
| `mis_audit_log` | ✅ trg_mis_audit_log_no_delete | ✅ trg_mis_audit_log_no_update |
| `pflege_audit_log` | ✅ trg_pflege_audit_log_immutable_delete | ✅ trg_pflege_audit_log_immutable_update |
| `ops_aktivitaetslog` | ✅ trg_ops_log_immutable_delete | ✅ trg_ops_log_immutable_update |
| `wf_audit_log` | ✅ trg_wf_audit_immutable_delete | ✅ trg_wf_audit_immutable_update |
| `service_record_audit_log` | ✅ trg_immutable_sr_audit_delete | ✅ trg_immutable_sr_audit_update |
| `assignment_audit_log` | ✅ trg_immutable_as_audit_delete | ✅ trg_immutable_as_audit_update |
| `akten_zugriff_log` | ✅ trg_immutable_akten_zugriff | ✅ (gleicher Trigger) |
| `personal_audit_log` | ✅ trg_immutable_personal_audit_delete | ✅ trg_immutable_personal_audit_update |
| `state_settings_audit` | — | ✅ trg_state_audit_no_update |

**UNGESCHÜTZTE Tabellen (KEINE Immutability-Trigger):** 10 von 20

- `analytics_events`
- `angehoerigen_audit_log`
- `coach_audit_log`
- `coach_activity_log`
- `fhir_audit_log`
- `kf_pricing_audit`
- `kim_audit_log`
- `mis_auth_log`
- `mis_privacy_audit_log`
- `signatur_audit_log`
- `sync_audit_log`

**Kontrollierte Löschung:** Die Funktion `admin_audit_log_purge` erlaubt Löschung aus `mis_audit_log`, aber nur durch Superadmins und mit einer Mindest-Retention von **10 Jahren**. Die Löschung selbst wird im Audit-Log dokumentiert.

**Befund:** Kernbereiche (Abrechnung, Pflege, Personal, Leistungsnachweise) sind revisionssicher geschützt. Aber 10 Tabellen — darunter sicherheitskritische wie `mis_auth_log`, `mis_privacy_audit_log` und `signatur_audit_log` — können via DELETE/UPDATE manipuliert werden.

### ChairMatch — Risiko: HIGH 🔴

**Keine einzige Audit-Tabelle hat DELETE- oder UPDATE-Trigger.** Alle Audit-Einträge können jederzeit gelöscht oder verändert werden. Keine Revisionssicherheit.

---

## 3. DSGVO-Löschkonzept

### Alltagsengel — Risiko: MEDIUM ⚠️

**Vorhandene Mechanismen:**

- **Account-Löschung:** `account_deletion_tokens`-Tabelle mit Token, Ablaufdatum und Bestätigungszeitstempel. pg_cron-Job #3 ruft täglich um 03:00 Uhr die Edge Function `account-hard-delete` auf.
- **Soft-Delete:** `deleted_at`-Spalten in 16+ Tabellen (profiles, invoices, verordnungen, billing_tariffs, payments, akten_dokumente, etc.)
- **Soft-Delete-Prüfung:** Funktion `is_profile_soft_deleted` vorhanden.
- **Prevent-Delete-Funktionen:** `prevent_ops_log_delete`, `prevent_pflege_audit_log_delete`, `prevent_wf_audit_delete` — Audit-Logs werden korrekt vor versehentlicher Löschung geschützt.

**Fehlend:**

- Alle Privacy-Tabellen sind **leer** (0 Einträge): `mis_privacy_consents`, `mis_privacy_requests`, `mis_privacy_records`, `coach_consents`, `account_deletion_tokens`.
- **Keine generalisierte DSGVO-Löschfunktion** für Klienten-Gesundheitsdaten (Pflegedaten, Medikamente, Vitalzeichen, Wunden, Biografien).
- **Keine dokumentierte Anonymisierungsfunktion** — bei DSGVO-Löschanfragen für Pflegedaten fehlt ein Prozess, der Aufbewahrungspflichten (10 Jahre Pflegedokumentation) mit dem Recht auf Löschung abwägt.

### ChairMatch — Risiko: HIGH 🔴

**Vorhandene Mechanismen:**

- `profiles.delete_requested_at` + `profiles.deleted_at` — Soft-Delete-Markierung vorhanden.
- `cleanup_alte_drafts` — Bereinigung alter Onboarding-Entwürfe.

**Fehlend:**

- **Keine Hard-Delete-Funktion**, kein pg_cron-Job (pg_cron-Extension nicht installiert).
- **Kein automatisierter Löschprozess** nach Ablauf der Soft-Delete-Frist.
- **Keine Account-Deletion-Tokens** — kein verifizierter Self-Service-Löschprozess.
- **Keine DSGVO-spezifischen Funktionen** (gdpr_delete, anonymize, etc.).

---

## 4. Einwilligungen / Consent-Management

### Alltagsengel — Risiko: HIGH 🔴

**Tabellenstruktur vorhanden, aber LEER:**

| Tabelle | Struktur | Einträge |
|---|---|---|
| `mis_privacy_consents` | person_name, person_type, consent_type, status, granted_at, revoked_at, channel | **0** |
| `coach_consents` | coach_user_id, consent_typ, text_version, erteilt, erteilt_am, widerrufen_am | **0** |
| `mis_privacy_requests` | requester_name, request_type, status, assigned_to, due_date, completed_at | **0** |

**Befund:** Die Datenbankstrukturen für Consent-Management sind technisch gut aufgebaut (Versionierung, Widerruf-Tracking, Kanal-Dokumentation). Aber **kein einziger Eintrag** existiert. Das bedeutet: Entweder werden Einwilligungen nicht eingeholt, oder sie werden nicht in der Datenbank gespeichert. Beides ist ein DSGVO-Verstoß bei der Verarbeitung von Gesundheitsdaten (Art. 9 Abs. 2 lit. a DSGVO).

**Kein Cookie-Consent-Management** auf Datenbankebene für Alltagsengel nachgewiesen.

### ChairMatch — Risiko: MEDIUM ⚠️

**Funktionierendes System:**

| Tabelle | Einträge | Bewertung |
|---|---|---|
| `cookie_consents` | **237** | ✅ analytics/marketing/functional-Booleans, ip_hash, session_id |
| `consent_logs` | **20** | ✅ user_id, type, version, ip_hash |
| `consents` | **0** | ⚠️ Booking-bezogene Einwilligungen leer |

**Befund:** Cookie-Consent funktioniert und nutzt IP-Hashing. Consent-Logs werden versioniert. Aber die `consents`-Tabelle (buchungsbezogene Einwilligungen) ist leer.

---

## 5. Datenminimierung

### Alltagsengel — Risiko: HIGH 🔴

**IP-Adressen in Klartext (kein Hashing) in 12+ Tabellen:**

- `audit_logs.ip_address` (text)
- `billing_audit_trail.actor_ip` (text)
- `mis_audit_log.ip_address` (text)
- `mis_auth_log.ip_address` (text)
- `mis_dataroom_access.ip_address` (text)
- `ops_aktivitaetslog.ip_adresse` (text)
- `pflege_audit_log.ip_adresse` (text)
- `service_record_audit_log.ip_address` (text)
- `page_views.ip_address` (text)
- `visitor_locations.ip_address` (text)
- `visitors.ip` (text)
- `conversions.ip` (text)
- `angehoerigen_audit_log.ip_adresse` (inet — Klartext)
- `signaturen.ip_adresse` (inet — Klartext)

**Einzige Ausnahme:** `analytics_events.ip_hash` — korrekt gehashed.

**Umfangreiche Gesundheitsdaten ohne zusätzliche Verschlüsselung:**

- Medikamente: Name, Wirkstoff, PZN, Dosierung, Einnahmezeiten, verordnender Arzt
- Pflegediagnosen, Anamnesen, Risikoeinschätzungen
- Vitalzeichen, Wunddokumentation mit Fotos
- Biografiebogen: Lebensereignisse, Glaubensrichtung, biografische Besonderheiten
- SIS-Assessments, Pflegeverlauf, Maßnahmenpläne

**Befund:** IP-Klartext-Speicherung verstößt gegen den Grundsatz der Datenminimierung (Art. 5 Abs. 1 lit. c DSGVO). Bei Audit-Logs ist eine Pseudonymisierung (Hashing) ausreichend und datenschutzkonform. Gesundheitsdaten liegen ohne Column-Level-Encryption vor — Supabase-seitige Verschlüsselung at-rest existiert, aber kein zusätzlicher Schutz auf Anwendungsebene.

### ChairMatch — Risiko: MEDIUM ⚠️

**Positiv:** `visit_logs`, `consent_logs`, `cookie_consents` nutzen `ip_hash` statt Klartext-IP.

**Negativ:**
- `error_logs.ip` — Klartext
- `login_attempts.email` — Klartext (sollte für Brute-Force-Schutz gehashed werden)
- `profiles.totp_secret` — 2FA-Secret in Klartext gespeichert (sollte verschlüsselt sein)

---

## 6. Aufbewahrungsfristen

### Alltagsengel — Risiko: MEDIUM ⚠️

**Vorhandene Retention-Mechanismen:**

- `admin_audit_log_purge`: Mindest-Retention 10 Jahre für MIS-Audit-Log, nur Superadmin.
- `cleanup_api_rate_limits` / `cleanup_old_rate_limits`: Rate-Limit-Bereinigung.
- pg_cron-Job #3: Tägliche Hard-Delete-Ausführung für gelöschte Accounts.

**Fehlend:**

- **Keine automatische Retention für Audit-Logs** (außer dem manuellen Purge).
- **Keine automatische Löschung** von analytics_events, page_views, visitors, visitor_locations.
- **Keine dokumentierten Aufbewahrungsfristen** in der Datenbank (`mis_privacy_records` ist leer).
- **Keine automatisierte Löschung** alter IP-Adressen aus Audit-Tabellen.
- **Pflegedokumentation:** 10-jährige Aufbewahrungspflicht (§ 630f BGB) ist nirgends technisch erzwungen.

### ChairMatch — Risiko: HIGH 🔴

- **Kein pg_cron installiert** — keine automatisierten Bereinigungsjobs möglich.
- **Keine Retention-Funktionen** (außer `cleanup_alte_drafts`).
- **Keine Aufbewahrungsfristen dokumentiert oder technisch implementiert.**
- Login-Attempts, Error-Logs, Visit-Logs wachsen unbegrenzt.

---

## 7. Zugriffsprotokollierung

### Alltagsengel — Risiko: LOW ✅

**Umfassende Protokollierung nachgewiesen:**

- `akten_zugriff_log`: Dokumentenzugriffe mit Benutzer, Rolle, Aktion, IP, Details.
- `mis_auth_log`: Authentifizierungs-Events mit IP, User-Agent, Location, Device, Status.
- `mis_dataroom_access`: Datenraum-Zugriffe mit IP.
- `notfall_access_attempts`: Notfall-Zugriffsversuche.
- `angehoerigen_audit_log`: Angehörigen-Portal-Zugriffe mit IP, User-Agent.
- **RLS aktiv auf allen Audit-Tabellen** mit Organization-Fence (Multi-Tenancy-Isolation).

### ChairMatch — Risiko: HIGH 🔴

- Nur `login_attempts` (28 Einträge) — minimale Protokollierung.
- **Keine Admin-Zugriffsprotokollierung** auf sensible Daten.
- `audit_logs` enthält nur 1 Eintrag — de facto inaktiv.

---

## 8. Datenschutz-Folgenabschätzung (DSFA)

### Alltagsengel — Risiko: HIGH 🔴

**Eine DSFA ist ZWINGEND ERFORDERLICH** gemäß Art. 35 DSGVO, da folgende Bedingungen erfüllt sind:

- **Verarbeitung besonderer Kategorien personenbezogener Daten** (Art. 9): Gesundheitsdaten (Pflegediagnosen, Medikamente, Vitalzeichen, Wunddokumentation, SIS-Assessments).
- **Systematische Überwachung** schutzbedürftiger Personen (Pflegebedürftige).
- **Umfangreiche Verarbeitung**: Medikamentenpläne, Biografiebögen, Pflegeverlauf, Freiheitsentziehende Maßnahmen.

**Befund aus der Datenbank:** `mis_privacy_records` ist leer — kein Verarbeitungsverzeichnis (Art. 30 DSGVO) in der Datenbank hinterlegt. Die Tabelle existiert mit den richtigen Feldern (purpose, legal_basis, data_categories, affected_persons, recipients, retention_period, toms, third_country_transfer), aber es gibt **0 Einträge**.

**Ob eine DSFA als separates Dokument existiert, kann aus der Datenbank nicht geprüft werden.** Falls nicht vorhanden: Pflichtverstoß mit Bußgeldrisiko.

### ChairMatch — Risiko: LOW ✅

ChairMatch verarbeitet keine Gesundheitsdaten. Compliance-Documents und Compliance-Plans beziehen sich auf Salon-Zertifizierungen. Eine DSFA ist nach aktuellem Stand nicht erforderlich, sofern kein Profiling oder systematisches Monitoring stattfindet.

---

## 9. Auftragsverarbeitung (AVV)

### Beide Projekte — Risiko: HIGH 🔴

**Aus der Datenbank nicht prüfbar**, ob AVVs mit folgenden Auftragsverarbeitern abgeschlossen sind:

- **Supabase Inc.** (Datenbank-Hosting, US-Unternehmen) — EU-Rechenzentrum vorausgesetzt.
- **Vercel Inc.** (Frontend-Hosting, Edge Functions) — US-Unternehmen.
- **Stripe** (Zahlungsabwicklung) — nachgewiesen durch stripe_customer_id-Spalten in beiden Projekten.

**Bewertung:** Ohne verifizierte AVVs besteht ein Verstoß gegen Art. 28 DSGVO. Besonders kritisch für Alltagsengel wegen der Gesundheitsdatenverarbeitung.

---

## 10. C5-Attestation (BSI Cloud Computing Compliance Criteria Catalogue)

### Beide Projekte — Risiko: HIGH 🔴

**Fakten:**

- **Supabase** verfügt über SOC 2 Type II, HIPAA-Compliance und ISO 27001, aber über **kein BSI C5-Testat**.
- **Vercel** verfügt über SOC 2, aber über **kein BSI C5-Testat**.

**Relevanz für Alltagsengel:** Als Anbieter im Gesundheitswesen kann die fehlende C5-Attestation bei Vertragsverhandlungen mit Kostenträgern und Aufsichtsbehörden ein Problem darstellen. Das BSI C5-Testat wird zunehmend von deutschen Behörden und Krankenkassen gefordert.

**Empfehlung:** Dokumentation erstellen, die begründet, warum SOC 2 Type II + HIPAA + EU-Hosting als äquivalent betrachtet wird, und einen Migrationspfad für den Fall skizziert, dass C5 regulatorisch verpflichtend wird.

---

## Handlungsempfehlungen (priorisiert)

### Priorität 1 — Sofortmaßnahmen (Alltagsengel)

1. **Verarbeitungsverzeichnis befüllen** — `mis_privacy_records` mit allen Verarbeitungstätigkeiten füllen (Art. 30 DSGVO).
2. **DSFA durchführen und dokumentieren** — für die Verarbeitung von Pflegedaten zwingend erforderlich.
3. **Consent-Einträge erzeugen** — `mis_privacy_consents` und `coach_consents` müssen bei jeder Einwilligung befüllt werden. Frontend/Backend-Integration prüfen.
4. **IP-Adressen hashen** — In allen Audit-Tabellen ip_address/ip_adresse von Klartext auf Hash umstellen (analog zu `analytics_events.ip_hash`).

### Priorität 2 — Kurzfristig (Alltagsengel)

5. **Fehlende Immutability-Trigger nachrüsten** für: `angehoerigen_audit_log`, `coach_audit_log`, `fhir_audit_log`, `kim_audit_log`, `mis_auth_log`, `mis_privacy_audit_log`, `signatur_audit_log`, `sync_audit_log`, `kf_pricing_audit`.
6. **Automatische Retention implementieren** — pg_cron-Jobs für analytics_events, page_views, visitors, visitor_locations (z.B. 90 Tage).
7. **AVVs prüfen und dokumentieren** — Verträge mit Supabase, Vercel, Stripe verifizieren.

### Priorität 3 — Mittelfristig (Alltagsengel)

8. **Anonymisierungsfunktion** für Pflegedaten erstellen (für den Fall von Löschanfragen nach Ablauf der 10-Jahres-Frist).
9. **Cookie-Consent-Tabelle** auf Datenbankebene einführen (falls Webseite Cookies verwendet).
10. **C5-Äquivalenz-Dokumentation** erstellen.

### ChairMatch — Sofortmaßnahmen

1. **Audit-Logging implementieren** — audit_logs muss bei allen kritischen Operationen befüllt werden.
2. **Immutability-Trigger** auf audit_logs, consent_logs, cookie_consents einrichten.
3. **Hard-Delete-Prozess** implementieren (pg_cron aktivieren, Edge Function für Account-Löschung).
4. **TOTP-Secret verschlüsseln** — `profiles.totp_secret` darf nicht im Klartext gespeichert werden.
5. **Retention-Jobs einrichten** für login_attempts, error_logs, visit_logs.

---

*Dieser Bericht basiert ausschließlich auf SQL-Abfragen gegen die Supabase-Datenbanken. Dokumente außerhalb der Datenbank (z.B. separate DSFA-Dokumente, AVV-Verträge, Datenschutzerklärungen) konnten nicht geprüft werden.*
