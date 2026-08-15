# Gesamtübersicht — Externe Nachweise für den DiPA-Antrag

**Produkt:** Digitaler PflegeCoach
**Hersteller:** Alltagsengel UG (haftungsbeschränkt), Frankfurt am Main
**Stand:** 2026-08-15
**Referenz:** 48-Punkte-Matrix `docs/dipa/21_FINAL_MATRIX_2026-08-15.md`

---

## Zusammenfassung

Von 48 DiPA-Anforderungen sind **13 als EXTERNAL_EVIDENCE_REQUIRED** und
**2 als PARTIAL** klassifiziert. Nicht alle davon erfordern externe
Dienstleister — manche benötigen Geschäftsführungsentscheidungen oder
Vertragsschlüsse mit bestehenden Anbietern.

Diese Übersicht ordnet **jeden externen Nachweis** in eine von vier Kategorien:

| Kategorie | Bedeutung | Anzahl |
|---|---|---|
| **MUSS EXTERN** | Gesetzlich/regulatorisch zwingend externer Dienstleister | 7 |
| **KANN INTERN** | Extern empfohlen, aber intern erstellbar | 3 |
| **GESCHÄFTSENTSCHEIDUNG** | Kein externer Dienstleister nötig, sondern GF-Entscheidung | 3 |
| **NICHT ERFORDERLICH** | Fälschlicherweise als externe Pflicht angenommen | 2 |

---

## 1. MUSS EXTERN — Externer Dienstleister zwingend

### 1.1 SEC-01 + SEC-04: TR-03161-Zertifizierung inkl. Penetrationstest

| Merkmal | Detail |
|---|---|
| **Anforderung** | BSI TR-03161 Zertifikat (Web-/Backend-Anwendung) |
| **Zeitklasse** | A — bei Antragstellung (EINGANGSBLOCKER) |
| **Dienstleister** | BSI-akkreditierte IT-Sicherheitsprüfstelle |
| **Briefing** | `BRIEFING_TR03161_PRUEFSTELLE.md` + `BRIEFING_PENETRATIONSTEST.md` |
| **Kostenrahmen** | 20.000–60.000 € (inkl. Pentest als Teilleistung) |
| **Dauer** | 3–6 Monate |
| **Geeignete Anbieter** | TÜViT (Essen), SRC (Bonn), atsec (München), datenschutz cert (Bremen) |
| **Intern vorbereitbar** | Scope-Dokument (fertig), Testkonten (fertig), Architekturdoku (fertig) |

### 1.2 SEC-05: ISO 27001 Zertifizierung (ISMS)

| Merkmal | Detail |
|---|---|
| **Anforderung** | ISO/IEC 27001:2022 Zertifikat, DAkkS-akkreditiert |
| **Zeitklasse** | A — bei Antragstellung (EINGANGSBLOCKER, längste Vorlaufzeit) |
| **Dienstleister** | DAkkS-akkreditierte Zertifizierungsstelle + ISMS-Berater |
| **Briefing** | `BRIEFING_ISO27001_ZERTIFIZIERUNG.md` |
| **Kostenrahmen** | 25.000–50.000 € (Beratung + Zertifizierung, erstes Jahr) |
| **Dauer** | 8–12 Monate |
| **Geeignete Anbieter** | DQS (Frankfurt), TÜV SÜD, TÜV Rheinland, DEKRA; Berater: HiSolutions, carmasec |
| **Intern vorbereitbar** | ISMS-Scope (Entwurf fertig), Asset-Inventar, Prozessdokumentation |

### 1.3 DS-02: Datenschutz-Folgenabschätzung (DSFA)

| Merkmal | Detail |
|---|---|
| **Anforderung** | Unterschriebene DSFA nach Art. 35 DSGVO |
| **Zeitklasse** | Vor Antrag |
| **Dienstleister** | Kanzlei mit Gesundheitswesen-/DSGVO-Erfahrung |
| **Briefing** | `BRIEFING_DSFA.md` (Teildokument von `BRIEFING_DATENSCHUTZ_KANZLEI.md`) |
| **Kostenrahmen** | 5.000–15.000 € (einzeln) / im Gesamtpaket 15.000–30.000 € |
| **Dauer** | 4–10 Wochen |
| **Geeignete Anbieter** | Spirit Legal (Leipzig), Schürmann Rosenthal Dreyer (Berlin), Althammer & Kill |
| **Intern vorbereitbar** | DSFA-Entwurf (fertig), Verarbeitungsverzeichnis (fertig), Risikoliste (fertig) |

### 1.4 DS-04: Auftragsverarbeitungsverträge (AVV)

| Merkmal | Detail |
|---|---|
| **Anforderung** | Geschlossene AVVs mit Supabase, Vercel, Resend; Stripe-Rollenklärung |
| **Zeitklasse** | Vor Antrag |
| **Dienstleister** | Kanzlei (gleiche wie DS-02) + Vertragspartner selbst |
| **Briefing** | `BRIEFING_AVV_VORLAGEN.md` (Teildokument von `BRIEFING_DATENSCHUTZ_KANZLEI.md`) |
| **Kostenrahmen** | 3.000–12.000 € (einzeln) / im Gesamtpaket |
| **Dauer** | 2–8 Wochen |
| **Intern vorbereitbar** | Standard-DPAs der Anbieter beschaffen, Unterauftragnehmer-Listen anfragen |

### 1.5 QI-01: Pflegefachliche Inhaltsfreigabe

| Merkmal | Detail |
|---|---|
| **Anforderung** | Fachliche Freigabe aller 12 Inhaltsmodule durch qualifizierte Pflegefachkraft |
| **Zeitklasse** | Vor Antrag (§ 6 Abs. 8 DiPAV) |
| **Dienstleister** | Pflegefachkraft (Pflegewissenschaft, ≥ 3 Jahre Berufserfahrung) |
| **Briefing** | `BRIEFING_PFLEGEFACHLICHE_PRUEFUNG.md` |
| **Kostenrahmen** | 3.000–8.000 € |
| **Dauer** | 3–6 Wochen |
| **Intern vorbereitbar** | Module dokumentiert, Checkliste erstellt |

### 1.6 NN-01: Wissenschaftliches Evaluationskonzept

| Merkmal | Detail |
|---|---|
| **Anforderung** | Einreichungsfähiges Evaluationskonzept inkl. Studiendesign, Stichprobenplanung, Ethikvotum |
| **Zeitklasse** | Vor Erprobungsantrag (nicht nachreichbar) |
| **Dienstleister** | Herstellerunabhängiges wissenschaftliches Institut / CRO |
| **Briefing** | `BRIEFING_EVALUATION.md` |
| **Kostenrahmen** | 15.000–40.000 € (Konzept); Studienkosten kommen hinzu |
| **Dauer** | 2–4 Monate (Konzept); Studie: 6–18 Monate |
| **Geeignete Anbieter** | Universitäts-Pflegewissenschaft-Institute, CROs mit Erfahrung in Versorgungsforschung |
| **Intern vorbereitbar** | Evaluationsrahmen (Entwurf fertig), Hypothesen, Endpunkte |

### 1.7 PROD-02: MDR-Negativabgrenzung (juristische Abnahme)

| Merkmal | Detail |
|---|---|
| **Anforderung** | Juristische Bestätigung, dass der PflegeCoach kein Medizinprodukt ist |
| **Zeitklasse** | Vor Antrag |
| **Dienstleister** | Kanzlei mit Medizinprodukterecht-Erfahrung |
| **Briefing** | `BRIEFING_DATENSCHUTZ_KANZLEI.md` (Arbeitspaket 3) |
| **Kostenrahmen** | 2.000–5.000 € (einzeln) / im Gesamtpaket |
| **Dauer** | 2–4 Wochen |
| **Intern vorbereitbar** | MDR-Abgrenzungsdokument (fertig, intern verifiziert) |

---

## 2. KANN INTERN — Intern erstellbar, extern empfohlen

### 2.1 BF-01: Barrierefreiheits-Selbsterklärung

| Merkmal | Detail |
|---|---|
| **Anforderung** | Selbsterklärung nach DIN EN ISO 9241-171 (Anlage 2 DiPAV, Klasse C/D) |
| **Klassifizierung** | **KANN INTERN** — Anlage 2 ist eine Selbsterklärung, keine externe Prüfstelle gefordert |
| **Extern empfohlen weil** | Glaubwürdigkeit; BfArM kann im Einzelfall Nachweise verlangen |
| **Briefing** | `BRIEFING_BARRIEREFREIHEIT_USABILITY.md` |
| **Kostenrahmen (extern)** | 5.000–15.000 € |
| **Intern machbar** | Ja — Selbsteinschätzung gegen DIN EN ISO 9241-171 |

### 2.2 BF-02: Usability-Tests mit Zielgruppe

| Merkmal | Detail |
|---|---|
| **Anforderung** | Usability-Tests mit 5 Zielgruppen-Nutzern |
| **Klassifizierung** | **KANN INTERN** — ein Prüflabor ist nirgends vorgeschrieben |
| **Extern empfohlen weil** | Methodische Qualität, Neutralität des Berichts |
| **Briefing** | `BRIEFING_BARRIEREFREIHEIT_USABILITY.md` |
| **Kostenrahmen (extern)** | 8.000–20.000 € (formativ + summativ) |
| **Intern machbar** | Ja — strukturierte Tests mit Protokoll, wenn Methodik stimmt |

### 2.3 QMS-01: QM- und Risikomanagementsystem

| Merkmal | Detail |
|---|---|
| **Anforderung** | Dokumentiertes QM- und Risikomanagementsystem |
| **Klassifizierung** | **KANN INTERN** — Dokumentation ist intern erstellbar |
| **Extern empfohlen weil** | ISO-27001-Audit deckt Teilaspekte ab; Synergie mit SEC-05 |
| **Status** | QMS-Handbuch vorhanden (`audit/dipa/qms_handbuch_pflegecoach.md`), PASS_INTERNAL |

---

## 3. GESCHÄFTSENTSCHEIDUNG — Kein externer Dienstleister, aber GF-Entscheidung nötig

### 3.1 VS-02: 24-Stunden-Verfügbarkeitszusage

| Merkmal | Detail |
|---|---|
| **Anforderung** | Benennung der Zeit, innerhalb der Ausfallzeiten behoben werden (24 Stunden) |
| **Klassifizierung** | **GESCHÄFTSENTSCHEIDUNG** — keine externe Beauftragung, sondern organisatorische Zusage |
| **Was fehlt** | GF-Entscheidung über Support-SLA, Bereitschaftsregelung, Eskalationsprozess |

### 3.2 VS-04: Selbstzahler-Nutzungsbedingungen

| Merkmal | Detail |
|---|---|
| **Anforderung** | Geprüfte AGB für den Selbstzahler-Weg |
| **Klassifizierung** | **GESCHÄFTSENTSCHEIDUNG** + juristische Prüfung |
| **Was fehlt** | Preisfestlegung durch GF; juristische Prüfung im Datenschutzpaket |
| **Briefing** | `BRIEFING_DATENSCHUTZ_KANZLEI.md` (Arbeitspaket 4) |

### 3.3 REG-05: BfArM-Beratungstermin

| Merkmal | Detail |
|---|---|
| **Anforderung** | Freiwilliger Beratungstermin nach § 22 DiPAV |
| **Klassifizierung** | **GESCHÄFTSENTSCHEIDUNG** — freiwillig, aber strategisch empfohlen |
| **Briefing** | `BFARM_BERATUNG_PAKET.md` |
| **Kostenrahmen** | Kostenlos (§ 22 DiPAV) |

---

## 4. NICHT ERFORDERLICH — Korrekturen

### 4.1 SEC-02/SEC-03/SEC-06/SEC-07/SEC-08: Kein separater externer Nachweis

Diese Punkte wurden zuvor als UNVERIFIED geführt, sind aber nach Prüfung
gegen die Primärquellen alle **PASS_INTERNAL**. Sie hängen an der
TR-03161-Zertifizierung (SEC-01), benötigen aber **keinen eigenständigen
externen Nachweis**.

### 4.2 BF-01: Externe Prüfstelle nicht gefordert

Anlage 2 DiPAV ist eine Selbsterklärung (Klasse C/D). Eine externe
Barrierefreiheits-Prüfstelle ist **nicht vorgeschrieben** — der Punkt wurde
von EXTERNAL auf PARTIAL heruntergestuft (Korrektur 15.08.2026).

---

## 5. Zeitplan und kritischer Pfad

```
                                   Monat
                  1   2   3   4   5   6   7   8   9  10  11  12
SEC-05 (ISO)     ████████████████████████████████████████████████  ← KRITISCHER PFAD
SEC-01 (TR)      ░░░░████████████████████████░░░░░░░░░░░░░░░░░░░░
Datenschutzpaket ████████████████████████░░░░░░░░░░░░░░░░░░░░░░░░
QI-01 (Pflege)   ████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
NN-01 (Eval)     ░░░░░░░░████████████████████░░░░░░░░░░░░░░░░░░░░
BF (optional)    ░░░░░░░░░░░░████████████░░░░░░░░░░░░░░░░░░░░░░░░
BfArM-Beratung   ████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░

████ = aktive Arbeit    ░░░░ = Wartezeit / Vorbereitung
```

**Engpass: SEC-05 (ISO 27001) mit 8–12 Monaten Vorlaufzeit.**
Alle anderen Pakete laufen parallel und sind vor SEC-05 abgeschlossen.

---

## 6. Gesamtkosten-Schätzung

| Paket | Minimum | Maximum | Empfohlen |
|---|---|---|---|
| SEC-01+04 (TR-03161 + Pentest) | 20.000 € | 60.000 € | 30.000–40.000 € |
| SEC-05 (ISO 27001) | 25.000 € | 55.000 € | 30.000–40.000 € |
| DS-02+04+PROD-02+VS-04 (Datenschutzpaket) | 15.000 € | 30.000 € | 20.000–25.000 € |
| QI-01 (Pflegefachkraft) | 3.000 € | 8.000 € | 5.000 € |
| NN-01 (Evaluationskonzept) | 15.000 € | 40.000 € | 20.000–30.000 € |
| BF-01+02 (Barrierefreiheit, optional extern) | 0 € | 20.000 € | 10.000 € (empfohlen) |
| BfArM-Beratung | 0 € | 0 € | 0 € |
| **Gesamt** | **78.000 €** | **213.000 €** | **115.000–150.000 €** |

**Hinweis:** Die Evaluations-Studienkosten (Durchführung, nicht nur Konzept)
kommen hinzu und liegen typischerweise bei 50.000–200.000 € je nach Design.
Sie fallen aber erst **nach** der Erprobungsphase-Genehmigung an.

---

## 7. Empfohlene Beauftragungsreihenfolge

### Sofort starten (P0, parallel):

1. **SEC-05: ISO 27001** — ISMS-Berater beauftragen (längste Vorlaufzeit)
2. **SEC-01+04: TR-03161** — Prüfstelle anfragen (Angebotsphase)
3. **DS-02+04: Datenschutzpaket** — Kanzlei mandatieren
4. **QI-01: Pflegefachkraft** — Person suchen und beauftragen
5. **BfArM-Beratung anfragen** — parallel, kostenlos

### Nach BfArM-Beratung:

6. **NN-01: Evaluationspartner** — Institut/CRO beauftragen (profitiert von BfArM-Feedback)

### Nach Ergänzung des Testplans:

7. **BF-01+02: Barrierefreiheit** — optional extern, intern möglich

---

## 8. Intern vorbereitbare Evidenzpakete

Unabhängig von externen Beauftragungen kann Alltagsengel sofort beginnen:

| Paket | Beschreibung | Status | Aufwand |
|---|---|---|---|
| Asset-Inventar für ISMS | Hardware, Software, Cloud-Dienste | Entwurf | 2–3 Tage |
| Prozessdokumentation | Entwicklung, Deployment, Incident | Teilweise (CI, deploy.sh) | 3–5 Tage |
| Standard-DPAs beschaffen | Supabase, Vercel, Resend | Nicht begonnen | 1 Tag |
| C5-Testate anfragen | Supabase (O.Org_2) | Nicht begonnen | 1 Tag (Anfrage) |
| Backup-Aufbewahrungsfristen | Bei Supabase erfragen | Nicht begonnen | 1 Tag (Anfrage) |
| Barrierefreiheits-Selbsttest | Gegen DIN EN ISO 9241-171 | Nicht begonnen | 3–5 Tage |
| Usability-Testplan (formativ) | Ergänzung zum bestehenden Plan | Summativ vorhanden | 2–3 Tage |
| Org-Chart / Verantwortlichkeiten | Für ISMS-Aufbau | Nicht formalisiert | 1 Tag |

---

## 9. Paketabhängigkeiten

```
SEC-05 (ISO 27001) ──────── unabhängig ────────── längster Pfad
SEC-01+04 (TR-03161) ────── unabhängig ────────── zweitlängster Pfad
DS-02+04 (Datenschutz) ──── unabhängig ────────── parallel zu SEC-*
QI-01 (Pflege) ──────────── unabhängig ────────── parallel zu allem
BfArM-Beratung ──────────── empfohlen vor NN-01 ─ kein Blocker
NN-01 (Evaluation) ─────── profitiert von BfArM ─ nicht abhängig
BF-01+02 (Barrierefreiheit) ── benötigt Testplan ─ intern lösbar

Keine zirkulären Abhängigkeiten. Alle P0-Pakete können sofort parallel starten.
```

---

## 10. Risiken und Gegenmaßnahmen

| Risiko | Auswirkung | Gegenmaßnahme |
|---|---|---|
| SEC-05 dauert > 12 Monate | DiPA-Antrag verschiebt sich | ISMS-Berater sofort beauftragen |
| TR-03161-Prüfstelle findet kritische Schwachstelle | Nachbesserung + Retest | Vorbereitenden Pentest durchführen |
| Supabase lehnt AVV-Anpassung ab | DS-04 blockiert | Standard-DPA frühzeitig prüfen lassen |
| BfArM stuft Produkt als MDR ein | DiPA-Weg versperrt | Juristische MDR-Abgrenzung vorziehen |
| Evaluationsstudie negativ | Keine DiPA-Aufnahme | Pilotstudie mit konservativem Design |
| Pflegefachliche Freigabe erfordert umfangreiche Überarbeitung | QI-01 verzögert sich | Iterative Freigabe (Modul für Modul) |
