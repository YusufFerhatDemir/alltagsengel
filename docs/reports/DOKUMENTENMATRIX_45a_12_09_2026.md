# Dokumentenmatrix §45a — visuelle Reconciliation, 12.09.2026

**Methode:** Jede Datei wurde geöffnet und angesehen, nicht nur am Dateinamen beurteilt.
Scans (ohne Textebene) wurden als Bild gelesen, Textdokumente über die Textebene geprüft.
Durchsucht: `anerkennung-hessen/`, `docs/genehmigung/`, `~/Downloads` (225 Einträge),
`~/Desktop`, `~/Documents`, iCloud Drive. 26 Kamerascans einzeln geöffnet.

**Belegregel:** „unterschrieben" heißt hier: eine Tinten-Unterschrift ist im Dokument sichtbar.
Ein Textdokument ohne jedes eingebettete Bild kann keine enthalten — das ist maschinell
nachweisbar (`pdfimages`) und steht je Zeile als Beweis.

---

## A. Kernmappe Hessen (`anerkennung-hessen/`)

| Dokument | Pfad | Version | gefunden | visuell geprüft | unterschrieben | Datum | Felder | Original nötig | Kopie ok | Behördenrelevant | Status | nächste Aktion |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Erhebungsbogen (eigene Fassung) | `Anlage-00-Erhebungsbogen-Alltagsengel.pdf` | 4 S., Text | ja | ja | **nein** (0 Bilder, leere Zeile S.4) | — | Ort/Datum offen | nein | ja | ja | VERIFIED_UNSIGNED | unterschriebenen Scan einlegen |
| Anschreiben Hessen | `Anlage-01-Anschreiben-Antrag-Hessen.pdf` | 2 S., Text | ja | ja | **nein** (0 Bilder) | — | vollständig | nein | ja | ja | VERIFIED_UNSIGNED | unterschriebenen Scan einlegen |
| Berufserlaubnis Sabrina Martin | `Anlage-02-…-Sabrina-Martin.pdf` | Scan, 1 S. | ja | ja | amtlich gestempelt + signiert | Urkunde 03.09.2004, Wirkung 01.09.2004 | vollständig | Original vorzeigen | beglaubigte Kopie üblich | ja | **VERIFIED_SIGNED** (Behördenurkunde) | keine |
| IK-Bestätigung | `Anlage-03-ARGE-IK-Bestaetigung-460629986.pdf` | Scan, 2 S. | ja | ja | Behördenschreiben (keine Unterschrift nötig) | 21.07.2026 | IK 460629986 | nein | ja | ja | **VERIFIED_LIVE** | keine |
| Arbeitsvertrag Sabrina | `Anlage-04-…-Sabrina-Martin.pdf` | 3 S., Text | ja | ja | **nein** (0 Bilder) | — | **Beginn, Wochenstunden, Vergütung, Adresse LEER** | nein | ja | ja | **FIELD_MISSING** | Felder ausfüllen, dann beidseitig unterschreiben |
| Leistungskonzept | `Anlage-05-Konzept-zum-Angebot.pdf` | 8 S., Text | ja | ja | **nein** | — | vollständig | nein | ja | ja | VERIFIED_UNSIGNED | Unterschrift S.8 |
| Schulungskonzept | `Anlage-06-Schulungskonzept.pdf` | 4 S., Text | ja | ja | **nein** | — | vollständig | nein | ja | ja | VERIFIED_UNSIGNED | 2 Unterschriften (GF + Fachkraft) |
| Leistungs-/Kostenübersicht | `Anlage-07-Leistungs-und-Kostenuebersicht.pdf` | 2 S., Text | ja | ja | **nein** | — | nennt 30,00 €/Std.; mehrere Leerzeilen | nein | ja | ja | **FIELD_MISSING** | Preisentscheidung, dann Unterschrift |
| Erklärung Führungszeugnisse | `Anlage-08-…​.pdf` | 2 S., Text | ja | ja | **nein** | — | vollständig | nein | ja | ja | VERIFIED_UNSIGNED | Unterschrift |
| Erklärung SV/Mindestlohn | `Anlage-09-…​.pdf` | 2 S., Text | ja | ja | **nein** | — | vollständig | nein | ja | ja | VERIFIED_UNSIGNED | Unterschrift |
| Handelsregisterauszug | `Anlage-10-Handelsregisterauszug.pdf` | 2 S., Text | ja | ja | Registerausdruck | Abruf 12.07.2026 | HRB 140351, AG Frankfurt | nein | ja | ja | **VERIFIED_LIVE** | keine |
| Datenschutzkonzept | `Anlage-11-Datenschutzkonzept.pdf` | 3 S., Text | ja | ja | **nein** | — | vollständig | nein | ja | ja | VERIFIED_UNSIGNED | Unterschrift |
| Schweigepflichterklärung | `Anlage-12-Schweigepflichterklaerung.pdf` | 2 S., Text | ja | ja | **nein** | — | **Name, Geburtsdatum, Wohnort LEER** | nein | ja | ja | **FIELD_MISSING** | je Mitarbeitendem ausfüllen |
| Einverständnis Veröffentlichung | `Anlage-13-…​.pdf` | 1 S., Text | ja | ja | **nein** | — | vollständig | nein | ja | ja | VERIFIED_UNSIGNED | Unterschrift |
| Gewerbeanmeldung | `PLATZHALTER-Gewerbeanmeldung.md` | Platzhalter | **nein** | ja | — | — | — | Kopie reicht | ja | ja | **SUBMITTED_AWAITING_CONFIRMATION** | Eingangsbestätigung sichern |
| Betriebshaftpflicht | `Anlage-15-Betriebshaftpflicht-Police.pdf` | Scan, 13 S. | ja | ja | Versicherungsschein | Ausfertigung 06.08.2026 | s. u. | nein | ja | ja | **VERIFIED_LIVE** | Versicherungsnehmer prüfen (s. Befund 4) |
| Erw. Führungszeugnis Yusuf | `Erweitertes-Fuehrungszeugnis-…-2026.pdf` | Scan | ja | ja | amtlich (ohne Unterschrift gültig) | **20.07.2026** | „Keine Eintragung", Belegart NE = erweitert | Original an Behörde | Kopie meist nicht ausreichend | ja | **VERIFIED_SIGNED** | keine |
| Erhebungsbogen der Stadt | `Erhebungsbogen-Anbieterform-II-Frankfurt.pdf` | **kein PDF** | nein | ja | — | — | — | — | — | ja | **DOCUMENT_MISSING** | echtes Formular beschaffen (s. Befund 1) |

## B. Personen-Nachweise

| Dokument | Fundort | visuell geprüft | Ergebnis |
|---|---|---|---|
| Erweitertes FZ Yusuf | `~/Downloads/Gescanntes Dokument 29.pdf` + Repo | ja | **Erweitertes** FZ, 20.07.2026, keine Eintragung |
| FZ Sabrina Martin | `~/Downloads/Gescanntes Dokument 12.pdf` (3× dasselbe Blatt) | ja | **einfaches** Führungszeugnis, 22.04.2026, keine Eintragung — **nicht erweitert** |
| Berufserlaubnis Sabrina | `~/Downloads/Gescanntes Dokument 11.pdf` | ja | Urkunde RP Darmstadt, 03.09.2004 |
| IK-Vergabe | `~/Downloads/Gescanntes Dokument 27/28.pdf` | ja | IK 460629986, 21.07.2026 |
| IK-Rücksendekopie | `~/Downloads/Gescanntes Dokument 13/26.pdf` | ja | **unausgefüllt**: Kästchen leer, Datum/Unterschrift leer |
| IK-Antrag | `~/Downloads/Gescanntes Dokument 6.pdf` | ja | unser Antrag, 15.07.2026 |

## C. Unterschriebene Dokumente, die tatsächlich gefunden wurden

12 Erstanträge §45a an andere Bundesländer, alle vom 16.07.2026, alle mit Tinten-Unterschrift
auf Seite 2 (`~/Downloads/Gescanntes Dokument 15–25.pdf`):
Brandenburg (LASV Cottbus) · Bayern (LfP Amberg) · Baden-Württemberg (dezentral) ·
Mecklenburg-Vorpommern (LAGuS, 2 Scans) · Berlin (SenWGP) · Bremen (Senatorin) ·
Niedersachsen (LS Hildesheim) · Sachsen (KSV Leipzig) · Schleswig-Holstein (LAsD Kiel) ·
Thüringen (TLVwA Suhl).

**Für die Hessen-Mappe wurde auf diesem Rechner keine unterschriebene Fassung gefunden.**

---

## Befunde

### 1. Der amtliche Erhebungsbogen der Stadt Frankfurt fehlt (DOCUMENT_MISSING)
`anerkennung-hessen/Erhebungsbogen-Anbieterform-II-Frankfurt.pdf` ist **kein PDF**, sondern
eine gespeicherte Cloudflare-Sperrseite („Just a moment… Enable JavaScript and cookies to
continue", 5.824 Bytes HTML). Der Download ist fehlgeschlagen und wurde nie bemerkt. Die
eigene Fassung (`Anlage-00`) ersetzt das amtliche Formular nur, wenn die Stadt das zulässt.

### 2. Führungszeugnis Sabrina: einfach statt erweitert
Ausgestellt **22.04.2026** („Keine Eintragung"). Es ist **nicht** abgelaufen im Sinne eines
Verfallsdatums — Führungszeugnisse haben keines. Zwei andere Punkte zählen:
* Es trägt den Titel „Führungszeugnis", nicht „Erweitertes Führungszeugnis" (Yusufs Zeugnis
  trägt ihn, siehe oben) — §45a-Verfahren und der eigene Arbeitsvertrag (§10) verlangen das
  **erweiterte**.
* Es ist knapp **5 Monate** alt; Behörden verlangen üblicherweise höchstens 3 Monate.

### 3. Arbeitsvertrag Sabrina ist inhaltlich unfertig (FIELD_MISSING)
Leer sind: Beginn der Tätigkeit, Wochenstunden, monatliche Vergütung, Adresse
(„[Adresse wird ergänzt]"). Ein Vertrag mit diesen Lücken belegt gegenüber der Behörde keine
Fachkraftbindung.

### 4. Betriebshaftpflicht — verifiziert, mit einem Vorbehalt
Generali, Schein-Nr. 260-FKHU-010.124.010.673, Ausfertigung 06.08.2026, Beginn 27.07.2026,
Ablauf 01.07.2031. Deckung **pauschal 10.000.000 EUR** je Versicherungsfall, Jahresbeitrag
414,19 EUR. Risiko: „Haushaltshilfe, Betreuungsservice (nicht Pflegedienst)" — passend.
**Vorbehalt:** Versicherungsnehmer ist als „Alltagsengel" geführt, ohne Rechtsform. Die
Behörde erwartet die „Alltagsengel UG (haftungsbeschränkt)". Beim Versicherer klären.

### 5. Falschangabe in 12 bereits versandten Anträgen
Alle Bundesländer-Anschreiben enthalten den Satz: „Wir sind bereits in mehreren Bundesländern
(Hessen, Bayern, Nordrhein-Westfalen, Rheinland-Pfalz, Saarland) als Angebot zur Unterstützung
im Alltag nach §45a SGB XI **anerkannt**." Das trifft nicht zu — die Anerkennung läuft. Diese
Anträge sind unterschrieben und datiert (16.07.2026); ob sie abgesendet wurden, ist aus den
Dateien nicht ersichtlich. Gegenüber Behörden ist das eine unrichtige Angabe und sollte
richtiggestellt werden.

### 6. Offene Gerichtskasse-Mahnung
`~/Downloads/Gescanntes Dokument 5.pdf`: Mahnung der Gerichtskasse Frankfurt vom 26.05.2026,
Aktenzeichen 72 HRB 140351/0 002 — betrifft die Handelsregistersache. Status unbekannt.

### 7. Kartenscan mit Prüfziffer (USER_ACTION_REQUIRED)
`~/Downloads/Gescanntes Dokument 14.pdf` ist der Scan einer Geschäfts-Debitkarte, Vorder- und
Rückseite, mit vollständiger Kartennummer, Ablaufdatum und Prüfziffer.
**Im Projekt liegt die Datei nicht** — weder im Arbeitsbaum noch in der Git-Historie (per
SHA-256 über alle PDFs geprüft). Es ist daher nichts aus dem Repository zu entfernen.
Die Datei liegt ausschließlich in `~/Downloads`; das Löschen dort ist Ihre Entscheidung.
Empfehlung: Datei löschen und die Karte sperren/ersetzen lassen — eine Karte mit sichtbarer
Prüfziffer gilt als kompromittiert.

### 8. Gewerbeanmeldung
Status laut Ihrer Angabe: **online eingereicht, Bestätigung ausstehend**
(SUBMITTED_AWAITING_CONFIRMATION). Auf dem Rechner gibt es dazu keinen Beleg: keine
Eingangsbestätigung, kein Zahlungsbeleg, kein Screenshot, keine E-Mail-Datei. Vorhanden sind
nur die Vorbereitung (`Gewerbeanmeldung_Alltagsengel_UG_Vorbereitung.docx`, 13.07.2026) und
eine Sachstandsanfrage (PDF, 09.09.2026). Ein Postfachzugriff war mir nicht möglich.

### 9. Rukiye
Kein Anerkennungsblocker. In der Mappe kommt keine Rolle „Rukiye" vor; die Fachkraft nach
PfluV ist Sabrina Martin. Die Recherchenotiz vom 09.09. behandelt eine separate Frage.

> **Korrektur 12.09.2026 (spätere Zählung):** Hier steht „12 Bundesländer". Nachgezählt aus den Briefköpfen sind es **11 unterschriebene Schreiben an 10 Länder** (Mecklenburg-Vorpommern doppelt). Hamburg und Sachsen-Anhalt haben Textfassungen, aber keinen unterschriebenen Scan. Einzelnachweis je Blatt: `docs/genehmigung/RICHTIGSTELLUNG_BUNDESLAENDER_12_09_2026.md`.
