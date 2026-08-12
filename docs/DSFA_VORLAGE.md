# Datenschutz-Folgenabschätzung (DSFA) — Vorlage

**Grundlage:** Art. 35 DSGVO  
**Verantwortliche Stelle:** Alltagsengel (Organisation)  
**Stand:** 2026-08-12  
**Status:** ENTWURF — Vervollständigung durch DSB erforderlich

---

## 1. Systematische Beschreibung der Verarbeitungsvorgänge

### 1.1 Bezeichnung der Verarbeitung
Betrieb der digitalen Plattform „Alltagsengel" zur Vermittlung und Abwicklung von Alltagsbegleitung und Entlastungsleistungen nach § 45a/b SGB XI.

### 1.2 Verantwortlicher
- **Name:** Alltagsengel
- **Kontakt:** [Geschäftsadresse eintragen]
- **Datenschutzbeauftragte/r:** [Name und Kontakt des DSB eintragen]

### 1.3 Zweck der Verarbeitung
- Vermittlung von Alltagsbegleiter:innen an pflegebedürftige Personen
- Einsatzplanung und Leistungsdokumentation
- Abrechnung gegenüber Pflegekassen (§ 45b SGB XI)
- Pflegedokumentation (SIS, Wunddokumentation, Vitalwerte, Medikamente)
- SEPA-Lastschrifteinzug und Mahnwesen
- Personalverwaltung der Alltagsbegleiter:innen

### 1.4 Rechtsgrundlage(n)
- Art. 6 Abs. 1 lit. b DSGVO — Vertragserfüllung (Dienstleistungsvertrag)
- Art. 6 Abs. 1 lit. c DSGVO — rechtliche Verpflichtung (Abrechnungspflichten SGB XI)
- Art. 9 Abs. 2 lit. h DSGVO — Gesundheitsdaten für Gesundheitsversorgung
- Art. 6 Abs. 1 lit. f DSGVO — berechtigtes Interesse (Betrugsprävention, Plattformsicherheit)

### 1.5 Kategorien betroffener Personen
| Kategorie | Anzahl (geschätzt) | Besondere Kategorien |
|-----------|-------------------|---------------------|
| Kund:innen (Pflegebedürftige) | variabel | Gesundheitsdaten (Pflegegrad, SIS, Vitalwerte, Wunddoku, Medikamente) |
| Alltagsbegleiter:innen (Engel) | variabel | Führungszeugnis, Qualifikationsnachweise |
| Fahrer:innen | variabel | — |
| Angehörige / Kontaktpersonen | variabel | — |

### 1.6 Kategorien personenbezogener Daten
- **Stammdaten:** Name, Adresse, Geburtsdatum, Telefon, E-Mail
- **Gesundheitsdaten (Art. 9):** Pflegegrad, SIS-Assessment, Vitalwerte, Wunddokumentation, Medikamentenpläne, Pflegeverlauf
- **Finanzdaten:** IBAN, BIC, Rechnungen, SEPA-Mandate, Zahlungshistorie
- **Beschäftigungsdaten:** Qualifikationen, Einsatzzeiten, Führungszeugnis
- **Technische Daten:** Login-Daten, IP-Adressen, Audit-Trail
- **Versicherungsdaten:** Versichertennummer, Pflegekasse, IK-Nummern

### 1.7 Empfänger / Kategorien von Empfängern
| Empfänger | Zweck | Rechtsgrundlage |
|-----------|-------|-----------------|
| Pflegekassen | Abrechnung § 45b SGB XI | Art. 6 (1)(c) |
| Supabase (Auftragsverarbeiter) | Hosting/Datenbank | Art. 28 DSGVO, AVV |
| Vercel (Auftragsverarbeiter) | Web-Hosting | Art. 28 DSGVO, AVV |
| Stripe (Auftragsverarbeiter) | Zahlungsabwicklung | Art. 28 DSGVO, AVV |
| Steuerberater / DATEV | Buchführung | Art. 6 (1)(c) |
| Datenannahmestellen | DTA-Übermittlung (künftig) | Art. 6 (1)(c) |

### 1.8 Drittlandtransfers
- **Supabase:** [Region prüfen — EU-Region wählen wenn möglich]
- **Vercel:** Edge-Funktionen ggf. in EU konfigurierbar
- **Stripe:** Datenverarbeitung in EU, ggf. USA (Standardvertragsklauseln)

### 1.9 Löschfristen
| Datenart | Frist | Grundlage |
|----------|-------|-----------|
| Abrechnungsdaten | 10 Jahre | § 147 AO, § 257 HGB |
| Pflegedokumentation | 10 Jahre nach Leistungsende | § 630f BGB analog |
| Bewerberdaten (abgelehnt) | 6 Monate | AGG-Klagefrist |
| Audit-Trail | 10 Jahre | § 147 AO |
| Technische Logs | 90 Tage | Berechtigtes Interesse |

---

## 2. Bewertung der Notwendigkeit und Verhältnismäßigkeit

### 2.1 Notwendigkeit der Verarbeitung
- [ ] Datenminimierung geprüft — nur erforderliche Daten werden erhoben
- [ ] Zweckbindung sichergestellt — keine Nutzung für andere Zwecke
- [ ] Speicherbegrenzung eingehalten — automatische Löschfristen implementiert
- [ ] Einwilligungen eingeholt wo erforderlich (Gesundheitsdaten)

### 2.2 Verhältnismäßigkeit
Die Verarbeitung von Gesundheitsdaten ist für die Erbringung von Pflegeleistungen zwingend erforderlich. Mildere Mittel, die denselben Zweck erfüllen, sind nicht ersichtlich.

---

## 3. Bewertung der Risiken für die Rechte und Freiheiten

### 3.1 Risiko-Matrix

| # | Risiko | Eintritts-wahrscheinlichkeit | Schwere | Risiko-level | Maßnahme |
|---|--------|------------------------------|---------|-------------|----------|
| R1 | Unbefugter Zugriff auf Gesundheitsdaten | Mittel | Hoch | HOCH | RLS, Org-Fences, MFA (geplant) |
| R2 | Datenverlust durch technischen Ausfall | Niedrig | Hoch | MITTEL | Supabase-Backups, Point-in-Time-Recovery |
| R3 | Cross-Tenant-Datenleck | Niedrig | Sehr hoch | HOCH | 752 RLS-Policies, 65 Org-Fences, Audit-Trail |
| R4 | Identitätsdiebstahl (Zugang zu Finanzdaten) | Mittel | Hoch | HOCH | Rollen-Whitelist, Rate-Limiting, MFA (geplant) |
| R5 | Unberechtigte Profilbildung | Niedrig | Mittel | NIEDRIG | Zweckbindung, keine Analytics über Pflichtmaß |
| R6 | Übermittlung an falschen Empfänger | Niedrig | Hoch | MITTEL | IK-Prüfziffern, Validierung |
| R7 | Ransomware / Verschlüsselung | Niedrig | Sehr hoch | HOCH | Cloud-Hosting, Backups, kein On-Premise |

### 3.2 Besondere Risiken durch Gesundheitsdatenverarbeitung
- Stigmatisierung bei Bekanntwerden von Pflegebedürftigkeit
- Wirtschaftliche Nachteile bei Bekanntwerden von Gesundheitsdaten
- Psychische Belastung bei Datenverlust sensibler Pflegedokumentation

---

## 4. Abhilfemaßnahmen (Technische und Organisatorische Maßnahmen — TOM)

### 4.1 Technische Maßnahmen (implementiert)
- [x] Row-Level Security auf 244/244 Tabellen (752 Policies)
- [x] Multi-Tenant-Isolation mit 65 Org-Fences
- [x] Rollen-Whitelist bei Registrierung (nur kunde/engel/fahrer)
- [x] Rate-Limiting auf Auth und sensiblen API-Endpunkten
- [x] HTTPS/TLS für alle Verbindungen
- [x] Audit-Trail für alle Abrechnungsoperationen
- [x] Atomare DB-Guards gegen Race Conditions (CAS)
- [x] Verschlüsselung at-rest (Supabase/PostgreSQL)
- [x] EDIFACT-Verschlüsselung (SECON PKCS#7-Stub)
- [x] Admin-Autorisierung für force_override
- [x] Europe/Berlin Zeitzonen durchgängig

### 4.2 Technische Maßnahmen (geplant)
- [ ] MFA/TOTP für Admin-Accounts (B7)
- [ ] Externer Penetrationstest (B7)
- [ ] BSI TR-03161 Zertifizierung (B5/B7)
- [ ] WCAG 2.1 AA Barrierefreiheit (B9)

### 4.3 Organisatorische Maßnahmen (zu implementieren)
- [ ] Datenschutzschulung für alle Mitarbeiter
- [ ] Incident-Response-Plan
- [ ] Regelmäßige Überprüfung der Zugriffsberechtigungen
- [ ] Verarbeitungsverzeichnis nach Art. 30 DSGVO
- [ ] Auftragsverarbeitungsverträge mit allen Dienstleistern (→ AVV_VORLAGE.md)
- [ ] Meldeprozess für Datenschutzverletzungen (72h-Frist)

---

## 5. Standpunkt des DSB

[Vom Datenschutzbeauftragten auszufüllen]

---

## 6. Konsultation der Aufsichtsbehörde

Eine vorherige Konsultation der Aufsichtsbehörde nach Art. 36 DSGVO ist erforderlich, wenn die Risiken trotz Abhilfemaßnahmen ein hohes Niveau behalten. 

**Zuständige Aufsichtsbehörde:** Der Hessische Beauftragte für Datenschutz und Informationsfreiheit (HBDI)

**Bewertung:** [Vom DSB nach Fertigstellung der DSFA zu bewerten]

---

## 7. Dokumentation und Überprüfung

- **Erstellt am:** [Datum]
- **Erstellt von:** [Name DSB / Berater]
- **Nächste Überprüfung:** [spätestens 12 Monate nach Erstellung]
- **Änderungshistorie:**

| Datum | Version | Änderung | Autor |
|-------|---------|----------|-------|
| 2026-08-12 | 0.1 | Grundgerüst erstellt | System |
| | | | |

---

## Anhänge

- [ ] Verarbeitungsverzeichnis (Art. 30 DSGVO)
- [ ] TOM-Dokumentation (vollständig)
- [ ] AVV mit Supabase
- [ ] AVV mit Vercel
- [ ] AVV mit Stripe
- [ ] Einwilligungstexte
- [ ] Datenschutzerklärung (aktuell)
