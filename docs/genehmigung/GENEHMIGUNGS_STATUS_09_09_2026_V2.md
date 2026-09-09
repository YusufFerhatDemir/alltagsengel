# Genehmigungsmappe — Ehrlicher Audit

**Stand:** 09.09.2026  
**Erstellt durch:** Automatisierte Dateiprüfung (kein manueller Sichtvergleich mit Originalen)  
**Methode:** Dateigröße, Textextraktion (pdftotext), Prüfung auf Platzhalter-Hinweise, leere Felder, leere Unterschriftzeilen.  
**Einschränkung:** Gescannte PDFs (Bild-PDFs) können nicht inhaltlich geprüft werden — sie werden als NICHT VERIFIZIERT eingestuft.

---

## Gesamtübersicht

| Kategorie | Anzahl |
|---|---|
| VORHANDEN (echtes Dokument, keine offenen Felder) | 3 |
| VORHANDEN ABER UNTERSCHRIFT FEHLT | 14 |
| NICHT VORHANDEN (Platzhalter oder fehlt komplett) | 1 |
| NICHT VERIFIZIERT (gescannt, Inhalt maschinell nicht prüfbar) | 3 |
| Interne Dokumente (kein Teil der Einreichung) | 4 |

---

## Einzelprüfung

### 01 — Anschreiben
- **Datei:** `01_Anschreiben.pdf` (4.745 Bytes)
- **Inhalt:** Antragsschreiben an Jugend- und Sozialamt Frankfurt. Text vollständig generiert.
- **Befund:** Datum leer (`___.___.2026`). Unterschriftzeile leer.
- **Status: VORHANDEN ABER UNTERSCHRIFT FEHLT**
- **Aktion:** 1× Unterschrift Yusuf + Datum eintragen

### 02 — Erhebungsbogen
- **Datei:** `02_Erhebungsbogen.pdf` (4.702 Bytes)
- **Inhalt:** Ausgefüllter Erhebungsbogen Anbieterform II. Text vollständig generiert.
- **Befund:** Datum leer (`___.___.2026`). Unterschriftzeile leer. Feld „Steuernummer" = `(noch einzutragen)`.
- **Status: VORHANDEN ABER UNTERSCHRIFT FEHLT**
- **Aktion:** 1× Unterschrift Yusuf + Datum + Steuernummer nachtragen

### 03 — Handelsregisterauszug
- **Datei:** `03_Handelsregisterauszug.pdf` (156.373 Bytes)
- **Inhalt:** Elektronischer Abruf vom Amtsgericht Frankfurt am Main, 12.07.2026. HRB 140351. Textextrahierbar, enthält Firmendaten, Geschäftsführer, Gegenstand.
- **Befund:** Echtes Dokument. Keine Unterschrift erforderlich (amtlicher Auszug).
- **Status: VORHANDEN**

### 04 — Gewerbeanmeldung
- **Datei:** `04_Gewerbeanmeldung.pdf` (45.025 Bytes)
- **Inhalt:** Enthält wörtlich: `⚠ PLATZHALTER ⚠ — FEHLT – beim Gewerbeamt Frankfurt am Main beantragen (§ 14 Abs. 1 GewO)`.
- **GewA1-Suche:** Eine Datei `GewA1_Alltagsengel_UG_Abgabefertig_2026-08-19.pdf` wurde im gesamten Repository **NICHT gefunden**. Entweder nie ins Repo eingecheckt oder unter anderem Pfad abgelegt.
- **Status: NICHT VORHANDEN (Platzhalter)**
- **Aktion:** Offizielle Gewerbeanmeldung / Empfangsbestätigung vom Gewerbeamt beschaffen. Die `SACHSTANDSANFRAGE_GEWERBEANMELDUNG.pdf` liegt als Entwurf vor — unklar ob abgeschickt.

### 05 — IK-Nummer Nachweis
- **Datei:** `05_IK_Nachweis.pdf` (1.178.748 Bytes, ~1,1 MB)
- **Inhalt:** Kein Text extrahierbar → gescanntes Bild-PDF.
- **Befund:** Dateigröße plausibel für ein echtes gescanntes Dokument (ARGE-IK-Bestätigung 460629986). Inhalt kann maschinell nicht verifiziert werden.
- **Status: NICHT VERIFIZIERT**
- **Aktion:** Manuell prüfen, ob es die echte IK-Bestätigung ist.

### 06 — Erweitertes Führungszeugnis
- **Datei:** `06_Fuehrungszeugnis.pdf` (1.584.846 Bytes, ~1,5 MB)
- **Inhalt:** Kein Text extrahierbar → gescanntes Bild-PDF.
- **Befund:** Dateigröße plausibel für einen Scan. Laut externer Angabe: Erweitertes FZ eingetroffen am 19.08.2026. Inhalt kann maschinell nicht verifiziert werden.
- **Status: NICHT VERIFIZIERT**
- **Hinweis:** Checkliste vermerkt „ORIGINAL beilegen!" — bei Einreichung als Papier-Original beifügen, nicht nur PDF.

### 07 — Haftpflichtversicherung
- **Datei:** `07_Haftpflichtversicherung.pdf` (18.289.599 Bytes, ~18 MB)
- **Inhalt:** Kein Text extrahierbar → gescanntes Bild-PDF. Sehr große Datei.
- **Befund:** Dateigröße plausibel für eine mehrseitige gescannte Versicherungspolice. Laut externer Angabe: Generali, 10 Mio EUR Deckung, kürzlich abgelegt. Inhalt kann maschinell nicht verifiziert werden.
- **Status: NICHT VERIFIZIERT**
- **Aktion:** Manuell prüfen: Ist es die Generali-Police? Deckungssumme? Laufzeit? Versicherungsnehmer korrekt?

### 08 — Leistungskonzept (Konzept zum Angebot)
- **Datei:** `08_Leistungskonzept.pdf` (20.053 Bytes)
- **Inhalt:** Vollständig generiertes Konzept gem. §45a SGB XI / PfluV. Textextrahierbar.
- **Befund:** Unterschriftzeile mit Linie vorhanden, leer.
- **Status: VORHANDEN ABER UNTERSCHRIFT FEHLT**
- **Aktion:** 1× Unterschrift Yusuf

### 09 — Qualitätssicherungskonzept
- **Datei:** `09_Qualitaetskonzept.pdf` (82.321 Bytes)
- **Inhalt:** Umfangreiches QS-Konzept. Textextrahierbar. Keine explizite Unterschriftzeile im Dokument gefunden.
- **Befund:** Checkliste vermerkt „Fertig". Kein leeres Unterschriftfeld erkennbar.
- **Status: VORHANDEN**

### 10 — Datenschutzkonzept
- **Datei:** `10_Datenschutzkonzept.pdf` (6.790 Bytes)
- **Inhalt:** Datenschutzkonzept gem. DSGVO. Textextrahierbar.
- **Befund:** Datum leer (`___.___.2026`). Unterschriftzeile leer.
- **Status: VORHANDEN ABER UNTERSCHRIFT FEHLT**
- **Aktion:** 1× Unterschrift Yusuf + Datum

### 11 — Schulungskonzept
- **Datei:** `11_Schulungskonzept.pdf` (10.125 Bytes)
- **Inhalt:** Schulungskonzept gem. §5 Abs. 3 / §7 PfluV. Textextrahierbar.
- **Befund:** ZWEI Unterschriftzeilen vorhanden, beide leer: Yusuf Ferhat Demir (GF) + Sabrina Martin (Fachkraft).
- **Status: VORHANDEN ABER UNTERSCHRIFT FEHLT**
- **Aktion:** 1× Unterschrift Yusuf + 1× Unterschrift Sabrina

### 12 — Organisationskonzept
- **Datei:** `12_Organisationskonzept.pdf` (48.064 Bytes)
- **Inhalt:** Organisationskonzept gem. §45a / PfluV. Textextrahierbar.
- **Befund:** Datum leer (`_______________`). Unterschriftzeile leer.
- **Status: VORHANDEN ABER UNTERSCHRIFT FEHLT**
- **Aktion:** 1× Unterschrift Yusuf + Datum

### 13 — Beschwerdemanagement
- **Datei:** `13_Beschwerdemanagement.pdf` (47.512 Bytes)
- **Inhalt:** Beschwerdemanagement-Konzept. Textextrahierbar.
- **Befund:** Datum leer. Unterschriftzeile leer.
- **Status: VORHANDEN ABER UNTERSCHRIFT FEHLT**
- **Aktion:** 1× Unterschrift Yusuf + Datum

### 14 — Notfallkonzept
- **Datei:** `14_Notfallkonzept.pdf` (47.832 Bytes)
- **Inhalt:** Notfallkonzept. Textextrahierbar.
- **Befund:** Datum leer. Unterschriftzeile leer.
- **Status: VORHANDEN ABER UNTERSCHRIFT FEHLT**
- **Aktion:** 1× Unterschrift Yusuf + Datum

### 15 — Leistungsnachweis / Preisübersicht (Muster)
- **Datei:** `15_Leistungsnachweis_Preise.pdf` (5.769 Bytes)
- **Inhalt:** Muster-Vorlage gem. §8 PfluV zur Vorlage vor Vertragsschluss. Kundenfelder bewusst leer (Blanko-Muster).
- **Befund:** Anbieter-Unterschriftzeile leer. Datum leer. (Kundenfelder sind als Blanko-Muster korrekt leer.)
- **Status: VORHANDEN ABER UNTERSCHRIFT FEHLT**
- **Aktion:** 1× Unterschrift Yusuf (Anbieterseite) + Datum

### 16 — Vertretungsregelung
- **Datei:** `16_Vertretungsregelung.pdf` (46.798 Bytes)
- **Inhalt:** Vertretungsregelung. Textextrahierbar.
- **Befund:** Datum leer. Unterschriftzeile leer.
- **Status: VORHANDEN ABER UNTERSCHRIFT FEHLT**
- **Aktion:** 1× Unterschrift Yusuf + Datum

### 17a — Berufserlaubnis Fachkraft (Sabrina Martin)
- **Datei:** `17a_Berufserlaubnis_Fachkraft.pdf` (640.749 Bytes, ~641 KB)
- **Inhalt:** Kein Text extrahierbar → gescanntes Bild-PDF.
- **Befund:** Dateigröße plausibel für gescannte Berufserlaubnis. Checkliste vermerkt „Vorhanden". Inhalt maschinell nicht prüfbar.
- **Status: VORHANDEN** (laut Checkliste; Scan nicht maschinell verifizierbar)

### 17b — Arbeitsvertrag Fachkraft (Sabrina Martin)
- **Datei:** `17b_Arbeitsvertrag_Fachkraft.pdf` (7.577 Bytes)
- **Inhalt:** Minijob-Arbeitsvertrag zwischen Alltagsengel UG und Sabrina Martin. Textextrahierbar.
- **Befund:** 4 inhaltliche Felder leer + 2 Unterschriften fehlen:
  1. **§1 Beginn:** `ab dem _____________` — LEER
  2. **§2 Stunden:** `_____________ Stunden pro Woche/Monat` — LEER
  3. **§3 Vergütung:** `_____________ Euro brutto` — LEER
  4. **§4 Urlaub:** `mindestens _____________ Arbeitstage pro Kalenderjahr` — LEER
  5. **Unterschrift AG:** Yusuf Ferhat Demir — LEER
  6. **Unterschrift AN:** Sabrina Martin — LEER
  7. **Adresse AN:** `[Adresse wird ergänzt]` — LEER
- **Status: VORHANDEN ABER UNTERSCHRIFT FEHLT**
- **Aktion:** 4 Felder ausfüllen (Beginn, Stunden, Vergütung, Urlaub) + Adresse + 1× Unterschrift Yusuf + 1× Unterschrift Sabrina

### 17c — Erklärung Führungszeugnisse
- **Datei:** `17c_Erklaerung_Fuehrungszeugnisse.pdf` (5.164 Bytes)
- **Inhalt:** Erklärung zur Vorlage polizeilicher FZ gem. §9 PfluV. Textextrahierbar.
- **Befund:** Unterschriftzeile leer.
- **Status: VORHANDEN ABER UNTERSCHRIFT FEHLT**
- **Aktion:** 1× Unterschrift Yusuf

### 17d — Erklärung SV / Mindestlohn
- **Datei:** `17d_Erklaerung_SV_Mindestlohn.pdf` (5.155 Bytes)
- **Inhalt:** Erklärung zur Einhaltung SV-Bestimmungen und Mindestlohn. Textextrahierbar.
- **Befund:** Unterschriftzeile leer.
- **Status: VORHANDEN ABER UNTERSCHRIFT FEHLT**
- **Aktion:** 1× Unterschrift Yusuf

### 17e — Schweigepflichterklaerung (Blanko-Vorlage)
- **Datei:** `17e_Schweigepflichterklaerung.pdf` (3.971 Bytes)
- **Inhalt:** Blanko-Vorlage für leistungserbringende Personen. Name/Vorname/Geburtsdatum bewusst leer.
- **Befund:** Dies ist eine Muster-Vorlage — die leeren Felder sind korrekt, da sie pro Helfer:in ausgefüllt wird.
- **Status: VORHANDEN** (Blanko-Vorlage, korrekt so)

### 17f — Einverständnis Veröffentlichung
- **Datei:** `17f_Einverstaendnis_Veroeffentlichung.pdf` (2.913 Bytes)
- **Inhalt:** Einverständniserklärung gem. §9 PfluV. Textextrahierbar.
- **Befund:** Datum leer (`___.___.2026`). Unterschriftzeile leer.
- **Status: VORHANDEN ABER UNTERSCHRIFT FEHLT**
- **Aktion:** 1× Unterschrift Yusuf + Datum

---

## Nicht zur Einreichung gehörende Dateien

| Datei | Zweck |
|---|---|
| `17_Checkliste.pdf` (46.881 B) | Interne Tracking-Checkliste, Stand 09.09.2026 |
| `SACHSTANDSANFRAGE_GEWERBEANMELDUNG.pdf` (45.885 B) | Entwurf einer Sachstandsanfrage ans Gewerbeamt — unklar ob abgeschickt |
| `GENEHMIGUNGS_STATUS_09_09_2026.pdf` (51.195 B) | Vorheriger Statusbericht |
| `GENEHMIGUNGS_STATUS_09_09_2026_V2.md` | Dieses Dokument |

---

## Zusammenfassung: Fehlende Unterschriften

### Yusuf Ferhat Demir (Geschäftsführer) — 12 Unterschriften fehlen:

| Nr. | Dokument |
|---|---|
| 1 | 01_Anschreiben |
| 2 | 02_Erhebungsbogen |
| 3 | 08_Leistungskonzept |
| 4 | 10_Datenschutzkonzept |
| 5 | 11_Schulungskonzept |
| 6 | 12_Organisationskonzept |
| 7 | 13_Beschwerdemanagement |
| 8 | 14_Notfallkonzept |
| 9 | 15_Leistungsnachweis_Preise |
| 10 | 16_Vertretungsregelung |
| 11 | 17b_Arbeitsvertrag_Fachkraft |
| 12 | 17c_Erklaerung_Fuehrungszeugnisse |
| 13 | 17d_Erklaerung_SV_Mindestlohn |
| 14 | 17f_Einverstaendnis_Veroeffentlichung |

**Hinweis:** Das sind 14 Unterschriftfelder für Yusuf, nicht 10. Möglicherweise wurden bei einer früheren Zählung einige Dokumente zusammengefasst oder das QS-Konzept (09) mitgezählt, das tatsächlich keine Unterschriftzeile hat.

### Sabrina Martin (Fachkraft) — 2 Unterschriften fehlen:

| Nr. | Dokument |
|---|---|
| 1 | 11_Schulungskonzept (als Fachkraft) |
| 2 | 17b_Arbeitsvertrag_Fachkraft (als Arbeitnehmerin) |

---

## Zusammenfassung: Fehlende Felder im Arbeitsvertrag (17b)

| Feld | Paragraph | Aktueller Wert |
|---|---|---|
| Beschäftigungsbeginn | §1 Abs. 1 | `_____________` (leer) |
| Wöchentliche/monatliche Stunden | §2 Abs. 1 | `_____________` (leer) |
| Monatliche Bruttovergütung | §3 Abs. 1 | `_____________` (leer) |
| Urlaubstage pro Kalenderjahr | §4 Abs. 1 | `_____________` (leer) |

Zusätzlich fehlt: Adresse der Arbeitnehmerin (`[Adresse wird ergänzt]`).

---

## Zusammenfassung: Weitere offene Felder

| Dokument | Feld | Aktueller Wert |
|---|---|---|
| 02_Erhebungsbogen | Steuernummer | `(noch einzutragen)` |
| 01_Anschreiben | Datum | `___.___.2026` |
| 02_Erhebungsbogen | Datum | `___.___.2026` |

---

## Kritische Blocker

1. **04_Gewerbeanmeldung: NICHT VORHANDEN.** Die Datei ist ein expliziter Platzhalter. Eine `GewA1_Alltagsengel_UG_Abgabefertig_2026-08-19.pdf` wurde im gesamten Repository nicht gefunden. Ohne offizielle Gewerbeanmeldung / Empfangsbestätigung ist die Mappe unvollständig.

2. **14 Unterschriften fehlen** (12× Yusuf, 2× Sabrina). Kein einziges der selbst erstellten Dokumente ist unterschrieben.

3. **Arbeitsvertrag (17b) ist inhaltlich unvollständig** — 4 wesentliche Vertragsbestandteile (Beginn, Stunden, Vergütung, Urlaub) + Adresse fehlen. Ohne diese Angaben ist der Vertrag nicht wirksam.

4. **3 gescannte Dokumente (05, 06, 07) konnten maschinell nicht verifiziert werden.** Manuelle Sichtprüfung erforderlich.

5. **Steuernummer fehlt** im Erhebungsbogen.

6. **Frist 31.08.2026 ist abgelaufen** (laut Checkliste).
