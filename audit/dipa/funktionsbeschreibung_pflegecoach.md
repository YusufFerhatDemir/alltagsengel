# Funktionsbeschreibung — Digitaler PflegeCoach

**Stand:** 2026-08-13
**Status:** ENTWURF — aus dem Quellcode abgeleitet
**Geltungsbereich:** alles unter `app/pflegecoach/**`, `app/api/coach/**`,
`app/api/dipa/**`, `lib/coach/**` sowie die Migrationen `20260819010000` und
`20260826010000`

---

## Wie diese Liste zu lesen ist

Jede Funktion ist mit der Stelle im Code verknüpft, an der sie tatsächlich
umgesetzt ist. Was hier steht, ist im Repository nachprüfbar. Funktionen, die
nur geplant sind, stehen in §9 — nicht in den Tabellen darüber.

Die Spalte **Sichtbar** sagt, ob die Funktion im Auslieferungszustand (alle
Produktschalter aus) für Nutzende erreichbar ist.

---

## 1. Zugang und Profil

| Funktion | Umsetzung | Sichtbar |
|----------|-----------|----------|
| Einstiegsseite mit Zweckbestimmung und Negativabgrenzung, auch ohne Anmeldung | `app/pflegecoach/start/page.tsx` | ja |
| Onboarding: Rolle wählen (`pflegebeduerftig`, `angehoerig`, `pflegedienst`), Anzeigename, Pflegegrad, Geburtsjahr — alle Angaben außer der Rolle freiwillig | `app/api/coach/profil` (POST), `coach_users` | ja |
| Anlegen des Profils ist erst nach ausdrücklicher Einwilligung in die Verarbeitung von Gesundheitsdaten möglich | `app/api/coach/profil`, `app/api/coach/consents` | ja |
| Profil ändern | `app/api/coach/profil` (PATCH) | ja |
| Anmeldung über das Plattform-Konto; kein eigenes Passwortverfahren im Produkt | `lib/coach/api-auth.ts` | ja |

## 2. Assessment und Verlauf

| Funktion | Umsetzung | Sichtbar |
|----------|-----------|----------|
| Selbsteinschätzung in fünf Lebensbereichen, Skala 0–4 | `app/pflegecoach/assessment`, `coach_assessments` | ja |
| Unterscheidung Erst- und Verlaufsassessment | `coach_assessments.assessment_typ` | ja |
| Ergänzende Freitextangaben: Hilfsmittel, Wohnsituation, Notizen | `coach_assessments` | ja |
| Zeitreihe je Bereich über alle Erhebungen | `app/pflegecoach/verlauf`, `lib/coach/assessment.ts` | ja |
| Vergleich zweier Erhebungen mit Angabe der Veränderung je Bereich | `vergleicheAssessments()`, `verschlechterteBereiche()` in `lib/coach/assessment.ts` | ja |
| Keine Auswertung, keine Deutung, keine Einstufung der Werte | bewusste Auslassung; Verbotsliste in `lib/coach/empfehlungen.ts` | — |

## 3. Ziele

| Funktion | Umsetzung | Sichtbar |
|----------|-----------|----------|
| Ziel anlegen mit Titel, Beschreibung, Bereich | `app/api/coach/ziele` (POST), `coach_goals` | ja |
| Messbarkeit: Messgröße, Startwert, Zielwert, aktueller Wert | `coach_goals` | ja |
| Terminierung: Startdatum, Zieldatum | `coach_goals` | ja |
| Statuspflege: aktiv, erreicht, angepasst, pausiert, beendet | `app/api/coach/ziele/[id]` (PATCH) | ja |
| Anpassungsgrund dokumentieren | `coach_goals.anpassungs_notiz` | ja |
| Fünf Zielbereiche inkl. „Entlastung Angehöriger" | `ZielBereich` in `lib/coach/types.ts` | ja |

## 4. Wochenplan und Erledigung

| Funktion | Umsetzung | Sichtbar |
|----------|-----------|----------|
| Wiederkehrende Aktivität anlegen: Titel, Kategorie, Wochentage, Uhrzeit, Dauer | `app/api/coach/aktivitaeten` (POST), `coach_activities` | ja |
| Sechs Kategorien inkl. `erinnerung` (reine Kalenderfunktion) | `AktivitaetKategorie` in `lib/coach/types.ts` | ja |
| Aktivität an ein Ziel binden; Ziel-Löschung lässt die Aktivität bestehen | `coach_activities.goal_id`, `ON DELETE SET NULL` | ja |
| Aktivität ändern oder deaktivieren | `app/api/coach/aktivitaeten/[id]` (PATCH) | ja |
| Erledigung festhalten: erledigt, teilweise, ausgelassen, mit Notiz | `app/api/coach/aktivitaeten/log`, `coach_activity_log` | ja |
| Genau ein Eintrag je Aktivität und Tag | UNIQUE `(activity_id, datum)` | ja |

## 5. Inhalte

| Funktion | Umsetzung | Sichtbar |
|----------|-----------|----------|
| Vier allgemeine Bewegungsübungen mit Schritten, Zielangabe, Dauer und **je eigenem Sicherheitshinweis** | `UEBUNGEN` in `lib/coach/inhalte.ts`, `/pflegecoach/mobilitaet` | ja |
| Wohnraum-Sicherheits-Check mit acht Prüfpunkten | `WOHNRAUM_CHECK`, `/pflegecoach/mobilitaet` | ja |
| Fünf Wissensmodule, nach Zielgruppe gefiltert | `WISSEN_MODULE`, `/pflegecoach/alltag`, `/pflegecoach/angehoerige` | ja |
| Sichtbarer Hinweis an jedem Inhalt, dessen fachliche Prüfung aussteht | `pruefstatus`, `INHALT_ENTWURF_HINWEIS` | ja |
| Statische Verweise auf Notruf 112, Bereitschaftsdienst 116 117, Pflegeberatung nach § 7a SGB XI | Inhalte + Fußzeile in `CoachShell.tsx` | ja |

## 6. Messungen

| Funktion | Umsetzung | Sichtbar |
|----------|-----------|----------|
| Belastungs-Selbsteinschätzung, sieben Items | `lib/coach/belastung.ts`, `/pflegecoach/belastung` | ja |
| Summenwert wird **serverseitig** berechnet — der Client kann ihn nicht setzen | `app/api/coach/messungen` (POST) | ja |
| Sturzereignis als Selbstbericht | `coach_measurements.instrument = 'sturzereignis'` | ja |
| Vorbereitete Instrumentenkennungen für die Evaluation: FES-I Kurzform, BSFC-s, SUS, Selbsteinschätzung Selbständigkeit, Befinden | `MessInstrument` in `lib/coach/types.ts` | Kennung vorhanden, Erhebung im Produkt noch nicht |
| Messzeitpunkte t0–t3 und `laufend` | `coach_measurements.messzeitpunkt` | ja |
| Keine Deutung, kein Schwellenwert mit Bedeutungsanspruch | bewusste Auslassung | — |

## 7. Hinweise, Berichte, Export

| Funktion | Umsetzung | Sichtbar |
|----------|-----------|----------|
| Sechs regelbasierte, rein organisatorische Hinweise (§2.4 in `pflegeprobleme_pflegeziele.md`) | `berechneEmpfehlungen()` in `lib/coach/empfehlungen.ts`, `app/api/coach/empfehlungen` | ja |
| Fester Hinweistext an jeder Hinweisliste | `EMPFEHLUNG_DISCLAIMER` | ja |
| Verlaufsbericht für einen Zeitraum als unveränderlicher Snapshot | `buildVerlaufsbericht()`, `app/api/coach/berichte` (POST), `coach_reports` | ja |
| Druckansicht des Berichts (PDF über die Druckfunktion des Browsers) | `/pflegecoach/bericht`, `@media print` in `pflegecoach.css` | ja |
| Vollständiger Datenexport als JSON in dokumentiertem Schema | `buildExport()`, `app/api/coach/export`, `lib/coach/export.schema.json` | ja |
| Export enthält keine internen Kennungen und keine Plattform-Nutzer-ID | erzwungen durch Unit-Test in `lib/coach/export.test.ts` | — |

Details: `exportfunktionen.md`.

## 8. Einwilligungen, Freigaben, Löschung

| Funktion | Umsetzung | Sichtbar |
|----------|-----------|----------|
| Drei getrennte Einwilligungsarten mit Textversion und Zeitstempel | `coach_consents`, `app/api/coach/consents` | ja |
| Widerruf jederzeit, einzeln je Einwilligung, protokolliert | `/pflegecoach/einstellungen` | ja |
| Lesefreigabe an Angehörige oder Pflegedienst, jederzeit widerruflich | `coach_shares` + Zugriffsregeln | Datenmodell ja, Oberfläche nein (GAP-SHARES-UI) |
| Vorschau der zu löschenden Datenmengen vor der Löschung | `app/api/coach/loeschung` (GET) | ja |
| Produktbezogene Löschung ohne Verlust des Plattformkontos, mit Bestätigungswort | `app/api/coach/loeschung` (DELETE), `/pflegecoach/loeschung` | ja |
| Export wird **vor** der Löschung angeboten | `/pflegecoach/loeschung` | ja |
| Produktbezogene Datenschutzhinweise | `/pflegecoach/datenschutz` | ja |

Details: `einwilligungslogik.md`, `loeschkonzept.md`.

## 9. Barrierefreiheit

| Funktion | Umsetzung | Sichtbar |
|----------|-----------|----------|
| Drei Schriftgrößen (100 %, 120 %, 145 %) | `CoachShell.tsx`, `--pc-scale`, `coach_users.a11y_schriftgrad` | ja |
| Kontrastmodus | `data-pc-kontrast` in `pflegecoach.css`, `coach_users.a11y_kontrast` | ja |
| Einstellungen wirken sofort (lokal) und gelten geräteübergreifend (serverseitig) | `CoachShell.tsx` + `app/api/coach/profil` (PATCH) | ja |
| Sprunglink zum Inhalt, Kennzeichnung der aktuellen Seite in der Navigation | `CoachShell.tsx` | ja |
| Eigener Dokumenttitel je Bereich | `app/pflegecoach/_lib/seitentitel.ts` + Segment-Layouts | ja |
| Ansage des Bereichswechsels für Screenreader | Live-Bereich in `CoachShell.tsx` | ja |
| Bedienziele ≥ 48 px, sichtbarer Tastaturfokus, reduzierte Bewegung respektiert | `pflegecoach.css` | ja |

Details: `barrierefreiheit_pflegecoach.md`.

## 10. Funktionen, die nur bei gesetztem Schalter existieren

Diese Funktionen sind vollständig gebaut, im Auslieferungszustand aber weder in
der Oberfläche noch über die Schnittstelle erreichbar.

| Funktion | Schalter | Umsetzung | Verhalten ohne Schalter |
|----------|----------|-----------|------------------------|
| Anspruchsprüfung als versionierte Selbstauskunft | `COACH_DIPA_MODUS` | `lib/coach/anspruch.ts`, `app/api/coach/anspruch`, `/pflegecoach/anspruch` | Seite leitet um, API antwortet ablehnend |
| Freischaltcode einlösen | `COACH_DIPA_MODUS` oder `COACH_FREISCHALTUNG_PFLICHT` | `lib/coach/freischaltung.ts`, `app/api/coach/freischaltung` | Seite leitet um, Navigationspunkt existiert nicht |
| Erfassung pseudonymer Nutzungsereignisse | `COACH_NUTZUNGSNACHWEIS_AKTIV` **und** Einwilligung `wissenschaftliche_auswertung` | `app/api/coach/nutzung`, `coach_nutzungsereignisse` | es wird nichts geschrieben |

Ein unverifiziertes Anspruchskriterium führt in `lib/coach/anspruch.ts` **nie**
zum Ausschluss — im Zweifel lautet das Ergebnis „unklar", nie „kein Anspruch".
Das Ergebnis ist ausdrücklich keine Anspruchsentscheidung.

## 11. Betriebsfunktionen außerhalb des Produkts

Nicht Teil der Produktoberfläche; ausschließlich im Verwaltungsbereich und mit
Mandantengrenze. Sie kommen an Gesundheitsdaten nicht heran.

| Funktion | Umsetzung |
|----------|-----------|
| Freischaltcodes ausgeben, sperren, Status pflegen — Klartext erscheint genau einmal | `app/api/dipa/codes`, `app/api/dipa/codes/[id]` |
| Abrechnungswege konfigurieren — Schlüssel und Beschreibung, **keine Beträge** | `app/api/dipa/abrechnungswege`, `coach_abrechnungswege` |
| Aggregierte Nutzungskennzahlen für die Evaluation | `app/api/dipa/nachweise`, `lib/coach/nachweise.ts` |
| Nachweis ergänzender Unterstützungsleistungen und Qualifikationen der Erbringenden | `eul_erbringungen`, `eul_qualifikationen`, `lib/coach/eul.ts` |
| Stand der Zulassungsanforderungen, maschinenlesbar | `lib/coach/anforderungskatalog.ts` |

Die Kennzahlenauswertung gibt **nie** Einzelzeilen und **nie** Pseudonyme aus und
unterdrückt Angaben unterhalb von fünf Teilnehmenden (`lib/coach/nachweise.ts`).

`istAbrechnungsbereit()` in `lib/coach/abrechnung.ts` ist fail-closed: Ohne
hinterlegte Vergütungsvereinbarung (`verguetung_geklaert`) gibt es keinen
abrechnungsbereiten Weg. Vergütungshöhen sind nirgends im System hinterlegt.

## 12. Ausdrücklich nicht vorhandene Funktionen

Die Auslassung ist hier die Funktion. Jede dieser Zeilen ist eine bewusste
Entscheidung, keine Lücke:

* keine Diagnostik, keine Risiko-Scores, keine Deutung von Messwerten
* keine individualisierte Übungsanpassung anhand von Gesundheitsdaten
* keine Medikamenten-Dosierlogik; `erinnerung` ist eine Kalenderkategorie
* keine Notruf- oder Überwachungsfunktion, keine Ortung, keine Sensoren
* keine generative KI, kein Chat, keine Freitext-Auswertung
* keine Werbung, keine Tracker, keine Empfehlung von Leistungen des Herstellers
* kein administrativer Lesezugriff auf Gesundheitsdaten und kein Supportweg dorthin
* keine Aussage zu Kostenübernahme, Erstattung oder Preisen

## 13. Geplant, aber nicht gebaut

| Vorhaben | Stand |
|----------|-------|
| Oberfläche zur Verwaltung von Freigaben (einladen, widerrufen) | GAP-SHARES-UI |
| Push- oder lokale Benachrichtigungen für Erinnerungen | GAP-PUSH |
| Abbildung der Coach-Daten in einem verbindlichen Austauschformat | GAP-INTEROP, siehe `interoperabilitaet_pflegecoach.md` |
| Erhebung der validierten Evaluationsinstrumente im Produkt (Kennungen liegen vor) | GAP-INSTRUMENTE |
| Zweiter Faktor bei der Anmeldung | GAP-MFA |

---

## Umfang in Zahlen (Stand 2026-08-13)

| Gegenstand | Anzahl |
|-----------|--------|
| Produktseiten unter `/pflegecoach` | 16 |
| Schnittstellen-Routen `app/api/coach/**` | 16 |
| Betriebs-Routen `app/api/dipa/**` | 4 |
| Fachmodule in `lib/coach/**` (ohne Tests) | 14 |
| Datenbanktabellen `coach_*` / `eul_*` | 18 |
| Produktschalter | 4 |

Diese Zahlen sind eine Momentaufnahme und beim nächsten Versionswechsel zu prüfen.
