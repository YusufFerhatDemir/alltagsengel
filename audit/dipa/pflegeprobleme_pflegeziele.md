# Pflegeprobleme und Pflegeziele — Digitaler PflegeCoach

**Stand:** 2026-08-13
**Status:** ENTWURF — fachliche Freigabe steht aus (GAP-QS)
**Bezug im Code:** `lib/coach/types.ts` (Bereiche), `lib/coach/inhalte.ts` (Inhalte),
`lib/coach/empfehlungen.ts` (Anstöße), `coach_assessments`, `coach_goals`,
`coach_activities`

---

## Vorbemerkung — was dieses Dokument ist und was nicht

Es beschreibt, **welche Pflegeprobleme das Produkt adressiert und mit welchen
Zielen** — als fachliche Grundlage für die Zweckbestimmung und für das
Evaluationskonzept.

Es ist ausdrücklich **kein Pflegeprozessinstrument**: Der PflegeCoach stellt
keine Pflegediagnosen, ordnet keine Probleme zu und leitet keine Maßnahmen
automatisch ab. Die hier beschriebenen Probleme sind die **fachliche
Konstruktionsgrundlage** des Produkts; im Produkt selbst wählt die nutzende
Person ihre Ziele selbst.

Verwendete Bezugsrahmen sind die fünf Lebensbereiche des Produkts. Sie orientieren
sich an den Modulen der Pflegebegutachtung, sind aber **keine** Nachbildung davon
und erzeugen **keine** Einstufung. Die Ordnungsrahmen der Pflegefachlichkeit
(z. B. Strukturmodell/SIS, Expertenstandards) sind hier nicht abgebildet — ihre
Anwendbarkeit auf ein Selbstmanagement-Produkt ist Teil der ausstehenden
pflegefachlichen Prüfung.

---

## 1. Adressierte Pflegeprobleme

Jedes Problem ist mit dem Produktbereich verknüpft, in dem es bearbeitet wird,
und mit der Stelle im Code, an der die Bearbeitung stattfindet.

### P1 — Nachlassende Mobilität und Sturzgefährdung

| | |
|---|---|
| **Problem** | Kraft, Gleichgewicht und Gehsicherheit lassen nach; Wege in der Wohnung werden vermieden; nach einem Sturz entsteht Angst vor dem nächsten, die Bewegung weiter reduziert. |
| **Warum es zählt** | Bewegungsvermeidung beschleunigt den Abbau. Der Verlauf ist schleichend und deshalb ohne Dokumentation kaum wahrnehmbar. |
| **Bearbeitung im Produkt** | Vier allgemeine Alltagsübungen mit je eigenem Sicherheitshinweis (`UEBUNGEN` in `lib/coach/inhalte.ts`); Wohnraum-Sicherheits-Check als Checkliste mit acht Punkten (`WOHNRAUM_CHECK`); Sturzereignis als Selbstbericht (`coach_measurements.instrument = 'sturzereignis'`); Verlauf im Bereich Mobilität. |
| **Grenze** | Keine Sturzrisiko-Berechnung, kein Score, keine individualisierte Übungsauswahl anhand von Gesundheitsdaten. Ein gemeldeter Sturz führt zu genau einem Hinweis: das Ereignis mit Hausarztpraxis oder Pflegeberatung besprechen (`empfehlungen.ts`, Regel 6). |

### P2 — Verlust von Selbständigkeit in der Selbstversorgung

| | |
|---|---|
| **Problem** | Körperpflege, Ankleiden, Zubereitung von Mahlzeiten, ausreichendes Trinken werden zunehmend anstrengend; Tätigkeiten werden ganz abgegeben, obwohl Teilschritte noch selbst möglich wären. |
| **Warum es zählt** | Vollständige Übernahme durch andere ist bequem und kostet Fähigkeit. Erhalt gelingt eher über Energieeinteilung und Hilfsmittel als über Anstrengung. |
| **Bearbeitung im Produkt** | Wissensmodul „Selbstversorgung im Alltag erleichtern" (Energieeinteilung, kleine Hilfsmittel, Trinken); Selbsteinschätzung im Bereich Selbstversorgung; Ziele mit Messgröße; Aktivitäten der Kategorie `selbstversorgung`. |
| **Grenze** | Keine Ernährungs- oder Flüssigkeitsberechnung, keine Hilfsmittelempfehlung für den Einzelfall — nur der Verweis auf Pflegekasse und Sanitätshaus. |

### P3 — Fehlende Tagesstruktur

| | |
|---|---|
| **Problem** | Ohne Arbeits- oder Familienrhythmus verlieren Tage ihre Gliederung; Vorhaben werden verschoben, bis sie entfallen. |
| **Warum es zählt** | Struktur ist die Voraussetzung dafür, dass alle anderen Maßnahmen überhaupt stattfinden — sie ist im Produkt der Träger von P1, P2 und P4. |
| **Bearbeitung im Produkt** | Wochenplan mit wiederkehrenden Aktivitäten (`coach_activities`: Wochentage, Uhrzeit, Dauer, Kategorie, optionale Zielbindung); Erledigungserfassung mit drei Stufen — erledigt, teilweise, ausgelassen (`coach_activity_log`); Hinweis zur Anpassung, wenn eine Aktivität über 14 Tage seltener als zur Hälfte umgesetzt wurde. |
| **Grenze** | Erinnerungen sind Kalendereinträge. Keine Push-Benachrichtigung, keine Medikamenten-Logik — die Kategorie `erinnerung` ist rein organisatorisch. |

### P4 — Rückzug und fehlende Teilhabe

| | |
|---|---|
| **Problem** | Kontakte brechen ab, weil das Aus-dem-Haus-Gehen schwerer wird; Beschäftigungen, die Sinn stifteten, entfallen. |
| **Warum es zählt** | Teilhabe ist eine eigenständige Dimension der Selbständigkeit, nicht eine Folge der körperlichen. |
| **Bearbeitung im Produkt** | Wissensmodul „Kontakte und Beschäftigung pflegen"; Zielbereich `soziale_teilhabe`; Aktivitätskategorie `soziale_teilhabe` — Kontakte werden zu festen Terminen im Wochenplan. |
| **Grenze** | Keine Vermittlung von Angeboten, keine Verzeichnisse, kein Kontakt zu Anbietern — nur der Hinweis auf Pflegestützpunkte und Angebote vor Ort. Ausdrücklich auch keine Bewerbung von Leistungen des Herstellers. |

### P5 — Überlastung der pflegenden Angehörigen

| | |
|---|---|
| **Problem** | Dauerbelastung ohne Pausen, fehlendes Wissen über Entlastungsangebote, körperliche Belastung durch ungünstige Bewegungstechnik, Zögern, Hilfe anzunehmen. |
| **Warum es zählt** | Die Stabilität der häuslichen Versorgung hängt an der pflegenden Person. Fällt sie aus, endet die häusliche Versorgung — unabhängig vom Zustand der pflegebedürftigen Person. |
| **Bearbeitung im Produkt** | Belastungs-Selbsteinschätzung mit sieben Items (`lib/coach/belastung.ts`, `coach_measurements.instrument = 'belastung_kurz'`), Summenwert **serverseitig** berechnet; Wissensmodule „Entlastungsangebote", „Auf sich selbst achten", „Rückenschonend unterstützen"; Zielbereich `entlastung_angehoerige`; Hinweis auf Entlastungsangebote, wenn die Selbsteinschätzung hoch ist oder steigt. |
| **Grenze** | Das 7-Item-Kurzinstrument ist **nicht validiert** und im Produkt als Verlaufsanzeige gekennzeichnet — nicht als Messung einer Belastungsstärke und nicht als Studienendpunkt (GAP-INSTRUMENTE). Keine Deutung des Summenwerts, keine Einstufung, kein Schwellenwert mit Bedeutungsanspruch. |

### P6 — Unsichtbarkeit des eigenen Verlaufs

| | |
|---|---|
| **Problem** | Veränderungen über Monate sind aus der Erinnerung nicht rekonstruierbar. Im Gespräch mit Hausarztpraxis, Pflegeberatung oder Pflegedienst fehlt eine geordnete Grundlage. |
| **Warum es zählt** | Ohne Verlauf ist jede Anpassung von Zielen und Maßnahmen ein Bauchgefühl. |
| **Bearbeitung im Produkt** | Wiederholtes Verlaufsassessment (`assessment_typ = 'verlaufsassessment'`) mit Zeitreihe je Bereich; Verlaufsbericht als unveränderlicher Snapshot (`coach_reports`) mit Druckansicht; Hinweis, wenn die letzte Selbsteinschätzung über acht Wochen zurückliegt. |
| **Grenze** | Die Darstellung zeigt Werte und ihre Veränderung. Sie bewertet sie nicht, färbt sie nicht ein und leitet daraus keine Aussage über den Gesundheitszustand ab. |

---

## 2. Pflegeziele

### 2.1 Übergeordnete Ziele des Produkts

Diese Ziele sind die Übersetzung der Zweckbestimmung in überprüfbare Absichten.
Sie sind nicht die Ziele einer einzelnen Person, sondern die des Produkts.

| ID | Ziel | Adressierte Probleme | Woran es im Produkt sichtbar wird |
|----|------|---------------------|-----------------------------------|
| Z1 | Vorhandene Selbständigkeit erhalten, nicht ersetzen | P1, P2 | Ziele und Aktivitäten setzen an Teilschritten an; Inhalte betonen Mitmachen statt Übernehmen |
| Z2 | Den Alltag verlässlich strukturieren | P3 | Wochenplan mit Erledigungserfassung; Anpassungshinweis bei geringer Umsetzung |
| Z3 | Veränderungen früh sichtbar machen | P6 | Verlaufsassessment mit Zeitreihe; Fälligkeitshinweis nach acht Wochen |
| Z4 | Pflegende Angehörige entlasten | P5 | eigener Bereich, Selbsteinschätzung, Wissen über gesetzliche Entlastungsangebote |
| Z5 | Teilhabe im Blick behalten | P4 | eigener Zielbereich und eigene Aktivitätskategorie |
| Z6 | Zu den zuständigen Stellen führen, statt sie zu ersetzen | alle | statische Verweise auf Hausarztpraxis, Pflegeberatung nach § 7a SGB XI, Notruf 112 und 116 117 |

### 2.2 Individuelle Ziele — Struktur im Produkt

Die nutzende Person legt ihre Ziele selbst an. Das Datenmodell (`coach_goals`)
erzwingt eine überprüfbare Form:

| Feld | Zweck | Pflicht |
|------|-------|---------|
| `titel` | Ziel in eigenen Worten | ja |
| `bereich` | einer der fünf Zielbereiche | ja |
| `messgroesse` | woran die Person es festmacht, z. B. „Spaziergänge pro Woche" | nein |
| `startwert` / `zielwert` / `aktueller_wert` | Ausgangslage, Absicht, Stand | nein |
| `start_am` / `ziel_bis` | Zeitrahmen | `start_am` ja |
| `status` | aktiv, erreicht, angepasst, pausiert, beendet | ja |
| `anpassungs_notiz` | warum das Ziel geändert wurde | nein |

Damit ist die SMART-Struktur **angeboten**, aber nicht erzwungen: Ein Ziel ohne
Messgröße bleibt speicherbar. Das ist Absicht — ein Formular, das ohne Zahl nicht
weitergeht, verhindert eher die Nutzung, als dass es die Qualität hebt.

`anpassungs_notiz` und der Status `angepasst` sind der Kern der
Nachvollziehbarkeit: Ein geändertes Ziel bleibt als geändertes Ziel erkennbar,
statt still überschrieben zu werden.

### 2.3 Verbindung Ziel → Maßnahme

Eine Aktivität kann über `coach_activities.goal_id` an ein Ziel gebunden werden.
Wird das Ziel gelöscht, bleibt die Aktivität bestehen (`ON DELETE SET NULL`) —
eine im Alltag etablierte Gewohnheit soll nicht verschwinden, nur weil das
zugehörige Ziel abgeschlossen wurde.

### 2.4 Anpassungsschleife

Der einzige Automatismus im Produkt ist ein **Anstoß zur Überprüfung** — nie eine
Anpassung selbst. Sechs Regeln, vollständig in `lib/coach/empfehlungen.ts`:

| Auslöser | Hinweis | Priorität |
|----------|---------|-----------|
| Zieltermin verstrichen, Ziel noch aktiv | Ziel überprüfen: erreicht, anpassen oder mehr Zeit? | 2 |
| Aktivität in 14 Tagen zu weniger als der Hälfte umgesetzt (mind. 4 geplante Termine) | Aktivität anpassen — andere Zeit, anderer Tag, kleinere Variante | 3 |
| Selbsteinschätzung in einem Bereich um ≥ 2 Stufen verschlechtert | Ziele und Aktivitäten in diesem Bereich überprüfen; bei Bedarf Pflegeberatung ansprechen | 1 |
| Letztes Assessment älter als 8 Wochen | Verlaufsassessment fällig | 2 |
| Belastungs-Selbsteinschätzung hoch oder gestiegen | Entlastungsangebote ansehen | 1 |
| Sturz in den letzten 4 Wochen berichtet | Ereignis ansprechen, Wohnraum-Check nutzen | 1 |

Jeder Hinweisliste liegt derselbe statische Text bei: Organisationshilfe, kein
Ersatz für ärztliche oder pflegefachliche Beratung (`EMPFEHLUNG_DISCLAIMER`).

**Was hier bewusst fehlt:** Es gibt keine Regel, die aus Daten auf einen Zustand
schließt. Die Schwelle „≥ 2 Stufen" löst keine Bewertung aus, sondern eine
Aufforderung, die eigenen Maßnahmen anzusehen. Diese Grenze ist im Code als
Verbotsliste dokumentiert und bei jeder Änderung einzuhalten.

---

## 3. Bezug zu den Nutzenkategorien

| Nutzendimension | Produktbeitrag | Probleme | Ziele |
|-----------------|----------------|----------|-------|
| Beeinträchtigungen der Selbständigkeit mindern | Erhalt von Teilschritten in Mobilität und Selbstversorgung | P1, P2 | Z1 |
| Einer Verschlimmerung entgegenwirken | frühe Sichtbarkeit von Veränderungen, Anstoß zur Anpassung | P1, P6 | Z1, Z3 |
| Häusliche Versorgung stabilisieren | verlässliche Struktur, Teilhabe, funktionsfähige Pflegeperson | P3, P4, P5 | Z2, Z4, Z5 |
| Pflegende Angehörige entlasten | Selbsteinschätzung, Wissen über Entlastungsangebote, Selbstsorge | P5 | Z4 |

Die Operationalisierung dieser Dimensionen für einen Nutzennachweis steht in
`evaluationskonzept.md`. Ein Nutzen wird hier **nicht behauptet** — dieses
Dokument beschreibt die Konstruktionsabsicht, nicht ihr Ergebnis.

---

## 4. Offene fachliche Punkte

| Punkt | Status |
|-------|--------|
| Pflegefachliche Prüfung und Freigabe aller Inhalte (`pruefstatus: 'entwurf'`) | offen — GAP-QS |
| Validierte Instrumente statt bzw. neben dem produktinternen Kurzinstrument | offen — GAP-INSTRUMENTE |
| Prüfung, ob und wie sich die fünf Bereiche zu etablierten pflegefachlichen Ordnungsrahmen verhalten | offen — Teil der fachlichen Prüfung |
| Ob die Ziel-Struktur für die Zielgruppe verständlich ist | offen — Gebrauchstauglichkeitstest, `gebrauchstauglichkeit_testprotokoll.md` |
