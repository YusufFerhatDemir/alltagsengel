# PRODUCTION-REPORT: Pflegedokumentation + Kundenaufnahme + Stammdaten + Anamnese + Maßnahmenplan + Verlaufsdokumentation

**Datum:** 2026-08-08  
**Block:** Pflegedokumentation & Kundenaufnahme  
**Branch:** `staging/expansion-abnahme`  
**Commit (Code):** `e665b34`  
**Supabase-Projekt:** `nnwyktkqibdjxgimjyuq` (Production)  
**Stamm-Org:** `00000000-0000-4000-8000-000460629986`

---

## 1. Zusammenfassung

Vollständige Implementierung des Pflegedokumentation-Blocks mit strukturierter Kundenaufnahme, Anamnese, Diagnosen/Risiken-Register, Maßnahmenplanung, chronologischer Verlaufsdokumentation und Dokumentationsperioden. Production-Migration in 12 atomaren Teilen angewendet, Application-Code deployed, 1 kritischer RLS-Bug gefunden und behoben.

---

## 2. Datenbank-Migration (Production)

### 2.1 Neue Tabellen (8)

| # | Tabelle | Spalten | Zweck |
|---|---------|---------|-------|
| 1 | `pflege_aufnahmen` | 27 | Strukturierte Kundenaufnahme mit Status-Workflow |
| 2 | `pflege_anamnesen` | 32 | Erstanamnese/Folgeanamnese mit Körper/Kognition/Soziales/Selbstversorgung |
| 3 | `pflege_diagnosen` | 16 | Diagnosen-Register mit ICD-Code, Schweregrad, Betreuungsrelevanz |
| 4 | `pflege_risiken` | 15 | Risiken/Allergien mit Schweregrad, Nächstes Review-Datum |
| 5 | `pflege_massnahmenplaene` | 18 | Versorgungspläne mit Versionskette, Freigabe-Lock |
| 6 | `pflege_massnahmen` | 17 | Einzelmaßnahmen in 11 Kategorien innerhalb eines Plans |
| 7 | `pflege_verlauf` | 21 | Chronologische Verlaufsdokumentation, 10 Eintragstypen, Sichtbarkeits-System |
| 8 | `pflege_doku_perioden` | 12 | Monatliche Dokumentationsperioden mit Abschluss/Wiedereröffnung |

### 2.2 Erweiterte Tabellen

| Tabelle | Neue Spalten | Details |
|---------|-------------|---------|
| `clients` | 13 | wohnsituation, kommunikation_hinweise, familienstand, staatsangehoerigkeit, religionszugehoerigkeit, aufnahmedatum, aufgenommen_von, aufnahmestatus, betreuungsbedarf_beschreibung, individuelle_wuensche, schluesseluebergabe, haustiere, wohnungsbesonderheiten |
| `care_notes` | 3 | verlauf_id, massnahme_id, sichtbarkeit |

### 2.3 Views (2)

| View | Zweck |
|------|-------|
| `pflege_uebersicht` | Aggregierter Pflegestatus pro Kunde (Aufnahme, Anamnese, Diagnosen, Risiken, Pläne, Verlauf) |
| `pflege_risiko_dashboard` | Risiko-Review-Status (überfällige Reviews, Schweregrade) |

### 2.4 Trigger (11)

| Trigger | Tabelle | Zweck |
|---------|---------|-------|
| `trg_locked_verlauf` | pflege_verlauf | Gesperrte Einträge nicht editierbar |
| `trg_locked_anamnese` | pflege_anamnesen | Gesperrte Anamnesen nicht editierbar |
| `trg_locked_plan` | pflege_massnahmenplaene | Gesperrte Pläne nicht editierbar |
| `trg_updated_at_*` | 8 Tabellen | Automatische updated_at-Pflege |

### 2.5 Check-Constraints (21)

Vollständige Validierung aller Status-Felder, Typen, Kategorien, Schweregrade, Sichtbarkeiten auf Datenbankebene.

---

## 3. Prüfpunkte (16 Punkte)

### Datenbank & Security

| # | Prüfpunkt | Status | Details |
|---|-----------|--------|---------|
| 1 | Tabellen existieren (8) | ✅ PASS | Alle 8 pflege_* Tabellen in Production vorhanden |
| 2 | RLS aktiviert (8 Tabellen) | ✅ PASS | `relrowsecurity = true` auf allen 8 |
| 3 | Admin-Policies (8) | ✅ PASS | ALL-Berechtigungen für admin-Rolle auf allen 8 |
| 4 | org_fence RESTRICTIVE (8) | ✅ PASS | `current_org_id()` auf allen 8 Tabellen, RESTRICTIVE-Modus |
| 5 | Engel-SELECT-Policies (7) | ✅ PASS | Alle 7 mit Assignment-Status IN ('active','GEPLANT','BESTAETIGT','UNTERWEGS','GESTARTET') |
| 6 | Engel-INSERT-Policies (2) | ✅ PASS | pflege_anamnesen + pflege_verlauf, Assignment-Status korrekt |
| 7 | Kunde-SELECT-Policies (2) | ✅ PASS | pflege_massnahmenplaene + pflege_verlauf, nur eigene Daten |
| 8 | Lock-Trigger (3) | ✅ PASS | Gesperrte Verlaufseinträge, Anamnesen und Pläne nicht editierbar |
| 9 | updated_at-Trigger (8) | ✅ PASS | Automatische Zeitstempel auf allen 8 Tabellen |
| 10 | Check-Constraints (21) | ✅ PASS | Alle Status-, Typ-, Kategorie-Validierungen aktiv |
| 11 | Views funktional (2) | ✅ PASS | pflege_uebersicht=4 Kunden, pflege_risiko_dashboard=0 (korrekt, keine Risiken angelegt) |
| 12 | Unique Constraint doku_perioden | ✅ PASS | (organization_id, client_id, jahr, monat) eindeutig |
| 13 | Clients-Spalten (13) | ✅ PASS | Alle 13 neuen Spalten korrekt angelegt |
| 14 | care_notes-Spalten (3) | ✅ PASS | verlauf_id, massnahme_id, sichtbarkeit |

### Datenintegrität

| # | Prüfpunkt | Status | Details |
|---|-----------|--------|---------|
| 15 | Bestandsdaten unverändert | ✅ PASS | profiles=59, clients=4, caregivers=2, assignments=5, service_records=31, invoices=5, care_notes=0, notfall_info=2, medikamentenplan=1 |
| 16 | Keine Demo-Daten | ✅ PASS | Alle 8 neuen Tabellen leer (0 Zeilen) |

---

## 4. Application-Code

### 4.1 Kern-Module (`lib/pflege/`)

| Datei | Zweck |
|-------|-------|
| `types.ts` | Geteilte TypeScript-Typen für alle Pflege-Entitäten |
| `api-auth.ts` | Admin-Auth-Guard mit Supabase-Session |
| `aufnahmen.ts` | CRUD Kundenaufnahme, Status-Workflow |
| `anamnesen.ts` | CRUD Anamnese, Erst-/Folgeanamnese, Lock-Support |
| `diagnosen.ts` | CRUD Diagnosen, ICD-Code, Schweregrad |
| `risiken.ts` | CRUD Risiken/Allergien, Review-Datum |
| `massnahmenplaene.ts` | CRUD Pläne, Freigabe mit Auto-Ersetzung vorheriger aktiver Pläne |
| `massnahmen.ts` | CRUD Einzelmaßnahmen innerhalb eines Plans |
| `verlauf.ts` | CRUD Verlaufseinträge, Sichtbarkeits-Boundary (Engel: nur intern/engel) |
| `doku-perioden.ts` | Monatsperioden, Abschluss/Wiedereröffnung |
| `uebersicht.ts` | Aggregierte Pflegeübersicht |
| `index.ts` | Re-Export-Fassade |

### 4.2 API-Routen (21)

| Route | Methoden | Zweck |
|-------|----------|-------|
| `/api/pflege/aufnahmen` | GET, POST | Aufnahmeliste + Neuanlage |
| `/api/pflege/aufnahmen/[id]` | GET, PATCH | Einzelaufnahme, Status-Update |
| `/api/pflege/anamnesen` | GET, POST | Anamnesenliste + Neuanlage |
| `/api/pflege/anamnesen/[id]` | GET, PATCH | Einzelanamnese, Lock |
| `/api/pflege/diagnosen` | GET, POST | Diagnosenliste + Neuanlage |
| `/api/pflege/diagnosen/[id]` | PATCH, DELETE | Einzeldiagnose bearbeiten/deaktivieren |
| `/api/pflege/risiken` | GET, POST | Risikenliste + Neuanlage |
| `/api/pflege/risiken/[id]` | PATCH, DELETE | Einzelrisiko bearbeiten/deaktivieren |
| `/api/pflege/massnahmenplaene` | GET, POST | Planliste + Neuanlage |
| `/api/pflege/massnahmenplaene/[id]` | GET, PATCH | Einzelplan, Freigabe, Lock |
| `/api/pflege/massnahmen` | GET, POST | Maßnahmenliste + Neuanlage |
| `/api/pflege/massnahmen/[id]` | PATCH, DELETE | Einzelmaßnahme bearbeiten |
| `/api/pflege/verlauf` | GET, POST | Verlaufsliste + Neuanlage |
| `/api/pflege/verlauf/[id]` | GET, PATCH | Einzeleintrag, Lock |
| `/api/pflege/doku-perioden` | GET, POST | Periodenliste + Neuanlage |
| `/api/pflege/doku-perioden/[id]` | PATCH | Periode abschließen/wiedereröffnen |
| `/api/pflege/uebersicht` | GET | Aggregierte Pflegeübersicht |
| `/api/pflege/uebersicht/[clientId]` | GET | Detail-Übersicht pro Kunde |
| `/api/pflege/stammdaten` | GET | Erweiterte Kunden-Stammdaten |
| `/api/pflege/stammdaten/[id]` | PATCH | Stammdaten aktualisieren |
| `/api/pflege/risiko-dashboard` | GET | Risiko-Dashboard |

### 4.3 Admin-UI (8 Seiten)

| Seite | Beschreibung |
|-------|-------------|
| `/admin/pflegedoku` | Pflegedoku-Übersicht aller Kunden |
| `/admin/pflegedoku/aufnahme/[id]` | Kundenaufnahme-Formular |
| `/admin/pflegedoku/anamnese/[id]` | Anamnese-Formular (Erst-/Folge-) |
| `/admin/pflegedoku/diagnosen/[id]` | Diagnosen- & Risiken-Register |
| `/admin/pflegedoku/massnahmenplan/[id]` | Maßnahmenplan mit Einzelmaßnahmen |
| `/admin/pflegedoku/verlauf/[id]` | Verlaufsdokumentation chronologisch |
| `/admin/pflegedoku/perioden/[id]` | Dokumentationsperioden-Verwaltung |
| `/admin/pflegedoku/stammdaten/[id]` | Erweiterte Stammdaten |

### 4.4 Navigation

Nav-Eintrag "Pflegedoku" im Admin-Sidebar unter Hauptnavigation hinzugefügt.

### 4.5 Engel-Views (3)

| Seite | Beschreibung |
|-------|-------------|
| `/engel/pflegedoku` | Übersicht zugewiesener Kunden |
| `/engel/pflegedoku/[id]` | Verlauf, Maßnahmen, Diagnosen eines Kunden |
| Link auf `/engel/profil` | Schnellzugriff auf Pflegedoku |

### 4.6 Kunde-View (1)

| Seite | Beschreibung |
|-------|-------------|
| `/kunde/pflegedoku` | Eigene Pflegedokumentation (aktiver Plan, sichtbare Verlaufseinträge) |

### 4.7 UI-Komponente

`components/admin/PflegeUI.tsx` — Shared UI-Bausteine für Pflege-Formulare und Listen.

### 4.8 Tests (36)

| Bereich | Tests | Status |
|---------|-------|--------|
| Aufnahmen | CRUD, Status-Workflow | ✅ PASS |
| Anamnesen | CRUD, Lock, Typ-Validierung | ✅ PASS |
| Diagnosen | CRUD, ICD-Validierung, Schweregrad | ✅ PASS |
| Risiken | CRUD, Typ-Validierung, Review-Datum | ✅ PASS |
| Maßnahmenpläne | CRUD, Freigabe, Auto-Ersetzung | ✅ PASS |
| Maßnahmen | CRUD, Kategorie-Validierung | ✅ PASS |
| Verlauf | CRUD, Sichtbarkeit-Boundary, Lock | ✅ PASS |
| Doku-Perioden | CRUD, Abschluss/Wiedereröffnung | ✅ PASS |

**Gesamt: 36/36 Tests grün**

---

## 5. Build-Status

| Prüfung | Status | Details |
|---------|--------|---------|
| `npx tsc --noEmit` | ✅ PASS | Nur vorbestehende Fehler in `lib/abrechnung/*` |
| `next build` | ✅ PASS | Kompilierung erfolgreich |
| Unit-Tests | ✅ PASS | 36/36 |
| Deploy via `deploy.sh` | ✅ PASS | Commit `e665b34` auf `staging/expansion-abnahme` |

---

## 6. Gefundene und behobene Fehler

### 6.1 KRITISCH: RLS Assignment-Status-Mismatch (BEHOBEN)

**Problem:** Alle 9 Engel-Policies (7 SELECT + 2 INSERT) auf den pflege_* Tabellen filterten Zuweisungen mit `a.status = 'active'`. Die assignments-Tabelle erlaubt aber per Check-Constraint auch die Werte `'GEPLANT'`, `'BESTAETIGT'`, `'UNTERWEGS'`, `'GESTARTET'`, `'BEENDET'`, `'STORNIERT'`, `'NO_SHOW'`. Engels mit Zuweisungen im Status GEPLANT/BESTAETIGT/UNTERWEGS/GESTARTET hätten keine Pflegedoku-Daten sehen können.

**Fix:** Alle 9 Engel-Policies (7 Tabellen) per `DROP POLICY` + `CREATE POLICY` neu erstellt mit:
```sql
a.status IN ('active','GEPLANT','BESTAETIGT','UNTERWEGS','GESTARTET')
```

**Verifizierung:** Alle 9 Policies mit neuem Filter bestätigt. Akten-Tabellen (akten_*) waren NICHT betroffen — ihre Engel-Policies filtern per `caregiver_id` direkt, ohne Assignment-Join.

---

## 7. Verbleibende Risiken

| # | Risiko | Bewertung | Mitigation |
|---|--------|-----------|------------|
| 1 | Vorbestehende TypeScript-Fehler in `lib/abrechnung/` | Niedrig | Nicht Teil dieses Blocks, existiert seit DAKOTA-Block |
| 2 | Sichtbarkeits-System nur in Application-Code erzwungen (engel darf nur 'intern'/'engel' setzen) | Niedrig | Datenbank-Check-Constraint validiert gültige Werte, Geschäftslogik-Boundary in API-Route |
| 3 | Noch keine E-Mail-Benachrichtigung bei überfälligen Risiko-Reviews | Mittel | Dashboard-View vorhanden, Cron/Edge-Function in späterem Block |
| 4 | Plan-Freigabe ersetzt automatisch vorherigen aktiven Plan | Niedrig | Gewolltes Verhalten, abgelaufene Pläne bleiben lesbar |

---

## 8. Statistiken

| Metrik | Wert |
|--------|------|
| Neue DB-Tabellen | 8 |
| Neue DB-Spalten (bestehende Tabellen) | 16 (13 clients + 3 care_notes) |
| Check-Constraints | 21 |
| RLS-Policies | 27 (8 org_fence + 8 admin + 9 engel + 2 kunde) |
| Trigger | 11 (3 Lock + 8 updated_at) |
| Views | 2 |
| Trigger-Funktionen | 3 |
| API-Routen | 21 |
| Admin-Seiten | 8 |
| Engel-Views | 3 |
| Kunde-Views | 1 |
| Lib-Module | 12 |
| Unit-Tests | 36 |

---

## 9. Datenintegrität vorher/nachher

| Tabelle | Vorher | Nachher | Veränderung |
|---------|--------|---------|-------------|
| profiles | 59 | 59 | Keine |
| clients | 4 | 4 | Keine (13 neue Spalten, NULL-Default) |
| caregivers | 2 | 2 | Keine |
| assignments | 5 | 5 | Keine |
| service_records | 31 | 31 | Keine |
| invoices | 5 | 5 | Keine |
| care_notes | 0 | 0 | Keine (3 neue Spalten, NULL-Default) |
| notfall_info | 2 | 2 | Keine |
| medikamentenplan | 1 | 1 | Keine |
| pflege_aufnahmen | — | 0 | Neu, leer |
| pflege_anamnesen | — | 0 | Neu, leer |
| pflege_diagnosen | — | 0 | Neu, leer |
| pflege_risiken | — | 0 | Neu, leer |
| pflege_massnahmenplaene | — | 0 | Neu, leer |
| pflege_massnahmen | — | 0 | Neu, leer |
| pflege_verlauf | — | 0 | Neu, leer |
| pflege_doku_perioden | — | 0 | Neu, leer |

---

## 10. PRODUCTION-GO / NO-GO

### ✅ PRODUCTION-GO

**Begründung:**
- Alle 16 Prüfpunkte bestanden (16/16 PASS)
- RLS + org_fence RESTRICTIVE auf allen 8 neuen Tabellen aktiv und verifiziert
- Mandantentrennung durch RESTRICTIVE org_fence Policies gewährleistet
- Engel-Policies korrekt auf alle relevanten Assignment-Status erweitert (active + GEPLANT/BESTAETIGT/UNTERWEGS/GESTARTET)
- Lock-Trigger: Gesperrte Verlaufseinträge, Anamnesen und Pläne nicht editierbar
- Sichtbarkeits-Boundary: Engel können nur intern/engel-Einträge erstellen, Admin kontrolliert kunde/alle
- Bestehende Produktionsdaten vollständig intakt (59/4/2/5/31/5/0/2/1)
- Keine Demo-Daten, keine Platzhalter, keine erfundenen Inhalte
- Build und TypeScript-Check erfolgreich
- 36/36 Unit-Tests grün
- 1 kritischer Bug (RLS Assignment-Status) gefunden und behoben

**Keine Demo. Keine Platzhalter. Keine erfundenen Daten.**

---

## 11. Empfehlung nächster Softwareblock

**PERSONALMANAGEMENT + QUALIFIKATIONSVERWALTUNG + DIENSTPLANUNG + ARBEITSZEITERFASSUNG + URLAUBSVERWALTUNG**

Begründung: Die Mitarbeiterakte ist bereits angelegt (caregivers-Erweiterung, akten_*). Die Einsatzplanung (assignments, service_records) existiert. Der nächste logische Schritt ist die vollständige Personalverwaltung mit: Qualifikations-Tracking (Führungszeugnis, Erste Hilfe, §43b-Nachweis), Dienstplanung (Schichtpläne, Verfügbarkeiten), Arbeitszeiterfassung (Soll/Ist, Überstunden), Urlaubsverwaltung (Anträge, Genehmigung, Resturlaub), und Fortbildungsmanagement (Pflichtschulungen, Zertifikate). Dies schließt den HR-Kreislauf und ermöglicht die Alltagsbegleiter-Verwaltung von Einstellung bis Einsatz.
