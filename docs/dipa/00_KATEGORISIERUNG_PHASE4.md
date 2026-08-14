# DiPA — Phase-4-Kategorisierung (A/B/C/D) und externe To-do-Pakete

**Stand:** 2026-08-14
**Zweck:** Aufgabe 1 des Phase-4-Abschlussblocks — jeder der 48 Punkte aus
`docs/DIPA_MATRIX_FINAL.md` neu kategorisiert nach dem hier vorgegebenen
Schema, alle B-Punkte am 14.08.2026 abgearbeitet, für C/D versandfertige
To-do-Pakete.

**Wichtig:** Dies ist eine zweite, aufgabenspezifische Lesart derselben 48
Punkte — nicht ihr Ersatz. Für Nachweise, Nächste-Aktion-Text und die
verbindliche Zählung gilt weiterhin `docs/DIPA_MATRIX_FINAL.md`. Die dortige
Bearbeitungsklasse (A–E) beantwortet „wer kann das erledigen" und bleibt
unverändert; die Klassen hier (A–D, andere Bedeutung, siehe Auftrag) sortieren
zusätzlich danach, was **heute** noch zu tun ist und von wem.

## Schema dieser Kategorisierung

| Klasse | Bedeutung |
|---|---|
| **A** | Vollständig intern erledigt — Code, Tests und/oder Doku liegen vor |
| **B** | Intern technisch machbar, war noch offen → **heute abgearbeitet** |
| **C** | Externes Dokument oder Dienstleister nötig |
| **D** | Regulatorische Entscheidung oder externer Nachweis nötig (Behörde/Kostenträger) |

Zuordnung zur Matrix-Klasse (A–E) und -Status: A→A; B/C(ERLEDIGT)→A;
B/C(OFFEN/TEILWEISE)→B; D(EXTERN)→C; E(EXTERN)→D.

---

## Was heute (14.08.2026) unter „B" abgearbeitet wurde

Vor dieser Sitzung waren laut Matrix-Zusammenfassung 4 Punkte in Klasse B
(davon 2 „teilweise") und 2 Punkte in Klasse C (davon 1 „teilweise") — macht
6 potenzielle B-Kandidaten nach dem neuen Schema. Bearbeitet:

### QS-05 — Browser-E2E-Test des Produktbereichs → jetzt **A**

Die Suite (`e2e/pflegecoach.spec.ts`) war geschrieben, aber in keiner Umgebung
je ausgeführt worden (`npm run test:e2e:install` war nie gelaufen). Heute:

1. `npm run test:e2e:install` ausgeführt (Chromium, Firefox, WebKit,
   FFmpeg installiert).
2. Suite gegen den laufenden Dev-Server ausgeführt (`chromium` und
   `mobile-safari`, je 24 Tests).
3. **4 echte, reproduzierbare Fehlschläge in der Test-Logik selbst gefunden
   und behoben** (nicht im Produkt):
   - „DiPA-Seiten sind ohne den Schalter nicht vorhanden" erwartete HTTP 404,
     tatsächlich (und korrekt) liefert `app/pflegecoach/anspruch/page.tsx`
     `redirect('/pflegecoach')` — derselbe Mechanismus wie bei allen
     GESCHÜTZT-Seiten. Die Kassen-Oberfläche wird nie ausgeliefert; der Test
     prüfte die falsche Eigenschaft. Assertion umgestellt auf: Redirect zur
     Startseite **und** Abwesenheit der Anspruchsprüfungs-Inhalte.
   - Zwei Tests lasen `body.innerText()` unmittelbar nach `page.goto()`,
     bevor der asynchrone Profil-Check von `/pflegecoach/start`
     (`useEffect` → `/api/coach/profil`) fertig war — sie fingen zuverlässig
     nur den Ladezustand „Wird geladen …" statt der Zweckbestimmung ein.
     Fix: `await expect(page.getByRole('heading', {level:1})).toBeVisible()`
     vor dem Text-Read.
   - „Formularfelder tragen eine Beschriftung" erkannte nur
     `label[for="id"]`, nicht die implizite Beschriftung von Radios/Checkboxen
     (`<label><input/>Text</label>`) — gültiges, zugängliches HTML nach WCAG
     1.3.1/4.1.2, das der Test fälschlich als unbeschriftet meldete. Fix:
     zusätzlich `element.closest('label')` prüfen.
   - „Bedienelemente erreichen die Mindestgröße von 44 Pixeln" traf mit dem
     ungefilterten Selektor `button:visible` zusätzlich Next.js' eigenen
     Dev-Tools-Button (`#next-logo`, 32×32 px, nur im Dev-Modus vorhanden,
     kein Produktbestandteil). Fix: Selektor auf `.pc-btn` eingegrenzt.
4. **1 echten Produktfehler gefunden und behoben** (siehe unten, gehört
   inhaltlich zu BF-03/BF-01, wurde aber über den QS-05-Lauf entdeckt).
5. Ergebnis nach Fixes: **24/24 grün auf Chromium, 24/24 grün auf
   Mobile Safari (iPhone-14-Emulation)**, wiederholt reproduziert, keine
   Flakiness in mehreren aufeinanderfolgenden Läufen bei ruhiger Umgebung.
6. Suite in `.github/workflows/ci.yml` aufgenommen (siehe dortigen Diff) —
   läuft ab sofort bei jedem Push/PR auf `main`.

**Gefundener Produktfehler (behoben):** Horizontaler Inhalts-Verlust auf
schmalen Viewports. Das globale Marketing-`body` (`app/globals.css`, für die
Phone-Mockup-Seiten) setzt `display:flex; justify-content:center;
overflow-x:hidden`. Ohne Gegenmaßnahme wird `.pc-root` dadurch zum
Flex-Item, das nicht unter die Min-Content-Breite seiner Kinder schrumpft
(insbesondere die nicht umbrechende Navigationsleiste). Auf einem
iPhone-14-Viewport (390 px) wurde Inhalt dadurch nicht nur gescrollt, sondern
durch `overflow-x:hidden` unerreichbar **abgeschnitten** — bereits bei
normaler Schriftgröße messbar (Dokument-`scrollWidth` 625 px bei 390 px
Viewport), bei 200 % Schrift deutlich sichtbar (Screenshot lag dem Fund
zugrunde). Betrifft WCAG 1.4.10 (Reflow) und ist für die Zielgruppe (auch
ältere/mobile Nutzer mit großer Schrift) unmittelbar relevant. Fix in
`app/pflegecoach/pflegecoach.css`: `.pc-root { width:100%; min-width:0; }`
— beseitigt, ohne die globale, vom Marketing-Auftritt geteilte
`body`-Regel anzufassen. Verifiziert: Mobile-Safari-Testfall lief davor
reproduzierbar rot, danach grün.

### BF-03 — Screenreader-Durchgang → bleibt **B**, teilweise vertieft

Die maschinelle Strukturprüfung war und ist Teil der jetzt laufenden Suite
(6 Tests, siehe `docs/dipa/14_ACCESSIBILITY_GAP_LISTE.md`). Zusätzlich wurde
heute ein ergänzender Accessibility-Tree-Durchgang (Chromium-Accessibility-Baum,
kein echter Screenreader) gegen die Prüfpunkte S1–S8 durchgeführt — Ergebnis
und ausdrückliche Grenzen dieses Durchgangs in
`docs/dipa/14_ACCESSIBILITY_GAP_LISTE.md` §2a. Der **manuelle** Durchgang mit
tatsächlicher Screenreader-Software (VoiceOver/NVDA) durch eine Person bleibt
offen — das kann kein Agent und keine Maschine ersetzen (wörtlich aus dem
Durchführungsplan: „ob eine Ansage verständlich ist, kann keine Maschine
beurteilen"). Deshalb bleibt der Punkt Klasse **B** (intern machbar, noch
offen), nicht A.

### INT-02 — FHIR-Verbindlichkeit

Technisch vollständig (Klasse A: `lib/coach/fhir.ts`, 13 Tests, Doku). Die
offene Frage ist ausschließlich die regulatorische Verbindlichkeit — das ist
keine interne Aufgabe, sondern gehört zu Klasse **D** und ist Teil des
BfArM-Fragenkatalogs (Frage 10, siehe unten REG-05).

---

## Vollständige Neukategorisierung (48 Punkte)

### Klasse A — vollständig intern erledigt (31)

PROD-01 bis PROD-06 (6) · DS-01, DS-03, DS-05, DS-06, DS-07 (5) ·
SEC-02, SEC-03, SEC-06, SEC-07, SEC-08 (5) · INT-01, INT-02 (technischer Teil), INT-03 (3) ·
QI-03 (1) · NN-02, NN-03 (2) · VS-01, VS-02, VS-03 (3) ·
QMS-01, QMS-02, QMS-03, QS-04, **QS-05 (neu, 14.08.2026)**, BETR-01 (6)

= 6+5+5+3+1+2+3+6 = **31**

### Klasse B — intern machbar, offen (1)

| # | Punkt | Was fehlt konkret | Wer im Betrieb |
|---|---|---|---|
| BF-03 | Manueller Screenreader-Durchgang (S1–S8) | Live-Sitzung mit VoiceOver (macOS/iOS) oder NVDA (Windows) gegen `/pflegecoach/start`, `/anfrage`, `/datenschutz` und — mit Testkonto — die geschützten Seiten. Checkliste liegt vor (`docs/dipa/14_ACCESSIBILITY_GAP_LISTE.md` §2). Aufwand: Teil der geschätzten 3,5 Tage in `audit/dipa/gebrauchstauglichkeit_durchfuehrungsplan.md`, kann aber separat vorgezogen werden. | Eine Person im eigenen Betrieb, keine externe Beauftragung nötig |

### Klasse C — externes Dokument/Dienstleister nötig (11)

Siehe To-do-Pakete unten. DS-02, DS-04, SEC-01, SEC-04, SEC-05, BF-01, BF-02,
QI-01, QI-02, NN-01, VS-04.

### Klasse D — regulatorische Entscheidung/Nachweis nötig (5)

Siehe To-do-Pakete unten. REG-01, REG-02, REG-03, REG-04, REG-05.

---

## To-do-Pakete — Klasse C (externes Dokument/Dienstleister)

Jedes Paket ist so vorbereitet, dass nur noch die externe Leistung fehlt —
interne Unterlagen liegen jeweils versandfertig vor.

### C-1 — Datenschutz-Folgenabschätzung (DSFA, Art. 35 DSGVO) — DS-02

* **Zweck:** Rechtlich verbindliche Bewertung der Verarbeitungsrisiken für
  Gesundheitsdaten im PflegeCoach; Voraussetzung für einen BfArM-Antrag.
* **Benötigtes Ergebnis:** Unterschriebene DSFA mit Risikobewertung und
  Restrisiko-Einschätzung, die die offenen Bewertungen in
  `audit/dipa/dsfa_pflegecoach.md` schließt.
* **Wer liefert:** Datenschutzkanzlei oder externer Datenschutzbeauftragter.
* **Intern vorbereitet:** `audit/dipa/dsfa_pflegecoach.md` (Vorbereitung,
  offene Bewertungen markiert), `docs/dipa/02_DATENSCHUTZ_TOM_DSFA_VORBEREITUNG.md`
  (TOM-Zusammenfassung als Grundlage).
* **Abhängigkeiten:** Sollte mit C-2 (AVV), C-11 (Nutzungsbedingungen) und
  PROD-02 (juristische Prüfung der MDR-Negativabgrenzung) in **ein Mandat**
  gebündelt werden (Empfehlung aus der Matrix-Zusammenfassung).
* **Priorität:** BfArM-Voraussetzung — vor Antragstellung zwingend.

### C-2 — Auftragsverarbeitungs-Kette (AVV, Art. 28 DSGVO) — DS-04

* **Zweck:** Vertragliche Absicherung der Datenverarbeitung durch
  Unterauftragnehmer (Supabase, Vercel, Resend, Stripe).
* **Benötigtes Ergebnis:** Unterschriebene AVV mit jedem der vier Anbieter,
  Unterauftragnehmerlisten, Angaben zu Sicherungsfristen.
* **Wer liefert:** Die vier Anbieter (AVV-Formulare meist standardisiert
  abrufbar) — intern zu beschaffen/gegenzuzeichnen, ggf. Kanzlei-Review.
* **Intern vorbereitet:** `audit/dipa/avv_dossier_pflegecoach.md` (Kette
  erhoben, 10-Punkte-Prüfliste), `docs/dipa/03_VERZEICHNIS_VERARBEITUNGSTAETIGKEITEN.md`.
* **Abhängigkeiten:** DS-03 (Löschkonzept-Fristen hängen an den
  AVV-Sicherungsfristen); Restrisiko R2.9 in der Risikoakte.
* **Priorität:** BfArM-Voraussetzung.

### C-3 — TR-03161-Zertifizierung (BSI) — SEC-01

* **Zweck:** Formaler Sicherheitsnachweis nach BSI TR-03161, DiPA-Pflichtnachweis.
* **Benötigtes Ergebnis:** Zertifikat einer akkreditierten Prüfstelle.
* **Wer liefert:** Akkreditierte Prüfstelle (Liste beim BSI).
* **Intern vorbereitet:** `audit/dipa/tr03161_checkliste.md` (Selbsteinschätzung).
* **Abhängigkeiten:** Längste Vorlaufzeit im gesamten Verfahren (Monate).
  Sollte die Beauftragungsunterlage aus C-4 (Pentest) direkt mitschicken und
  erfragen, ob der Pentest als Teilleistung anerkannt wird. Klärung mit dem
  BfArM, ob eine vorläufige Aufnahme ohne fertiges Zertifikat möglich ist
  (Frage 9 in REG-05).
* **Priorität:** BfArM-Voraussetzung, höchste Dringlichkeit wegen Vorlaufzeit
  — jetzt anfragen.

### C-4 — Externer Penetrationstest — SEC-04

* **Zweck:** Unabhängiger Sicherheitsnachweis für Antrag und TR-03161.
* **Benötigtes Ergebnis:** Pentest-Bericht mit Schwachstellenliste und
  Nachbesserungsnachweis.
* **Wer liefert:** Externer Pentest-Anbieter.
* **Intern vorbereitet:** `audit/dipa/pentest_beauftragung_scope.md`
  (versandfertig: Umfang, 5 Testkonten, 6 Schwerpunkte, Regeln,
  Abnahmekriterien).
* **Abhängigkeiten:** Sollte vor/mit C-3 angefragt werden.
* **Priorität:** BfArM-Voraussetzung.

### C-5 — ISMS-Aufbau/-Zertifizierung (ISO 27001 o. ä.) — SEC-05

* **Zweck:** Informationssicherheits-Managementsystem als Rahmen für SEC-01–07.
* **Benötigtes Ergebnis:** Geltungsbereich festgelegt, Beratung beauftragt,
  perspektivisch Zertifizierung.
* **Wer liefert:** ISMS-Berater/Zertifizierungsstelle.
* **Intern vorbereitet:** `audit/dipa/isms_scope_vorbereitung.md` (3
  Geltungsbereiche bewertet, 13 Themenfelder erhoben, 5 größte Lücken benannt).
* **Abhängigkeiten:** Geltungsbereich zuerst mit dem BfArM klären (Frage 11
  in REG-05) — sonst Gefahr einer Fehlinvestition.
* **Priorität:** BfArM-Voraussetzung, aber erst NACH REG-05 sinnvoll beauftragbar.

### C-6 — BITV-Test (Barrierefreiheit) — BF-01

* **Zweck:** Unabhängiger Konformitätsnachweis zu EN 301 549 / WCAG 2.1 AA.
* **Benötigtes Ergebnis:** BITV-Testbericht.
* **Wer liefert:** Akkreditierte Prüfstelle für Barrierefreiheit.
* **Intern vorbereitet:** Grundausstattung umgesetzt und maschinell geprüft
  (`docs/dipa/14_ACCESSIBILITY_GAP_LISTE.md`).
* **Abhängigkeiten:** Nachweisform mit BfArM klären (Frage 12 in REG-05).
* **Priorität:** BfArM-Voraussetzung.

### C-7 — Gebrauchstauglichkeitstest mit Zielgruppe — BF-02

* **Zweck:** Nachweis, dass das Produkt von der tatsächlichen Zielgruppe
  selbständig bedienbar ist.
* **Benötigtes Ergebnis:** Ausgefüllte Testprotokolle für 5 Testpersonen,
  Auswertung nach dem festgelegten Maßstab.
* **Wer liefert:** 5 externe Testpersonen aus der Zielgruppe (kein
  Dienstleister im engeren Sinn — der Engpass ist die Personengewinnung,
  nicht ein Auftrag).
* **Intern vorbereitet:** `audit/dipa/gebrauchstauglichkeit_durchfuehrungsplan.md`
  (5 Profile, 9 Aufgaben A1–A9, Zeitlimits, Erfolgskriterien, Bewertungsmaßstab).
* **Abhängigkeiten:** Kann organisatorisch mit B-1 (Screenreader-Durchgang)
  zusammengelegt werden.
* **Priorität:** BfArM-Voraussetzung (Nutzennachweis stützt sich mit darauf).

### C-8 — Pflegefachliche Inhaltsfreigabe — QI-01

* **Zweck:** Fachliche Freigabe aller 12 Wissensmodule — **höchstes
  Produktrisiko (R1.4)**, betrifft auch das heute verkaufte Produkt A.
* **Benötigtes Ergebnis:** Jedes Modul von `pruefstatus: 'entwurf'` auf
  freigegeben, mit Protokoll je Modul.
* **Wer liefert:** Externe Pflegefachkraft.
* **Intern vorbereitet:** `audit/dipa/inhalte_pruefdossier.md` (12 Module,
  Kriterien K1–K6, Einstufungen, Protokollform, Ablauf nach Freigabe).
* **Abhängigkeiten:** Mit QI-03 gegenprüfen.
* **Priorität:** Höchste — senkt das höchste Produktrisiko unabhängig vom
  BfArM-Verfahren.

### C-9 — Lizenzierung der Erhebungsinstrumente — QI-02

* **Zweck:** FES-I, HPS/BSFC-s, SUS sind lizenzpflichtige, validierte
  Instrumente; aktuell nur ein nicht validiertes Kurzinstrument im Einsatz.
* **Benötigtes Ergebnis:** Lizenzverträge oder Entscheidung gegen den Einsatz.
* **Wer liefert:** Rechteinhaber der jeweiligen Instrumente.
* **Intern vorbereitet:** FHIR-Export überträgt bereits nur Summenwerte,
  keine Fragetexte (lizenzsicher vorbereitet).
* **Abhängigkeiten:** Klärung, ob der BfArM-Antrag validierte Instrumente
  zwingend voraussetzt (Frage 16 in REG-05) — davor keine Lizenzkosten auslösen.
* **Priorität:** Nach REG-05.

### C-10 — Wissenschaftlicher Evaluationspartner + Ethikvotum — NN-01

* **Zweck:** Einreichungsreifes Evaluationskonzept braucht einen
  Studienpartner und ein Ethikvotum.
* **Benötigtes Ergebnis:** Kooperationsvereinbarung mit Hochschule/Institut,
  positives Ethikvotum.
* **Wer liefert:** Hochschule/Forschungsinstitut; Ethikkommission.
* **Intern vorbereitet:** `audit/dipa/evaluationskonzept.md`.
* **Abhängigkeiten:** Lange Anbahnungszeit — früh beginnen.
* **Priorität:** BfArM-Voraussetzung, aber lange Vorlaufzeit — parallel zu C-3 starten.

### C-11 — Nutzungsbedingungen Selbstzahler-Weg — VS-04

* **Zweck:** Rechtswirksame Nutzungsbedingungen für den heute aktiven
  Produkt-A-Verkauf.
* **Benötigtes Ergebnis:** Juristisch geprüfte, veröffentlichte
  Nutzungsbedingungen.
* **Wer liefert:** Rechtsanwaltskanzlei.
* **Intern vorbereitet:** `audit/dipa/nutzungsbedingungen_entwurf_selbstzahler.md`
  (13 Paragrafen, 10-Punkte-Prüfliste, keine erfundenen Beträge).
* **Abhängigkeiten:** Mit C-1 und PROD-02 bündeln.
* **Priorität:** Vor Verkaufsfreigabe von Produkt A zwingend (unabhängig vom
  DiPA-Verfahren) — höher als reine BfArM-Vorbereitung.

---

## To-do-Pakete — Klasse D (regulatorische Entscheidung/Nachweis, Behörde/Kostenträger)

### D-1 — BfArM-Beratungstermin — REG-05

* **Zweck:** Klärt REG-02 bis REG-04, SEC-01, SEC-05, INT-02 und QI-02 in
  einem Termin — der wirksamste einzelne nächste Schritt im gesamten Verfahren.
* **Benötigtes Ergebnis:** Protokollierte Antworten auf die 20 vorbereiteten Fragen.
* **Wer liefert:** BfArM.
* **Intern vorbereitet:** `audit/dipa/bfarm_fragenkatalog.md` (Fragen 1–20).
* **Abhängigkeiten:** Keine — sofort beantragbar, blockiert nichts anderes.
* **Priorität:** Höchste. Vor C-3, C-5, C-9 idealerweise terminiert.

### D-2 — Freischaltcode-Verfahren verbindlich? — REG-02

* **Zweck:** Klärt, ob und wie ein Freischaltcode-Verfahren für den
  DiPA-Zugang vorgeschrieben ist.
* **Benötigtes Ergebnis:** Verbindliche Aussage des BfArM.
* **Wer liefert:** BfArM (Teil von D-1).
* **Intern vorbereitet:** Mechanismus vollständig gebaut und getestet, per
  `COACH_FREISCHALTUNG_PFLICHT=false` deaktiviert.
* **Abhängigkeiten:** Teil von D-1.
* **Priorität:** Mit D-1.

### D-3 — Qualifikationsanforderungen eUL-Erbringer — REG-03

* **Zweck:** Die selbst gesetzten Kriterien in
  `audit/dipa/eul_qualitaetsanforderungen.md` sind nicht regulatorisch
  abgeleitet (ORF-1) und müssen bestätigt oder ersetzt werden.
* **Wer liefert:** BfArM/GKV (Teil von D-1, ggf. weiterführende Klärung).
* **Priorität:** Mit D-1.

### D-4 — Vergütung und Abrechnungsweg — REG-04

* **Zweck:** Erst nach Aufnahme ins DiPA-Verzeichnis verhandelbar; bis dahin
  bleibt `coach_abrechnungswege` fail-closed über `verguetung_geklaert`.
* **Wer liefert:** BfArM/GKV, nach Aufnahme.
* **Priorität:** Nachgelagert — nicht vor Aufnahme angehbar.

### D-5 — Anforderungstexte gegen Originaldokumente prüfen — REG-01

* **Zweck:** Nur 6 % der 48 Matrixeinträge sind aktuell gegen die
  Originaltexte von DiPAV/BfArM-Leitfaden/TR-03161 geprüft
  (`anforderungstextGeprueft` in `lib/coach/anforderungskatalog.ts`).
* **Benötigtes Ergebnis:** Jeder Eintrag gegen die zum Antragszeitpunkt
  gültige Fassung geprüft und geflaggt.
* **Wer liefert:** Intern (keine externe Stelle), aber erst sinnvoll, sobald
  die Originaldokumente in ihrer aktuellen Fassung vorliegen — bei
  Rechtstexten in ständiger Änderung ist das kein reiner Lesevorgang, sondern
  bewusst als „regulatorischer Nachweis" statt als reine B-Aufgabe eingestuft.
* **Werkzeug bereits vorhanden:** `npm run dipa:katalog`.
* **Priorität:** Unmittelbar vor Antragstellung, nicht vorher (Texte könnten
  sich bis dahin ändern).

---

## Zusammenfassung

| Klasse | Anzahl | Veränderung heute |
|---|---|---|
| A | 31 | +5 (QS-05, SEC-03, QS-04, QMS-01, INT-02-technisch — die letzten vier waren vorher bereits als „ERLEDIGT (14.08.2026)" markiert, hier erstmals in die neue A-Zählung übernommen; **QS-05 ist die einzige heute neu abgeschlossene Position**) |
| B | 1 | −1 gegenüber den vorher 6 potenziellen Kandidaten (BF-03 bleibt offen — erfordert eine echte Screenreader-Sitzung) |
| C | 11 | unverändert, alle To-do-Pakete oben versandfertig |
| D | 5 | unverändert, alle To-do-Pakete oben versandfertig |

**Nächster wirksamster Schritt:** D-1 (BfArM-Beratungstermin) — löst sechs
Unklarheiten gleichzeitig. Parallel dazu C-3 (TR-03161) wegen der längsten
Vorlaufzeit anfragen.

## Quellen

* `docs/DIPA_MATRIX_FINAL.md` — maßgebliche 48-Punkte-Matrix
* `e2e/pflegecoach.spec.ts` — heute ausgeführt und korrigiert
* `.github/workflows/ci.yml` — E2E-Job heute ergänzt
* `app/pflegecoach/pflegecoach.css` — Reflow-Fix heute
* `docs/dipa/14_ACCESSIBILITY_GAP_LISTE.md`, `docs/dipa/15_EVIDENCE_NACHWEIS_MATRIX.md`
