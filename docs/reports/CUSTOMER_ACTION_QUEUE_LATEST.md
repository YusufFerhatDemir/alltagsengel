# Kunden-Aktionsliste

**Stand:** 13.09.2026, live aus `lead_inquiries` · **Keine Nachricht versendet.**
Kontaktdaten sind **nicht** wiedergegeben — nur der Kanal. Wer anruft, öffnet den
Datensatz; ein Bericht braucht die Nummer nicht.
Status je Zeile: `VERIFIED_LIVE` sofern nicht anders vermerkt.

---

## 1. Die Warteschlange

| # | Name | Prio | Alter | Bedarf | Kanal | Letzter Kontakt | Nächste Aktion | Status |
|---|---|---|---|---|---|---|---|---|
| 1 | **Maike Reichert** | **P1** | 12 T / 10 T | Alltagsbegleitung, Mittagsfenster 12–15 Uhr | Telefon | **nie** (`status=new`) | Anrufen, beide Terminwünsche ansprechen | **CALL_REQUIRED** |
| 2 | **Manthey Ickenroth** | **P1** | 34 T | Haushaltshilfe nach Herz-OP und Reha | Telefon | nie | Anrufen, zuerst nach dem Befinden fragen | **CALL_REQUIRED** |
| 3 | **Uwe Büttner** | P2 | 43 T | Verhinderungspflege, Demenz, tageweise | Telefon | nie | Anrufen, Pflegegrad und Umfang klären | **CALL_REQUIRED** |
| 4 | **Darleen Suhe** | P2 | **59 T** | **unbekannt** — kein Freitext | Telefon | nie | Anrufen, offen fragen | **CALL_REQUIRED** |
| 5 | **Birgit Fritzsch** | **P1** | `UNKNOWN` | `UNKNOWN` | 11880-Portal | `UNKNOWN` | Kontaktdaten im Portal freischalten | **BLOCKED_EXTERNAL** |
| 6 | **Sarune Veitaite** | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | Herkunft klären, bevor etwas angelegt wird | **UNKNOWN** |

**Alle vier Datensätze stehen auf `status=new`.** Keiner wurde je bearbeitet, keiner hat
eine Wiedervorlage (`follow_up_date` überall leer). **Keiner hat eine E-Mail-Adresse** —
es gibt nur den Telefonweg. Ein schriftlicher Entwurf wäre unzustellbar.

## 2. Je Fall, was die Daten hergeben

### 1 · Maike Reichert — zwei Versuche, keine Antwort · P1

| | |
|---|---|
| Zeilen | **zwei** getrennte Datensätze, gleiche Nummer |
| Quelle | `terminbuchung` (Online-Terminwunsch) |
| PLZ | **55246** — Mainz-Kastel / Wiesbaden-Ost, nicht Frankfurt |
| Termin 1 | Mi, **02.09.2026**, 12–15 Uhr — „Bitte zur Bestätigung zurückrufen" |
| Termin 2 | Fr, **11.09.2026**, 12–15 Uhr — derselbe Wunsch, neun Tage später |
| Alter | 12 bzw. 10 Tage · beide `new` |

**Warum P1 trotz jüngerem Datum:** Sie hat **zweimal aktiv** um Rückruf gebeten und
zweimal nichts bekommen. Beide Wunschtermine sind verstrichen. Das ist das klarste
Signal in der ganzen Liste — und der Fall mit dem höchsten Abwanderungs- und
Beschwerderisiko.

**Keine Dublette im technischen Sinn:** zwei echte Anfragen derselben Person.
Zusammenführen ja, abhaken nein.

### 2 · Manthey Ickenroth — das Zeitfenster ist JETZT · P1

| | |
|---|---|
| Quelle | `alltagsbegleitung-darmstadt` · PLZ **64285** (Darmstadt) |
| Freitext | „Ich werde am 14.8. am Herzen operiert. Nach der anschließenden Reha benötige ich Hilfe vor allem im Haushalt." |
| Alter | 34 Tage |

Die OP war vor rund vier Wochen. Eine Anschlussreha dauert typischerweise drei Wochen —
der genannte Bedarfszeitpunkt ist damit **ungefähr jetzt erreicht**. Der Fall ist nicht
verfallen, er ist fällig.

**Gesprächsregel:** zuerst nach dem Befinden fragen. Eine Herz-OP ist kein Einstieg in
ein Verkaufsgespräch.

### 3 · Uwe Büttner — inhaltlich am konkretesten · P2

| | |
|---|---|
| Quelle | `alltagsbegleitung-aschaffenburg` · PLZ **63743** (Aschaffenburg) |
| Freitext | „Wir benötigen für unsere an Demenz erkrankte Mutter tageweise Verhinderungspflege" |
| Alter | 43 Tage |

**Aschaffenburg liegt in Bayern** — außerhalb des Hessen-Gatings. Eine Abrechnung über
die Kasse scheidet dort ohnehin aus, das Gespräch geht Richtung Selbstzahler oder
Weitervermittlung. **Nicht zusagen**, dass die Kasse das übernimmt.

### 4 · Darleen Suhe — die älteste, und wir wissen nichts · P2

| | |
|---|---|
| Quelle | `alltagsbegleitung-darmstadt` · PLZ **64285** |
| Freitext | **0 Zeichen** |
| Alter | **59 Tage** |

Über den Bedarf ist nichts bekannt. Offen fragen, nicht raten. Dass sie die älteste ist
und trotzdem P2: ohne jede Bedarfsangabe ist die Erfolgsaussicht geringer als bei
Reichert und Ickenroth — die Verspätung wiegt dennoch schwer und gehört angesprochen.

### 5 · Birgit Fritzsch — im Portal, nicht im System · BLOCKED_EXTERNAL

| | |
|---|---|
| In `lead_inquiries` | **0 Treffer** — `VERIFIED_LIVE` |
| Genannter Ursprung | **11880.com**, Bruchköbel — `INFERRED` (Angabe des Auftraggebers) |

11880 liefert Anfragen über ein eigenes Portal aus. Ohne Freischaltung der Kontaktdaten
dort und ohne Übergabe an `lead_inquiries` bleibt so eine Anfrage doppelt unsichtbar:
weder Ampel noch Follow-up-Kette sehen sie.

**Nächster Schritt:** Kontaktdaten im 11880-Portal freischalten. Erst dann steht fest, ob
und wie schnell reagiert werden kann.

### 6 · Sarune Veitaite — Herkunft ungeklärt · UNKNOWN

| | |
|---|---|
| In `lead_inquiries` | **0 Treffer** — `VERIFIED_LIVE` |
| Weitere Suche | kein Fund im Arbeitsbaum, in `~/Downloads`, `~/Desktop`, `~/Documents` |
| Ursprung | **`UNKNOWN`** |

Wahrscheinlichster Kanal analog zu Mohamed Semmami: die Strato-Mailadresse
`info@alltagsengel.care`, auf die diese Sitzung keinen Zugriff hat.

**Kein Datensatz angelegt.** Woher der Name stammt, weiß nur, wer ihn genannt hat. Ein
erfundener Eintrag sähe später wie ein Formularlauf aus und wäre schlechter als keiner.

## 3. Der Befund hinter den Einzelfällen

**Drei von sechs Personen sind dem Unternehmen bekannt und dem System nicht:**
Birgit Fritzsch, Sarune Veitaite und — aus der Bewerberseite — Mohamed Semmami.

Gemeinsames Muster: Sie kamen über Kanäle **ohne Rücklaufweg** in `lead_inquiries`
(11880-Portal, Strato-Postfach, Telefon). Solange diese Kanäle keinen Erfassungsweg
haben, wird es einen vierten Fall geben. Das ist keine Datenpanne, sondern eine fehlende
Leitung.

## 4. Reihenfolge für heute

| Reihenfolge | Wer | Warum genau hier |
|---|---|---|
| 1 | **Reichert** | Zweimal vergeblich gebeten; beide Termine verstrichen |
| 2 | **Ickenroth** | Bedarfsfenster ist jetzt offen, in zwei Wochen vielleicht nicht mehr |
| 3 | **Büttner** | Klarer Bedarf, 43 Tage, aber Bayern — Erwartung früh klarstellen |
| 4 | **Suhe** | Älteste, Bedarf unbekannt — offenes Gespräch |
| 5 | **Fritzsch** | Erst Portal freischalten, dann anrufen |
| 6 | **Veitaite** | Erst Herkunft klären |

**Für alle Gespräche:** Vorstellung als „Alltagsengel", nie mit persönlichem Namen.
Bei allem über 30 Tagen die Verspätung **zuerst** ansprechen. **Keine Stundensätze
nennen** — die Vergütungs- und Preisaussagen sind noch nicht entschieden
(`PRICE_SOURCE_OF_TRUTH_LATEST.md`). **Keine Zusage zur Kassenabrechnung**: das Angebot
ist im Anerkennungsverfahren nach § 45a, nicht anerkannt.

Ausformulierte Leitfäden je Fall: `docs/reports/READY_TO_CALL_12_09_2026.md`.
