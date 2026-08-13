# Exportfunktionen — Digitaler PflegeCoach

**Stand:** 2026-08-13
**Status:** ENTWURF — aus dem Quellcode abgeleitet
**Umsetzung:** `lib/coach/export.ts`, `lib/coach/export.schema.json`,
`app/api/coach/export`, `app/api/coach/berichte`, `app/pflegecoach/bericht`,
`app/api/coach/nutzung` (GET)
**Nachweis:** `lib/coach/export.test.ts` (Konformanz gegen das Schema)

---

## 1. Drei Ausgänge, drei Zwecke

| # | Ausgang | Form | Zweck |
|---|---------|------|-------|
| A | Datenexport | JSON in dokumentiertem Schema | Übertragbarkeit und Auskunft — alles, was über die Person gespeichert ist |
| B | Verlaufsbericht | Bildschirm und Ausdruck (PDF über die Druckfunktion) | Grundlage für ein Gespräch mit Hausarztpraxis, Pflegeberatung oder Pflegedienst |
| C | Eigene Nachweisdaten | JSON | Einsicht in die pseudonym erfassten Nutzungsereignisse |

Alle drei löst **die betroffene Person selbst** aus. Es gibt keinen Export durch
die Verwaltung, keinen automatischen Versand und keine Weiterleitung an Dritte.

---

## 2. A — Datenexport

### Aufruf

`GET /api/coach/export` — angemeldet, eigenes Profil vorausgesetzt. Erreichbar
über die Einstellungen und über die Löschseite (dort **vor** der Löschung
angeboten; die Reihenfolge ist Absicht).

Der Export bleibt auch nach einem Widerruf der Einwilligung möglich — sonst wäre
der Widerruf eine Falle (`einwilligungslogik.md` §5).

### Inhalt

Sieben Bestände der eigenen Person, jeweils vollständig:

| Abschnitt | Quelle |
|-----------|--------|
| `nutzer` | Rolle, Anzeigename, Pflegegrad, Geburtsjahr, Registrierungszeitpunkt |
| `einwilligungen` | Typ, Textversion, Erteilung, Widerruf |
| `assessments` | alle Erhebungen mit allen fünf Bereichen und Freitexten |
| `ziele` | alle Ziele inkl. Werten, Terminen, Status und Anpassungsnotiz |
| `aktivitaeten` | alle Aktivitäten mit Wochentagen, Uhrzeit, Dauer |
| `erledigungen` | alle Einträge mit Datum, Status, Notiz |
| `messungen` | Instrument, Messzeitpunkt, **Rohantworten**, Summenwert |
| `berichte` | alle erzeugten Berichte inklusive ihres Inhalts |

### Was bewusst **nicht** enthalten ist

* die Plattform-Nutzerkennung
* interne Zeilen-Kennungen
* Fremdschlüssel zwischen den Beständen

Der Export ist damit **nicht** dafür gedacht, in dasselbe System zurückgeladen zu
werden — er ist für die Person und für Empfänger ihrer Wahl. Die Auslassung ist
per Unit-Test erzwungen: `lib/coach/export.test.ts` schlägt fehl, sobald eine
interne Kennung im Ergebnis auftaucht.

### Selbstbeschreibung

Jeder Export trägt mit:

| Feld | Zweck |
|------|-------|
| `format` | `de.alltagsengel.pflegecoach.export` |
| `version` | Schema-Version, derzeit `1.0` |
| `produkt` | Produktname und Produktversion zum Zeitpunkt des Exports |
| `exportiert_am` | Zeitpunkt |
| `hinweis` | Erläuterung der Kodierungen im Klartext |

Der Hinweistext ist der Punkt, an dem sich diese Datei von einem Datenbankauszug
unterscheidet. Er erklärt in der Datei selbst, was die Zahlen bedeuten:

> Selbsteinschätzungen 0 = selbständig … 4 = umfassende Unterstützung;
> Wochentage 1 = Montag … 7 = Sonntag; Belastungs-Items 0 = nie … 3 = fast immer.

Ohne diese Erläuterung wäre eine `3` in der Datei nicht deutbar — und ein
Datenexport, den niemand lesen kann, erfüllt seinen Zweck nicht.

### Schema

`lib/coach/export.schema.json` ist ein JSON Schema (Draft 2020-12) mit der
Kennung `de.alltagsengel.pflegecoach.export/1.0`. Es legt für jeden Abschnitt die
Pflichtfelder, die zulässigen Werte der Aufzählungen und die Wertebereiche fest.

Ein Test in `lib/coach/export.test.ts` prüft ein erzeugtes Beispiel gegen dieses
Schema. Damit ist ausgeschlossen, dass sich Export und Schema
auseinanderentwickeln, ohne dass es auffällt.

### Versionierung des Schemas

| Änderung | Folge |
|----------|-------|
| neues optionales Feld | Schema bleibt bei `1.0`, Feld wird ergänzt |
| Pflichtfeld entfällt, Bedeutung ändert sich, Aufzählungswert wird entfernt | neue Version; das Feld `version` im Export unterscheidet die Fassungen |

Empfangende Systeme sollten `format` und `version` auswerten und unbekannte
Felder ignorieren.

---

## 3. B — Verlaufsbericht

### Erzeugung

`POST /api/coach/berichte` mit Zeitraum. Der Bericht wird aus vier Beständen
gebildet (Assessments, Ziele, Erledigungen, Messungen) und als **unveränderlicher
Snapshot** in `coach_reports` abgelegt.

Unveränderlich heißt hier wörtlich: kein Ändern, kein Löschen — weder ist eine
Regel dafür vorhanden noch das Recht erteilt. Ein Bericht, der später
nachgebessert werden kann, taugt nicht als Gesprächsgrundlage.

### Inhalt

| Abschnitt | Inhalt |
|-----------|--------|
| `produkt` | Name und Version zum Zeitpunkt der Erzeugung |
| `zeitraum` | von / bis |
| `assessments` | alle Erhebungen im Zeitraum mit den fünf Bereichswerten |
| `ziele` | alle Ziele mit Start-, Ziel- und Ist-Wert sowie Status |
| `erledigungen` | Summen: gesamt, erledigt, teilweise, ausgelassen |
| `messungen` | Instrument, Messzeitpunkt, Summenwert, Erhebungsdatum |

Die Zusammenfassung der Erledigungen ist eine **Zählung**, keine Bewertung. Es
gibt keine Quote mit Zielwert, keine Ampel und keinen Kommentar dazu, ob eine
Zahl gut oder schlecht ist.

### Ausgabe

`/pflegecoach/bericht` zeigt den Bericht in einer Druckansicht. Kopfzeile,
Navigation und Fußbereich sind im Ausdruck ausgeblendet
(`@media print` in `pflegecoach.css`); der Rest ist auf Papierformat ausgelegt.
Ein PDF entsteht über die Druckfunktion des Browsers — bewusst ohne eigene
PDF-Erzeugung, die eine zusätzliche Abhängigkeit und eine weitere Stelle wäre, an
der Gesundheitsdaten verarbeitet würden.

Was nach dem Ausdruck mit dem Papier geschieht, liegt außerhalb des Systems.
Genau das ist der Zweck: Der Bericht ist dafür gedacht, mitgenommen zu werden.

---

## 4. C — Eigene Nachweisdaten

`GET /api/coach/nutzung` liefert die pseudonym erfassten Nutzungsereignisse der
eigenen Person: Ereignisart, Modulschlüssel, Rolle, Auswertungswoche, Anzahl.
Ein Zeitstempel existiert nicht — nur die Woche.

Solange die Erfassung abgeschaltet ist (Auslieferungszustand), ist die Antwort
leer. Das Feld `erfassungAktiv` sagt, warum.

Dieselben Daten sind über dieselbe Pseudonym-Regel auch **löschbar** (Art. 17),
unabhängig von den übrigen Daten.

---

## 5. Was es **nicht** gibt

| Erwartung | Tatsächlich |
|-----------|-------------|
| Export durch die Verwaltung | existiert nicht — es gibt keinen Lesezugriff |
| Automatischer Versand an Pflegedienst, Praxis oder Kasse | existiert nicht — das Produkt versendet nichts |
| Export im Format eines Austauschstandards | nicht vorhanden, siehe `interoperabilitaet_pflegecoach.md` |
| Import — Rückladen eines Exports | existiert nicht; wäre auch nicht sinnvoll, da interne Kennungen fehlen |
| Teilexport (nur bestimmte Bereiche) | existiert nicht; der Export ist immer vollständig |
| Export der Daten einer Person mit Freigabe | existiert nicht; wer eine Freigabe hat, kann lesen, aber nicht exportieren |

Die letzte Zeile ist eine bewusste Entscheidung: Ein Export durch die
empfangende Person würde die Daten dauerhaft aus der Reichweite des Widerrufs
nehmen. Lesen endet mit dem Widerruf — eine Kopie nicht.

---

## 6. Offene Punkte

| Punkt | Status |
|-------|--------|
| Abbildung in einem verbindlichen Austauschformat | offen — GAP-INTEROP |
| Verständlichkeit des Exports für die Zielgruppe geprüft | offen — im Pilotmaterial vorgesehen (`pilotdesign.md` §7) |
| Hinweis auf die Eigenverantwortung nach dem Download in der Oberfläche geprüft | offen — Teil der ausstehenden juristischen Prüfung |
| Export einer geteilten Nutzung (zwei Personen, ein Haushalt) | nicht vorgesehen; jede Person exportiert ihre eigenen Daten |
