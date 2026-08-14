# Accessibility-Gap-Liste — Digitaler PflegeCoach

**Stand:** 2026-08-14 (aktualisiert nach dem axe-core-Durchgang)
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

## 2b. Regelbasierter axe-core-Durchgang (14.08.2026) — `e2e/pflegecoach-axe.spec.ts`

Neu hinzugekommen: ein **regelbasierter** Accessibility-Durchgang mit **axe-core 4.11.3**
gegen die WCAG-Regelsätze `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`. axe-core lag
bereits als transitive Abhängigkeit im Baum; es wird als Skript in die Seite injiziert,
damit für diesen Nachweis keine neue Abhängigkeit aufgenommen werden muss.

**Tatsächlich ausgeführt** am 14.08.2026 gegen `https://alltagsengel.care`
(Produktionsstand), in **beiden** Browser-Projekten der Playwright-Matrix:

```
PLAYWRIGHT_BASE_URL=https://alltagsengel.care npx playwright test e2e/pflegecoach-axe.spec.ts
→ 10 passed  (5 Tests × Chromium + Mobile Safari)
```

### Ergebnis je Seite

| Seite | axe-Regeln bestanden | Verstöße | „manuell zu klären" (incomplete) |
|---|---|---|---|
| `/pflegecoach/start` | 26 | **0** | 1 — `color-contrast` auf `a[href$="register"]` |
| `/pflegecoach/datenschutz` | 23 | **0** | 0 |
| `/pflegecoach/anfrage` | 27 | **0** | 0 |
| `/pflegecoach/anfrage` nach Absendeversuch | 27 | **0** | 0 |

### Systematisch geprüfte Struktur (Landmark-Inventur, je Seite protokolliert)

| Seite | Landmarks | h1 | Überschriften | `lang` | Eingaben | ohne Label | Knöpfe ohne Namen |
|---|---|---|---|---|---|---|---|
| `/pflegecoach/start` | banner, group, navigation, status, main, contentinfo | 1 | h1 + 6× h2 | `de` | 0 | 0 | 0 |
| `/pflegecoach/datenschutz` | banner, group, navigation, status, main, contentinfo | 1 | h1 + 5× h2 | `de` | 0 | 0 | 0 |
| `/pflegecoach/anfrage` | banner, group, navigation, status, main, contentinfo | 1 | h1 + 2× h2 | `de` | 8 | **0** | 0 |

Zusätzlich maschinell zugesichert: keine übersprungene Überschriftenebene (WCAG 1.3.1),
`<html lang="de">` gesetzt, genau eine `h1`, `main`- und `contentinfo`-Landmark vorhanden.

### Dabei gefundener echter Fehler — behoben

Der einzige `incomplete`-Befund war **kein Werkzeugartefakt, sondern ein echter,
sichtbarer Bedienfehler**. Am Live-DOM nachgemessen:

```
a.pc-btn "Konto anlegen":  color rgb(11,83,148)  auf  background rgb(11,83,148)
→ Kontrastverhältnis 1:1 — die Beschriftung des primären Handlungsknopfes war unsichtbar.
```

**Ursache:** CSS-Spezifität. `.pc-root a` (0,1,1) schlägt `.pc-btn` (0,1,0) unabhängig von
der Reihenfolge — jeder Link-Button (`<Link className="pc-btn">`) erbte damit die Linkfarbe
`--pc-primary` und stand auf seinem eigenen `--pc-primary`-Hintergrund. Betroffen war
ausschließlich die **primäre** Variante; `.pc-btn--secondary` (blau auf weiß) und echte
`<button>`-Elemente waren korrekt.

**Behoben** in `app/pflegecoach/pflegecoach.css` durch vier spezifitätsgleiche Regeln
(`.pc-root a.pc-btn` / `--secondary`, jeweils mit `:hover`). Gegenprobe am Live-DOM:
Primär `rgb(255,255,255)` auf `rgb(11,83,148)` = **7,8:1**, Sekundär `rgb(11,83,148)` auf
`rgb(255,255,255)` = **7,4:1** — beide deutlich über der AA-Schwelle 4,5:1.

**Lehre, die in den Test eingebaut wurde:** axe-core hat diesen Fall **nicht als Verstoß
gemeldet**, sondern nur als `incomplete`. Ein Durchgang, der allein auf `violations.length === 0`
prüft, wäre grün gewesen — mit einem unsichtbaren Hauptknopf im Produkt. Deshalb enthält
`e2e/pflegecoach-axe.spec.ts` jetzt zusätzlich einen **eigenen Kontrastrechner**, der für
jede sichtbare `.pc-btn` das Verhältnis gegen den ersten nicht-transparenten Hintergrund
der Elternkette berechnet und unter 4,5:1 fehlschlägt.

**Beide Richtungen belegt** — der Test behauptet die Regression nicht, er weist sie nach:

| Lauf | Stand | Ergebnis |
|---|---|---|
| gegen `https://alltagsengel.care` **vor** dem Fix | Produktion mit Fehler | **fehlgeschlagen**, Verhältnis `1` |
| gegen den lokalen Produktions-Build **nach** dem Fix | `npm run build` + `npm run start` | **12/12 grün** (Chromium + Mobile Safari); der `incomplete`-Befund auf `/pflegecoach/start` ist mit verschwunden |

Die bestehende Suite `e2e/pflegecoach.spec.ts` lief gegen denselben Build ebenfalls
vollständig durch (**48/48**), die CSS-Änderung hat also nichts anderes verschoben.
Beide Suiten laufen ab sofort gemeinsam im CI-Job `e2e` (`.github/workflows/ci.yml`).

### Was dieser Durchgang ausdrücklich NICHT ist

axe-core prüft, was maschinell entscheidbar ist. Nicht geprüft und nicht prüfbar bleiben:
ob eine Ansage **verständlich** ist, ob eine Live-Region **zum richtigen Zeitpunkt** spricht,
ob ein Alternativtext **inhaltlich** stimmt, ob die **Vorlese-Reihenfolge** sinnvoll ist und
ob in echter Screenreader-Bedienung eine **Fokusfalle** entsteht. Der Durchgang ersetzt
damit weder §3.1 (BITV-Test) noch §3.3 (manueller VoiceOver/NVDA-Durchgang) — er ist deren
Voraussetzung.

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

**Maschineller Anteil ist nach dem axe-core-Durchgang (§2b) abgeschlossen.**
Der verbleibende manuelle Anteil ist damit klar abgegrenzt — dies ist die
Arbeitsliste für die Person, die den Durchgang macht:

| # | Prüfpunkt | Maschinell abgedeckt? | Was der manuelle Durchgang leisten muss |
|---|---|:---:|---|
| S1 | Seitentitel beim Wechsel angesagt? | teilweise | Existenz/Eindeutigkeit des `<title>` ist maschinell belegt — **ob** und **wann** er angesagt wird, nicht |
| S2 | Sprungmarke erreichbar und wirksam? | ✅ strukturell | Nur noch die tatsächliche Sprungwirkung im Screenreader bestätigen |
| S3 | Überschriftenebenen sinnvoll und sprungfähig? | ✅ formal | Hierarchie ist lückenlos (kein Ebenensprung, geprüft) — **inhaltliche** Sinnhaftigkeit bleibt Urteilsfrage |
| S4 | Formularfeld-Beschriftungen vorgelesen? | teilweise | 8 von 8 Feldern auf `/pflegecoach/anfrage` tragen ein Label (geprüft) — die **Ansage** ist zu hören |
| S5 | Fehlermeldungen/Bestätigungen angesagt? | **nein** | Live-Region-Verhalten; axe prüft keine Ansage-Zeitpunkte |
| S6 | Schaltflächen am Namen erkennbar? | teilweise | 0 Schaltflächen ohne zugänglichen Namen (geprüft) — ob der Name **treffend** ist, nicht |
| S7 | QR-Code der Anmeldesicherheit mit Alternativweg? | **nein** | Nur unter Anmeldung erreichbar, im E2E-Lauf bewusst nicht getestet |
| S8 | Vollständig tastaturbedienbar, ohne Fokusfalle? | **nein** | Muss von Hand durchlaufen werden |

**Erster konkreter Prüfpunkt** (aus §2a, unverändert offen): Im
Accessibility-Baum erscheint bei den Radiobuttons und der Checkbox auf
`/pflegecoach/anfrage` als Kennung der rohe `value`/Zustand statt des
sichtbaren Label-Texts. Ob das ein Artefakt des Inspektionswerkzeugs ist oder
die tatsächliche Ansage betrifft, klärt nur echte Screenreader-Software.
Anmerkung dazu: der axe-Durchgang meldet für diese Felder **keinen** Verstoß
(`label`-Regel bestanden) — was den Punkt nicht entkräftet, sondern zeigt,
dass genau hier die Grenze der Maschine liegt.

## 4. Zusammenfassung

| Punkt | Klasse | Status | Wer kann es lösen |
|---|---|---|---|
| BF-01 — BITV-Test | D | EXTERN | Prüfstelle |
| BF-02 — Gebrauchstauglichkeitstest (5 Testpersonen) | D | EXTERN (Testpersonen) | eigener Betrieb muss Testpersonen gewinnen; Durchführung selbst intern möglich |
| BF-03 — Screenreader-Durchgang (S1–S8) | C | TEILWEISE (maschineller Anteil **abgeschlossen**: axe-core WCAG 2.1 A/AA + Landmark-Inventur, 0 Verstöße auf beiden Browsern; manueller Durchgang S1/S5/S7/S8 offen) | intern, eine Person mit VoiceOver/NVDA |

---

## Quellen

* `docs/DIPA_MATRIX_FINAL.md` (BF-01 bis BF-03)
* `e2e/pflegecoach.spec.ts`
* `e2e/pflegecoach-axe.spec.ts` — axe-core-Durchgang + eigener Kontrastrechner (§2b)
* `app/pflegecoach/pflegecoach.css` — Fix des Link-Button-Kontrasts
* `audit/dipa/gebrauchstauglichkeit_durchfuehrungsplan.md`
* `audit/dipa/gebrauchstauglichkeit_testprotokoll.md`
* `audit/dipa/bfarm_fragenkatalog.md`
