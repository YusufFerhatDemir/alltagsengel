# Auftragsverarbeitungsvertrag (AVV) — Vorlage

**Grundlage:** Art. 28 DSGVO  
**Stand:** 2026-08-12  
**Status:** ENTWURF — Rechtliche Prüfung erforderlich

---

## Präambel

Dieser Vertrag regelt die Auftragsverarbeitung personenbezogener Daten zwischen:

**Verantwortlicher (Auftraggeber):**  
Alltagsengel  
[Vollständige Firmenbezeichnung]  
[Adresse]  
Vertreten durch: [Geschäftsführung]

**Auftragsverarbeiter (Auftragnehmer):**  
[Name des Dienstleisters]  
[Adresse]  
Vertreten durch: [Vertretungsberechtigte Person]

---

## § 1 Gegenstand und Dauer der Verarbeitung

### 1.1 Gegenstand
Der Auftragsverarbeiter verarbeitet personenbezogene Daten im Auftrag des Verantwortlichen im Rahmen folgender Leistung:

[Leistungsbeschreibung einfügen, z.B.:]
- Hosting und Bereitstellung der Datenbank-Infrastruktur (Supabase)
- Web-Hosting und CDN-Dienste (Vercel)
- Zahlungsabwicklung (Stripe)

### 1.2 Dauer
Dieser Vertrag gilt für die Dauer der Geschäftsbeziehung, mindestens jedoch bis [Datum]. Nach Beendigung gelten die Regelungen in § 10.

---

## § 2 Art und Zweck der Verarbeitung

Die Verarbeitung umfasst folgende Tätigkeiten:
- [ ] Speicherung
- [ ] Erhebung
- [ ] Übermittlung
- [ ] Löschung / Vernichtung
- [ ] Sonstige: [beschreiben]

**Zweck:** [Konkreten Zweck beschreiben]

---

## § 3 Art der personenbezogenen Daten

| Datenkategorie | Beispiele | Besondere Kategorie (Art. 9) |
|---------------|-----------|------------------------------|
| Stammdaten | Name, Adresse, Geburtsdatum | Nein |
| Kontaktdaten | E-Mail, Telefon | Nein |
| Finanzdaten | IBAN, Rechnungen | Nein |
| Gesundheitsdaten | Pflegegrad, SIS, Vitalwerte, Medikamente | **JA** |
| Beschäftigungsdaten | Qualifikationen, Einsatzzeiten | Nein |
| Technische Daten | IP-Adressen, Login-Zeiten | Nein |

---

## § 4 Kategorien betroffener Personen

- Kund:innen (pflegebedürftige Personen)
- Alltagsbegleiter:innen
- Fahrer:innen
- Angehörige / Kontaktpersonen
- Mitarbeiter:innen des Verantwortlichen

---

## § 5 Pflichten des Auftragsverarbeiters

Der Auftragsverarbeiter verpflichtet sich:

1. Daten nur auf dokumentierte Weisung des Verantwortlichen zu verarbeiten (Art. 28 Abs. 3 lit. a DSGVO)
2. Alle zur Verarbeitung befugten Personen zur Vertraulichkeit zu verpflichten (Art. 28 Abs. 3 lit. b DSGVO)
3. Alle gemäß Art. 32 DSGVO erforderlichen technischen und organisatorischen Maßnahmen zu ergreifen (Art. 28 Abs. 3 lit. c DSGVO)
4. Die Bedingungen für die Inanspruchnahme von Unterauftragsverarbeitern einzuhalten (Art. 28 Abs. 3 lit. d DSGVO)
5. Den Verantwortlichen bei der Erfüllung von Betroffenenrechten zu unterstützen (Art. 28 Abs. 3 lit. e DSGVO)
6. Den Verantwortlichen bei DSFA und vorheriger Konsultation zu unterstützen (Art. 28 Abs. 3 lit. f DSGVO)
7. Nach Beendigung der Verarbeitung alle Daten zu löschen oder zurückzugeben (Art. 28 Abs. 3 lit. g DSGVO)
8. Alle erforderlichen Informationen für den Nachweis der Einhaltung bereitzustellen und Überprüfungen zu ermöglichen (Art. 28 Abs. 3 lit. h DSGVO)

---

## § 6 Technische und organisatorische Maßnahmen (TOM)

Der Auftragsverarbeiter setzt mindestens folgende Maßnahmen um:

### 6.1 Vertraulichkeit (Art. 32 Abs. 1 lit. b DSGVO)
- [ ] Zutrittskontrolle (physisch)
- [ ] Zugangskontrolle (Authentifizierung)
- [ ] Zugriffskontrolle (Berechtigungskonzept)
- [ ] Trennungskontrolle (Mandantentrennung)
- [ ] Pseudonymisierung (Art. 32 Abs. 1 lit. a DSGVO)

### 6.2 Integrität (Art. 32 Abs. 1 lit. b DSGVO)
- [ ] Weitergabekontrolle (Verschlüsselung bei Transport)
- [ ] Eingabekontrolle (Protokollierung)

### 6.3 Verfügbarkeit und Belastbarkeit (Art. 32 Abs. 1 lit. b DSGVO)
- [ ] Verfügbarkeitskontrolle (Backup, USV)
- [ ] Wiederherstellbarkeit (Disaster Recovery)

### 6.4 Verfahren zur regelmäßigen Überprüfung (Art. 32 Abs. 1 lit. d DSGVO)
- [ ] Datenschutz-Management
- [ ] Incident-Response-Management
- [ ] Auftragskontrolle

**Anlage TOM:** [Detaillierte TOM des Auftragsverarbeiters als Anlage beifügen]

---

## § 7 Unterauftragsverarbeiter

### 7.1 Genehmigung
- [ ] **Allgemeine Genehmigung** mit Informationspflicht und Widerspruchsrecht
- [ ] **Einzelgenehmigung** für jeden Unterauftragsverarbeiter

### 7.2 Aktuelle Unterauftragsverarbeiter

| Name | Sitz | Leistung | Drittland |
|------|------|----------|-----------|
| [Name] | [Land] | [Beschreibung] | [Ja/Nein + Garantie] |

### 7.3 Pflichten bei Unterauftragsverhältnissen
Dem Unterauftragsverarbeiter sind dieselben Datenschutzpflichten aufzuerlegen wie in diesem Vertrag.

---

## § 8 Meldepflichten bei Datenschutzverletzungen

Der Auftragsverarbeiter informiert den Verantwortlichen **unverzüglich** (spätestens innerhalb von **24 Stunden**) nach Bekanntwerden einer Verletzung des Schutzes personenbezogener Daten. Die Meldung enthält mindestens:

1. Beschreibung der Art der Verletzung
2. Name und Kontaktdaten des DSB
3. Beschreibung der wahrscheinlichen Folgen
4. Beschreibung der ergriffenen oder vorgeschlagenen Maßnahmen

**Meldung an:** [E-Mail-Adresse / Telefonnummer für Datenschutzvorfälle]

---

## § 9 Kontrollrechte des Verantwortlichen

Der Verantwortliche hat das Recht:
- Inspektionen durchzuführen (mit angemessener Vorankündigung)
- Aktuelle Zertifizierungen/Audit-Berichte einzusehen (SOC 2, ISO 27001)
- Informationen zur Einhaltung der Pflichten anzufordern

---

## § 10 Beendigung

Nach Beendigung der Auftragsverarbeitung:
- [ ] **Löschung** aller personenbezogenen Daten und Kopien
- [ ] **Rückgabe** aller personenbezogenen Daten an den Verantwortlichen

Frist: **30 Tage** nach Vertragsende  
Nachweis: Schriftliche Bestätigung der Löschung

---

## § 11 Haftung

Die Haftung richtet sich nach Art. 82 DSGVO.

---

## § 12 Schlussbestimmungen

- Änderungen bedürfen der Schriftform
- Gerichtsstand: [Ort]
- Es gilt deutsches Recht

---

## Unterschriften

| | Verantwortlicher | Auftragsverarbeiter |
|---|---|---|
| **Name:** | | |
| **Funktion:** | | |
| **Datum:** | | |
| **Unterschrift:** | | |

---

## Erforderliche AVV für Alltagsengel

| # | Dienstleister | Zweck | Priorität | Status |
|---|--------------|-------|-----------|--------|
| 1 | **Supabase** (Datenbank) | Hosting aller Kunden-/Gesundheitsdaten | KRITISCH | [ ] Prüfen ob Supabase Standard-AVV ausreicht |
| 2 | **Vercel** (Web-Hosting) | Hosting der Webanwendung | HOCH | [ ] Vercel DPA prüfen |
| 3 | **Stripe** (Zahlung) | SEPA-Lastschrift, Zahlungsabwicklung | HOCH | [ ] Stripe DPA prüfen |
| 4 | **E-Mail-Provider** | Transaktionsmails | MITTEL | [ ] Provider identifizieren |
| 5 | **SFTP/DTA** (künftig) | Datenübermittlung an Kostenträger | NIEDRIG | Erst bei B1-Aktivierung |

**Hinweis:** Supabase, Vercel und Stripe bieten standardmäßig DPAs (Data Processing Agreements) an. Diese sollten geprüft und ggf. um spezifische Anforderungen für Gesundheitsdaten ergänzt werden.
