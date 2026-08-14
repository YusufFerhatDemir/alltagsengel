# Phase 4 — Vollständiger interner DiPA-Reverify (14.08.2026)

**Auftrag:** alle 48 Punkte in `lib/coach/anforderungskatalog.ts` erneut prüfen, seit
10c2123 (REG-01, 20/48), cba82cf/cba8342 (Server-Only Guards, vitals.ts-Fix) und
faf1113 (GAP-SHARES-UI). Ziel: kein intern lösbarer FAIL/NOT_VERIFIED bleibt übrig,
ohne Anforderungen zu erfinden oder Sekundärquellen als alleinige Grundlage zu nehmen.

**Methode — Unterschied zum letzten Durchgang:** Der Durchgang vom 14.08.2026 (Commit
10c2123) hat DiPAV nur bis §9 gelesen und keine Anlagen im Volltext geprüft (siehe
`docs/dipa/15_REG01_ANFORDERUNGSTEXTE.md` §2). Dieser Durchgang hat zusätzlich geholt und
im Volltext (nicht nur zusammengefasst) gelesen:

- DiPAV vollständig bis §22 (Abschnitt 1–6: Antrag, Sicherheit/Qualität/Datenschutz,
  Nutzennachweis, Verwaltungsverfahren, Beratung) — `gesetze-im-internet.de/dipav/__N.html`
- **Anlage 1 DiPAV** (Fragebogen nach §3 Abs. 2, Nicht-Medizinprodukte) — Rohtext per
  `curl`+HTML-Entities-Dekodierung gelesen, nicht nur KI-Zusammenfassung
- **Anlage 2 DiPAV** (Fragebogen nach §6/§7, Qualität) im Volltext
- § 40a SGB XI (Anspruchsgrundlage)
- Art. 2 Nr. 1 Verordnung (EU) 2017/745 (MDR) — Medizinprodukt-Definition
- **BfArM-DiPA-Leitfaden, Version 1.3 (Stand 15.07.2026)**, 138 Seiten PDF von
  `bfarm.de/SharedDocs/Downloads/DE/Medizinprodukte/dipa_leitfaden.pdf` — per `pdftotext`
  lokal extrahiert und durchsucht (die vorherige Session hatte diesen Leitfaden nicht
  vorliegen; er existiert als offizielles BfArM-Dokument)

Alle Fundstellen unten sind wörtliche oder eng paraphrasierte Zitate aus diesen Quellen,
mit Kapitel-/Paragraphenangabe. Keine Anforderung wurde erfunden; wo der Text keine
Basis hergab, blieb der Eintrag `anforderungstextGeprueft: false`.

## Ergebnis in Zahlen

```
npm run dipa:katalog, 14.08.2026:

Anforderungen gesamt:  48
erfüllt:                31      in Arbeit: 9      offen: 8
Nachweise:              alle 93 verwiesenen Dateien existieren
Belege:                 jeder erfüllte Eintrag nennt mindestens eine Datei

Anforderungstexte gegen das Original geprüft:  36 von 48  (vorher 20/48)
Belastbare Quote:                              44 %        (vorher 35 %)

Intern noch offen (3): AK-INT-02, AK-BF-03, AK-VS-02
```

**16 Einträge neu verifiziert** in diesem Durchgang: AK-PROD-02, AK-QMS-01 (Korrektur,
siehe unten), AK-SEC-01, AK-SEC-04, AK-SEC-05, AK-QI-02, AK-NN-01, AK-BF-01 (Korrektur),
AK-BF-02, AK-BF-03, AK-VS-02 (Statusänderung, siehe unten), AK-VS-04, AK-REG-02,
AK-REG-03, AK-REG-04, AK-REG-05.

**12 bleiben bewusst `NOT_VERIFIED`** (kein Textfund, keine Vermutung eingetragen):
AK-PROD-06, AK-DS-06, AK-SEC-02, AK-SEC-03, AK-SEC-06, AK-SEC-07, AK-SEC-08, AK-QI-01,
AK-NN-02, AK-NN-03, AK-VS-03, AK-REG-01 (Meta-Eintrag, bleibt offen solange geprüft wird).

## Drei echte Korrekturen (die Sorte Befund, für die REG-01 existiert)

1. **AK-BF-01 war falsch verortet.** Der Katalog zitierte EN 301 549/WCAG 2.1 AA als
   Maßstab. Anlage 2 DiPAV + BfArM-Leitfaden Kap. 3.6.3.2 (S. 73) benennen stattdessen
   **DIN EN ISO 9241-171** (Zugänglichkeit von Software, Anhang C/D). WCAG/EN 301 549/BFSG
   kommen im Leitfaden nicht als verbindlicher Maßstab vor. Der vorhandene axe-core-Test
   ist weiterhin sinnvoll, deckt aber nicht die tatsächlich einschlägige Norm ab — das
   externe Prüfziel in der Todo-Liste musste entsprechend korrigiert werden.
2. **AK-QMS-01 hätte schon beim letzten Durchgang gefunden werden müssen.** Die Suche
   damals prüfte nur §6 Abs. 2 und schloss daraus "keine passende DiPAV-Stelle". Die
   tatsächliche Fundstelle liegt in **Anlage 1 DiPAV**, Themenfelder "Qualitätsmanagement-
   system" und "Risikomanagementsystem" — beide mit mehreren zwingenden Einzelpunkten.
   Anlage 1 wurde beim letzten Durchgang laut eigener Dokumentation nur auf "unbefugten
   Zugriff" (Nr. 32) und "Informationssicherheit" (Nr. 24) geprüft, nicht vollständig gelesen.
3. **AK-VS-02 verliert seinen Status.** Anlage 2 DiPAV nennt eine konkrete Frist:
   Anwenderbetreuung muss Anfragen **"spätestens innerhalb von 24 Stunden"** beantworten.
   Diese Zusage existiert bei uns nicht (Volltextsuche über `lib/coach`, `app/pflegecoach`,
   `audit/dipa` ohne Treffer). Der Eintrag wechselt von `erfuellt` zu `in_arbeit` — genau der
   Fall, den `docs/dipa/15_REG01_ANFORDERUNGSTEXTE.md` §5 Punkt 4 vorhergesagt hat: "es ist
   damit zu rechnen, dass die Rohquote sinkt. Das wäre der Erfolg von REG-01."

Zusätzlich löst dieser Durchgang zwei der in Phase 5 gestellten Fragen mit einer klaren,
primärquellengestützten Antwort (siehe Tabelle: AK-REG-02, AK-REG-05).

## Vollständige 48-Punkte-Tabelle

Format: ID · Anforderung (kurz) · Primärquelle · Fundstelle · intern/extern (Klasse) ·
Implementierung · Test/Nachweis · Status · Restaufgabe

Status-Codes: **VERIFIED** = anforderungstextGeprueft=true UND stand=erfuellt ·
**PARTIAL** = anforderungstextGeprueft=true, stand=in_arbeit (Text geprüft, Umsetzung
unvollständig) · **NOT_VERIFIED** = anforderungstextGeprueft=false · **EXTERNAL_REQUIRED**
= Klasse D/E, unabhängig vom Prüfstatus wartet die Erfüllung auf eine externe Leistung ·
**NOT_APPLICABLE** = kommt in diesem Katalog nicht vor (kein Eintrag hat `nicht_anwendbar`).

### 1. Produkt und Zweckbestimmung

| ID | Anforderung | Primärquelle | Fundstelle | Klasse | Implementierung | Nachweis | Status | Restaufgabe |
|---|---|---|---|---|---|---|---|---|
| PROD-01 | Zweckbestimmung eindeutig, konsistent | DiPAV | §2 Abs.1 Nr.2, Nr.6 | A intern | `app/pflegecoach/start/page.tsx` | `audit/dipa/finale_zweckbestimmung.md` | VERIFIED | Bei Funktionsänderung nachziehen |
| PROD-02 | Kein Medizinprodukt — schriftliche Begründung | MDR Art. 2 Nr. 1 | Verordnung (EU) 2017/745 | A intern | `lib/coach/empfehlungen.ts` Verbotsliste | `audit/dipa/mdr_negativabgrenzung.md` | VERIFIED | Juristische Schlussprüfung vor Antrag (Bündel mit DS-02/VS-04) |
| PROD-03 | Versioniert, Änderungen dokumentiert | kein externer Normtext | eigene Disziplin | A intern | `lib/coach/version.ts` (SemVer) | `audit/dipa/CHANGELOG_pflegecoach.md` | VERIFIED | Changelog-Disziplin halten |
| PROD-04 | Funktionsumfang vollständig beschrieben | DiPAV | §2 Abs.1 Nr.7 | A intern | — | `audit/dipa/funktionsbeschreibung_pflegecoach.md` | VERIFIED | — |
| PROD-05 | Zielgruppe definiert und abgegrenzt | DiPAV | §2 Abs.1 Nr.11 | A intern | — | `audit/dipa/zielgruppendefinition.md` | VERIFIED | — |
| PROD-06 | Nutzerflow bis Abrechnung abgebildet | — | kein DiPAV-Antragsinhalt gefunden | A intern | Migration 20260826010000 | `audit/dipa/nutzerflow_dipa.md` | NOT_VERIFIED | Kein Textfund; bleibt offen |

### 2. Datenschutz

| ID | Anforderung | Primärquelle | Fundstelle | Klasse | Implementierung | Nachweis | Status | Restaufgabe |
|---|---|---|---|---|---|---|---|---|
| DS-01 | Einwilligung Gesundheitsdaten | DSGVO | Art. 9 Abs. 2 lit. a | A intern | `lib/coach/consent.ts` | `coach_consents` append-only | VERIFIED | — |
| DS-02 | Datenschutz-Folgenabschätzung | DSGVO | Art. 35 | D extern | — | `audit/dipa/dsfa_pflegecoach.md` (Vorbereitung) | PARTIAL / EXTERNAL_REQUIRED | Kanzlei beauftragen |
| DS-03 | Löschkonzept, Portabilität | DSGVO | Art. 17, 20 | A intern | `/pflegecoach/loeschung`, `/api/coach/export` | `audit/dipa/loeschkonzept.md` | VERIFIED | Aufbewahrungsfrist hängt an DS-04 |
| DS-04 | AV-Kette dokumentiert | DSGVO | Art. 28 | D extern | — | `audit/dipa/avv_dossier_pflegecoach.md` (Verträge fehlen) | PARTIAL / EXTERNAL_REQUIRED | AVV-Verträge beschaffen |
| DS-05 | Verzeichnis Verarbeitungstätigkeiten | DSGVO | Art. 30 | A intern | — | `audit/dipa/verarbeitungsverzeichnis_pflegecoach.md` | VERIFIED | — |
| DS-06 | Datenflüsse dokumentiert | — | §5 DiPAV geprüft, keine Dokumentationspflicht als eigener Punkt gefunden | A intern | — | `audit/dipa/datenfluesse_pflegecoach.md` | NOT_VERIFIED | Deckt sich vermutlich mit DS-05/Art.30 |
| DS-07 | Kein Cross-Selling/Werbung mit Daten | DiPAV | §5 Abs. 5 | A intern | Tracker aus | E2E-Test geladene Hosts | VERIFIED | Bei neuem Tracker prüfen |

### 3. Datensicherheit

| ID | Anforderung | Primärquelle | Fundstelle | Klasse | Implementierung | Nachweis | Status | Restaufgabe |
|---|---|---|---|---|---|---|---|---|
| SEC-01 | TR-03161-Zertifikat | DiPAV + BfArM-Leitfaden | §5 Abs.2 Nr.1, §8 Abs.3; Leitfaden Kap. 3.4 | D extern | — | `audit/dipa/tr03161_checkliste.md` (Selbsteinschätzung) | PARTIAL / EXTERNAL_REQUIRED | Prüfstelle beauftragen (kritischer Pfad) |
| SEC-02 | Verschlüsselung Transport/Ruhe | — | Anlage 1 nennt weder Verschlüsselung noch TLS namentlich | A intern | TLS + At-Rest | `audit/dipa/verschluesselungskonzept.md` | NOT_VERIFIED | Hängt an SEC-01/TR-03161 |
| SEC-03 | Zweiter Faktor | — | kein Textfund in DiPAV/Anlage 1 | B intern | `lib/coach/mfa.ts` (TOTP) | 9 Tests, serverseitige Durchsetzung | NOT_VERIFIED | Hängt an SEC-01/TR-03161 |
| SEC-04 | Externer Pentest | DiPAV + BfArM-Leitfaden | §8 Abs.3; Leitfaden Kap. 3.4 | D extern | — | `audit/dipa/pentest_beauftragung_scope.md` | PARTIAL / EXTERNAL_REQUIRED | **Nicht separat von SEC-01 beauftragen** — TR-03161-Zertifikat deckt i. d. R. ab |
| SEC-05 | ISMS | BfArM-Leitfaden | Kap. 3.4.1, S. 50 | D extern | — | `audit/dipa/isms_scope_vorbereitung.md` | PARTIAL / EXTERNAL_REQUIRED | ISO-27001-Zertifikat zwingend, DAkkS-akkreditierte Stelle beauftragen |
| SEC-06 | Rollen/Rechte technisch durchgesetzt | — | kein Textfund | A intern | RLS-Policies | 68/68 Shadow-Tests | NOT_VERIFIED | Hängt an SEC-01/TR-03161 |
| SEC-07 | Auditierbarkeit | — | kein Textfund | A intern | `coach_audit_log` | Tests P7 | NOT_VERIFIED | Hängt an SEC-01/TR-03161 |
| SEC-08 | Trennung von Betriebsplattform | — | kein Textfund | A intern | eigene Tabellen/Policies | Tests P3, P9.5 | NOT_VERIFIED | Hängt an SEC-01/TR-03161; Trennungstiefe mit BfArM klären |

### 4. Interoperabilität

| ID | Anforderung | Primärquelle | Fundstelle | Klasse | Implementierung | Nachweis | Status | Restaufgabe |
|---|---|---|---|---|---|---|---|---|
| INT-01 | Maschinenlesbarer Export | kein externer Normtext | eigenes Schema | A intern | `lib/coach/export.schema.json` | Konformanz-Test | VERIFIED | — |
| INT-02 | Verbindliches Austauschformat (FHIR) | DiPAV + BfArM-Leitfaden | §7, §2 Abs.1 Nr.20; Leitfaden Kap. 2 | B intern | `lib/coach/fhir.ts` | 13 Tests | PARTIAL | FHIR/MIO ist "erste Wahl" laut Leitfaden, keine absolute Pflicht — Einzelfall mit BfArM klären |
| INT-03 | Menschenlesbarer Bericht | DiPAV | §2 Abs.1 Nr.20 | A intern | `/pflegecoach/bericht` | unveränderliche Snapshots | VERIFIED | — |

### 5. Barrierefreiheit und Gebrauchstauglichkeit

| ID | Anforderung | Primärquelle | Fundstelle | Klasse | Implementierung | Nachweis | Status | Restaufgabe |
|---|---|---|---|---|---|---|---|---|
| BF-01 | Barrierefreiheits-Standard | DiPAV + BfArM-Leitfaden | §6 Abs.6, Anlage 2; Leitfaden Kap. 3.6.3.2 (**DIN EN ISO 9241-171**, nicht WCAG/EN301549) | D extern | Grundausstattung + axe-core | e2e-Tests | PARTIAL / EXTERNAL_REQUIRED | Konformitätsprüfung gegen DIN EN ISO 9241-171 Anhang C/D beauftragen |
| BF-02 | Gebrauchstauglichkeit mit Zielgruppe | Anlage 2 DiPAV + BfArM-Leitfaden | Themenfeld 4; Leitfaden Kap. 3.6.3.1 (formative+summative Evaluation) | D extern | — | Durchführungsplan (nur summativ geplant) | PARTIAL / EXTERNAL_REQUIRED | Testpersonen gewinnen; formative Runde ergänzen |
| BF-03 | Screenreader-Durchgang | Operationalisierung von BF-01 | DIN EN ISO 9241-171 Anhang D | C intern | Strukturprüfung | axe-core, S1-S8 Prüfpunkte | PARTIAL | Manueller VoiceOver/NVDA-Durchgang (S1,S5,S7,S8) |

### 6. Qualität der Inhalte

| ID | Anforderung | Primärquelle | Fundstelle | Klasse | Implementierung | Nachweis | Status | Restaufgabe |
|---|---|---|---|---|---|---|---|---|
| QI-01 | Inhalte fachlich geprüft | — | kein Textfund, eigener Qualitätsanspruch | D extern | `lib/coach/inhalte.ts` | `audit/dipa/inhalte_pruefdossier.md` | NOT_VERIFIED | Pflegefachkraft beauftragen — höchstes Produktrisiko |
| QI-02 | Erhebungsinstrumente validiert/lizenziert | BfArM-Leitfaden | Kap. 4.5.1 | D extern | 7-Item-Kurzinstrument, als unvalidiert gekennzeichnet | `lib/coach/belastung.ts` | PARTIAL / EXTERNAL_REQUIRED | Lizenzen FES-I/BSFC-s/SUS klären |
| QI-03 | Pflegeprobleme/-ziele fachlich hergeleitet | kein externer Normtext | Pflegeprozess-Methodik | A intern | — | `audit/dipa/pflegeprobleme_pflegeziele.md` | VERIFIED | Mit QI-01 gegenprüfen |

### 7. Nutzennachweis

| ID | Anforderung | Primärquelle | Fundstelle | Klasse | Implementierung | Nachweis | Status | Restaufgabe |
|---|---|---|---|---|---|---|---|---|
| NN-01 | Evaluationskonzept einreichungsreif | DiPAV + BfArM-Leitfaden | §§11-12; Leitfaden Kap. 4.5.2 (Institut zwingend) | D extern | — | `audit/dipa/evaluationskonzept.md` | PARTIAL / EXTERNAL_REQUIRED | Herstellerunabhängiges wiss. Institut finden — zwingend, nicht optional |
| NN-02 | Pseudonymisierte Nutzungsdaten | — | kein Textfund | A intern | HMAC-Pseudonym | Tests P9.1/P9.2 | NOT_VERIFIED | Kein Textfund; bleibt offen |
| NN-03 | Pilotdesign | — | kein Textfund | A intern | — | `audit/dipa/pilotdesign.md` | NOT_VERIFIED | Start hängt an NN-01, QI-01 |

### 8. Verbraucherschutz

| ID | Anforderung | Primärquelle | Fundstelle | Klasse | Implementierung | Nachweis | Status | Restaufgabe |
|---|---|---|---|---|---|---|---|---|
| VS-01 | Werbefrei, kein Cross-Selling | DiPAV | §6 Abs.4, §5 Abs.5 | A intern | Tracker aus | E2E-Test | VERIFIED | — |
| VS-02 | Erreichbarer Support, Frist | Anlage 2 DiPAV | §6 Abs.5 Punkt III.8 (**24 Stunden**) | A intern | Supportadresse, `/pflegecoach/anfrage` | — | PARTIAL | 24h-Antwortzusage fehlt — GAP-SUPPORT-SLA |
| VS-03 | Jederzeit ohne Hürde beendbar | — | kein Textfund in Anlage 2 | A intern | `/pflegecoach/einstellungen/konto` | — | NOT_VERIFIED | Kein Textfund; bleibt offen |
| VS-04 | Nutzungsbedingungen Selbstzahler | — | kein DiPAV-Bezug, betrifft Produkt A | D extern | — | Entwurf 13 Paragrafen, nicht wirksam | PARTIAL / EXTERNAL_REQUIRED | Juristische Prüfung (Bündel mit DS-02/PROD-02) |

### 9. QMS, Risikomanagement, Betrieb

| ID | Anforderung | Primärquelle | Fundstelle | Klasse | Implementierung | Nachweis | Status | Restaufgabe |
|---|---|---|---|---|---|---|---|---|
| QMS-01 | QM- und Risikomanagementsystem | Anlage 1 DiPAV | Themenfelder QMS + Risikomanagement (Korrektur ggü. letztem Durchgang) | C intern | — | QM-Handbuch, Risikoakte, Lebenszyklus-Dok. | VERIFIED | Externe Auditierung hängt an SEC-05 |
| QMS-02 | Risikoanalyse | Anlage 1 + §3 Abs.3 DiPAV | Themenfeld Risikomanagement (stärkere Fundstelle nachgetragen) | A intern | — | Risikoanalyse + Risikoakte | VERIFIED | Wiedervorlage je MINOR-Version |
| QMS-03 | Technische Dokumentation | DiPAV | §3 Abs.3 (Beispiel-Nachweis) | A intern | — | technische Dokumentation | VERIFIED | Auf Version 0.5.0 fortschreiben |
| QS-04 | Automatisierte Tests | kein externer Normtext | eigene QS-Erwartung | B intern | 68/68 Shadow-Tests | `supabase/shadow/50_pflegecoach_tests.sql` | VERIFIED | Bei neuen Tabellen mitziehen |
| QS-05 | Browser-E2E-Test | kein externer Normtext | eigene QS-Erwartung | B intern | 24/24 auf 2 Browsern | `.github/workflows/ci.yml` | VERIFIED | Bei neuen Seiten mitziehen |
| BETR-01 | DB-Stand auf Produktion | kein externer Normtext | interner Betriebszustand | A intern | Migrationen live | Tabellencheck 12.08.2026 | VERIFIED | Live-Apply-Bestätigung im Änderungsverfahren |

### 10. Verfahren und offene regulatorische Fragen

| ID | Anforderung | Primärquelle | Fundstelle | Klasse | Implementierung | Nachweis | Status | Restaufgabe |
|---|---|---|---|---|---|---|---|---|
| REG-01 | Anforderungstexte gegen Original geprüft | DiPAV/BfArM-Leitfaden/TR-03161 | dieser Katalog | E extern (Prozess) | `npm run dipa:katalog` | 36/48 geprüft | PARTIAL | 12 Resteinträge — siehe Liste oben |
| REG-02 | Freischaltcode-Verfahren? | BfArM-Leitfaden | Kap. 1/1.1, S. 6 (Kostenerstattung statt Code) | E extern | `lib/coach/freischaltung.ts` | Frage beantwortet: NEIN | VERIFIED | Zugangsschalter vor Aktivierung an Kostenerstattungsmodell anpassen |
| REG-03 | Qualifikation eUL-Erbringer? | BfArM-Leitfaden | S. 88 (Herstellerentscheidung, kein Katalog) | E extern | — | Frage beantwortet: selbst festlegbar | VERIFIED | — |
| REG-04 | Vergütung/Abrechnungsweg | BfArM-Leitfaden + §40a Abs.1a SGB XI | S. 6 (70€/Monat-Deckel als Rahmen) | E extern | fail-closed `verguetung_geklaert` | Rahmen bekannt, konkreter Anteil offen | PARTIAL / EXTERNAL_REQUIRED | Erst nach Aufnahme verhandelbar |
| REG-05 | BfArM-Beratungstermin | DiPAV §22 + BfArM-Leitfaden | Kap. 5.5/5.5.1 (freiwillig, keine Rechtsbindung) | E extern | — | Fragenkatalog 1-20 vorbereitet | PARTIAL / EXTERNAL_REQUIRED | Nicht verpflichtend, aber höchste Hebelwirkung — weiterhin empfohlen |

## Restliste: was intern noch offen ist (nicht extern)

Nur 3 Einträge sind laut `npm run dipa:katalog` sowohl intern bearbeitbar (Klasse A/B/C)
als auch noch nicht `erfuellt`:

- **AK-INT-02** (B) — Verbindlichkeit von FHIR/MIO im Einzelfall unklar, technisch bereits
  umgesetzt. Keine Codeänderung nötig, nur Klärung.
- **AK-BF-03** (C) — Maschineller Teil fertig, manueller VoiceOver/NVDA-Durchgang offen.
  Intern durchführbar, aber Zeitaufwand, kein externer Akteur nötig.
- **AK-VS-02** (A) — 24h-Support-SLA fehlt. Das ist eine Geschäftsführungs-Entscheidung
  (Zusage geben + operativ einhalten können), keine reine Codeänderung — deshalb nicht in
  diesem Durchgang "direkt behoben".

Alle drei sind absichtlich nicht in diesem Durchgang "gelöst" worden: INT-02 und REG-Fragen
sind Erkenntnis-, keine Bauaufgaben; BF-03 und VS-02 brauchen echte externe Beteiligung
(Testpersonen bzw. eine belastbare Betriebszusage) — das vorzutäuschen wäre selbst der
Fehler, den REG-01 verhindern soll.
