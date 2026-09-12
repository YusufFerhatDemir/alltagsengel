# Preise — Source of Truth

**Stand:** 12.09.2026, alle DB-Werte live abgefragt · **kein Preis geändert.**
Architektur-Wegweiser: `lib/pricing/quelle.ts` · Riegel: `__tests__/pricing/verbraucherpreise.test.ts`

---

## 0. Korrektur meiner eigenen früheren Darstellung

Ein früherer Bericht nannte „**35 € vs. 40 €**" als *den* kritischen Widerspruch.
**Das war falsch.** Live nachgesehen sind es zwei Rechtsgrundlagen, die beide gelten:

| Betrag | Rechtsgrundlage | `tarif_status` |
|---|---|---|
| **35,00 €/Std** | § 45b / § 39 SGB XI (Kasse) | **blocked** |
| **40,00 €/Std** | privat (Selbstzahler) | **verified** |

Die Kassentarife sind gesperrt, weil die § 45a-Anerkennung fehlt. Die Privattarife sind
frei. Beide Zahlen sind gleichzeitig richtig — das ist ein Zwei-Spuren-Modell, kein Fehler.
Dasselbe gilt in `service_pricing`: die drei „gleichzeitig aktiven" Zeilen für
`alltagsbegleitung` unterscheiden sich im `budget_type` (entlastung 35, verhinderung 35,
private 40), nicht im Widerspruch.

**Der echte Konflikt liegt woanders — siehe Abschnitt 3.**

---

## 1. Die fünf Quellen, nach Besitzer

| # | Quelle | Was sie besitzt | Ändern heißt |
|---|---|---|---|
| 1 | `lib/pricing/b2c-constants.ts` | B2C-Marktplatz: Kundenpreis, Engel-Vergütung, Plattformgebühr | deployen |
| 2 | `lib/config/budget-constants.ts` | gesetzliche Budgets (§ 45b, § 39, § 42, § 40) | deployen |
| 3 | `service_pricing` (DB) | Stundensatz je `service_type` × `budget_type` | DB-Zeile |
| 4 | `billing_tariffs` (DB) | Abrechnungstarif je Leistungsart × Rechtsgrundlage, mit `tarif_status` | DB-Zeile |
| 5 | `billing_gesetzliche_obergrenzen` (DB) | PfluV-Deckel Hessen, `bestaetigt` | DB-Zeile |
| (6) | `leistungspreise` (DB) | Altbestand, **durchgehend `unverified`** | sollte verschwinden |

`lib/pricing/quelle.ts` ist ab jetzt der **eine Einstieg**: die Code-Preise stehen dort
gebündelt (als Spiegel der Konstanten, nicht als Kopie — ein Test prüft das), und für die
DB-Preise steht dort, welche Tabelle sie besitzt. Wer einen Preis sucht, braucht eine
Datei statt fünf.

## 2. Matrix

| Quelle | Preis | Kontext | Live? | Verbraucher? | Muss angepasst? | Source of Truth? |
|---|---|---|---|---|---|---|
| `b2c-constants.ts` | **32 €/Std** | Kundenpreis Marktplatz (brutto) | ja | **ja** | nein | **ja** (Code) |
| `b2c-constants.ts` | **20 €/Std** | Engel-Vergütung | ja | **ja** | nein | **ja** (Code) |
| `b2c-constants.ts` | 8,5 % | Plattformgebühr | ja | nein | nein | ja |
| `b2c-constants.ts` | 35 €/Std | Rückfall der App ohne `service_pricing` | ja | nein | **prüfen** — liegt über dem PfluV-Deckel | nein |
| `budget-constants.ts` | **131 €/Monat** | Entlastungsbetrag § 45b | ja | **ja** | nein | **ja** (Gesetz) |
| `budget-constants.ts` | 1.685 / 1.854 / 3.539 €/Jahr | § 39 / § 42 / § 42a | ja | ja | nein | ja (Gesetz) |
| `budget-constants.ts` | 42 €/Monat | § 40 Pflegehilfsmittel | ja | ja | nein | ja (Gesetz) |
| `service_pricing` | 35 / 35 / 40 €/Std | alltagsbegleitung je budget_type | ja | ja | nein | **ja** (DB) |
| `service_pricing` | 35 / 38 €/Std | hauswirtschaft | ja | ja | nein | ja |
| `billing_tariffs` | 40 € (privat) · 38 € (hausw.) · 45 € (nacht) · 5 €/Einsatz (Wege) | **verified** | ja | nein | nein | **ja** |
| `billing_tariffs` | 35 € (§ 45b / § 39) | **blocked** | nein | nein | **JA** — über dem Deckel | ja |
| `billing_gesetzliche_obergrenzen` | **30 €** Betreuung · **25 €** Entlastung | PfluV Hessen, `bestaetigt` | ja | nein | nein | **ja** (Verordnung) |
| `leistungspreise` | 12,05–40,97 €, dazu 131,00 € als „entlastung_45b" | Altbestand | `unverified` | nein | **JA** | **nein** |
| `app/faq/page.tsx` | „15 und 25 €/Std" | eigene Vergütungszusage | **ja** | **ja** | **JA** | nein |
| `app/blog/nebenjob-pflege` | „18–22 €/Std" | in der **Meta-Description** | **ja** | **ja** | **JA** | nein |
| `app/blog/alltagsbegleiter-werden` | „18–24 €/Std" | Meta-Description | **ja** | **ja** | **JA** | nein |
| `anerkennung-hessen/Anlage-07` | 30,00 €/Std | Kostenübersicht **für die Behörde** | — | ja | **JA** | nein |
| vier `app/investor/**`-Seiten | ~40 €/Std, ~20 €/h Marge | Investorenprojektion gegen `lib/mis/constants.ts` (35 / 15) | ja | nein | **JA** | nein |

## 3. Der echte Konflikt — strukturell sicher, nicht zufällig

> **Die gesperrten Kassentarife stehen auf 35,00 €. Der bestätigte PfluV-Deckel liegt bei
> 30,00 € (Betreuungsangebot) und 25,00 € (Entlastungsangebot).**

Am Tag der § 45a-Anerkennung werden die Tarife freigeschaltet — und sind dann 5 bis 10 Euro
zu hoch. Nicht aus Versehen, sondern weil niemand sie vorher angepasst hat. Eine Leistung
über dem Deckel ist **nicht abrechenbar**.

Es gibt zwei Riegel (DB-Trigger `enforce_tariff_obergrenze`, Modul
`lib/billing/obergrenzen.ts`), die das im Moment der Abrechnung abfangen. Sie verhindern
den Schaden, lösen aber nicht die Ursache: dann steht die Leistung erbracht und nicht
abrechenbar da.

**Dazu passend:** `NATIVE_FALLBACK_HOURLY_RATE = 35` in `b2c-constants.ts` — der Wert, den
die App nimmt, wenn `service_pricing` nichts liefert. Liegt ebenfalls über dem Deckel.

## 4. Verbrauchergerichtete Widersprüche

Drei **live ausgelieferte** Aussagen über unsere eigene Vergütung, drei verschiedene
Spannen, keine davon 20 €:

| Stelle | Aussage | Besonderheit |
|---|---|---|
| `app/faq/page.tsx` | „Die Vergütung liegt zwischen **15 und 25 €** pro Stunde" | eigene Zusage |
| `app/blog/nebenjob-pflege/page.tsx` | „**18–22 €** pro Stunde … bei Alltagsengel als Helfer starten" | steht in der **Meta-Description**, also im Suchergebnis |
| `app/blog/alltagsbegleiter-werden/page.tsx` | „Gehalt von **18–24 €**/Stunde" | Meta-Description |

**Ausdrücklich kein Widerspruch:** Im Fließtext von `alltagsbegleiter-werden` stehen
Marktangaben zu *anderen* Anbietern (14–18 € angestellt, 15–25 € privat organisiert). Das
sind Aussagen über den Markt, nicht über unser Angebot, und sie sind zulässig. Ein Prüfer,
der solche Sätze anmahnt, wird nach dem dritten Fehlalarm abgeschaltet — deshalb
unterscheidet der Riegel danach, ob eine Selbstbezeichnung in der Nähe steht.

## 5. Was gebaut wurde — und was ausdrücklich nicht

**Gebaut:**
* `lib/pricing/quelle.ts` — ein Einstieg, Besitzer je Preisart, Wegweiser statt Kopie
* `__tests__/pricing/verbraucherpreise.test.ts` — 10 Fälle. Der Bestand der drei
  Abweichungen ist **eingefroren und begründet**; eine **vierte** macht den Lauf rot.
  Mit Detektor in beide Richtungen: eine erfundene Eigenaussage fällt auf, eine reine
  Marktangabe nicht.

**Nicht getan:** kein Preis geändert, keine Entscheidung getroffen. Der Riegel macht die
Divergenz zählbar, ohne sie zu beseitigen — das ist genau die Grenze, die der Auftrag zieht.

Beim Bau ist mir das Muster einmal um die Ohren geflogen: Es verlangte „bis" oder „–"
zwischen den Zahlen, die FAQ schreibt aber „zwischen 15 **und** 25 €". Zwei von drei
bekannten Stellen wurden gefunden, die dritte nicht — aufgefallen nur, weil ein zweiter
Test den Bestand gegenzählt. Ein Prüfer, der seinen eigenen Katalog nicht wiederfindet,
ist die unauffälligste Art, falsche Sicherheit zu erzeugen.

## 6. BUSINESS_DECISION_REQUIRED

| # | Entscheidung | Dringlichkeit |
|---|---|---|
| 1 | **Kassentarife auf ≤ 30 / 25 €** anpassen | **vor** der Anerkennung — sonst nicht abrechenbar |
| 2 | **Eine Vergütungsaussage** festlegen (20 €, oder eine Spanne, dann überall dieselbe) | hoch — drei Varianten live, zwei im Suchergebnis |
| 3 | **30,00 €/Std in Anlage-07** | hoch — geht mit dem Antrag an die Behörde |
| 4 | Investorenseiten: 35 oder 40 €/h | mittel — zeigt nach außen |
| 5 | `NATIVE_FALLBACK_HOURLY_RATE` auf einen Wert unter dem Deckel | mittel |
| 6 | `leistungspreise` stilllegen oder verifizieren | niedrig — heute nirgends führend |

---

## 7. NACHTRAG 13.09.2026 — die 30/25 € sind jetzt aus der Rechtsquelle belegt

Bis gestern stand „PfluV-Deckel 30/25 €" nur auf der DB-Tabelle
`billing_gesetzliche_obergrenzen`. Das ist eine Behauptung über Recht, keine Rechtsquelle.
Jetzt im Verordnungstext nachgelesen.

### Wortlaut — `DOCUMENT_VERIFIED`

**PfluV Hessen, § 1 Abs. 1 Nr. 12** (Anerkennungsvoraussetzungen):

> „Entgelte, soweit diese erhoben werden, **einschließlich etwaiger Umsatzsteuer**,
> a) für Angebote zur Unterstützung im Alltag nach § 45a Abs. 1 Satz 2 **Nr. 1 und 2**
> des Elften Buches Sozialgesetzbuch nicht höher liegen als **30 Euro je Stunde** oder
> b) für Angebote zur Unterstützung im Alltag nach § 45a Abs. 1 Satz 2 **Nr. 3** des
> Elften Buches Sozialgesetzbuch nicht höher liegen als **25 Euro je Stunde**;
> **zum Entgelt zählen alle Nebenkosten mit Ausnahme angemessener Fahrtkosten**"

Quelle: `~/Downloads/PfluV Hessen 2023.pdf`, Fundstelle **GVBl. 2018, 75**,
Gliederungs-Nr. 93-47, Ausfertigung 25.04.2018.

### Drei Feinheiten, die in der DB-Tabelle nicht stehen

| Feinheit | Folge |
|---|---|
| **„einschließlich etwaiger Umsatzsteuer"** | Die Grenze ist ein **Brutto**betrag. Ein Nettopreis von 30 € liegt darüber. |
| **„alle Nebenkosten … mit Ausnahme angemessener Fahrtkosten"** | Zuschläge zählen mit. Die `wegepauschale` (5 €/Einsatz) fällt als Fahrtkosten vermutlich heraus — Wochenend-, Feiertags- und Nachtzuschläge in `billing_tariffs` aber **nicht**. |
| **Es ist eine Anerkennungs-VORAUSSETZUNG (§ 1), kein Abrechnungsdeckel** | Ein Überschreiten gefährdet die **Anerkennung selbst**, nicht nur die Abrechenbarkeit einer Rechnung. |

Der dritte Punkt verschiebt das Gewicht: Ich hatte geschrieben, die Tarife wären „am Tag
der Anerkennung 5 bis 10 Euro zu hoch". Genauer ist: **Entgelte über der Grenze stehen
der Anerkennung entgegen.** Die Frage kommt also vor dem Bescheid, nicht danach.

### Geltungsdauer — die Kette, lückenlos

| Schritt | Beleg | Status |
|---|---|---|
| Ausfertigung 25.04.2018 | GVBl. 2018, 75 | `DOCUMENT_VERIFIED` |
| Fassung im Haus gilt 01.10.2022 – **31.12.2024** | Kopfzeile des PDF | `DOCUMENT_VERIFIED` |
| zuletzt geändert durch VO vom **10.12.2024** (GVBl. 2024 Nr. 78) | Ministerialschreiben | `DOCUMENT_VERIFIED` |
| lief am **31.12.2025** aus | dasselbe Schreiben | `DOCUMENT_VERIFIED` |
| **um ein Jahr verlängert** (Siebzehnte VO zur Verlängerung der Geltungsdauer) → gültig bis **31.12.2026** | dasselbe Schreiben | `DOCUMENT_VERIFIED` |
| Neufassung angestrebt „innerhalb der ersten Jahreshälfte 2026" | dasselbe Schreiben | `DOCUMENT_VERIFIED` |

Quelle der Verlängerung: **Hessisches Ministerium für Familie, Senioren, Sport,
Gesundheit und Pflege**, AZ 18w4000-0002/2016/026, Datum **17.11.2025**, Bearbeiterin
Frau Rebecca Heinemann, gezeichnet **Ute Stettner**, Leiterin der Abteilung Pflege und
Öffentliche Gesundheit — mit Tintenunterschrift. Visuell gelesen am 13.09.2026.

### Der Vorbehalt, der bleiben muss — `UNKNOWN`

Zwei Dinge sind **nicht** belegt:

1. Unsere Textfassung ist die konsolidierte Ausgabe **bis 31.12.2024**. Ob die Änderung
   vom **10.12.2024** die Beträge in Nr. 12 angetastet hat, steht dort nicht drin.
2. Die für die erste Jahreshälfte 2026 angekündigte **Neufassung** — heute ist September
   2026. Ob sie in Kraft ist, wissen wir nicht.

**Deshalb:** Die 30/25 € sind als geltendes Recht `DOCUMENT_VERIFIED` für die Fassung,
die wir haben. Ob sie **heute noch in dieser Höhe** gelten, ist `UNKNOWN`. Das gehört in
das Telefonat mit der Behörde (Frage 5 im Leitfaden) oder in einen Blick ins aktuelle
GVBl.

### Matrix je Betrag

| Betrag | Bedeutung | Quelle | Bundesland | Rechtsgrundlage | Gültig ab | Gültig bis | Status |
|---|---|---|---|---|---|---|---|
| **30,00 €/Std** | Höchstentgelt Betreuungsangebot, **brutto inkl. USt** | PfluV § 1 Abs. 1 Nr. 12 a | Hessen | § 45a Abs. 1 S. 2 Nr. 1+2 SGB XI | 09.05.2018 | 31.12.2026 (verlängert) | `DOCUMENT_VERIFIED` mit Vorbehalt |
| **25,00 €/Std** | Höchstentgelt Entlastungsangebot, **brutto inkl. USt** | PfluV § 1 Abs. 1 Nr. 12 b | Hessen | § 45a Abs. 1 S. 2 Nr. 3 SGB XI | 09.05.2018 | 31.12.2026 (verlängert) | `DOCUMENT_VERIFIED` mit Vorbehalt |
| 40,00 €/Std | Privatpreis Selbstzahler | `billing_tariffs`, `tarif_status=verified` | — | Vertragsfreiheit | — | — | `VERIFIED_LIVE` |
| 35,00 €/Std | Kassentarif, **gesperrt** | `billing_tariffs`, `tarif_status=blocked` | — | § 45b / § 39 SGB XI | — | — | `VERIFIED_LIVE` |
| 32,00 €/Std | Kundenpreis B2C-Marktplatz | `lib/pricing/b2c-constants.ts` | — | Vertragsfreiheit | — | — | `VERIFIED_LOCAL` |
| 20,00 €/Std | Engel-Vergütung | dieselbe Datei | — | Arbeitsvertrag | — | — | `VERIFIED_LOCAL` |
| 131,00 €/Monat | Entlastungsbetrag | `lib/config/budget-constants.ts` | bundesweit | § 45b SGB XI | 01.01.2025 | — | `VERIFIED_LOCAL` |

### Privatpreis und Kassenlogik — sauber getrennt

| | Privat (Selbstzahler) | Kasse (§ 45b / § 39) |
|---|---|---|
| Preis | **40 €/Std** (38 Hauswirtschaft, 45 Nacht) | **35 €/Std** |
| Status | `verified`, aktiv | `blocked`, gesperrt |
| PfluV-Grenze anwendbar? | **Nein** — § 1 PfluV regelt Anerkennungsvoraussetzungen für Angebote nach § 45a. Wer ohne Anerkennung privat abrechnet, unterliegt der Vertragsfreiheit. | **Ja** — 30 bzw. 25 € brutto |
| Handlungsbedarf | keiner | **Anpassung vor der Anerkennung** |

Ein wichtiger Vorbehalt zur linken Spalte: Sobald die Anerkennung vorliegt, ist zu prüfen,
ob die Entgeltgrenze **auch für Privatzahler desselben anerkannten Angebots** gilt. Der
Wortlaut („Entgelte, soweit diese erhoben werden") unterscheidet nicht nach Zahler. Das
ist eine juristische Frage, keine technische — `UNKNOWN`, gehört geklärt, bevor 40 €
neben einer Anerkennung stehen.
