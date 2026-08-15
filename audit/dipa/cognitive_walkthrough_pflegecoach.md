# Cognitive Walkthrough — Digitaler PflegeCoach

**Produkt:** Digitaler PflegeCoach · **Version:** 0.5.0 · **Stand:** 2026-08-15
**Deckt ab:** DiPA-Matrix BF-02, Anlage 2 DiPAV Themenfeld IV Nr. 2 (formative Evaluation)
**Methode:** Cognitive Walkthrough (analytisch) nach DIN EN ISO 9241-11

---

## 0. Einordnung

Anlage 2 DiPAV, Themenfeld IV Nr. 2 verlangt, dass „eine formative Evaluation
mindestens einmal in der Entwicklungsphase einer digitalen Pflegeanwendung in
einer simulierten oder tatsächlichen Anwenderumgebung durchgeführt" wurde. Der
Verordnungstext lässt ausdrücklich ein **analytisches Verfahren** zu — „z. B.
als Cognitive Walkthrough, also als analytisches Durchdenken, Evaluation und
Inspektion eines Problems IM GEGENSATZ ZU EINEM EMPIRISCHEN TESTVERFAHREN".

Dieses Dokument ist die Durchführung dieses analytischen Verfahrens.

**Zielgruppe der Analyse:** Pflegebedürftige (Pflegegrad 1–3, zu Hause lebend,
geringe bis mittlere Technikerfahrung, Alter 65–85), pflegende Angehörige
(berufstätig, Alter 40–60, mittlere Technikerfahrung).

**Prüfer:** Produktteam Alltagsengel (analytisch, nicht empirisch).

**Bewertungsschema je Schritt:**
- **JA** — der Nutzer erkennt, was zu tun ist, und findet den Weg
- **UNSICHER** — möglich, aber nicht offensichtlich; Anpassung empfohlen
- **NEIN** — der Nutzer scheitert ohne Hilfe; Befund mit Handlungsbedarf

---

## 1. Aufgabe: Einstieg und Zweckbestimmung verstehen

**Nutzerziel:** Verstehen, was das Angebot ist und was es nicht ist.
**Einstiegsseite:** `/pflegecoach/start`

| Schritt | Aktion | Kann der Nutzer erkennen, was zu tun ist? | Kann der Nutzer die richtige Aktion finden? | Kann der Nutzer den Zusammenhang verstehen? | Ergebnis |
|---|---|---|---|---|---|
| 1 | Seite öffnen/aufrufen | JA — Einstiegspunkt über Produktseite oder Direktlink | JA | JA | JA |
| 2 | Zweckbestimmung lesen | JA — Zweckbestimmung steht als erstes auf der Seite | JA | JA — „Unterstützung im Alltag" und „KEIN medizinisches Angebot" sind klar getrennt | JA |
| 3 | Weiter zur Registrierung/Anmeldung | JA — Button „Jetzt starten" ist sichtbar und eindeutig | JA | JA | JA |

**Befunde:** Keine. Die Seite trennt klar zwischen Zweck und Nicht-Zweck. Der
Notfallhinweis in der Fußzeile verstärkt die Abgrenzung.

---

## 2. Aufgabe: Konto einrichten und Einwilligung erteilen

**Nutzerziel:** Nutzung beginnen, Datenverarbeitung bewusst zustimmen.
**Einstiegsseite:** `/pflegecoach/start` → Supabase-Auth → `/pflegecoach`

| Schritt | Aktion | Erkennung | Auffindbarkeit | Verständnis | Ergebnis |
|---|---|---|---|---|---|
| 1 | E-Mail eingeben | JA | JA — Standardformular | JA | JA |
| 2 | OTP/Passwort eingeben | JA — Magic-Link oder Passwort | JA | JA | JA |
| 3 | Einwilligungsseite lesen | JA — wird automatisch nach Login angezeigt | JA | UNSICHER — der Einwilligungstext ist lang, ältere Nutzer könnten ihn überfliegen | UNSICHER |
| 4 | Zustimmen | JA — Button klar beschriftet | JA | JA | JA |

**Befund B-2.1 (UNSICHER):** Die Einwilligungstexte sind verständlich, aber lang.
Eine Kurzfassung mit „Mehr erfahren"-Aufklappern würde die bewusste Zustimmung
bei der Zielgruppe fördern. **Schwere:** gering (Funktion gegeben, UX-Verbesserung).

---

## 3. Aufgabe: Schriftgröße anpassen

**Nutzerziel:** Text vergrößern, weil er schlecht lesbar ist.
**Einstiegsseite:** Beliebige PflegeCoach-Seite (CoachShell-Kopfzeile)

| Schritt | Aktion | Erkennung | Auffindbarkeit | Verständnis | Ergebnis |
|---|---|---|---|---|---|
| 1 | Darstellungsbereich finden | JA — in der Kopfzeile, mit aria-label „Darstellung anpassen" | JA | JA | JA |
| 2 | Schriftgrad wählen | JA — drei Buttons „A", „A+" und „A++" | UNSICHER — Buttons beschriftet, aber ohne Tooltip; die Bedeutung „A+" vs. „A++" ist konventionell, aber nicht selbsterklärend | JA — Wirkung sofort sichtbar | UNSICHER |
| 3 | Kontrastmodus aktivieren | JA — Toggle-Button „Kontrast" | JA | JA | JA |

**Befund B-3.1 (UNSICHER):** Die Schriftgrad-Buttons könnten von Tooltips
profitieren („Normale Schrift", „Große Schrift", „Sehr große Schrift").
**Schwere:** gering.

---

## 4. Aufgabe: Selbsteinschätzung durchführen

**Nutzerziel:** Eigene Selbständigkeit in Lebensbereichen einschätzen.
**Einstiegsseite:** `/pflegecoach` → Navigation „Assessment" → `/pflegecoach/assessment`

| Schritt | Aktion | Erkennung | Auffindbarkeit | Verständnis | Ergebnis |
|---|---|---|---|---|---|
| 1 | „Assessment" in Navigation finden | JA — fester Punkt in der Hauptnavigation | JA | UNSICHER — der Fachbegriff „Assessment" könnte für die Zielgruppe unklar sein | UNSICHER |
| 2 | Fragen beantworten | JA — Skala mit Beschriftung | JA | JA — alltagsnahe Formulierungen | JA |
| 3 | Ergebnis verstehen | JA — zusammenfassende Anzeige | JA | JA | JA |
| 4 | Speichern | JA — automatisch oder expliziter Button | JA | JA | JA |

**Befund B-4.1 (UNSICHER):** Der Begriff „Assessment" ist pflegefachlich korrekt,
aber möglicherweise nicht selbsterklärend für pflegebedürftige Endnutzer.
Alternative: „Meine Selbständigkeit einschätzen" als Ergänzung im Untertitel.
**Schwere:** gering (Navigation funktioniert, Verständnishilfe fehlt).

---

## 5. Aufgabe: Ziel setzen

**Nutzerziel:** Ein persönliches Pflegeziel definieren.
**Einstiegsseite:** `/pflegecoach` → Navigation „Ziele" → `/pflegecoach/ziele`

| Schritt | Aktion | Erkennung | Auffindbarkeit | Verständnis | Ergebnis |
|---|---|---|---|---|---|
| 1 | „Ziele" finden | JA — fester Navigationspunkt | JA | JA | JA |
| 2 | Neues Ziel anlegen | JA — Button „Neues Ziel" | JA | JA | JA |
| 3 | Formular ausfüllen | JA — Felder beschriftet | JA | JA — Beispielziele helfen | JA |
| 4 | Speichern | JA | JA | JA | JA |

**Befunde:** Keine.

---

## 6. Aufgabe: Tagesaktivität dokumentieren

**Nutzerziel:** Eintragen, dass eine geplante Aktivität erledigt wurde.
**Einstiegsseite:** `/pflegecoach/wochenplan` oder `/pflegecoach/alltag`

| Schritt | Aktion | Erkennung | Auffindbarkeit | Verständnis | Ergebnis |
|---|---|---|---|---|---|
| 1 | Wochenplan/Alltag finden | JA — zwei Navigationspunkte | UNSICHER — „Wochenplan" und „Alltag" könnten als überlappend empfunden werden | JA | UNSICHER |
| 2 | Heutige Aktivität finden | JA — Tagesansicht | JA | JA | JA |
| 3 | Als erledigt markieren | JA — Checkbox oder Button | JA | JA | JA |

**Befund B-6.1 (UNSICHER):** Zwei Navigationspunkte für verwandte Funktionen
(„Wochenplan" und „Alltag") können verwirren. Zusammenlegung oder klarere
Abgrenzung wäre sinnvoll. **Schwere:** gering.

---

## 7. Aufgabe: Bericht erstellen

**Nutzerziel:** Etwas erstellen, das man einer Fachperson zeigen kann.
**Einstiegsseite:** `/pflegecoach` → Navigation „Bericht" → `/pflegecoach/bericht`

| Schritt | Aktion | Erkennung | Auffindbarkeit | Verständnis | Ergebnis |
|---|---|---|---|---|---|
| 1 | „Bericht" finden | JA — fester Navigationspunkt | JA | JA | JA |
| 2 | Bericht erzeugen/ansehen | JA — Button oder automatische Anzeige | JA | JA | JA |
| 3 | Drucken/exportieren | JA — Druckfunktion/Download | JA | JA | JA |

**Befunde:** Keine.

---

## 8. Aufgabe: Nutzung beenden und Daten löschen

**Nutzerziel:** Die Nutzung endgültig beenden und alle Daten entfernen.
**Einstiegsseite:** `/pflegecoach/einstellungen` → „Konto" →
`/pflegecoach/einstellungen/konto`

| Schritt | Aktion | Erkennung | Auffindbarkeit | Verständnis | Ergebnis |
|---|---|---|---|---|---|
| 1 | Einstellungen finden | JA — Navigation | JA | JA | JA |
| 2 | „Nutzung beenden" finden | JA — eigene Sektion in den Einstellungen | JA | JA | JA |
| 3 | Konsequenzen verstehen | JA — Warnung und Erklärung vor der Aktion | JA | JA — „alle Daten werden gelöscht" ist unmissverständlich | JA |
| 4 | Bestätigung eingeben | JA — Bestätigungswort „LÖSCHEN" | JA | UNSICHER — ältere Nutzer könnten Schwierigkeiten mit der exakten Eingabe haben | UNSICHER |
| 5 | Export vor Löschung nutzen | JA — wird vor der Löschung angeboten | JA | JA | JA |

**Befund B-8.1 (UNSICHER):** Das Bestätigungswort „LÖSCHEN" setzt Tippgenauigkeit
voraus. Ein Checkbox-Verfahren wäre barriereärmer. **Schwere:** gering (Sicherheits-
maßnahme vs. Zugänglichkeit — bewusste Entscheidung, kein Fehler).

---

## 9. Aufgabe: Support kontaktieren

**Nutzerziel:** Hilfe holen, wenn etwas nicht funktioniert.
**Einstiegsseite:** Beliebige PflegeCoach-Seite (Fußzeile) oder
`/pflegecoach/anfrage`

| Schritt | Aktion | Erkennung | Auffindbarkeit | Verständnis | Ergebnis |
|---|---|---|---|---|---|
| 1 | Supportadresse finden | JA — in der Fußzeile jeder Seite | JA | JA | JA |
| 2 | Anfrageseite finden | JA — Link in Fußzeile und Einstellungen | JA | JA | JA |
| 3 | Anfrage senden | JA — Formular mit Freitextfeld | JA | JA | JA |

**Befunde:** Keine.

---

## Zusammenfassung der Befunde

| Nr. | Aufgabe | Befund | Schwere | Handlungsbedarf |
|---|---|---|---|---|
| B-2.1 | Einwilligung | Langer Einwilligungstext | gering | Kurzfassung mit Aufklapper erwägen |
| B-3.1 | Schriftgröße | Buttons ohne Tooltip | gering | Tooltips ergänzen |
| B-4.1 | Assessment | Fachbegriff „Assessment" | gering | Untertitel mit Alltagssprache |
| B-6.1 | Tagesaktivität | Überlappung Wochenplan/Alltag | gering | Abgrenzung oder Zusammenlegung |
| B-8.1 | Löschung | Tippgenauigkeit beim Bestätigungswort | gering | Checkbox-Alternative erwägen |

**Gesamtergebnis:** Keine Befunde mit Schwere „hoch" oder „kritisch". Alle
Kernaufgaben sind analytisch ohne Hilfe lösbar. Die fünf UNSICHER-Befunde
betreffen UX-Optimierungen, keine regulatorisch relevanten Hürden. Die Aufgaben
A1 (Zweckbestimmung verstehen) und A8/A9 (Nutzung beenden, Support finden) —
die beiden regulatorisch gewichtigen Prüfpunkte — bestehen ohne Einschränkung.

**Nächster Schritt:** Summative Validierung mit der Zielgruppe (Anlage 2 IV
Nr. 3, Nr. 10, Nr. 12) — erfordert echte Testpersonen und ist nicht analytisch
ersetzbar. Der Durchführungsplan steht in
`audit/dipa/gebrauchstauglichkeit_durchfuehrungsplan.md`.

---

*Durchgeführt am 15.08.2026 durch das Produktteam Alltagsengel (analytisch).*
