# §45a Hessen — Frist, Primärquelle und Telefonleitfaden

**Stand:** 13.09.2026 · **Nichts versendet, nicht angerufen.**
Jede Aussage ist markiert: `DOCUMENT_VERIFIED` · `VERIFIED_LIVE` · `INFERRED` · `UNKNOWN`

---

## 1. Die Primärquelle, exakt gelesen

Es gibt genau **ein** Behördendokument im Haus:
`anerkennung-hessen/Rueckmeldung-Behoerde-2026-07-08.docx`

| Angabe | Wert | Status |
|---|---|---|
| Absender | Der Magistrat, Rathaus für Senioren, Leitstelle Älterwerden, Amt 51 | `DOCUMENT_VERIFIED` |
| Dienstgebäude | Hansaallee 150, 60320 Frankfurt am Main | `DOCUMENT_VERIFIED` |
| Sachbearbeitung | Frau Krause, Zimmer 1.03, **069 212-33607**, Fax 212-30741 | `DOCUMENT_VERIFIED` |
| E-Mail | `entlastungsangebote45@stadt-frankfurt.de` | `DOCUMENT_VERIFIED` |
| **Aktenzeichen** | **51.D24.12** | `DOCUMENT_VERIFIED` |
| **Dokumentdatum** | **08.07.2026, 07:03 UTC** (DOCX-Metadaten `dcterms:created`) | `DOCUMENT_VERIFIED` |
| Zuletzt bearbeitet von | „Krause, Davina" (Metadatum `cp:lastModifiedBy`) | `DOCUMENT_VERIFIED` |
| Bezugsdatum unserer Einreichung | 15.12.2025 | `DOCUMENT_VERIFIED` |
| **ORIGINALFRIST** | **31.08.2026** | `DOCUMENT_VERIFIED` |

**Wortlaut der Fristsetzung:**

> „Zum Nach-/Einreichen oben angezeigter Bedarfe setzen wir Ihnen eine Frist bis zum
> 31.08.2026. Sollten sie dieser Frist kommentarlos nicht nachkommen, kann/wird Ihr
> Antrag abgelehnt werden."

**Zur Lesbarkeit:** Word zerlegt Zahlen in einzelne Textläufe. Ein Parser, der
Tag-Grenzen durch Leerzeichen ersetzt, liest „3 1. 08 .202 6" und findet kein Datum —
mein erster Lauf meldete deshalb „Frist nicht gefunden". Erst das Zusammenziehen der
Läufe ergibt `31.08.2026`. Beide Lesarten sind oben gegengeprüft.

## 2. Verlängerung — der Status ist UNKNOWN, nicht „bewilligt" und nicht „abgelaufen"

| Frage | Antwort | Status |
|---|---|---|
| **VERLÄNGERUNG_BEANTRAGT?** | Ein Entwurf existiert: `docs/emails/01-fristverlaengerung-frankfurt.md`, bittet um Nachfrist bis **10.10.2026** | `DOCUMENT_VERIFIED` (der Entwurf) |
| **VERLÄNGERUNG_TATSÄCHLICH_VERSENDET?** | **UNKNOWN** | `UNKNOWN` |
| **VERLÄNGERUNG_BEWILLIGT?** | **UNKNOWN** | `UNKNOWN` |
| **AKTUELLER_STATUS des Verfahrens** | **UNKNOWN** | `UNKNOWN` |

### Warum „versendet" nur INFERRED wäre

Ein zweiter Entwurf — `docs/emails/03-nachfassmail-frau-krause.md` — schreibt:

> „vielen Dank für das freundliche **Telefonat** in der vergangenen Woche … Wir möchten
> uns hiermit kurz auf **unsere E-Mail** bezüglich der beantragten Fristverlängerung bis
> zum 10.10.2026 zurückmelden. Da wir bislang noch **keine schriftliche Bestätigung** der
> verlängerten Frist erhalten haben …"

Das legt dreierlei nahe: die Bitte ging per E-Mail hinaus, es gab ein Telefonat mit
positiver Rückmeldung, und eine **schriftliche** Bestätigung fehlte zum Zeitpunkt des
Entwurfs. Aber: **auch das ist ein Entwurf in unserem eigenen Repository**, kein
Versandbeleg und keine Behördenantwort. Ein Text, der behauptet, eine E-Mail sei
geschrieben worden, beweist nicht, dass sie abging.

**Deshalb: `INFERRED`, nicht `DOCUMENT_VERIFIED`.**

### Korrektur meiner eigenen Aussage vom 12.09.2026

Ich habe geschrieben: „**Die Frist war der 31.08.2026. Sie ist seit zwölf Tagen
verstrichen.**" Der erste Satz ist belegt. Der zweite ist eine **Folgerung**, die mehr
behauptet als die Quellenlage hergibt:

* Ein Telefonat mit „positiver Rückmeldung" ist im eigenen Entwurf erwähnt.
* Eine mündliche Fristverlängerung ist im Verwaltungsverfahren wirksam — sie braucht
  keine Schriftform, nur einen Nachweis.
* Ob die Behörde den Antrag zwischenzeitlich beschieden, verlängert oder ruhen gelassen
  hat, steht in **keinem** Dokument, das wir haben.

**Richtig ist:** Die dokumentierte Frist lief am 31.08.2026 ab. Ob sie noch gilt,
verlängert wurde oder das Verfahren einen anderen Stand hat, ist **UNKNOWN** — und nur
durch Rückfrage bei der Behörde zu klären. „Abgelaufen" als Tatsache zu führen war ein
Schritt zu weit.

## 3. Was die Behörde nachgefordert hat

Sieben Punkte, in der Reihenfolge des Schreibens — alle `DOCUMENT_VERIFIED`:

| # | Nachforderung | Wortlaut-Detail |
|---|---|---|
| 1 | erweiterte Führungszeugnisse | „müssen uns **zusätzlich als Original** übermittelt werden" |
| 2 | Gewerbeanmeldung | „noch fehlend" |
| 3 | ARGE-Bestätigung (IK-Nummer) | „noch fehlend" |
| 4 | Konzept | „noch fehlend" |
| 5 | Versicherungsnachweis + Police | „mindestens betriebliche Haftpflicht" |
| 6 | Kosten-/Leistungsübersicht nach § 8 PfluV | „noch fehlend" |
| 7 | Erhebungsbogen | „muss auch **im Original mit rechtsverbindlicher Unterschrift** eingereicht werden" |

Beigelegte Anlagen laut Schreiben: Pflegeunterstützungsverordnung · Verlängerung der
PfluV · Erhebungsbogen Anbieterform II · Konzeptstruktur.

## 4. KORREKTUR: Der Erhebungsbogen ist NICHT verschwunden

Mein Bericht vom 12.09.2026 führte ihn als **MISSING**. Das war falsch.

`~/Downloads/A2 Anbieter II - Erhebungsbogen Stand 082024.docx` — `DOCUMENT_VERIFIED`:

| Merkmal | Befund |
|---|---|
| Titel im Text | „Erläuterungen zum Erhebungsbogen über die Anerkennung von Angeboten zur Unterstützung im Alltag … § 45a Abs. 1 SGB XI, **Anbieterform II**" |
| Erstellt | 26.08.2024, Autorin „Erbeck, Katharina" |
| Struktur | **14 Tabellen, 41 Formularfelder (SDT), 41 Kontrollkästchen** |
| Schluss | „______ Datum, **rechtsverbindliche Unterschrift** Antragstellenden" + amtliche Checkliste |
| Auf dem Rechner seit | 17.07.2026 |

Es ist der **vollständige amtliche Bogen**, nicht nur die Erläuterungen. Er lag die ganze
Zeit da — unter einem Namen, nach dem niemand gesucht hat.

**Was tatsächlich defekt ist:** die Repo-Datei
`anerkennung-hessen/Erhebungsbogen-Anbieterform-II-Frankfurt.pdf` — 5.824 Bytes, beginnt
mit `<!DOC`, eine gespeicherte Cloudflare-Sperrseite. Ein fehlgeschlagener Download, der
neben dem funktionierenden Original liegt.

**Statuswechsel: MISSING → `DOCUMENT_VERIFIED` (vorhanden, unausgefüllt).**

### Die amtliche Checkliste am Ende des Bogens

| Erforderliche Unterlage | Im Haus? |
|---|---|
| Erhebungsbogen | ja, unausgefüllt |
| Konzept zum Angebot | ja (`Anlage-05`) |
| Nachweis über angemessenen Versicherungsschutz | ja (`Anlage-15`), Versicherungsnehmer zu korrigieren |
| Vordruck Leistungs- und Kostenübersicht | ja (`Anlage-07`), Preisentscheidung offen |
| Schulungskonzept Leistungserbringer | ja (`Anlage-06`) |
| Qualifikation und Beschäftigungsumfang der Fachkraft | Urkunde ja, Arbeitsvertrag mit **leeren Feldern** |

---

## 5. Telefonleitfaden — Frau Krause, 069 212-33607

**Vorbereitung:** Aktenzeichen **51.D24.12** · Schreiben vom 08.07.2026 · IK 460629986 ·
HRB 140351. Sachlich bleiben, nichts beschönigen, nichts zusagen, was nicht steht.

**Einstieg**

> „Guten Tag Frau Krause, Alltagsengel UG aus Frankfurt, Aktenzeichen 51.D24.12.
> Es geht um unseren Antrag auf Anerkennung nach § 45a. Ich möchte den Sachstand klären
> und hätte vier Fragen."

**Die vier Fragen — in dieser Reihenfolge**

| # | Frage | Warum diese Reihenfolge |
|---|---|---|
| 1 | „Ist unser Verfahren noch offen, oder wurde es zwischenzeitlich beschieden?" | Alles Weitere hängt daran. Wenn abgelehnt, ist die Frage nach Unterlagen gegenstandslos. |
| 2 | „Welche Unterlagen fehlen aus Ihrer Sicht aktuell noch?" | Unsere Liste ist vom 08.07. Seitdem kann sich etwas geändert haben — in beide Richtungen. |
| 3 | „Welche Frist gilt jetzt? In unseren Unterlagen steht der 31.08.2026; wir hatten um Verlängerung bis 10.10.2026 gebeten." | Offen benennen, was wir wissen und was nicht. Keine Verlängerung behaupten. |
| 4 | „Können wir die fehlenden Unterlagen noch nachreichen — und in welcher Form, digital oder im Original?" | Die Behörde hat bei zwei Dokumenten ausdrücklich das **Original** verlangt. |

**Zusatzfragen, falls Zeit bleibt**

* „Gilt die PfluV in der verlängerten Fassung bis 31.12.2026 unverändert, oder ist die
  angekündigte Neufassung inzwischen in Kraft?" — betrifft die Entgeltgrenzen, siehe
  `PRICE_SOURCE_OF_TRUTH_LATEST.md`
* „Die Gewerbeanmeldung ist online eingereicht, eine Bestätigung steht aus. Reicht
  Ihnen zunächst ein Nachweis der Einreichung?"
* „Können Sie uns die aktuelle Frist kurz schriftlich bestätigen?" — genau das fehlt.

**Nach dem Gespräch festhalten:** Datum, Uhrzeit, Gesprächspartnerin, jede Aussage
wörtlich, und die genannte Frist. Dieses Protokoll ist danach die Primärquelle, die
heute fehlt.

**Was im Gespräch NICHT gesagt werden darf**

* nicht behaupten, die Verlängerung sei bewilligt
* nicht sagen, „es fehlt nur noch die Gewerbeanmeldung" — die Behörde hat sieben Punkte
  genannt (der vorbereitete E-Mail-Entwurf enthält genau diesen Satz und sollte vor
  einem Versand korrigiert werden)
* keine Anerkennung in anderen Bundesländern behaupten — es gibt keine

---

## 6. Statusübersicht

| Aussage | Status |
|---|---|
| Aktenzeichen 51.D24.12 | `DOCUMENT_VERIFIED` |
| Behördenschreiben vom 08.07.2026, Frau Krause | `DOCUMENT_VERIFIED` |
| Originalfrist 31.08.2026 | `DOCUMENT_VERIFIED` |
| Sieben Nachforderungen | `DOCUMENT_VERIFIED` |
| Amtlicher Erhebungsbogen vorhanden (`~/Downloads`) | `DOCUMENT_VERIFIED` |
| Repo-Datei `Erhebungsbogen-…-Frankfurt.pdf` ist eine Cloudflare-Seite | `VERIFIED_LOCAL` |
| Verlängerung beantragt (Entwurf existiert) | `DOCUMENT_VERIFIED` |
| Verlängerung versendet | `INFERRED` (aus dem Nachfass-Entwurf) |
| Telefonat mit positiver Rückmeldung | `INFERRED` (aus dem Nachfass-Entwurf) |
| Verlängerung bewilligt | **`UNKNOWN`** |
| Aktueller Verfahrensstand | **`UNKNOWN`** |
| „Frist abgelaufen" als Tatsache | **zurückgezogen** — siehe Abschnitt 2 |
