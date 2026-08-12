# Alltagsengel — Vollständige Block-Roadmap

**Stand:** 2026-08-12
**Projekt:** AlltagsEngel.care (Next.js App Router + Supabase)
**Zweck:** Gesamtübersicht aller Entwicklungsblöcke — abgeschlossen, in Arbeit, geplant

---

## Legende

| Symbol | Bedeutung |
|--------|-----------|
| ✅ | Abgeschlossen (deployed auf Production) |
| 🔄 | In Arbeit / Vercel Production Build läuft |
| 📋 | Geplant |
| 🔒 | Sicherheitsblock |

---

## Block 1 — Plattform-Grundgerüst & Ausfallmanagement ✅

**Status:** Abgeschlossen
**Zeitraum:** bis März 2026

Kernergebnis: Lauffähige Next.js-App mit Supabase-Backend, Rollen (Kunde, Engel, Fahrer, Admin), Basis-UI.

| Modul | Dateien / Verzeichnisse | Beschreibung |
|-------|-------------------------|--------------|
| Auth & Rollen | `app/auth/`, `lib/supabase/` | 4-Layer-Auth (Proxy → Layout-Guards → API-Guards → RLS), Login/Register/Reset |
| Kunden-Portal | `app/kunde/` (20+ Seiten) | Home, Buchungen, Chat, Budget, Kalender, Profil, Dokumente, Rechnungen |
| Engel-Portal | `app/engel/` (20+ Seiten) | Home, Einsätze, Verfügbarkeit, Dienstplan, Qualifikationen, Urlaub |
| Fahrer-Portal | `app/fahrer/` (6 Seiten) | Aufträge, Fahrzeuge, Chat, Profil |
| Admin-Dashboard | `app/admin/dashboard/`, `app/admin/home/` | Zentrale Übersicht |
| Stammdaten | `app/admin/clients/`, `app/admin/caregivers/` | Klienten- und Betreuerverwaltung inkl. Detailakten |
| Ausfallmanagement | `app/admin/ausfallmanagement/` | Ausfall-Erkennung, Vertretungs-Workflows |
| Buchungssystem | `app/admin/bookings/`, `app/api/bookings/` | Buchungsanfragen, Bestätigungen, Benachrichtigungen |
| Nachrichten/Chat | `app/api/ops/nachrichten/`, `app/*/chat/` | Internes Messaging für alle Rollen |
| PWA + Capacitor | `capacitor.config.ts`, Service Worker | iOS published, Android vorbereitet |
| Landing/Marketing | `app/page.tsx`, `app/blog/` (30+ Artikel) | SEO-optimierte Landing-Pages, Blog, Finanzierungs-Rechner |
| MIS (Management) | `app/mis/` (18 Seiten) | Analytics, CRM, Finance, Quality, Recruiting, Team, Training |
| Verordnungen | `app/admin/verordnungen/` | 4-Schritt-Workflow (SGB XI/V, privat) |
| Kalender | `app/admin/kalender/` | Kalenderansicht für Einsätze/Termine |
| Notizen | `app/admin/notizen/` | Interne Notizen |
| Einstellungen | `app/admin/settings/`, `app/admin/users/` | System- und Benutzerverwaltung |
| WhatsApp-Bot | `app/api/whatsapp/`, `lib/whatsapp/` (5 Module) | KI-gestützter WhatsApp-Chatbot mit Eskalation |
| KI-Chat | `app/api/ai-chat/`, `app/api/beratung-chat/` | Beratungs-Chat mit KI-Unterstützung |
| Stripe-Billing (SaaS) | `app/api/stripe/`, `lib/stripe/` | SaaS-Billing: Checkout, Portal, Webhooks (Free/Starter/Pro/Scale) |
| Cron-Jobs | `app/api/cron/` | Drip-Kampagnen, IndexNow, Review-Requests |
| Expansion-UI | `app/admin/expansion/`, `lib/expansion/` | Bundesland-Steuerung, Wartelisten, PLZ-Zuordnung |
| Organisationen | `lib/organizations/` | IK-Verwaltung, Mandanten-Config |
| Preislogik | `app/admin/leistungspreise/`, `lib/pricing-engine.ts` | Leistungspreise, Budgets, Tarifkonfiguration |
| Partner | `app/admin/partners/` | Partnerverwaltung |
| Bewerbungen | `app/admin/applications/` | Engel-Bewerbungsprozess |
| Krankenfahrten | `app/krankenfahrten/`, `app/api/admin/krankenfahrten/` | Krankenfahrten-Modul (Buchung, Verordnung, Abrechnung) |

---

## Block 2 — SEPA-Lastschrift & Mahnwesen ✅

**Status:** Abgeschlossen
**Migration:** `20260812120000_sepa_mandate_and_mahnung.sql`

| Modul | Dateien | Beschreibung |
|-------|---------|--------------|
| SEPA-Mandate | `app/admin/sepa/`, `lib/billing/sepa/pain008.ts`, `sepa-service.ts` | PAIN.008-XML-Erzeugung, Mandatsverwaltung, Revocation |
| SEPA-Batches | `app/api/billing/sepa/batches/` | Lastschrift-Batch-Erzeugung |
| Rücklastschriften | `lib/billing/sepa/ruecklastschrift.ts` | Rücklastschrift-Verarbeitung |
| Mahnwesen | `app/admin/mahnwesen/`, `lib/billing/core/dunning.ts` | 3-Stufen-Mahnung, Eskalation, Dokument-Erzeugung |
| Mahnung-PDF | `lib/billing/dunning/mahnung-pdf.ts` | PDF-Generierung für Mahnschreiben |

---

## Block 3 — Rückläufer-Parser & Kassenabrechnung ✅

**Status:** Abgeschlossen
**Migrationen:** `20260808200000_einsatzplanung_leistungsnachweise.sql`, `20260808220000_kassenabrechnung_dta_dakota.sql`

| Modul | Dateien | Beschreibung |
|-------|---------|--------------|
| DTA/EDIFACT | `lib/abrechnung/edifact-generator.ts`, `edifact-segments.ts`, `edifact-validator.ts` | EDIFACT-Dateierzeugung nach § 105 SGB XI TA 6.4.0 |
| Kassenabrechnung-Engine | `lib/abrechnung/kassenabrechnung-engine.ts` | Pipeline-Orchestrierung: PreFlight → Validierung → Export → Freigabe → Storno |
| SLGA-Parser | `lib/abrechnung/slga-parser.ts` | Rückläufer-Parsing (Datenannahmestellen-Antworten) |
| Rückläufer | `app/admin/ruecklaeufer/`, `lib/abrechnung/ruecklaeufer.ts` | Rückläufer-Zuordnung, Erledigung, Aufgaben-Erzeugung |
| Korrekturläufe | `app/admin/korrekturlaeufe/`, `lib/abrechnung/korrekturlaeufe.ts` | Korrektur-Workflow: Erstellen → Ausführen → Historien-Kette |
| DTA-Läufe | `app/admin/dta/` (3 Seiten), `app/api/billing/dta/` (15+ Routes) | Dashboard, Dry-Run, Preflight, Pipeline, Fehlerprotokoll |
| DAKOTA-Integration | `app/admin/dakota/` | DAKOTA-Konfigurationsstatus, SFTP-Tests |
| SECON-Verschlüsselung | `lib/abrechnung/secon.ts` | Verschlüsselungs-Stub (SECON-Anbindung vorbereitet) |
| Zertifikatsverwaltung | `lib/abrechnung/zertifikate.ts` | IK-Zertifikate, ITSG-Anbindung |
| Stammdaten (Kassen) | `app/admin/kostentraeger/`, `app/admin/annahmestellen/`, `lib/abrechnung/stammdaten.ts` | Kostenträger, Datenannahmestellen, Schlüsselverzeichnis |
| Fristen-Manager | `lib/abrechnung/fristen-manager.ts` | Abrechnungsfristen-Überwachung |
| Versand-Guard | `lib/abrechnung/versand-guard.ts` | 4-Augen-Freigabeprinzip |

---

## Block 4 — Zahlungseingangs-Matching & OPOS via CAMT ✅

**Status:** Abgeschlossen
**Migration:** `20260825010000_zahlungseingang_opos.sql`

| Modul | Dateien | Beschreibung |
|-------|---------|--------------|
| CAMT-Parser | `lib/billing/camt/camt-parser.ts` | CAMT.053-Import (Kontoauszug-XML), Buchungsextraktion |
| Matching-Engine | `lib/billing/matching/matching-engine.ts` | Automatisches Zuordnen von Zahlungseingängen zu offenen Rechnungen |
| OPOS-Manager | `lib/billing/opos/opos-manager.ts` | Offene-Posten-Liste, Saldenübersicht, Altersanalyse |
| Zahlungseingänge UI | `app/admin/zahlungseingaenge/` (2 Seiten) | Übersicht + manuelle Zuordnung |
| Zahlungskontrolle | `app/admin/zahlungskontrolle/` | Dashboard mit Differenz-Übersicht |
| Klärfälle | `app/api/billing/klaerfaelle/` | Nicht-zuordenbare Zahlungen: Workflow zur manuellen Klärung |
| Forderungen | `app/admin/forderungen/` | Offene Forderungen pro Kostenträger/Klient |
| Payments API | `app/api/billing/payments/`, `lib/billing/core/payments.ts` | Zahlungsbuchungen, Allokation, Status-Machine |

---

## Block 5 — DATEV-Export ✅

**Status:** Abgeschlossen
**Migration:** `20260812180000_datev_export.sql`

| Modul | Dateien | Beschreibung |
|-------|---------|--------------|
| DATEV-Format | `lib/billing/datev/datev-format.ts` | CSV-Export im DATEV-Buchungsstapel-Format |
| Buchungssatz-Generator | `lib/billing/datev/buchungssatz-generator.ts` | Automatische Buchungssatz-Erzeugung aus Rechnungen/Zahlungen |
| Kontenrahmen | `lib/billing/datev/kontenrahmen.ts` | SKR03/SKR04-Zuordnung |
| Kontenzuordnung | `app/api/billing/datev/kontenzuordnung/` | Konfigurierbare Konten-Mappings |
| DATEV-Config | `lib/billing/datev/datev-config.ts` | Beraternummer, Mandantennummer, WJ-Beginn |
| Export-Service | `lib/billing/datev/export-service.ts` | Export-Orchestrierung: Erzeugung → Download |
| Admin-UI | `app/admin/datev/` | DATEV-Export-Dashboard mit Perioden-Auswahl |

---

## Block 6 — Einsatzplanung, Tourenplanung & Leistungsnachweise ✅

**Status:** Abgeschlossen
**Migrationen:** `20260808200000_einsatzplanung_leistungsnachweise.sql`, `20260809120000_tourenplanung.sql`

| Modul | Dateien | Beschreibung |
|-------|---------|--------------|
| Einsatzplanung | `app/admin/einsatzfreigabe/`, `app/api/einsatzplanung/` | Einsatz-Zuordnung, Freigabe-Workflow |
| Tourenplanung | `app/admin/tourenplanung/`, `lib/touren/` | Tourenoptimierung, Fahrtzeit-Berechnung, Templates |
| Leistungsnachweis | `app/admin/leistungsnachweis/`, `app/admin/leistungsnachweis-digital/` | Digitale Leistungserfassung, Upload, PDF-Erzeugung |
| Leistungsnachweis-Upload | `app/admin/leistungsnachweis-upload/` | OCR-gestützter Nachweis-Upload |
| Signaturen | `app/api/native/signatures/`, `lib/signaturen/` | Digitale Unterschriften für Leistungsnachweise |
| Monatsabschluss | `app/admin/monatsabschluss/` (3 Seiten) | Monatsabschluss-Workflow pro Klient, Vorbereitung, KI-Prüfung |

---

## Block 7 — Pflegedokumentation ✅

**Status:** Abgeschlossen
**Migration:** `20260810010000_pflegedokumentation.sql`

| Modul | Dateien | Beschreibung |
|-------|---------|--------------|
| Pflegedoku-Übersicht | `app/admin/pflegedoku/` (7 Seiten) | Anamnese, Aufnahme, Diagnosen, Maßnahmenplan, Verlauf, Perioden, Risiko-Dashboard |
| Pflegedoku-API | `app/api/pflege/` (20+ Routes) | Anamnesen, Aufnahmen, Diagnosen, Maßnahmen, Maßnahmenpläne, Risiken, Verlauf, Doku-Perioden |
| Pflegedoku-Lib | `lib/pflege/` (12 Module + Tests) | Kernlogik: Anamnesen, Aufnahmen, Diagnosen, Maßnahmen, Maßnahmenpläne, Risiken, Verlauf, Perioden |
| SIS | `app/admin/sis/` (2 Seiten), `lib/sis/` | Strukturierte Informationssammlung, Themenfelder, Risikomatrix |
| Wunddokumentation | `app/admin/wunddokumentation/` (2 Seiten), `lib/wunden/` | Wunden, Assessments (PUSH-Score), Behandlungen, Fotos, Verlauf |
| Vitalwerte | `app/admin/vitalwerte/` (2 Seiten), `lib/vitals/` | Vitalwerte-Erfassung, Schwellenwerte, Alarme |
| Medikamente | `app/admin/medikamente/` (2 Seiten), `lib/medikamente/` | Medikamentenplan, Eingaben, Verwaltung |
| Engel-Pflegedoku | `app/engel/pflegedoku/` (3 Seiten) | Mobile Pflegedokumentation für Engel |
| Kunden-Pflegedoku | `app/kunde/pflegedoku/` | Einsicht für Kunden (lesend) |

---

## Block 8 — Personalmanagement ✅

**Status:** Abgeschlossen
**Migration:** `20260811010000_personalmanagement.sql`

| Modul | Dateien | Beschreibung |
|-------|---------|--------------|
| Personalverwaltung | `app/admin/personal/` (2 Seiten), `lib/personal/` (14 Module + Tests) | Stammdaten, Qualifikationen, Schulungen |
| Mitarbeiterakte | `app/admin/mitarbeiterakte/[id]/` | Detailansicht pro Mitarbeiter |
| Arbeitszeiterfassung | `app/admin/arbeitszeiten/`, `lib/personal/arbeitszeiten.ts` | Zeiterfassung, Korrekturen, Arbeitszeitkonto |
| Dienstplanung | `app/admin/dienstplan/`, `lib/personal/dienstplan.ts` | Schichten, Einträge, Tagesansicht |
| Urlaubsverwaltung | `app/admin/urlaub/`, `lib/personal/urlaubskonto.ts` | Urlaubskonto, Abwesenheiten, Genehmigung/Ablehnung |
| Einsatzfreigabe | `app/admin/einsatzfreigabe/`, `lib/personal/einsatzfreigabe.ts` | Qualifikations-Check vor Einsatz |
| Engel-Self-Service | `app/engel/arbeitszeiten/`, `app/engel/urlaub/`, `app/engel/qualifikationen/` | Mitarbeiter-Portal |

---

## Block 9 — Aufgaben, Kommunikation & Workflow-Engine ✅

**Status:** Abgeschlossen
**Migrationen:** `20260812010000_aufgaben_kommunikation.sql`, `20260813010000_workflow_engine.sql`

| Modul | Dateien | Beschreibung |
|-------|---------|--------------|
| Aufgabenverwaltung | `app/admin/aufgaben/` (3 Seiten), `lib/ops/aufgaben.ts` | CRUD, Checklisten, Kommentare, Anhänge, Prioritäten |
| Benachrichtigungen | `app/admin/benachrichtigungen/`, `lib/ops/benachrichtigungen.ts` | In-App-Benachrichtigungen mit Gelesen-Status |
| Wiedervorlagen | `app/admin/wiedervorlagen/`, `lib/ops/wiedervorlagen.ts` | Fristenüberwachung, automatische Erinnerungen |
| Eskalationen | `app/admin/eskalationen/`, `lib/ops/eskalationen.ts` | Regel-basierte Eskalation |
| Workflow-Engine | `app/admin/workflow/` (7 Seiten), `lib/workflow/` (9 Module) | Event-basierte Automatisierung: Regeln, Aktionen, Warteschlange, Dead-Letter, Audit |
| Nachrichten-System | `app/admin/nachrichten/` (2 Seiten), `lib/ops/nachrichten.ts` | Threaded Messaging, Antworten, Gelesen-Status |
| Ops-API | `app/api/ops/` (25+ Routes) | Vollständige API für alle Ops-Module |

---

## Block 10 — Dokumentenmanagement & Aktenführung ✅

**Status:** Abgeschlossen
**Migrationen:** `20260809010000_dokumentenmanagement_akten.sql`, `20260821010000_angehoerigenzugang.sql`, `20260821020000_digitale_signaturen.sql`

| Modul | Dateien | Beschreibung |
|-------|---------|--------------|
| Dokumentenmanagement | `app/admin/dokumente/` (2 Seiten), `lib/akten/` (9 Module + Tests) | Upload, Versionierung, Sperrung, Download, Suche |
| Kundenakte | `app/admin/kundenakte/[id]/` | 360°-Sicht auf Klienten: Dokumente, Verträge, Kontakte |
| Verträge | `app/admin/vertraege/`, `lib/akten/vertraege.ts` | Vertragsverwaltung, digitale Unterschrift |
| Kontaktpersonen | `lib/akten/kontaktpersonen.ts` | Angehörige, Betreuer, Ärzte pro Klient |
| Ablauf-Warnungen | `lib/akten/ablauf-warnungen.ts` | Automatische Warnung bei ablaufenden Dokumenten |
| Zugriffs-Logging | `lib/akten/zugriff-log.ts` | Lückenloser Zugriffs-Audit-Trail |
| Angehörigenzugang | `lib/angehoerige/`, `app/api/admin/angehoerige/` | Separater Zugang für Angehörige |
| Digitale Signaturen | `lib/signaturen/`, `app/api/admin/signaturen/` | Digitale Unterschriften für Dokumente |

---

## Block 11 — Kassenabrechnung-Engine Härtung 🔒 ✅

**Status:** Abgeschlossen (Bugfixes)

Behebt 4 Kategorien fataler Bugs in der Kassenabrechnung-Engine, die den DTA/EDIFACT-Export komplett unbenutzbar machten: falsche Client-Spalten, fehlende Kostenträger-Architektur, falsche Service-Records-Spalten, fehlerhafte Abrechnungs-Queries. Dokumentiert in `docs/block-11-kassenabrechnung-engine-fix.md`.

---

## Block 12 — Defense-in-Depth org_id-Guards 🔒 ✅

**Status:** Abgeschlossen

9 Lib-Funktionen in 4 Dateien erhielten fehlende `organization_id`-Filter. Betroffen: kassenabrechnung-engine.ts, korrekturlaeufe.ts, ruecklaeufer.ts, fehlerprotokoll.ts. Dokumentiert in `docs/block-12-13-security-expansion.md`.

---

## Block 13 — Expansion Multi-Tenant ✅

**Status:** Abgeschlossen

3 Expansion-Blocker behoben: AOK-Routing bundesweit (ITSCare als zentrale Datenannahmestelle), Leistungsnachweis-PDF Multi-Tenant (dynamische Org-Daten statt Hardcoding), EDIFACT-Generator Absendername aus DB. Dokumentiert in `docs/block-12-13-security-expansion.md`.

---

## Block 14 — Sicherheits-Sweep & RLS-Härtung 🔒 ✅

**Status:** Abgeschlossen
**Migrationen:** `20260814010000` bis `20260824030000` (15+ Security-Migrationen)

| Modul | Beschreibung |
|-------|--------------|
| Leistungsnachweis-Härtung | RLS-Absicherung der Leistungsnachweis-Tabellen |
| Profiles-RLS-Rekursion | Beseitigung von RLS-Rekursionsproblemen |
| Ereignis-Typ-Konsistenz | Konsistente Typisierung im Event-System |
| SQL-Exec-RPC-Absicherung | Blockierung von SQL-Injection-Vektoren über RPCs |
| Audit-Probe-Dokumentation | Audit-Trail-Absicherung |
| SecDef-RPC-Härtung | SECURITY DEFINER → INVOKER Migration wo möglich |
| Bookings-Policy-Rekursion | RLS-Policy-Deadlock-Beseitigung |
| Race-Condition-Fixes (P0) | Kritische Race Conditions in Zahlungen/Buchungen |
| Service-Record-Unique (P1) | Unique-Constraints für Leistungseinträge |
| Missing RLS (P1) | Fehlende RLS-Policies auf neuen Tabellen |

---

## Block 15 — Digitaler PflegeCoach (DiPA-Modul) 📋

**Status:** 15a–15d umgesetzt (Produktversion 0.2.0, 12.08.2026) — Zulassungsvorbereitung dokumentiert, externe Schritte (Prüfstelle, DSFA-Abschluss, Evaluationspartner) ausstehend

**Hinweis:** Dieses Modul ist technisch und fachlich STRIKT GETRENNT von der übrigen Pflegesoftware. Es ist eine eigenständige Digitale Pflegeanwendung (DiPA) nach § 40a SGB XI.

**Migration:** `20260819010000_pflegecoach_dipa_modul.sql`
**Frontend:** `app/pflegecoach/` (12 Seiten)
**API:** `app/api/coach/` (11 Route-Gruppen)
**Lib:** `lib/coach/` (8 Module + Tests)

### Was bereits existiert (technische Basis)

| Komponente | Umfang | Beschreibung |
|------------|--------|--------------|
| Datenmodell | 9 Tabellen (`coach_*`) | Nutzer, Consents, Shares, Assessments, Goals, Activities, Activity-Log, Measurements, Reports |
| RLS-Konzept | Nutzer-eigen, KEIN Admin-Zugriff | DiPAV-Trennungsgebot: Betriebsdaten ≠ Gesundheitsdaten. Kein org_fence. |
| Consent-System | `coach_consents` | Versionierte Art. 9-Einwilligungen (Gesundheitsdaten, Wissenschaft, Datenfreigabe) |
| Freigabe-System | `coach_shares` | Widerrufliche Lesefreigabe an Angehörige/Pflegedienst |
| Assessments | `coach_assessments` | Selbsteinschätzung (0–4) in 5 Lebensbereichen |
| Zielverwaltung | `coach_goals` | SMART-Pflegeziele mit Messgröße, Start-/Ziel-/Ist-Wert |
| Aktivitätenplanung | `coach_activities` + `coach_activity_log` | Wochenplan mit Erledigungs-Tracking (Adhärenz) |
| Verlaufsmessung | `coach_measurements` | FES-I Kurzform, BSFC-s, SUS, Belastung, Selbstständigkeit, Sturzereignis |
| Berichte/Export | `coach_reports` | Unveränderliche Verlaufsberichte als JSON-Snapshots |
| Barrierefreiheit | `a11y_schriftgrad`, `a11y_kontrast` | WCAG 2.1 AA / BFSG-konforme Einstellungen |
| Frontend-Seiten | 12 Seiten | Start, Assessment, Ziele, Wochenplan, Alltag, Mobilität, Verlauf, Bericht, Belastung, Angehörige, Einstellungen, Datenschutz |
| API-Endpunkte | 11 Gruppen | Profil, Consents, Assessments, Ziele, Aktivitäten, Messungen, Empfehlungen, Berichte, Export |
| Empfehlungs-Engine | `lib/coach/empfehlungen.ts` | Regelbasierte Empfehlungen (KEINE KI-Diagnostik, MDR-Negativabgrenzung) |
| Belastungs-Screening | `lib/coach/belastung.ts` | BSFC-s-Auswertung für pflegende Angehörige |

### Umgesetzt in Produktversion 0.2.0 (12.08.2026)

**Migration:** `20260826010000_dipa_freischaltung_nachweise_eul.sql` (+ Rollback) — 7 neue Tabellen, **noch nicht auf Production angewendet** (GAP-DB)

| Teilbereich | Umsetzung |
|-------------|-----------|
| **15a** Nutzerflow | Anspruchsprüfung (`/pflegecoach/anspruch`), Freischaltcodes (Ausgabe `/admin/dipa`, Einlösung `/pflegecoach/freischaltung`), pseudonymisierte Nutzungsnachweise, konfigurierbare Abrechnungswege **ohne Beträge** |
| **15a** Trennungskonzept | HMAC-Pseudonymisierung mit Schlüssel, den niemand lesen kann (`coach_pseudonym_key`) — Betriebs-Admin sieht Einlösungen ohne Personen- oder Datenbezug |
| **15b** Datenschutz | Produktbezogene Löschung ohne Kontoverlust (`/pflegecoach/loeschung`), Verschlüsselungskonzept, Löschkonzept, DSFA-Vorbereitung, TR-03161-Vorbereitungscheckliste |
| **15c** Zulassung | Maschinenlesbarer Anforderungskatalog mit Prüfstatus je Eintrag, MDR-Negativabgrenzung inkl. Sprachregeln, Testprotokoll-Vorlage Gebrauchstauglichkeit, Evaluations-Datenframework |
| **15d** eUL | Nachweisführung + Qualifikationskatalog (`/admin/eul`), Abgrenzung digital/persönlich, Buchungs-Bezug über `booking_id` |
| Tests | 48 neue Unit-Tests (`lib/coach/{anspruch,freischaltung,nachweise,eul,abrechnung}.test.ts`) |
| Doku | `audit/dipa/`: `nutzerflow_dipa.md`, `verschluesselungskonzept.md`, `loeschkonzept.md`, `dsfa_pflegecoach.md`, `tr03161_checkliste.md`, `anforderungskatalog.md`, `mdr_negativabgrenzung.md`, `gebrauchstauglichkeit_testprotokoll.md`, `eul_konzept.md`, `eul_qualitaetsanforderungen.md` |

**Zwei Schalter stehen bewusst auf AUS** (Default), weil die zugrunde liegenden Fragen regulatorisch offen sind:

| Schalter | Wirkung |
|----------|---------|
| `COACH_FREISCHALTUNG_PFLICHT` | Freischaltcode als Zugangsvoraussetzung — aus, solange unklar ist, ob ein Code-Verfahren für DiPA vorgesehen ist |
| `COACH_NUTZUNGSNACHWEIS_AKTIV` | Erfassung pseudonymisierter Nutzungsdaten — aus bis Pilotstart; zusätzlich immer einwilligungsabhängig |

**Die eUL-Brücke ist einbahnig:** Aus dem Betrieb heraus lässt sich eine ergänzende Unterstützungsleistung an eine Buchung hängen. Aus dem PflegeCoach heraus gibt es **keine Bewerbung und keinen Buchungsweg** — sonst wäre die Werbefreiheit der Kernfunktion verletzt (siehe `audit/dipa/eul_konzept.md` §1).

### Was noch offen ist (DiPA-spezifisch)

Die folgenden Punkte sind extern zu erbringen und waren im Rahmen der Implementierung nicht leistbar — die Kern-Roadmap für den Antrag:

| Offen | Gap-ID |
|-------|--------|
| Live-Apply beider DiPA-Migrationen | GAP-DB |
| BSI-TR-03161-Zertifizierung durch akkreditierte Prüfstelle | GAP-TR03161 |
| Zweiter Faktor bei der Anmeldung | GAP-MFA |
| DSFA-Abschluss durch Datenschutzberatung, AVV-Dossier | GAP-DSFA |
| Pflegefachliche Freigabe der Inhalte | GAP-QS |
| Evaluationspartner, Ethikvotum | GAP-EVAL |
| Externes Security-Review / Penetrationstest | GAP-EXT-REVIEW |
| QMS und Risikomanagement | GAP-QMS |
| Verbindlichkeit des Aktivierungscode-Verfahrens | GAP-DIPA-FLOW |
| Regulatorische Herleitung der eUL-Qualifikationsanforderungen | GAP-EUL-QUALI |
| Shadow-RLS-Tests für die 7 neuen Tabellen | GAP-SHADOW-15 |

Vollständige Liste inkl. Bewertung: `audit/dipa/dipav_gap_liste.md`.

<details>
<summary>Ursprüngliche Aufgabenstellung 15a–15d (Stand vor der Umsetzung)</summary>

**15a — DiPA-Nutzerflow (End-to-End)**

Der vollständige Nutzerflow einer DiPA umfasst Schritte, die über die reine App-Nutzung hinausgehen:

1. **Anspruchsprüfung:** Pflegebedürftiger (ab Pflegegrad 1) beantragt DiPA bei der Pflegekasse
2. **Genehmigung:** Pflegekasse genehmigt (oder lehnt ab) → Aktivierungscode / Freischaltung
3. **Aktivierung:** Nutzer gibt Code ein → Zugang zum PflegeCoach wird freigeschaltet
4. **Nutzung:** Coaching, Assessments, Zielverfolgung, Wochenplanung
5. **Nachweise:** Nutzungsdaten für Evaluation/Wirksamkeitsnachweis (pseudonymisiert)
6. **Abrechnung:** Abrechnung gegenüber Pflegekasse (Abrechnungsweg noch zu klären)

> **WICHTIG:** Abrechnungswege, Preise und Vergütungshöhen für DiPA werden hier bewusst NICHT festgelegt. Diese hängen von der Zulassungskategorie (Verzeichnis vs. Erprobung nach § 78a Abs. 6a SGB XI) ab und werden im Zulassungsprozess bestimmt.

**15b — Datenschutz & Security (DiPAV-konform)**

- Ende-zu-Ende-Verschlüsselung für Gesundheitsdaten (at rest + in transit)
- DSFA (Datenschutz-Folgenabschätzung) für Verarbeitung nach Art. 9 DSGVO
- Löschkonzept (Aufbewahrungsfristen, Recht auf Löschung, Datenportabilität)
- Penetrationstest des DiPA-Moduls (isoliert vom Betriebsteil)
- BSI-Anforderungen / TR-03161 prüfen

**15c — DiPA-Verzeichnis & Zulassungsanforderungen**

- Anforderungskatalog des BfArM / DiPAV analysieren (soweit auf DiPA übertragbar)
- Evaluationskonzept (Pilotphase: Nutzen-Nachweis, Studiendesign)
- Interoperabilitätsanforderungen prüfen (FHIR/ISiP wenn gefordert)
- Gebrauchstauglichkeitsprüfung (Usability-Test mit Zielgruppe)
- MDR-Negativabgrenzung dokumentieren (kein Medizinprodukt)

> **WICHTIG:** Die konkreten Zulassungsvoraussetzungen für Digitale Pflegeanwendungen befinden sich teilweise noch in der regulatorischen Entwicklung. Anforderungen werden hier NICHT erfunden, sondern müssen zum Zeitpunkt der Antragstellung anhand der dann gültigen Verordnungen geprüft werden.

**15d — Ergänzende Unterstützungsleistungen (eUL)**

Ergänzende Unterstützungsleistungen sind ein separater Bestandteil des DiPA-Konzepts (§ 39a SGB XI). Sie umfassen persönliche Beratung/Begleitung ergänzend zur digitalen Anwendung — genau das Kerngeschäft von Alltagsengel.

- Verknüpfung DiPA ↔ Alltagsbegleitung (Buchungs-Bridge)
- Nachweis-Dokumentation der eUL-Erbringung
- Abgrenzung: DiPA-Nutzung (digital) vs. eUL-Einsatz (persönlich)
- Qualitätsanforderungen an eUL-Erbringer

</details>

---

## Block 16 — Rechnungsmanagement & Gutschriften ✅

**Status:** Fertig (12.08.2026) — keine Migration nötig, alle Tabellen existierten schon
(`invoice_corrections`, `invoice_snapshots`, `billing_audit_trail` aus `20260806200000`).

| Modul | Beschreibung | Ergebnis |
|-------|--------------|----------|
| Abrechnungs-Übersicht | `app/admin/abrechnung/` (inkl. Einstellungen), `app/admin/abrechnungsfehler/` — Gesamtübersicht + Fehlerbehandlung | ✅ war vollständig — geprüft, unverändert |
| Rechnungserstellung | `app/admin/rechnungserstellung/` existiert — Workflow-Vervollständigung | ✅ „Prüfen"-Schritt (`entwurf → geprueft`) ergänzt — ohne ihn war *Festschreiben* nicht erreichbar; + Storno/PDF je Zeile |
| Gutschriften | `app/admin/gutschriften/` — Gutschrift-Erzeugung, Zuordnung zu Rechnungen | ✅ von Nur-Lesen zu Vollworkflow: Anlegen (Rechnungsauswahl + Restbetrag), Freigeben, Verwerfen, Storno, KPIs |
| Rechnungs-PDF | `app/api/admin/invoices/[id]/generate-pdf/` — PDF-Template-Verfeinerung | ✅ Seitenumbruch-Bug behoben (Positionen wurden über den Kopfbereich gezeichnet), Belegarten Gutschrift/Storno/Korrektur, Bezugsrechnung + Grund, keine Zahlungsaufforderung auf Gutschriften |
| Rechnungskorrektur | `app/api/billing/invoices/[id]/correct/` — Korrektur-Workflow mit Audit-Trail | ✅ Freigabe-/Verwerfen-Pfad ergänzt (`lib/billing/core/credit-notes.ts`) |
| Rechnungsstorno | `app/api/billing/invoices/[id]/cancel/` — Storno mit Gutschrift-Erzeugung | ✅ aus UI bedienbar (Gutschriften-Seite + Rechnungsdetail) |
| Kunden-Rechnungen | `app/kunde/rechnungen/` — Kundenportal-Einsicht | ✅ Gutschrift/Storno gekennzeichnet + erklärt; PDF über `GET /api/rechnungen/[id]/pdf` frisch signiert (gespeicherte Signatur lief nach 30 Tagen ab) |

**Neue Bausteine**

| Datei | Zweck |
|-------|-------|
| `lib/billing/core/credit-notes.ts` | `releaseCreditNote` / `discardCreditNote` / `getRemainingCreditableCents` — Statusmaschine + Audit-Trail |
| `app/api/billing/corrections/` | Liste + `[id]/release` + `[id]/discard` |
| `app/api/billing/invoices/route.ts` | Rechnungsliste mit gutschreibbarem Restbetrag (org-gefenced) |
| `app/api/billing/invoices/[id]/status/` | Statuswechsel entlang der Statusmaschine (Storno bleibt bei `/cancel`) |
| `app/api/rechnungen/[id]/pdf/` | Kundenportal: frisch signierte PDF-URL, Eigentümerprüfung |
| `__tests__/billing/credit-note-lifecycle.test.ts` | 16 Tests auf Statuspfad, Festschreibung, Mandantenfence |

---

## Block 17 — § 302 SGB V (Sonstige Leistungserbringer) 🔄

**Status:** Gerüst fertig (12.08.2026), Datensatz-Erzeugung bewusst gesperrt
**Migration:** `20260826020000_sgb_v_302_geruest.sql` (wartet auf Live-Apply)
**Kontext:** HKP-Zulassung als sonstiger Leistungserbringer ist beantragt / in Arbeit — das Gerüst steht vor dem Live-Gang.

Bislang ist nur § 105 SGB XI implementiert. Für HKP (Häusliche Krankenpflege) und andere Leistungen nach SGB V ist ein separater Abrechnungskanal erforderlich.

> **Warum der Export gesperrt ist.** Der § 302-Datensatz ist in der Technischen Anlage 1 zur
> Vereinbarung nach § 302 Abs. 2 SGB V spezifiziert — Nachrichtentypen SLGA/SLLA, Segmentfolgen,
> Feldlängen, Schlüsselverzeichnisse (Leistungserbringergruppenschlüssel, Abrechnungspositionsnummern,
> Tarifkennzeichen). Diese Anlage liegt **nicht vor**. Aus dem Gedächtnis rekonstruierte Segmente
> wären das schlechteste Ergebnis: die Datei sähe gültig aus, würde den eigenen Validator passieren
> und erst bei der Krankenkasse auffallen — oder dort falsch verarbeitet. Deshalb fail-closed,
> gleiches Prinzip wie beim SECON-Stub.
>
> **Formatfrage geklärt:** Die frühere Notiz „NICHT EDIFACT, sondern XML" war irreführend. Es gibt
> **zwei** Kanäle: EDIFACT (SLGA/SLLA, TA1 v21 → v22 ab 02/2027) **und** HKP-XML 1.3.0 ab 02/2027.
> Beide sind im Versionsregister als getrennte Formate angelegt.

| Modul | Beschreibung | Ergebnis |
|-------|--------------|----------|
| SGB-V-Versionsengine | Technische Anlage 1 Version 21 (aktuell), Version 22 (ab 02/2027) | ✅ `lib/abrechnung/sgb-v/versionen.ts` — Register + Auflösung je Abrechnungsmonat, fail-closed über `spec_bestaetigt`; Versionswechsel greift automatisch |
| HKP-XML-Anlage | Version 1.3.0 (ab 02/2027) | ✅ als eigenes Format registriert (`xml_hkp`), erbt keine EDIFACT-Freigabe |
| SGB-V-Datenerzeugung | Separater Generator | ⏸️ `lib/abrechnung/sgb-v/generator.ts` — Signatur + Freischaltliste stehen, Ausführung wirft `SgbVSpecFehltError`. **Braucht die offizielle TA1.** |
| Kostenträger-Routing | Krankenkassen-spezifisches Routing | ✅ `lib/abrechnung/sgb-v/routing.ts` + Tabelle `sgb_v_routing` — bewusst LEER, Stammdaten werden nie geraten; Historie mit Gültigkeitszeitraum |
| Verordnungs-Integration | HKP-Verordnungen → Abrechnungspositionen | ✅ `lib/abrechnung/sgb-v/positionen.ts` — vollständig: Muster-12-Pflicht, Genehmigungsstatus, frühere von Verordnungs-/Kassenende, IK- und Versichertennummer-Prüfung, Gruppierung je Kasse+Klient. Nicht abrechenbare Leistungen kommen **mit Grund** zurück statt weggelassen zu werden |

**Weitere Bausteine**

| Datei | Zweck |
|-------|-------|
| `lib/abrechnung/sgb-v/readiness.ts` | Blockerliste, getrennt in intern lösbar / extern zu beschaffen |
| `app/api/billing/sgb-v/readiness/` | Voraussetzungen je Monat |
| `app/api/billing/sgb-v/vorschau/` | Trockenlauf: abrechenbar / nicht abrechenbar / Routing-Status (schreibt nichts) |
| `app/admin/sgb-v/` | Admin-Oberfläche mit Sperrhinweis, Fallliste und Ablehnungsgründen |
| `__tests__/abrechnung/sgb-v-302.test.ts` | 31 Tests auf Versionslogik, Routing, Verordnungsprüfung, Fail-closed-Sperre |

**Zum Freischalten** (Reihenfolge steht auch im Kopf von `generator.ts`):
1. Technische Anlage 1 zur § 302-Vereinbarung + Schlüsselverzeichnisse beschaffen (gkv-datenaustausch.de).
2. Segment-Builder analog `lib/abrechnung/edifact-segments.ts` anlegen.
3. Validator analog `edifact-validator.ts`.
4. `sgb_v_formatversionen.spec_bestaetigt = true` mit `spec_quelle` (Dokumentname + Stand).
5. `erzeugeSgbVDatei()` implementieren, `exportImplementiert()` auf `true`.

---

## Block 18 — KIM / TI-Anbindung 📋

**Status:** Geplant

| Modul | Beschreibung |
|-------|--------------|
| KIM-Gateway | Telematikinfrastruktur-Anbindung (KIM-Postfach) |
| TI-Übertragung | Technische Anlage 5 Version 1.2.0 (ab 02/2027) |
| eHBA/SMC-B | Heilberufsausweis- und Institutionskarten-Integration |
| KIM-Nachrichten | Versand/Empfang von Abrechnungsdateien via KIM |

---

## Block 19 — Erweiterte Analytics & Reporting 📋

**Status:** Geplant (Grundlage in `app/admin/analytics/`, `app/mis/analytics/` vorhanden)

| Modul | Beschreibung |
|-------|--------------|
| KPI-Dashboard | Echtzeit-KPIs: Umsatz, Auslastung, Ablehnungsquote, Pflegequalität |
| Ops-Audit | `app/admin/ops-audit/` — Betriebs-Audit mit Prüfprotokoll-Logik |
| Prüfprotokoll | `app/admin/pruefprotokoll/` — MDK/MD-Prüfvorbereitung |
| Quality-Dashboard | `app/admin/quality/` — Qualitätskennzahlen |
| Bonussystem | `app/admin/bonuses/` — Leistungsbezogene Boni |

---

## Block 20 — Offline-First & Native App 📋

**Status:** Geplant (Basis: PWA + Capacitor, `lib/offline/` vorhanden)

| Modul | Beschreibung |
|-------|--------------|
| Offline-Queue | `lib/offline/offline-queue.ts` — Erweiterung auf alle Pflegedoku-Module |
| Offline-Store | `lib/offline/offline-store.ts` — Lokaler Daten-Cache |
| Sync-Konfliktlösung | Bidirektionale Sync-Strategie mit Konfliktauflösung |
| Native Features | Push-Notifications (FCM vorhanden), Kamera-Integration, GPS-Tracking |

---

## Block 21 — FHIR / ISiP Interoperabilität 📋

**Status:** Geplant

| Modul | Beschreibung |
|-------|--------------|
| FHIR-Server | Ressourcen-Endpunkte (Patient, Encounter, Observation, CarePlan) |
| ISiP-Konformität | Informationssicherheit in der Pflege |
| Datenexport | Standardisierter Export für Wechsel/Portabilität |
| Datenimport | Import von Klientendaten aus anderen Systemen |

---

## Blockübersicht — Zeitliche Einordnung

| Block | Name | Status | Priorität |
|-------|------|--------|-----------|
| 1 | Plattform-Grundgerüst & Ausfallmanagement | ✅ Fertig | — |
| 2 | SEPA-Lastschrift & Mahnwesen | ✅ Fertig | — |
| 3 | Rückläufer-Parser & Kassenabrechnung | ✅ Fertig | — |
| 4 | Zahlungseingangs-Matching & OPOS via CAMT | ✅ Fertig | — |
| 5 | DATEV-Export | ✅ Fertig | — |
| 6 | Einsatzplanung, Tourenplanung & Leistungsnachweise | ✅ Fertig | — |
| 7 | Pflegedokumentation | ✅ Fertig | — |
| 8 | Personalmanagement | ✅ Fertig | — |
| 9 | Aufgaben, Kommunikation & Workflow-Engine | ✅ Fertig | — |
| 10 | Dokumentenmanagement & Aktenführung | ✅ Fertig | — |
| 11 | Kassenabrechnung-Engine Härtung | ✅ Fertig | — |
| 12 | Defense-in-Depth org_id-Guards | ✅ Fertig | — |
| 13 | Expansion Multi-Tenant | ✅ Fertig | — |
| 14 | Sicherheits-Sweep & RLS-Härtung | ✅ Fertig | — |
| **15** | **Digitaler PflegeCoach (DiPA)** | **✅ 15a–15d umgesetzt (v0.2.0)** | **Hoch** |
| 16 | Rechnungsmanagement & Gutschriften | 📋 Geplant | Hoch |
| 17 | § 302 SGB V (Sonstige Leistungserbringer) | 📋 Geplant | Mittel |
| 18 | KIM / TI-Anbindung | 📋 Geplant | Mittel |
| 19 | Erweiterte Analytics & Reporting | 📋 Geplant | Niedrig |
| 20 | Offline-First & Native App | 📋 Geplant | Niedrig |
| 21 | FHIR / ISiP Interoperabilität | 📋 Geplant | Niedrig |

---

## Abhängigkeiten zwischen Blöcken

```
Block 4+5 (CAMT/DATEV) ──→ Block 16 (Rechnungsmanagement)
Block 3 (§ 105 SGB XI) ──→ Block 17 (§ 302 SGB V)
Block 17 ──────────────→ Block 18 (KIM/TI)
Block 15 (DiPA) ────────→ unabhängig (eigener Produktbereich)
Block 7 (Pflegedoku) ──→ Block 20 (Offline)
Block 20 ──────────────→ Block 21 (FHIR/ISiP)
```

---

## Hinweise

- **Keine Preise erfunden:** Vergütungshöhen, Abrechnungswege und Zulassungsgebühren werden in dieser Roadmap bewusst nicht angegeben, da sie von regulatorischen Entscheidungen abhängen.
- **Keine Dummy-Daten:** Alle Modulbeschreibungen basieren auf tatsächlich existierenden Dateien in der Codebase.
- **DiPA-Trennung:** Block 15 ist bewusst als eigenständiges Produkt konzipiert — mit eigener Datenhaltung (`coach_*`-Tabellen), eigenem RLS-Konzept (kein Admin-Zugriff), eigener Consent-Verwaltung und eigenem Frontend-Bereich.
