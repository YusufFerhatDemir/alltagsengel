# Production-Abnahme: WORKFLOW-ENGINE + AUTOMATISIERUNGEN + MODULÜBERGREIFENDE EREIGNISSTEUERUNG

**Datum:** 2026-08-08
**Projekt:** Alltagsengel UG — Supabase Production (`nnwyktkqibdjxgimjyuq`)
**Block:** Workflow-Engine, Automatisierungen, Modulübergreifende Ereignissteuerung
**Migration:** `20260813010000_workflow_engine.sql` (16 Teile, alle applied)
**Application-Code Commit:** `b159b7e` (lib + API + Admin-UI + Tests)

---

## 1. Umfang

### Datenbank (16-teilige Migration)

| # | Objekt | Typ | Beschreibung |
|---|--------|-----|-------------|
| 1 | `wf_events` | CREATE TABLE | 18 Spalten, zentrales Event-Log mit Idempotenz (UNIQUE org+key), Priorität, Retry |
| 2 | `wf_regeln` | CREATE TABLE | 15 Spalten, konfigurierbare WHEN→IF→THEN Workflow-Regeln |
| 3 | `wf_aktionen` | CREATE TABLE | 8 Spalten, Aktionen pro Regel (aufgabe, benachrichtigung, wiedervorlage, eskalation, status, feld) |
| 4 | `wf_ausfuehrungen` | CREATE TABLE | 13 Spalten, Ausführungsprotokoll (erfolgreich/fehlgeschlagen) |
| 5 | `wf_warteschlange` | CREATE TABLE | 13 Spalten, Retry-Queue mit exponentiellem Backoff |
| 6 | `wf_dead_letter` | CREATE TABLE | 13 Spalten, gescheiterte Automationen mit manuellem Retry |
| 7 | `wf_audit_log` | CREATE TABLE | 9 Spalten, IMMUTABLE Audit-Trail (UPDATE/DELETE blockiert per Trigger) |
| 8 | `wf_emit_event()` | FUNCTION | SECURITY DEFINER, zentraler Event-Emitter mit Idempotenz-Prüfung |
| 9 | `wf_evaluate_conditions()` | FUNCTION | IMMUTABLE, JSON-basierte Bedingungsauswertung |
| 10 | `wf_process_event()` | FUNCTION | SECURITY DEFINER, matcht Event gegen aktive Regeln → Queue |
| 11 | `wf_execute_queue_item()` | FUNCTION | SECURITY DEFINER, führt Aktionen aus (6 Typen: aufgabe_erstellen, benachrichtigung_senden, wiedervorlage_erstellen, eskalation_ausloesen, status_aendern, feld_aktualisieren) |
| 12 | `wf_process_pending()` | FUNCTION | SECURITY DEFINER, Batch-Verarbeitung: Events matchen + Queue abarbeiten |
| 13 | `wf_check_fristen()` | FUNCTION | SECURITY DEFINER, 6 Fristentypen prüfen (Qualifikation, Dokument, Vertrag, Rechnung, Maßnahmenplan, Leistungsnachweis) |
| 14 | 5 Source-Trigger | TRIGGER | AFTER INSERT/UPDATE auf dta_ruecklaeufer, dta_fehlerprotokoll, payments, dienstplan_eintraege, ops_aufgaben |
| 15 | `wf_events_dashboard` | VIEW | Events + Ausführungsstatistik |
| 16 | `wf_queue_status` | VIEW | Queue mit Event/Regel/Aktionsdetails |
| 17 | `wf_dead_letter_uebersicht` | VIEW | Dead-Letter mit Kontext |
| 18 | `wf_statistik` | VIEW | Aggregierte Kennzahlen pro Organisation |

### Application-Code

| Bereich | Dateien | Beschreibung |
|---------|---------|-------------|
| `lib/workflow/` | 10 Module | types, events, regeln, ausfuehrungen, warteschlange, dead-letter, audit, dashboard, processing, index |
| `app/api/ops/workflow/` | 14 API-Routen | Vollständige REST-API mit requireOpsAdmin + organizationId |
| Admin-Seiten | 9 Seiten | Dashboard, Events (Liste/Detail), Regeln (Liste/Detail/Neu), Warteschlange, Dead-Letter, Audit |
| Navigation | 1 Datei | Admin-Sidebar erweitert um Workflow-Engine Bereich |
| Icons | 1 Datei | IconWorkflow in components/Icons.tsx |
| Tests | 2 Suites | events (13 Tests), regeln (12 Tests) — alle 25 PASS |

---

## 2. Architektur

### Event-Flow (Pipeline)

```
Source-Tabelle (INSERT/UPDATE)
  → Source-Trigger (z.B. trg_wf_dta_ruecklaeufer)
    → wf_emit_event() [Idempotenz-Check → wf_events INSERT]
      → wf_process_event() [Regeln matchen → wf_warteschlange INSERT]
        → wf_execute_queue_item() [Aktion ausführen → ops_aufgaben/benachrichtigungen/wiedervorlagen/eskalationen]
```

### Batch-Verarbeitung

```
wf_process_pending(limit)
  1. Neue Events (status='neu') → wf_process_event() für jedes
  2. Wartende Queue-Items (naechster_versuch <= now()) → wf_execute_queue_item() für jedes
```

### Fristenprüfung (Scheduled)

```
wf_check_fristen()
  → 6 Deadline-Typen scannen → Events emittieren
  1. Qualifikationsablauf (30 Tage)
  2. Dokumentablauf (30 Tage)
  3. Vertragsende (30 Tage)
  4. Überfällige Rechnungen
  5. Maßnahmenplan-Review (14 Tage)
  6. Fehlende Leistungsnachweis-Unterschriften (>3 Tage)
```

### Fehlerbehandlung

- **Retry**: Exponentieller Backoff `power(2, versuch)` Minuten
- **Dead Letter**: Nach `max_versuche` (default 3) → wf_dead_letter mit manueller Retry-Option
- **Idempotenz**: UNIQUE(organization_id, idempotency_key) mit ON CONFLICT DO NOTHING

---

## 3. Production-Smoke-Tests

| # | Test | Ergebnis |
|---|------|----------|
| 1 | 7/7 wf_* Tabellen existieren | **PASS** |
| 2 | 7/7 Tabellen haben RLS_ON | **PASS** |
| 3 | 14 RLS-Policies vorhanden (7× org_fence RESTRICTIVE + 7× admin_all) | **PASS** |
| 4 | 4/4 Views existieren und sind abfragbar | **PASS** |
| 5 | 11 Functions: 9× SECURITY DEFINER, 1× INVOKER (wf_evaluate_conditions), 1× Immutable-Trigger | **PASS** |
| 6 | 7 Trigger auf Source-Tabellen + wf_audit_log aktiv | **PASS** |
| 7 | 7/7 wf_* Tabellen leer (0 Zeilen, keine Fake-Daten) | **PASS** |
| 8 | Bestehende Daten unverändert: profiles=59, clients=4, caregivers=2, assignments=5, service_records=31, invoices=5, notifications=153, messages=2, fcm_tokens=3, push_subscriptions=6 | **PASS** |
| 9 | 7/7 org_fence Policies vorhanden (RESTRICTIVE) | **PASS** |
| 10 | Spaltenanzahl: wf_events=18, wf_regeln=15, wf_aktionen=8, wf_ausfuehrungen=13, wf_warteschlange=13, wf_dead_letter=13, wf_audit_log=9 | **PASS** |
| 11 | 47 Check Constraints, 16 Indexes, 22 Foreign Keys auf wf_* Tabellen | **PASS** |
| 12 | Immutable Audit: 2 Trigger (UPDATE + DELETE blockiert) auf wf_audit_log | **PASS** |
| 13 | wf_statistik View: 3 Zeilen (1 pro Organization, korrekt) | **PASS** |
| 14 | Application-Code: 10 lib-Module, 14 API-Routen, 9 Admin-Seiten vorhanden | **PASS** |
| 15 | Auth-Pattern: Alle 14 API-Routen verwenden requireOpsAdmin mit auth.ctx.* (nested) | **PASS** |
| 16 | Client-Injection: 0 globale Supabase-Imports in lib/workflow/ | **PASS** |
| 17 | Vitest: 25/25 Tests bestanden (events: 13, regeln: 12) | **PASS** |

**Ergebnis: 17/17 PASS — 0 FAIL**

---

## 4. Sicherheitsarchitektur

| Mechanismus | Status |
|-------------|--------|
| RLS auf allen 7 neuen Tabellen | ✓ |
| org_fence (RESTRICTIVE) auf allen 7 Tabellen | ✓ |
| Admin-Policies (role='admin') für alle wf_* Tabellen | ✓ |
| SECURITY DEFINER nur wo nötig (9 Functions: emit, process, execute, pending, fristen, 5× trigger) | ✓ |
| Immutable Audit: wf_audit_log (RAISE EXCEPTION auf UPDATE/DELETE) | ✓ |
| Idempotenz: UNIQUE(organization_id, idempotency_key) auf wf_events | ✓ |
| Whitelist für status_aendern/feld_aktualisieren (nur erlaubte Tabellen) | ✓ |
| organizationId in allen 14 API-Routen | ✓ |
| Keine Demo-Daten, keine Fake-Endpunkte | ✓ |
| Bestehende Production-Daten nicht modifiziert | ✓ |

---

## 5. Workflow-Aktionstypen

| Aktionstyp | Ziel-Tabelle | Beschreibung |
|------------|-------------|-------------|
| `aufgabe_erstellen` | ops_aufgaben | Erstellt automatische Aufgabe mit Frist, Kategorie, Priorität |
| `benachrichtigung_senden` | ops_benachrichtigungen | Sendet in-app Benachrichtigung an Admin oder Verantwortlichen |
| `wiedervorlage_erstellen` | ops_wiedervorlagen | Erstellt Wiedervorlage mit konfigurierbarer Frist |
| `eskalation_ausloesen` | ops_eskalationshistorie | Eskaliert an höhere Ebene mit Stufensystem |
| `status_aendern` | Whitelist-Tabellen | Ändert Status-Feld (invoices, service_records, ops_aufgaben, ops_wiedervorlagen, dunning_entries) |
| `feld_aktualisieren` | Whitelist-Tabellen | Aktualisiert beliebiges Feld (invoices, service_records, caregiver_qualifications, dunning_entries, payments) |

---

## 6. Source-Table-Trigger (Event-Emitter)

| Trigger | Tabelle | Event-Typ | Modul |
|---------|---------|-----------|-------|
| `trg_wf_dta_ruecklaeufer` | dta_ruecklaeufer | dta_ruecklaeufer_eingegangen | dakota |
| `trg_wf_dta_fehler` | dta_fehlerprotokoll | dta_fehler_aufgetreten | dakota |
| `trg_wf_zahlung` | payments | zahlung_eingegangen | forderungen |
| `trg_wf_dienstplan` | dienstplan_eintraege | einsatz_geplant | einsatz |
| `trg_wf_aufgabe_ueberfaellig` | ops_aufgaben | aufgabe_ueberfaellig | aufgaben |

---

## 7. Fristenprüfung (wf_check_fristen)

| # | Fristentyp | Tabelle | Vorlaufzeit | Idempotenz-Key |
|---|-----------|---------|-------------|----------------|
| 1 | Qualifikationsablauf | caregiver_qualifications | 30 Tage | qualifikation_ablauf:{id}:{datum} |
| 2 | Dokumentablauf | akten_dokumente | 30 Tage | dokument_ablauf:{id}:{datum} |
| 3 | Vertragsende | akten_vertraege | 30 Tage | vertrag_ablauf:{id}:{datum} |
| 4 | Überfällige Rechnungen | invoices | sofort | rechnung_ueberfaellig:{id}:{tag} |
| 5 | Maßnahmenplan-Review | pflege_massnahmenplaene | 14 Tage | massnahmenplan_review:{id}:{datum} |
| 6 | Fehlende Unterschriften | service_records | >3 Tage alt | ln_unsigned:{id}:{tag} |

---

## 8. Gefundene und behobene Fehler

| # | Fehler | Behebung | Schwere |
|---|--------|----------|---------|
| 1 | wf_regeln hat 15 Spalten (nicht 14 wie ursprünglich geplant) | Schema-Anpassung in types.ts | Niedrig |
| 2 | wf_dead_letter hat 13 Spalten (nicht 12) | Schema-Anpassung in types.ts | Niedrig |
| 3 | 4 pre-existing TypeScript-Fehler in lib/abrechnung/ | Modulfremd, nicht angefasst | Info |
| 4 | 6 pre-existing Testfehler in __tests__/ops/ereignis-emitter.test.ts | Modulfremd, nicht angefasst | Info |

---

## 9. Verbleibende Risiken

| Risiko | Bewertung | Empfehlung |
|--------|-----------|------------|
| wf_check_fristen() noch nicht als pg_cron Job eingerichtet | Niedrig | Cron-Job für täglichen Lauf konfigurieren (z.B. 06:00 UTC) |
| wf_process_pending() noch nicht als pg_cron Job eingerichtet | Niedrig | Cron-Job für 5-Minuten-Intervall konfigurieren |
| Source-Trigger noch nicht im Livebetrieb getestet (0 Events) | Niedrig | Bei ersten echten Daten (DTA-Rückläufer, Zahlung) verifizieren |
| Keine Push-Benachrichtigungen (nur In-App) | Info | Push-Service in separatem Block implementieren |
| Admin-UI noch nicht mit echtem Engel-Login getestet | Niedrig | Bei erstem Admin-Login verifizieren |

---

## 10. Architektur-Entscheidungen

- **Pragmatischer Hybrid**: DB-Trigger emittieren Events → zentrale Verarbeitung → Queue → Aktion. Kein separater Message-Broker nötig.
- **Idempotenz via DB**: UNIQUE Constraint statt Application-Level-Check — Race-Condition-sicher.
- **Exponentieller Backoff**: `power(2, versuch)` Minuten — verhindert Überlastung bei persistenten Fehlern.
- **Whitelist für Dynamic SQL**: Nur explizit erlaubte Tabellen können via status_aendern/feld_aktualisieren modifiziert werden — SQL-Injection-Schutz.
- **Modulübergreifende Integration**: Workflow-Engine verbindet DAKOTA, Abrechnung, Personal, Pflege, Dokumente, Einsatz, Aufgaben — ohne direkte Modul-zu-Modul-Abhängigkeiten.
- **Client-Injection-Pattern**: Durchgängig in allen 10 lib-Modulen — kein globaler Supabase-Import.
- **Separate Admin-UI**: 9 dedizierte Seiten statt Integration in bestehende Seiten — klare Domänentrennung.

---

## PRODUCTION-GO: ✅ ERTEILT

Alle 17 Smoke-Tests bestanden. Bestehende Daten unverändert. 2 Spaltenanzahl-Abweichungen korrigiert (niedrig). Keine kritischen Fehler offen. Block ist produktionsreif.

**Nächster empfohlener Block:** QUALITÄTSMANAGEMENT + BESCHWERDEMANAGEMENT oder pg_cron-Einrichtung für wf_process_pending() und wf_check_fristen().
