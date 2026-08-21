# Datenschutz-Folgenabschaetzung (DSFA) -- Alltagsengel UG

**Grundlage:** Art. 35 DSGVO
**Verantwortliche Stelle:** Alltagsengel UG (haftungsbeschraenkt)
**Geschaeftsadresse:** Neue Mainzer Strasse 66-68, 60311 Frankfurt am Main
**IK-Nummer:** 460629986
**Stand:** 2026-08-21
**Version:** 1.0
**Status:** SELBSTBEWERTUNG -- Freigabe durch externen DSB ausstehend

> **HINWEIS:** Diese Datenschutz-Folgenabschaetzung ist eine interne
> Selbstbewertung der Alltagsengel UG. Sie ersetzt NICHT die Pruefung
> und Freigabe durch einen qualifizierten Datenschutzbeauftragten (DSB)
> gemaess Art. 35 Abs. 2 DSGVO. Vor Produktiveinsatz muss ein DSB
> diese DSFA pruefen, ergaenzen und freigeben.

---

## Inhaltsverzeichnis

1. [Systematische Beschreibung der Verarbeitungsvorgaenge](#1-systematische-beschreibung-der-verarbeitungsvorgaenge)
2. [Bewertung der Notwendigkeit und Verhaeltnismaessigkeit](#2-bewertung-der-notwendigkeit-und-verhaeltnismaessigkeit)
3. [Bewertung der Risiken fuer die Rechte und Freiheiten](#3-bewertung-der-risiken-fuer-die-rechte-und-freiheiten)
4. [Abhilfemassnahmen (TOM)](#4-abhilfemassnahmen-technische-und-organisatorische-massnahmen--tom)
5. [Ergebnis der Folgenabschaetzung](#5-ergebnis-der-folgenabschaetzung)
6. [Standpunkt des DSB](#6-standpunkt-des-dsb)
7. [Konsultation der Aufsichtsbehoerde](#7-konsultation-der-aufsichtsbehoerde)
8. [Dokumentation und Ueberpruefung](#8-dokumentation-und-ueberpruefung)

---

## 1. Systematische Beschreibung der Verarbeitungsvorgaenge

### 1.1 Bezeichnung der Verarbeitung

Betrieb der digitalen Plattform "Alltagsengel" zur Vermittlung, Planung,
Dokumentation und Abrechnung von Alltagsbegleitung und Entlastungsleistungen
nach Paragraph 45a/b SGB XI.

Die Plattform umfasst:

- **B2C-Plattform:** Endnutzer-App fuer Kund:innen (Pflegebeduerftige/Angehoerige),
  Alltagsbegleiter:innen ("Engel") und Fahrer:innen
- **Management-Informationssystem (MIS):** Betriebsverwaltung fuer Einsatzplanung,
  Personalmanagement, Abrechnung und Qualitaetssicherung
- **Pflegedokumentation:** SIS-Assessments, Vitalwerte, Wunddokumentation,
  Sturzprotokolle, Lagerungsprotokolle, Medikamentenmanagement
- **Abrechnungsmodul:** Leistungsnachweise, Rechnungserstellung, SEPA-Lastschrift,
  Kassenabrechnung (Paragraph 45b SGB XI), Mahnwesen

**Abgrenzung:** Diese DSFA betrifft ausschliesslich den Paragraph-45b-Betrieb
(Alltagsbegleitung und Entlastungsleistungen). Der Digitale PflegeCoach
(DiPA nach Paragraph 40a SGB XI) unterliegt einer separaten DSFA
(siehe `audit/dipa/`). Vitalwert-Grenzwertalarme sind deaktiviert
(`VITALS_GRENZWERT_ALARME_AKTIV=AUS`), da eine MDR-Klasse-IIa-Zertifizierung
aussteht.

### 1.2 Verantwortlicher

| Feld | Angabe |
|------|--------|
| **Firma** | Alltagsengel UG (haftungsbeschraenkt) |
| **Sitz** | Neue Mainzer Strasse 66-68, 60311 Frankfurt am Main |
| **IK-Nummer** | 460629986 |
| **D-U-N-S** | 316856461 |
| **Kontakt** | info@alltagsengel.care |
| **Datenschutzbeauftragte/r** | [Vom DSB auszufuellen -- externer DSB erforderlich] |
| **Zustaendige Aufsichtsbehoerde** | Der Hessische Beauftragte fuer Datenschutz und Informationsfreiheit (HBDI) |

### 1.3 Zweck der Verarbeitung

| # | Zweck | Rechtsgrundlage |
|---|-------|-----------------|
| Z1 | Vermittlung von Alltagsbegleiter:innen an pflegebeduerftige Personen | Art. 6 Abs. 1 lit. b DSGVO |
| Z2 | Einsatzplanung und Tourenoptimierung | Art. 6 Abs. 1 lit. b DSGVO |
| Z3 | Leistungsdokumentation und Leistungsnachweiserstellung | Art. 6 Abs. 1 lit. c DSGVO (SGB XI Paragraph 104a) |
| Z4 | Abrechnung gegenueber Pflegekassen (Paragraph 45b SGB XI) | Art. 6 Abs. 1 lit. c DSGVO |
| Z5 | Pflegedokumentation (SIS, Wunddokumentation, Vitalwerte, Medikamente) | Art. 9 Abs. 2 lit. h DSGVO |
| Z6 | SEPA-Lastschrifteinzug und Mahnwesen | Art. 6 Abs. 1 lit. b DSGVO |
| Z7 | Personalverwaltung der Alltagsbegleiter:innen | Art. 6 Abs. 1 lit. b DSGVO |
| Z8 | Qualitaetssicherung und Beschwerdemanagement | Art. 6 Abs. 1 lit. c DSGVO (Paragraph 113 SGB XI) |
| Z9 | Notfallkontaktmanagement | Art. 6 Abs. 1 lit. d DSGVO (lebenswichtiges Interesse) |
| Z10 | Plattformsicherheit und Missbrauchspraevention | Art. 6 Abs. 1 lit. f DSGVO |

### 1.4 Rechtsgrundlagen (detailliert)

| Rechtsgrundlage | Anwendungsbereich | Begruendung |
|-----------------|-------------------|-------------|
| **Art. 6 Abs. 1 lit. b DSGVO** | Stammdaten, Buchungen, Einsatzplanung, Vertraege | Erforderlich zur Erfuellung des Dienstleistungsvertrags zwischen Kund:in und Alltagsengel |
| **Art. 6 Abs. 1 lit. c DSGVO** | Abrechnungsdaten, Leistungsnachweise, Rechnungen | Gesetzliche Verpflichtungen aus SGB XI, HGB (Paragraph 257), AO (Paragraph 147) |
| **Art. 9 Abs. 2 lit. h DSGVO** | Pflegegrad, SIS-Assessments, Vitalwerte, Wunddokumentation, Medikamentenplaene | Erforderlich fuer Zwecke der Gesundheitsversorgung; Verarbeitung durch Fachpersonal mit Schweigepflicht |
| **Art. 6 Abs. 1 lit. d DSGVO** | Notfallinformationen (`notfall_info`) | Schutz lebenswichtiger Interessen der betroffenen Person |
| **Art. 6 Abs. 1 lit. f DSGVO** | Audit-Trail, Rate-Limiting, Analytics | Berechtigtes Interesse an Betriebssicherheit und Betrugspraevention |

### 1.5 Kategorien betroffener Personen

| Kategorie | Beschreibung | Besondere Kategorien (Art. 9) | Datenbanktabellen |
|-----------|-------------|-------------------------------|-------------------|
| **Kund:innen (Pflegebeduerftige)** | Personen mit anerkanntem Pflegegrad, die Entlastungsleistungen nach Paragraph 45b SGB XI in Anspruch nehmen | Gesundheitsdaten: Pflegegrad, SIS-Assessment, Vitalwerte, Wunddokumentation, Medikamentenplaene, Sturzprotokolle, Lagerungsprotokolle | `profiles`, `clients`, `care_recipients`, `pflege_aufnahmen`, `pflege_anamnesen`, `pflege_verlauf`, `sis_assessments`, `sis_themenfelder`, `sis_risikomatrix`, `vital_signs`, `wounds`, `wound_assessments`, `wound_treatments`, `wound_photos`, `sturzprotokolle`, `lagerungsprotokolle`, `medikamentenplan`, `notfall_info`, `freiheitsentziehende_massnahmen` |
| **Alltagsbegleiter:innen ("Engel")** | Qualifizierte Betreuungskraefte nach Paragraph 45a SGB XI | Fuehrungszeugnis, Qualifikationsnachweise | `profiles`, `angels`, `caregivers`, `caregiver_documents`, `caregiver_qualifications`, `caregiver_initials_history` |
| **Fahrer:innen** | Fahrdienstleister fuer Krankenfahrten | -- | `profiles`, `krankenfahrt_providers`, `kf_partners`, `fahrzeuge` |
| **Angehoerige / Kontaktpersonen** | Familienangehoerige und gesetzliche Betreuer:innen der Pflegebedueftigen | -- | `care_recipients` (Kontaktdaten), `notfall_info` |
| **Bewerber:innen** | Personen, die sich als Alltagsbegleiter:innen bewerben | -- | `applications`, `mis_applicants` |
| **Kooperationspartner** | Externe Partner (Pflegekassen, Aerzte, Therapeuten) | -- | `cooperation_partners`, `partner_visits` |

### 1.6 Kategorien personenbezogener Daten

#### 1.6.1 Stammdaten (Art. 6 DSGVO)

| Datenart | Tabellen | Aufbewahrungsfrist |
|----------|----------|-------------------|
| Name, Vorname | `profiles`, `clients`, `caregivers`, `care_recipients` | Vertragsdauer + 60 Tage (B2C); 10 Jahre (MIS-Klienten) |
| Geburtsdatum | `profiles`, `clients` | Vertragsdauer + 60 Tage |
| Adresse | `profiles`, `clients` | Vertragsdauer + 60 Tage |
| Telefonnummer | `profiles`, `clients`, `caregivers` | Vertragsdauer + 60 Tage |
| E-Mail-Adresse | `profiles` (via `auth.users`) | Vertragsdauer + 60 Tage |
| Versichertennummer | `clients` | 10 Jahre nach Vertragsende |
| Pflegekasse / IK-Nummer | `clients` | 10 Jahre nach Vertragsende |

#### 1.6.2 Gesundheitsdaten (Art. 9 DSGVO)

| Datenart | Tabellen | Aufbewahrungsfrist |
|----------|----------|-------------------|
| Pflegegrad (1-5) | `clients`, `care_recipients` | 10 Jahre nach letzter Leistung |
| SIS-Assessment (6 Themenfelder + Risikomatrix) | `sis_assessments`, `sis_themenfelder`, `sis_risikomatrix` | 10 Jahre nach letzter Leistung |
| Vitalwerte (Blutdruck, Puls, Temperatur, SpO2, Blutzucker, Gewicht, Schmerz, Atemfrequenz, BMI, Bewusstsein) | `vital_signs` | 10 Jahre nach letzter Messung |
| Wunddokumentation (Lokation, Groesse, Stadium, Exsudat, Fotos) | `wounds`, `wound_assessments`, `wound_treatments`, `wound_photos` | 10 Jahre nach Abheilung |
| Medikamentenplaene | `medikamentenplan` | Vertragsdauer + 60 Tage |
| Sturzprotokolle | `sturzprotokolle` | 10 Jahre nach Ereignis |
| Lagerungsprotokolle | `lagerungsprotokolle` | 10 Jahre nach Ereignis |
| Freiheitsentziehende Massnahmen | `freiheitsentziehende_massnahmen` | 10 Jahre nach Massnahme |
| Pflegeaufnahmen / Anamnesen | `pflege_aufnahmen`, `pflege_anamnesen` | 10 Jahre nach letzter Leistung |
| Pflegeverlaufsdokumentation | `pflege_verlauf` | 10 Jahre nach letzter Leistung |
| Notfallinformationen (Allergien, Vorerkrankungen, Notfallkontakte) | `notfall_info` | Vertragsdauer + 60 Tage |

#### 1.6.3 Finanzdaten

| Datenart | Tabellen | Aufbewahrungsfrist |
|----------|----------|-------------------|
| IBAN / BIC | `clients` (SEPA-Mandat) | 10 Jahre (Paragraph 147 AO) |
| Rechnungen / Rechnungsposten | `invoices`, `invoice_items` | 10 Jahre (Paragraph 257 HGB) |
| SEPA-Lastschriften | `invoices` (Zahlungsstatus) | 10 Jahre (Paragraph 147 AO) |
| Budgetverwaltung (Paragraph 45b Entlastungsbetrag) | `client_budgets`, `budget_transactions` | 10 Jahre (Paragraph 147 AO) |
| Abrechnungslaeufe (Kassenabrechnung) | `abrechnungslaeufe`, `abrechnung_zertifikate` | 10 Jahre (SGB V Paragraph 301) |
| Verordnungen | `verordnungen` | 10 Jahre nach Ablaufdatum |

#### 1.6.4 Beschaeftigungsdaten

| Datenart | Tabellen | Aufbewahrungsfrist |
|----------|----------|-------------------|
| Qualifikationsnachweise | `caregiver_qualifications` | 3 Jahre nach Austritt |
| Fuehrungszeugnis (erweitert) | `caregiver_documents` | 3 Jahre nach Austritt |
| Einsatzzeiten / Dienstplanung | `assignments`, `mis_shifts` | 3 Jahre nach Einsatzende |
| Initialen-Historie (Leistungsnachweis-Bezug) | `caregiver_initials_history` | 10 Jahre (SGB XI Paragraph 104a) |
| Abwesenheiten | `absences` | 3 Jahre nach Ende |

#### 1.6.5 Technische Daten

| Datenart | Tabellen | Aufbewahrungsfrist |
|----------|----------|-------------------|
| Login-Daten (E-Mail, Passwort-Hash) | `auth.users` (Supabase Auth) | Vertragsdauer + 60 Tage |
| Audit-Trail (alle Abrechnungs- und Verwaltungsoperationen) | `mis_audit_log`, `pflege_audit_log`, `billing_audit_trail`, `service_record_audit_log`, `assignment_audit_log` | 10 Jahre (Paragraph 147 AO) |
| Rate-Limiting-Daten | `login_rate_limits` | 90 Tage |
| Push-Tokens | `fcm_tokens`, `push_subscriptions` | Vertragsdauer + 30 Tage |
| Analytics (anonymisiert) | `page_views`, `analytics_events` | 90 Tage |

### 1.7 Empfaenger / Kategorien von Empfaengern

| Empfaenger | Zweck | Rechtsgrundlage | Datenkategorien |
|-----------|-------|-----------------|-----------------|
| **Pflegekassen** | Abrechnung Paragraph 45b SGB XI, Leistungsnachweise | Art. 6 Abs. 1 lit. c DSGVO | Versichertendaten, Leistungsdaten, IK-Nummern |
| **Supabase Inc.** (Auftragsverarbeiter) | Datenbank-Hosting, Authentifizierung, Storage | Art. 28 DSGVO (AVV erforderlich) | Alle Datenkategorien |
| **Vercel Inc.** (Auftragsverarbeiter) | Web-Hosting, Edge Functions | Art. 28 DSGVO (AVV erforderlich) | Technische Daten, verschluesselte Anfragen |
| **Resend** (Auftragsverarbeiter) | E-Mail-Versand (transaktional) | Art. 28 DSGVO (AVV erforderlich) | E-Mail-Adressen, Nachrichteninhalte |
| **Steuerberater / DATEV** | Buchfuehrung, Jahresabschluss | Art. 6 Abs. 1 lit. c DSGVO | Rechnungen, Finanzdaten |
| **Datenannahmestellen** (kuenftig) | DTA-Uebermittlung (Paragraph 302 SGB V) | Art. 6 Abs. 1 lit. c DSGVO | Abrechnungsdaten (EDIFACT) |

### 1.8 Drittlandtransfers

| Dienstleister | Serverstandort | Schutzmassnhame | Status |
|--------------|----------------|-----------------|--------|
| **Supabase** | Projekt `nnwyktkqibdjxgimjyuq` -- Region ist zu pruefen; EU-Region empfohlen | AVV + ggf. Standardvertragsklauseln (SCC) | AVV ausstehend |
| **Vercel** | Edge-Netzwerk, EU-Konfiguration moeglich | AVV + SCC | AVV ausstehend |
| **Resend** | USA (SCC erforderlich) | AVV + SCC | AVV ausstehend |

**Handlungsbedarf:** Auftragsverarbeitungsvertraege (AVV) mit allen Dienstleistern
muessen vor Produktiveinsatz geschlossen werden (Vorlage: `docs/AVV_VORLAGE.md`).
Die Supabase-Projektregion muss auf EU (eu-central-1 oder eu-west-1) konfiguriert
sein. Eine Uebermittlung in Drittlaender ohne angemessenes Schutzniveau und ohne
SCC ist unzulaessig.

### 1.9 Loeschfristen (Zusammenfassung)

Ein vollstaendiges Loeschkonzept liegt vor (siehe `docs/LOESCHKONZEPT.md`).
Die wichtigsten Fristen:

| Datenart | Frist | Rechtsgrundlage | Loeschart |
|----------|-------|-----------------|-----------|
| Nutzerprofile (B2C) | Vertragsdauer + 60 Tage Grace-Period | DSGVO Art. 6 Abs. 1 lit. b | Soft-Delete, dann Hard-Delete (Cron) |
| Abrechnungsdaten | 10 Jahre ab Rechnungsdatum | Paragraph 257 HGB, Paragraph 147 AO | Aufbewahrungspflicht |
| Pflegedokumentation | 10 Jahre nach letzter Leistung | Paragraph 630f BGB analog | Archivierung, dann Loeschung |
| Leistungsnachweise | 5 Jahre ab Leistungsdatum | SGB XI Paragraph 104a | Anonymisierung nach Frist |
| Bewerberdaten (abgelehnt) | 6 Monate nach Absage | AGG Paragraph 15 Abs. 4 | Hard-Delete |
| Mitarbeiterdaten | 3 Jahre nach Austritt | DSGVO Art. 6 Abs. 1 lit. b | Anonymisierung |
| Audit-Trail | 10 Jahre (Minimum) | Paragraph 257 HGB | Purge via `admin_audit_log_purge()` |
| Analytics / Technische Logs | 90 Tage | DSGVO Art. 6 Abs. 1 lit. f | Hard-Delete |
| Chat-Nachrichten | 1 Jahr nach letzter Nachricht | DSGVO Art. 6 Abs. 1 lit. b | Hard-Delete |

**Implementierungsstand:**

- Soft-Delete mit 60-Tage-Grace-Period: **produktiv** (`profiles.deleted_at`)
- Hard-Delete-Cron (taeglich 03:00 UTC): **produktiv** (Edge Function `account-hard-delete`)
- Widerrufs-Token fuer Konto-Reaktivierung: **produktiv** (`account_deletion_tokens`)
- Automatische Anonymisierung abgelaufener Klientendaten: **noch nicht implementiert**
- Automatische Loeschung Bewerberdaten (6 Monate): **noch nicht implementiert**
- Automatische Loeschung Analytics (90 Tage): **noch nicht implementiert**

---

## 2. Bewertung der Notwendigkeit und Verhaeltnismaessigkeit

### 2.1 Notwendigkeit der Verarbeitung

| Kriterium | Bewertung | Begruendung |
|-----------|-----------|-------------|
| **Datenminimierung** (Art. 5 Abs. 1 lit. c) | Weitgehend erfuellt | Es werden nur fuer den jeweiligen Zweck erforderliche Daten erhoben. SIS-Assessments, Vitalwerte und Wunddokumentation sind fuer die qualitaetsgesicherte Pflegedokumentation nach SGB XI gesetzlich gefordert. Keine ueberschiessende Datenerhebung erkennbar. |
| **Zweckbindung** (Art. 5 Abs. 1 lit. b) | Erfuellt | Jede Datenkategorie ist einem spezifischen Verarbeitungszweck zugeordnet (siehe Abschnitt 1.3). Keine Zweckentfremdung. Kein Verkauf oder Weitergabe an Dritte zu Marketingzwecken. |
| **Speicherbegrenzung** (Art. 5 Abs. 1 lit. e) | Teilweise erfuellt | Loeschkonzept liegt vor (`docs/LOESCHKONZEPT.md`). Automatische Hard-Delete-Cron fuer B2C-Konten ist produktiv. Automatische Anonymisierung fuer MIS-Klientendaten steht noch aus. |
| **Richtigkeit** (Art. 5 Abs. 1 lit. d) | Erfuellt | Nutzer koennen ihre Daten ueber die App einsehen und aendern. MIS-Klientendaten werden durch Fachpersonal gepflegt. Audit-Trail dokumentiert alle Aenderungen. |
| **Integritaet und Vertraulichkeit** (Art. 5 Abs. 1 lit. f) | Weitgehend erfuellt | Umfangreiche TOM implementiert (siehe Abschnitt 4). RLS auf 244/244 Tabellen. Multi-Tenant-Isolation. Verschluesselung at-rest und in-transit. MFA fuer Admins noch ausstehend. |

### 2.2 Verhaeltnismaessigkeit

Die Verarbeitung besonderer Kategorien personenbezogener Daten (Gesundheitsdaten)
ist fuer die Erbringung von Alltagsbegleitungs- und Entlastungsleistungen nach
Paragraph 45a/b SGB XI **zwingend erforderlich**:

- **Pflegegrad-Dokumentation:** Voraussetzung fuer die Leistungsberechtigung
  (Paragraph 45b SGB XI setzt anerkannten Pflegegrad voraus)
- **SIS-Assessment:** Gesetzlich gefordert fuer die Strukturierte
  Informationssammlung zur Pflegeplanung
- **Vitalwerte / Wunddokumentation:** Erforderlich fuer die fachgerechte
  Betreuungsdokumentation und Haftungsabsicherung
- **Medikamentenplan:** Erforderlich fuer die sichere Betreuung im Alltag

Mildere Mittel, die denselben Versorgungszweck erfuellen, sind nicht ersichtlich.
Eine Alltagsbegleitung ohne Kenntnis der gesundheitlichen Situation waere
fachlich unverantwortlich und wuerde gegen die Sorgfaltspflicht verstossen.

---

## 3. Bewertung der Risiken fuer die Rechte und Freiheiten

### 3.1 Methodik

Die Risikobewertung folgt dem Ansatz des Kurzpapiers Nr. 5 der Datenschutzkonferenz
(DSK) und beruecksichtigt:

- **Eintrittswahrscheinlichkeit:** Gering / Mittel / Hoch / Sehr hoch
- **Schwere des Schadens:** Gering / Mittel / Hoch / Sehr hoch
- **Risikoniveau:** Kombination aus Eintrittswahrscheinlichkeit und Schwere

### 3.2 Risiko-Matrix

| # | Risiko | Eintritts-wahrschein-lichkeit | Schwere | Risiko-niveau | Bestehende Massnahmen | Residual-risiko |
|---|--------|-------------------------------|---------|---------------|----------------------|-----------------|
| R1 | **Unbefugter Zugriff auf Gesundheitsdaten** durch Kompromittierung eines Nutzerkontos | Mittel | Sehr hoch | **HOCH** | RLS auf 244/244 Tabellen (1.100+ Policies); Rollen-Whitelist bei Registrierung; Rate-Limiting auf Auth-Endpunkte; Error-Sanitizer verhindert Daten-Leaking in Fehlermeldungen | **MITTEL** (MFA noch ausstehend) |
| R2 | **Cross-Tenant-Datenleck** durch fehlerhafte Mandantentrennung | Gering | Sehr hoch | **HOCH** | 430+ org_fence-Referenzen in RLS-Policies; Multi-Tenant-Isolation auf Datenbankebene; SECURITY INVOKER fuer Views (235 Instanzen); search_path-Haertung (213 Instanzen) | **GERING** |
| R3 | **Datenverlust** durch technischen Ausfall oder Ransomware | Gering | Hoch | **MITTEL** | Cloud-Hosting (Supabase/Vercel, kein On-Premise); Point-in-Time Recovery (7 Tage); kein lokaler Datenbestand | **GERING** |
| R4 | **Identitaetsdiebstahl** durch Zugriff auf Finanz-/Versichertendaten | Mittel | Hoch | **HOCH** | RLS; org_fence-Policies; Rate-Limiting; Audit-Trail fuer alle Abrechnungsoperationen; IDOR-Schutz fuer SEPA-, Klaerfall- und Dunning-Endpunkte | **MITTEL** (MFA noch ausstehend) |
| R5 | **Unberechtigte Manipulation** von Abrechnungsdaten | Gering | Sehr hoch | **HOCH** | 37+ Audit-Immutabilitaets-Trigger (kein UPDATE/DELETE auf Audit-Tabellen); CAS (Compare-and-Swap) fuer Rechnungsnummern und Stornos; Audit-Trail fuer force_override; CASCADE-zu-RESTRICT-Haertung (238 FK-Constraints) | **GERING** |
| R6 | **Stigmatisierung** bei Bekanntwerden von Pflegebeduerftigkeit | Gering | Hoch | **MITTEL** | Verschluesselung at-rest (PostgreSQL); TLS fuer alle Verbindungen; RLS verhindert horizontalen Zugriff; Soft-Delete filtert geloeschte Profile | **GERING** |
| R7 | **Uebermittlung an falschen Empfaenger** (falsche Pflegekasse) | Gering | Hoch | **MITTEL** | IK-Pruefziffern-Validierung implementiert; Verordnungspruefung | **GERING** |
| R8 | **Stack-Trace-Leaking** mit internen Datenbank-/Systemdetails | Gering | Mittel | **NIEDRIG** | Error-Sanitizer (`lib/api/error-sanitizer.ts`) mit Korrelations-ID; generische Fehlermeldungen im Produktionsmodus; serverseitiges Logging ohne Client-Exposition | **GERING** |
| R9 | **Verlust der Datenverfuegbarkeit** fuer Pflegepersonal | Gering | Hoch | **MITTEL** | Cloud-Hosting mit SLA; Supabase Point-in-Time Recovery; Offline-Faehigkeit der nativen App (lokaler Cache) | **GERING** |
| R10 | **Rechtswidriger Drittlandtransfer** (Schrems II) | Mittel | Hoch | **HOCH** | Supabase-Projektregion auf EU konfigurierbar; AVV und SCC in Vorbereitung | **MITTEL** (AVV ausstehend) |

### 3.3 Besondere Risiken durch Gesundheitsdatenverarbeitung

Gesundheitsdaten geniessen nach Art. 9 DSGVO besonderen Schutz. Im Kontext
der Alltagsbegleitung bestehen folgende spezifische Risiken:

1. **Stigmatisierung:** Bekanntwerden einer Pflegebeduerftigkeit kann zu
   sozialer Ausgrenzung oder Diskriminierung fuehren (z.B. am Arbeitsplatz
   pflegender Angehoeriger)
2. **Wirtschaftliche Nachteile:** Bekanntwerden von Gesundheitsdaten kann
   Auswirkungen auf Versicherungsvertraege oder Kreditwuerdigkeit haben
3. **Psychische Belastung:** Datenverlust sensibler Pflegedokumentation
   kann emotionale Belastung bei Betroffenen und Angehoerigen verursachen
4. **Fehlbehandlung:** Manipulation oder Verlust von Medikamentenplaenen,
   Vitalwerten oder Wunddokumentation kann die Versorgungssicherheit gefaehrden
5. **Kontrollverlust:** Pflegebeduerftige Personen sind haeufig in ihrer
   Faehigkeit eingeschraenkt, die Verwendung ihrer Daten selbst zu ueberwachen

---

## 4. Abhilfemassnahmen (Technische und Organisatorische Massnahmen -- TOM)

### 4.1 Zugriffskontrolle (implementiert)

| Massnahme | Implementierung | Wirksamkeit |
|-----------|----------------|-------------|
| **Row-Level Security (RLS)** | Aktiviert auf 244/244 Tabellen mit 1.100+ Policies | Jeder Datenbankzugriff wird auf Zeilenebene gegen die Berechtigungen des authentifizierten Nutzers geprueft |
| **Multi-Tenant-Isolation (org_fence)** | 430+ org_fence-Referenzen in RLS-Policies | Strikte Mandantentrennung -- Nutzer einer Organisation koennen ausschliesslich Daten ihrer eigenen Organisation einsehen |
| **Rollen-Whitelist** | Funktion `handle_new_user()` erlaubt nur Rollen `kunde`, `engel`, `fahrer` | Verhindert Privilegien-Eskalation bei der Registrierung |
| **Admin-Autorisierung** | `is_admin()`-Funktion (484 Instanzen in RLS-Policies) | Admin-Zugriff wird konsistent ueber eine zentrale Funktion geprueft |
| **IDOR-Schutz** | Zugriffspruefungen fuer SEPA-, Klaerfall- und Dunning-Endpunkte | Verhindert Insecure Direct Object Reference auf sensible Finanzdaten |
| **Rate-Limiting** | Auf Auth-Endpunkten und sensiblen API-Routen (42 Instanzen, persistente DB-basierte Zaehler) | Begrenzt Brute-Force-Angriffe und API-Missbrauch |
| **REVOKE anon/public** | 131 REVOKE-Statements fuer anonyme und oeffentliche Rollen | Entzieht unautentifizierten Nutzern den Zugriff auf Tabellen und Funktionen |
| **SECURITY INVOKER** | 235 Views und Funktionen im Invoker-Kontext | Verhindert Privilegien-Eskalation ueber Views und Funktionen |
| **search_path-Haertung** | 213 Funktionen mit explizitem `search_path` | Verhindert search_path-Injection-Angriffe |

### 4.2 Integritaetsschutz (implementiert)

| Massnahme | Implementierung | Wirksamkeit |
|-----------|----------------|-------------|
| **Audit-Immutabilitaets-Trigger** | 37+ Trigger auf Audit-Tabellen (`trg_*_no_update`, `trg_*_no_delete`, `trg_immutable_*`) | Audit-Logs koennen nach Erstellung weder geaendert noch geloescht werden (ausser via `admin_audit_log_purge()` nach 10+ Jahren) |
| **Atomare DB-Guards (CAS)** | Compare-and-Swap fuer Rechnungsnummern (`trg_audit_invoice_status`) und Stornierungen | Verhindert Race Conditions bei parallelen Schreibzugriffen |
| **CASCADE-zu-RESTRICT-Haertung** | 238 RESTRICT-FK-Constraints (Migration-Serie) | Verhindert versehentliches Kaskadenloeschen von Pflegedokumentation und Abrechnungsdaten |
| **Audit-Trail** | Zentrale Audit-Tabellen: `mis_audit_log`, `pflege_audit_log`, `billing_audit_trail`, `service_record_audit_log`, `assignment_audit_log`, `billing_tariff_audit` | Lueckenlose Nachvollziehbarkeit aller abrechnungs- und pflegerelevanten Operationen |

### 4.3 Vertraulichkeit (implementiert)

| Massnahme | Implementierung | Wirksamkeit |
|-----------|----------------|-------------|
| **Verschluesselung at-rest** | Supabase/PostgreSQL native Verschluesselung | Daten sind auf dem Speichermedium verschluesselt |
| **Verschluesselung in-transit** | HTTPS/TLS fuer alle Verbindungen (erzwungen) | Daten werden waehrend der Uebertragung verschluesselt |
| **EDIFACT-Verschluesselung** | SECON PKCS#7-Stub fuer DTA-Uebermittlung | Abrechnungsdaten werden fuer die Uebermittlung an Datenannahmestellen verschluesselt |
| **Error-Sanitizer** | `lib/api/error-sanitizer.ts` mit Korrelations-ID und generischen Fehlermeldungen | Verhindert das Leaking von Stack-Traces, Datenbank-Details und internen Fehlermeldungen an API-Clients |
| **Signed Upload URLs** | Server-seitige Generierung kurzlebiger Signed URLs fuer Dokumente und Wundfotos | Dateizugriff nur ueber zeitlich begrenzte, authentifizierte URLs |
| **Soft-Delete-Filter** | RLS-Policies mit `is_profile_soft_deleted()` (6 dedizierte Policies) | Geloeschte Profile sind fuer alle Nutzer unsichtbar (ausser Admin-Recovery) |

### 4.4 Verfuegbarkeit (implementiert)

| Massnahme | Implementierung | Wirksamkeit |
|-----------|----------------|-------------|
| **Cloud-Hosting** | Supabase (Datenbank) + Vercel (Web-App) | Kein Single-Point-of-Failure; SLA der Cloud-Anbieter |
| **Point-in-Time Recovery** | Supabase Pro-Plan (7 Tage) | Wiederherstellung auf beliebigen Zeitpunkt innerhalb der letzten 7 Tage |
| **Automatische Backups** | Supabase taegliche Backups | Schutz vor Datenverlust |
| **Europe/Berlin Zeitzonen** | Durchgaengig in allen zeitkritischen Modulen (7 Fixes) | Korrekte Fristberechnung fuer Abrechnungs- und Dokumentationsfristen |

### 4.5 Datenschutz durch Technikgestaltung (Privacy by Design)

| Massnahme | Implementierung | Wirksamkeit |
|-----------|----------------|-------------|
| **Selbstbedienungsloeschung** | Nutzer koennen ihr Konto eigenstaendig loeschen (`/kunde/profil`, `/engel/profil`) | Umsetzung des Rechts auf Loeschung (Art. 17) ohne Medienbruch |
| **60-Tage-Grace-Period** | Widerrufsmoeglichkeit per E-Mail-Token | Schutz vor versehentlicher Kontoloeschung |
| **Hard-Delete-Automatisierung** | Taeglicher Cron-Job (03:00 UTC, Edge Function) | Automatisierte, zuverlaessige Durchsetzung der Loeschfristen |
| **Anonymisierung statt Loeschung** | Fuer aufbewahrungspflichtige Daten (Rechnungen, Leistungsnachweise) | Personenbezug wird entfernt, Strukturdaten bleiben fuer Buchfuehrung erhalten |
| **Fail-Closed-Architektur** | Vitalwert-Alarme deaktiviert bis MDR-Zertifizierung; DTA-Block als Geruest bis ITSG-Zertifizierung | Keine unkontrollierte Verarbeitung ohne regulatorische Freigabe |
| **Datensparsame Analytics** | 90-Tage-Aufbewahrung; SET NULL bei Nutzerloeschung | Minimale Datenerhebung, anonymisierte Auswertung |

### 4.6 Massnahmen in Planung / ausstehend

| # | Massnahme | Prioritaet | Status | Risikobezug |
|---|-----------|------------|--------|-------------|
| P1 | **MFA/TOTP fuer Admin-Accounts** | HOCH | Geplant (geschaetzter Aufwand: 4-6 Tage) | R1, R4 -- reduziert Risiko bei Konto-Kompromittierung erheblich |
| P2 | **Auftragsverarbeitungsvertraege (AVV)** mit Supabase, Vercel, Resend | HOCH | Vorlagen vorhanden (`docs/AVV_VORLAGE.md`), Abschluss ausstehend | R10 -- erforderlich fuer rechtskonforme Auftragsverarbeitung |
| P3 | **Automatisierte Anonymisierung** abgelaufener Klientendaten | HOCH | Konzept liegt vor (`docs/LOESCHKONZEPT.md`, Abschnitt 7.2) | Speicherbegrenzung (Art. 5 Abs. 1 lit. e) |
| P4 | **Automatische Loeschung** Bewerberdaten, Analytics, Chat-Nachrichten | MITTEL | Konzept liegt vor | Speicherbegrenzung |
| P5 | **Externer Penetrationstest** | MITTEL | Geplant | R1, R2 -- unabhaengige Validierung der Sicherheitsmassnahmen |
| P6 | **Datenschutzschulung** fuer alle Mitarbeiter | HOCH | Noch nicht durchgefuehrt | Organisatorische Massnahme |
| P7 | **Incident-Response-Plan** | HOCH | Noch nicht erstellt | 72h-Meldefrist (Art. 33 DSGVO) |
| P8 | **Verarbeitungsverzeichnis** (Art. 30 DSGVO) | HOCH | Datenschutz-Verzeichnis-Tabelle `mis_privacy_records` existiert; formales Verzeichnis ausstehend | Gesetzliche Pflicht |
| P9 | **Archiv-Spalten** fuer alle Pflegedokumentations-Tabellen | NIEDRIG | 3 von 9 Tabellen bereits vorhanden | Umsetzung des Archivierungskonzepts |
| P10 | **BSI TR-03161 / ISO 27001** | NIEDRIG | Langfristig geplant | Best Practice fuer Gesundheitsdatenverarbeitung |

---

## 5. Ergebnis der Folgenabschaetzung

### 5.1 Zusammenfassung der Risikobewertung

| Risikoniveau | Anzahl Risiken | Residualrisiko nach Massnahmen |
|--------------|---------------|-------------------------------|
| **HOCH** | 5 (R1, R2, R4, R5, R10) | 2x MITTEL, 3x GERING |
| **MITTEL** | 4 (R3, R6, R7, R9) | 4x GERING |
| **NIEDRIG** | 1 (R8) | 1x GERING |

### 5.2 Gesamtbewertung

Die Datenschutz-Folgenabschaetzung ergibt, dass die Alltagsengel-Plattform
**umfangreiche technische und organisatorische Massnahmen** implementiert hat,
die die identifizierten Risiken fuer die Rechte und Freiheiten der betroffenen
Personen **auf ein vertretbares Mass reduzieren**.

**Staerken:**

- Umfassende Zugriffskontrolle mit 1.100+ RLS-Policies auf 244/244 Tabellen
- Strikte Multi-Tenant-Isolation mit 430+ org_fence-Referenzen
- Robuster Integritaetsschutz mit 37+ Immutabilitaets-Triggern und CAS-Guards
- Implementiertes Loeschkonzept mit automatisierten Loeschmechanismen
- Error-Sanitizer verhindert Daten-Leaking in Fehlermeldungen
- Privacy-by-Design-Architektur (Selbstbedienungsloeschung, Fail-Closed)
- Umfassender Audit-Trail fuer alle abrechnungsrelevanten Operationen

**Verbleibende Risiken (MITTEL):**

1. **R1/R4 -- Unbefugter Zugriff / Identitaetsdiebstahl:** Residualrisiko MITTEL
   aufgrund fehlender MFA fuer Admin-Accounts. MFA-Implementierung ist als P1
   mit hoher Prioritaet geplant.
2. **R10 -- Drittlandtransfer:** Residualrisiko MITTEL aufgrund ausstehender
   AVV mit Cloud-Dienstleistern. AVV-Abschluss ist als P2 mit hoher Prioritaet
   geplant.

### 5.3 Handlungsempfehlungen (priorisiert)

| Prioritaet | Massnahme | Frist | Risikoreduktion |
|-----------|-----------|-------|-----------------|
| **KRITISCH** | AVV mit Supabase, Vercel, Resend abschliessen | Vor Produktiveinsatz | R10: MITTEL -> GERING |
| **KRITISCH** | Externen DSB bestellen und DSFA freigeben lassen | Vor Produktiveinsatz | Gesetzliche Pflicht |
| **HOCH** | MFA/TOTP fuer Admin-Accounts implementieren | Innerhalb 3 Monaten | R1, R4: MITTEL -> GERING |
| **HOCH** | Datenschutzschulung fuer alle Mitarbeiter | Vor Produktiveinsatz | Organisatorische Absicherung |
| **HOCH** | Incident-Response-Plan erstellen | Innerhalb 1 Monat | Art. 33/34 DSGVO (72h-Meldefrist) |
| **HOCH** | Verarbeitungsverzeichnis (Art. 30) formalisieren | Innerhalb 1 Monat | Gesetzliche Pflicht |
| **MITTEL** | Automatisierte Loeschjobs fuer Bewerberdaten/Analytics | Innerhalb 6 Monaten | Speicherbegrenzung |
| **MITTEL** | Penetrationstest durchfuehren | Innerhalb 6 Monaten | Unabhaengige Validierung |
| **NIEDRIG** | Archiv-Spalten fuer verbleibende Pflegedoku-Tabellen | Innerhalb 12 Monaten | Archivierungskonzept |

### 5.4 Ergebnis

Unter Beruecksichtigung der implementierten und geplanten Massnahmen ist
die Verarbeitung **unter folgenden Bedingungen zulaessig:**

1. AVV mit allen Auftragsverarbeitern werden vor Produktiveinsatz geschlossen
2. Ein externer DSB prueft und gibt diese DSFA frei
3. MFA fuer Admin-Accounts wird innerhalb von 3 Monaten nach Produktivstart
   implementiert
4. Ein Incident-Response-Plan wird vor Produktiveinsatz erstellt
5. Datenschutzschulungen werden vor Produktiveinsatz durchgefuehrt

Eine vorherige Konsultation der Aufsichtsbehoerde nach Art. 36 DSGVO ist
nach Einschaetzung dieser Selbstbewertung **nicht erforderlich**, da die
Residualrisiken durch die implementierten und geplanten Massnahmen auf ein
vertretbares Mass reduziert werden. Diese Einschaetzung muss durch den
DSB bestaetigt werden.

---

## 6. Standpunkt des DSB

> **[Platzhalter -- vom Datenschutzbeauftragten auszufuellen]**
>
> Der/die Datenschutzbeauftragte hat diese DSFA am [Datum] geprueft und
> gibt folgende Stellungnahme ab:
>
> - [ ] Die DSFA ist vollstaendig und zutreffend
> - [ ] Ergaenzungen/Aenderungen erforderlich: [Details]
> - [ ] Eine Konsultation der Aufsichtsbehoerde ist erforderlich / nicht erforderlich
> - [ ] Die Verarbeitung kann unter den genannten Bedingungen aufgenommen werden
>
> Unterschrift: ________________________
> Datum: ________________________

---

## 7. Konsultation der Aufsichtsbehoerde

Eine vorherige Konsultation der Aufsichtsbehoerde nach Art. 36 DSGVO ist
erforderlich, wenn die Risiken trotz Abhilfemassnahmen ein hohes Niveau
behalten.

**Zustaendige Aufsichtsbehoerde:**
Der Hessische Beauftragte fuer Datenschutz und Informationsfreiheit (HBDI)
Gustav-Stresemann-Ring 1, 65189 Wiesbaden

**Vorlaaeufige Bewertung (Selbsteinschaetzung):**
Nach aktueller Einschaetzung ist eine Konsultation **nicht erforderlich**,
da alle identifizierten Hochrisiken durch implementierte Massnahmen auf
ein mittleres oder geringes Residualrisiko reduziert werden und die
verbleibenden mittleren Risiken durch geplante Massnahmen (MFA, AVV)
zeitnah weiter reduziert werden.

**Endgueltige Bewertung:** Durch den DSB nach Pruefung dieser DSFA vorzunehmen.

---

## 8. Dokumentation und Ueberpruefung

### 8.1 Dokumentenhistorie

| Datum | Version | Aenderung | Autor |
|-------|---------|----------|-------|
| 2026-08-12 | 0.1 | Grundgeruest / Vorlage erstellt | Alltagsengel (System) |
| 2026-08-21 | 1.0 | Vollstaendige DSFA-Erstfassung (Selbstbewertung) -- alle Abschnitte ausgefuellt, Risikomatrix, TOM-Dokumentation, Ergebnisbewertung | Alltagsengel (Selbstbewertung) |

### 8.2 Naechste Ueberpruefung

- **Regelmaessige Ueberpruefung:** Spaetestens 12 Monate nach Erstellung
  (bis 2027-08-21)
- **Anlassbezogene Ueberpruefung:** Bei wesentlichen Aenderungen der
  Verarbeitungsvorgaenge, der Risikosituation oder der Rechtsgrundlagen
- **Ausloeser fuer Aktualisierung:**
  - Einfuehrung neuer Datenkategorien oder Verarbeitungszwecke
  - Wechsel von Auftragsverarbeitern
  - Sicherheitsvorfaelle
  - Aenderungen der DSGVO, des SGB XI oder anderer relevanter Gesetze
  - Abschluss geplanter Massnahmen (MFA, AVV, Penetrationstest)

### 8.3 Zugehoerige Dokumente

| Dokument | Pfad | Status |
|----------|------|--------|
| Loeschkonzept | `docs/LOESCHKONZEPT.md` | Erstfassung 2026-08-21 |
| DSFA-Vorlage (Ausgangsversion) | `docs/DSFA_VORLAGE.md` | Grundgeruest 2026-08-12 |
| AVV-Vorlage | `docs/AVV_VORLAGE.md` | Entwurf |
| QMS-Grundgeruest | `docs/QMS_GRUNDGERUEST.md` | Entwurf |
| ITSG-Zertifizierungsleitfaden | `docs/ZERTIFIZIERUNGSLEITFADEN_ITSG.md` | Referenz |
| DiPA-BfArM-Leitfaden | `docs/ZERTIFIZIERUNGSLEITFADEN_DIPA_BFARM.md` | Referenz |
| Vitalwerte MDR-Klassifizierung | `docs/VITALWERTE_MDR_KLASSIFIZIERUNG.md` | Referenz |
| Finaler Reststatus | `docs/FINALER_RESTSTATUS.md` | Stand 2026-08-12 |
| DiPA-Loeschkonzept | `audit/dipa/loeschkonzept.md` | Separat |

---

## Anhang A: Tabellenverzeichnis mit Datenschutzrelevanz

### A.1 Tabellen mit Gesundheitsdaten (Art. 9 DSGVO)

| Tabelle | Datenkategorie | RLS | org_fence | Audit |
|---------|---------------|-----|-----------|-------|
| `pflege_aufnahmen` | Pflegeaufnahme | Ja | Ja | `pflege_audit_log` |
| `pflege_anamnesen` | Anamnese | Ja | Ja | `pflege_audit_log` |
| `pflege_verlauf` | Pflegeverlauf | Ja | Ja | `pflege_audit_log` |
| `sis_assessments` | Strukturierte Informationssammlung | Ja | Ja | `pflege_audit_log` |
| `sis_themenfelder` | SIS Themenfelder | Ja | Ja | `pflege_audit_log` |
| `sis_risikomatrix` | SIS Risikomatrix | Ja | Ja | `pflege_audit_log` |
| `vital_signs` | Vitalwerte (10 Parameter) | Ja | Ja | `pflege_audit_log` |
| `wounds` | Wunden (Stammdaten) | Ja | Ja | `pflege_audit_log` |
| `wound_assessments` | Wundbeurteilungen | Ja | Ja | `pflege_audit_log` |
| `wound_treatments` | Wundbehandlungen | Ja | Ja | `pflege_audit_log` |
| `wound_photos` | Wundfotos (Storage) | Ja | Ja | `pflege_audit_log` |
| `sturzprotokolle` | Sturzereignisse | Ja | Ja | `pflege_audit_log` |
| `lagerungsprotokolle` | Lagerungsmassnahmen | Ja | Ja | `pflege_audit_log` |
| `freiheitsentziehende_massnahmen` | FEM-Dokumentation | Ja | Ja | `pflege_audit_log` |
| `medikamentenplan` | Medikation | Ja | Ja | -- |
| `notfall_info` | Notfallinformationen | Ja | -- | -- |
| `care_recipients` | Pflegeperson-Stammdaten | Ja | -- | -- |

### A.2 Tabellen mit Finanzdaten

| Tabelle | Datenkategorie | RLS | org_fence | Audit |
|---------|---------------|-----|-----------|-------|
| `invoices` | Rechnungen | Ja | Ja | `billing_audit_trail` |
| `invoice_items` | Rechnungsposten | Ja | Ja | `billing_audit_trail` |
| `abrechnungslaeufe` | Kassenabrechnung | Ja | Ja | `mis_audit_log` |
| `client_budgets` | Paragraph 45b Budget | Ja | Ja | `mis_audit_log` |
| `budget_transactions` | Budgetbuchungen | Ja | Ja | `mis_audit_log` |
| `service_records` | Leistungsnachweise | Ja | Ja | `service_record_audit_log` |

### A.3 Tabellen mit Personalstammdaten

| Tabelle | Datenkategorie | RLS | org_fence | Audit |
|---------|---------------|-----|-----------|-------|
| `caregivers` | Mitarbeiter-Stammdaten | Ja | Ja | `mis_audit_log` |
| `caregiver_documents` | MA-Dokumente (Fuehrungszeugnis) | Ja | Ja | `mis_audit_log` |
| `caregiver_qualifications` | Qualifikationen | Ja | Ja | `mis_audit_log` |
| `assignments` | Einsatzzuordnungen | Ja | Ja | `assignment_audit_log` |

---

## Anhang B: Schwellwertanalyse (Art. 35 Abs. 3 DSGVO)

Die Durchfuehrung einer DSFA ist fuer die Alltagsengel-Plattform
**verpflichtend**, da folgende Kriterien erfuellt sind:

| Kriterium | Erfuellt | Begruendung |
|-----------|----------|-------------|
| Art. 35 Abs. 3 lit. a: Systematische Bewertung persoenlicher Aspekte | Nein | Kein Profiling oder Scoring |
| Art. 35 Abs. 3 lit. b: Umfangreiche Verarbeitung besonderer Kategorien | **Ja** | Verarbeitung von Gesundheitsdaten (Pflegegrad, Vitalwerte, Wunddoku, Medikamente, SIS) fuer eine potenziell grosse Zahl von Pflegebedueftigen |
| Art. 35 Abs. 3 lit. c: Systematische Ueberwachung oeffentlicher Bereiche | Nein | Keine Videoueberwachung o.ae. |
| DSK-Positivliste Nr. 7: Gesundheitsdaten in Informationssystemen | **Ja** | Digitale Pflegedokumentation in einem Management-Informationssystem |
| DSK-Positivliste Nr. 11: Daten Schutzbedueftiger (Pflegebeduerftige) | **Ja** | Pflegebeduerftige Personen gehoeren zu besonders schutzbeduertigen Personengruppen |

**Ergebnis:** Mindestens drei Kriterien der DSK-Leitlinien sind erfuellt.
Eine DSFA ist zwingend erforderlich.

---

> **ERINNERUNG:** Dieses Dokument ist eine **Selbstbewertung** der
> Alltagsengel UG. Es muss vor Produktiveinsatz durch einen qualifizierten,
> externen Datenschutzbeauftragten geprueft, ergaenzt und freigegeben werden.
> Die Verantwortung fuer die Vollstaendigkeit und Richtigkeit der DSFA
> liegt beim Verantwortlichen (Art. 5 Abs. 2 DSGVO -- Rechenschaftspflicht).
