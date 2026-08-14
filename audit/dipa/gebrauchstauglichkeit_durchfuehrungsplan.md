# Gebrauchstauglichkeit — Durchführungsplan

**Produkt:** Digitaler PflegeCoach · **Version:** 0.5.0 · **Stand:** 2026-08-14
**Deckt ab:** DiPA-Matrix BF-02, BF-03 (Vorbereitung) · **Status:** INTERN OFFEN — Durchführung steht aus
**Ergänzt:** `audit/dipa/gebrauchstauglichkeit_testprotokoll.md` (Aufnahmebogen)

---

## 0. Was fehlt und warum

Es existiert ein Protokollbogen, aber **keine durchgeführte Prüfung**. Der
Grund ist kein technischer: Es fehlen Testpersonen aus der Zielgruppe. Ohne
sie ist BF-02 nicht erfüllbar — und mit Ersatzpersonen aus dem Umfeld wäre
das Ergebnis wertlos, weil genau die Merkmale fehlen, um die es geht
(hohes Alter, eingeschränkte Feinmotorik, geringe Technikerfahrung).

Was intern erstellt werden kann, ist alles außer der Durchführung: Wer
getestet wird, womit, in welcher Reihenfolge, mit welchen Abbruchregeln und
welchen Erfolgskriterien. Genau das steht hier. Damit ist die Prüfung
terminierbar, sobald Testpersonen gefunden sind.

## 1. Testpersonen

**Mindestumfang:** 5 Personen. Begründung für diese Zahl: Bei
Gebrauchstauglichkeitstests findet die fünfte Person erfahrungsgemäß kaum
noch neue Bedienprobleme; mehr Personen erhöhen den Aufwand stärker als den
Erkenntnisgewinn. Für einen Zulassungsnachweis kann eine höhere Zahl
verlangt werden — das ist bei der BfArM-Beratung mitzuklären (REG-05).

**Zusammensetzung:**

| Nr. | Merkmal | Warum diese Person |
|---|---|---|
| 1 | Pflegebedürftig, Pflegegrad 1–2, lebt zu Hause | Kernzielgruppe |
| 2 | Pflegebedürftig, Pflegegrad 3+, nutzt Hilfsmittel | Höherer Unterstützungsbedarf |
| 3 | Pflegende/r Angehörige/r, berufstätig | Zweite Kernzielgruppe, Nutzung unter Zeitdruck |
| 4 | Person über 75 mit geringer Technikerfahrung | Prüft die Einstiegshürde |
| 5 | Person mit Seheinschränkung **oder** eingeschränkter Feinmotorik | Prüft die Barrierefreiheit im tatsächlichen Gebrauch |

**Ausschluss:** Mitarbeitende, Angehörige des Teams und Personen, die das
Produkt bereits kennen. Wer das Produkt kennt, misst nicht die
Gebrauchstauglichkeit, sondern seine Erinnerung.

**Vor dem Test einzuholen:** Einwilligung in die Teilnahme und in die
Protokollierung; Hinweis, dass keine Gesundheitsdaten erhoben werden und
dass mit Testkonten gearbeitet wird. Nach dem Test werden die Testkonten
gelöscht.

## 2. Aufgaben

Jede Aufgabe wird ohne Anleitung gestellt. Der Beobachter greift erst ein,
wenn die Person aufgibt oder das Zeitlimit erreicht ist.

| Nr. | Aufgabe | Zeitlimit | Erfolgskriterium |
|---|---|---|---|
| A1 | „Finden Sie heraus, was dieses Angebot ist und was es nicht ist." | 3 min | Person nennt sinngemäß: Unterstützung im Alltag, **keine** medizinische Beratung |
| A2 | „Richten Sie sich ein und stimmen Sie der Datenverarbeitung zu." | 5 min | Onboarding abgeschlossen, Einwilligung bewusst erteilt |
| A3 | „Stellen Sie die Schrift größer." | 2 min | Schriftgrad geändert, ohne fremde Hilfe |
| A4 | „Schätzen Sie ein, wie selbständig Sie im Alltag sind." | 6 min | Assessment vollständig ausgefüllt |
| A5 | „Nehmen Sie sich etwas vor, das Sie regelmäßig tun wollen." | 6 min | Ziel angelegt |
| A6 | „Tragen Sie ein, dass Sie es heute getan haben." | 3 min | Erledigung erfasst |
| A7 | „Erstellen Sie etwas, das Sie Ihrer Hausärztin zeigen können." | 5 min | Bericht erzeugt oder Export ausgelöst |
| A8 | „Beenden Sie die Nutzung und löschen Sie Ihre Daten." | 5 min | Weg gefunden, Folgen verstanden |
| A9 | „Wo würden Sie sich melden, wenn etwas nicht funktioniert?" | 2 min | Supportadresse oder Anfrageseite gefunden |

**A1 und A8 sind die wichtigsten Aufgaben.** A1 prüft, ob die
Zweckbestimmung tatsächlich ankommt — die Grundlage der
MDR-Negativabgrenzung. A8 prüft die Zusage, dass die Nutzung ohne Hürde
beendbar ist (VS-03). Scheitert eine dieser beiden, ist das ein Befund mit
regulatorischem Gewicht, kein Bedienungsdetail.

## 3. Erhebung je Aufgabe

| Größe | Erfassung |
|---|---|
| Erfolg | selbständig / mit Hinweis / abgebrochen |
| Dauer | Sekunden |
| Fehlversuche | Anzahl falscher Wege |
| Hilfebedarf | Anzahl der Eingriffe des Beobachters |
| Äußerungen | wörtlich notiert (lautes Denken) |
| Sichtbare Belastung | Notiz des Beobachters |

Der Bogen dafür ist `audit/dipa/gebrauchstauglichkeit_testprotokoll.md`.

## 4. Bewertungsmaßstab

| Ergebnis | Bedeutung | Folge |
|---|---|---|
| ≥ 4 von 5 Personen lösen die Aufgabe selbständig | tragfähig | keine Änderung nötig |
| 2–3 von 5 | Bedienproblem | Änderung vor dem Pilotstart |
| ≤ 1 von 5 | schwerwiegend | Änderung **und** Wiederholung des Tests mit neuen Personen |

Zusätzlich gilt unabhängig von der Quote: Jeder Abbruch bei A1 oder A8 ist
ein schwerwiegender Befund.

## 5. Screenreader-Durchgang (BF-03)

Getrennt von den Aufgabentests, weil eine andere Frage geprüft wird: nicht
„findet die Person den Weg", sondern „ist der Weg überhaupt hörbar".

**Umfang:** dieselben Seiten wie in den Aufgaben A1–A9, jeweils mit
VoiceOver (macOS/iOS) und NVDA (Windows).

**Prüfpunkte:**

| Nr. | Frage |
|---|---|
| S1 | Wird der Seitentitel beim Wechsel angesagt? |
| S2 | Ist die Sprungmarke zum Inhalt erreichbar und wirksam? |
| S3 | Sind Überschriftenebenen sinnvoll und sprungfähig? |
| S4 | Trägt jedes Formularfeld eine vorgelesene Beschriftung? |
| S5 | Werden Fehlermeldungen und Bestätigungen angesagt? |
| S6 | Sind Schaltflächen an ihrem Namen erkennbar („Erteilen" statt „Klicken")? |
| S7 | Ist der QR-Code der Anmeldesicherheit mit einem Alternativweg hinterlegt? |
| S8 | Ist die Seite vollständig mit der Tastatur bedienbar, ohne Fokusfalle? |

**Was bereits maschinell geprüft ist** (`e2e/pflegecoach.spec.ts`): genau
eine Hauptüberschrift je Seite, eindeutige Seitentitel, vorhandene
Sprungmarke, Landmarks, Zielgrößen ≥ 44 px, beschriftete Formularfelder,
kein seitlicher Überlauf bei 200 % Schrift. Das sind die strukturellen
Voraussetzungen — **kein Ersatz** für den Durchgang mit einem
Screenreader, denn ob eine Ansage *verständlich* ist, kann keine
Maschine beurteilen.

## 6. Abgrenzung zu BF-01

Dieser Plan erzeugt **keinen** Barrierefreiheits-Nachweis nach EN 301 549 /
WCAG 2.1 AA. Der verlangt eine Prüfung durch eine unabhängige Prüfstelle
(BITV-Test) und bleibt extern (BF-01). Aufgabentests und
Screenreader-Durchgang können intern erfolgen und sind für die
Zielgruppe aussagekräftiger — sie ersetzen die Prüfstelle aber nicht.

## 7. Aufwand

| Posten | Umfang |
|---|---|
| Vorbereitung, Testkonten | 0,5 Tage |
| Durchführung | 5 × ca. 60 min, verteilt auf 2 Tage |
| Screenreader-Durchgang | 1 Tag |
| Auswertung und Protokoll | 1 Tag |

Der eigentliche Engpass ist nicht der Aufwand, sondern die Gewinnung der
Testpersonen.

## 8. Status

Nicht durchgeführt. Keine Testperson gewonnen, kein Termin.
**Nächster Schritt:** Testpersonen ansprechen — naheliegend über den
eigenen Pflegedienstbetrieb, wobei Personen ohne Vorkenntnis des Produkts
auszuwählen sind.
