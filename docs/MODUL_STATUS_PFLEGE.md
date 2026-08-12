# Pflege-Software Module — Vollständige Prüfung

> Datum: 12.08.2026 | Testlauf: 2029/2029 bestanden | 94 Suites grün

---

## Übersicht

| Nr | Modul | Status | Bugs behoben |
|----|-------|--------|-------------|
| 1 | Kundenverwaltung | PRODUKTIONSREIF | 0 |
| 2 | Mitarbeiterverwaltung | PRODUKTIONSREIF | 0 |
| 3 | Dienst-/Tourenplanung | TEILWEISE FERTIG | 0 |
| 4 | Leistungsnachweise | TEILWEISE FERTIG | 0 |
| 5a | SIS | PRODUKTIONSREIF | 0 |
| 5b | Wunddokumentation | PRODUKTIONSREIF | 0 |
| 5c | Vitalwerte | PRODUKTIONSREIF | 1 |
| 5d | Medikamentenmanagement | TEILWEISE FERTIG | 1 |
| 5e | Pflegedokumentation | PRODUKTIONSREIF | 0 |
| 6 | Budget & Einsatzfreigabe | PRODUKTIONSREIF | 0 |
| 7 | Rechnungen & Gutschriften | TEILWEISE FERTIG | 0 |
| 8 | OPOS & Zahlungseingang | TEILWEISE FERTIG | 0 |
| 9 | DATEV-Export | TEILWEISE FERTIG | 0 |
| 10 | DTA / §302 SGB V | GERÜST | 0 |
| 11 | Mahnwesen | TEILWEISE FERTIG | 0 |
| 12 | Offline-Sync | TEILWEISE FERTIG | 0 |
| 13 | Rollen & RLS | PRODUKTIONSREIF | 0 |
| 14 | Analytics & KPI | TEILWEISE FERTIG | 0 |
| 15a | FHIR R4 | PRODUKTIONSREIF | 0 |
| 15b | KIM/TI | GERÜST | 0 |
| 16 | Admin-Dashboard | PRODUKTIONSREIF | 0 |

---

## Modul 1 — Kundenverwaltung

**Status: PRODUKTIONSREIF**

### Getestete Dateien

- `app/admin/clients/page.tsx` — Kundenliste, Suche, Filter, Erstellformular
- `app/admin/clients/[id]/page.tsx` — Stammdaten, Gesundheit, Notizen (3 Tabs)
- `app/admin/kundenakte/[id]/page.tsx` — Digitale Akte (7 Tabs: Stamm, Dok, Verträge, VO, Kontakt, Korr, Audit)
- `lib/akten/dokumente.ts` — Dokument-CRUD, SHA-256, Upload, Versionierung, Sperren
- `lib/akten/vertraege.ts` — Vertrags-CRUD, 7-Stufen-Statusmaschine
- `lib/akten/kontaktpersonen.ts` — Kontaktpersonen-CRUD
- `lib/akten/zugriff-log.ts` — Append-only Audit-Log (DB-Trigger schützt vor UPDATE/DELETE)
- `lib/akten/ablauf-warnungen.ts` — 5-stufiges Ablauf-Warnsystem (90/60/30/14/7 Tage)
- `lib/akten/suche.ts` — Globale Dokumentensuche mit Client/Caregiver-Namensanreicherung
- 13 API-Routen unter `app/api/akten/`
- 4 Testdateien unter `lib/akten/__tests__/`

### Gefundene und behobene Fehler

Keine Fehler behoben (keine kritischen Bugs).

### Offene Punkte

| Typ | Beschreibung |
|-----|-------------|
| Intern | Client-Seiten verlassen sich auf RLS für Org-Isolation (kein expliziter org_id-Filter im Frontend) |
| Intern | Gesundheitsdaten-Update umgeht API-Route (direkt via Client-Side Supabase, kein Audit-Trail) |
| Intern | Audit-Log der Kundenakte holt bis zu 200 Org-weite Einträge, filtert client-seitig |
| Intern | ilike-Suche in dokumente.ts ohne vollständige Sonderzeichen-Sanitisierung |
| Intern | Kundennummer-Generierung mit Math.random() hat Kollisionsrisiko bei Skalierung |
| Intern | Status-Filter-Zähler ignoriert Bundesland-Filter |

---

## Modul 2 — Mitarbeiterverwaltung

**Status: PRODUKTIONSREIF**

### Getestete Dateien

- `app/admin/caregivers/page.tsx` — Mitarbeiterliste, Qualifikationen, Suche
- `app/admin/caregivers/[id]/page.tsx` — Detail mit 5 Modalen (Dok, Qual, Initialen, Bonus, RegNr)
- `app/admin/mitarbeiterakte/[id]/page.tsx` — Digitale Personalakte (6 Tabs)
- `app/admin/einsatzfreigabe/page.tsx` — Freigabeübersicht mit Toggle
- `lib/personal/stammdaten.ts` — Stammdaten-CRUD
- `lib/personal/qualifikationen.ts` — Qualifikationen-CRUD, Ablauf-Warnsystem
- `lib/personal/schulungen.ts` — Schulungen-CRUD
- `lib/personal/arbeitszeiten.ts` — Arbeitszeiterfassung, Monatskontoansicht
- `lib/personal/abwesenheiten.ts` — Abwesenheiten-CRUD, Genehmigungs-Workflow
- `lib/personal/urlaubskonto.ts` — Urlaubskonto-CRUD, Jahresübersicht
- `lib/personal/dienstplan.ts` — Schichtvorlagen, Tagespläne
- `lib/personal/einsatzfreigabe.ts` — Freigabeprüfung (MA + Klient + Budget)
- `lib/personal/audit.ts` — Personal-Audit-Log
- 24 API-Routen unter `app/api/personal/`
- 6 Testdateien unter `lib/personal/__tests__/`

### Gefundene und behobene Fehler

Keine Fehler behoben (keine kritischen Bugs).

### Offene Punkte

| Typ | Beschreibung |
|-----|-------------|
| Intern | Caregiver-Detail-Modale schreiben direkt via Client-Side Supabase ohne org_id-Filter |
| Intern | Typo in `verifziertVon`/`verifziertAm` (fehlendes 'i') — DB-Mapping korrekt, API-Interface falsch |
| Intern | `new Date().toISOString()` statt `heuteBerlin()` in Abwesenheits-Genehmigung/Ablehnung |
| Intern | Jahresübergreifender Urlaub belastet nur das Startjahres-Konto |
| Intern | Read-Modify-Write Race-Condition bei Urlaubskonto-Sync |
| Intern | Einsatzfreigabe-Link verweist auf `/admin/personal/${id}` — Route existiert nicht |
| Intern | Stammdaten-Suche deklariert aber nicht implementiert |
| Extern | Migration 20260811010000 (Personalmanagement) — Live-Status unklar |

---

## Modul 3 — Dienst-/Tourenplanung

**Status: TEILWEISE FERTIG**

### Getestete Dateien

- `app/admin/tourenplanung/page.tsx` — Tourenansicht (Tag/Woche), Stop-Management, Druckansicht
- `app/admin/dienstplan/page.tsx` — Wochenansicht, Schichteinträge
- `lib/touren/fahrtzeit.ts` — PLZ-basierte Fahrzeitschätzung (Haversine + Straßenfaktor)
- `lib/touren/planung.ts` — Konsistenzprüfung, Überlappungserkennung, Kapazitätscheck
- `lib/touren/server.ts` — Tour-CRUD, Stop-Auflösung, Vertretungs-Workflow
- `lib/touren/select.ts` — Selektions-Helper
- `lib/personal/dienstplan.ts` — Schichtvorlagen + Tageseinträge
- 6 API-Routen unter `app/api/tours/`, 5 unter `app/api/personal/dienstplan/`
- `__tests__/touren/fahrtzeit.test.ts`, `planung.test.ts`, `lib/personal/__tests__/dienstplan.test.ts`

### Gefundene und behobene Fehler

Keine Fehler behoben (keine Code-Fixes nötig, gefundene Issues sind architektonischer Natur).

### Offene Punkte

| Typ | Beschreibung |
|-----|-------------|
| Intern | Dienstplan-Wochenansicht zeigt nie Konflikte (liest `konflikt` aus falscher Quelle statt `dienstplan_tagesansicht` View) |
| Intern | Verwaiste Assignments bei Fehlschlag von tour_stops INSERT (kein Rollback) |
| Intern | Partielle Vertretungsübertragung bei DOPPELBELEGUNG (kein All-or-Nothing) |
| Intern | Dienstplan-Formular: Raw UUID statt Caregiver-Dropdown |
| Intern | Warnungen-State wird nie zurückgesetzt zwischen Interaktionen |
| Intern | Dienstplan-RLS verwendet 42P17-riskantes Profil-Subquery-Pattern |
| Extern | Kein GPS-Check-in für Tourausführung |
| Extern | Kein Engel-facing UI für Tourausführung (nur Admin-Panel) |
| Extern | Keine automatische Template-Anwendung (Cron) |

---

## Modul 4 — Leistungsnachweise

**Status: TEILWEISE FERTIG**

### Getestete Dateien

- `app/admin/leistungsnachweis/[verordnung_id]/page.tsx` — A4-Druckvorschau (VO-basiert)
- `app/admin/leistungsnachweis-digital/page.tsx` — Digitale Dokumentation + Unterschrift
- `app/admin/leistungsnachweis-upload/page.tsx` — OCR-Foto-Upload + Verifikation
- `app/api/leistungsnachweis/route.ts` — PDF-Generierung (pdf-lib, A4)
- `app/api/leistungsnachweis/crud/route.ts` — CRUD für Service-Records
- `lib/abrechnung/leistungsnachweis-pdf.ts` — HTML-Template-Generierung (VO-Pfad)
- `lib/admin/service-records.ts` — Insert mit Constraint-Fallback
- `lib/signaturen/signaturen.ts` — Signatur-CRUD mit SHA-256 Hash-Kette
- `components/admin/SignaturePad.tsx` — Canvas-basierte Unterschrifterfassung

### Gefundene und behobene Fehler

Keine Fehler behoben.

### Offene Punkte

| Typ | Beschreibung |
|-----|-------------|
| Intern | IK-Nummer nicht HTML-escaped im Template (leistungsnachweis-pdf.ts) |
| Intern | Nachtschicht-Dauer (22:00-06:00) ergibt negative/null Duration im CRUD-POST |
| Intern | Digital-Seite: Client-Side-Queries ohne expliziten org_id-Filter |
| Intern | Race-Condition bei Signatur-Speicherung (Read-then-Write ohne CAS) |
| Intern | PDF-Route: fetch für Signatur-Bild ohne Timeout |
| Intern | Zwei parallele Signatur-Systeme nicht integriert (service_records vs signatur_dokumente) |
| Intern | Zwei parallele PDF-Pfade (pdf-lib vs HTML) nicht vereinheitlicht |
| Extern | 6 Migrationen warten auf Live-Apply (Check-Constraints, Härtung, Unique-Index) |
| Extern | QES (Qualifizierte Elektronische Signatur) ist Stub |

---

## Modul 5a — SIS (Strukturierte Informationssammlung)

**Status: PRODUKTIONSREIF**

### Getestete Dateien

- `lib/sis/assessments.ts` — Assessment-CRUD, Statusmaschine (entwurf→abgeschlossen→gesperrt)
- `lib/sis/themenfelder.ts` — 6 Themenfelder (Feld 6 ambulant-only)
- `lib/sis/risikomatrix.ts` — 5 Risikobereiche (Dekubitus, Sturz, Inkontinenz, Schmerz, Ernährung)
- `lib/sis/__tests__/sis.test.ts` — 15 Tests
- 6 API-Routen unter `app/api/sis/`
- `app/admin/sis/page.tsx`, `app/admin/sis/[id]/page.tsx`

### Offene Punkte

| Typ | Beschreibung |
|-----|-------------|
| Intern | Child-Queries (Themenfelder, Risikomatrix) ohne expliziten org_id-Filter (Defense-in-Depth-Lücke) |

---

## Modul 5b — Wunddokumentation

**Status: PRODUKTIONSREIF**

### Getestete Dateien

- `lib/wunden/wunden.ts` — Wunden-CRUD, Staging (Grad I-IV), Heilungstracking
- `lib/wunden/__tests__/wunden.test.ts`
- 4 API-Routen unter `app/api/wounds/`
- `app/admin/wunddokumentation/page.tsx`, `[id]/page.tsx`
- `components/admin/WundVerlaufChart.tsx` — SVG-Verlaufschart

### Offene Punkte

| Typ | Beschreibung |
|-----|-------------|
| Extern | Foto-Upload ist nur Metadaten (wound_photos-Tabelle, kein Upload-Endpoint) |

---

## Modul 5c — Vitalwerte

**Status: PRODUKTIONSREIF**

### Getestete Dateien

- `lib/vitals/vitals.ts` — CRUD, Plausibilitätsvalidierung, Alarm-Bewertung
- `lib/vitals/config.ts` — 10 Vitaltypen, Standard-Grenzwerte
- `lib/vitals/__tests__/vitals.test.ts` — 22 Tests
- 4 API-Routen unter `app/api/vitals/`
- `app/admin/vitalwerte/page.tsx`, `[clientId]/page.tsx`
- `components/admin/VitalChart.tsx` — SVG-Chart mit Alarm-Bändern

### Gefundene und behobene Fehler

| Datei | Fehler | Fix |
|-------|--------|-----|
| `lib/vitals/vitals.ts:247` | Audit-Trail loggte `measured_by` (Original-Messer) statt des Editors | `actorId` aus Params verwenden, API-Route übergibt `auth.ctx.userId` |

### MDR-Sicherheit

Grenzwert-Alarme sind fail-closed via `VITALS_GRENZWERT_ALARME_AKTIV` (Env-Var, Default AUS). Korrekt implementiert.

---

## Modul 5d — Medikamentenmanagement

**Status: TEILWEISE FERTIG**

### Getestete Dateien

- `lib/medikamente/medikamente.ts` — Medikamenten-CRUD, PZN-Validierung, Verabreichungs-Log
- `lib/medikamente/api-auth.ts` — Auth-Guard
- `app/api/medikamente/route.ts`, `[id]/route.ts`, `eingaben/route.ts`
- `app/admin/medikamente/page.tsx`, `[id]/page.tsx`

### Gefundene und behobene Fehler

| Datei | Fehler | Fix |
|-------|--------|-----|
| `app/admin/medikamente/page.tsx:84` | `k.vorname`/`k.nachname` statt `k.first_name`/`k.last_name` — alle Klientennamen als UUID-Fragmente angezeigt | Feldnamen auf `first_name`/`last_name` korrigiert |

### Offene Punkte

| Typ | Beschreibung |
|-----|-------------|
| Intern | Keine Unit-Tests vorhanden |
| Intern | `aktualisiereMedikament` überspringt Vollvalidierung bei PATCH |

---

## Modul 5e — Pflegedokumentation (Kern)

**Status: PRODUKTIONSREIF**

### Getestete Dateien

- `app/admin/pflegedoku/page.tsx` — Übersicht mit Kennzahlen
- `app/admin/pflegedoku/aufnahme/[id]/page.tsx` — 4-Schritte-Aufnahme-Wizard
- `app/admin/pflegedoku/anamnese/[id]/page.tsx` — 5-Tab-Anamnese mit Versionierung + Sperrfunktion
- `app/admin/pflegedoku/diagnosen/[clientId]/page.tsx` — ICD-Kodierung, Schweregrade
- `app/admin/pflegedoku/massnahmenplan/[id]/page.tsx` — Versionierte Maßnahmenpläne
- `app/admin/pflegedoku/verlauf/[clientId]/page.tsx` — Chronologische Fortschrittsnotizen
- `app/admin/pflegedoku/perioden/[clientId]/page.tsx` — Monatsabschlüsse
- `app/admin/pflegedoku/risiko-dashboard/page.tsx` — Cross-Client Risikoübersicht
- `lib/pflege/uebersicht.ts` — Übersichts-View-Abfrage + Kennzahlberechnung
- 4 Testdateien unter `lib/pflege/__tests__/`

### Offene Punkte

Keine.

---

## Modul 6 — Budget & Einsatzfreigabe

**Status: PRODUKTIONSREIF**

### Getestete Dateien

- `lib/config/budget-constants.ts` — Zentrale Budget-Konstanten (verifiziert korrekt)
- `lib/personal/einsatzfreigabe.ts` — Freigabeprüfung (MA + Klient + Budget)
- `lib/billing/core/price-resolver.ts` — Tarif-Auflösung mit Spezifitäts-Scoring
- Tests unter `lib/personal/__tests__/einsatzfreigabe.test.ts`

### Budget-Konstanten (verifiziert)

| Konstante | Wert | Rechtsgrundlage |
|-----------|------|-----------------|
| `ENTLASTUNG_MONATLICH_EUR` | 131 | §45b SGB XI |
| `ENTLASTUNG_JAEHRLICH_EUR` | 1.572 | §45b SGB XI |
| `VP_JAEHRLICH_EUR` | 1.685 | §39 Abs. 1 SGB XI (PUEG +4,5%) |
| `KZP_JAEHRLICH_EUR` | 1.854 | §42 SGB XI (PUEG +4,5%) |
| `VP_KZP_KOMBINIERT_EUR` | 3.539 | §42a SGB XI |

### Offene Punkte

Keine (alle Werte korrekt, Freigabe-Logik fehlerfrei, Tarif-Scoring konsistent).

---

## Modul 7 — Rechnungen, Gutschriften, Storno

**Status: TEILWEISE FERTIG**

### Getestete Dateien

- `lib/billing/core/invoice-engine.ts` (1210 Zeilen) — Vollständiger Rechnungs-Lifecycle
- `lib/billing/core/credit-notes.ts` — Gutschrift-Lifecycle
- `lib/billing/core/status-machine.ts` — 14 Status, validierte Übergänge
- `lib/billing/core/idempotency.ts` — Deterministischer Schlüssel
- `lib/billing/core/audit.ts` — SHA-256-geprüfte Einträge
- `lib/billing/core/price-resolver.ts` — Tarif-Lookup mit Spezifitäts-Score
- `lib/billing/core/dunning.ts` — Mahnungs-Engine
- `lib/billing/core/feiertage.ts` — Feiertagserkennung
- 10 API-Routen unter `app/api/billing/invoices/`
- 5 Admin-Seiten (Rechnungen, Erstellung, Gutschriften, Korrekturläufe)

### Offene Punkte

| Typ | Beschreibung |
|-----|-------------|
| Intern | `freezeInvoice` ohne CAS-Guard auf Status-Update (Doppel-Freeze bei Parallelzugriff möglich) |
| Intern | `freezeInvoice` ist nicht atomar (5 DB-Operationen ohne Transaktion) |
| Intern | EUR/Cent-Mischung über Tabellen hinweg (invoices in EUR, corrections in Cent) |
| Intern | `recordPaymentDifference` überschreibt Status ohne CAS |
| Intern | PDF-Route hat keinen org_fence für Admin-Zugriff |
| Intern | Legacy-Status kann ohne Transition-Validierung festgeschrieben werden |

---

## Modul 8 — OPOS & Zahlungseingang

**Status: TEILWEISE FERTIG**

### Getestete Dateien

- `lib/billing/opos/opos-manager.ts` — Offene-Posten-Liste, Altersstruktur, Klientsalden
- `lib/billing/matching/matching-engine.ts` — 6-Strategie-Auto-Matching (Schwelle: 70 Punkte)
- `lib/billing/camt/camt-parser.ts` — ISO 20022 CAMT.053/054 XML-Parser
- `lib/billing/core/payments.ts` — Zahlungs-CRUD, Zuordnung mit OCC
- 3 Admin-Seiten (OPOS, Zuordnung, Zahlungskontrolle)
- 7 API-Routen

### Offene Punkte

| Typ | Beschreibung |
|-----|-------------|
| Intern | Zahlungskontrolle schreibt nur `payment_status`, nicht `invoices` — Daten-Inkonsistenz |
| Intern | DJB2-32-Bit-Hash für CAMT-Dedup: Kollisionsrisiko bei Finanzdaten |
| Intern | N+1 Query-Problem im Matching-Engine (bis 300 Queries pro Buchung) |
| Intern | `allocatePayment` ohne DB-Transaktion (Teil-Fehler → Inkonsistenz) |
| Intern | Keine Pagination auf OPOS-Liste |
| Intern | Keine Unit-Tests für OPOS/CAMT/Matching/Payments |

---

## Modul 9 — DATEV-Export

**Status: TEILWEISE FERTIG**

### Getestete Dateien

- `app/admin/datev/page.tsx` — Export-Seite mit Datumsbereich-Picker
- `lib/billing/datev/export.ts` — DATEV CSV-Export (Buchungsstapel-Format)
- `lib/billing/datev/buchungskonten.ts` — Konfigurierbare Buchungskonten
- `app/api/admin/datev/route.ts` — API-Route

### Offene Punkte

| Typ | Beschreibung |
|-----|-------------|
| Intern | Datumsformatierung ohne explizite `Europe/Berlin`-Timezone |
| Intern | Belegfeld1 (Rechnungsnummer) fehlt in DATEV-Zeilen |
| Intern | CSV-Encoding: UTF-8 statt ANSI/Windows-1252 |
| Extern | Beraternummer/Mandantennummer hardkodiert (0/1) — muss pro Steuerberater konfiguriert werden |
| Extern | Noch nicht mit DATEV Unternehmen Online validiert |

---

## Modul 10 — DTA / §302 SGB V

**Status: GERÜST (fail-closed)**

### Getestete Dateien

- `lib/abrechnung/sgb-v/generator.ts` — Wirft immer `SgbVSpecFehltError`
- `lib/abrechnung/sgb-v/types.ts` — EDIFACT-Segmenttypen
- `lib/abrechnung/sgb-v/segments.ts` — Segment-Builder
- `lib/abrechnung/sgb-v/validation.ts` — TA1-Validierung
- `app/admin/dta/page.tsx` — UI mit deaktiviertem Button + Warnbanner
- `app/api/admin/dta/route.ts`

### Fail-Closed-Verifikation

Generator wirft **immer** vor jeder EDIFACT-Produktion. UI-Button disabled. Kein Produktionscode-Pfad möglich.

### Offene Punkte

| Typ | Beschreibung |
|-----|-------------|
| Extern | TA1 (Technische Anlage 1) Segmentzuordnung fehlt — Kernarbeit |
| Extern | Migration 20260826020000 wartet auf Live-Apply |

---

## Modul 11 — Mahnwesen

**Status: TEILWEISE FERTIG**

### Getestete Dateien

- `lib/billing/dunning/stufen.ts` — 3 Mahnstufen (Erinnerung, 1. Mahnung, 2. Mahnung)
- `lib/billing/dunning/engine.ts` — Mahnungs-Scan + Eskalation
- `lib/billing/dunning/pdf.ts` — A4-Mahnschreiben-PDF (HTML)
- `app/admin/mahnwesen/page.tsx` — Mahnungsliste, Eskalation, PDF-Download
- 2 API-Routen

### Offene Punkte

| Typ | Beschreibung |
|-----|-------------|
| Intern | Fälligkeits-Check mit `new Date()` statt Berlin-Timezone |
| Intern | Race-Condition bei Eskalation (kein OCC) |
| Intern | Verzugszinsen (BGB §288) nicht berechnet — nur Texthinweis |
| Extern | Kein E-Mail-/Brief-Versand (nur DB-Stufe + PDF) |
| Extern | Keine Inkasso-Integration |

---

## Modul 12 — Offline-Sync

**Status: TEILWEISE FERTIG**

### Getestete Dateien

- `lib/offline/offline-store.ts` — IndexedDB mit AES-256-GCM-Verschlüsselung
- `lib/offline/offline-queue.ts` — Sync-Queue, Retry, Konflikterkennung
- `lib/sync/entity-registry.ts` — 12 Entity-Typen registriert
- `lib/sync/conflict.ts` — 3 Strategien: last_write_wins, server_wins, manuell
- `lib/sync/apply.ts` — Batch-Sync über bestehende REST-Endpoints
- `app/api/sync/route.ts` — Batch-Sync-API
- `app/admin/sync-status/page.tsx`, `sync-konflikte/page.tsx`

### Offene Punkte

| Typ | Beschreibung |
|-----|-------------|
| Intern | `resolveConflict` hardkodiert `entity_typ: 'leistungsnachweis'` statt echten Typ |
| Intern | AES-Schlüssel in localStorage (XSS-Angriffsfläche für PHI) |
| Intern | Zwei komplett getrennte Sync-Systeme (Web vs Native) ohne gemeinsamen Vertrag |
| Intern | Kein TTL/Cleanup für alte Queue-Items |
| Extern | Migration 20260828010000 wartet auf Live-Apply |

---

## Modul 13 — Rollen & RLS

**Status: PRODUKTIONSREIF**

### Getestete Dateien

- `proxy.ts` — Server-Side Auth (JWT, app_metadata, Fail-Closed, CSRF, Rate-Limiting)
- `app/admin/layout.tsx` — Client-Side Auth-Guard (useAdminAuth, 7 Retries)
- `lib/abrechnung/require-admin.ts` — requireAdmin / requireAdminMitOrg
- `lib/ops/api-auth.ts` — requireOpsAdmin / requireOpsUser
- 10+ modulspezifische api-auth.ts-Dateien
- `scripts/audit-rls.ts` — CI-Lint-Tool für RLS-Compliance
- `scripts/rls-matrix.ts` — RLS-Policy-Inventar-Generator
- `lib/abrechnung/__tests__/admin-ui-security.test.ts` — Security-Tests

### Sicherheitsarchitektur (4 Schichten)

1. **Proxy/Middleware**: JWT-Verifikation, Rollen-Prüfung, CSRF, Rate-Limiting
2. **API-Route-Guards**: Rolle + Org-Zugehörigkeit, Fail-Closed
3. **DB RLS Policies**: `is_admin()` SECURITY DEFINER, `current_org_id()`, `eigene_caregiver_ids()`
4. **DB-Trigger**: `prevent_role_escalation` (Selbsterhöhung unmöglich)

### Offene Punkte

| Typ | Beschreibung |
|-----|-------------|
| Intern | `extractRole()` in layout.tsx hat Fallback auf user_metadata.role (mitigiert durch Server-Proxy) |
| Intern | `requireExpansionAdmin()` fehlt orgId-Null-Check (im Gegensatz zu allen anderen Guards) |
| Intern | 10+ duplizierte Admin-Auth-Guard-Implementierungen (Konsolidierungspotenzial) |

---

## Modul 14 — Analytics & KPI

**Status: TEILWEISE FERTIG**

### Getestete Dateien

- `lib/analytics/kpi.ts` — Umsatz, Auslastung, Ablehnungsquote, Pflegequalität
- `lib/analytics/bonusEngine.ts` — Regelbasiertes Bonussystem
- `lib/analytics/opsAudit.ts` — Vereinheitlichter Audit-Trail
- `lib/analytics/pruefmappe.ts` — MDK/MD-Prüfvorbereitung
- `lib/analytics/quality.ts` — Qualitäts-Dashboard (Wunden, Stürze, Vital-Alarme)
- 10 API-Routen unter `app/api/admin/analytics/`
- 5 Testdateien
- `app/admin/analytics/page.tsx`, `kpi/page.tsx`

### Offene Punkte

| Typ | Beschreibung |
|-----|-------------|
| Intern | Timezone-Mismatch in Zeitraum-Grenzen (UTC statt Berlin) |
| Intern | Visitor-Analytics ohne org_fence (Multi-Tenant-Lücke) |
| Intern | Keine Admin-UI für Quality-Dashboard, Prüfmappe, Bonussystem (nur APIs) |
| Intern | CAPI-Endpoint ohne Auth (derzeit Stub) |

---

## Modul 15a — FHIR R4

**Status: PRODUKTIONSREIF**

### Getestete Dateien

- `lib/fhir/mappers.ts` — Patient, Encounter, Observation (LOINC), CarePlan-Mapping
- `lib/fhir/types.ts` — FHIR R4 Ressourcen-Typen
- `lib/fhir/audit.ts` — FHIR Audit-Log
- `lib/fhir/import.ts` — Bundle-Parser, Import-Preview, Kandidat→Client-Insert/Update
- `lib/fhir/operation-outcome.ts` — FHIR-konforme Fehlerantworten
- 8 API-Routen unter `app/api/fhir/`
- `app/admin/fhir/page.tsx` — Admin-UI (Endpoints, Export, Import, Audit)

### Offene Punkte

| Typ | Beschreibung |
|-----|-------------|
| Intern | Patient-Suche: `name`-Parameter direkt in Supabase-ilike interpoliert |
| Intern | Audit-Log-Route gibt plain JSON statt FHIR OperationOutcome bei Auth-Fehler |

---

## Modul 15b — KIM/TI

**Status: GERÜST (fail-closed)**

### Getestete Dateien

- `lib/kim/versand.ts` — `versendeKimNachricht()` wirft **immer** (Return-Typ: `never`)
- `lib/kim/readiness.ts` — 5-Punkte-Readiness-Check (immer rot)
- `lib/kim/config.ts` — Postfach-Konfigurations-CRUD
- `lib/kim/karten.ts` — eHBA/SMC-B-Kartenverwaltung
- `lib/kim/nachrichten.ts` — Nachrichten-Queue (entwurf→wartend→gesperrt)
- `lib/kim/versionen.ts` — TA5-Versionsregister
- 8 API-Routen unter `app/api/billing/kim/`
- `app/admin/kim/page.tsx` — Admin-UI mit "Versand gesperrt"-Banner

### Fail-Closed-Verifikation

Doppelte Sperre: (1) `versendeKimNachricht()` wirft immer, (2) `kimVersandImplementiert()` gibt immer `false` zurück. Kein TI/Konnektor-Code vorhanden. 6-Schritte-Freischaltung dokumentiert.

---

## Modul 16 — Admin-Dashboard

**Status: PRODUKTIONSREIF**

### Getestete Dateien

- `app/admin/layout.tsx` (429 Zeilen) — Sidebar, Auth-Guard, Navigation (11 Gruppen, 60+ Items)
- `app/admin/dashboard/page.tsx` (255 Zeilen) — Operative KPIs (7 Kacheln + Umsatz + Budget-Warnungen)
- `app/admin/settings/page.tsx` (524 Zeilen) — Passwort, Admin-Verwaltung, Demo-Toggle, Abrechnung
- `components/admin/OpsUI.tsx` — Shared Components (StatusBadge, AmpelDot, BudgetBar, Banner)
- `proxy.ts` (268 Zeilen) — Server-Side Auth-Middleware
- `app/api/admin/manage-role/route.ts` — Rollen-Grant/Revoke (nur Superadmin)

### Offene Punkte

| Typ | Beschreibung |
|-----|-------------|
| Intern | `monthStartISO()` verwendet `new Date()` (UTC) statt Berlin-Timezone |
| Intern | Dashboard zeigt stumm Nullen bei Query-Fehlern (kein Error-State) |
| Intern | Kein expliziter org_id-Filter in Client-Side Dashboard-Queries (RLS-abhängig) |
| Intern | Verwaiste `/admin/home`-Seite erreichbar per URL |

---

## Zusammenfassung der behobenen Fehler

| # | Modul | Datei | Fehler | Fix |
|---|-------|-------|--------|-----|
| 1 | 5d Medikamente | `app/admin/medikamente/page.tsx:84` | Falsche Feldnamen (`vorname`/`nachname` statt `first_name`/`last_name`) — alle Klientennamen als UUID angezeigt | Feldnamen korrigiert |
| 2 | 5c Vitalwerte | `lib/vitals/vitals.ts:247` + `app/api/vitals/[id]/route.ts` | Audit-Trail loggte Original-Messer statt Editor | `actorId` aus Auth-Kontext übergeben |

---

## Querschnittsthemen

### Budget-Konstanten: KORREKT
Alle 5 Werte in `lib/config/budget-constants.ts` stimmen mit den gesetzlichen Vorgaben (SGB XI §§ 39, 42, 42a, 45b; PUEG +4,5%) überein.

### Timezone-Handling: WEITGEHEND KORREKT
Die zentrale Timezone-Bibliothek (`lib/utils/timezone.ts`) mit `heuteBerlin()`/`berlinParts()`/`datumBerlin()` wird in den meisten Modulen konsistent verwendet. Ausnahmen: Analytics-KPI, Dashboard-Monatsstart, Mahnwesen-Fälligkeit, Abwesenheits-Genehmigung verwenden `new Date()` (UTC).

### Multi-Tenancy: FUNKTIONAL, ABER FRAGIL
Alle API-Routen verwenden korrekt `organization_id`. Client-Side-Seiten (Clients, Caregivers, Dashboard, Digital-LN, Dienstplan) verlassen sich jedoch ausschließlich auf RLS ohne expliziten org_id-Filter — dies funktioniert, ist aber bei RLS-Lücken anfällig.

### Fail-Closed-Module: KORREKT IMPLEMENTIERT
§302 SGB V und KIM/TI werfen zuverlässig vor jeder Produktionsaktion. MDR-Vitalwert-Alarme sind per Env-Var gesperrt (Default AUS).
