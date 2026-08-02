# Phase-4 Arbeitsplan — Alltagsengel + efy care

**Erstellt:** 2026-08-03  
**Status:** Analyse abgeschlossen, keine Änderungen vorgenommen

---

## Priorisierungs-Übersicht

| # | Projekt | Punkt | Priorität | Risiko |
|---|---------|-------|-----------|--------|
| A-3 | Alltagsengel | Legacy-Policy-Duplikate auf bookings | **P0** | Soft-Delete-Bypass → gelöschte User sehen Buchungen |
| A-1 | Alltagsengel | Veraltete Queries (pflegegrad, completed_at) | **P1** | Postgres-Fehler in Logs, Review-Request-Cron funktioniert nicht |
| E-1 | efy care | Veraltete Spaltennamen | **P1** | Phantom-Fehler in Logs, potenzielle API-Crashes |
| A-2 | Alltagsengel | documents-Tabelle fehlt | **P1** | Dokument-Upload für Kunden/Engel komplett kaputt |
| E-2 | efy care | budget_type Validierung | **P2** | DB-Constraint-Fehler bei Edge-Cases, schlechte UX |
| E-3 | efy care | OCR-Aktivierung | **P2** | Feature blockiert, kein Umsatz aus KI-Prüfung |

---

## A-3: Legacy-Policy-Duplikate auf bookings

### Ursache

Über mehrere Migrationen hinweg wurden RLS-Policies auf `public.bookings` angelegt, ohne die alten zu entfernen. Es existieren **15 Policies** — viele redundant. Die türkischsprachigen Policies stammen aus der initialen Entwicklungsphase (`initial-setup.sql`), die englischsprachigen aus späteren Migrationen (`fix_rls_policies.sql`, `soft_delete.sql`). Zusätzlich gibt es generische Policies (`bookings_select`, `bookings_insert`, etc.) aus einer weiteren Migration.

### Ist-Zustand (Produktion)

**SELECT-Policies (4 Stück — kritisch):**

| Policy | Bedingung | Soft-Delete-Filter? |
|--------|-----------|---------------------|
| `Users can view own bookings` | `(customer_id = auth.uid() OR angel_id = auth.uid()) AND NOT is_profile_soft_deleted(auth.uid())` | JA |
| `Kullanıcı kendi bookinglerini okuyabilir` | `customer_id = auth.uid() OR angel_id = auth.uid()` | **NEIN** |
| `bookings_select` | `customer_id = auth.uid() OR angel_id = auth.uid()` | **NEIN** |
| `Admins can read all bookings` | `is_admin()` | NEIN (Admin braucht keinen) |

Da Postgres SELECT-Policies per OR verknüpft, **umgehen die alten Policies den Soft-Delete-Filter komplett**. Ein soft-deleted User sieht weiterhin alle seine Buchungen.

**INSERT-Policies (3 Stück — redundant, aber harmlos):**

| Policy | with_check |
|--------|------------|
| `Customers can insert bookings` | `customer_id = auth.uid()` |
| `Müşteri booking oluşturabilir` | `customer_id = auth.uid()` |
| `bookings_insert` | `customer_id = auth.uid()` |

**UPDATE-Policies (4 Stück — redundant):**

| Policy | Bedingung |
|--------|-----------|
| `Customers can update own bookings` | `customer_id = auth.uid()` |
| `Angels can update own bookings` | `angel_id = auth.uid()` |
| `İlgili kişi bookingi güncelleyebilir` | `customer_id = auth.uid() OR angel_id = auth.uid()` |
| `bookings_update` | `customer_id = auth.uid() OR angel_id = auth.uid()` |

**ALL-Policies (3 Stück — Admin-Redundanz + org_fence):**

| Policy | Bedingung |
|--------|-----------|
| `Admins can manage all bookings` | `is_admin()` |
| `Admin bookingleri yönetebilir` | `is_admin()` |
| `bookings_org_fence` | `organization_id = current_org_id()` |

**Türkische Policy-Namen:** Ja, 4 Stück: `Admin bookingleri yönetebilir`, `Kullanıcı kendi bookinglerini okuyabilir`, `Müşteri booking oluşturabilir`, `İlgili kişi bookingi güncelleyebilir`.

### Risiko

**DSGVO-Verletzung.** Soft-deleted (gesperrte) User-Profile können weiterhin Buchungen lesen. Der Soft-Delete-Filter in "Users can view own bookings" ist wirkungslos, solange die alten SELECT-Policies existieren.

### Priorität: P0 (sofort)

### Betroffene Dateien

Die Migration muss alle Legacy-Policies droppen. Keine Code-Änderungen nötig — nur eine SQL-Migration.

### Akzeptanzkriterien

1. Nur noch **eine** SELECT-Policy für User bleibt: `Users can view own bookings` (mit Soft-Delete-Filter)
2. Nur noch **eine** INSERT-Policy: `Customers can insert bookings`
3. Nur noch **eine** UPDATE-Policy für Kunden, **eine** für Engel: `Customers can update own bookings`, `Angels can update own bookings`
4. Nur noch **eine** Admin-ALL-Policy: `Admins can manage all bookings`
5. `bookings_org_fence` bleibt (Mandantentrennung)
6. Alle türkischsprachigen Policies entfernt
7. Alle generischen `bookings_*`-Duplikate entfernt
8. `SELECT count(*) FROM pg_policies WHERE tablename = 'bookings'` ergibt ≤ 6

### Benötigte Tests

- SQL-Test: Soft-deleted User kann keine Buchungen mehr lesen (vorher/nachher)
- SQL-Test: Nicht-soft-deleted User kann eigene Buchungen weiterhin lesen
- SQL-Test: Admin kann alle Buchungen lesen
- SQL-Test: Org-Fence blockt Cross-Org-Zugriff
- Regressions-Check: Buchungsflow (Kunde bucht, Engel akzeptiert)

### Branch- und PR-Name

`fix/bookings-rls-deduplicate` — PR: "P0: Drop legacy RLS duplicates on bookings (DSGVO soft-delete bypass)"

---

## A-1: Veraltete Queries — pflegegrad & completed_at

### Ursache

**`profiles.pflegegrad`:** Die Spalte wurde nie auf der `profiles`-Tabelle angelegt. In der DB existiert `pflegegrad` auf `care_recipients` (via `20260414_care_recipients.sql`) und auf `clients` (via `20260731020000_verordnungen_critical_fixes.sql`). Aber alter Code (Onboarding, Registration) schreibt/liest `pflegegrad` direkt von `profiles`.

**`bookings.completed_at`:** Die Spalte existiert NICHT in `public.bookings`. Die Tabelle hat `status` und `created_at`, aber kein `completed_at`. Der Code in `app/api/cron/review-request/route.ts` filtert aber nach `bookings.completed_at`.

### DB-Ist-Zustand (Produktion)

**`profiles`-Spalten:** id, role, first_name, last_name, email, phone, location, avatar_color, created_at, postal_code, is_test, referral_code, referred_by, referral_credit, onboarding_completed, latitude, longitude, deleted_at — **kein pflegegrad**.

**`bookings`-Spalten:** id, customer_id, angel_id, service, date, time, duration_hours, status, payment_method, insurance_type, insurance_provider, total_amount, platform_fee, notes, created_at, is_flexible, care_recipient_id, responded_at, decline_reason, organization_id — **kein completed_at**.

### Betroffene Dateien

**pflegegrad auf profiles (Queries die fehlschlagen):**

| Datei | Zeile | Aktion |
|-------|-------|--------|
| `components/OnboardingFlow.tsx` | 61 | SELECT: `.select('onboarding_completed, role, pflegegrad, postal_code')` von profiles |
| `components/OnboardingFlow.tsx` | 92 | UPDATE: `updates.pflegegrad = parseInt(pflegegrad)` auf profiles |
| `app/auth/register/page.tsx` | 202-214 | INSERT/UPDATE: schreibt `pflegegrad` auf profiles (Registrierung "für sich selbst") |

**Hinweis:** `pflegegrad` auf `care_recipients` und `clients` funktioniert korrekt. 50+ weitere Referenzen (Billing, Admin, Engel-Seiten, BudgetRechner) nutzen die richtigen Tabellen.

**completed_at auf bookings (Queries die fehlschlagen):**

| Datei | Zeile | Aktion |
|-------|-------|--------|
| `app/api/cron/review-request/route.ts` | 37-40 | SELECT: filtert bookings nach `completed_at` (für Bewertungsanfragen 2-3 Tage nach Abschluss) |

**Hinweis:** `completed_at` existiert korrekt auf anderen Tabellen (MIS-Schema Zeile 265, Baseline-Migration Zeilen 899/983). Die Nutzung in `app/mis/privacy/page.tsx` und `app/api/referral/` bezieht sich auf diese anderen Tabellen, nicht auf bookings.

### Risiko

- **pflegegrad:** Onboarding-Flow schlägt still fehl — Pflegegrad wird nie auf profiles gespeichert. Neue Registrierungen verlieren die Pflegegrad-Angabe.
- **completed_at:** Review-Request-Cron liefert immer leere Ergebnisse → Kunden bekommen nie Bewertungsanfragen nach abgeschlossenen Buchungen.

### Priorität: P1 (diese Woche)

### Empfehlung

- **pflegegrad:** Queries in OnboardingFlow und Registration auf `care_recipients`-Tabelle umleiten. Alternativ: `pflegegrad`-Spalte auf `profiles` anlegen (nicht empfohlen — Daten-Duplizierung).
- **completed_at:** Entweder `completed_at`-Spalte auf `bookings` anlegen und bei Status-Änderung zu "abgeschlossen" setzen, ODER den Review-Request-Cron auf `status = 'completed' AND responded_at` umstellen.

### Akzeptanzkriterien

1. Keine Postgres-Fehler mehr für `profiles.pflegegrad` und `bookings.completed_at`
2. Onboarding-Pflegegrad wird korrekt persistiert (auf care_recipients)
3. Review-Request-Cron findet abgeschlossene Buchungen und versendet Bewertungsanfragen
4. Bestehende Abrechnung/Billing unverändert (nutzt bereits care_recipients/clients korrekt)

### Benötigte Tests

- Unit-Test: OnboardingFlow persistiert Pflegegrad auf care_recipients
- Unit-Test: Registration erstellt care_recipient mit Pflegegrad
- Integration-Test: Review-Request-Cron findet Buchungen mit Status "abgeschlossen"
- Regressions-Test: Abrechnung/EDIFACT-Generation unverändert

### Branch- und PR-Name

`fix/stale-column-refs-pflegegrad-completed-at` — PR: "P1: Fix stale column references (profiles.pflegegrad, bookings.completed_at)"

---

## E-1: Veraltete Spaltennamen (user_id, first_name, slug) — efy care

### Ursache

Postgres-Logs zeigen Fehler für Spalten die nie existiert haben. Die tatsächlichen Spaltennamen weichen ab:

| Fehlermeldung | Tabelle | Falsche Spalte | Richtige Spalte |
|---------------|---------|---------------|-----------------|
| `column om.user_id does not exist` | organization_members | user_id | **profile_id** |
| `column c.first_name does not exist` | clients | first_name | **vorname** |
| `column o.slug does not exist` | organizations | slug | **existiert nicht** |

### DB-Ist-Zustand (Produktion)

**organization_members:** id, organization_id, **profile_id**, org_role, active, invited_by, created_at

**clients:** id, profile_id, module_key, **vorname**, **nachname**, care_level, street, house_number, postal_code, city, lat, lng, phone, email, contact_person_name, contact_person_phone, notes, active, created_at, updated_at, pflegegrad, versichertennummer, geburtsdatum, krankenkasse, krankenkasse_ik, organization_id

**organizations:** id, name, ik_nummer, street, house_number, postal_code, city, bundesland, email, phone, tarifkennzeichen, active, created_by, created_at, updated_at — **kein slug**

### Betroffene Dateien

Die Codebase-Suche ergab **null Treffer** für diese falschen Spaltennamen im App-Code. Das bedeutet: die Fehler stammen wahrscheinlich aus einer der folgenden Quellen:

1. **Supabase Dashboard** — manuelle SQL-Queries mit alten Spaltennamen
2. **Eine abgelehnte/revertete Migration** die noch in der Migrations-Historie steht
3. **Ein externer Client** (Metabase, Retool, etc.) der veraltete Queries ausführt
4. **DB-Funktionen** (PL/pgSQL) mit hardcodierten alten Namen

### Risiko

Mittel — die App selbst ist nicht betroffen (kein Code referenziert diese Spalten), aber die Fehler in den Logs können echte Probleme maskieren und machen Log-Monitoring unzuverlässig.

### Priorität: P1 (diese Woche)

### Empfehlung

1. Postgres-Logs mit Timestamps korrelieren → Quelle identifizieren (Client-IP, Query-Pattern)
2. `pg_stat_statements` prüfen: `SELECT query, calls FROM pg_stat_statements WHERE query ILIKE '%user_id%' OR query ILIKE '%first_name%' OR query ILIKE '%slug%'`
3. Alle DB-Funktionen prüfen: `SELECT proname, prosrc FROM pg_proc WHERE prosrc ILIKE '%user_id%' OR prosrc ILIKE '%first_name%' OR prosrc ILIKE '%o.slug%'`
4. Quelle fixen oder entfernen

### Akzeptanzkriterien

1. Keine Postgres-Fehler mehr für diese drei Spalten
2. Quelle der Queries dokumentiert
3. Falls DB-Funktion: Migration mit korrigierter Funktion

### Benötigte Tests

- Log-Monitoring: 24h ohne die drei Fehlermeldungen
- Falls Funktion gefixt: Unit-Test für die korrigierte Funktion

### Branch- und PR-Name

`fix/stale-column-names-om-clients-orgs` — PR: "P1: Fix stale column references (user_id, first_name, slug)"

---

## A-2: documents-Tabelle fehlt in Produktion

### Ursache

Die `public.documents`-Tabelle ist in `supabase/initial-setup.sql` (Zeilen 192-202) definiert, wurde aber nie in Produktion angelegt. DB-Query bestätigt: `documents_exists = false`. Trotzdem referenzieren aktive Code-Pfade diese Tabelle.

### Betroffene Dateien

**Aktive Supabase-Client-Calls (schlagen in Produktion fehl):**

| Datei | Zeile | Aktion |
|-------|-------|--------|
| `app/engel/dokumente/page.tsx` | 39 | `.from('documents').select('*')` — Engel-Dokumentenseite |
| `app/kunde/dokumente/page.tsx` | 39 | `.from('documents').select('*')` — Kunden-Dokumentenseite |
| `lib/upload-document.ts` | 156 | `.from('documents').insert({...})` — Dokument-Upload |
| `supabase/functions/account-hard-delete/index.ts` | 124 | `.from('documents').delete()` — Account-Löschung |

**Storage-Bucket (funktioniert separat):**

`lib/upload-document.ts` nutzt auch `supabase.storage.from('documents')` (Zeilen 90, 137, 143, 169, 196) — der Storage-Bucket existiert unabhängig von der DB-Tabelle.

**Migrationen die die Tabelle referenzieren:**

- `supabase/migrations/20260319000000_fix_rls_policies.sql` (Zeilen 193-225): Droppt und erstellt RLS-Policies für documents
- `supabase/migrations/20260419_soft_delete.sql` (Zeilen 163-169): Fügt Soft-Delete-Filter zur SELECT-Policy hinzu

Beide Migrationen scheitern still, da die Tabelle nicht existiert (`DROP POLICY IF EXISTS` ist idempotent, `CREATE POLICY ON public.documents` schlägt fehl).

### Risiko

**Hoch.** Die Dokumenten-Upload- und -Anzeige-Funktion für Kunden und Engel ist komplett kaputt. Dateien werden zwar in den Storage-Bucket hochgeladen, aber die Metadaten (Typ, Status, Verifikation) werden nie in der DB gespeichert.

### Priorität: P1 (diese Woche)

### Empfehlung

Die Tabelle wird aktiv genutzt → **Tabelle anlegen**. Die Definition aus `initial-setup.sql` (Zeilen 192-202) als neue Migration übernehmen, dann die RLS-Policies aus `fix_rls_policies.sql` anwenden.

### Akzeptanzkriterien

1. `public.documents`-Tabelle existiert in Produktion mit korrektem Schema
2. RLS-Policies aktiv (inkl. Soft-Delete-Filter)
3. Engel- und Kunden-Dokumentenseiten laden ohne Fehler
4. Dokument-Upload speichert Metadaten korrekt
5. Account-Hard-Delete löscht Dokumente korrekt

### Benötigte Tests

- E2E: Engel lädt Dokument hoch → erscheint in Dokumentenliste
- E2E: Kunde lädt Dokument hoch → erscheint in Dokumentenliste
- RLS-Test: User sieht nur eigene Dokumente
- RLS-Test: Soft-deleted User sieht keine Dokumente
- RLS-Test: Admin sieht alle Dokumente

### Branch- und PR-Name

`fix/create-documents-table` — PR: "P1: Create missing public.documents table + RLS policies"

---

## E-2: budget_type Validierung — efy care

### Ursache

Die DB hat einen CHECK-Constraint (`service_records_budget_type_check`) der nur 5 Werte erlaubt: `entlastungsbetrag_45b`, `verhinderungspflege`, `kurzzeitpflege`, `privatleistung`, `sonstiges`. Die TypeScript-Typen und die UI-Chips matchen diese Werte korrekt. Aber es gibt **keine Runtime-Validierung** im API-Layer — ein ungültiger Wert wird erst vom DB-Constraint abgefangen, was einen unhilfreichen 500-Fehler produziert.

### DB-Ist-Zustand

Constraint bestätigt: `CHECK ((budget_type = ANY (ARRAY['entlastungsbetrag_45b', 'verhinderungspflege', 'kurzzeitpflege', 'privatleistung', 'sonstiges'])))`

Gleicher Constraint auf 4 Tabellen: `service_records`, `budget_accounts`, `invoices`, `billing_rates`.

### Betroffene Dateien

**Validierung vorhanden (compile-time):**

| Datei | Zeile | Mechanismus |
|-------|-------|-------------|
| `app/src/types/enums.ts` | 26-31 | TypeScript Union-Type `BudgetType` |
| `app/src/types/database.generated.ts` | 20, 336, 486, 527 | Re-export + typisierte Row/Insert-Interfaces |
| `app/src/features/pruefzentrale/constants.ts` | 3-9 | `BUDGET_TYPES` Array mit Labels |

**Validierung fehlend (runtime):**

| Datei | Zeile | Problem |
|-------|-------|---------|
| `app/src/features/pruefzentrale/api.ts` | 113 | `createServiceRecord`: kein Runtime-Check vor `.insert()` |
| `app/src/features/pruefzentrale/api.ts` | 241-245 | `createInvoice`: kein Runtime-Check vor RPC-Aufruf |
| `supabase/migrations/20260706130000_business_logic.sql` | 250 | SQL-Funktion `create_invoice(p_budget_type text)`: Parameter ist untyped `text` |

**UI ist sicher:** `app/src/app/pruefzentrale/upload.tsx` (Zeile 232-237) nutzt Chip-Selector aus dem festen `BUDGET_TYPES`-Array — kein Freitext möglich.

### Risiko

Gering in der Praxis (UI verhindert ungültige Werte), aber die Offline-Sync-Queue (`app/src/features/pruefzentrale/offline/sync.ts`) könnte bei Datenkorruption oder API-Manipulation ungültige Werte senden. Der resultierende DB-Fehler ist ein generischer Constraint-Violation ohne hilfreiche Fehlermeldung.

### Priorität: P2 (bald)

### Empfehlung

1. Runtime-Validierung in `createServiceRecord()` und `createInvoice()` hinzufügen (gegen `BUDGET_TYPES`-Array prüfen)
2. Hilfreiche Fehlermeldung bei ungültigem Wert (statt generischem DB-Error)
3. Optional: SQL-Funktion `create_invoice` mit ENUM-Type statt `text`

### Akzeptanzkriterien

1. API gibt 400 mit klarer Fehlermeldung bei ungültigem budget_type
2. Bestehende valide Werte funktionieren weiterhin
3. Offline-Sync mit ungültigem budget_type zeigt verständlichen Fehler

### Benötigte Tests

- Unit-Test: `createServiceRecord` mit ungültigem budget_type → 400
- Unit-Test: `createServiceRecord` mit jedem der 5 gültigen Werte → Erfolg
- Unit-Test: `createInvoice` mit ungültigem budget_type → 400

### Branch- und PR-Name

`feat/budget-type-runtime-validation` — PR: "P2: Add runtime validation for budget_type"

---

## E-3: OCR-Aktivierungsplan — efy care

### Ursache

Die Edge Function `ocr-leistungsnachweis` ist deployed (326 Zeilen, gut strukturiert) aber per Feature-Flag deaktiviert. Beide Secrets (`OCR_ENABLED` und `ANTHROPIC_API_KEY`) müssen gesetzt sein, sonst antwortet die Funktion mit HTTP 503.

### Ist-Zustand

Die Funktion ist produktionsreif — mit dualem Auth-Layer (RLS + expliziter Guard), Cross-Tenant-Isolation, strukturiertem Claude-Tool-Use-Output, und automatischer Reconciliation. Security-Tests existieren (`__tests__/security/p0-6-ocr-cross-tenant.test.ts`). Plan-Level-Gating (`ki_pruefung` nur für intern/pro/scale) ist in `stripe-config.ts` definiert, wird aber im Edge Function selbst nicht enforced.

### Aktivierungsplan

**Schritt 1: Secret-Konfiguration**

```bash
# Über Supabase Dashboard oder CLI:
supabase secrets set OCR_ENABLED=true --project-ref nsfbwhpjesmathsrqkfi
supabase secrets set ANTHROPIC_API_KEY=sk-ant-... --project-ref nsfbwhpjesmathsrqkfi
```

Voraussetzung: Anthropic API-Key mit ausreichendem Quota für `claude-sonnet-5`.

**Schritt 2: Testdokument erstellen**

Ein nicht-sensitives Test-Leistungsnachweisdokument erstellen mit:
- Fiktiver Klientenname ("Max Mustermann")
- Fiktive Einsätze (3-5 Einträge mit Datum, Start/Ende, Leistungsart)
- Sichtbare Unterschriftsfelder (ausgefüllt oder leer)
- PDF-Format, eine Seite

**Schritt 3: E2E-Test-Ablauf**

1. Test-Organisation und Test-Klient in Staging anlegen
2. Leistungsnachweis hochladen via Prüfzentrale-UI
3. OCR auslösen: `runOcrAndCheck(recordId)` via UI-Button
4. Prüfen:
   - Status wechselt: `hochgeladen` → `ocr_laeuft` → `ocr_fertig`
   - `ocr_results`-Tabelle hat Eintrag mit `confidence > 0.7`
   - `service_record_items` hat korrekte Einzel-Einsätze
   - `signatures`-Tabelle hat 2 Einträge (Klient + Betreuungskraft)
   - `service_records` hat `ocr_total_hours` und `ocr_total_amount_cents`
5. `run_service_record_check` RPC wurde ausgeführt (Audit-Log prüfen)

**Schritt 4: Log-Überprüfung**

```sql
-- Edge Function Logs (Supabase Dashboard → Edge Functions → ocr-leistungsnachweis → Logs)
-- Prüfen auf:
-- 1. Keine 4xx/5xx-Fehler außer erwartete 503 (vor Aktivierung)
-- 2. Anthropic API-Aufrufe mit 200-Responses
-- 3. Korrekte Bearbeitungszeit (< 30s pro Dokument)
```

**Schritt 5: Mandantentrennung-Verifikation**

1. Zwei Test-Organisationen (Org A, Org B) anlegen
2. Jeweils einen Leistungsnachweis hochladen
3. Als Org-A-User versuchen, OCR auf Org-B-Record auszulösen → muss 404 zurückgeben (RLS) oder 403 (expliziter Guard)
4. Cross-Tenant-Test aus `p0-6-ocr-cross-tenant.test.ts` ausführen

**Schritt 6: Plan-Level-Gating prüfen**

Die Edge Function prüft NICHT ob der User einen Plan mit `ki_pruefung: true` hat. Aktuell kann jeder authentifizierte Org-Member OCR auslösen. Entscheidung nötig:
- Option A: Gating in der Edge Function hinzufügen (sicherer)
- Option B: Nur im Client gaten (aktueller Zustand, umgehbar)

**Rollback-Plan**

```bash
# Sofort deaktivierbar durch Secret-Entfernung:
supabase secrets unset OCR_ENABLED --project-ref nsfbwhpjesmathsrqkfi
# Funktion antwortet sofort wieder mit 503
# Keine Datenmigration nötig — bereits erstellte OCR-Ergebnisse bleiben erhalten
```

### Risiko

Gering — die Funktion ist gut gebaut und getestet. Hauptrisiken: API-Kosten bei hohem Volumen (kein Rate-Limiting in der Function), und fehlende Plan-Level-Prüfung.

### Priorität: P2 (bald)

### Akzeptanzkriterien

1. OCR verarbeitet Test-Leistungsnachweis erfolgreich (Confidence > 0.7)
2. Cross-Tenant-Isolation bestätigt (404/403 für fremde Records)
3. Rollback via Secret-Entfernung funktioniert in < 1 Minute
4. Entscheidung zu Plan-Level-Gating dokumentiert
5. Monitoring/Alerting für API-Kosten eingerichtet

### Benötigte Tests

- E2E: Upload → OCR → Ergebnis mit korrekten Feldern
- Security: Cross-Tenant-Isolation (bestehender Test reicht)
- Performance: Verarbeitungszeit < 30s pro einzelnes Dokument
- Rollback: Secret entfernen → 503 sofort aktiv

### Branch- und PR-Name

`feat/activate-ocr-leistungsnachweis` — PR: "P2: Activate OCR edge function with secrets + plan gating"

---

## Zusammenfassung der empfohlenen Reihenfolge

1. **A-3** (P0): Legacy-Policies droppen — eine einzige SQL-Migration, sofortiger DSGVO-Fix
2. **A-2** (P1): documents-Tabelle anlegen — blockiert Dokument-Feature komplett
3. **A-1** (P1): pflegegrad/completed_at Queries fixen — betrifft Onboarding + Review-Cron
4. **E-1** (P1): Fehlerquelle für veraltete Spaltennamen finden — Quelle noch unklar
5. **E-2** (P2): budget_type Runtime-Validierung — Defense-in-Depth
6. **E-3** (P2): OCR aktivieren — Feature-Launch mit sicherem Rollback
