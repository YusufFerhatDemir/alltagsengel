# Claude-Master-Prompt für eine marktführende ambulante Pflege- und Abrechnungsplattform

> Strategisches Referenzdokument — Stand 01.08.2026
> Gilt für: Alltagsengel (Next.js) + efy care (Expo/React Native)

## Executive Summary

Der Master-Prompt strukturiert die Bearbeitung in sieben iterative Lieferpakete.
Er verlangt mindestens 400 atomare Funktionen, ein Evidenzregister, eine getrennte
Behandlung von § 105 SGB XI und § 302 SGB V, eine regel- und versionsgesteuerte
Abrechnungsarchitektur, DAKOTA-, SECON-, KIM- und TI-Integration,
Sicherheits- und Datenschutzkonzepte, KI-Governance, mehrstufige Annahmetests
sowie eine vollständige Traceability von Problem über Feature und Architektur
bis Test und KPI.

## Strategische Differenzierung

| Strategische Fähigkeit | Ziel |
|---|---|
| Regel- und versionsgesteuerte Abrechnung | Jede Abrechnung ist reproduzierbar, prüfbar und nach Rechtsgrundlage, Format, Version, Preisstand und Kostenträgerstand nachvollziehbar |
| Vollständiges Abrechnungs-Clearing | Nicht nur Dateien erzeugen, sondern senden, quittieren, ablehnen, korrigieren, stornieren, neu abrechnen und Zahlungen zuordnen |
| AI-native, aber kontrollierbare Arbeitsweise | KI unterstützt, belegt, erklärt und eskaliert; kritische Entscheidungen bleiben kontrolliert |
| Offline-first und prozessorientierte UX | Pflegekräfte arbeiten schnell, mobil und ohne vermeidbare Mehrfacheingaben |
| Offene Plattform | APIs, FHIR/ISiP, garantierter Datenexport, Partnerökosystem und belastbarer Vendor-Exit |

## Versionsmatrix — Kritische Erkenntnis

**§ 105 SGB XI und § 302 SGB V MÜSSEN vollständig getrennt behandelt werden.**

### § 105 SGB XI (Pflege-Datenaustausch)
- Technische Anlage 1 Version 6.4.0 — gültig seit 01.05.2026
- Technische Anlage 1 Version 6.5.1 — gültig ab 01.02.2027
- Technische Anlage 5 Version 1.2.0 (TI-Übertragung) — ab 01.02.2027
- Pflege-Prüfkatalog und Softwareprüfung — seit Mai 2026

### § 302 SGB V (Sonstige Leistungserbringer)
- Technische Anlage 1 Version 21 — seit Anfang 2026 ausschließlich
- Technische Anlage 1 Version 22 — ab 01.02.2027, Übergangsfrist bis Ende April 2027
- HKP XML-Anlage Version 1.3.0 — ab Februar 2027

### Versionsdimensionen (je Abrechnungsvorgang)

| Dimension | Bedeutung |
|---|---|
| Rechtsgrundlage | § 105 SGB XI, § 302 SGB V, Privatleistung |
| Leistungsbereich | Pflegesachleistung, HKP, Haushaltshilfe, Betreuung |
| Nachrichtenformat | EDIFACT, XML, PDF, KIM-Nachricht |
| Technische Anlage | Exakte Anlage und Teilanlage |
| Fachliche Version | Gültige Regelversion |
| Schema-Version | XSD- oder Nachrichtenschema |
| Transportverfahren | Legacy, dakota.le, KIM/TI |
| Sicherheitsverfahren | SECON-, Signatur- und Verschlüsselungsstand |
| Kostenträgerdatei | Kassenart, Dateityp und Gültigkeitsdatum |
| Preisstand | Regionaler Vertrag und Gültigkeitszeitraum |
| Zertifikat | Verwendungszweck und Gültigkeitszeitraum |
| Testnachweis | Prüfkatalog, Datenannahmestelle und Freigabestatus |

## Architektur-Leitplanken

### DAKOTA als Integrationskomponente (NICHT als Kern)
- `dakota.le` für sonstige Leistungserbringer
- Übernimmt: Prüfung, Verschlüsselung, Zertifikatsprozesse, Übertragung
- Fachlich korrekte Dateierzeugung bleibt Aufgabe des Abrechnungssystems
- DAKOTA muss austauschbar gekapselt sein

### Zielarchitektur
```
Leistungserfassung → Abrechnungskern → Regel-/Versionsengine → Validatoren
→ Transaktions-Outbox → [dakota.le | Native SECON | KIM/TI | Clearing]
→ Rückmeldungs-/Quittungsservice → Zahlungsabgleich
```

### IK-Behandlung
- IK NICHT als fest eingetragene Programmlogik
- Gehört in versionierte Mandanten-, Rechtsträger-, Betriebsstätten- und Absenderkonfiguration
- Zuordnung muss Zertifikate, Kostenträger, KIM-Postfächer, Datenannahmestellen,
  Vertragsstände und regionale Preisvereinbarungen berücksichtigen

### Mehrmandantenfähigkeit — Testbereiche
Datenbanken, Caches, Queues, Suchindizes, Objektspeicher, Logs, BI, Backups,
Exporte, KI-Kontexte, Schlüssel, Zertifikate, IKs und KIM-Postfächer

## Abrechnungs-Domänenmodell (vollständiger Lebenszyklus)

Nicht nur Dateien erzeugen, sondern:
1. Vorprüfung (Genehmigung, Preisstand, Kostenträger)
2. Versionsauflösung (richtige TA, Format, Schema)
3. Dateierzeugung (EDIFACT/XML)
4. Schema-Prüfung + fachliche Validierung
5. Freigabe (4-Augen bei Bedarf)
6. Signatur + Verschlüsselung
7. Versand (dakota.le / KIM / SFTP)
8. Quittierung
9. Ablehnung → Korrektur → Wiederholung
10. Teilstorno / Vollstorno
11. Zahlungsabgleich (inkl. Sammelzahlungen)
12. Audit (lückenlos, integritätsgeschützt)

## Lieferpakete

| # | Paket | Kernergebnis |
|---|---|---|
| 1 | Markt, Nutzer, Wettbewerb | Evidenzbasierte Analyse |
| 2 | Prozesse, Regulierung, Abrechnung | SGB-V/XI-Trennung, Versionsmatrix |
| 3 | Funktionsmatrix (400+ Features) | Atomare, testbare Feature-IDs |
| 4 | UX und Service Design | Mobile, Offline, Pflegekraft-Flows |
| 5 | Architektur, API, Datenmodell | Mandantentrennung, Versionsengine |
| 6 | KI, Sicherheit, Datenschutz | DSFA, HSM/PKI, KI-Governance |
| 7 | Roadmap, Business Case, Abnahme | MVP, Go-live-Gates, Traceability |

## Abnahme-Gates

| Gate | Nachweis |
|---|---|
| Fachlich spezifiziert | Geschäftsregeln, Statusmodelle, Ausnahmefälle dokumentiert |
| Technisch implementiert | Code Review, Unit Tests, Contract Tests bestanden |
| Formatkonform | EDIFACT-, XML-, XSD-Prüfungen bestanden |
| Fachlich validiert | Preis-, Genehmigungs-, Summenregeln bestanden |
| Sicherheitsgeprüft | Threat Model, Penetrationstests bestanden |
| Betriebsfähig | Monitoring, Idempotenz, Wiederanlauf nachgewiesen |
| Extern getestet | Datenannahmestellen-Akzeptanz |
| Pilotiert | Reale Pilotprozesse erfolgreich |
| Produktionsbereit | Alle kritischen Risiken geschlossen, formelle Freigabe |

## KI-Risikoklassen

- **Niedrig**: Textumformulierung, Zusammenfassung → Standard-QA
- **Mittel**: Abrechnungsprüfung, Tourenoptimierung → HITL, Evaluationsmetriken
- **Hoch**: Patientenspezifische Empfehlungen, Medikationshinweise → MDR-Prüfung, AI Act

## Kritische To-dos (Priorisiert)

### Kritisch (sofort)
- [ ] SGB-V/SGB-XI-Versionsmatrix erstellen
- [ ] Hardcodiertes IK → mandantenbezogene Konfiguration
- [ ] Abrechnungs-Domainmodell vervollständigen (Submission→Payment)
- [ ] Datenannahmestellen-Testplan aufsetzen
- [ ] Zertifikats- und Schlüsselkonzept erstellen

### Hoch
- [ ] KIM/TI als Kern-Workstream etablieren
- [ ] Funktionsmatrix mit 400+ atomaren Einträgen erzeugen
- [ ] Mehrmandanten-Threat-Model erstellen
- [ ] KI-Module in Risikoklassen aufteilen

### Mittel
- [ ] UX-Feldforschung mit Pflegekräften
- [ ] Datenmigrationsstrategie
- [ ] Make-or-Buy für DAKOTA, KIM, TI-Gateway, Banking, OCR, LLM, HSM
- [ ] Pilotkundengruppe definieren

## Formale Go-live-Regel

> Die Plattform oder ein Abrechnungsmodul darf erst als produktionsbereit
> bezeichnet werden, wenn die zum Abrechnungszeitpunkt gültigen Spezifikationen
> implementiert, die fachlichen und technischen Prüfungen bestanden, die
> relevanten Datenannahmestellen erfolgreich getestet, Rückmeldungen und
> Korrekturen vollständig verarbeitet, Zertifikats- und KIM-Prozesse
> nachgewiesen, Mandantentrennung und Restore geprüft und die kritischen
> Datenschutz- und Sicherheitsrisiken formell freigegeben wurden.

## Messbarkeit von Marktführerschaft

| Zielgröße | Messung |
|---|---|
| Abrechnungsqualität | Ablehnungsquote und Korrekturquote |
| Automatisierungsgrad | Anteil Vorgänge ohne manuelle Nacharbeit |
| Pflegeproduktivität | Dokumentationszeit je Einsatz |
| Planungsqualität | Pünktlichkeit, Fahrzeit, Tourstabilität |
| Nutzerfreundlichkeit | Task Completion Rate, SUS, Supporttickets |
| Systemqualität | Verfügbarkeit, MTTR, Sync-Fehler |
| Kundenbindung | Logo-Churn, NRR, Wechselbereitschaft |
| KI-Qualität | Halluzinationsrate, Korrekturquote, HITL-Quote |
| Compliance | Zeit zwischen Regeländerung und produktiver Umsetzung |
