# ATS — Einstufung der 36 Bewerbungen

**Stand:** 12.09.2026, live aus `lead_inquiries` · Skript: `scripts/ats-einstufung-live.ts`
**Niemand wurde angeschrieben.** Reiner Lesevorgang.
**Regel:** Was nicht in den Daten steht, ist **UNKNOWN** — nicht geschätzt.

---

## 1. Ergebnis

| Stufe | Anzahl |
|---|---|
| **PRIO1** | **5** |
| PRIO2 | 29 |
| PRIO3 | 1 |
| NEEDS_INFO | 1 |
| BLOCKED | 0 |
| **Summe** | **36** |

BLOCKED bleibt leer: **jede** Bewerbung hat mindestens einen Kontaktweg.

### PRIO1 — fachlich tragende Qualifikation

| Wartet | Name | PLZ | Qualifikation | Belegt | Kontakt |
|---|---|---|---|---|---|
| 26 T | Francesca Lorena Potočan | 63457 | Betreuungskraft (§ 53b) | 5/16 | Telefon |
| 25 T | michelle Gruber | 55124 | Pflegehelfer/in | 5/16 | Telefon |
| 10 T | **Claudia Adjovi** | 63739 | Pflegehelfer/in, **8 Jahre** im Freitext | 6/16 | Telefon |
| 7 T | Sotiris Tiropoulos | 60326 | Alltagsbegleiter/in (§ 45b) | 5/16 | Telefon |
| 2 T | **Ziyana Filote** | 63743 | Pflegefachkraft | **11/16** | Telefon + **E-Mail** |

Ziyana Filote ist der Beleg, dass das neue Formular wirkt: 11 von 16 Merkmalen belegt,
inklusive E-Mail — gegen 5/16 beim Altbestand.

### PRIO2 — 29 Bewerbungen

Zwei Untergruppen, beide aus vorhandenen Daten ableitbar:
* **Quereinstieg ausdrücklich angegeben** (Formularwert „Keine Erfahrung") — 14
* **Angabe „Sonstige"** — fachlich nicht eindeutig tragend, Telefonat entscheidet — 15

Die ältesten: Jasmin Zubrod (58 T), Inka Ines Bischof (58 T), Akif Aydin (57 T),
Julia Jaspert (56 T), Saba Haile (56 T).

### PRIO3 / NEEDS_INFO

| Stufe | Name | Grund |
|---|---|---|
| PRIO3 | Amela (56 T) | Keine Qualifikationsangabe, aber 209 Zeichen Freitext — lesen lohnt |
| NEEDS_INFO | Radit Haile (15 T) | Weder Qualifikation noch aussagekräftiger Freitext, 4/16 |

---

## 2. Die Datenlage — der eigentliche Befund

**Durchschnittliche Vollständigkeit: 5,4 von 16 Merkmalen.**

| Merkmal | fehlt bei |
|---|---|
| **Startdatum** | **36/36** |
| **Erweitertes Führungszeugnis** | **36/36** |
| Erfahrung | 35/36 |
| Eigenes Fahrzeug | 35/36 |
| Letzter Kontakt | 35/36 |
| E-Mail | 34/36 |
| Führerschein · Sprachen · Verfügbarkeit · Arbeitsmodell · Stunden | je 34/36 |
| Qualifikation | **nur 2/36** |

Zwei Merkmale fehlen **vollständig und strukturell**, nicht zufällig:

* **Startdatum** — `BewerbungDaten` hat kein Feld, der Katalog keinen Eintrag, das
  Formular fragt nichts ab. Ein Filter darauf ist nicht nachrüstbar, ohne die Angabe
  zuerst zu erheben.
* **Erweitertes Führungszeugnis** — wird nirgends als *Angabe* erhoben. Es existiert nur
  als Blocker `fz_fehlt`, den die Verwaltung selbst setzt. Für § 45a ist es Pflicht; dass
  die Bewerbung es nicht abfragt, verschiebt die Frage in das erste Telefonat.

Dass die Qualifikation dagegen bei 34 von 36 belegt ist, hat einen einfachen Grund: sie
steckt im Klartext in `service` („Engel-Bewerbung (Pflegehelfer/in)"). Das Feld war nie
als Datenquelle gedacht, ist aber die einzige, die es gibt.

---

## 3. Wiedervorlagen

Abgeleitet aus der Stufenfrist in `lib/bewerbung/pipeline.ts` — **alle 36 stehen auf
`neu`**, also Frist 1 Tag. Jede einzelne ist überfällig.

| Dringlichkeit | Kriterium | Anzahl |
|---|---|---|
| **Heute** | PRIO1, unabhängig vom Alter | **5** |
| **Diese Woche** | PRIO2 älter als 30 Tage | 12 |
| Danach | PRIO2 jünger als 30 Tage | 17 |
| Nachfassen | PRIO3 + NEEDS_INFO | 2 |

---

## 4. Gesprächsvorbereitung

**Für alle:** kein Kontakt hat eine E-Mail außer Ziyana Filote → Telefon. Absender und
Vorstellung „Alltagsengel", nie ein persönlicher Name. Keine Stundensätze nennen (nicht
freigegeben, siehe `PRICE_SOURCE_OF_TRUTH_LATEST.md`). Bei allem über 30 Tagen die
Verspätung zuerst ansprechen.

**Die fünf Fragen, die in jedem Gespräch fehlen** — genau die Merkmale, die 34 von 36
nicht tragen:

1. Wann könnten Sie anfangen?
2. Liegt ein **erweitertes** Führungszeugnis vor, oder müsste es beantragt werden?
3. Führerschein, und eigenes Auto?
4. Wie viele Stunden pro Woche, und Minijob, Teilzeit oder selbstständig?
5. Wann sind Sie erreichbar — vormittags, nachmittags, abends, Wochenende?

**Zusätzlich bei PRIO1:** die Qualifikation belegen lassen (Urkunde, Zeugnis). Bei
Claudia Adjovi konkret die 8 Jahre einordnen — ihr Freitext nennt die Zahl, aber nicht
das Feld.

**Antwortentwurf (Telefon, Erstkontakt nach langer Wartezeit)** — nicht versandt:

> „Guten Tag Frau/Herr [Nachname], hier ist Alltagsengel aus Frankfurt.
> Sie haben sich bei uns als Alltagsbegleiter/in beworben — vor [N] Tagen. Dass Sie so
> lange nichts gehört haben, tut mir leid; das lag an uns.
> Wenn Sie noch interessiert sind, würde ich gern kurz vier Dinge klären: ab wann Sie
> könnten, wie viele Stunden, ob Sie ein Auto haben, und ob ein erweitertes
> Führungszeugnis vorliegt. Dann sage ich Ihnen direkt, wie es weitergeht."

---

## 5. Mohamed Semmami — Ursprung gesucht

**Nicht in der Datenbank.** Geprüft gegen `name` über alle 50 Zeilen, auch die Varianten
`semm*`, `mohamed`, `mohammed`, `muhamm*` — **0 Treffer**.

Ebenfalls durchsucht: der gesamte Arbeitsbaum, `~/Downloads`, `~/Desktop`, `~/Documents`
und die Marketing-Verzeichnisse. **Kein Fund.**

| Möglicher Ursprung | Bewertung |
|---|---|
| **11880.com** | **wahrscheinlichster Kanal** — Birgit Fritzsch kam nachweislich so und ist ebenfalls nicht in der DB. Das Portal übergibt nichts an `lead_inquiries`. |
| Google Jobs | 8 Bewerbungen kamen so an, alle MIT DB-Eintrag — also unwahrscheinlich |
| Telefon / WhatsApp / persönlich | möglich; es gibt keinen Erfassungsweg dafür |
| Indeed / Jobcenter | Material liegt vor (`marketing/sofort-werbung/`), aber kein Rücklaufweg in die DB |

**Kein künstlicher Datensatz angelegt.** Woher der Name stammt, weiß nur die Person, die
ihn genannt hat — und das ist die Frage, die vor jeder Erfassung zu klären ist. Sonst
entsteht ein Eintrag ohne Herkunft, der später wie ein Formularlauf aussieht.

**Strukturelle Lücke, zweiter Fall:** Nach Birgit Fritzsch ist Mohamed Semmami die zweite
Person, die jemand kennt und die das System nicht kennt. Solange 11880 und Telefon keinen
Weg in `lead_inquiries` haben, wird es einen dritten geben.

---

## 6. Claudia Adjovi — DB gegen Original

| Merkmal | In der DB | Bewertung |
|---|---|---|
| Eingang | 02.09.2026 | plausibel |
| Status | `new` — **nie bearbeitet** | 10 Tage unbearbeitet |
| Quelle | `engel-bewerbung`, **kein UTM** | Kanal unbekannt |
| PLZ | 63739 (Aschaffenburg) | **Bayern** — außerhalb des Hessen-Gatings |
| Qualifikation | „Pflegehelfer/in" aus `service` | belegt |
| „8 Jahre" | **steht im Freitext** (599 Zeichen) | belegt |
| „Sozialbetreuerin" | **nicht in der DB** | stand nur im Report |
| E-Mail | **keine** | nur Telefon |
| `bewerbung_daten` | **null** | keine strukturierten Angaben |
| Pipeline-Stufe / Priorität | **keine** | PRIO 1 existierte nur als Prosa |

**Zwei Korrekturen an früheren Berichten:**

1. „8 Jahre Erfahrung" ist **durch die Daten gedeckt** — mein erstes Erfahrungsmuster fand
   es nicht, weil es das Wort „Erfahrung" verlangte und der Freitext es nicht verwendet.
   Muster korrigiert, Grund im Skript dokumentiert.
2. „Sozialbetreuerin + Pflegefachhelferin" steht **nicht** in der Datenbank. `service`
   nennt „Pflegehelfer/in". Die Doppelqualifikation kam aus dem Lesen des Freitexts und
   ist als Datenfeld nicht vorhanden — im Gespräch zu belegen, nicht als Tatsache zu führen.

**PLZ 63739 ist Aschaffenburg, also Bayern.** Für die Kassenabrechnung ist das relevant:
das Hessen-Gating greift dort nicht. Für eine Anstellung ist es unerheblich, für den
Einsatzort nicht.

---

## 7. Was fehlt

| # | Punkt | Art |
|---|---|---|
| 1 | **36 Bewerbungen einmal durch die Oberfläche einstufen** | USER_ACTION — die Einstufung oben ist errechnet, nicht gespeichert; `0/36` tragen eine Pipeline-Stufe |
| 2 | **Startdatum erheben** | Formularfeld fehlt vollständig |
| 3 | **Erw. FZ als Angabe erheben** | heute nur als Blocker der Verwaltung |
| 4 | **E-Mail-Pflichtprüfung im Bewerberformular** | 34/36 ohne Adresse; nur Telefon |
| 5 | **Rücklaufweg für 11880 / Telefon** | zwei bekannte Personen fehlen deshalb ganz |
| 6 | Oberflächenprüfung `/admin/applications` | Login nötig, nicht durchgeführt |
