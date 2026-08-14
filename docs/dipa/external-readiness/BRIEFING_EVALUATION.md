# Briefing für ein herstellerunabhängiges wissenschaftliches Institut — Evaluationskonzept „Digitaler PflegeCoach"

**Produkt:** Digitaler PflegeCoach (`/pflegecoach`)
**Hersteller:** Alltagsengel UG (haftungsbeschränkt), Frankfurt am Main
**Version:** 1.0
**Stand:** 2026-08-15
**Status:** Briefing für Partnersuche — **noch kein Institut beauftragt**

**Quellen dieses Briefings:** `audit/dipa/evaluationskonzept.md`, `audit/dipa/pilotdesign.md`,
`audit/dipa/zielgruppendefinition.md`, `audit/dipa/finale_zweckbestimmung.md`,
`docs/DIPA_EXTERNE_TODO_2026-08-14.md` (Punkt 6, NN-01), `docs/dipa/18_PHASE4_REVERIFY_2026-08-14.md`
(Abschnitt 7, NN-01/02/03), `docs/dipa/19_ZULASSUNGSSTRATEGIE_ANALYSE.md` (Abschnitt 6, Evidenzlücken).

---

## 1. Auftrag in einem Satz

Wir suchen ein herstellerunabhängiges wissenschaftliches Institut (Pflegewissenschaft/verwandtes
Fach), das für den Digitalen PflegeCoach ein einreichungsreifes Evaluationskonzept
einschließlich Studiendesign, Fallzahlplanung und Ethikvotum erstellt und die anschließende
Evaluationsstudie wissenschaftlich begleitet.

---

## 2. Warum ein externes Institut zwingend ist

Der BfArM-DiPA-Leitfaden (Version 1.3), Kapitel 4.5.2, verlangt ausdrücklich, dass das
Evaluationskonzept **von einem herstellerunabhängigen wissenschaftlichen Institut erstellt
werden muss**. Das ist laut unserer regulatorischen Aufarbeitung (siehe
`docs/DIPA_EXTERNE_TODO_2026-08-14.md`, Punkt 6 / NN-01) eine zwingende Vorgabe, keine
Kann-Bestimmung — und ausdrücklich **nicht durch eigenes Personal des Herstellers ersetzbar**.
Alltagsengel kann daher weder das Evaluationskonzept selbst finalisieren noch die Studie
selbst durchführen oder auswerten; beides muss von der beauftragten unabhängigen Stelle
kommen.

Der interne Reverify-Katalog (`docs/dipa/18_PHASE4_REVERIFY_2026-08-14.md`, Abschnitt 7,
Zeile NN-01) führt diesen Punkt konsistent als `PARTIAL / EXTERNAL_REQUIRED` mit der
Restaufgabe „Herstellerunabhängiges wiss. Institut finden — zwingend, nicht optional".

---

## 3. Herstellerrahmen als Ausgangspunkt (kein einreichungsreifes Konzept)

Alltagsengel hat einen internen Diskussionsstand erarbeitet (`audit/dipa/evaluationskonzept.md`).
Dieses Dokument ist **ausdrücklich als „Herstellerrahmen, KEIN einreichungsreifes Konzept"**
gekennzeichnet und soll dem Institut nur als Ausgangspunkt und Kontextlieferant dienen — nicht
als fertiges Konzept zur Abzeichnung. Wir erwarten vom Institut ein eigenständig verantwortetes,
einreichungsreifes Konzept, das den Herstellerrahmen kritisch prüft, ändert oder verwirft, wo
methodisch nötig.

Inhalt des Herstellerrahmens in Kurzform:

| Baustein | Herstellervorschlag |
|---|---|
| Nutzenhypothesen | H1 (Pflegebedürftige, § 40a SGB XI): Minderung von Beeinträchtigungen der Selbständigkeit / Entgegenwirken einer Verschlimmerung — operationalisiert über Sturzangst (FES-I Kurzform) und Selbständigkeits-Selbsteinschätzung. H2 (pflegende Angehörige): Entlastung und Stabilisierung der häuslichen Versorgung — operationalisiert über ein validiertes Belastungsinstrument (Ziel: HPS/BSFC-s) und Inanspruchnahme von Entlastungsleistungen. Kein medizinischer Outcome wird behauptet oder gemessen. |
| Design-Vorschlag | Prospektive, **einarmige Interventionsstudie mit Prä-Post-Vergleich** über den Erprobungszeitraum (bis 12 Monate); Fallzahlplanung aus Pilotdaten; Vorregistrierung (z. B. DRKS); Durchführung durch eine unabhängige wissenschaftliche Einrichtung; Ethikvotum einholen. Falls das BfArM eine Vergleichsgruppe verlangt: Eskalationsoption Warteliste-Kontrollgruppe, Entscheidung offen. |
| Endpunkte/Instrumente (Vorschlag) | Sturzangst: FES-I Kurzform. Selbständigkeit: produktinterne Selbsteinschätzung (5 Lebensbereiche) + ggf. vom Institut benanntes validiertes Instrument. Belastung: HPS/BSFC-s (Lizenz offen). Inanspruchnahme Entlastungsleistungen: Eigenentwicklung mit Institut. Usability: SUS. Nutzung/Adhärenz: produktinterne Kennzahlen. Messzeitpunkte T0/T1/T2(/T3). |
| Datenschutz der Evaluation | Separate, freiwillige, getrennt widerrufliche Einwilligung (`wissenschaftliche_auswertung`, versioniert in `coach_consents`); Pseudonymisierung (Schlüssel ausschließlich beim Verantwortlichen, nicht beim Auswertungspartner); keine Dritt-Tracker; DSFA vor Studienbeginn. |
| Technische Datengrundlage | `coach_measurements` (Instrumente/Messzeitpunkte t0–t3), `coach_activity_log` (Adhärenz), `coach_nutzungsereignisse` (pseudonymisiertes Ereignis-Logging, HMAC-SHA256-Pseudonym, Wochengranularität, Unterdrückung von Gruppen < 5 Teilnehmenden), Self-Service-Export. |

Die Genehmigung, Prüfung und finale Festlegung all dieser Punkte obliegt dem Institut.

---

## 4. Pilotdesign (Zusammenfassung)

Aus `audit/dipa/pilotdesign.md` — der Pilot läuft **vor** einer etwaigen DiPA-Listung als
freiwilliges, kostenloses Angebot, ohne Kassenerstattung und ohne Aussagen über Kassenleistungen
gegenüber Teilnehmenden. Ziel: Machbarkeit und Datengrundlage für das Evaluationskonzept der
vorläufigen Aufnahme (§ 78a Abs. 6a SGB XI).

| Baustein | Herstellervorschlag |
|---|---|
| Einwilligung | Zweistufig: (1) produktbezogene Einwilligung in die Verarbeitung von Gesundheitsdaten, (2) separate, freiwillige, getrennt widerrufliche Einwilligung in die wissenschaftliche Auswertung. Serverseitig versioniert protokolliert. |
| Zielgruppe/Rekrutierung | n = 30–50 Dyaden (Pflegebedürftige/r + Angehörige/r) oder Einzelnutzer; Pflegegrade 1–3 bevorzugt; Region Frankfurt/Rhein-Main. Rekrutierung ausdrücklich **nicht ausschließlich** aus dem Alltagsengel-Kundenstamm (Selektionsbias, Interessenkonflikt-Optik) — zusätzlich Pflegestützpunkte, Angehörigengruppen. |
| Baseline (T0) | Demografie, Pflegegrad, Versorgungssituation, Technikvorerfahrung; FES-I; Selbständigkeits-Selbsteinschätzung; Sturzereignisse letzte 3 Monate (Selbstbericht); Belastung (Ziel HPS/BSFC-s, Lizenz vor Pilotstart zu klären); Pflegekompetenz-Selbsteinschätzung. |
| Nutzungsmessung | Ereignisbasiert, pseudonymisiert, ohne Dritt-Tracker; Kennzahlen aktive Tage/Woche, Erledigungsquote, Retention Woche 4/8/12; Adhärenz-Definition vorab festzulegen. |
| Outcome-Messung | T0 (Baseline), T1 (6 Wochen), T2 (12 Wochen = Pilotende), optional T3 (Follow-up 12 Wochen nach Ende). Pilot als Machbarkeits-/Effektschätzung, ausdrücklich **keine konfirmatorische Studie**. Sekundär: qualitative Interviews (10–15 Teilnehmende). |
| Abbruchkriterien | Individuell: jederzeitiger Widerruf ohne Nachteile. Studienbezogen: meldepflichtiges Datenschutzereignis, sicherheitsrelevanter Vorfall, Gefährdungshinweise, SUS < 50 bei T1 mit gehäuften Bedienabbrüchen. |
| Go-Kriterien für Pilotstart | Laut `pilotdesign.md` §8 aktuell **alle sieben** Kriterien offen, u. a.: Instrumente lizenziert/validiert, wissenschaftlicher Partner beauftragt + Ethikvotum, pflegefachliche Freigabe der Inhalte, juristische Prüfung der Einwilligungstexte/DSFA. |

---

## 5. Offene methodische Punkte, die das Institut klären muss

Aus der kritischen Selbsteinschätzung in `docs/dipa/19_ZULASSUNGSSTRATEGIE_ANALYSE.md`,
Abschnitt 6 („Evidenzlücken"):

| Offener Punkt | Beschreibung |
|---|---|
| Kein wissenschaftlicher Partner beauftragt | Der Herstellerrahmen benennt die Notwendigkeit, aber es besteht bislang kein Auftrag an ein Institut. |
| Kein Ethikvotum | Bislang nicht eingeholt; Zuständigkeit und Verfahren sind mit dem Institut zu klären (siehe Abschnitt 8). |
| Keine Fallzahlplanung | Bislang nicht erstellt. Der Herstellerrahmen verweist auf eine spätere Ableitung aus Pilotdaten — eine belastbare Fallzahl ist derzeit nicht vorhanden und wird hier **nicht** vorweggenommen. |
| Nur einarmige Prä-Post-Studie vorgeschlagen | Der Herstellerrahmen schlägt ein Design ohne gesichertes Vergleichsgruppen-Design vor (Warteliste-Kontrollgruppe nur als Eskalationsoption, Entscheidung offen). Die methodischen Mindestanforderungen an das Studiendesign — insbesondere ob ein Vergleichsgruppendesign erforderlich ist — sind ungeklärt und vom Institut zu bewerten, ggf. in Abstimmung mit dem BfArM. |
| Lizenzen für Erhebungsinstrumente ungeklärt | Nutzungsrechte für FES-I, BSFC-s (bzw. HPS/BSFC-s) und SUS sind nicht geklärt. Der BfArM-Leitfaden (Kap. 4.5.1) verlangt grundsätzlich ein validiertes Messinstrument für den Nutzennachweis. |

Zusätzlicher Kontext, den das Institut bei der Instrumentenwahl berücksichtigen sollte
(`docs/dipa/19_ZULASSUNGSSTRATEGIE_ANALYSE.md`, Abschnitt 7b): Die Abgrenzung des Produkts zum
Medizinprodukt (MDR) gilt laut der eigenen Abgrenzungsanalyse als aktuell sauber, aber
strukturell fragil — sie „kippt, sobald sich Funktionsumfang oder Auswertungstiefe ändern".
Sobald validierte Instrumente (FES-I, BSFC-s) mit Auswertungslogik im Produkt verknüpft werden,
wird laut dieser Analyse eine Neubewertung der MDR-Einordnung fällig. Dieser Zielkonflikt
zwischen Nutzennachweis und MDR-Abgrenzung ist im Konzept bislang ungelöst und sollte in der
Studienplanung mitbedacht werden.

---

## 6. Was ein wissenschaftliches Institut leisten muss (Deliverables)

| # | Deliverable | Bezug |
|---|---|---|
| 1 | Einreichungsreifes Evaluationskonzept (löst `audit/dipa/evaluationskonzept.md` als Herstellerrahmen ab) | BfArM-Leitfaden Kap. 4.5.2 |
| 2 | Ethikvotum einer zuständigen Ethikkommission | siehe Abschnitt 8 |
| 3 | Studiendesign inkl. Entscheidung über Vergleichsgruppen-Notwendigkeit | Abschnitt 5 |
| 4 | Fallzahlplanung | Abschnitt 5 |
| 5 | Klärung/Beschaffung der Instrumentenlizenzen (FES-I, BSFC-s, SUS) oder Empfehlung geeigneter Alternativen | Abschnitt 5 |
| 6 | Statistischer Analyseplan vor Studienbeginn | `evaluationskonzept.md` §5 |
| 7 | Wissenschaftliche Begleitung von Pilot und Hauptstudie inkl. Endbericht als Grundlage für den Antrag auf endgültige Aufnahme | `evaluationskonzept.md` §5 |

---

## 7. Ethikvotum-Anforderungen

Aus den vorliegenden Quellen geht hervor, dass ein Ethikvotum vor Studienbeginn einzuholen ist
(`evaluationskonzept.md` §2, `pilotdesign.md` §8 Kriterium 5) und dass die Durchführung durch
eine unabhängige wissenschaftliche Einrichtung erfolgen soll. **Welche Ethikkommission konkret
zuständig ist, welches Verfahren anzuwenden ist und welche Unterlagen dafür benötigt werden,
ist in den vorliegenden Projektdokumenten nicht ausgeführt.** Dies ist ein offener Punkt, den
das beauftragte Institut in Abstimmung mit seiner eigenen (Hochschul-)Ethikkommission klären
muss — hier wird bewusst nichts über das Vorliegende hinaus behauptet oder vorweggenommen.

---

## 8. Zuständige Stelle / Ansprechpartner

| Feld | Inhalt |
|---|---|
| Zuständige Stelle (Auftraggeber) | Alltagsengel UG (haftungsbeschränkt), Frankfurt am Main |
| Ansprechpartner | *[Platzhalter — vor Versand des Briefings zu ergänzen]* |
| Kontakt | *[Platzhalter — vor Versand des Briefings zu ergänzen]* |
| Adressat des Briefings | Herstellerunabhängiges wissenschaftliches Institut (Universität/Pflegewissenschaft) — noch nicht ausgewählt |

---

## 9. Bereitzustellende Unterlagen

Für die Aufnahme der Zusammenarbeit stellt Alltagsengel dem Institut folgende Unterlagen zur
Verfügung:

- `audit/dipa/evaluationskonzept.md` — Herstellerrahmen (als Diskussionsgrundlage, nicht als Vorgabe)
- `audit/dipa/pilotdesign.md` — Pilotdesign inkl. Ein-/Ausschlusskriterien, Abbruchkriterien, Go-Kriterien
- `audit/dipa/zielgruppendefinition.md` — Zielgruppen (Pflegebedürftige, pflegende Angehörige, Pflegedienst-Interaktionsrolle) und Nicht-Zielgruppen
- `audit/dipa/finale_zweckbestimmung.md` — verbindlicher Wortlaut der Zweckbestimmung inkl. MDR-Negativabgrenzung
- `docs/dipa/18_PHASE4_REVERIFY_2026-08-14.md` (Abschnitt 7, Nutzennachweis) — aktueller Verifikationsstatus NN-01/NN-02/NN-03
- `docs/dipa/19_ZULASSUNGSSTRATEGIE_ANALYSE.md` (Abschnitt 6, Evidenzlücken; Abschnitt 7, Abgrenzungsrisiken) — kritische Selbsteinschätzung, inkl. MDR-Zielkonflikt
- `docs/DIPA_EXTERNE_TODO_2026-08-14.md` — Gesamtstatus der externen Nachweispflichten, insbesondere Punkt 6 (NN-01) und Punkt 7 (QI-02, Instrumentenlizenzen)

**Wichtiger Hinweis für das Institut:** Für den Digitalen PflegeCoach liegt derzeit **keine
DiPA-Zulassung vor und keine ist beantragt**. Der Pilot läuft als freiwilliges, kostenloses
Angebot ohne Kassenerstattung. Das Produkt ist und bleibt für Endnutzerinnen und Endnutzer
dauerhaft kostenlos; eine etwaige Vergütung erfolgt ausschließlich über eine spätere
Pflegekassen-Erstattung nach tatsächlicher DiPA-Zulassung, nicht über den Nutzer.
