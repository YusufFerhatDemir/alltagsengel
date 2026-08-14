# Phase 6 — Zulassungsstrategie kritisch geprüft (15.08.2026)

**Auftrag:** unabhängig von der bisherigen Selbstauskunft des Projekts prüfen, ob der
PflegeCoach in seiner heutigen Form funktional und rechtlich als DiPA (Digitale
Pflegeanwendung, § 40a SGB XI) positionierbar ist — ohne Wunschannahmen.

**Methode:** Diese Analyse fasst nicht neu zusammen, was die eigenen Projektdokumente
bereits behaupten, sondern prüft sie gegen den tatsächlichen Code-Stand
(`lib/coach/inhalte.ts`, `lib/coach/pricing.ts`) und gegen den jüngsten Prüfstand
(`docs/dipa/18_PHASE4_REVERIFY_2026-08-14.md`: 36/48 Anforderungen textlich geprüft,
44 % belastbare Quote — erfüllt UND geprüft). Herangezogene Quellen: § 40a SGB XI, die
DiPAV, der BfArM-Leitfaden v1.3 sowie die projektinternen Dokumente
`audit/dipa/finale_zweckbestimmung.md`, `funktionsbeschreibung_pflegecoach.md`,
`evaluationskonzept.md`, `zielgruppendefinition.md`, `mdr_negativabgrenzung.md`,
`dipav_gap_liste.md`, `bfarm_fragenkatalog.md`, `inhalte_pruefdossier.md` und
`risikoakte_pflegecoach.md`. Das Projektteam führt diese Dokumente bereits selbst
auffallend selbstkritisch — diese Analyse übernimmt deren eigene Befunde dort, wo sie
durch den Code bestätigt werden, und ergänzt eine eigenständige kritische Bewertung der
Gesamtlage.

**Kernaussage vorweg:** Der PflegeCoach ist kein einreichungsreifes DiPA-Produkt und
sollte intern nicht als eines kommuniziert werden. Von 48 selbst definierten
Anforderungen sind 44 % belastbar erfüllt, kein einziger Pflegeinhalt ist fachlich
freigegeben, der Nutzennachweis existiert nur als Absichtserklärung, und die zentrale
regulatorische Weichenstellung (Doppelzielgruppe in einem Produkt) ist eine offene
Frage an eine noch nicht wahrgenommene BfArM-Beratung.

---

## 1. Vorgesehene Nutzergruppe

Laut `zielgruppendefinition.md`: Pflegebedürftige der Pflegegrade 1–5 in häuslicher
Versorgung **und** ihre pflegenden Angehörigen bzw. ehrenamtlich Pflegenden — eine
Doppelzielgruppe in einem Produkt, die laut Dokument erst durch die „1. DiPAV-ÄndV"
(in Kraft 01.07.2026) ermöglicht wird. Nicht-Zielgruppe: Personen ohne Pflegegrad,
stationär Versorgte.

**Abweichung Code vs. Zweckbestimmung:** Der Pflegegrad ist im Onboarding
(`app/pflegecoach/start/page.tsx`) eine **freiwillige** Angabe ohne Verifikation gegen
die Pflegekasse. `zielgruppendefinition.md` selbst räumt ein: „Nutzung im Pilot als
freiwilliges Angebot bleibt davon unberührt" — für Personen ohne Pflegegrad. Die
Zielgruppe ist damit im Code nicht durchgesetzt, sondern nur deklariert. Ein Antrag, der
eine Zielgruppen-Eingrenzung behauptet, träfe auf ein Produkt, das technisch für „jeden
Interessierten" offensteht.

## 2. Konkrete pflegerische Zielsetzung

Wörtlich aus `finale_zweckbestimmung.md`: Der PflegeCoach soll „Beeinträchtigungen der
Selbständigkeit oder der Fähigkeiten des Pflegebedürftigen … mindern, einer
Verschlimmerung der Pflegebedürftigkeit entgegenwirken und die häusliche Versorgung
stabilisieren sowie pflegende Angehörige … entlasten." Diese Zweckbestimmung ist als
„Herstellerfassung für die BfArM-Beratung — vor Antragstellung durch BfArM-Beratung
validieren" gekennzeichnet — also selbst formuliert, nicht extern bestätigt.

## 3. Digital erbracht Funktionen

Aus `funktionsbeschreibung_pflegecoach.md` und dem tatsächlichen Code
(`lib/coach/inhalte.ts` und Nachbarmodule): Zugang/Profil, strukturiertes
Pflegeassessment (5 Bereiche), Ziel-Erfassung, Wochenplan, vier Bewegungsübungen, eine
8-Punkte-Wohnraum-Sturzcheckliste, fünf Wissensmodule (Entlastungsleistungen,
Selbstsorge, rückenschonende Pflege, Alltag/Selbstversorgung, soziale Teilhabe),
Belastungs-Kurzform (7 Items), Verlaufsdarstellung, druckbarer Bericht, Export (inkl.
FHIR-Kennung) und Einwilligungsverwaltung nach Art. 9 DSGVO.

**Ausdrücklich nicht vorhanden** (Selbstauskunft, §12 der Funktionsbeschreibung): keine
Diagnostik, keine individualisierte Übungsanpassung, keine Notruf-/Überwachungsfunktion,
keine generative KI. **Als Kennung vorhanden, aber nicht erhoben:** die validierten
Messinstrumente FES-I, BSFC-s und SUS — sie existieren nur als Enum-Werte, nicht als
implementierte Erhebung im Produkt.

## 4. Pflegerischer Nutzen (behauptet)

Die Zweckbestimmung behauptet Erhalt der Selbständigkeit, Vorbeugung einer
Verschlimmerung der Pflegebedürftigkeit und Entlastung Angehöriger — differenziert nach
Pflegegrad 1 bis 5. Der tatsächliche Inhalt liefert dafür **keine Differenzierung**: Alle
Nutzer erhalten dieselben vier Übungen unabhängig vom Schweregrad. Für Pflegegrad 4/5
(häufig weitgehend immobil, oft kognitiv stark eingeschränkt) sind Inhalte wie „Aufstehen
vom Stuhl" oder „Gehstrecke in der Wohnung" als Nutzen-Nachweis-Grundlage wenig
plausibel. Zwischen der behaupteten Pflegegrad-Differenzierung und der tatsächlichen
Ein-Größe-für-alle-Umsetzung besteht ein struktureller Widerspruch.

Ein erheblicher Teil der Inhalte (drei der fünf Wissensmodule: Entlastungsleistungen,
Selbstsorge, rückenschonende Pflege) zielt zudem stärker auf Angehörige als auf den
Pflegebedürftigen selbst. Das nähert das Produkt an ein allgemeines
Angehörigen-Coaching-Tool an — nicht an eine Anwendung mit direktem, beim Pflegebedürftigen
nachweisbarem pflegerischen Nutzen im engeren Sinn des § 40a SGB XI.

## 5. Nachweisbare Behauptungen (heute)

Belastbar sind ausschließlich strukturelle/technische Aussagen: Die App bildet die
Zweckbestimmung technisch ab (Assessment, Ziele, Wochenplan, Übungen existieren als
Code), die MDR-Negativabgrenzung ist konsistent formuliert und keine Diagnostik/kein
Scoring ist vorhanden, das Kostenlos-Modell ist fail-closed durchgesetzt (siehe Phase 7,
`lib/coach/pricing.ts`). **Nicht belastbar** ist jede Aussage zu tatsächlicher Wirkung:
Es gibt keine erhobenen Pilotdaten, keine abgeschlossene fachliche Prüfung der Inhalte
und keine externe Bestätigung der Zielgruppen- oder MDR-Einordnung.

## 6. Evidenzlücken

Aus `evaluationskonzept.md` (selbst als „Herstellerrahmen, KEIN einreichungsreifes
Konzept" bezeichnet): kein wissenschaftlicher Partner beauftragt, kein Ethikvotum, keine
Fallzahlplanung, Lizenzen für die validierten Instrumente (FES-I, BSFC-s, SUS) ungeklärt,
methodische Mindestanforderungen an das Studiendesign offen (nur einarmige
Prä-Post-Studie vorgeschlagen, kein Vergleichsgruppen-Design gesichert). Aus
`inhalte_pruefdossier.md`: „Kein Auftrag erteilt, keine Prüfung begonnen" — alle 12
Inhaltsmodule tragen `pruefstatus: 'entwurf'`, bestätigt im Code
(`lib/coach/inhalte.ts`, Konstante `INHALT_ENTWURF_HINWEIS`). Das ist im eigenen
Risikoregister (`risikoakte_pflegecoach.md`, R1.4) als „höchstes getragene Risiko des
Produkts" geführt, „nicht technisch lösbar".

Im Reverify-Katalog (Phase 4) bleibt AK-QI-01 („Inhalte fachlich geprüft") deshalb
konsequent `NOT_VERIFIED` — es ist die einzige der 48 Anforderungen, deren Erfüllung
ausschließlich von einer noch nicht beauftragten externen Pflegefachkraft abhängt, nicht
von Code oder Dokumentation.

## 7. Abgrenzungsrisiken

**a) Doppelzielgruppe ungeklärt.** `bfarm_fragenkatalog.md` Frage 5 fragt direkt, ob das
BfArM ein Produkt akzeptiert, das Pflegebedürftige *und* Angehörige mit einer
gemeinsamen Zweckbestimmung bedient, oder getrennte Nutzenargumentationen erwartet. Die
Rechtsgrundlage („1. DiPAV-ÄndV") ist eine Selbstauslegung des Projekts, keine
bestätigte BfArM-Position. Das ist keine offene Formalie, sondern die Grundfrage, ob die
aktuelle Produktarchitektur (eine App, zwei Zielgruppen) überhaupt antragsfähig ist.

**b) Nähe zur Medizinprodukt-Grenze.** `mdr_negativabgrenzung.md` ist selbst
warnend formuliert: die Abgrenzung „kippt … unabhängig davon, was hier steht", sobald
sich Funktionsumfang oder Auswertungstiefe ändern. Aktuell sauber (keine Diagnostik,
kein Scoring), aber strukturell fragil: Sobald die validierten Instrumente (FES-I,
BSFC-s) — wie für den Nutzennachweis nötig — mit Auswertungslogik verknüpft werden, wird
laut demselben Dokument eine Neubewertung der MDR-Einordnung fällig. Ohne
Instrumenten-Auswertung kein Nutzennachweis, mit Auswertung wachsendes MDR-Risiko —
dieser Zielkonflikt ist im Konzept angelegt und ungelöst.

**c) Zu generisch für einen pflegegrad-differenzierten Nutzen.** Siehe Punkt 4: Die
Inhalte sind Alltags-/Coaching-Ratgeber-Texte ohne Personalisierung nach
Assessment-Ergebnis oder Pflegegrad. Ein Gutachter könnte den behaupteten
„pflegerischen Nutzen … nach Pflegegrad 1 bis 5" schwer nachvollziehbar finden, wenn
alle Nutzer dieselben vier Übungen sehen.

**d) Zielgruppen-Gate nur deklarativ.** Siehe Punkt 1 — die App schließt Personen ohne
Pflegegrad technisch nicht aus.

## 8. Fehlende Voraussetzungen

Aus `dipav_gap_liste.md`, mit Code-/Betriebsabgleich:

- **GAP-TR03161 (kritisch, Monate Vorlauf):** kein BSI-Zertifikat nach TR-03161 — seit
  01.01.2025 Pflicht, nicht begonnen. Verhindert unabhängig vom Inhalt jede
  Antragstellung auf absehbare Zeit. Die im Reverify-Katalog offenen Punkte AK-SEC-02,
  -03, -06, -07, -08 hängen strukturell an dieser Zertifizierung.
- **GAP-QI-01 / Fachliche Freigabe:** keine externe Pflegefachkraft beauftragt, alle
  Inhalte im Entwurfsstatus.
- **GAP-EVAL:** kein wissenschaftlicher Partner, kein Ethikvotum, keine Fallzahl.
- **GAP-ISMS:** kein ISO-27001-nahes Managementsystem.
- **GAP-QMS:** kein formal verfasstes QM-/Risikomanagementsystem.
- **GAP-DB:** Migrationen für Teile des Betriebssystems nicht auf Produktion
  angewendet — ein Betriebs-, nicht nur ein regulatorischer Blocker.
- **BfArM-Vorabklärung:** 21 offene Fragen im Fragenkatalog, darunter die
  zulassungsentscheidende Doppelzielgruppen-Frage (Punkt 7a) — keine BfArM-Beratung
  bisher wahrgenommen.

## 9. Risiken und ungeklärte Punkte (Zusammenfassung)

| Bereich | Status | Belastbarkeit |
|---|---|---|
| Anforderungskatalog (48 Punkte) | 36/48 textlich geprüft, 31 „erfüllt" | 44 % erfüllt UND geprüft |
| Pflegeinhalte fachlich freigegeben | 0 von 12 Modulen | 0 % — höchstes Produktrisiko lt. eigener Risikoakte |
| Nutzennachweis / Evidenz | kein Partner, kein Ethikvotum, keine Fallzahl | nicht belastbar |
| Doppelzielgruppen-Zulässigkeit | offene Frage an BfArM, unbeantwortet | nicht belastbar |
| Pflegegrad-Differenzierung im Inhalt | nicht vorhanden (Ein-Größe-für-alle) | widerspricht Zweckbestimmung |
| Zielgruppen-Gate (Pflegegrad-Pflicht) | nur deklarativ, nicht technisch durchgesetzt | Abgrenzungsrisiko |
| MDR-Abgrenzung | heute sauber, strukturell fragil bei Instrumenten-Auswertung | Zielkonflikt ungelöst |
| BSI TR-03161-Zertifikat | nicht begonnen, seit 01.01.2025 Pflicht | blockiert Antragstellung unabhängig vom Inhalt |
| Rechtstexte/AGB | als Vorlage gekennzeichnet, nicht anwaltlich geprüft | offen |

**Fazit:** Der PflegeCoach ist in seiner jetzigen Form ein Alltags-/Coaching-Ratgeber mit
DiPA-Ambition. Die Selbstdokumentation des Projekts ist ungewöhnlich transparent über
die eigenen Lücken — das macht die Selbstauskunft glaubwürdig, ändert aber nichts am
Status: Weder inhaltlich (fachliche Freigabe, Pflegegrad-Differenzierung) noch datenmäßig
(Evidenz, Zertifizierung) noch regulatorisch (Doppelzielgruppen-Frage) ist das Produkt
heute einreichungsreif. Intern und extern sollte **nicht** kommuniziert werden, dass eine
DiPA-Zulassung vorliegt, bevorsteht oder eine reine Formsache ist.
