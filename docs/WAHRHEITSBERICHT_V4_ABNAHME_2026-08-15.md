# WAHRHEITSBERICHT V4 — FINALE ABNAHME

**Datum:** 15.08.2026
**Art:** Unabhaengiger Abnahmecheck — keine Uebernahme alter Statuswerte
**Methode:** Live-DB-Abfragen, Codebase-Grep, tsc --noEmit, vitest run, Supabase-SQL

---

## Korrektur gegenueber V3

V3 behauptete: "24 FERTIG, 0 intern offen, 0 verbleibender Aufwand."
**Das war geschoent.** Diese V4 korrigiert das anhand nachpruefbarer Fakten.

Wesentliche V3-Fehler:
1. V3 ignorierte 143 client-seitige Supabase-Writes in Page-Komponenten (MIS, Admin, Portale)
2. V3 meldete "0 fehlgeschlagene Tests" — aktuell 2 Failed Tests
3. V3 behauptete "alle intern losbaren Luecken geschlossen" — falsch, 97 Writes in MIS+Admin ohne Server-Validierung
4. V3 verschwieg die geringe Produktionsdatenlage (nur Testdaten)

---

## A) 27 Module Einzelstatus

| # | Modul | Status | Production | DB | RLS | org\_fence | API Routes | Server Actions | Client-Side Writes | Bekannte Luecken | Externe Abhaengigkeit |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Klientenverwaltung | FERTIG | JA | JA | JA | JA | /api/admin/clients/* | — | 0 | — | — |
| 2 | Pflegedokumentation | FERTIG | JA | JA | JA | JA | /api/pflege/* (12 Routes) | — | 0 | — | — |
| 3 | Dienstplanung | FERTIG | JA | JA | JA | JA | /api/admin/dienstplan/* | schedule/actions.ts | 0 (migriert) | — | — |
| 4 | Abrechnung (§105) | FERTIG | JA | JA | JA | JA | /api/admin/abrechnung/* | abrechnung/actions.ts + 3 weitere | 0 (migriert) | — | — |
| 5 | Tourenplanung | FERTIG | JA | JA | JA | JA | /api/tours/* (6 Routes) | — | 0 | — | — |
| 6 | Personalverwaltung | FERTIG | JA | JA | JA | JA | /api/personal/* | — | 0 | — | — |
| 7 | Qualitaetsmanagement | FERTIG | JA | JA | JA | JA | /api/admin/analytics/quality | quality/actions.ts | 0 | — | — |
| 8 | Medikamentenmanagement | FERTIG | JA | JA | JA | JA | /api/pflege/medikamente/* | — | 0 | — | — |
| 9 | Wunddokumentation | FERTIG | JA | JA | JA | JA | /api/wounds/* (6 Routes) | — | 0 | — | — |
| 10 | Sturzprotokolle | FERTIG | JA | JA | JA | JA | /api/pflege/sturzprotokoll | — | 0 | Kein E2E-Test | — |
| 11 | FEM (Fixierungsprotokolle) | FERTIG | JA | JA | JA | JA | /api/admin/fixierungen/* | — | 0 | Dead-Ternary (kosmetisch) | — |
| 12 | Lagerungsprotokolle | FERTIG | JA | JA | JA | JA | /api/admin/lagerungsprotokoll | — | 0 | Kein E2E-Test | — |
| 13 | Pflegeplanung | FERTIG | JA | JA | JA | JA | /api/pflege/massnahmenplaene/* | — | 0 | — | — |
| 14 | Nachrichten/Intern | FERTIG | JA | JA | JA | JA | /api/ops/nachrichten/* | — | 0 | — | — |
| 15 | KIM/TI | EXTERN BLOCKIERT | JA | JA | JA | JA | /api/admin/kim/* (8 Routes) | — | 0 | Nicht nutzbar ohne TI-Konnektor | TI-Konnektor (gematik) |
| 16 | Aufgaben & Workflows | FERTIG (mit Einschr.) | JA | JA | JA | JA | /api/ops/* | — | 1 (Engel-Portal) | **2 fehlgeschlagene Tests** (delete→archive Mismatch) | — |
| 17 | Reporting/Analytics | FERTIG | JA | JA | JA | JA | /api/admin/analytics/* | analytics/actions.ts | 1 (MIS analytics) | — | — |
| 18 | Biografiebogen | FERTIG | JA | JA | JA | JA | /api/admin/biografiebogen/* | — | 0 | Kein E2E-Test | — |
| 19 | SEPA-Lastschrift | EXTERN BLOCKIERT | JA | JA | JA | JA | /api/admin/sepa/* | — | 0 | Nicht nutzbar ohne Creditor-ID | SEPA Creditor-ID (Bundesbank) |
| 20 | Wund-Assessment | FERTIG | JA | JA | JA | JA | /api/wounds/*/assessments | — | 0 | Immutable by Design | — |
| 21 | Wundbehandlung | FERTIG | JA | JA | JA | JA | /api/wounds/*/treatments | — | 0 | Immutable by Design | — |
| 22 | FEM-Ueberwachung | FERTIG | JA | JA | JA | JA | /api/admin/fixierungen/*/ueberwachung | — | 0 | — | — |
| 23 | Anamnese | FERTIG | JA | JA | JA | JA | /api/pflege/anamnesen/* | — | 0 | — | — |
| 24 | Angehoerigen-Portal | FERTIG | JA | JA | JA | JA | /api/admin/angehoerige/* | — | 0 | — | — |
| 25 | Pflege-Verlauf | FERTIG | JA | JA | JA | JA | /api/pflege/verlauf/* | — | 0 | — | — |
| 26 | Massnahmenplan | FERTIG | JA | JA | JA | JA | /api/pflege/massnahmenplaene/* | — | 0 | — | — |
| 27 | §302-Datenuebermittlung | EXTERN BLOCKIERT | JA | JA | JA | JA | /api/admin/dta/* | — | 0 | Nicht nutzbar ohne DAKOTA | DAKOTA-Adapter (ITSG) |

### Nicht in den 27 Modulen erfasst, aber mit erheblichem Client-Side-Write-Problem:

| Bereich | Client-Side Writes | Dateien | Bewertung |
|---|---|---|---|
| MIS Privacy | 7 | 1 | RLS-geschuetzt, aber keine Server-Validierung |
| MIS Recruiting | 7 | 1 | RLS-geschuetzt, aber keine Server-Validierung |
| MIS Scheduling | 6 | 1 | RLS-geschuetzt, aber keine Server-Validierung |
| MIS CRM | 6 | 1 | RLS-geschuetzt, aber keine Server-Validierung |
| MIS Training | 6 | 1 | RLS-geschuetzt, aber keine Server-Validierung |
| MIS Documents | 5 | 1 | RLS-geschuetzt, aber keine Server-Validierung |
| MIS Vehicles | 4 | 1 | RLS-geschuetzt, aber keine Server-Validierung |
| MIS Complaints | 4 | 1 | RLS-geschuetzt, aber keine Server-Validierung |
| MIS Contracts | 3 | 1 | RLS-geschuetzt, aber keine Server-Validierung |
| MIS Signatures | 3 | 1 | RLS-geschuetzt, aber keine Server-Validierung |
| MIS Krankenfahrt-Pricing | 3 | 1 | RLS-geschuetzt, aber keine Server-Validierung |
| MIS Krankenfahrten | 2 | 1 | RLS-geschuetzt, aber keine Server-Validierung |
| MIS Quality | 2 | 1 | RLS-geschuetzt, aber keine Server-Validierung |
| MIS Team | 2 | 1 | RLS-geschuetzt, aber keine Server-Validierung |
| MIS Supply-Chain | 1 | 1 | RLS-geschuetzt, aber keine Server-Validierung |
| Admin Verordnungen | 16 | 1 | **Hoechste Dichte** — keine Server-Validierung |
| Admin Settings | 6 | 1 | RLS-geschuetzt, aber keine Server-Validierung |
| Admin Leistungspreise | 3 | 1 | RLS-geschuetzt, aber keine Server-Validierung |
| Admin Kostentraeger | 3 | 1 | RLS-geschuetzt, aber keine Server-Validierung |
| Admin Annahmestellen | 2 | 1 | RLS-geschuetzt, aber keine Server-Validierung |
| Admin Applications | 2 | 1 | RLS-geschuetzt, aber keine Server-Validierung |
| Admin Pruefprotokoll | 1 | 1 | RLS-geschuetzt, aber keine Server-Validierung |
| Admin Bonuses | 1 | 1 | RLS-geschuetzt, aber keine Server-Validierung |
| Admin Leistungsnachweis-Upload | 1 | 1 | RLS-geschuetzt, aber keine Server-Validierung |
| Engel-Portal (6 Seiten) | 9 | 6 | Portal-Benutzer-Writes |
| Fahrer-Portal (5 Seiten) | 13 | 5 | Portal-Benutzer-Writes |
| Kunde-Portal (9 Seiten) | 16 | 9 | Portal-Benutzer-Writes |
| **Gesamt** | **143** | **44 Dateien** | |

---

## B) Status-Zusammenfassung

- **FERTIG: 23** (M1-M14, M17-M18, M20-M26) — Kern-CRUD ueber API-Routes (384 server-seitige Endpoints), RLS aktiv, org_fence vorhanden
- **FERTIG (mit Einschraenkungen): 1** (M16 Aufgaben) — 2 fehlgeschlagene Tests durch delete→archive Umbau
- **EXTERN BLOCKIERT: 3** (M15 KIM/TI, M19 SEPA, M27 §302) — Code vollstaendig, externe Infrastruktur fehlt
- **INTERN OFFEN: 0** bei den 27 Kern-Modulen

### Aber: MIS + Admin-Verwaltung hat 97 client-seitige Writes ohne Server-Validierung

Die 27 Kern-Module (Pflege, Abrechnung, Touren etc.) nutzen ueberwiegend API-Routes.
Die MIS-Verwaltungsmodule (Privacy, CRM, Recruiting, Training, Vehicles etc.) und einige Admin-Seiten (Verordnungen, Settings, Kostentraeger) schreiben direkt client-seitig in Supabase.

**Risikobewertung:** Gering bis mittel. Alle Writes sind durch RLS + org_fence geschuetzt (kein Cross-Tenant-Zugriff moeglich). Es fehlt aber Server-seitige Validierung (Datenintegritaet, Business-Rules) und zentrales Audit-Logging fuer diese Operationen.

---

## C) Intern noch loesbar

| Prioritaet | Problem | Aufwand (geschaetzt) | Beschreibung |
|---|---|---|---|
| P1 | 2 fehlgeschlagene Tests (M16 Aufgaben) | 1h | deleteAufgabe-Tests erwarten "geloescht", Code sendet "archiviert" |
| P2 | 62 MIS client-side Writes → Server Actions migrieren | 16-24h | 16 MIS-Seiten auf Server Actions/API Routes umstellen |
| P2 | 35 Admin client-side Writes → Server Actions migrieren | 8-12h | 9 Admin-Seiten (insb. Verordnungen mit 16 Writes) |
| P3 | 38 Portal client-side Writes → Server Actions migrieren | 8-12h | 20 Portal-Seiten (Engel/Fahrer/Kunde) |
| P3 | ~607 Catch-Blocks ohne strukturierte Fehlerbehandlung | 6-10h | Viele haben console.error (339), aber kein Toast/Sentry |
| P3 | 8 Tabellen ohne RESTRICTIVE org_fence | 2h | billing_landesregeln, billing_tarif_belege, billing_tariff_audit, organization_members, organization_subscriptions, state_settings, state_settings_audit, state_waitlist |

**Gesamt geschaetzter Aufwand: 41-61 Stunden**

---

## D) Externe Voraussetzungen

| Modul | Abhaengigkeit | Anbieter | Was passiert wenn es da ist |
|---|---|---|---|
| M15 KIM/TI | TI-Konnektor-Zugang | gematik / Konnektor-Hersteller | 8 API-Routes aktivieren, Konfiguration mit echtem Zertifikat |
| M19 SEPA | Glaeubiger-Identifikationsnummer | Deutsche Bundesbank | Mandatsgenerierung freischalten, Live-SEPA-XML-Produktion |
| M27 §302 | DAKOTA-Software-Adapter | ITSG GmbH | DTA-Pipeline aktivieren, Testlauf mit echten Kassendaten |

---

## E) Production-Status

| Metrik | Wert | Bewertung |
|---|---|---|
| TypeScript | 0 Fehler (tsc --noEmit clean) | OK |
| Tests | 3058 bestanden, **2 fehlgeschlagen**, 38 uebersprungen | WARNUNG |
| Fehlgeschlagene Tests | aufgaben.test.ts: deleteAufgabe (delete→archive Mismatch) | P1 Fix noetig |
| API Routes | 384 server-seitige Endpoints | Gut |
| Server Actions | 8 Dateien (schedule, abrechnung, invoices, quality, zahlungskontrolle, monatsabschluss, analytics) | Ausbaubar |
| Client-Side Writes | 143 in Page-Komponenten | Tech Debt |
| Build | Vercel Production | Aktiv |

---

## F) Testzahlen (Live-DB)

| Tabelle | Datensaetze | Bewertung |
|---|---|---|
| profiles | 59 | Nur Testdaten |
| angels | 13 | Nur Testdaten |
| care_recipients | 8 | Nur Testdaten |
| service_records | 30 | Nur Testdaten |
| organizations | 6 | Nur Testdaten |

**ACHTUNG:** Das System wurde NICHT mit realem Geschaeftsvolumen getestet. 8 Klienten und 13 Engel sind kein Beweis fuer Produktionsreife unter Last.

---

## G) Migrationen: Repo vs. Live-DB

| Quelle | Anzahl |
|---|---|
| Live-DB (supabase_migrations.schema_migrations) | 252 |
| Lokales Repo (supabase/migrations/*.sql) | 319 |
| Differenz | 67 |

Die 67 zusaetzlichen lokalen Dateien enthalten Rollback-Migrationen (Prefix `rollback_*`) und nachtraeglich hinzugefuegte Migrations-Dateien, die noch nicht auf die Live-DB angewandt wurden. Dies ist KEIN Problem, solange die Live-DB konsistent ist — aber es bedeutet, dass ein `supabase db push` 67 Migrations nachholen wuerde.

---

## H) Security-Status

### RLS (Row Level Security)
- **298/298 Tabellen** mit RLS enabled = **100% Abdeckung**
- **1073 CREATE POLICY Statements** in Migrationen
- Keine Tabelle ohne RLS-Schutz

### RBAC
- Rollen: superadmin, admin, pdl, mitarbeiter, betreuungskraft
- Durchgaengig in Middleware + API-Routes geprueft

### org_fence (Mandantentrennung)
- **208/216 Tabellen** mit organization_id haben RESTRICTIVE org_fence = **96.3%**
- **8 Tabellen ohne org_fence** (alle nicht-kritisch):
  - billing_landesregeln (Referenzdaten)
  - billing_tarif_belege (Referenzdaten)
  - billing_tariff_audit (Audit-Log)
  - organization_members (bewusst: User muss eigene Mitgliedschaft sehen)
  - organization_subscriptions (bewusst: Abo-Verwaltung)
  - state_settings (Bundesland-Konfiguration, Referenzdaten)
  - state_settings_audit (Audit)
  - state_waitlist (Warteliste)

### Client-Side Writes
- **143 Writes in Page-Komponenten** bypassen Server-Validierung
- Alle durch RLS + org_fence geschuetzt (Sicherheit gewaehrleistet)
- Risiko: Datenintegritaet (keine Business-Rule-Validierung auf Server)
- Betroffen: 16 MIS-Seiten, 9 Admin-Seiten, 20 Portal-Seiten

### Catch-Blocks
- 1142 total, davon:
  - 187 mit strukturierter Behandlung (toast/throw/Sentry/setError)
  - 339 mit console.error (geloggt, aber kein User-Feedback)
  - 9 wirklich stumm (return null/[]/undefined)
  - ~607 mit unklarer Behandlung
- **NICHT ~50 silent catches** wie teils behauptet — nur 9 wirklich stumme

### Service Role Key
- Nicht im Browser exponiert (geprueft)

### Audit-Logging
- pflege_audit_log: Alle Pflege-Module
- billing_audit_trail: SHA-256 Checksummen
- ops_aktivitaetslog: Aufgaben/Workflows
- personal_audit_log: Personalverwaltung
- **Luecke:** MIS client-side Writes haben KEIN Audit-Logging

---

## I) Naechste Schritte

### Sofort (P1)
1. **2 fehlgeschlagene Tests fixen** — aufgaben.test.ts: Erwartungswerte von "geloescht" auf "archiviert" aendern (1h)

### Kurzfristig (P2) — 24-36h
2. **MIS Server-Migration** — 62 client-side Writes in 16 MIS-Seiten auf Server Actions/API Routes migrieren
3. **Admin Server-Migration** — 35 client-side Writes in 9 Admin-Seiten, insbesondere Verordnungen (16 Writes)

### Mittelfristig (P3) — 16-22h
4. **Portal Server-Migration** — 38 Writes in Engel/Fahrer/Kunde-Portalen
5. **Catch-Block Refactoring** — 607 Catches auf strukturierte Fehlerbehandlung umstellen
6. **8 fehlende org_fence Policies** anlegen

### Extern (blockiert)
7. **M15 KIM/TI** — TI-Konnektor-Zugang bei gematik beschaffen
8. **M19 SEPA** — Creditor-ID bei Bundesbank beantragen/abholen
9. **M27 §302** — DAKOTA-Adapter bei ITSG bestellen/integrieren

---

## J) Verdikt

### IST DIE PFLEGE-SOFTWARE FUER DEN INTERN MOEGLICHEN FUNKTIONSUMFANG PRODUKTIONSBEREIT: BEDINGT JA

**Begruendung:**

**Was funktioniert:**
- Die 27 Kern-Module der Pflege-Software sind technisch implementiert
- 384 API-Routes liefern server-seitige Validierung fuer alle klinischen Kern-Operationen
- 100% RLS-Abdeckung (298/298 Tabellen) — kein unbefugter Datenzugriff moeglich
- 96.3% org_fence-Abdeckung — Mandantentrennung ist solide
- TypeScript kompiliert fehlerfrei
- 3058 von 3060 Tests bestehen

**Was NICHT funktioniert oder fehlt:**
- **2 fehlgeschlagene Tests** (M16 Aufgaben) — Kleinigkeit, aber ein sauberer Build sollte 0 Failures haben
- **143 client-seitige Writes** in MIS/Admin/Portal-Seiten umgehen Server-Validierung (kein Sicherheitsrisiko dank RLS, aber Datenintegritaets-Risiko)
- **Kein reales Geschaeftsvolumen getestet** — 8 Klienten und 13 Engel sind kein Lasttest
- **MIS-Verwaltungsmodule ohne Audit-Logging** fuer client-seitige Schreiboperationen

**Fazit:**
Die Kern-Pflegefunktionalitaet (Klientenverwaltung, Pflegedokumentation, Wunddoku, Medikamente, Tourenplanung, Abrechnung, Dienstplanung) ist produktionsbereit. Diese Module nutzen server-seitige API-Routes mit vollstaendiger RLS/RBAC-Absicherung.

Die MIS-Verwaltung (Privacy, CRM, Recruiting, Training, Vehicles etc.) und einige Admin-Funktionen (Verordnungen, Settings) haben funktionierenden Code, aber client-seitige Writes ohne Server-Validierung — das ist **Tech Debt, kein Showstopper**, weil RLS Cross-Tenant-Zugriff verhindert.

**Empfehlung:** Produktionsstart mit den Kern-Modulen ist vertretbar. MIS client-side Writes auf Server Actions migrieren als naechste Prioritaet (geschaetzt 40-60h). Die 3 extern blockierten Module (KIM, SEPA, §302) koennen erst nach Beschaffung der externen Infrastruktur freigeschaltet werden.
