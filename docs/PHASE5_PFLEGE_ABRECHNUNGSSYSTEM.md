# Phase 5 — Fachliches Pflege- und Abrechnungssystem

**Datum:** 2026-08-06
**Status:** Analyse und Architektur (kein Code, kein Deploy)
**Scope:** Alltagsengel + efy care → marktführende Plattform

---

## 1. IST-ANALYSE BEIDER SYSTEME

### 1.1 Alltagsengel — Überblick

| Merkmal | Wert |
|---|---|
| Typ | Next.js 16 (App Router) + Supabase |
| Hosting | Vercel (Production + Preview) |
| DB | Supabase `nnwyktkqibdjxgimjyuq` (eu-west-1) |
| Tabellen | 97 (67 mandantenfähig) |
| API-Routen | 56 |
| MIS-Module | 22 Seiten |
| Admin-Seiten | 32 Seiten |
| Rollen | kunde, engel, fahrer, admin, superadmin |
| Mobile | PWA + Capacitor (iOS published, Android vorbereitet) + separater Expo/RN-Prototyp |
| Auth | 4-Layer: proxy.ts → Layout Guards → API Guards → RLS |
| Multi-Mandant | Phase 3 abgeschlossen (67 Tabellen, RESTRICTIVE org_fence) |

### 1.2 efy care — Überblick

| Merkmal | Wert |
|---|---|
| Typ | Expo/React Native (Mobile) + Astro (Marketing-Website) |
| DB | Supabase `nsfbwhpjesmathsrqkfi` (eu-west-1) |
| Tabellen | 41 (39 mandantenfähig) |
| Edge Functions | 4 (Stripe checkout/portal/webhook, OCR via Claude Sonnet 5) |
| Screens | 29 App-Screens |
| Rollen | admin, betreuer (= caregiver), inhaber |
| Mobile | Native (Expo/RN), Offline-Queue (AES-GCM verschlüsselt) |
| Auth | Supabase Auth + Session-Verschlüsselung (AES-256-CTR) |
| Multi-Mandant | Vollständig (alle Tabellen außer profiles + service_modules) |

### 1.3 Modul-Matrix

#### Legende
- ✅ Vorhanden (produktiv aktiv)
- 🔶 Teilweise vorhanden
- ⬜ Nur vorbereitet (Tabelle/Route existiert, kein vollständiges UI)
- ❌ Fehlt
- ⚠️ Technisch vorhanden, fachlich nicht geprüft
- 💤 Deaktiviert

#### Kernmodule

| Modul | Alltagsengel | efy care | Anmerkung |
|---|---|---|---|
| **Benutzer-Auth** | ✅ 4-Layer Defense | ✅ Supabase Auth + AES | AE hat robustere Middleware |
| **Profilverwaltung** | ✅ | ✅ | |
| **Multi-Mandant** | ✅ Phase 3 (67 Tabellen) | ✅ (39 Tabellen) | AE umfangreicher |
| **Organisationsverwaltung** | ✅ CRUD + Switch | ✅ CRUD + Switch | |
| **SaaS-Billing (Stripe)** | ✅ Free/Starter/Pro/Scale | ✅ Free/Starter/Pro/Scale | Identisches Modell |
| **Feature-Gating** | ⬜ Tabelle existiert, MIS prüft nicht | ⬜ In Subscription-Features | |

#### Stammdaten

| Modul | Alltagsengel | efy care | Anmerkung |
|---|---|---|---|
| **Klientenverwaltung** | ✅ clients + care_recipients | ✅ clients | AE hat Angehörige separat |
| **Betreuerverwaltung** | ✅ caregivers + Qualifikationen + Dokumente | ✅ caregivers | AE deutlich umfangreicher |
| **Pflegegrad** | ✅ | ✅ | |
| **Versicherungsdaten** | 🔶 Felder in clients | 🔶 krankenkasse, versichertennummer | Kein vollständiges Kostenträger-Modell |
| **Kostenträger-Kontakte** | ✅ kostentraeger_kontakte | ✅ kostentraeger_kontakte | |
| **Medikamentenplan** | ✅ | ❌ | |
| **Notfallinformationen** | ✅ mit PIN-Schutz | ❌ | |
| **Budgetverwaltung** | ✅ client_budgets (131€) | ✅ budget_accounts | |

#### Verordnungen & Genehmigungen

| Modul | Alltagsengel | efy care | Anmerkung |
|---|---|---|---|
| **Verordnungserfassung** | ✅ 4-Schritt-Workflow | ✅ | |
| **Verordnungstypen** | ✅ SGB XI/V, privat | ✅ SGB XI/V, privat | |
| **Bewilligungen** | ✅ Genehmigungsstatus + Budget | ✅ | |
| **Leistungsarten** | ✅ verordnung_leistungen | ✅ verordnung_leistungen | |
| **Leistungspreise** | ✅ pro Bundesland + Gültigkeitszeitraum | ✅ pro Bundesland | |
| **Kombinationsleistungen** | 🔶 | ✅ Feld vorhanden | |

#### Einsatzplanung & Dienstplanung

| Modul | Alltagsengel | efy care | Anmerkung |
|---|---|---|---|
| **Einsatzzuordnung** | ✅ assignments (recurring) | ✅ client_caregiver_assignments | |
| **Abwesenheiten** | ✅ absences | ❌ | |
| **Vertretungsmanagement** | ✅ substitution_requests + Eskalation | ❌ | AE deutlich ausgereifter |
| **Einsatzabsagen** | ✅ einsatz_absagen | ✅ einsatz_absagen | |
| **Dienstplanung** | ⬜ mis_shifts (nur Tabelle+MIS-Seite) | ❌ | Nicht vollständig |
| **Tourenplanung** | ❌ | ❌ | Beide fehlt |
| **GPS-/Zeiterfassung** | ✅ geo_events + approved_locations | ✅ geo_events + approved_locations | |

#### Leistungsdokumentation

| Modul | Alltagsengel | efy care | Anmerkung |
|---|---|---|---|
| **Service Records** | ✅ service_records + Items | ✅ service_records + Items | |
| **Digitale Unterschriften** | ✅ service_signatures | ✅ signatures | |
| **OCR-Verarbeitung** | ✅ ocr_results (Tesseract) | ✅ ocr_results (Claude Sonnet 5) | efy: bessere KI |
| **Prüfzentrale (KI)** | ✅ review_errors + Ampelsystem | ✅ review_errors + Ampelsystem | |
| **Leistungsnachweis-Upload** | ✅ Native + Web | ✅ Native | |
| **Leistungsnachweis-PDF** | ✅ Kassenkonform | ❌ | |
| **Pflegedokumentation** | 🔶 care_notes (Freitext) | ❌ | Kein strukturiertes Pflegemodell |

#### Abrechnung

| Modul | Alltagsengel | efy care | Anmerkung |
|---|---|---|---|
| **Monatsabschluss** | ✅ monthly_closings + Workflow | ✅ monthly_closings | |
| **Automatische Rechnungserstellung** | ✅ auto-invoice API | ❌ | |
| **Rechnungen** | ✅ invoices + Items | ✅ invoices + Items | |
| **Rechnungs-PDF** | ✅ generate-pdf | ❌ | |
| **Rechnungspakete** | ✅ invoice_packages | ✅ invoice_packages | |
| **Rechnungskorrekturen** | ⬜ invoice_disputes (Tabelle) | ❌ | Nur Datenmodell |
| **EDIFACT-Erzeugung** | ✅ PLGA/PLAA nach TA1 v6.5.1 | ⬜ abrechnungslaeufe (Tabelle) | AE vollständig implementiert |
| **SECON-Verschlüsselung** | ✅ Reine TS-Implementierung | ❌ | |
| **SFTP-Transport** | ✅ An Datenannahmestellen | ❌ | |
| **Auftragsdatei** | ✅ 348-Byte nach Anlage 3 | ❌ | |
| **ITSG-Zertifikate** | ✅ Verwaltung + SFTP-Test | ❌ | |
| **Abrechnungsläufe** | ✅ abrechnungslaeufe | ✅ abrechnungslaeufe (Tabelle) | |
| **Zahlungskontrolle** | ✅ payment_status + Admin-UI | ✅ payment_status (Tabelle) | AE hat UI |
| **Mahnwesen** | ⬜ zahlungskontrolle-Seite | ❌ | Nur Ansicht, kein automatisches Mahnwesen |
| **Privatrechnungen** | 🔶 Über invoices möglich | 🔶 | Kein separater Workflow |
| **Zuzahlungen** | ❌ | ❌ | Beide fehlt |
| **Rückläufer/Ablehnungen** | ❌ | ❌ | Beide fehlt |
| **DATEV-Export** | ❌ | ❌ | Beide fehlt |
| **Buchhaltungsexport** | ❌ | ❌ | Beide fehlt |

#### Kommunikation

| Modul | Alltagsengel | efy care | Anmerkung |
|---|---|---|---|
| **In-App-Chat** | ✅ messages + chat_messages | ❌ | |
| **Notifications** | ✅ notifications (RLS-gehärtet) | ❌ | |
| **Push (FCM)** | ✅ | ❌ | |
| **Web Push** | ✅ push_subscriptions | ❌ | |
| **WhatsApp Bot** | ✅ mit KI | ❌ | |
| **E-Mail (Resend)** | ✅ | ❌ | |

#### CRM & Marketing

| Modul | Alltagsengel | efy care | Anmerkung |
|---|---|---|---|
| **CRM** | ✅ mis_crm_activities | ❌ | |
| **Lead Management** | ✅ lead_inquiries | ❌ | |
| **Bewerbermanagement** | ✅ applications + mis_applicants | ❌ | |
| **Stellenausschreibungen** | ✅ mis_job_postings | ❌ | |
| **Newsletter** | ✅ newsletter_subscribers | ❌ | |
| **Analytics** | ✅ page_views + events + conversions | ❌ | |
| **Google Reviews** | ✅ API-Integration | ❌ | |
| **Blog** | ✅ 38 Seiten | ❌ | efy hat statische Astro-Website |

#### Qualitätsmanagement

| Modul | Alltagsengel | efy care | Anmerkung |
|---|---|---|---|
| **QM-Dokumente** | ✅ mis_documents + Versionen | ✅ quality_documents | |
| **QM-Audits** | ✅ mis_quality_audits | ✅ quality_audits | |
| **CAPA** | ✅ mis_capa | ✅ quality_measures | |
| **KPIs** | ✅ mis_kpis | ❌ | |
| **Beschwerdemanagement** | ✅ mis_complaints | ❌ | |
| **Datenschutz (DSGVO)** | ✅ 4 Tabellen | ❌ | |

#### Sonstiges

| Modul | Alltagsengel | efy care | Anmerkung |
|---|---|---|---|
| **Krankenfahrten** | ✅ 18 Tabellen + Pricing-Engine | ❌ | Eigenständiges Subsystem |
| **Hygienebox-Bestellungen** | ✅ | ❌ | |
| **Empfehlungsprogramm** | ✅ referrals | ❌ | |
| **Bonussystem (Betreuer)** | ✅ caregiver_bonuses | ❌ | |
| **Zufriedenheitsanrufe** | ✅ satisfaction_calls | ❌ | |
| **Kooperationspartner** | ✅ cooperation_partners | ❌ | |
| **Fahrzeugverwaltung** | ✅ mis_vehicles | ❌ | |
| **Schulungsverwaltung** | ✅ mis_training_catalog + records | ❌ | |
| **Datenraum (Investor)** | ✅ mis_dataroom | ❌ | |
| **Beschaffung** | ✅ mis_suppliers + purchase_orders | ❌ | |
| **Vertragsverwaltung** | ✅ mis_contracts + Signaturen | ❌ | |
| **Offline-Queue** | ✅ offline_queue + sync_conflicts | ✅ (AES-GCM verschlüsselt) | efy: bessere Verschlüsselung |
| **Audit-Logs** | ✅ audit_logs + action_fingerprints | ✅ audit_logs + action_fingerprints | |
| **KI-Assistent** | ✅ mis_ai_conversations | ❌ | |

---

## 2. GAP-MATRIX

### Kritische Lücken (für marktführende Pflege-Plattform)

| # | Funktion | Ist-Stand | Priorität | Begründung |
|---|---|---|---|---|
| G1 | **Strukturierte Pflegedokumentation** | care_notes (Freitext) | HOCH | Pflichtdokumentation nach SGB XI/V, MDK-relevant |
| G2 | **Rückläufer/Ablehnungen** | ❌ | HOCH | Kern der Kassenabrechnung, ohne = kein Cashflow-Tracking |
| G3 | **Zuzahlungsberechnung** | ❌ | HOCH | Pflicht bei SGB V, Eigenanteil bei SGB XI |
| G4 | **DATEV-Export** | ❌ | HOCH | Ohne = manuelle Buchung beim Steuerberater |
| G5 | **Tourenplanung** | ❌ | MITTEL | Effizienz, aber nicht abrechnungsrelevant |
| G6 | **Vollständige Dienstplanung** | ⬜ (nur Tabelle) | MITTEL | mis_shifts existiert, aber kein vollständiger Workflow |
| G7 | **Privatrechnungs-Workflow** | 🔶 | MITTEL | Über invoices möglich, aber kein getrennter Prozess |
| G8 | **Vertragsmanagement (Kunden)** | ❌ (nur mis_contracts intern) | MITTEL | Betreuungsvertrag, Rahmenvertrag Kasse fehlen |
| G9 | **Mahnwesen (automatisch)** | ❌ | MITTEL | Nur manuelle Ansicht |
| G10 | **Buchhaltungsexport** | ❌ | MITTEL | FiBu-Anbindung |
| G11 | **Kunden-/Angehörigenportal** | 🔶 (Kunde-App) | NIEDRIG | Grundfunktionen vorhanden, aber kein Angehörigenzugang |
| G12 | **Mitarbeiterportal** | 🔶 (Engel-App) | NIEDRIG | Basis vorhanden |
| G13 | **KIM-Anbindung** | ❌ (geplant 12/2026) | NIEDRIG | Noch nicht Pflicht, aber Zukunftssicherheit |
| G14 | **§ 302 SGB V Abrechnung** | ❌ | HOCH | Aktuell nur § 105 SGB XI implementiert |
| G15 | **Controlling-Dashboard** | 🔶 mis_kpis + mis_financial_reports | MITTEL | Tabellen existieren, kein vollständiges Dashboard |

---

## 3. FACHLICHE PROZESSLANDKARTE

### 3.1 Kundenaufnahme und Stammdaten

```
Interessent → Erstgespräch → Pflegegrad prüfen → Stammdaten erfassen →
Versicherung/Kostenträger zuordnen → Verordnung anfordern → Vertrag erstellen
```

| Aspekt | Detail |
|---|---|
| Rollen | Admin, Pflegedienstleitung (PDL) |
| Eingabedaten | Name, Adresse, Geburtsdatum, Pflegegrad, Kostenträger-IK, Versichertennummer, Angehörigenkontakt |
| Prüfregeln | Pflegegrad vorhanden? Kostenträger gültig? IK korrekt (Luhn)? |
| Status | Interessent → Aufgenommen → Aktiv → Pausiert → Beendet |
| Dokumente | Verordnung, Pflegegradbescheid, Datenschutzerklärung, Betreuungsvertrag |
| Fehlerfälle | Kein Pflegegrad, ungültige Versichertennummer, fehlende Genehmigung |
| Ergebnis | Aktiver Klient mit Budget und zugeordnetem Kostenträger |
| Schnittstellen | Kostenträger-DB, Pflegekasse (Genehmigungsanfrage) |

### 3.2 Verordnungen und Genehmigungen

```
Arzt stellt Verordnung → Erfassung im System → Genehmigungsanfrage an Kasse →
Kasse genehmigt/lehnt ab → Bewilligte Leistungen + Budget eintragen →
Gültigkeitszeitraum setzen → Folgeverordnung bei Ablauf
```

| Aspekt | Detail |
|---|---|
| Rollen | Admin/PDL, Arzt (extern), Kostenträger (extern) |
| Eingabedaten | Verordnungstyp (SGB XI §36/§45a/§45b, SGB V §37), Arzt, Diagnose, Leistungsarten, Mengen, Zeitraum |
| Prüfregeln | Pflegegrad passt zu Leistungsart? Budget-Obergrenze? Gültigkeitszeitraum? |
| Status | Erfasst → Eingereicht → Genehmigt → Aktiv → Abgelaufen → Folgeverordnung |
| Dokumente | Verordnungsformular, Genehmigungsbescheid |
| Fehlerfälle | Ablehnung, Teilgenehmigung, Budgetüberschreitung |
| Ergebnis | Genehmigte Verordnung mit Leistungskatalog und Budget |
| Schnittstellen | Kostenträger (Genehmigung), Verordnung → Einsatzplanung |

### 3.3 Einsatz- und Tourenplanung

```
Verordnung aktiv → Einsätze planen (wiederkehrend/einmalig) →
Betreuer zuordnen → Tour optimieren → Dienstplan erstellen →
Betreuer informieren → Einsatz durchführen
```

| Aspekt | Detail |
|---|---|
| Rollen | PDL, Einsatzplaner, Betreuer |
| Eingabedaten | Klient, Betreuer, Wochentag, Uhrzeit, Leistungsart, Dauer |
| Prüfregeln | Betreuer qualifiziert? Verfügbar? Keine Überschneidung? Fahrtzeit realistisch? |
| Status | Geplant → Bestätigt → In Durchführung → Abgeschlossen → Abgesagt |
| Dokumente | Dienstplan, Tourenplan, Abwesenheitsmeldung |
| Fehlerfälle | Betreuer krank → Vertretung, Klient nicht anwesend → Absage |
| Ergebnis | Tagesaktuelle Einsatzliste pro Betreuer |
| Schnittstellen | Einsatzplanung → GPS-Tracking, Einsatzplanung → Leistungsdokumentation |

### 3.4 Leistungsdurchführung und -dokumentation

```
Betreuer am Einsatzort → GPS-Checkin → Leistung erbringen →
Leistung dokumentieren (Zeit, Art, Besonderheiten) →
Unterschrift Klient/Angehöriger → GPS-Checkout →
Automatische Prüfung (KI-Prüfzentrale) → Ampel-Bewertung
```

| Aspekt | Detail |
|---|---|
| Rollen | Betreuer, Klient (Unterschrift), KI-System |
| Eingabedaten | Start-/Endzeit, Leistungsart, Dauer, Besonderheiten, Unterschrift |
| Prüfregeln | GPS im Radius? Dauer plausibel? Unterschrift vorhanden? Leistung zu Verordnung passend? |
| Status | Offen → Dokumentiert → Geprüft → Freigegeben → Abgerechnet |
| Dokumente | Leistungsnachweis (Monatsbericht), Pflegebericht |
| Fehlerfälle | GPS außerhalb, fehlende Unterschrift, Zeitüberschreitung, Leistung nicht genehmigt |
| Ergebnis | Geprüfter, unterschriebener Leistungsnachweis |
| Schnittstellen | GPS-System, OCR (Scan), KI-Prüfzentrale, Monatsabschluss |

### 3.5 Monatsabschluss und Rechnungserstellung

```
Monatsende → Alle Leistungen prüfen → Unterschriften vollständig? →
Budget-Abgleich → Preise ermitteln (aus leistungspreise) →
Rechnungsentwurf erstellen → Interne Freigabe →
PDF erzeugen (Rechnung + Leistungsnachweise)
```

| Aspekt | Detail |
|---|---|
| Rollen | Admin, PDL, Buchhaltung |
| Eingabedaten | Monat, Klient, alle service_records des Monats |
| Prüfregeln | Alle Records unterschrieben? Budget nicht überschritten? Verordnung gültig? Preise aktuell? |
| Status | Offen → Geprüft → Freigegeben → Abgerechnet |
| Dokumente | Monats-Leistungsnachweis (PDF), Rechnung (PDF), Rechnungspaket |
| Fehlerfälle | Fehlende Unterschrift → Blocker, Budget überschritten → Warnung, Preis nicht hinterlegt → Fehler |
| Ergebnis | Freigegebenes Rechnungspaket |
| Schnittstellen | Leistungsdokumentation → Monatsabschluss → Kassenabrechnung |

### 3.6 Kassenabrechnung (§ 105 SGB XI)

```
Rechnungspaket freigegeben → EDIFACT-Nutzdaten erzeugen (PLGA/PLAA) →
Auftragsdatei erstellen → SECON-Verschlüsselung →
SFTP-Upload an Datenannahmestelle → Verarbeitungsquittung abwarten →
Rückmeldung verarbeiten → Zahlung oder Ablehnung
```

| Aspekt | Detail |
|---|---|
| Rollen | System (automatisch), Buchhaltung (bei Fehlern) |
| Eingabedaten | Freigegebene Rechnungen, ITSG-Zertifikate, Datenannahmestelle |
| Prüfregeln | IK gültig? Zertifikat nicht abgelaufen? EDIFACT-Validierung (3 Stufen)? |
| Status | Erzeugt → Verschlüsselt → Gesendet → Quittung erhalten → Bezahlt / Abgelehnt |
| Dokumente | EDIFACT-Datei, Auftragsdatei, Sendeprotokoll, Rückmeldung |
| Fehlerfälle | SFTP-Verbindungsfehler, Zertifikat abgelaufen, EDIFACT-Validierungsfehler, Rückläufer |
| Ergebnis | Zahlungseingang oder Ablehnungsgrund |
| Schnittstellen | ITSG Trust Center, Datenannahmestellen (DAVASO, BITMARCK, etc.), Kassensysteme |

### 3.7 Kassenabrechnung (§ 302 SGB V) — FEHLT

```
Verordnung SGB V → Häusliche Krankenpflege erbracht →
§ 302-Datensatz erzeugen (SLGA/SLLA) →
Verschlüsselung → Transport an Krankenkasse →
Rückmeldung → Zahlung
```

| Aspekt | Detail |
|---|---|
| Status | **❌ NICHT IMPLEMENTIERT** |
| Unterschied zu § 105 | Andere Segmentstruktur (SLGA/SLLA statt PLGA/PLAA), andere Schlüsselverzeichnisse, Krankenkasse statt Pflegekasse |
| Priorität | HOCH — ohne § 302 keine Abrechnung von häuslicher Krankenpflege |

### 3.8 Privatrechnung

```
Privatleistung erbracht → Leistungsnachweis → Privatrechnung erstellen →
An Klient senden → Zahlungseingang überwachen → Mahnung bei Verzug
```

| Aspekt | Detail |
|---|---|
| Rollen | Buchhaltung, Klient |
| Status | 🔶 Über invoices grundsätzlich möglich, kein separater Workflow |
| Schnittstellen | Buchhaltung → DATEV |

### 3.9 Zuzahlung

```
Leistung mit Eigenanteil → Zuzahlung berechnen →
Zuzahlungsrechnung an Klient → Zahlungseingang →
Zuordnung zur Hauptrechnung
```

| Aspekt | Detail |
|---|---|
| Status | **❌ FEHLT** |
| Relevanz | Pflicht bei SGB V (10% Eigenanteil), relevant bei SGB XI (Differenz Sachleistung/tatsächlicher Preis) |

### 3.10 Rückläufer und Ablehnungen

```
Kasse lehnt Rechnung (teilweise) ab → Rückmeldung einlesen →
Grund analysieren → Korrektur oder Widerspruch →
Korrigierte Rechnung neu einreichen
```

| Aspekt | Detail |
|---|---|
| Status | **❌ FEHLT** |
| Relevanz | HOCH — ohne Rückläufer-Verarbeitung bleiben abgelehnte Rechnungen liegen |

### 3.11 Zahlungsabgleich und Mahnwesen

```
Zahlung eingeht → Zuordnung zu Rechnung → Teilzahlung/Vollzahlung →
Offene Posten aktualisieren → Fälligkeit überschritten → Mahnstufen →
Mahnung versenden
```

| Aspekt | Detail |
|---|---|
| Status | 🔶 payment_status + zahlungskontrolle-Seite existieren, kein automatisches Mahnwesen |

### 3.12 Buchhaltung und DATEV

```
Rechnungen + Zahlungen → Buchungssätze generieren →
DATEV-Export (CSV oder DATEV-Format) →
Import beim Steuerberater
```

| Aspekt | Detail |
|---|---|
| Status | **❌ FEHLT** |
| Relevanz | MITTEL-HOCH — aktuell manuelle Übergabe an Steuerberater |

### 3.13 Controlling

```
KPIs berechnen → Dashboard → Auslastung, Umsatz, Deckungsbeitrag →
Abweichungsanalyse → Maßnahmen
```

| Aspekt | Detail |
|---|---|
| Status | 🔶 mis_kpis + mis_financial_reports existieren, kein vollständiges Dashboard |

---

## 4. ZIELARCHITEKTUR

### 4.1 Schichtmodell

```
┌─────────────────────────────────────────────────┐
│  PORTALE                                         │
│  Kunden-App │ Betreuer-App │ Admin-Web │ MIS     │
├─────────────────────────────────────────────────┤
│  API-SCHICHT (Next.js API Routes / Edge Fns)    │
│  REST + RPC │ Auth │ Validation │ Rate Limiting  │
├─────────────────────────────────────────────────┤
│  DOMÄNEN-SERVICES                                │
│  Billing │ Scheduling │ Documentation │ QM       │
├──────────┬──────────────────────────────────────┤
│  ADAPTER │  DAKOTA │ KIM │ DATEV │ Datei-Export  │
├──────────┴──────────────────────────────────────┤
│  DATENBANK (Supabase/PostgreSQL)                │
│  RLS │ Org-Fence │ Triggers │ Audit              │
├─────────────────────────────────────────────────┤
│  INFRASTRUKTUR                                   │
│  Vercel │ Supabase │ Stripe │ Sentry │ Storage   │
└─────────────────────────────────────────────────┘
```

### 4.2 Abrechnungskern — Modulare Struktur

```
lib/billing/
├── core/
│   ├── invoice-engine.ts        # Rechnungserzeugung (Kern)
│   ├── price-resolver.ts        # Preisauflösung (Verordnung → Preis)
│   ├── budget-tracker.ts        # Budgetverwaltung + Kontingentprüfung
│   ├── validation.ts            # Vorprüfung (Blocker + Warnungen)
│   └── correction.ts            # Rechnungskorrektur + Storno
│
├── documents/
│   ├── leistungsnachweis.ts     # LNW-PDF-Erzeugung
│   ├── invoice-pdf.ts           # Rechnungs-PDF
│   ├── privatrechnung.ts        # Privatrechnungs-PDF
│   └── mahnung.ts               # Mahnungs-PDF
│
├── transmission/                 # ADAPTER-SCHICHT
│   ├── adapter.ts               # Interface: ITransmissionAdapter
│   ├── edifact/
│   │   ├── sgb-xi.ts            # § 105 SGB XI (PLGA/PLAA)
│   │   ├── sgb-v.ts             # § 302 SGB V (SLGA/SLLA)
│   │   ├── segments.ts          # EDIFACT-Segmente
│   │   └── validator.ts         # 3-Stufen-Validierung
│   ├── secon/
│   │   └── encryption.ts        # SECON CMS/PKCS#7
│   ├── transport/
│   │   ├── sftp.ts              # SFTP-Upload
│   │   ├── kim.ts               # KIM (zukünftig)
│   │   └── file-export.ts       # Datei-Download
│   ├── auftragsdatei.ts         # 348-Byte Begleitsatz
│   └── test-mode.ts             # Simulation/Testbetrieb
│
├── reconciliation/
│   ├── payment-matching.ts      # Zahlungsabgleich
│   ├── rejection-handler.ts     # Rückläufer-Verarbeitung
│   ├── dunning.ts               # Mahnwesen
│   └── open-items.ts            # Offene-Posten-Verwaltung
│
├── export/
│   ├── datev.ts                 # DATEV-Export
│   └── csv.ts                   # CSV-Export
│
└── types.ts                     # Gemeinsame Typen
```

### 4.3 Adapter-Architektur (Übertragung)

```typescript
// Interface für alle Übertragungswege
interface ITransmissionAdapter {
  name: string;
  validate(invoice: Invoice): ValidationResult;
  prepare(invoice: Invoice): TransmissionPackage;
  transmit(pkg: TransmissionPackage): TransmissionResult;
  getStatus(transmissionId: string): TransmissionStatus;
  handleResponse(response: ResponsePackage): void;
}

// Implementierungen:
// 1. EdifactSftpAdapter (DAKOTA-Ersatz) — VORHANDEN
// 2. EdifactKimAdapter (KIM) — GEPLANT 12/2026
// 3. FileExportAdapter (manueller Download) — FÜR ÜBERGANG
// 4. TestAdapter (Simulation) — FÜR ENTWICKLUNG
// 5. DirectApiAdapter (zukünftige Kassen-APIs) — ZUKUNFTSSICHER
```

### 4.4 Rollen- und Berechtigungskonzept

| Rolle | Bereich | Rechte |
|---|---|---|
| **superadmin** | Plattform-global | Alles, Org-Verwaltung, Feature-Flags |
| **admin** | Organisation | Vollzugriff innerhalb der eigenen Organisation |
| **pdl** (NEU) | Organisation | Einsatzplanung, Verordnungen, Monatsabschluss, keine Finanzen |
| **buchhaltung** (NEU) | Organisation | Rechnungen, Zahlungen, DATEV, Mahnwesen, keine Klientendaten |
| **betreuer** | Organisation | Eigene Einsätze, Leistungsdokumentation, Zeiterfassung |
| **kunde** | Eigene Daten | Eigene Buchungen, Leistungsübersicht, Rechnungen einsehen |
| **angehoeriger** (NEU) | Delegiert | Eingeschränkter Zugriff auf Klientendaten (vom Kunden autorisiert) |
| **fahrer** | Eigene Fahrten | Krankenfahrten-Subsystem |

### 4.5 Statusmodelle

#### Rechnung

```
ENTWURF → GEPRÜFT → FREIGEGEBEN → ÜBERMITTELT → QUITTIERT → BEZAHLT
                                                            ↓
                                              TEILWEISE_BEZAHLT → BEZAHLT
                                                            ↓
                                              ABGELEHNT → KORRIGIERT → ÜBERMITTELT
                                                            ↓
                                              STORNIERT
```

#### Verordnung

```
ERFASST → EINGEREICHT → GENEHMIGT → AKTIV → ABGELAUFEN
                      ↓                        ↓
              ABGELEHNT                 FOLGEVERORDNUNG
                      ↓
              TEILGENEHMIGT → AKTIV
```

#### Leistungsnachweis

```
ERFASST → GEPRÜFT_KI → UNTERSCHRIEBEN → FREIGEGEBEN → ABGERECHNET
              ↓                ↓
         BEANSTANDET    NACHSIGNATUR_ERFORDERLICH
```

### 4.6 Event- und Audit-Konzept

Jede geschäftsrelevante Aktion erzeugt einen Audit-Eintrag:

```typescript
interface AuditEvent {
  id: uuid;
  organization_id: uuid;
  actor_id: uuid;
  action: string;           // 'invoice.created', 'verordnung.approved', etc.
  entity_type: string;      // 'invoice', 'service_record', etc.
  entity_id: uuid;
  before: jsonb;            // Zustand vorher (bei Updates)
  after: jsonb;             // Zustand nachher
  metadata: jsonb;          // Zusatzinfos (IP, User-Agent, etc.)
  created_at: timestamptz;
}
```

Bereits implementiert in beiden Systemen (audit_logs + action_fingerprints).

### 4.7 Historische Versionierung

**Kritisch:** Preise, Verordnungen, Rechnungen und Genehmigungen müssen historisch versioniert werden.

Ansatz: **Temporal Tables mit Gültigkeitszeitraum**

```sql
-- Beispiel: leistungspreise
CREATE TABLE leistungspreise (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL DEFAULT current_org_id(),
  bundesland TEXT NOT NULL,
  leistungsart TEXT NOT NULL,
  preis_cent INTEGER NOT NULL,
  gueltig_ab DATE NOT NULL,
  gueltig_bis DATE,              -- NULL = aktuell gültig
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Bei Preisänderung: alten Datensatz abschließen (gueltig_bis setzen),
-- neuen anlegen (gueltig_ab = ab sofort).
-- Rechnungen referenzieren den zum Leistungszeitpunkt gültigen Preis.
```

Bereits implementiert bei: leistungspreise (gueltig_ab/bis), verordnungen (gueltig_von/bis), abrechnung_zertifikate (gueltig_ab/bis).

Noch zu implementieren bei: invoice_items (Preis zum Leistungszeitpunkt einfrieren), service_pricing (Gültigkeitszeitraum).

### 4.8 Offline- und Synchronisationskonzept

Bereits implementiert in beiden Systemen:
- **offline_queue**: Aktionen werden lokal zwischengespeichert
- **sync_conflicts**: Konflikte werden erkannt und zur manuellen Lösung markiert
- **efy care**: AES-GCM-Verschlüsselung der Offline-Queue
- **action_fingerprints**: Deduplizierung bei erneutem Sync

Zu erweitern:
- Offline-Leistungsdokumentation mit Unterschrift
- Offline-Einsatzplan-Ansicht
- Sync-Priorisierung (Leistungsnachweise vor Analytics)

### 4.9 Mandanten- und Standortkonzept

```
Plattform
  └── Organisation (= Pflegedienst / Betreuungsdienst)
        ├── Standort A (geplant, noch nicht implementiert)
        ├── Standort B
        └── ...
```

**Ist:** Multi-Mandant über organizations + organization_members + RESTRICTIVE org_fence.
**Fehlt:** Standort-Ebene unterhalb der Organisation (für Pflegedienste mit mehreren Niederlassungen).

---

## 5. DATENMODELL — NEUE/ERWEITERTE TABELLEN

### 5.1 Neue Tabellen (Abrechnungskern)

| Tabelle | Zweck | Wichtigste Spalten |
|---|---|---|
| **invoice_corrections** | Rechnungskorrekturen | invoice_id, correction_type (storno/teilstorno/korrektur), original_amount, corrected_amount, reason, corrected_invoice_id |
| **invoice_versions** | Rechnungshistorie | invoice_id, version, snapshot (jsonb), created_at, created_by |
| **rejection_records** | Rückläufer/Ablehnungen | abrechnungslauf_id, invoice_id, rejection_code, rejection_text, status, resubmission_id |
| **copayments** | Zuzahlungen | invoice_id, client_id, copayment_type, amount_cents, status, due_date |
| **dunning_records** | Mahnwesen | invoice_id, dunning_level (1/2/3), sent_at, due_date, amount_cents |
| **datev_exports** | DATEV-Buchungssätze | export_date, period, booking_entries (jsonb), status, file_url |
| **care_documentation** | Strukturierte Pflegedoku | client_id, caregiver_id, visit_id, documentation_type, content (jsonb), created_at |
| **customer_contracts** | Kundenverträge | client_id, contract_type, start_date, end_date, terms (jsonb), signed_at |
| **transmission_log** | Übertragungsprotokoll | abrechnungslauf_id, adapter_type, status, sent_at, response_at, response_data |

### 5.2 Zu erweiternde Tabellen

| Tabelle | Erweiterung |
|---|---|
| **invoices** | + `correction_of` (FK → invoices), + `version`, + `transmission_status`, + `rejection_count` |
| **service_records** | + `locked_price_cents` (eingefrorener Preis zum Leistungszeitpunkt) |
| **organizations** | + `standorte` (Array oder separate Tabelle), + `datev_beraternummer`, + `datev_mandantennummer` |

---

## 6. ABRECHNUNGSWORKFLOW (END-TO-END)

```
[Leistung erbringen]
        ↓
[Leistung dokumentieren + Unterschrift]
        ↓
[KI-Prüfzentrale: Ampel grün?] ──rot──→ [Beanstandung → Korrektur]
        ↓ grün
[Monatsabschluss: Alle Records vollständig?] ──nein──→ [Fehlende Unterschriften nachfordern]
        ↓ ja
[Preisauflösung: leistungspreise zum Leistungszeitpunkt]
        ↓
[Budget-Prüfung: Kontingent nicht überschritten?] ──Warnung──→ [PDL prüft]
        ↓ ok
[Rechnungsentwurf erstellen]
        ↓
[Interne Freigabe]
        ↓
[Rechnungs-PDF + Leistungsnachweis-PDF erzeugen]
        ↓
┌──────────────────────┐
│ Kostenträger-Typ?    │
├──────────────────────┤
│ Pflegekasse (SGB XI) │──→ [EDIFACT PLGA/PLAA] → [SECON] → [SFTP] → [Warte auf Rückmeldung]
│ Krankenkasse (SGB V) │──→ [EDIFACT SLGA/SLLA] → [SECON] → [SFTP] → [Warte auf Rückmeldung]
│ Privat               │──→ [Privatrechnung per Post/E-Mail]
│ Sozialamt            │──→ [Rechnung per Post]
└──────────────────────┘
        ↓
[Rückmeldung verarbeiten]
        ↓
┌──────────────────────┐
│ Ergebnis?            │
├──────────────────────┤
│ Bezahlt              │──→ [Zahlungseingang buchen] → [DATEV-Export]
│ Teilweise bezahlt    │──→ [Differenz → Offene Posten] → [Mahnung oder Korrektur]
│ Abgelehnt            │──→ [Grund analysieren] → [Korrektur] → [Neu einreichen]
└──────────────────────┘
```

---

## 7. MARKT- UND LÜCKENMATRIX

### 7.1 Wettbewerbervergleich (nur belegte Funktionen)

| Funktion | Vivendi PEP | MediFox DAN | DMRZ.de | Snap | Unser System |
|---|---|---|---|---|---|
| Pflegedokumentation | ✅ Vollständig | ✅ Vollständig | ❌ | 🔶 | 🔶 care_notes |
| Tourenplanung | ✅ | ✅ | ❌ | ✅ | ❌ |
| Dienstplanung | ✅ | ✅ | ❌ | ✅ | ⬜ |
| EDIFACT § 105 | ✅ | ✅ | ✅ | ✅ | ✅ |
| EDIFACT § 302 | ✅ | ✅ | ✅ | ✅ | ❌ |
| DATEV-Export | ✅ | ✅ | ❌ | ⚠️ | ❌ |
| Mobile App | 🔶 | 🔶 | ❌ | ✅ native | ✅ PWA + Native |
| KI-Prüfzentrale | ❌ | ❌ | ❌ | ❌ | ✅ |
| OCR-Leistungsnachweis | ❌ | ❌ | ❌ | ❌ | ✅ (Claude Sonnet 5) |
| Multi-Mandant SaaS | ❌ On-Prem | 🔶 | ✅ Cloud | ✅ Cloud | ✅ |
| WhatsApp-Bot | ❌ | ❌ | ❌ | ❌ | ✅ mit KI |
| Echtzeit-Pricing | ❌ | ❌ | ❌ | ❌ | ✅ |
| Preis (mtl.) | ~300-800€ | ~200-600€ | ab 9,90€ | ⚠️ | SaaS-Modell |

### 7.2 Unsere Stärken (USP)

1. **KI-Prüfzentrale** — Kein Wettbewerber hat automatische KI-basierte Leistungsnachweisprüfung
2. **OCR mit Claude Sonnet 5** — Handschriftliche Leistungsnachweise automatisch digitalisieren
3. **Mobile-First mit Offline** — Vollwertige native App mit verschlüsselter Offline-Queue
4. **SECON in TypeScript** — Keine Java-Abhängigkeit für Kassenverschlüsselung
5. **WhatsApp-Bot** — Kundenanfragen automatisch beantworten
6. **SaaS mit Feature-Gating** — Skalierbar von Solo-Betreuer bis Pflegedienst-Kette
7. **Betreuungsdienst-Fokus** — Markt für § 45a-Anbieter wird von Software-Anbietern unterversorgt

### 7.3 Chancen

| Chance | Begründung | Priorität |
|---|---|---|
| **Betreuungsdienste (§ 45a)** | Kaum Software-Anbieter adressieren reine Betreuungsdienste explizit | HOCH |
| **Transparente Preise** | Die meisten Wettbewerber verstecken Preise — Vertrauen durch Transparenz | HOCH |
| **KI-Automatisierung** | Kein Wettbewerber nutzt KI für Prüfung/OCR/Dokumentation | HOCH |
| **Cloud-Native** | Vivendi/MediFox sind On-Prem-lastig, Migration zu Cloud ist Trend | MITTEL |
| **Kleine Anbieter** | Solo-Betreuer und kleine Dienste werden von teuren Lösungen ausgeschlossen | MITTEL |

---

## 8. PRIORISIERTE ROADMAP

### Phase A — Fachlicher Abrechnungskern (8-10 Wochen)

| # | Funktion | Abhängigkeit | Komplexität | Abnahme |
|---|---|---|---|---|
| A1 | Rechnungskorrektur + Storno | invoices | MITTEL | Korrekturrechnung erzeugt, Original storniert, Audit-Trail |
| A2 | Rechnungsversionen | invoices | NIEDRIG | Jede Änderung erzeugt Version, alte Versionen lesbar |
| A3 | § 302 SGB V EDIFACT (SLGA/SLLA) | edifact-generator | HOCH | SLGA/SLLA nach TA1, Validierung, Testdaten |
| A4 | Rückläufer-Verarbeitung | abrechnungslaeufe | HOCH | Rückmeldungen einlesen, Status aktualisieren, Wiedervorlage |
| A5 | Zuzahlungsberechnung | invoices, verordnungen | MITTEL | SGB V 10%, SGB XI Differenz, Zuzahlungsrechnung |
| A6 | Preis-Einfrierung bei Abrechnung | service_records, invoice_items | NIEDRIG | Preis zum Leistungszeitpunkt gespeichert |

**DB-Änderungen:** invoice_corrections, invoice_versions, rejection_records, copayments
**APIs:** POST /api/billing/correct, POST /api/billing/process-rejection, GET /api/billing/rejections
**Tests:** Korrektur-Workflow E2E, § 302 EDIFACT-Validierung, Rückläufer-Cycle

### Phase B — Leistungsnachweise und Dokumentation (4-6 Wochen)

| # | Funktion | Abhängigkeit | Komplexität | Abnahme |
|---|---|---|---|---|
| B1 | Strukturierte Pflegedokumentation | care_notes erweitern | MITTEL | Strukturiertes Schema statt Freitext, MDK-konform |
| B2 | Dokumentenvorlagen | documents | NIEDRIG | Betreuungsvertrag, Datenschutz, Abtretung als Vorlagen |
| B3 | Digitale Vertragsunterschrift | customer_contracts | MITTEL | Vertrag → Unterschrift (Touch) → PDF |
| B4 | Leistungsnachweis-Verbesserungen | leistungsnachweis-pdf | NIEDRIG | Mehrere Budget-Töpfe pro Nachweis, Kassenkonforme Optimierung |

**DB-Änderungen:** care_documentation (neu), customer_contracts (neu)
**Tests:** Pflegedoku-Formular E2E, Vertragsworkflow

### Phase C — Kassenkommunikation und Übertragungsadapter (6-8 Wochen)

| # | Funktion | Abhängigkeit | Komplexität | Abnahme |
|---|---|---|---|---|
| C1 | Adapter-Interface implementieren | lib/billing/transmission | MITTEL | Alle Adapter implementieren ITransmissionAdapter |
| C2 | KIM-Adapter (Vorbereitung) | C1 | HOCH | Schnittstelle definiert, Stub implementiert |
| C3 | Test-/Simulationsadapter | C1 | NIEDRIG | Trockenlauf ohne echten Versand |
| C4 | Transmission-Log | C1 | NIEDRIG | Jede Übertragung protokolliert mit Status |
| C5 | Automatische Rückmeldungsverarbeitung | Rückläufer (A4) | HOCH | EDIFACT-Rückmeldungen parsen und verarbeiten |

**DB-Änderungen:** transmission_log (neu)
**Risiken:** KIM-Spezifikation noch nicht final, § 302-Rückmeldungsformate komplex

### Phase D — Touren-, Dienst- und Einsatzplanung (6-8 Wochen)

| # | Funktion | Abhängigkeit | Komplexität | Abnahme |
|---|---|---|---|---|
| D1 | Vollständige Dienstplanung | mis_shifts erweitern | HOCH | Schichtplanung, Verfügbarkeiten, Konflikterkennung |
| D2 | Tourenplanung | assignments + Geo | HOCH | Reihenfolge-Optimierung, Fahrtzeitberechnung |
| D3 | Automatische Vertretungssuche | substitution_requests | MITTEL | Bei Ausfall automatisch qualifizierte Vertretung vorschlagen |

**DB-Änderungen:** shifts erweitern, tour_plans (neu)
**Risiken:** Tourenoptimierung ist algorithmisch komplex

### Phase E — Zahlungsabgleich, Buchhaltung, Controlling (4-6 Wochen)

| # | Funktion | Abhängigkeit | Komplexität | Abnahme |
|---|---|---|---|---|
| E1 | DATEV-Export | invoices + payments | MITTEL | CSV oder DATEV-Format, Kontenzuordnung |
| E2 | Automatisches Mahnwesen | dunning_records | MITTEL | 3 Mahnstufen, automatische Fristberechnung |
| E3 | Offene-Posten-Verwaltung | payments + invoices | NIEDRIG | Übersicht aller offenen Forderungen |
| E4 | Controlling-Dashboard | mis_kpis + invoices + service_records | MITTEL | Umsatz, Auslastung, Deckungsbeitrag, Trends |

**DB-Änderungen:** datev_exports (neu), dunning_records (neu)

### Phase F — Portale (4-6 Wochen)

| # | Funktion | Abhängigkeit | Komplexität | Abnahme |
|---|---|---|---|---|
| F1 | Angehörigenportal | clients + delegated access | MITTEL | Leistungsübersicht, Rechnungen, Termine einsehen |
| F2 | Erweitertes Kundenportal | kunde-App | NIEDRIG | Rechnungseinsicht, Budgetübersicht, Feedback |
| F3 | Erweitertes Mitarbeiterportal | engel-App | NIEDRIG | Dienstplan, Fortbildungen, Dokumente |

### Phase G — KI-Unterstützung und Automatisierung (fortlaufend)

| # | Funktion | Abhängigkeit | Komplexität | Abnahme |
|---|---|---|---|---|
| G1 | KI-Pflegedokumentation | care_documentation | HOCH | Sprachbasierte Dokumentation → strukturierter Eintrag |
| G2 | Automatische Verordnungserkennung (OCR) | verordnungen | MITTEL | Foto der Verordnung → automatisch erfasst |
| G3 | Anomalie-Erkennung | service_records + geo_events | MITTEL | Ungewöhnliche Muster automatisch flaggen |
| G4 | Prognose-Dashboard | Controlling | MITTEL | Umsatzprognose, Kapazitätsplanung |

---

## 9. ERSTER VERTICAL SLICE

### Empfehlung: "Von der dokumentierten Leistung zur realen Kassenrechnung"

Der kleinste End-to-End-Prozess, der sofort Wert liefert:

```
Bestehender Klient + Verordnung + Betreuer
→ Leistung dokumentieren (service_record mit Unterschrift)
→ Monatsabschluss (monthly_closing)
→ Preis auflösen + einfrieren
→ Rechnungsentwurf (invoice + items)
→ Rechnungs-PDF
→ EDIFACT erzeugen (§ 105 SGB XI — BEREITS IMPLEMENTIERT)
→ SECON-Verschlüsselung (BEREITS IMPLEMENTIERT)
→ SFTP-Versand (BEREITS IMPLEMENTIERT)
→ Rückmeldung verarbeiten (NEU)
→ Zahlungseingang buchen (NEU)
```

**Was bereits funktioniert:**
- Leistungsdokumentation ✅
- Monatsabschluss ✅
- Rechnungserstellung ✅
- Rechnungs-PDF ✅
- EDIFACT-Erzeugung ✅
- SECON-Verschlüsselung ✅
- SFTP-Transport ✅

**Was fehlt für den ersten vollständigen Durchlauf:**
1. **Preis-Einfrierung** bei invoice_items (locked_price_cents) — 1 Tag
2. **Rückläufer-Verarbeitung** (Rückmeldung parsen, Status setzen) — 3-5 Tage
3. **Zahlungseingang** zuordnen (payment_status aktualisieren) — 1-2 Tage
4. **Rechnungskorrektur** bei Ablehnung — 3-5 Tage

**Geschätzter Aufwand:** 2-3 Wochen für den ersten vollständigen Zyklus.

---

## 10. BRANCH- UND PR-STRUKTUR

```
main (geschützt, kein direkter Push)
  │
  ├── feature/billing-core-corrections     PR #35 — Rechnungskorrektur + Versionen
  │     └── invoice_corrections, invoice_versions, locked_price_cents
  │
  ├── feature/billing-rejections            PR #36 — Rückläufer-Verarbeitung
  │     └── rejection_records, transmission_log, EDIFACT-Rückmeldung-Parser
  │
  ├── feature/billing-sgb-v-302             PR #37 — § 302 SGB V EDIFACT
  │     └── SLGA/SLLA Generator, Validator, Schlüsselverzeichnisse
  │
  ├── feature/billing-copayments            PR #38 — Zuzahlungen
  │     └── copayments, Zuzahlungsberechnung, Zuzahlungsrechnung
  │
  ├── feature/billing-datev                 PR #39 — DATEV-Export
  │     └── datev_exports, Kontenzuordnung, CSV-Export
  │
  ├── feature/billing-dunning               PR #40 — Mahnwesen
  │     └── dunning_records, Mahnstufen, Mahnungs-PDF
  │
  └── feature/care-documentation            PR #41 — Strukturierte Pflegedokumentation
        └── care_documentation, Dokumentationsvorlagen
```

Jeder PR enthält:
- Migration + Rollback-Migration
- RLS-Policies (RESTRICTIVE org_fence)
- API-Routen
- Admin-UI
- Tests (Unit + Staging-RLS)
- Audit-Report

---

## 11. OFFENE FACHLICHE FRAGEN

| # | Frage | Warum relevant | Wer muss antworten |
|---|---|---|---|
| F1 | Welche **konkreten Kostenträger** werden aktuell bedient? | Bestimmt Priorität § 105 vs. § 302 | Yusuf / Beraterin |
| F2 | Werden **häusliche Krankenpflegeleistungen** (SGB V § 37) erbracht? | Wenn ja, § 302 ist sofort Pflicht | Yusuf / Beraterin |
| F3 | Wie erfolgt aktuell die **Kommunikation mit Kassen** (Genehmigungen)? | Fax? Portal? Digitalisierungspotenzial | Yusuf / Beraterin |
| F4 | Welches **DATEV-Format** nutzt der Steuerberater? | DATEV CSV-Import vs. DATEV-Connect | Steuerberater |
| F5 | Gibt es **Leistungskomplexe** oder **Zeitvergütung**? | Beeinflusst Preisauflösung fundamental | Yusuf / Beraterin |
| F6 | Welche **Bundesländer** sind aktuell relevant? | Unterschiedliche Rahmenverträge und Preise | Yusuf |
| F7 | Gibt es bereits eine **ITSG-Registrierung** und Zertifikat? | Ohne = kein elektronischer Versand möglich | Yusuf |
| F8 | Soll der Abrechnungskern auch für **efy care** nutzbar sein? | Wenn ja, als shared library oder Monorepo-Paket? | Yusuf |
| F9 | Wie werden aktuell **Rückläufer** behandelt? | Manuell? Abrechnungszentrum? | Yusuf / Beraterin |
| F10 | Welche **MDK-Prüfungsanforderungen** bestehen konkret? | Beeinflusst Pflegedokumentation | Beraterin |
| F11 | Wird ein **Abrechnungszentrum** (z.B. DMRZ) genutzt oder soll alles direkt laufen? | Architektur-Entscheidung | Yusuf |
| F12 | Werden **Kombinationsleistungen** (§ 38 SGB XI) abgerechnet? | Komplexe Preisauflösung Sachleistung + Pflegegeld | Yusuf / Beraterin |

---

## 12. EMPFEHLUNG

### Erster Vertical Slice: "Rückläufer-Verarbeitung und Zahlungseingang"

**Warum:** Die EDIFACT-Erzeugung, SECON-Verschlüsselung und der SFTP-Transport sind bereits vollständig implementiert. Der Abrechnungsprozess ist zu 80% fertig. Was fehlt, ist der **Rückkanal** — die Verarbeitung der Kassen-Rückmeldungen und die Verbuchung der Zahlungseingänge. Ohne diesen letzten Schritt kann keine Rechnung als "bezahlt" markiert werden, und der Abrechnungszyklus bleibt offen.

**Erster PR (#35): `feature/billing-core-corrections`**
- Preis-Einfrierung bei invoice_items
- Rechnungskorrektur + Storno
- Rechnungsversionen
- Geschätzter Aufwand: 1-2 Wochen

**Zweiter PR (#36): `feature/billing-rejections`**
- Rückläufer-Verarbeitung (EDIFACT-Rückmeldung parsen)
- Transmission-Log
- Zahlungseingang buchen
- Offene-Posten-Verwaltung
- Geschätzter Aufwand: 2-3 Wochen

Nach diesen beiden PRs kann erstmals ein vollständiger Abrechnungszyklus durchlaufen werden: Leistung → Rechnung → Versand → Rückmeldung → Zahlung.

**Vor dem Start:** Die offenen fachlichen Fragen F1, F5, F9 und F11 sollten beantwortet werden, da sie die Implementierung direkt beeinflussen.
