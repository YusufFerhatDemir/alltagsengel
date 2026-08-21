# Loeschkonzept -- Alltagsengel UG

**Stand:** 2026-08-21
**Verantwortlich:** Geschaeftsfuehrung Alltagsengel UG
**Klassifikation:** Intern / Vertraulich
**Bezug:** DSGVO Art. 5 Abs. 1 lit. e, Art. 17, Art. 25; SGB XI; HGB; AO

---

## 1. Zweck und Geltungsbereich

Dieses Dokument definiert die Aufbewahrungsfristen und Loeschverfahren
fuer alle personenbezogenen Daten, die im Rahmen der Alltagsengel-Plattform
verarbeitet werden. Es dient der Umsetzung des Grundsatzes der
Speicherbegrenzung (DSGVO Art. 5 Abs. 1 lit. e) und des Rechts auf
Loeschung (DSGVO Art. 17).

**Geltungsbereich:**

- B2C-Plattform (Endnutzer: Kunden, Engel, Fahrer)
- Management-Informationssystem (MIS) -- Betriebsverwaltung
- Pflegedokumentation (Gesundheitsdaten, Art. 9 DSGVO)
- Digitaler PflegeCoach (DiPA nach Paragraph 40a SGB XI)
- Krankenfahrt-Modul
- Analytics und Tracking
- Audit- und Compliance-Logs

**Hinweis:** Das DiPA-spezifische Loeschkonzept ist separat in
`audit/dipa/loeschkonzept.md` dokumentiert. Die dortigen Regelungen
haben Vorrang fuer alle `coach_*`-Tabellen.

---

## 2. Rechtsgrundlagen

| Norm | Inhalt | Relevanz |
|---|---|---|
| DSGVO Art. 5 Abs. 1 lit. e | Speicherbegrenzung | Daten nur so lange wie fuer den Zweck erforderlich |
| DSGVO Art. 17 | Recht auf Loeschung | Loeschpflicht bei Zweckerfuellung, Widerruf, Widerspruch |
| DSGVO Art. 25 | Datenschutz durch Technikgestaltung | Privacy by Design / Privacy by Default |
| DSGVO Art. 9 | Besondere Kategorien (Gesundheitsdaten) | Erhoehte Schutzanforderungen |
| DSGVO Art. 30 | Verzeichnis der Verarbeitungstaetigkeiten | Aufbewahrungsfristen dokumentieren |
| Paragraph 257 HGB | Handelsrechtliche Aufbewahrung | 6 Jahre (Geschaeftsbriefe), 10 Jahre (Buchungsbelege) |
| Paragraph 147 AO | Steuerrechtliche Aufbewahrung | 10 Jahre (Buchungsbelege, Rechnungen) |
| SGB XI Paragraph 104a | Aufbewahrung Leistungsnachweise | 5 Jahre Aufbewahrungspflicht |
| AGG Paragraph 15 Abs. 4 | Bewerber-Schutzfrist | 6 Monate ab Absage (Klagefristen) |
| SGB V Paragraph 301 | Daten fuer Pflegekassen-Abrechnung | Nachweispflicht gegenueber Kostentraegern |

---

## 3. Datenkategorien und Aufbewahrungsfristen

### 3.1 B2C-Plattform (Endnutzer-Daten)

| Kategorie | Tabellen | Aufbewahrungsfrist | Rechtsgrundlage | Loeschart |
|---|---|---|---|---|
| **Nutzerprofile** | `profiles`, `angels` | Vertragsdauer + 60 Tage Grace-Period | DSGVO Art. 6 Abs. 1 lit. b | Soft-Delete -> Hard-Delete |
| **Buchungen** | `bookings` | 10 Jahre ab Buchungsdatum | Paragraph 257 HGB, Paragraph 147 AO | Anonymisierung nach Frist |
| **Chat-Nachrichten** | `messages`, `chat_messages` | 1 Jahr nach letzter Nachricht | DSGVO Art. 6 Abs. 1 lit. b | Hard-Delete |
| **Benachrichtigungen** | `notifications` | 90 Tage | DSGVO Art. 6 Abs. 1 lit. f | Hard-Delete |
| **Bewertungen** | `reviews`, `krankenfahrt_reviews` | Vertragsdauer + 3 Jahre | DSGVO Art. 6 Abs. 1 lit. f | Anonymisierung |
| **Nutzerdokumente** | `documents` | Vertragsdauer + 60 Tage | DSGVO Art. 6 Abs. 1 lit. b | Hard-Delete (inkl. Storage) |
| **Notfallinformationen** | `notfall_info` | Vertragsdauer + 60 Tage | DSGVO Art. 6 Abs. 1 lit. d | Hard-Delete |
| **Medikamentenplan** | `medikamentenplan` | Vertragsdauer + 60 Tage | DSGVO Art. 9 Abs. 2 lit. h | Hard-Delete |
| **Pflegeperson-Daten** | `care_recipients` | Vertragsdauer + 60 Tage | DSGVO Art. 9 Abs. 2 lit. h | CASCADE via profiles |

### 3.2 Betriebsverwaltung (MIS)

| Kategorie | Tabellen | Aufbewahrungsfrist | Rechtsgrundlage | Loeschart |
|---|---|---|---|---|
| **Klienten-Stammdaten** | `clients` | 10 Jahre nach Vertragsende | Paragraph 257 HGB, Paragraph 147 AO | Anonymisierung nach Frist |
| **Mitarbeiter-Stammdaten** | `caregivers` | 3 Jahre nach Austritt | DSGVO Art. 6 Abs. 1 lit. b | Anonymisierung |
| **MA-Dokumente** | `caregiver_documents`, `caregiver_qualifications` | 3 Jahre nach Austritt | DSGVO Art. 6 Abs. 1 lit. c | Hard-Delete (inkl. Storage) |
| **MA-Initialen-Historie** | `caregiver_initials_history` | 10 Jahre (Leistungsnachweis-Bezug) | SGB XI Paragraph 104a | Anonymisierung |
| **Bewerberdaten** | `applications`, `mis_applicants` | 6 Monate nach Absage | AGG Paragraph 15 Abs. 4 | Hard-Delete |
| **Leistungsnachweise** | `service_records` | 5 Jahre ab Leistungsdatum | SGB XI Paragraph 104a | Anonymisierung nach Frist |
| **Einsatzplanung** | `assignments` | 3 Jahre nach Einsatzende | DSGVO Art. 6 Abs. 1 lit. b | Hard-Delete |
| **Abwesenheiten** | `absences` | 3 Jahre nach Ende | DSGVO Art. 6 Abs. 1 lit. b | Hard-Delete |
| **Vertretungsanfragen** | `substitution_requests` | 1 Jahr nach Abschluss | DSGVO Art. 6 Abs. 1 lit. f | Hard-Delete |
| **Abrechnungsdaten** | `invoices`, `invoice_items`, `invoice_disputes` | 10 Jahre ab Rechnungsdatum | Paragraph 257 HGB, Paragraph 147 AO | Aufbewahrungspflicht |
| **Kassenabrechnung** | `abrechnungslaeufe`, `abrechnung_zertifikate` | 10 Jahre ab Abrechnungsmonat | Paragraph 257 HGB, SGB V Paragraph 301 | Aufbewahrungspflicht |
| **Budgetverwaltung** | `client_budgets`, `budget_transactions` | 10 Jahre ab Buchungsjahr | Paragraph 147 AO | Aufbewahrungspflicht |
| **Verordnungen** | `verordnungen` | 10 Jahre nach Ablaufdatum | Paragraph 257 HGB, SGB V | Aufbewahrungspflicht |
| **Vertraege** | `mis_contracts` | 10 Jahre nach Vertragsende | Paragraph 257 HGB | Aufbewahrungspflicht |
| **Unterschriften** | `mis_signature_requests` | 10 Jahre nach Unterzeichnung | Paragraph 257 HGB | Aufbewahrungspflicht |
| **Beschwerden** | `mis_complaints` | 5 Jahre nach Abschluss | QM / ISO 9001 | Anonymisierung |
| **CRM-Aktivitaeten** | `mis_crm_activities` | 3 Jahre nach letzter Aktivitaet | DSGVO Art. 6 Abs. 1 lit. f | Hard-Delete |
| **Kooperationspartner** | `cooperation_partners`, `partner_visits` | 3 Jahre nach letztem Kontakt | DSGVO Art. 6 Abs. 1 lit. f | Hard-Delete |
| **Zufriedenheitsanrufe** | `satisfaction_calls` | 3 Jahre nach Anrufdatum | DSGVO Art. 6 Abs. 1 lit. f | Anonymisierung |
| **Beratungsanfragen** | `lead_inquiries` | 6 Monate nach letztem Kontakt | DSGVO Art. 6 Abs. 1 lit. f | Hard-Delete |
| **Newsletter** | `newsletter_subscribers` | Bis Abmeldung + 30 Tage | DSGVO Art. 6 Abs. 1 lit. a | Hard-Delete |
| **Dienstplanung** | `mis_shifts` | 3 Jahre nach Schichtdatum | DSGVO Art. 6 Abs. 1 lit. b | Hard-Delete |

### 3.3 Pflegedokumentation (Gesundheitsdaten -- Art. 9 DSGVO)

| Kategorie | Tabellen | Aufbewahrungsfrist | Rechtsgrundlage | Loeschart |
|---|---|---|---|---|
| **Pflegeaufnahmen** | `pflege_aufnahmen` | 10 Jahre nach letzter Leistung | Berufsrechtliche Aufbewahrungspflicht | Archivierung -> Loeschung |
| **Anamnesen** | `pflege_anamnesen` | 10 Jahre nach letzter Leistung | Berufsrechtliche Aufbewahrungspflicht | Archivierung -> Loeschung |
| **Pflegeverlauf** | `pflege_verlauf` | 10 Jahre nach letzter Leistung | Berufsrechtliche Aufbewahrungspflicht | Archivierung -> Loeschung |
| **SIS-Assessments** | `sis_assessments`, `sis_themenfelder`, `sis_risikomatrix` | 10 Jahre nach letzter Leistung | SGB XI / Qualitaetssicherung | Archivierung -> Loeschung |
| **Vitalwerte** | `vital_signs` | 10 Jahre nach letzter Messung | Berufsrechtliche Aufbewahrungspflicht | Archivierung -> Loeschung |
| **Wunddokumentation** | `wounds`, `wound_assessments`, `wound_treatments`, `wound_photos` | 10 Jahre nach Abheilung | Expertenstandard / Nachweispflicht | Archivierung -> Loeschung (inkl. Storage) |
| **Sturzprotokolle** | `sturzprotokolle` | 10 Jahre nach Ereignis | Haftungsrechtliche Dokumentation | Archivierung -> Loeschung |
| **Lagerungsprotokolle** | `lagerungsprotokolle` | 10 Jahre nach Ereignis | Dekubitusprophylaxe-Nachweis | Archivierung -> Loeschung |
| **Freiheitsentziehende Massnahmen** | `freiheitsentziehende_massnahmen` | 10 Jahre nach Massnahme | Richterliche Anordnung / Haftung | Archivierung -> Loeschung |

### 3.4 Digitaler PflegeCoach (DiPA)

Die DiPA-Daten unterliegen einem separaten Loeschkonzept
(`audit/dipa/loeschkonzept.md`). Zusammenfassung:

| Kategorie | Tabellen | Aufbewahrungsfrist | Loeschart |
|---|---|---|---|
| **Coach-Nutzerprofil** | `coach_users` | Sofort auf Nutzerwunsch | CASCADE |
| **Einwilligungen** | `coach_consents` | CASCADE via coach_users | CASCADE |
| **Freigaben** | `coach_shares` | CASCADE via coach_users | CASCADE |
| **Assessments + Ziele** | `coach_assessments`, `coach_goals`, `coach_activities` | CASCADE via coach_users | CASCADE |
| **Messungen + Berichte** | `coach_measurements`, `coach_reports` | CASCADE via coach_users | CASCADE |
| **Freischaltungen** | `coach_freischaltungen`, `coach_anspruchspruefungen` | CASCADE via coach_users | CASCADE |
| **Nutzungsereignisse** | `coach_nutzungsereignisse` | Explizit vor Profil geloescht | Hard-Delete |
| **Audit-Log** | `coach_audit_log` | Bleibt (Metadaten, keine Werte) | Nicht geloescht |
| **Freischaltcodes** | `coach_freischaltcodes` | Bleibt (HMAC-Pseudonym) | Nicht geloescht |

### 3.5 Krankenfahrt-Modul

| Kategorie | Tabellen | Aufbewahrungsfrist | Rechtsgrundlage | Loeschart |
|---|---|---|---|---|
| **Fahrten** | `krankenfahrten` | 10 Jahre ab Fahrtdatum | Paragraph 147 AO (Abrechnungsbeleg) | Anonymisierung |
| **Fahrtanbieter** | `krankenfahrt_providers`, `kf_partners` | Vertragsdauer + 3 Jahre | DSGVO Art. 6 Abs. 1 lit. b | Anonymisierung |
| **Fahrt-Chat** | `chat_messages` | 1 Jahr nach letzter Nachricht | DSGVO Art. 6 Abs. 1 lit. b | Hard-Delete |
| **Fahrzeuge** | `fahrzeuge`, `mis_vehicles` | Vertragsdauer + 1 Jahr | DSGVO Art. 6 Abs. 1 lit. b | Hard-Delete |
| **Preisgestaltung** | `kf_pricing_*` (7 Tabellen) | Unbegrenzt (Konfigurationsdaten) | -- | Keine Loeschung |

### 3.6 Audit-Logs und Compliance

| Kategorie | Tabellen | Aufbewahrungsfrist | Rechtsgrundlage | Loeschart |
|---|---|---|---|---|
| **MIS-Audit-Log** | `mis_audit_log` | 10 Jahre (Minimum) | Paragraph 257 HGB, DSGVO Art. 30 | Purge via `admin_audit_log_purge()` |
| **Pflege-Audit-Log** | `pflege_audit_log` | 10 Jahre | Berufsrechtliche Dokumentation | Purge (analog) |
| **Datenschutz-Audit** | `mis_privacy_audit_log` | 10 Jahre | DSGVO Art. 30 | Purge (analog) |
| **Datenschutz-Einwilligungen** | `mis_privacy_consents` | 3 Jahre nach Widerruf | DSGVO Art. 7 Abs. 1 | Anonymisierung |
| **Datenschutz-Anfragen** | `mis_privacy_requests` | 3 Jahre nach Abschluss | DSGVO Art. 17 | Anonymisierung |
| **Datenschutz-Verzeichnis** | `mis_privacy_records` | Unbegrenzt (Pflichtdokumentation) | DSGVO Art. 30 | Keine Loeschung |

### 3.7 Analytics und Tracking

| Kategorie | Tabellen | Aufbewahrungsfrist | Rechtsgrundlage | Loeschart |
|---|---|---|---|---|
| **Seitenaufrufe** | `page_views` | 90 Tage | DSGVO Art. 6 Abs. 1 lit. f | Hard-Delete |
| **Analytics-Events** | `analytics_events` | 90 Tage | DSGVO Art. 6 Abs. 1 lit. f | Hard-Delete |
| **Conversions** | `conversions` | 90 Tage | DSGVO Art. 6 Abs. 1 lit. f | Hard-Delete |
| **WhatsApp-Gespraeche** | `whatsapp_conversations` | 6 Monate nach Gespraech | DSGVO Art. 6 Abs. 1 lit. f | Anonymisierung |

### 3.8 Session- und Auth-Daten

| Kategorie | Tabellen | Aufbewahrungsfrist | Rechtsgrundlage | Loeschart |
|---|---|---|---|---|
| **Login-Rate-Limits** | `login_rate_limits` | 90 Tage | DSGVO Art. 6 Abs. 1 lit. f | Hard-Delete |
| **Notfall-Zugriffsversuche** | `notfall_access_attempts` | 90 Tage | DSGVO Art. 6 Abs. 1 lit. f | Hard-Delete |
| **Push-Tokens** | `fcm_tokens`, `push_subscriptions` | Vertragsdauer + 30 Tage | DSGVO Art. 6 Abs. 1 lit. b | Hard-Delete |
| **Konto-Loeschtokens** | `account_deletion_tokens` | 60 Tage (Grace-Period) | DSGVO Art. 17 | Hard-Delete mit Account |
| **Empfehlungen** | `referrals` | 3 Jahre nach Abschluss | DSGVO Art. 6 Abs. 1 lit. b | Anonymisierung |

---

## 4. Loeschverfahren

### 4.1 Soft-Delete (Nutzerkonto-Loeschung)

**Status quo (implementiert):**

1. Nutzer initiiert Kontoloeschung ueber `/kunde/profil` oder `/engel/profil`
2. `profiles.deleted_at` wird auf `now()` gesetzt (Soft-Delete)
3. Auth-Session wird beendet (`signOut()`)
4. Widerrufs-Token wird generiert und per E-Mail verschickt (`account_deletion_tokens`)
5. RLS-Policies filtern soft-deleted Profile heraus (unsichtbar fuer alle)
6. Audit-Log-Eintrag: `user_self_soft_delete`

**Grace-Period:** 60 Tage

Waehrend der Grace-Period:
- Nutzer kann ueber den Widerrufs-Link sein Konto reaktivieren
- Daten bleiben vollstaendig erhalten, sind aber ueber RLS unsichtbar
- Admins koennen soft-deleted Profile einsehen (Recovery-Support)

**Implementierung:** `/app/api/user/delete/route.ts`, `/app/api/user/delete/undo/route.ts`

### 4.2 Hard-Delete (Endgueltige Loeschung)

**Status quo (implementiert):**

Die Edge Function `supabase/functions/account-hard-delete/index.ts` wird
taeglich um 03:00 UTC via pg_cron ausgefuehrt und loescht alle Accounts,
deren `deleted_at` aelter als 60 Tage ist.

**Loeschreihenfolge (FK-kaskadiert):**

1. `notifications` (user_id)
2. `messages` (sender_id, receiver_id)
3. `chat_messages` (sender_id)
4. `documents` (user_id)
5. `bookings` (customer_id, angel_id)
6. `angels` (id)
7. `account_deletion_tokens` (user_id)
8. `profiles` (id)
9. `auth.users` (via Supabase Admin API)

**Batch-Groesse:** 50 Accounts pro Lauf (Timeout-Schutz)
**Bestaetigungs-Mail:** Wird nach erfolgreicher Loeschung versendet
**Audit-Log:** `user_hard_delete_cron` (Eintrag mit pseudonymisierter User-ID)

**Implementierung:** `supabase/functions/account-hard-delete/index.ts`,
`supabase/migrations/20260918020000_dsgvo_hard_delete_cron.sql`

### 4.3 Anonymisierung

Fuer Datensaetze mit gesetzlicher Aufbewahrungspflicht (z.B. Rechnungen,
Leistungsnachweise), die ueber die Vertragsdauer hinaus aufbewahrt werden
muessen, wird Anonymisierung statt Loeschung angewandt:

**Verfahren:**

- Personenbezogene Felder (`first_name`, `last_name`, `email`, `phone`,
  `address`) werden durch generische Platzhalter ersetzt
  (z.B. `GELOESCHT`, `client-XXXX@anon`)
- Strukturelle Daten (Betraege, Datumsangaben, Leistungsarten) bleiben
  fuer buchhalterische Zwecke erhalten
- GPS-Koordinaten in `service_records` werden auf NULL gesetzt
- Unterschriften (`client_signature`) werden entfernt
- Referenzielle Integritaet bleibt erhalten (IDs bleiben, Klarnamen weg)

**Noch nicht implementiert** -- siehe Abschnitt 7 (Umsetzungsempfehlungen).

### 4.4 Archivierung (Gesundheitsdaten)

Fuer Pflegedokumentationsdaten (Kategorie 3.3) gilt:

1. **Aktive Phase:** Daten sind vollstaendig zugreifbar fuer berechtigte
   Mitarbeiter (RLS via `is_admin()` + `org_fence` + `engel_hat_aktiven_klienten()`)
2. **Archiv-Phase:** Nach Beendigung des Pflegeverhaeltnisses werden
   Daten als archiviert markiert (`archiviert_am` Spalte, sofern vorhanden)
3. **Loeschung:** 10 Jahre nach letzter Leistung werden die Daten
   endgueltig geloescht

Die Spalte `archiviert_am` existiert bereits fuer:
- `lagerungsprotokolle`
- `pflege_verlauf`
- `freiheitsentziehende_massnahmen`

Fuer die uebrigen Pflegedokumentations-Tabellen muss sie noch ergaenzt werden.

---

## 5. Loeschung auf Betroffenenanfrage (DSGVO Art. 17)

### 5.1 Recht auf Loeschung -- Endnutzer (B2C)

Endnutzer koennen ihr Konto selbststaendig loeschen:

- **Pfad:** `/kunde/profil` bzw. `/engel/profil` -> Konto loeschen
- **Sofortwirkung:** Soft-Delete (Profil unsichtbar)
- **Endgueltig:** Hard-Delete nach 60 Tagen Grace-Period
- **Widerruf:** Per E-Mail-Link innerhalb der Grace-Period

### 5.2 Recht auf Loeschung -- PflegeCoach (DiPA)

Zwei separate Wege (siehe `audit/dipa/loeschkonzept.md`):

- **Weg A -- Produktloeschung:** Nur PflegeCoach-Daten (`coach_*`),
  Plattform-Konto bleibt
- **Weg B -- Kontoloeschung:** Gesamtes Konto (CASCADE auf `coach_users`
  ueber FK auf `auth.users`)

### 5.3 Recht auf Loeschung -- Klienten (MIS)

Klienten-Stammdaten (`clients`) unterliegen gesetzlichen Aufbewahrungspflichten.
Bei einem Loeschantrag:

1. **Pruefen:** Bestehen noch Aufbewahrungspflichten (offene Rechnungen,
   laufende Verordnungen, SGB-XI-Fristen)?
2. **Wenn ja:** Sperrung des Datensatzes (`status = 'ended'`),
   Einschraenkung der Verarbeitung auf das gesetzlich erforderliche Minimum,
   Benachrichtigung des Betroffenen mit Begruendung und voraussichtlichem
   Loeschdatum
3. **Wenn nein:** Anonymisierung der personenbezogenen Felder,
   Loeschung aller nicht aufbewahrungspflichtigen Daten

### 5.4 Recht auf Loeschung -- Bewerber

Bewerberdaten (`applications`, `mis_applicants`) werden:

- Bei Absage: 6 Monate nach Absagedatum automatisch geloescht
- Bei Einstellung: In Mitarbeiterdaten (`caregivers`) ueberfuehrt,
  Bewerbungsdatensatz nach 6 Monaten geloescht

### 5.5 Ausnahmen von der Loeschpflicht

Gemaess DSGVO Art. 17 Abs. 3 besteht **keine** Loeschpflicht fuer:

- Daten zur Erfuellung einer rechtlichen Verpflichtung
  (Paragraph 257 HGB, Paragraph 147 AO, SGB XI Paragraph 104a)
- Daten fuer Rechtsansprueche (Haftung, Gewaehrleistung)
- Archivzwecke im oeffentlichen Interesse

---

## 6. Verantwortlichkeiten

| Rolle | Aufgabe |
|---|---|
| **Geschaeftsfuehrung** | Gesamtverantwortung, jaehrliche Ueberpruefung des Loeschkonzepts |
| **Datenschutzbeauftragter** | Ueberwachung der Einhaltung, Bearbeitung von Betroffenenanfragen |
| **IT-Administration** | Betrieb und Ueberwachung der automatisierten Loeschprozesse |
| **Fachabteilung Pflege** | Pruefung der Aufbewahrungsfristen bei Pflegedokumentationsdaten |
| **Buchhaltung** | Pruefung der steuer-/handelsrechtlichen Aufbewahrungsfristen |

---

## 7. Technische Umsetzung -- Ist-Stand und Empfehlungen

### 7.1 Bereits implementiert

| Mechanismus | Implementierung | Status |
|---|---|---|
| Soft-Delete (B2C-Konten) | `profiles.deleted_at`, Migration `20260419000100` | Produktiv |
| Hard-Delete Cron | Edge Function `account-hard-delete`, pg_cron taeglich 03:00 UTC | Produktiv |
| RLS-Filter fuer Soft-Delete | 6 Policies mit `is_profile_soft_deleted()` | Produktiv |
| Widerrufs-Token | `account_deletion_tokens`, 60-Tage-Expiry | Produktiv |
| Bestaetigungs-Mail | Resend API in Edge Function | Produktiv |
| Audit-Log Immutability | Trigger `trg_mis_audit_log_no_update/no_delete` | Produktiv |
| Audit-Log Purge (10J+) | Fn `admin_audit_log_purge()`, nur Superadmin | Produktiv |
| DiPA-Produktloeschung | `/api/coach/loeschung`, CASCADE via `coach_users` | Produktiv |
| Archiv-Spalten (Pflege) | `archiviert_am` auf 3 Tabellen | Produktiv |

### 7.2 Noch umzusetzen (Empfehlungen)

**Prioritaet HOCH:**

1. **Automatische Anonymisierung abgelaufener Klienten-Stammdaten**
   - Edge Function oder pg_cron Job
   - Prueft: `clients` mit `status = 'ended'` UND letzter `service_record`
     aelter als 10 Jahre UND keine offenen Rechnungen
   - Aktion: Anonymisierung der personenbezogenen Felder
   - Empfohlen: Supabase Edge Function, woechentlicher Lauf

2. **Automatische Loeschung abgelaufener Bewerberdaten**
   - Prueft: `applications` und `mis_applicants` mit
     `status IN ('abgelehnt','abgesagt')` UND `updated_at` aelter als 6 Monate
   - Aktion: Hard-Delete
   - Empfohlen: pg_cron Job, monatlicher Lauf

3. **Automatische Loeschung Analytics-Daten nach 90 Tagen**
   - Prueft: `page_views`, `analytics_events`, `conversions` mit
     `created_at` aelter als 90 Tage
   - Aktion: Hard-Delete
   - Empfohlen: pg_cron Job, taeglich

**Prioritaet MITTEL:**

4. **Automatische Loeschung alter Notifications**
   - Prueft: `notifications` mit `created_at` aelter als 90 Tage
   - Aktion: Hard-Delete
   - Empfohlen: pg_cron Job, taeglich (kann mit Analytics-Job kombiniert werden)

5. **Automatische Loeschung alter Session-Daten**
   - Prueft: `login_rate_limits`, `notfall_access_attempts` aelter als 90 Tage
   - Aktion: Hard-Delete
   - Empfohlen: pg_cron Job, woechentlich

6. **Automatische Loeschung alter Chat-Nachrichten**
   - Prueft: `messages`, `chat_messages` mit `created_at` aelter als 1 Jahr
   - Aktion: Hard-Delete (nur wenn Buchung abgeschlossen)
   - Empfohlen: pg_cron Job, monatlich

7. **Automatische Anonymisierung alter Lead-Anfragen**
   - Prueft: `lead_inquiries` ohne Statusaenderung seit 6 Monaten
   - Aktion: Hard-Delete
   - Empfohlen: pg_cron Job, monatlich

8. **Archiv-Spalten fuer alle Pflegedokumentations-Tabellen**
   - Fehlend bei: `pflege_aufnahmen`, `pflege_anamnesen`,
     `sis_assessments`, `vital_signs`, `wounds`, `sturzprotokolle`
   - Empfohlen: Migration mit `ADD COLUMN IF NOT EXISTS archiviert_am`

**Prioritaet NIEDRIG:**

9. **Newsletter-Abmelde-Cleanup**
    - Prueft: `newsletter_subscribers` mit `unsubscribed_at` aelter als 30 Tage
    - Aktion: Hard-Delete
    - Empfohlen: pg_cron Job, monatlich

10. **WhatsApp-Anonymisierung**
    - Prueft: `whatsapp_conversations` aelter als 6 Monate
    - Aktion: Telefonnummer anonymisieren, Inhalt loeschen
    - Empfohlen: pg_cron Job, monatlich

### 7.3 Empfohlene Architektur fuer Loeschjobs

```
Supabase Edge Function: data-retention-cleanup
├── Taeglich (03:30 UTC, nach Hard-Delete-Job):
│   ├── Analytics-Daten > 90 Tage loeschen
│   ├── Notifications > 90 Tage loeschen
│   └── Session-Daten > 90 Tage loeschen
├── Woechentlich (Sonntag 04:00 UTC):
│   └── Login-Rate-Limits / Notfall-Attempts bereinigen
└── Monatlich (1. des Monats, 05:00 UTC):
    ├── Bewerberdaten > 6 Monate loeschen
    ├── Chat-Nachrichten > 1 Jahr loeschen
    ├── Lead-Anfragen > 6 Monate loeschen
    ├── Newsletter-Abmeldungen > 30 Tage loeschen
    ├── WhatsApp > 6 Monate anonymisieren
    └── Klienten-Stammdaten (10J-Pruefung) anonymisieren
```

Jeder Loeschlauf erzeugt einen Audit-Log-Eintrag mit Anzahl
betroffener Datensaetze.

---

## 8. Hard-Delete in der Account-Loeschung -- Lueckenanalyse

Die bestehende Edge Function `account-hard-delete` loescht folgende
Tabellen fuer B2C-Nutzer. Folgende Tabellen werden **nicht** erfasst
und muessen bei einer Erweiterung beruecksichtigt werden:

| Tabelle | Personenbezug | Handlungsbedarf |
|---|---|---|
| `care_recipients` | CASCADE via profiles.id | Kein Handlungsbedarf (FK CASCADE) |
| `notfall_info` | user_id -> profiles.id | CASCADE pruefen oder explizit loeschen |
| `medikamentenplan` | user_id -> profiles.id | CASCADE pruefen oder explizit loeschen |
| `fcm_tokens` | user_id -> profiles.id | Explizit loeschen (Push-Tokens) |
| `push_subscriptions` | user_id -> profiles.id | Explizit loeschen |
| `page_views` | user_id -> profiles.id (SET NULL) | Wird anonymisiert (SET NULL) |
| `analytics_events` | user_id -> auth.users (SET NULL) | Wird anonymisiert (SET NULL) |
| `hygienebox_orders` | user_id | Explizit loeschen |
| `referrals` | referrer_id / referred_id | Anonymisieren |
| `krankenfahrten` | customer_id | Aufbewahrungspflicht pruefen |

---

## 9. Backup-Aufbewahrung

Loeschungen aus der Produktionsdatenbank werden erst mit Ablauf der
Backup-Aufbewahrungsfrist endgueltig wirksam. Die Backup-Retention ist
im Supabase-Projekt konfiguriert.

**Offener Punkt:** Die exakte Backup-Retention-Dauer muss im
AVV-Dossier dokumentiert werden (siehe AK-DS-04 im DiPA-Loeschkonzept).
Supabase Pro-Plan: standardmaessig 7 Tage Point-in-Time Recovery.

---

## 10. Ueberpruefung und Aktualisierung

- Dieses Loeschkonzept wird **jaehrlich** ueberprueft und bei Bedarf
  aktualisiert.
- Bei Aenderungen der Rechtsgrundlagen (DSGVO, SGB, HGB) erfolgt eine
  sofortige Anpassung.
- Jede neue Tabelle mit personenbezogenen Daten muss vor Produktiveinsatz
  in dieses Konzept aufgenommen werden.
- Die Einhaltung der Loeschfristen wird durch automatisierte Pruefungen
  (Monitoring) ueberwacht.

---

## 11. Aenderungshistorie

| Datum | Aenderung | Autor |
|---|---|---|
| 2026-08-21 | Erstfassung: Vollstaendiges Loeschkonzept | Alltagsengel |
