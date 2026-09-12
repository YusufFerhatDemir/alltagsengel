# §45a Hessen — Readiness der Genehmigungsmappe

**Stand:** 12.09.2026 · **Aktenzeichen 51.D24.12** · Rathaus für Senioren, Amt 51,
Hansaallee 150, 60320 Frankfurt am Main · `entlastungsangebote45@stadt-frankfurt.de`
**`ANERKENNUNG_45A_LIEGT_VOR = false`** — unverändert.
**Nichts an Behörden gesendet.**

---

## 0. Der Befund, der alles andere überholt

> **Die Frist war der 31.08.2026. Sie ist seit zwölf Tagen verstrichen.**

Das Behördenschreiben vom 08.07.2026 (`anerkennung-hessen/Rueckmeldung-Behoerde-2026-07-08.docx`,
Primärquelle, im Original gelesen) sagt wörtlich:

> „Zum Nach-/Einreichen oben angezeigter Bedarfe setzen wir Ihnen eine Frist bis zum
> 31.08.2026. Sollten sie dieser Frist kommentarlos nicht nachkommen, kann/wird Ihr
> Antrag abgelehnt werden."

| Angabe | Quelle | Status |
|---|---|---|
| **Aktenzeichen 51.D24.12** | Behördenschreiben 08.07.2026 | **VERIFIED** |
| Anschrift, Durchwahl, Ansprechpartnerin (Fr. Krause) | dasselbe Schreiben | **VERIFIED** |
| **Frist 31.08.2026** | dasselbe Schreiben | **VERIFIED — und abgelaufen** |
| Frist 10.10.2026 | **kein Behördenschreiben** — nur unser eigener, unversandter E-Mail-Entwurf `docs/emails/01-fristverlaengerung-frankfurt.md` | **UNKNOWN** |

Der Auftrag nennt „Frist 10.10.2026". Dieses Datum stammt aus einem **Antrag**, nicht aus
einer Bewilligung. Ob er abgeschickt wurde und ob die Stadt zugestimmt hat, ist nirgends
belegt. Eine frühere Sitzung hatte das am 09.09. korrekt so notiert; hier steht es noch
einmal, weil es die dringlichste Tatsache der ganzen Phase ist.

**Zweiter Punkt am Entwurf:** Er behauptet „Es fehlt lediglich noch die Gewerbeanmeldung."
Die Behörde hat **sieben** Punkte aufgeführt. Sollte der Entwurf in dieser Form
hinausgegangen sein, wäre auch das eine unrichtige Angabe.

---

## 1. Die Liste der Behörde — Punkt für Punkt

Nicht meine Gliederung: das sind die sieben Nachforderungen aus dem Schreiben vom
08.07.2026, in seiner Reihenfolge.

| # | Nachforderung der Behörde | Datei im Repo | Status |
|---|---|---|---|
| 1 | **Erweiterte Führungszeugnisse, zusätzlich als ORIGINAL** | `Erweitertes-Fuehrungszeugnis-Yusuf-…pdf` (Scan) · Sabrina: nur **einfaches** FZ | **NEEDS_CORRECTION** |
| 2 | **Gewerbeanmeldung** | `PLATZHALTER-Gewerbeanmeldung.md`, `docs/genehmigung/04_Gewerbeanmeldung.pdf` = Platzhaltertext | **BLOCKED_EXTERNAL** |
| 3 | **ARGE-Bestätigung (IK-Nummer)** | `Anlage-03-ARGE-IK-Bestaetigung-460629986.pdf` (Scan, 21.07.2026) | **VERIFIED_PRESENT** |
| 4 | **Konzept** | `Anlage-05-Konzept-zum-Angebot.pdf` (8 S.) | **NEEDS_SIGNATURE** |
| 5 | **Versicherungsnachweis + Police** | `Anlage-15-Betriebshaftpflicht-Police.pdf` (Generali, 13 S.) | **NEEDS_CORRECTION** |
| 6 | **Kosten-/Leistungsübersicht nach § 8 PfluV** | `Anlage-07-Leistungs-und-Kostenuebersicht.pdf` | **NEEDS_CORRECTION** |
| 7 | **Erhebungsbogen, Original mit rechtsverbindlicher Unterschrift** | amtliches Formular **fehlt**; eigene Fassung `Anlage-00` unsigniert | **MISSING** |

### Begründung je Korrekturbedarf

**#1 Führungszeugnisse.** Yusufs erweitertes FZ liegt als Scan vor (20.07.2026, „keine
Eintragung", Belegart NE) — die Behörde verlangt zusätzlich das **Original** auf Papier.
Sabrinas Zeugnis ist am Titel und an der Belegart **NB** als **einfaches**
Führungszeugnis erkennbar, nicht als erweitertes; § 45a und der eigene Arbeitsvertrag
(§ 10) verlangen das erweiterte. Es ist zudem vom 22.04.2026, also knapp fünf Monate alt —
Behörden verlangen üblicherweise höchstens drei.

**#5 Police.** Generali, Schein-Nr. 260-FKHU-010.124.010.673, Ausfertigung 06.08.2026,
Deckung 10 Mio. EUR, Risiko „Haushaltshilfe, Betreuungsservice (nicht Pflegedienst)" —
inhaltlich passend. **Aber:** Seite 4 nennt als Versicherungsnehmer „**Alltagsengel**"
ohne Rechtsform (am 12.09.2026 im Bild gelesen). Die Behörde erwartet die
„Alltagsengel UG (haftungsbeschränkt)".

**#6 Kosten-/Leistungsübersicht.** Nennt **30,00 €/Std.** Das ist genau der PfluV-Deckel
für Betreuung (§ 4 Nr. 2), aber die `billing_tariffs` führen § 45b-Tarife bei 35 €/h und
für Hauswirtschaft gilt ein Deckel von 25 €/h. Solange der Preis nicht entschieden ist,
geht hier eine Zahl an die Behörde, die im System eine andere ist. Siehe
`PRICE_SOURCE_OF_TRUTH_LATEST.md`.

**#7 Erhebungsbogen.** `Erhebungsbogen-Anbieterform-II-Frankfurt.pdf` ist **kein PDF**,
sondern eine gespeicherte Cloudflare-Sperrseite — 5.824 Bytes, beginnt mit `<!DOC`. Der
Download ist fehlgeschlagen und blieb unbemerkt. Geprüft, ob das Formular als Anlage im
Behördenbrief steckt: das DOCX enthält vier Einbettungen, alle klein (1034×479 und
kleiner) — Logos, nicht das Formular. Die Anlagen kamen also gesondert.

---

## 2. Die übrige Mappe

| Dokument | Datei | Status |
|---|---|---|
| Anschreiben Hessen | `Anlage-01-…pdf` | **NEEDS_SIGNATURE** |
| Berufserlaubnis Fachkraft | `Anlage-02-…pdf` (RP Darmstadt, 03.09.2004) | **VERIFIED_PRESENT** |
| Arbeitsvertrag Fachkraft | `Anlage-04-…pdf` | **PRESENT_BUT_INVALID** — Beginn, Wochenstunden, Vergütung, Adresse **leer** |
| Schulungskonzept | `Anlage-06-…pdf` (4 S.) | **NEEDS_SIGNATURE** (2 Unterschriften: GF + Fachkraft) |
| Erklärung Führungszeugnisse | `Anlage-08-…pdf` | **NEEDS_SIGNATURE** |
| Erklärung SV/Mindestlohn | `Anlage-09-…pdf` | **NEEDS_SIGNATURE** |
| Handelsregisterauszug | `Anlage-10-…pdf` (HRB 140351, Abruf 12.07.2026) | **VERIFIED_PRESENT** |
| Datenschutzkonzept | `Anlage-11-…pdf` (3 S.) | **NEEDS_SIGNATURE** |
| Schweigepflichterklärung | `Anlage-12-…pdf` | **PRESENT_BUT_INVALID** — Name, Geburtsdatum, Wohnort leer |
| Einverständnis Veröffentlichung | `Anlage-13-…pdf` | **NEEDS_SIGNATURE** |
| Qualitätskonzept | `docs/genehmigung/09_Qualitaetskonzept.pdf` (6 S.) | **VERIFIED_PRESENT** |
| Organisationskonzept | `12_Organisationskonzept.pdf` | **VERIFIED_PRESENT** |
| Beschwerdemanagement | `13_Beschwerdemanagement.pdf` | **VERIFIED_PRESENT** |
| Notfallkonzept | `14_Notfallkonzept.pdf` | **VERIFIED_PRESENT** |
| Vertretungsregelung | `16_Vertretungsregelung.pdf` | **VERIFIED_PRESENT** |
| PfluV Hessen + Verlängerung | `~/Downloads/PfluV Hessen 2023.pdf`, `Info_PfluV erneute Verlängerung 2026.pdf` | **VERIFIED_PRESENT** (Anlagen der Behörde) |

**Zur Unterschriftslage:** „NEEDS_SIGNATURE" heißt hier: *die Repo-Kopie* trägt keine
Tintenunterschrift (Textfassung ohne eingebettetes Bild, `pdfimages -list` → 0 Bilder).
Es heißt **nicht**, dass nicht unterschrieben wurde. Am 12.09.2026 wurde der ganze Rechner
durchsucht (Downloads, Desktop, Dokumente, iCloud, Fotos, Spotlight-Volltext): gefunden
wurden 11 unterschriebene Scans, alle an **andere** Bundesländer. Für Hessen ist kein
Scan digitalisiert.

---

## 3. Was fehlt und autonom nicht erstellbar ist

| Punkt | Warum nicht autonom |
|---|---|
| Amtlicher Erhebungsbogen | Muss von der Stadt kommen — als Anlage des Briefs oder per Download |
| Gewerbeanmeldung | Behördenakt |
| Erweitertes FZ Sabrina | Antrag nur durch die Person selbst möglich |
| Originale auf Papier | physischer Versand |
| Preis in der Kostenübersicht | BUSINESS_DECISION_REQUIRED |
| Versicherungsnehmer-Korrektur | Vertragsänderung beim Versicherer |

Die inhaltlichen Konzepte (Qualität, Organisation, Beschwerde, Notfall, Vertretung,
Datenschutz, Schulung, Leistung) **liegen vollständig vor** — hier ist nichts neu zu
erstellen. Was fehlt, fehlt ausschließlich an Behördenakten, Unterschriften und einer
Preisentscheidung.

---

## 4. Zusammenfassung nach Status

| Status | Anzahl | Dokumente |
|---|---|---|
| **VERIFIED_PRESENT** | 9 | IK-Bestätigung · Berufserlaubnis · Handelsregister · Qualitäts-, Organisations-, Beschwerde-, Notfall-, Vertretungskonzept · PfluV |
| **NEEDS_SIGNATURE** | 7 | Anschreiben · Konzept zum Angebot · Schulungskonzept · Erkl. FZ · Erkl. SV/Mindestlohn · Datenschutzkonzept · Einverständnis |
| **NEEDS_CORRECTION** | 3 | FZ (Original + erweitert für Sabrina) · Police (Versicherungsnehmer) · Kostenübersicht (Preis) |
| **PRESENT_BUT_INVALID** | 2 | Arbeitsvertrag Fachkraft · Schweigepflichterklärung (Felder leer) |
| **MISSING** | 1 | amtlicher Erhebungsbogen |
| **BLOCKED_EXTERNAL** | 1 | Gewerbeanmeldung |
| **UNKNOWN** | 1 | Fristverlängerung auf 10.10.2026 |

## 5. Dringlichkeitsreihenfolge

1. **Heute klären, ob die Frist verlängert wurde.** Anruf bei Fr. Krause, Durchwahl aus
   dem Schreiben. Die Frist vom 31.08. ist verstrichen; das Schreiben nennt als Folge
   ausdrücklich die Ablehnung. Ein Anruf klärt in fünf Minuten, was kein Dokument im Haus
   beantwortet.
2. Amtlichen Erhebungsbogen anfordern (per E-Mail an die Behörde, Aktenzeichen angeben).
3. Gewerbeanmeldung-Bestätigung nachfassen.
4. Erweitertes FZ für die Fachkraft beantragen.
5. Zwei Vordrucke ausfüllen (Arbeitsvertrag, Schweigepflichterklärung).
6. Preisentscheidung für die Kostenübersicht.
7. Versicherungsnehmer auf die UG umschreiben.
8. Unterschriften leisten und **scannen** — der Scan fehlt, nicht die Unterschrift.
