**Stand:** 2026-08-14 · **Zweck:** Beschreibung der Export- und Berichtsfunktionen des Digitalen PflegeCoach (maschinenlesbares Format und menschenlesbarer Bericht).

# Interoperabilität und Export — Digitaler PflegeCoach

Quelle: `lib/coach/export.ts`, `lib/coach/export.schema.json`,
`audit/dipa/exportfunktionen.md`, `docs/DIPA_MATRIX_FINAL.md` (Abschnitt 4,
Interoperabilität).

---

## 1. Drei Ausgänge, drei Zwecke

| # | Ausgang | Form | Zweck |
|---|---------|------|-------|
| A | Datenexport | JSON in dokumentiertem Schema | Übertragbarkeit und Auskunft (Art. 15/20 DSGVO) — alles, was über die Person gespeichert ist |
| B | Verlaufsbericht | Bildschirm und Ausdruck (PDF über die Browser-Druckfunktion) | Grundlage für ein Gespräch mit Hausarztpraxis, Pflegeberatung oder Pflegedienst |
| C | Eigene Nachweisdaten | JSON | Einsicht in die pseudonym erfassten Nutzungsereignisse |

Alle drei löst ausschließlich **die betroffene Person selbst** aus — kein
Export durch die Verwaltung, kein automatischer Versand, keine Weiterleitung
an Dritte.

## 2. A — Maschinenlesbarer Datenexport

### Format und Kennung

`lib/coach/export.schema.json` ist ein JSON Schema (Draft 2020-12) mit der
Kennung **`de.alltagsengel.pflegecoach.export/1.0`**. Beschreibung im Schema
selbst: "Maschinenlesbarer Self-Service-Export aller Nutzerdaten (DiPAV
Anlage 2 / Art. 20 DSGVO)."

### Aufruf

`GET /api/coach/export` — angemeldet, eigenes Profil vorausgesetzt. Erreichbar
über die Einstellungen und über die Löschseite (dort **vor** der Löschung
angeboten). Der Export bleibt auch nach einem Widerruf der Einwilligung
möglich — sonst wäre der Widerruf eine Falle.

### Pflichtfelder auf oberster Ebene

Laut Schema (`required`): `format`, `version`, `produkt`, `exportiert_am`,
`hinweis`, `nutzer`, `einwilligungen`, `assessments`, `ziele`, `aktivitaeten`,
`erledigungen`, `messungen`, `berichte`.

| Abschnitt | Inhalt |
|-----------|--------|
| `nutzer` | Rolle, Anzeigename, Pflegegrad, Geburtsjahr, Registrierungszeitpunkt |
| `einwilligungen` | Typ, Textversion, Erteilung, Widerruf |
| `assessments` | alle Erhebungen mit fünf Bereichswerten und Freitexten |
| `ziele` | alle Ziele inkl. Werten, Terminen, Status, Anpassungsnotiz |
| `aktivitaeten` | alle Aktivitäten mit Wochentagen, Uhrzeit, Dauer |
| `erledigungen` | alle Einträge mit Datum, Status, Notiz |
| `messungen` | Instrument (u. a. `fes_i_k`, `bsfc_s`, `sus`), Messzeitpunkt, **Rohantworten**, Summenwert |
| `berichte` | alle erzeugten Berichte inklusive Inhalt |

### Selbstbeschreibung im Export

Jeder Export trägt `format` (`de.alltagsengel.pflegecoach.export`), `version`
(`1.0`), `produkt` (Name + Version zum Exportzeitpunkt), `exportiert_am` und
einen `hinweis`-Freitext, der die verwendeten Kodierungen erklärt (z. B.
Selbsteinschätzungen 0 = selbständig … 4 = umfassende Unterstützung;
Wochentage 1 = Montag … 7 = Sonntag; Belastungs-Items 0 = nie … 3 = fast
immer). Damit ist der Export ohne Zusatzwissen lesbar.

### Was bewusst nicht enthalten ist

* die Plattform-Nutzerkennung
* interne Zeilen-Kennungen
* Fremdschlüssel zwischen den Beständen

Der Export ist damit nicht zum Rückladen in dasselbe System gedacht, sondern
für die Person und Empfänger ihrer Wahl. Die Auslassung ist per Unit-Test
erzwungen (`lib/coach/export.test.ts` schlägt fehl, sobald eine interne
Kennung im Ergebnis auftaucht).

### Konformanz-Sicherung

`lib/coach/export.test.ts` prüft ein erzeugtes Beispiel gegen das Schema, laut
Matrix-Punkt INT-01 als **ERLEDIGT** eingestuft ("Maschinenlesbarer,
dokumentierter Datenexport").

### Schema-Versionierung

| Änderung | Folge |
|----------|-------|
| neues optionales Feld | Schema bleibt bei `1.0`, Feld wird ergänzt |
| Pflichtfeld entfällt, Bedeutung ändert sich, Aufzählungswert entfällt | neue Version; `version`-Feld im Export unterscheidet die Fassungen |

Empfangende Systeme sollen `format` und `version` auswerten und unbekannte
Felder ignorieren.

## 3. B — Menschenlesbarer Bericht

`POST /api/coach/berichte` mit Zeitraum erzeugt einen Bericht aus vier
Beständen (Assessments, Ziele, Erledigungen, Messungen) und legt ihn als
**unveränderlichen Snapshot** in `coach_reports` ab (kein Ändern, kein
Löschen — weder Regel noch Recht dafür vorhanden).

Ausgabe unter **`/pflegecoach/bericht`** als Druckansicht (Kopfzeile,
Navigation, Fußbereich im Ausdruck via `@media print` ausgeblendet). Ein PDF
entsteht über die Druckfunktion des Browsers, bewusst ohne eigene
PDF-Erzeugung, um keine zusätzliche Verarbeitungsstelle für Gesundheitsdaten
zu schaffen. Laut Matrix-Punkt INT-03 als **ERLEDIGT** eingestuft.

Die Zusammenfassung der Erledigungen ist eine reine Zählung (gesamt, erledigt,
teilweise, ausgelassen) — keine Bewertung, keine Ampel, kein Kommentar zur
Qualität.

## 4. C — Eigene Nachweisdaten

`GET /api/coach/nutzung` liefert die pseudonym erfassten Nutzungsereignisse
der eigenen Person (Ereignisart, Modulschlüssel, Rolle, Auswertungswoche,
Anzahl — ohne Zeitstempel, nur die Woche). Solange die Erfassung abgeschaltet
ist (Auslieferungszustand, `COACH_NUTZUNGSNACHWEIS_AKTIV=false`), ist die
Antwort leer; das Feld `erfassungAktiv` erklärt warum. Dieselben Daten sind
über dieselbe Pseudonym-Regel auch löschbar (Art. 17 DSGVO), unabhängig von den
übrigen Daten.

## 5. Verbindliches Austauschformat (FHIR) — technisch vorhanden, Verbindlichkeit offen

Laut `docs/DIPA_MATRIX_FINAL.md` (Matrix-Punkt INT-02) existiert seit dem
14.08.2026 zusätzlich ein FHIR-R4-Bundle-Export: `lib/coach/fhir.ts` mit 13
Tests, abrufbar über `/api/coach/export?format=fhir` (Questionnaire,
QuestionnaireResponse, Goal, CarePlan), dokumentiert in
`audit/dipa/interoperabilitaet_fhir.md`. Status laut Matrix: **"TECHNISCH
ERLEDIGT — Verbindlichkeit EXTERN"** — der Export erhebt ausdrücklich
**keinen** Profil-, LOINC- oder SNOMED-Anspruch, was durch Tests abgesichert
ist. Ob ein FHIR-Profil verbindlich gefordert wird, ist Gegenstand der
BfArM-Beratung (Frage 10).

## 6. Was es nicht gibt (aus `exportfunktionen.md` §5)

| Erwartung | Tatsächlich |
|-----------|-------------|
| Export durch die Verwaltung | existiert nicht — kein Lesezugriff |
| Automatischer Versand an Pflegedienst, Praxis oder Kasse | existiert nicht |
| Import — Rückladen eines Exports | existiert nicht (auch nicht sinnvoll, da interne Kennungen fehlen) |
| Teilexport (nur bestimmte Bereiche) | existiert nicht — der Export ist immer vollständig |
| Export der Daten einer Person mit Freigabe | existiert nicht — wer eine Freigabe hat, kann lesen, aber nicht exportieren |

Letzteres ist eine bewusste Entscheidung: Ein Export durch die empfangende
Person würde Daten dauerhaft aus der Reichweite des Widerrufs nehmen — Lesen
endet mit dem Widerruf, eine Kopie nicht.

## 7. Offene Punkte — OFFEN / EXTERN_BENÖTIGT

| Punkt | Status |
|-------|--------|
| Verbindlichkeit eines Austauschformats (FHIR-Profile, LOINC/SNOMED) | **EXTERN_BENÖTIGT** — BfArM-Frage 10 |
| Verständlichkeit des Exports für die Zielgruppe geprüft | **OFFEN** — im Pilotmaterial vorgesehen, nicht durchgeführt |
| Hinweis auf Eigenverantwortung nach dem Download in der Oberfläche rechtlich geprüft | **EXTERN_BENÖTIGT** — Teil der ausstehenden juristischen Prüfung |
| Lizenzierte Erhebungsinstrumente (FES-I, BSFC-s, SUS) — nur Summenwerte im FHIR-Export, keine Fragetexte | technisch umgesetzt; Lizenzfrage selbst bleibt **EXTERN_BENÖTIGT** (BfArM-Frage 16) |

---

## Quellen

- `lib/coach/export.ts`
- `lib/coach/export.schema.json`
- `lib/coach/export.test.ts`
- `audit/dipa/exportfunktionen.md`
- `audit/dipa/interoperabilitaet_fhir.md`
- `docs/DIPA_MATRIX_FINAL.md` (Abschnitt 4 "Interoperabilität": INT-01, INT-02, INT-03)
