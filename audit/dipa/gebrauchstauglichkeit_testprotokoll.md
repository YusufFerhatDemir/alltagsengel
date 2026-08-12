# Gebrauchstauglichkeit — Testprotokoll (Vorlage)

**Stand:** 2026-08-12 · **Block:** 15c · **Status:** Vorlage, noch nicht durchgeführt
**Produkt:** Digitaler PflegeCoach, Version _______ (`lib/coach/version.ts`)

> **Was diese Vorlage ist:** ein durchführbares Protokoll für einen Usability-Test mit der
> echten Zielgruppe. Sie ist unser eigenes Prüfinstrument.
>
> **Was sie nicht ist:** eine Wiedergabe eines normativen Prüfverfahrens. Ob und welche
> Norm für die Gebrauchstauglichkeitsprüfung verbindlich anzuwenden ist, ist gegen die
> maßgeblichen Anforderungen zum Antragszeitpunkt zu klären (BfArM-Frage 12,
> `bfarm_fragenkatalog.md`). Die Barrierefreiheitsprüfung ist ein **eigener** Test
> (GAP-A11Y-AUDIT) — Gebrauchstauglichkeit und Barrierefreiheit sind nicht dasselbe.

---

## 1. Rahmen

| Feld | Eintrag |
|---|---|
| Datum | |
| Ort / Setting | häusliche Umgebung der Teilnehmenden bevorzugt |
| Testleitung | |
| Beobachtung / Protokoll | |
| Getestete Version | |
| Geräte | eigenes Gerät der Teilnehmenden (Realbedingungen) |
| Aufzeichnung | nur mit gesonderter schriftlicher Einwilligung |

## 2. Teilnehmende

Ziel: mindestens 5 Personen je Nutzergruppe. Die Erfahrung, dass wenige Teilnehmende die
meisten Probleme aufdecken, gilt für die Fehlersuche — **nicht** für eine repräsentative
Aussage.

| # | Gruppe | Alter | Pflegegrad | Digitale Vorerfahrung | Seh-/Hör-/Motorik-Einschränkung | Hilfsmittel |
|---|---|---|---|---|---|---|
| 1 | pflegebedürftig | | | | | |
| 2 | pflegebedürftig | | | | | |
| 3 | pflegebedürftig | | | | | |
| 4 | pflegende/r Angehörige/r | | | | | |
| 5 | pflegende/r Angehörige/r | | | | | |

**Wichtig:** Mindestens zwei Teilnehmende sollten geringe digitale Vorerfahrung haben und
mindestens eine Person eine Sehbeeinträchtigung. Ein Test mit lauter technikaffinen
Angehörigen misst das falsche Produkt.

### Einwilligung der Teilnehmenden

- [ ] Zweck des Tests erklärt („wir testen die Anwendung, nicht Sie")
- [ ] Abbruch jederzeit möglich, ohne Begründung
- [ ] Schriftliche Einwilligung liegt vor
- [ ] Bei Aufzeichnung: gesonderte Einwilligung liegt vor
- [ ] Testdaten werden nach Auswertung gelöscht

## 3. Aufgaben

Jede Aufgabe wird **ohne Anleitung** gestellt. Die Testleitung hilft erst, wenn die Person
von sich aus aufgibt — und protokolliert diesen Moment.

| # | Aufgabe | Erwartetes Ergebnis | Kritisch? |
|---|---|---|---|
| A1 | Anmelden und Rolle festlegen | Profil angelegt | ja |
| A2 | Einwilligungen verstehen und bewusst entscheiden | Person kann in eigenen Worten sagen, wozu sie zugestimmt hat | **ja — Verständnis, nicht Klickrate** |
| A3 | Schrift auf „sehr groß" stellen | Darstellung ändert sich sichtbar | ja |
| A4 | Erstes Assessment ausfüllen | Assessment gespeichert | ja |
| A5 | Ein eigenes Ziel anlegen | Ziel mit Messgröße gespeichert | ja |
| A6 | Eine Aktivität für morgen einplanen | Aktivität im Wochenplan | nein |
| A7 | Eine erledigte Aktivität abhaken | Eintrag im Verlauf sichtbar | ja |
| A8 | Anspruchsprüfung durchführen und Ergebnis erklären | Person versteht, dass die Pflegekasse entscheidet | **ja** |
| A9 | Freischaltcode eingeben (Testcode) | Zugang freigeschaltet | nein |
| A10 | Eigene Daten herunterladen | Datei geladen | nein |
| A11 | Beschreiben, wie man seine Daten löschen würde | Person findet den Weg | ja |

## 4. Messgrößen je Aufgabe

| Aufgabe | Erfolg (ja/nein/mit Hilfe) | Dauer | Anzahl Fehlversuche | Beobachtete Schwierigkeit | Zitat |
|---|---|---|---|---|---|
| A1 | | | | | |
| A2 | | | | | |
| … | | | | | |

**Abbruchkriterium für den Test insgesamt:** Wenn eine als kritisch markierte Aufgabe von
mehr als der Hälfte der Teilnehmenden nicht selbständig gelöst wird, wird der Test
gestoppt, die Ursache behoben und neu getestet. Weitertesten auf einem kaputten Ablauf
erzeugt nur Daten über ein Produkt, das es so nicht geben wird.

## 5. Abschlussbefragung

1. Was war am schwierigsten?
2. Was hat gefehlt?
3. Wo hatten Sie das Gefühl, etwas falsch zu machen?
4. Würden Sie die Anwendung im Alltag benutzen? Warum (nicht)?
5. Haben Sie an irgendeiner Stelle gedacht, die Anwendung gebe Ihnen einen medizinischen
   Rat? _(Prüft die MDR-Abgrenzung aus Nutzersicht — siehe `mdr_negativabgrenzung.md`.)_

Ergänzend kann ein standardisierter Usability-Fragebogen eingesetzt werden. Für die
Instrumentenwahl gilt dieselbe Lizenzfrage wie bei den übrigen Instrumenten
(GAP-INSTRUMENTE) — vor Einsatz klären.

## 6. Auswertung

| Befund | Schwere (kritisch/hoch/mittel/gering) | Betroffene Aufgabe | Anzahl Teilnehmende | Maßnahme | Behoben in Version |
|---|---|---|---|---|---|
| | | | | | |

**Schwere-Einstufung:**

* **kritisch** — Aufgabe nicht lösbar, Datenverlust, oder Nutzer versteht die Einwilligung
  bzw. die Nicht-Medizinprodukt-Eigenschaft falsch
* **hoch** — Aufgabe nur mit Hilfe lösbar
* **mittel** — lösbar, aber mit erkennbarer Mühe
* **gering** — Schönheitsfehler

## 7. Ergebnis und Freigabe

| Feld | Eintrag |
|---|---|
| Kritische Befunde offen | |
| Erneuter Test erforderlich | ja / nein |
| Freigabe für | Pilot / Antrag / keine |
| Datum, Unterschrift | |

## 8. Verweise

* Barrierefreiheitsprüfung (eigener Test): GAP-A11Y-AUDIT
* Nutzergruppen: `zielgruppendefinition.md`
* Pilotrahmen: `pilotdesign.md`
