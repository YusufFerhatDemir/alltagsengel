# DiPA — Regulatorischer Faktencheck V2 (15.08.2026)

> Ergebnis: **34/48 erfüllt** (Quote 71 %, vorher 69 %). BF-01 geschlossen,
> BF-02 formativ abgedeckt. 10 Antragsblocker (Zeitklasse A), davon 3 auf
> dem kritischen Pfad (SEC-01, SEC-05, NN-01).

---

## Gegenstand

Dritter vollständiger Durchgang aller 15 nicht-erfüllten Punkte gegen die
Primärquellen. Ergänzt `docs/dipa/22_REGULATORISCHER_FINALCHECK_2026-08-15.md`
um:

1. **Neue Schließung:** BF-01 (34. erfüllter Punkt)
2. **Formative Evaluation:** BF-02 Cognitive Walkthrough durchgeführt
3. **DSFA-Aktualisierung:** R4 (MFA) gelöst
4. **Konsolidierte Blocker-Analyse** mit 7 kritischen Prüffragen

## Gelesene Quellen (Volltext, 15.08.2026)

| Quelle | Fassung |
|---|---|
| DiPAV inkl. Anlage 1 + 2 | BJNR156800022, ber. Art. 4a G v. 22.03.2024 |
| SGB XI §78a | aktuelle Fassung |
| SGB XI §40b | aktuelle Fassung |
| SGB V §139e | aktuelle Fassung |
| BSI TR-03161 Teile 1–3 | aktuelle Fassung |
| BfArM-DiPA-Leitfaden | Version 1.3 vom 15.07.2026 |

---

## Prüfung der 7 kritischen Fragen

### 1. Ist ISO 27001 WIRKLICH zwingend bei Antragstellung?

**JA.** Drei Ketten tragen die Pflicht:

| Ebene | Fundstelle | Verbindlichkeit |
|---|---|---|
| Verordnung | DiPAV §8 Abs. 3 Satz 2 | „**kann** … ergänzend … ISMS … verlangen" |
| Technische Richtlinie | BSI TR-03161-3 O.Org_1 | „**MUSS** eine Zertifizierung nach [ISO27001] … nachweisen" |
| Leitfaden | Kap. 3.4.1 (S. 50) | „**muss bei der Antragstellung** ein Zertifikat … vorweisen" |

Die Verordnung allein würde ein „kann" hergeben. Die TR-03161 macht daraus ein
MUSS, und der Leitfaden bindet den Zeitpunkt an die **Antragstellung**.

**Ergebnis:** Eingangsblocker. Nicht abschwächbar.

### 2. Muss die Zertifizierung DAkkS-akkreditiert sein?

**JA.** Leitfaden Kap. 3.4.1 (S. 50): „Die zertifizierende Stelle muss durch
die **DAkkS oder eine entsprechende ausländische Stelle** für die Durchführung
einer ISO 27001 Zertifizierung **akkreditiert sein**."

### 3. Ist TR-03161 zwingend VOR Antragstellung?

**JA.** Zwei Stichtage:

| Datum | Wirkung | Quelle |
|---|---|---|
| 01.01.2025 | Zertifikatspflicht tritt in Kraft | §139e Abs. 10 Satz 3 SGB V über §78a Abs. 7 SGB XI |
| **01.07.2025** | Zertifikat = Voraussetzung für **formale Vollständigkeit** des Antrags | Leitfaden Kap. 3.4 (S. 49) |

Ein Antrag ohne TR-03161-Zertifikat ist seit 01.07.2025 **formal unvollständig**
und wird nicht bearbeitet.

### 4. Ist externer Pentest zwingend oder reicht interner?

**Differenziert.** Der Pentest selbst muss durchgeführt werden (Leitfaden
Kap. 3.4.2, S. 51: „**muss** für alle Komponenten ein Penetrationstest
durchgeführt worden sein"). Eine BSI-zertifizierte Teststelle ist ein **SOLL**,
kein MUSS. **Aber:** der Pentest geht faktisch in die TR-03161-Zertifizierung
auf, die ihrerseits eine BSI-anerkannte Prüfstelle verlangt. Ein interner Test
genügt deshalb nur, wenn die TR-03161-Prüfstelle ihn als Teil ihrer Prüfung
anerkennt — eine rein interne Prüfung ohne BSI-Einbindung reicht **nicht**.

**Empfehlung:** SEC-01 und SEC-04 als **einen** Beschaffungsvorgang vergeben.

### 5. Sind WIRKLICH 11 Pflichtbestandteile VOR Antrag?

**Korrigiert: 10, nicht 11.** BF-01 ist jetzt erfüllt. Von den verbleibenden
10 Zeitklasse-A-Punkten sind:

- **3 überlappende Paare:** SEC-01/SEC-04 (ein Auftrag), QI-02/NN-01
  (Messinstrument ist Teil des Evaluationskonzepts)
- **3 harte Eingangsblocker:** SEC-01, SEC-05, NN-01 (ohne diese ist der
  Antrag formal unvollständig oder materiell nicht prüfbar)
- **4 Selbsterklärungen:** DS-02, DS-04, QI-01, VS-02 (keine externe
  Prüfstelle, aber die erklärten Sachverhalte müssen tatsächlich vorliegen)
- **1 Nutzertest:** BF-02 (summative Validierung mit echten Testpersonen)

**Effektive Beschaffungsvorgänge:** 7 (SEC-01+04, SEC-05, NN-01+QI-02, QI-01,
BF-02, DS-02+DS-04, VS-02).

### 6. Ist WIRKLICH keine Nachreichung möglich?

**Teilweise korrigiert.** Eigeninitiative Ergänzung nach Antragstellung ist
**nicht** möglich (DiPAV §15: „nur noch auf Anforderung des BfArM"). Aber das
BfArM **kann** fehlende Unterlagen anfordern — §78a Abs. 5 Satz 2 SGB XI gibt
dem Hersteller dafür **3 Monate** Frist. Nach Ablauf ohne Ergänzung: Ablehnung.

Das ändert die Planung: Ein Antrag mit **erkennbarer** Lücke wird nicht
automatisch abgelehnt, wenn das BfArM die Ergänzung anfordert. Es ändert aber
nichts an den Eingangsblocker-Anforderungen — ohne TR-03161-Zertifikat und
ISO-27001-Zertifikat ist der Antrag **formal unvollständig** und wird gar nicht
erst zur inhaltlichen Prüfung zugelassen.

### 7. Welche Anforderungen wurden bisher ZU STRENG interpretiert?

| Punkt | Bisherige Annahme | Korrektur | Auswirkung |
|---|---|---|---|
| **BF-01** | Externe Prüfstelle nötig | Anlage 2 ist Selbsterklärung, Nr. 13/14/15 intern erfüllbar | **Geschlossen** → erfüllt |
| **BF-03** | Pflichtnachweis | Zeitklasse E — empfohlen, kein Regulierungspunkt | Kein Blocker |
| **DS-02** | Juristische Schlussbewertung als Blocker | DSFA ist vom Verantwortlichen selbst durchzuführen; keine externe Stelle vorgeschrieben | Blocker milder |
| **VS-04** | DiPA-Anforderung | Reines AGB-Recht, kein DiPAV-Bezug | Zeitklasse E |
| **QI-02** | Instrumenten-Lizenzierung als Pflicht | Betrifft nur das Messinstrument des Nutzennachweises, nicht Produktfunktionen; eigenes Instrument mit Pretest möglich | Weg über Eigenentwicklung offen |
| **BF-02** | Nur empirischer Test möglich | Nr. 2 lässt analytischen Cognitive Walkthrough zu | Formative Runde abgedeckt |

---

## Aktualisierte 48-Punkte-Übersicht

### Zählstand

```
                                    vorher (V1)   jetzt (V2)
PASS_INTERNAL (erfüllt)                  33             34
EXTERNAL_EVIDENCE_REQUIRED               13             12
PARTIAL                                   2              1
FAIL                                      0              0
UNVERIFIED                                0              0
──────────────────────────────────────────────────────────────
Gesamt                                   48             48
Quote (erfüllt / gesamt)                69 %           71 %
```

### Veränderungen gegenüber V1

| Punkt | V1 | V2 | Grund |
|---|---|---|---|
| BF-01 | PARTIAL | **PASS_INTERNAL** | Nr. 13/14/15 nachweisbar erfüllt, Normkauf = Zeitklasse E |
| BF-02 | EXTERNAL | EXTERNAL | Stand unverändert, aber formative Runde jetzt abgedeckt |
| DS-02 | EXTERNAL | EXTERNAL | DSFA-R4 (MFA) gelöst, Restbewertung offen |

### Verbleibende 14 nicht-erfüllte Punkte nach Punkt

#### Zeitklasse A — Antragsblocker (10 Punkte)

| ID | Anforderung | Blocker | Wer |
|---|---|---|---|
| **SEC-01** | TR-03161-Zertifikat | BSI-anerkannte Prüfstelle beauftragen | extern |
| **SEC-04** | Penetrationstest | Mit SEC-01 zusammen | extern |
| **SEC-05** | ISMS / ISO 27001 | DAkkS-akkreditierte Stelle beauftragen | extern |
| **NN-01** | Evaluationskonzept | Herstellerunabhängiges Institut / CRO | extern |
| **QI-02** | Validiertes Messinstrument | Teil von NN-01 | extern |
| **QI-01** | Pflegefachliche Freigabe | Pflegefachkraft (eigenes Netz genügt) | fachlich |
| **BF-02** | Usability mit Zielgruppe | Testpersonen gewinnen (summativ) | fachlich |
| **DS-02** | DSFA | Intern durchführbar, kein externer Prüfer nötig | GF |
| **DS-04** | AVV-Kette | Vertragsunterschriften einholen | GF |
| **VS-02** | 24h-Support | Betriebliche Zusage (GF-Entscheidung) | GF |

#### Zeitklasse D — Nach Aufnahme (1 Punkt)

| ID | Anforderung | Blocker | Wer |
|---|---|---|---|
| REG-04 | Vergütung/Abrechnungsweg | §78a Abs. 1: 3 Monate nach Aufnahme; seit BEEP vorziehbar | GF/E |

#### Zeitklasse E — Empfohlen (3 Punkte)

| ID | Anforderung | Status | Wer |
|---|---|---|---|
| VS-04 | Selbstzahler-AGB | Entwurf fertig, jurist. Prüfung empfohlen | extern |
| REG-05 | BfArM-Beratung | Vorbereitet, nicht verpflichtend | GF |
| BF-03 | Screenreader-Durchgang | Maschinell abgedeckt, manuell offen | technik |

---

## Detailprüfung der 14 Punkte

### SEC-01 — TR-03161-Zertifikat

| Prüffrage | Antwort |
|---|---|
| Verpflichtend? | **JA** — DiPAV §5 Abs. 2 Nr. 1, §8 Abs. 3 S. 1 |
| Primärquelle | §139e Abs. 10 S. 3 SGB V über §78a Abs. 7 SGB XI |
| Was verlangt die Quelle? | Vorlage eines BSI-Zertifikats nach TR-03161 |
| Wann? | **Vor Antragstellung** (seit 01.07.2025 formale Vollständigkeit) |
| Nachreichbar? | NEIN |
| Externe Stelle? | **JA** — BSI-anerkannte Prüfstelle |
| Selbst erstellbar? | NEIN |
| Evidenz? | Zertifikat, ausgestellt von BSI-anerkannter Prüfstelle |

### SEC-04 — Penetrationstest

| Prüffrage | Antwort |
|---|---|
| Verpflichtend? | **JA** — Leitfaden Kap. 3.4.2 (S. 51) |
| Primärquelle | Leitfaden (nicht §8 Abs. 3 S. 5, der gilt nur auf dem geschlossenen Erklärungsweg) |
| Was verlangt die Quelle? | Pentest aller Komponenten inkl. Backend, manuelle Code Reviews, Whitebox-Test |
| Wann? | **Vor Antragstellung** (Durchführung; Vorlage nur auf Verlangen) |
| Nachreichbar? | Nur die Vorlage, nicht die Durchführung |
| Externe Stelle? | SOLL (BSI-zertifiziert), nicht MUSS — faktisch über SEC-01 |
| Selbst erstellbar? | NEIN (nicht allein ausreichend) |
| Evidenz? | Pentest-Bericht mit Schwachstellenbehebung |

### SEC-05 — ISMS / ISO 27001

| Prüffrage | Antwort |
|---|---|
| Verpflichtend? | **JA** — TR-03161-3 O.Org_1 (MUSS) + Leitfaden Kap. 3.4.1 |
| Primärquelle | BSI TR-03161-3 O.Org_1 über DiPAV §5 Abs. 2 Nr. 1 → §78a Abs. 7 |
| Was verlangt die Quelle? | Zertifizierung nach ISO 27001 / IT-Grundschutz, auf den Hersteller ausgestellt |
| Wann? | **Bei Antragstellung** (Leitfaden: „muss bei der Antragstellung vorweisen") |
| Nachreichbar? | NEIN |
| Externe Stelle? | **JA** — DAkkS-akkreditiert |
| Selbst erstellbar? | NEIN |
| Evidenz? | ISO-27001-Zertifikat + C5-Typ-2-Testate der Cloud-Dienstleister (O.Org_2) |

### NN-01 — Wissenschaftliches Evaluationskonzept

| Prüffrage | Antwort |
|---|---|
| Verpflichtend? | **JA** — §78a Abs. 6a S. 2 Nr. 3 SGB XI (Gesetzesrang) |
| Primärquelle | „ein von einer herstellerunabhängigen Institution erstelltes wissenschaftliches Evaluationskonzept" |
| Was verlangt die Quelle? | Konzept nach allgemein anerkannten wissenschaftlichen Standards |
| Wann? | **Dem Antrag beizufügen** — auch beim Erprobungsweg |
| Nachreichbar? | NEIN |
| Externe Stelle? | **JA** — herstellerunabhängiges Institut / CRO (bezahlte Beauftragung zulässig) |
| Selbst erstellbar? | NEIN |
| Evidenz? | Evaluationskonzept der externen Institution |

### QI-01 — Pflegefachliche Freigabe

| Prüffrage | Antwort |
|---|---|
| Verpflichtend? | **JA** — DiPAV §6 Abs. 8, Anlage 2 VI Nr. 1–19 |
| Primärquelle | „müssen qualitätsgesichert sein und dem allgemein anerkannten Stand entsprechen" |
| Was verlangt die Quelle? | Qualitätsgesicherte Inhalte, Quellen veröffentlicht, Aktualisierungsprozess |
| Wann? | **Vor Antragstellung** (Erklärung nach §6 Abs. 11, Anlage 2) |
| Nachreichbar? | NEIN |
| Externe Stelle? | **NEIN** — Selbsterklärung; pflegefachliche Person aus eigenem Netz genügt |
| Selbst erstellbar? | JA (mit pflegefachlicher Kompetenz) |
| Evidenz? | Freigabeprotokoll je Modul, Quellenverzeichnis, Aktualisierungsprozess |

### QI-02 — Validiertes Messinstrument

| Prüffrage | Antwort |
|---|---|
| Verpflichtend? | **JA** — Leitfaden Kap. 4.3.2 |
| Primärquelle | „Nachweis des pflegerischen Nutzens muss auf einem validierten Messinstrument basieren" |
| Was verlangt die Quelle? | Validiertes Instrument ODER Literatur-Review + eigenes Instrument + Pretest |
| Wann? | **Vor Antragstellung** (Teil des Evaluationskonzepts) |
| Nachreichbar? | NEIN |
| Externe Stelle? | NEIN direkt, aber das Evaluationskonzept muss herstellerunabhängig sein |
| Selbst erstellbar? | JA (eigenes Instrument mit Pretest ist explizit zulässig) |
| Evidenz? | Validierungsnachweis oder Literatur-Review + Pretest-Ergebnisse |

### BF-01 — Barrierefreiheit *(GESCHLOSSEN)*

| Prüffrage | Antwort |
|---|---|
| Verpflichtend? | **JA** — Anlage 2 IV Nr. 13/14/15 |
| Status | **ERFÜLLT** seit 15.08.2026 |
| Begründung | Nr. 13 (Bedienhilfen): 3 Schriftgrade, Kontrast, Skip-Link, Landmarks, ≥44px, axe-core clean. Nr. 14 (Anpassungen): persistent, geräteübergreifend. Nr. 15 (Multimodal): visuell + auditiv (ARIA) + Tastatur + Zeiger. DIN-Normkauf = empfohlen, nicht Pflicht |

### BF-02 — Usability mit Zielgruppe

| Prüffrage | Antwort |
|---|---|
| Verpflichtend? | **JA** — Anlage 2 IV Nr. 2 (formativ), Nr. 3 (summativ), Nr. 10, Nr. 12 |
| Primärquelle | Nr. 2: „z. B. als Cognitive Walkthrough"; Nr. 3: „mindestens fünf Vertreter" |
| Was verlangt die Quelle? | Formative + summative Evaluation + Befragung + Fokusgruppen |
| Wann? | **Vor Antragstellung** (Erklärung nach §6 Abs. 11) |
| Nachreichbar? | NEIN |
| Externe Stelle? | **NEIN** — Hersteller darf selbst testen |
| Selbst erstellbar? | Formativ: JA (Cognitive Walkthrough, **abgeschlossen**). Summativ: JA, braucht aber Testpersonen |
| Evidenz? | Cognitive-Walkthrough-Bericht (liegt vor), Validierungsbericht, Befragungsergebnisse, Fokusgruppen-Protokolle |

### BF-03 — Screenreader-Durchgang

| Prüffrage | Antwort |
|---|---|
| Verpflichtend? | **NEIN** — kein Normtext; Zeitklasse E |
| Primärquelle | Kein Treffer in DiPAV, Anlage 1/2, SGB XI, Leitfaden |
| Was verlangt die Quelle? | Nichts (eigener QS-Standard) |
| Wann? | Nicht regulatorisch terminiert |
| Empfohlen? | JA — Operationalisierung von BF-01 Nr. 15 |
| Selbst erstellbar? | JA (VoiceOver/NVDA intern) |
| Evidenz? | Maschinell: axe-core Screenreader-Semantik (S1–S3, 0 Verstöße). Manuell: offen |

### DS-02 — DSFA

| Prüffrage | Antwort |
|---|---|
| Verpflichtend? | **JA** — Art. 35 Abs. 1 DSGVO (Art.-9-Daten) |
| Verfahrensweg | DiPAV §8 Abs. 4 S. 4 → Erklärung nach Anlage 1 DiGAV |
| Was verlangt die Quelle? | DSFA muss vorliegen, bevor die Anlage-1-DiGAV-Erklärung abgegeben wird |
| Wann? | **Vor Antragstellung** |
| Nachreichbar? | NEIN (Erklärung ist Antragsbestandteil) |
| Externe Stelle? | **NEIN** — Verantwortlicher führt die DSFA selbst durch |
| Selbst erstellbar? | **JA** |
| Evidenz? | DSFA-Dokument. Vorbereitung liegt vor, R4 (MFA) gelöst, [zu bewerten]-Felder offen |

### DS-04 — AVV-Kette

| Prüffrage | Antwort |
|---|---|
| Verpflichtend? | **JA** — Art. 28 Abs. 3 DSGVO, DiPAV §5 Abs. 4 |
| Was verlangt die Quelle? | AVV mit allen Auftragsverarbeitern; **Standardvertragsklauseln UNZULÄSSIG** |
| Wann? | **Vor Antragstellung** |
| Nachreichbar? | NEIN |
| Externe Stelle? | **NEIN** — Vertragsunterschriften, keine Prüfstelle |
| Selbst erstellbar? | JA (Dossier liegt vor, Unterschriften fehlen) |
| Evidenz? | Gegengezeichnete AVV-Verträge |

### VS-02 — 24h-Support

| Prüffrage | Antwort |
|---|---|
| Verpflichtend? | **JA** — Anlage 2 III Nr. 8 |
| Primärquelle | „kostenlose deutschsprachige Anwenderbetreuung … innerhalb von 24 Stunden" |
| Was verlangt die Quelle? | Zugeschnittene **Rückmeldung** in 24h (Leitfaden Kap. 3.6.2: nicht die fertige Antwort) |
| Wann? | **Vor Antragstellung** (Selbsterklärung) |
| Nachreichbar? | NEIN |
| Externe Stelle? | **NEIN** |
| Selbst erstellbar? | JA (GF-Entscheidung über Bereitschaft/Vertretung) |
| Evidenz? | Veröffentlichte Reaktionszeit-Zusage, Bereitschaftsregelung |

### REG-04 — Vergütung

| Prüffrage | Antwort |
|---|---|
| Verpflichtend? | **JA**, aber **nach Aufnahme** |
| Primärquelle | §78a Abs. 1 SGB XI, §40b SGB XI |
| Beträge | §40b: **40 €/Monat** (DiPA) + **30 €/Monat** (eUL) — ZWEI getrennte Posten, KEIN 70-€-Topf |
| Wann? | Verhandlung **3 Monate nach Aufnahme**; seit BEEP vorziehbar |
| Evidenz? | Vergütungsvereinbarung mit GKV-Spitzenverband |

### VS-04 — Selbstzahler-AGB

| Prüffrage | Antwort |
|---|---|
| Verpflichtend? | **NEIN** als DiPA-Anforderung — reines AGB-Recht |
| Zeitklasse | E (empfohlen) |
| Evidenz? | Geprüfte Nutzungsbedingungen (Entwurf liegt vor) |

### REG-05 — BfArM-Beratung

| Prüffrage | Antwort |
|---|---|
| Verpflichtend? | **NEIN** — DiPAV §22: „auf deren Anfrage" (freiwillig) |
| Zeitklasse | E (empfohlen, höchste Hebelwirkung) |
| Gebühren | §26 Abs. 1: 250–5.000 € |
| Evidenz? | Beratungsprotokoll (optional, aber empfohlen für den Antrag) |

---

## Vergütungsmodell (korrigiert)

**Bisheriger Fehler:** „§40a Abs. 1a SGB XI, 70-€-Deckel" — falsche Norm, falscher Mechanismus.

**Korrekt (§40b Abs. 1 SGB XI):**

| Anspruch | Betrag | Quelle |
|---|---|---|
| DiPA-Erstattung (§40a) | bis **40 €/Kalendermonat** | §40b Abs. 1 Nr. 1 |
| Ergänzende Unterstützungsleistungen (§39a) | bis **30 €/Kalendermonat** | §40b Abs. 1 Nr. 2 |

Das sind **zwei getrennte Leistungsansprüche** der versicherten Person, nicht ein
kombinierter Erstattungsbetrag. Der Vergütungsbetrag für den Hersteller wird
**separat** verhandelt (§78a Abs. 1 SGB XI). Die 40 €/30 € sind der Anspruch
der Pflegebedürftigen gegenüber der Pflegekasse.

**Seit BEEP (01.01.2026):** Vergütungsverhandlungen können vor und während des
Antragsverfahrens geführt werden (Leitfaden Kap. 5.3.1).

---

## Kritischer Pfad — 3 Eingangsblocker

Ohne diese drei Nachweise ist der Antrag **formal unvollständig** und wird nicht
zur inhaltlichen Prüfung zugelassen:

1. **SEC-01** — TR-03161-Zertifikat (BSI-anerkannte Prüfstelle)
2. **SEC-05** — ISO-27001-Zertifikat (DAkkS-akkreditiert)
3. **NN-01** — Evaluationskonzept (herstellerunabhängiges Institut/CRO)

**Alles andere** — DSFA, AVV, pflegefachliche Freigabe, Usability-Tests,
Support-Zusage — muss inhaltlich vorliegen, wird aber erst in der
**materiellen Prüfung** relevant. Das BfArM kann bei Lücken Ergänzungen
anfordern (§78a Abs. 5 S. 2: 3 Monate Frist).

---

## Änderungen am Anforderungskatalog

| Datei | Änderung |
|---|---|
| `lib/coach/anforderungskatalog.ts` AK-BF-01 | `stand: 'in_arbeit'` → `'erfuellt'`, Nachweis Nr. 13/14/15 dokumentiert, `gapId: null` |
| `lib/coach/anforderungskatalog.ts` AK-BF-02 | Nachweis um Cognitive Walkthrough ergänzt |
| `audit/dipa/cognitive_walkthrough_pflegecoach.md` | NEU — formative Evaluation nach Anlage 2 IV Nr. 2 |
| `audit/dipa/dsfa_pflegecoach.md` R4 | MFA-Risiko von „hoch" auf „gering" korrigiert |

---

*Durchgeführt am 15.08.2026. Nächster Schritt: BfArM-Beratung (REG-05) —
klärt SEC-01-Scope, NN-01-Partner und offene Einzelfragen in einem Termin.*
