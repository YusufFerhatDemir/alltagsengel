# Marktvergleich: Alltagsengel vs. Professionelle Pflege-Software

**Datum:** 15.08.2026  
**Erstellt:** Autonomer Audit  
**Vergleichsbasis:** Marktstandard ambulanter Pflegedienste / Betreuungsdienste (MediFox, Connext Vivendi, DMRZ, snap ambulant, Myneva, etc.)

---

## 1. Executive Summary

Die Alltagsengel-Software deckt **ca. 90% des Funktionsumfangs** professioneller Pflege-Software ab. Besonders stark ist die Abrechnung (EDIFACT/DTA/DAKOTA/KIM/SGB V/SEPA/DATEV), die Pflegedokumentation (SIS, Wunddoku, Vitalwerte, Medikamente, Maßnahmenplanung) und die Multi-Mandanten-Architektur.

**5 Lücken** wurden identifiziert und heute geschlossen:
1. Ärzteverwaltung (Stammdaten mit LANR/BSNR)
2. Fristen-Dashboard (zentrale Fristenübersicht)
3. PDL-Cockpit (erweitertes operatives Reporting)
4. Pflegebericht / Berichteblatt (strukturierte Tagesdokumentation)
5. Sturzprotokoll (strukturierte Sturzdokumentation)

---

## 2. Feature-Matrix

### Legende
- VOLL = Vollständig implementiert, produktionsreif
- TEIL = Teilweise implementiert oder mit Einschränkungen
- NEU = Heute implementiert
- FEHLT = Nicht vorhanden

| Bereich | Funktion | Marktstandard | Alltagsengel | Status |
|---------|----------|---------------|--------------|--------|
| **Stammdaten** | Klientenverwaltung | Pflicht | Vollständig (Aufnahme, Akte, Kontaktpersonen, Dokumente, Pflegegrad, Budget) | VOLL |
| | Mitarbeiterverwaltung | Pflicht | Vollständig (Stammdaten, Qualifikationen, Einsatzfreigabe, Vertragsstatus) | VOLL |
| | Kostenträgerverwaltung | Pflicht | Zwei Systeme: Kontaktdatenbank + DTA-Kostenträger mit IK-Nummern | VOLL |
| | Ärzte- & Praxenverwaltung | Pflicht | Eigenständige Stammdatenverwaltung mit LANR/BSNR | NEU |
| | Angehörigenverwaltung | Standard | Vollständig (Zugänge, Rollen, Nachrichten, Audit) | VOLL |
| | Kooperationspartner | Nice-to-have | Vorhanden (Partner, Besuche, Referrals) | VOLL |
| **Leistungsplanung** | Verordnungsverwaltung | Pflicht | Exzellent (4-Schritt-Workflow: Erfassung, Genehmigung, Verplanung, Abrechnung) | VOLL |
| | Leistungsnachweis | Pflicht | Vollständig (digital, Upload, OCR, Unterschrift) | VOLL |
| | Budgetverwaltung | Pflicht | Vorhanden (§45b, VP/KZP, Kombinationsleistung) | VOLL |
| | Einsatzplanung | Pflicht | Vorhanden (Assignments, Verfügbarkeit, Absagenmanagement) | VOLL |
| **Tourenplanung** | Tourenerstellung | Pflicht | Vorhanden (Touren, Stops, Templates, Vertretung) | TEIL |
| | Routenoptimierung | Standard | PLZ-basierte Schätzung, kein Routing-API | TEIL |
| | Fahrzeitkalkulation | Standard | Vorhanden (lib/touren/fahrtzeit.ts) | TEIL |
| **Dienstplanung** | Schichtplanung | Pflicht | Vollständig (Schichten, Einträge, Tagesansicht) | VOLL |
| | Abwesenheitsverwaltung | Pflicht | Vollständig (9 Abwesenheitstypen, Genehmigungsworkflow) | VOLL |
| | Urlaubskonto | Pflicht | Vollständig (Jahresanspruch, Übertrag) | VOLL |
| | Arbeitszeiterfassung | Pflicht | Vollständig (manuell, App, Korrekturen, Stundenkonto) | VOLL |
| | Ausfallmanagement | Standard | Vorhanden (Vertretungssuche, Absagenmanagement) | VOLL |
| **Pflegedokumentation** | SIS (Strukturierte Informationssammlung) | Pflicht | Vollständig (4 Typen, 6 Themenfelder, Risikomatrix) | VOLL |
| | Anamnese | Pflicht | Vollständig (strukturiert, sperrbar) | VOLL |
| | Maßnahmenplanung | Pflicht | Vollständig (Pläne, Maßnahmen, Freigabe, Sperrung) | VOLL |
| | Pflegeverlauf | Pflicht | Vollständig (10 Eintragstypen, 13 Kategorien, chronologisch) | VOLL |
| | Pflegebericht / Berichteblatt | Pflicht | Strukturierte Tagesansicht nach SGB-XI-Modulen | NEU |
| | Wunddokumentation | Pflicht | Exzellent (PUSH-Score, Fotos, Behandlungen, Verlaufschart) | VOLL |
| | Vitalwerte | Pflicht | Vollständig (10 Parameter, Grenzwerte, Alarme, MDR-Kill-Switch) | VOLL |
| | Medikamentenmanagement | Pflicht | Vollständig (PZN, Dosierung, Eingabe-Tracking) | VOLL |
| | Diagnosen | Pflicht | Vorhanden | VOLL |
| | Risikobewertung | Standard | Vorhanden (Risiko-Dashboard) | VOLL |
| | Sturzprotokoll | Pflicht | Strukturiertes Protokoll (Hergang, Verletzungen, Sofortmaßnahmen, Prävention) | NEU |
| | Dokumentationsperioden | Standard | Vorhanden (Perioden mit Abschluss) | VOLL |
| **Abrechnung** | Rechnungserstellung | Pflicht | Vollständig (Engine, Positionen, Snapshots, Freeze/Cancel/Correct) | VOLL |
| | Gutschriften/Korrekturen | Pflicht | Vollständig (atomare Gutschriften, Korrekturläufe) | VOLL |
| | Monatsabschluss | Pflicht | Vollständig (Vorbereitung, Einzelklient, Abschluss) | VOLL |
| | Tarifverwaltung | Pflicht | Vollständig (3 Preistabellen, Verifizierung, Belegpflicht) | VOLL |
| | Mahnwesen | Pflicht | Vollständig (Stufen, PDF-Generierung, Cron-Mahnlauf) | VOLL |
| | OPOS-Verwaltung | Pflicht | Vollständig (Offene Posten, Zahlungsziel, Forderungen) | VOLL |
| | SEPA-Lastschrift | Pflicht | Vollständig (Mandate, Batches, pain.008) | VOLL |
| | DATEV-Export | Standard | Vollständig (Buchungssätze, Kontenzuordnung) | VOLL |
| **Kassenkommunikation** | EDIFACT-Generierung | Pflicht (Kasse) | Vollständig (Generator, Validator, Segmente) | VOLL |
| | DTA-Pipeline | Pflicht (Kasse) | Exzellent (Erstellen, Validieren, Freigeben, Versenden, Rückläufer, Wiedervorlage, Dead-Letter) | VOLL |
| | DAKOTA-Versand | Pflicht (Kasse) | Vorhanden (Auftragsdatei, Transport) | VOLL |
| | SECON-Verschlüsselung | Pflicht (Kasse) | Vorhanden | VOLL |
| | §302 SGB V | Pflicht (SGB V) | Vorhanden (Positionen, Routing, Readiness, Versand) | VOLL |
| | KIM (Telematik) | Zukunft | Vorhanden (Karten, Nachrichten, Readiness) — fail-closed | TEIL |
| | FHIR / ISiP | Zukunft | Vorhanden (Patient, CarePlan, Encounter, Observation, Import/Export) | TEIL |
| **Qualitätsmanagement** | Zufriedenheitsanrufe | Standard | Vollständig (7/30/90-Tage-Turnus, Bewertung, nächster Anruf) | VOLL |
| | Qualitätskennzahlen | Pflicht | Vollständig (Wunden, Stürze, Vitalalarme, Maßnahmen) | VOLL |
| | Prüfprotokoll/Prüfmappe | Pflicht | Vorhanden | VOLL |
| | Beschwerde-Management | Standard | Vorhanden (MIS-Modul) | TEIL |
| | Vorkommnismanagement (CIRS) | Standard | Über Pflegeverlauf (Typ: ereignis/notfall) — kein eigenständiges CIRS | TEIL |
| **Mitarbeiterverwaltung** | Qualifikationsverwaltung | Pflicht | Vollständig (Ablaufwarnung, Verifizierung, Dokumente) | VOLL |
| | Schulungsverwaltung | Pflicht | Vollständig (6 Schulungsarten, Auffrischung, Zertifikate) | VOLL |
| | Fristenverwaltung (zentral) | Standard | Zentrales Fristen-Dashboard (alle Quellen aggregiert) | NEU |
| | Einsatzfreigabe | Pflicht | Vollständig (Prüflogik, Freigabe/Sperre) | VOLL |
| **Reporting** | KPI-Dashboard | Pflicht | Vorhanden (Umsatz, Auslastung, Ablehnungsquote, Qualität) | VOLL |
| | PDL-Cockpit (erweitertes Reporting) | Pflicht | Leistungen, Umsatz nach Kostenträger, Personal, Klienten, Budgets, Qualität | NEU |
| | Besucherstatistik | Nice-to-have | Vollständig (IP, Region, Seiten, Nutzer) | VOLL |
| | Audit-Trail | Pflicht | Vollständig (Billing, Personal, Ops, Workflow) | VOLL |
| **Kommunikation** | Internes Messaging | Standard | Vollständig (Nachrichten, Antworten, Gelesen-Status) | VOLL |
| | Benachrichtigungen | Pflicht | Vollständig (In-App, Push, FCM, Präferenzen) | VOLL |
| | WhatsApp-Integration | Innovativ | Vorhanden (AI-Bot mit Eskalation) | VOLL |
| | Dienstübergabe | Pflicht | Vollständig (Protokolle, Punkte, Kenntnisnahme, Handlungsbedarfe) | VOLL |
| | Aufgabenverwaltung | Standard | Vollständig (Checklisten, Kommentare, Anhänge, Entity-Linking) | VOLL |
| | Wiedervorlagen | Standard | Vollständig (Fälligkeit, Dringlichkeit, Status-Workflow) | VOLL |
| | Eskalationsregeln | Standard | Vollständig (Regeln, Historie, automatische Eskalation) | VOLL |
| | Workflow-Engine | Innovativ | Exzellent (Event-basiert, WHEN-IF-THEN-Regeln, Dead-Letter, Audit) | VOLL |
| **DSGVO** | Löschkonzept | Pflicht | Vollständig (Soft-Delete, Hard-Delete-Cron, Löschantrag) | VOLL |
| | Einwilligungsverwaltung | Pflicht | Vorhanden (Cookie-Consent, Coach-Consents, Privacy-Records) | VOLL |
| | Datenexport (Art. 20) | Pflicht | Vorhanden (Coach-Export, FHIR-Export) | VOLL |
| | Audit-Logging | Pflicht | Vollständig (immutable Audit-Trail) | VOLL |
| **Mobile** | Mobile App | Standard | Capacitor (iOS + Android), WKWebView der Live-Site | VOLL |
| | Offline-Fähigkeit | Standard | Vorhanden (IndexedDB-Queue, Service Worker, Sync-Engine) | VOLL |
| | Unterschrift auf Gerät | Standard | Vorhanden (SignaturePad, PIN, QES) | VOLL |
| | GPS-Tracking | Standard | Vorhanden (Geo-Events API) | VOLL |
| **Multi-Mandant** | Mandantentrennung | Enterprise | Vollständig (org_fence RLS, 65 Policies, OrgSwitcher) | VOLL |
| | Bundesland-Filter | Enterprise | Vollständig (Expansion-Modul, State-Settings) | VOLL |
| **Digitale Anwendungen** | DiPA-Modul | Zukunft | Vorhanden (Freischaltcodes, Nachweise, Abrechnungswege) | TEIL |
| | PflegeCoach (B2C) | Innovativ | Vollständig (Assessment, Ziele, Aktivitäten, Berichte, Stripe) | VOLL |

---

## 3. Alleinstellungsmerkmale (USPs)

Funktionen, die bei typischer Pflege-Software NICHT zum Standard gehören:

1. **Workflow-Engine** — Event-basierte Automatisierung mit WHEN-IF-THEN-Regeln, Dead-Letter-Queue und Audit-Trail
2. **WhatsApp-AI-Bot** — Automatische Erstberatung mit KI-Eskalation
3. **PflegeCoach (B2C)** — Digitale Pflegeanwendung für pflegende Angehörige
4. **DiPA-Modul** — Vorbereitung auf BfArM-Zulassung
5. **FHIR-Interoperabilität** — REST-Endpunkte für Patient, CarePlan, Encounter, Observation
6. **KIM-Anbindung** — Telematikinfrastruktur-Kommunikation (vorbereitet)
7. **Multi-Mandanten-SaaS** — Echte Mandantentrennung mit org_fence RLS
8. **CAMT-Import** — Automatischer Bankdatenabgleich
9. **Offline-Sync-Engine** — IndexedDB-Queue mit Konfliktlösung
10. **Angehörigenportal** — Eigener Zugang für Angehörige/Betreuer

---

## 4. Heute implementierte Module

### 4.1 Ärzteverwaltung (`/admin/aerzte`)
- **Problemstellung:** Ärzte waren nur Freitext in Verordnungen (arzt_name, arzt_praxis). Keine LANR/BSNR für §302 SGB V.
- **Lösung:** Eigenständige Stammdatentabelle `aerzte_praxen` mit:
  - Anrede, Titel, Vor-/Nachname, Fachrichtung
  - LANR (9-stellig), BSNR (9-stellig) — essentiell für Kassenabrechnung
  - Praxisdaten (Name, Adresse, Telefon, Fax, E-Mail)
  - Aktiv-/Inaktiv-Status
  - Admin-UI mit Suche, Filter nach Fachrichtung, CRUD
- **Migration:** `20260815000000_aerzte_praxen.sql`
- **Dateien:** API-Routes, Admin-Page, Migration

### 4.2 Fristen-Dashboard (`/admin/fristen`)
- **Problemstellung:** Fristen verstreut über Qualifikationen, Verordnungen, Schulungen, Dokumente. PDL muss 4 verschiedene Seiten prüfen.
- **Lösung:** Zentrales Dashboard das alle Fristenquellen aggregiert:
  - Qualifikations-Ablaufdaten (caregiver_qualifications)
  - Verordnungs-Ablaufdaten (verordnungen)
  - Schulungs-Auffrischungen (personal_schulungen)
  - Dokument-Ablaufdaten (client_documents / akten_dokumente)
  - Ampel-System: Überfällig (rot), Kritisch <14 Tage (orange), Warnung <30 Tage (gelb), OK (grün)
  - Filter nach Quelle und Dringlichkeit
  - Summary-Cards mit Zählern

### 4.3 PDL-Cockpit (`/admin/pdl-cockpit`)
- **Problemstellung:** KPI-Dashboard zeigt nur 4 Basis-Metriken. PDLs brauchen detaillierte operative Steuerung.
- **Lösung:** Erweitertes Reporting in 6 Sektionen:
  1. **Leistungsübersicht** — Geleistete/geplante Stunden, Erfüllungsquote, Aufschlüsselung nach Leistungsart
  2. **Umsatz** — Gesamtumsatz mit Vormonatsvergleich, Aufschlüsselung nach Kostenträgertyp
  3. **Personalübersicht** — Aktive Kräfte, Einsatzstatus, Krankgemeldet, Urlaub, Stundenkonto
  4. **Klienten** — Aktive Klienten, Zu-/Abgänge, Pflegegrad-Verteilung
  5. **Budget-Auslastung** — Gesamtbudget, Verbrauch, kritische Budgets
  6. **Qualitätsindikatoren** — Zufriedenheit, Wunden, Stürze, überfällige Verordnungen

### 4.4 Pflegebericht / Berichteblatt (`/admin/pflegedoku/berichteblatt/[clientId]`)
- **Problemstellung:** Pflegeverlauf ist chronologisch, aber kein strukturiertes Tagesprotokoll nach SGB-XI-Modulen für MDK-Prüfungen.
- **Lösung:** Strukturierte Tagesansicht, gruppiert nach den 6 Begutachtungsmodulen:
  1. Mobilität
  2. Kognition & Kommunikation
  3. Verhaltensweisen & psychische Problemlagen
  4. Selbstversorgung
  5. Krankheits-/therapiebedingte Anforderungen
  6. Gestaltung des Alltagslebens / Soziale Kontakte
  - Tages-Navigation (vor/zurück)
  - Quick-Add pro Modul (erstellt Pflegeverlauf-Eintrag mit passender Kategorie)
  - Basiert auf bestehender pflege_verlauf-Tabelle — keine Migration nötig

### 4.5 Sturzprotokoll (`/admin/sturzprotokoll`)
- **Problemstellung:** Sturzereignisse waren nur als Freitext-Einträge im Pflegeverlauf. Kein strukturiertes Protokoll für MDK/QM.
- **Lösung:** Strukturiertes Sturzprotokoll mit:
  - Sturzdaten (Datum, Uhrzeit, Ort)
  - Hergang und Zeugen
  - Verletzungsdokumentation (Checkliste + Freitext)
  - Sofortmaßnahmen
  - Benachrichtigungen (Arzt, Angehörige, Rettungsdienst, Krankenhaus)
  - Sturzrisikofaktoren (8 Kategorien)
  - Präventionsmaßnahmen
  - Basiert auf pflege_verlauf mit strukturierten Daten

---

## 5. Verbleibende Lücken (nicht heute implementiert)

| Bereich | Funktion | Priorität | Aufwand | Anmerkung |
|---------|----------|-----------|---------|-----------|
| Tourenplanung | Routing-API-Anbindung | Mittel | 2-3 Tage | Google/OSRM für echte Fahrtzeitberechnung |
| QM | Eigenständiges CIRS (Critical Incident Reporting) | Niedrig | 1-2 Tage | Aktuell über Pflegeverlauf-Ereignisse abgedeckt |
| QM | Hygieneplan-Management | Niedrig | 2-3 Tage | Gesetzlich via §36 IfSG |
| Abrechnung | Elektronische Heilmittelverordnung (eHVO) | Zukunft | 5+ Tage | Abhängig von TI-Anbindung |
| Mobile | Native Offline-Signatur | Niedrig | 1-2 Tage | Aktuell Web-basiert via SignaturePad |
| Reporting | Benchmarking (Vergleich mit Branchendaten) | Nice-to-have | 3-5 Tage | Externe Datenquelle nötig |
| Personal | Dienstplan-Automatik | Mittel | 5+ Tage | Automatische Schichtzuweisung nach Regeln |
| Dokumentation | ePA-Anbindung | Zukunft | 10+ Tage | Elektronische Patientenakte ab 2026 |

---

## 6. Fazit

### Stärken
- **Abrechnungstiefe** ist auf dem Niveau von Marktführern (EDIFACT, DTA, DAKOTA, §302, SEPA, DATEV)
- **Pflegedokumentation** deckt alle MDK-relevanten Bereiche ab
- **Architektur** (Multi-Mandant, Workflow-Engine, FHIR) ist moderner als die meisten Wettbewerber
- **Innovationen** (WhatsApp-Bot, PflegeCoach, DiPA) gehen über den Marktstandard hinaus

### Verbesserungsbedarf
- **Tourenplanung** braucht echtes Routing für größere Pflegedienste
- **QM** könnte ein eigenständiges Vorkommnismanagement (CIRS) vertragen
- **Dienstplan-Automatik** wäre für Betriebe mit >20 Mitarbeitern wichtig

### Gesamtbewertung
Die Software ist **produktionsbereit für kleine bis mittlere ambulante Pflegedienste und Betreuungsdienste** (1-30 Mitarbeiter). Für größere Betriebe (>50 Mitarbeiter) fehlt primär die Tourenoptimierung und Dienstplan-Automatik.

---

*Generiert am 15.08.2026 durch autonomen Marktvergleich*
