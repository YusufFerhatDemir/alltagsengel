# Vorbereitungspaket — Freiwilliger BfArM-Beratungstermin

**Produkt:** Digitaler PflegeCoach
**Hersteller:** Alltagsengel UG (haftungsbeschränkt), Frankfurt am Main
**Version:** 1.0
**Stand:** 2026-08-15
**Status:** Vorbereitungspaket für Beratungstermin — Termin noch nicht vereinbart

---

## 1. Zweck dieses Dokuments

Dieses Paket bündelt alle Unterlagen und offenen Fragen für ein Beratungsgespräch
mit dem BfArM zum Digitalen PflegeCoach. Es ersetzt keinen Antrag und behauptet
keine Zulassung. Es dient ausschließlich der Vorbereitung eines Gesprächs, in dem
zulassungsentscheidende Grundsatzfragen geklärt werden sollen, bevor weitere
Ressourcen (insbesondere die kostenintensiven externen Nachweise) gebunden werden.

---

## 2. Rechtsgrundlage des Termins

Die BfArM-Beratung ist in **§ 22 DiPAV** geregelt und dort ausdrücklich als
**„auf Anfrage"** formuliert — sie ist **freiwillig**, keine Voraussetzung für
einen Antrag auf vorläufige oder endgültige Aufnahme in das DiPA-Verzeichnis
(vgl. BfArM-DiPA-Leitfaden v1.3, Kap. 5.5/5.5.1: freiwillig, keine Rechtsbindung
der dort erteilten Auskünfte).

Der interne Reverify-Katalog führt den Termin konsequent als
`REG-05 — BfArM-Beratungstermin`, Klasse „E extern", Status
`PARTIAL / EXTERNAL_REQUIRED`, mit der Restaufgabe: „Nicht verpflichtend, aber
höchste Hebelwirkung — weiterhin empfohlen" (`docs/dipa/18_PHASE4_REVERIFY_2026-08-14.md`,
Abschnitt 10). Die externe To-do-Liste ordnet den Termin entsprechend ein: parallel
zu den P0-Aufgaben anfragbar, aber **nicht** Bedingung für deren Start
(`docs/DIPA_EXTERNE_TODO_2026-08-14.md`, „Empfohlene Reihenfolge", Punkt 3).

**Warum trotzdem empfohlen:** Der Termin kann mehrere offene Fragen bündeln, die
sonst einzeln und mit Unsicherheit behaftet blieben — allen voran die
Doppelzielgruppen-Frage (Abschnitt 6), außerdem den Prüf-Scope von TR-03161, die
Verbindlichkeit von FHIR/MIO (INT-02) und den Vergütungsanteil (REG-04). Aus
Effizienzgründen ist er deshalb der empfohlene erste Schritt — nicht, weil er
formal verlangt wäre.

---

## 3. Produktbeschreibung für BfArM (Kurzfassung)

Der Digitale PflegeCoach ist eine im Browser nutzbare Webanwendung für Menschen
mit Pflegebedarf in häuslicher Versorgung und für die Personen, die sie pflegen.
Er bildet einen wiederkehrenden Ablauf ab: Selbsteinschätzung erheben → Ziele
setzen → Alltag strukturieren → Erledigung festhalten → Verlauf sichtbar machen
→ Ziele und Maßnahmen anpassen. Alle Inhalte sind allgemeine Anleitungen und
organisatorische Hilfen; das Produkt trifft keine diagnostischen oder
therapeutischen Entscheidungen, bewertet keine Messwerte und ersetzt keine
ärztliche oder pflegefachliche Beratung.

**Bearbeiteter Gegenstand:** die Organisation des Alltags bei Pflegebedürftigkeit
in fünf Lebensbereichen (Mobilität, Selbstversorgung, Alltagsgestaltung, soziale
Teilhabe, Kognition als reine Selbsteinschätzung ohne Testverfahren) sowie ein
sechster Bereich ausschließlich für die pflegende Person (Entlastung Angehöriger).

**Wirkprinzip** (vier organisatorische, keine medizinischen Mechanismen):
Sichtbarmachen des eigenen Verlaufs über die Zeit, Verbindlichkeit durch Ziele
und Wochenplan, Wissen an der richtigen Stelle (Wissensmodule), regelbasierte
Anstoß-Hinweise zur Anpassung (kein Scoring, keine Diagnostik — Verbotsliste im
Quellcode bindend verankert).

**Rollen:** `pflegebeduerftig` (voller Funktionsumfang), `angehoerig` (zusätzlich
Belastungs-Selbsteinschätzung und Entlastungs-Wissensmodule), `pflegedienst`
(ausschließlich lesend, nur nach ausdrücklicher Freigabe durch die
pflegebedürftige Person — kein Betriebswerkzeug).

**Technik:** Webanwendung ohne Installation, Next.js/PostgreSQL, eigenständiges
Modul (`/pflegecoach`, eigene Tabellen `coach_*`, eigene Zugriffsregeln,
werbe-/trackerfrei). Keine externen Dienste, keine Sprachmodelle, kein
Cross-Selling mit dem Betreuungsdienst-Geschäft der Alltagsengel UG.

**Bekannte Grenzen** (offen ausgewiesen, nicht beschönigt): Inhalte tragen
durchgehend den Prüfstatus „Entwurf" (fachliche Freigabe steht aus), kein
zweiter Faktor bei der Anmeldung, kein externes Sicherheitszertifikat, kein
verbindliches Austauschformat abschließend geklärt.

Vollständige Fassung: `audit/dipa/produktbeschreibung_pflegecoach.md`.

---

## 4. Zweckbestimmung

Herstellerfassung, vorgesehen zur Vorlage und Validierung im Beratungsgespräch:

> „Der Digitale PflegeCoach ist eine digitale Pflegeanwendung im Sinne des § 40a
> SGB XI. Er unterstützt Pflegebedürftige der Pflegegrade 1 bis 5 in häuslicher
> Versorgung sowie deren pflegende Angehörige und sonstige ehrenamtlich Pflegende
> durch strukturierte Anleitungs-, Schulungs-, Erinnerungs- und
> Dokumentationsfunktionen dabei, Beeinträchtigungen der Selbständigkeit oder der
> Fähigkeiten des Pflegebedürftigen zu mindern, einer Verschlimmerung der
> Pflegebedürftigkeit entgegenzuwirken und die häusliche Versorgung zu
> stabilisieren sowie pflegende Angehörige bei Pflegeaufgaben zu entlasten.
>
> Der Digitale PflegeCoach dient nicht der Erkennung, Verhütung, Überwachung,
> Vorhersage, Prognose, Behandlung oder Linderung von Krankheiten, Verletzungen
> oder Behinderungen und trifft keine diagnostischen oder therapeutischen
> Entscheidungen. Er ersetzt keine ärztliche oder pflegefachliche Beratung."

**Wichtiger Hinweis zum Status:** Diese Fassung ist im Quelldokument
(`audit/dipa/finale_zweckbestimmung.md`) ausdrücklich als **„Herstellerfassung
für die BfArM-Beratung — vor Antragstellung durch BfArM-Beratung (Fragen 4–5 des
Fragenkatalogs) validieren"** gekennzeichnet. Sie ist selbst formuliert und
**nicht extern bestätigt**. Genau diese Bestätigung — insbesondere ob die
Doppelzielgruppen-Konstruktion und die Erinnerungsfunktion als reine
Organisationsfunktion aus Sicht des BfArM tragfähig sind — ist eines der
Hauptziele des Termins.

---

## 5. Fragenkatalog — priorisierte Auswahl

Der vollständige Katalog mit 21 Fragen liegt in `audit/dipa/bfarm_fragenkatalog.md`
vor (Abschnitte A–E: Verfahren & Zeitplan, Zweckbestimmung & Abgrenzung, Technik &
Nachweise, Evidenz & Evaluation, Vertrieb/Preis/Betrieb). Für den Termin wird
folgende Priorisierung vorgeschlagen — wichtigste zuerst:

| Rang | Frage (Kurzform) | Nr. im Katalog | Warum vorrangig |
|---|---|---|---|
| 1 | Wird die Doppelzielgruppe „Pflegebedürftige + pflegende Angehörige" in EINEM Produkt akzeptiert, oder erwartet das BfArM getrennte Nutzenargumentationen? | Frage 5 | Grundsatzfrage zur Antragsfähigkeit der aktuellen Produktarchitektur — siehe Abschnitt 6 dieses Dokuments |
| 2 | Trägt die vorgelegte Zweckbestimmung die Einordnung als Nicht-Medizinprodukt, insbesondere die Erinnerungsfunktion als reine Organisationsfunktion? | Frage 4 | Direkte Bestätigung der MDR-Abgrenzung, die strukturell fragil ist (siehe Abschnitt 6) |
| 3 | Welches Prüfverfahren/welche Version von TR-03161 wird zum voraussichtlichen Antragszeitpunkt akzeptiert, und gilt die Zertifikatspflicht uneingeschränkt auch für die vorläufige Aufnahme? | Frage 9 | Größter P0-Blocker mit längster Vorlaufzeit — falscher Scope kostet Monate |
| 4 | Welche konkreten Interoperabilitätsformate verlangt Anlage 2 DiPAV — genügt PDF + dokumentiertes JSON, oder sind FHIR-Profile/MIOs verpflichtend? | Frage 10 | INT-02 intern als „unklar, technisch bereits umgesetzt" geführt — reine Klärungsfrage, keine Bauaufgabe |
| 5 | Genügt eine regelbasierte, rein organisatorische Anpassungs-Hinweis-Funktion (ohne Scores, ohne Bewertungen) der Anforderung „Anpassung von Maßnahmen"? | Frage 8 | Betrifft das Kernstück der MDR-Abgrenzung im implementierten Code |
| 6 | Ist die strikte Trennung vom Betreuungsdienst-Geschäft ausreichend, oder bestehen Bedenken wegen Doppelrolle Hersteller/Leistungserbringer? | Frage 7 | Interessenkonflikt-Frage mit Auswirkung auf Werbeverbot und Vertriebsweg |
| 7 | Muss das ISO-27001-Zertifikat bereits bei Antragstellung vorliegen, und akzeptiert das BfArM einen Scope nur für das DiPA-Produkt? | Frage 11 | Klärt Zuschnitt vor Beauftragung der Zertifizierungsstelle (SEC-05) |
| 8 | Wie läuft die Vergütungsverhandlung zeitlich zur vorläufigen Aufnahme, welcher Rahmen gilt während der Erprobungsphase? | Frage 19 | REG-04 — Rahmen bekannt (gesetzlicher Höchstbetrag, siehe Abschnitt 8), konkreter Anteil offen |
| 9 | Welche methodischen Mindestanforderungen gelten für den Nutzennachweis — einarmige Prä-Post-Studie ausreichend oder Vergleichsgruppe erwartet? | Frage 14 | Bestimmt Design-Vorgabe an den noch zu findenden wissenschaftlichen Partner (NN-01) |
| 10 | Ab welcher Ausgestaltung stuft das BfArM kognitive Trainingsmodule als medizinische Zweckbestimmung ein? | Frage 6 | Roadmap-relevant, im MVP nicht enthalten |

Die übrigen 11 Fragen (u. a. Fristen/Gebühren, validierte Instrumente im
Produkt-UI, Mehrmarken-Vertrieb, Support-Erreichbarkeit) bleiben im
Fragenkatalog vollständig dokumentiert und werden je nach verbleibender
Gesprächszeit nachrangig gestellt.

---

## 6. Offene regulatorische Fragen — Synthese

Zusammengefasst aus `docs/dipa/19_ZULASSUNGSSTRATEGIE_ANALYSE.md`, Abschnitt 7
(„Abgrenzungsrisiken") und Abschnitt 8 („Fehlende Voraussetzungen"):

### a) Doppelzielgruppe (höchste Priorität)

Die Produktarchitektur bedient Pflegebedürftige *und* pflegende Angehörige in
einer App mit gemeinsamer Zweckbestimmung. Die Rechtsgrundlage dafür (1.
DiPAV-ÄndV, in Kraft 01.07.2026) ist eine Selbstauslegung des Projekts, keine
bestätigte BfArM-Position. Das ist keine Formalie, sondern die Grundfrage, ob
die aktuelle Architektur (eine App, zwei Zielgruppen, eine Zweckbestimmung)
überhaupt antragsfähig ist oder ob getrennte Nutzenargumentationen je
Nutzergruppe verlangt werden.

### b) Nähe zur Medizinprodukt-Grenze

Die MDR-Abgrenzung ist heute sauber (keine Diagnostik, kein Scoring), aber
strukturell fragil: Sobald validierte Instrumente (FES-I, BSFC-s) — wie für den
Nutzennachweis nötig — mit Auswertungslogik verknüpft werden, wird laut
`audit/dipa/mdr_negativabgrenzung.md` selbst eine Neubewertung der
MDR-Einordnung fällig. Ohne Instrumenten-Auswertung kein belastbarer
Nutzennachweis, mit Auswertung wachsendes MDR-Risiko — ein im Konzept
angelegter, ungelöster Zielkonflikt.

### c) TR-03161-Scope

Offen ist, welche Version und welches Prüfverfahren zum voraussichtlichen
Antragszeitpunkt gilt, ob die Zertifikatspflicht (seit 01.01.2025) uneingeschränkt
auch für die vorläufige Aufnahme gilt, und welche Trennungstiefe (eigene Domain?
eigenes Backend? eigene Datenbank?) das BfArM für den Prüf-Scope erwartet, wenn
das Produkt technisch als Modul innerhalb der Plattform-Infrastruktur läuft statt
vollständig separat.

### d) FHIR-Verbindlichkeit (INT-02)

Intern als „technisch bereits umgesetzt, Verbindlichkeit im Einzelfall unklar"
geführt (`docs/dipa/18_PHASE4_REVERIFY_2026-08-14.md`, AK-INT-02): FHIR/MIO ist
laut BfArM-Leitfaden „erste Wahl", aber keine absolut zwingende Vorgabe im
Leitfadentext. Ob PDF + dokumentiertes JSON für dieses Produkt ausreicht, ist
eine reine Klärungsfrage ohne weiteren Entwicklungsbedarf.

### e) REG-04-Vergütungsanteil

Der gesetzliche Rahmen (Höchstbetrag, siehe Abschnitt 8) ist bekannt; offen ist
der konkrete, für dieses Produkt verhandelbare Anteil und der zeitliche Ablauf
der Vergütungsverhandlung relativ zur vorläufigen Aufnahme.

### f) Weitere, im Termin nachrangig zu klärende Punkte

- Zu generische Inhalte für einen pflegegrad-differenzierten Nutzen: alle Nutzer
  erhalten aktuell dieselben vier Bewegungsübungen unabhängig vom Schweregrad —
  ein möglicher struktureller Widerspruch zur behaupteten Differenzierung „nach
  Pflegegrad 1 bis 5".
- Zielgruppen-Gate nur deklarativ: der Pflegegrad ist im Onboarding eine
  freiwillige Angabe ohne Verifikation gegen die Pflegekasse — die App schließt
  Personen ohne Pflegegrad technisch nicht aus.

---

## 7. Was wir zum Termin mitbringen

| Dokument | Datei | Zweck im Gespräch |
|---|---|---|
| Produktbeschreibung | `audit/dipa/produktbeschreibung_pflegecoach.md` | Grundlage für Abschnitt 3 dieses Papers |
| Funktionsbeschreibung | `audit/dipa/funktionsbeschreibung_pflegecoach.md` | Vollständige Funktionsliste mit Code-Bezug, falls Detailfragen entstehen |
| Zweckbestimmung | `audit/dipa/finale_zweckbestimmung.md` | Wortlaut zur Validierung (Fragen 4–5) |
| Zielgruppendefinition | `audit/dipa/zielgruppendefinition.md` | Grundlage für Doppelzielgruppen-Diskussion (Frage 5) |
| MDR-Negativabgrenzung | `audit/dipa/mdr_negativabgrenzung.md` | Begründungslinie Nicht-Medizinprodukt (Fragen 4, 8) |
| Fragenkatalog (vollständig) | `audit/dipa/bfarm_fragenkatalog.md` | Leitfaden für den Gesprächsverlauf, 21 Fragen |
| Dieses Vorbereitungspaket | `docs/dipa/external-readiness/BFARM_BERATUNG_PAKET.md` | Zusammenfassende Gesprächsgrundlage |

Nicht mitgebracht werden Unterlagen, die nicht existieren oder nicht
antragsreif sind (z. B. Evaluationskonzept ohne externen Partner, TR-03161-Nachweis) —
diese werden im Gespräch als offen benannt, nicht vorgetäuscht.

---

## 8. Ehrliche Ausgangslage

Der Beratungstermin dient der **Klärung offener Grundsatzfragen**, nicht der
Ankündigung einer bevorstehenden Zulassung. Laut aktuellem Projektstatus gilt:

- Von 48 selbst definierten Anforderungen sind **36/48 textlich gegen die
  Primärquellen geprüft** (44 % belastbare Quote); der Rest ist entweder intern
  noch offen oder wartet auf externe Nachweise.
- **0 von 12 Pflegeinhaltsmodulen** sind fachlich durch eine externe
  Pflegefachkraft freigegeben — im eigenen Risikoregister als „höchstes
  getragene Risiko des Produkts, nicht technisch lösbar" geführt.
- Es gibt **keine erhobenen Pilotdaten**, keinen beauftragten wissenschaftlichen
  Partner, kein Ethikvotum und keine Fallzahlplanung.
- Kein BSI-Zertifikat nach TR-03161, kein ISO-27001-ISMS, keine
  DIN-EN-ISO-9241-171-Konformitätsprüfung liegen vor.
- **Keine DiPA-Zulassung liegt vor. Keine ist beantragt.** Eine BfArM-Einreichung
  ist nach heutigem Stand nicht möglich (16 extern zu erbringende Nachweise
  fehlen, davon 3 mit höchster Priorität — siehe
  `docs/DIPA_EXTERNE_TODO_2026-08-14.md`).
- Der PflegeCoach ist dauerhaft **kostenlos** für Endnutzer; eine Monetarisierung
  ist ausschließlich über eine Pflegekassen-Erstattung nach tatsächlicher
  DiPA-Zulassung vorgesehen. Der gesetzliche Kostenerstattungs-Höchstbetrag nach
  § 40a Abs. 1a SGB XI liegt laut BfArM-Leitfaden bei **bis zu 70 €/Monat**
  (DiPA-Aufwendungen und ergänzende Unterstützungsleistungen nach § 39a SGB XI
  zusammen) — das ist der gesetzliche Rahmen, keine von uns festgelegte oder
  verhandelte Zahl.

Der Termin soll deshalb bewusst als das positioniert werden, was er ist: eine
Gelegenheit, zulassungsentscheidende Grundsatzfragen frühzeitig zu klären, bevor
weitere kostenintensive externe Nachweise (TR-03161, ISMS, Usability-Prüfung,
wissenschaftlicher Partner) in eine möglicherweise falsche Richtung beauftragt
werden — nicht als Ankündigung eines bevorstehenden Zulassungsverfahrens.
