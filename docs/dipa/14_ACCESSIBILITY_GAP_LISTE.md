# Accessibility-Gap-Liste — Digitaler PflegeCoach

**Stand:** 2026-08-14
**Zweck:** Was an Barrierefreiheit umgesetzt und maschinell geprüft ist, und was noch fehlt — deckt DiPA-Matrix BF-01 bis BF-03 ab.

---

## 1. Umgesetzt (Grundausstattung, DiPA-Matrix BF-01)

Laut `docs/DIPA_MATRIX_FINAL.md` (BF-01):

* 3 Schriftgrade
* Kontrastmodus
* Skip-Link
* ARIA-Landmarks
* Touch-Ziele ≥ 44 px
* `prefers-reduced-motion`

Diese Grundausstattung ist die Basis, auf der die maschinelle Strukturprüfung
(§2) und der noch ausstehende externe Nachweis (§3) aufbauen.

## 2. Maschinell geprüft — tatsächliche Checks in `e2e/pflegecoach.spec.ts`

Describe-Block „PflegeCoach — Struktur der Barrierefreiheit", sechs Tests:

| Test | Prüft |
|---|---|
| „jede Seite hat genau eine Hauptüberschrift und einen eigenen Titel" | genau ein `h1` je öffentlicher Seite; eindeutiger, nicht-leerer `<title>` je Seite (WCAG 2.4.2) |
| „Sprungmarke zum Inhalt ist vorhanden und erreichbar" | `a.pc-skiplink` mit `href="#pc-main"`, fokussierbar, Ziel `#pc-main` existiert genau einmal |
| „Landmarks für Navigation und Inhalt sind gesetzt" | genau ein `main`-Landmark, genau ein `footer` |
| „Bedienelemente erreichen die Mindestgröße von 44 Pixeln" | jede sichtbare Schaltfläche/Link mit Klasse `pc-btn` ≥ 44 px Höhe |
| „Formularfelder tragen eine Beschriftung" | jedes sichtbare Eingabefeld hat `label[for]`, `aria-label` oder `aria-labelledby` |
| „die Seite bleibt bei doppelter Schriftgröße bedienbar" | kein horizontaler Überlauf bei 200 % Schriftgröße |

Diese Tests laufen ausdrücklich **ohne Anmeldung** gegen die öffentlichen
Seiten (`/pflegecoach/start`, `/pflegecoach/datenschutz`,
`/pflegecoach/anfrage`) — die datentragenden Bereiche sind gegen echte
Anmeldung im E2E-Lauf bewusst nicht getestet (Begründung im Testkommentar:
Datensparsamkeit hat Vorrang vor Testabdeckung in einer echten Datenbank).

**Wichtig — Doppelboden zur Prüfpunktliste S1–S8:** Diese sechs Tests sind
**strukturelle** Prüfungen, keine Screenreader-Prüfung. Die eigenständigen
Prüfpunkte S1–S8 (aus `audit/dipa/gebrauchstauglichkeit_durchfuehrungsplan.md`,
§5) sind für den **manuellen** Durchgang mit VoiceOver/NVDA definiert und
decken sich nur teilweise mit den e2e-Checks:

| # | Prüfpunkt S1–S8 | Durch e2e bereits abgedeckt? |
|---|---|---|
| S1 | Wird der Seitentitel beim Wechsel angesagt? | teilweise — e2e prüft nur Existenz/Eindeutigkeit des `<title>`, nicht die tatsächliche Ansage |
| S2 | Ist die Sprungmarke zum Inhalt erreichbar und wirksam? | ja, strukturell |
| S3 | Sind Überschriftenebenen sinnvoll und sprungfähig? | teilweise — nur `h1`-Eindeutigkeit geprüft, nicht die vollständige Hierarchie |
| S4 | Trägt jedes Formularfeld eine vorgelesene Beschriftung? | teilweise — e2e prüft Vorhandensein eines Labels, nicht die tatsächliche Vorlesbarkeit |
| S5 | Werden Fehlermeldungen und Bestätigungen angesagt? | nein |
| S6 | Sind Schaltflächen an ihrem Namen erkennbar? | nein |
| S7 | Ist der QR-Code der Anmeldesicherheit mit einem Alternativweg hinterlegt? | nein |
| S8 | Ist die Seite vollständig mit der Tastatur bedienbar, ohne Fokusfalle? | nein |

Die maschinelle Prüfung ist also die **Voraussetzung**, nicht der Ersatz für
den manuellen Durchgang — „ob eine Ansage verständlich ist, kann keine
Maschine beurteilen" (wörtlich aus
`audit/dipa/gebrauchstauglichkeit_durchfuehrungsplan.md`).

### 2a. Ergänzender Accessibility-Tree-Durchgang (14.08.2026, kein Screenreader-Ersatz)

Zusätzlich zur automatisierten Suite wurde der Chromium-Accessibility-Baum von
`/pflegecoach/start` und `/pflegecoach/anfrage` gelesen (kein echtes
VoiceOver/NVDA — nur der Baum, den ein Screenreader konsumieren würde).
**Ausdrückliche Grenze:** keine Prüfung von Ansage-Timing, Sprachausgabe oder
Live-Region-Verhalten — dafür braucht es die echte Software.

Ergebnis: Struktur (Landmarks, Überschriftenhierarchie, Formular-Label über
`label[for]` **und** implizite Label-Wrapping bei Radios/Checkbox) ist im Baum
korrekt abgebildet. **Ein konkreter Prüfpunkt für den manuellen Durchgang**:
Im gelesenen Baum erscheint bei den Radiobuttons und der Checkbox auf
`/pflegecoach/anfrage` als Kennung der rohe `value`/Zustand (z. B.
`radio "fuer_mich"`, `checkbox "on"`) statt des sichtbaren Label-Texts (z. B.
„Für mich selbst"). Ob das ein Artefakt des Inspektionswerkzeugs ist oder die
tatsächlich vorgelesene Ansage betrifft, lässt sich nur mit echter
Screenreader-Software klären — deshalb hier nicht als Befund gewertet, sondern
als **erster zu prüfender Punkt** für den Durchgang aus §3.3 vermerkt.

## 3. Was fehlt

### 3.1 BITV-Test — EXTERN_BENÖTIGT

DiPA-Matrix BF-01, Klasse **D**, Status **EXTERN**. Volle Konformität zu
EN 301 549 / WCAG 2.1 AA verlangt eine Prüfung durch eine unabhängige
Prüfstelle (BITV-Test). Die interne Grundausstattung und die
Strukturprüfung ersetzen diesen Nachweis nicht. Nächste Aktion: Prüfstelle
beauftragen; Nachweisform mit dem BfArM klären (Frage 12 in
`audit/dipa/bfarm_fragenkatalog.md`).

### 3.2 Gebrauchstauglichkeitstest mit Zielgruppe — EXTERN_BENÖTIGT

DiPA-Matrix BF-02, Klasse **D**, Status **EXTERN (Testpersonen)**. Vollständig
vorbereitet in `audit/dipa/gebrauchstauglichkeit_durchfuehrungsplan.md`:

* **5 Testpersonen** definiert (Pflegegrad 1–2, Pflegegrad 3+ mit
  Hilfsmitteln, berufstätige/r pflegende/r Angehörige/r, Person > 75 mit
  geringer Technikerfahrung, Person mit Seh- oder Feinmotorikeinschränkung).
* **9 Aufgaben** (A1–A9) mit Zeitlimits und Erfolgskriterien — A1 (Verständnis
  der Zweckbestimmung) und A8 (Nutzung beenden/Daten löschen) gelten als die
  regulatorisch wichtigsten.
* Bewertungsmaßstab: ≥ 4/5 selbständig = tragfähig, 2–3/5 = Änderung vor
  Pilotstart nötig, ≤ 1/5 = schwerwiegend, Wiederholung nötig.
* Aufwand geschätzt: ca. 3,5 Tage insgesamt (Vorbereitung, Durchführung,
  Screenreader-Durchgang, Auswertung).

**Engpass ist nicht der Aufwand, sondern die Gewinnung von Testpersonen aus
der eigentlichen Zielgruppe** — Ersatzpersonen ohne die relevanten Merkmale
(hohes Alter, eingeschränkte Feinmotorik, geringe Technikerfahrung) würden ein
wertloses Ergebnis liefern. Status laut Durchführungsplan: „Nicht
durchgeführt. Keine Testperson gewonnen, kein Termin."

### 3.3 Manueller Screenreader-Durchgang — INTERN DURCHFÜHRBAR, noch nicht erfolgt

DiPA-Matrix BF-03, Klasse **C**, Status **TEILWEISE**. Anders als BF-01 und
BF-02 ist dieser Punkt **kein zwingender externer Dienstleistungsbedarf** —
er kann von einer Person im eigenen Betrieb mit VoiceOver (macOS/iOS) und
NVDA (Windows) durchgeführt werden. Umfang: dieselben Seiten wie in den
Aufgaben A1–A9, geprüft gegen die 8 Prüfpunkte S1–S8 aus §2. Bislang **nicht
durchgeführt** — der Durchführungsplan sieht ihn organisatorisch zusammen mit
dem Gebrauchstauglichkeitstest (§3.2) vor, ist aber fachlich nicht daran
gebunden und könnte separat vorgezogen werden.

## 4. Zusammenfassung

| Punkt | Klasse | Status | Wer kann es lösen |
|---|---|---|---|
| BF-01 — BITV-Test | D | EXTERN | Prüfstelle |
| BF-02 — Gebrauchstauglichkeitstest (5 Testpersonen) | D | EXTERN (Testpersonen) | eigener Betrieb muss Testpersonen gewinnen; Durchführung selbst intern möglich |
| BF-03 — Screenreader-Durchgang (S1–S8) | C | TEILWEISE (Struktur maschinell geprüft, manueller Durchgang offen) | intern, eine Person mit VoiceOver/NVDA |

---

## Quellen

* `docs/DIPA_MATRIX_FINAL.md` (BF-01 bis BF-03)
* `e2e/pflegecoach.spec.ts`
* `audit/dipa/gebrauchstauglichkeit_durchfuehrungsplan.md`
* `audit/dipa/gebrauchstauglichkeit_testprotokoll.md`
* `audit/dipa/bfarm_fragenkatalog.md`
