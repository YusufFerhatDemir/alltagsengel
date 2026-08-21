# Barrierefreiheit-Audit — BITV 2.0 / WCAG 2.1 AA

**Stand:** 21.08.2026
**Prüfgegenstand:** Alltagsengel Web-App (Next.js) — Marketing-Seiten, Kunden-, Engel-, Fahrer-Portal, Admin- und MIS-Bereich, PflegeCoach
**Prüfumfang:** 473 TSX-Dateien in `app/` und `components/`
**Prüfmethode:** Statische Quellcode-Analyse (eigene Scanner, siehe Abschnitt „Methodik"), Kontrastberechnung nach WCAG-Formel
**Einordnung:** Track 7 (Security/DSGVO), Priorität P1

> **Wichtiger Vorbehalt:** Dieses Audit ist eine **statische Code-Prüfung**. Sie ersetzt
> **keine** BITV-Prüfung nach BITV-Prüfschritten und **keinen** Test mit echten
> Hilfsmitteln (NVDA, JAWS, VoiceOver, Vergrößerungssoftware) oder mit Nutzenden mit
> Behinderung. Eine Konformitätserklärung nach § 12b BGG lässt sich daraus **nicht**
> ableiten. Was hier steht, ist belastbar für maschinell prüfbare Kriterien; alles
> Weitere ist offen (siehe „Nicht geprüft").

---

## 1. Zusammenfassung

Die Anwendung hatte bereits eine solide Grundausstattung: Skip-Link im
`LayoutWrapper`, globale `:focus-visible`-Umrandung, `.sr-only`-Klasse,
`prefers-reduced-motion`, 44 px-Mindestgröße für Touch-Ziele, `lang="de"`,
`forced-colors`-Unterstützung und eine durchgehende `h1`-Struktur auf den
Marketing-Seiten.

Die Mängel lagen fast alle in **wiederholten Mustern**, nicht in Einzelseiten. Genau
dort wurde angesetzt: 15 kopierte Formularfeld-Wrapper, eine 295-fach genutzte
Banner-Komponente und zwei Farbtokens mit zusammen 758 Verwendungsstellen.

| Kennzahl | Vorher | Nachher |
|---|---|---|
| Formularfelder mit programmatischer Beschriftung | 632 / 1053 (**60,0 %**) | 878 / 1053 (**83,4 %**) |
| Bedienelemente ohne zugänglichen Namen (Icon-Buttons) | 11 | **0** |
| Klickbare Elemente ohne Tastaturzugang | 121 | **31** |
| Dialoge ohne `role="dialog"` | 21 | **0** |
| Statusmeldungen als Live-Region | 19 Stellen | **+295** (Banner-Komponente) |
| Textfarben unter AA-Kontrast | 2 Tokens (bis 2,13:1) | **0** |

**Geändert:** 75 Dateien, +303/−290 Zeilen. Typecheck grün, 3407 Tests grün.

---

## 2. Befunde und Status

### B-01 — Farbkontrast unter AA-Schwelle · **BEHOBEN** · WCAG 1.4.3 (AA)

Zwei Textfarben der Dark-Palette verfehlten den Mindestkontrast. `--ink5` fiel auf
**allen** Hintergründen durch, teils bis auf 2,13:1 — weniger als die Hälfte des
geforderten Werts. Betroffen waren u. a. Dokumenten-Metadaten, Kalendertage und
Leerzustände in 11 px/13 px-Größe, also gerade dort, wo Kontrast am wichtigsten ist.

| Token | Alt | Kontrast alt (coal/coal2/coal3) | Neu | Kontrast neu |
|---|---|---|---|---|
| `--ink4` | `#8A7E6E` | 4,53 / **4,04** / **3,40** | `#A19381` | 6,00 / 5,35 / 4,50 |
| `--ink5` | `#6A5E4E` | **2,85** / **2,54** / **2,13** | `#998B78` | 5,41 / 4,83 / 4,06 |

Der warme Farbton wurde beibehalten (gleiche Hue, nur angehoben). Wirkung: **758
Verwendungsstellen** in einem Schritt.

**Restrisiko:** `--ink5` auf `--coal3` erreicht 4,06:1 — ausreichend für Großtext
(≥18,66 px bzw. ≥14 px fett), nicht für Normaltext. Diese Kombination ist selten;
sie sollte bei nächster Gelegenheit entweder auf `--ink4` gehoben oder die Fläche
auf `--coal2` gesetzt werden.

### B-02 — Formularfelder ohne programmatische Beschriftung · **GRÖSSTENTEILS BEHOBEN** · WCAG 1.3.1, 3.3.2, 4.1.2 (A/AA)

Der schwerwiegendste Befund. Ursache war ein **15-fach kopierter Wrapper**:

```tsx
function Field({ label, children }) {
  return (
    <div>                               {/* ← kein <label> */}
      <span>{label}</span>              {/* nur optischer Text */}
      <div>{children}</div>             {/* Eingabefeld ohne Bezug */}
    </div>
  )
}
```

Der Text war sichtbar, aber nicht mit dem Feld verknüpft. Screenreader lesen dort
„Eingabefeld, leer" ohne jede Angabe, was einzutragen ist. Betroffen: Klientenakte,
Mitarbeiterakte, Dienstplan, Rechnungen, Angehörige, Boni, SEPA, Kassenabrechnung,
Ausfallmanagement, Qualität, Kalender u. a.

Behoben in drei Schritten:

1. **15 Wrapper** (`Field`, `Feld`, `ModalField`, `FormField`, `FieldRow`) auf ein
   umschließendes `<label>` umgestellt — deckt allein **201 Verwendungsstellen** ab.
   Bei `sepa` und `mis/krankenfahrt-pricing` stand ein `<label>` als *Geschwister*
   ohne `htmlFor` — das beschriftet nichts und wurde zum Wrapper gemacht.
2. **93 Felder** mit `placeholder` als einzigem Hinweis: `aria-label` aus dem
   Platzhaltertext abgeleitet. Ein Platzhalter ist kein Label — er verschwindet beim
   Tippen (WCAG 3.3.2).
3. **46 Felder** mit Beschriftung als benachbartes `<div style={labelStyle}>`:
   `aria-label` aus dem Text abgeleitet, Pflichtfeld-Sternchen entfernt (sonst liest
   der Screenreader „Betreuungskraft Stern").

**Layout-Sicherung:** Beim Wechsel `div` → `label` wurde `display` explizit gesetzt,
da `<label>` standardmäßig inline ist. Wo der bestehende Style bereits ein `display`
mitbrachte (`fieldRow` mit `display: 'grid'`), wurde es **nicht** überschrieben.

**Offen: 175 Felder** (16,6 %). Diese haben keinen Platzhalter und keine als solche
erkennbare Beschriftung in der Nähe — meist `<select>`-Filter in Tabellenköpfen.
Sie brauchen eine inhaltliche Entscheidung pro Feld und wurden bewusst **nicht**
automatisch beschriftet, um keine falschen Namen zu erzeugen. Schwerpunkte:
`admin/tourenplanung` (12), `mis/quality` (11), `mis/team` (11),
`mis/krankenfahrten` (6), `admin/kalender` (5), `mis/supply-chain` (5).

### B-03 — Bedienelemente ohne zugänglichen Namen · **BEHOBEN** · WCAG 4.1.2 (A)

11 Schaltflächen enthielten ausschließlich ein Symbol (`‹`, `›`, `➤`, `💬`, `x`,
Icon-Komponente) und wurden als „Schaltfläche" ohne Funktion angesagt. Alle mit
deutschem `aria-label` versehen: Monatsnavigation im Kalender (Engel + Kunde),
Senden im Chat (Fahrer, Kunde, Nachrichten), Dialog schließen (Personalakte, MIS),
Chat öffnen (Fahrer), Zurück (Fahrer-Aufträge).

### B-04 — Dialoge ohne Rolle und Namen · **BEHOBEN** · WCAG 4.1.2 (A)

21 modale Dialoge im Admin-Bereich waren schlichte `<div>`. Sie wurden weder als
Dialog angesagt, noch war erkennbar, dass der Hintergrund inaktiv ist.

- `.admin-modal` → `role="dialog" aria-modal="true"`
- `.admin-modal-overlay` → `role="presentation"` (reine Klickfläche; der zugängliche
  Weg zum Schließen bleibt der Abbrechen-Button)
- Name: 16 Dialoge aus statischer `<h3>`-Überschrift als `aria-label`, 3 mit
  dynamischem Titel über `aria-labelledby` verknüpft, 2 manuell benannt.

Alle 24 `role="dialog"`-Vorkommen im Projekt haben jetzt einen zugänglichen Namen
(maschinell verifiziert).

### B-05 — Klickbare Elemente ohne Tastaturzugang · **TEILWEISE BEHOBEN** · WCAG 2.1.1 (A)

121 `<div>`/`<span>`/`<li>` mit `onClick`, aber ohne Rolle, ohne Fokus-Stop und ohne
Tastaturauslösung — mit der Tastatur schlicht nicht erreichbar. Betroffen waren
echte Bedienelemente: Einstellungs-Schalter, Kalendertage, Dokumentenkarten,
Auswahl-Chips, Zahlungsoptionen.

- **50 Elemente** automatisch um `role="button"`, `tabIndex={0}` und
  Enter-/Leertaste-Behandlung ergänzt.
- **3 Schalter** in den Engel-Einstellungen korrekt als `role="switch"` mit
  `aria-checked` und eigenem Namen — ein Umschalter ist kein Button.
- Neuer Helfer `lib/a11y.ts` (`klickbar()`) liefert das Muster zentral für künftige
  Fälle.
- Modal-Overlays wurden bewusst **ausgenommen** und auf `role="presentation"`
  gesetzt: sie als Schaltfläche zu fokussieren wäre falsch.

**Offen: 31 Elemente.** Ihre Klick-Handler nehmen Parameter (z. B. das
Maus-Event) und lassen sich nicht ohne inhaltliche Prüfung auf einen
Tastatur-Handler abbilden. Schwerpunkte: `admin/tourenplanung` (6),
`mis/MisComponents` (3), `engel/einsaetze` (2), `admin/personal/[id]` (2).

### B-06 — Statusmeldungen nicht angekündigt · **BEHOBEN** · WCAG 4.1.3 (AA)

Fehler- und Erfolgsmeldungen erschienen ohne Ankündigung — wer den Bildschirm nicht
sieht, erfuhr nach dem Absenden nicht, dass etwas schiefging.

Die Komponente `Banner` (`components/admin/OpsUI.tsx`) wird **295-mal** verwendet
und trägt jetzt eine passende Live-Region: `danger`/`warn` → `role="alert"` mit
`aria-live="assertive"` (unterbricht), `info`/`success` → `role="status"` mit
`aria-live="polite"` (wird nachgereicht). Zusätzlich die 5 `auth-error`-Stellen in
Login, Registrierung, Passwort-Reset und -Vergessen. Der PflegeCoach-Bereich war
bereits korrekt.

### B-07 — Fehlende Landmarks im Admin-Bereich · **BEHOBEN** · WCAG 1.3.1, 2.4.1 (A)

`LayoutWrapper` steigt für Admin, MIS, LP, Investor und PflegeCoach früh aus und gibt
nur `children` zurück. Damit fehlten dem Admin-Bereich — dem am intensivsten
genutzten Teil der Anwendung — **Skip-Link und `<main>`-Landmark** vollständig.
Tastaturnutzende mussten die gesamte Seitenleiste durchtabben, um zum Inhalt zu
gelangen.

In `app/admin/layout.tsx` ergänzt: eigener Skip-Link, `<main id="admin-main">`,
`aria-label` und `aria-expanded`/`aria-controls` am Hamburger-Menü, benannte
Seitenleisten-Navigation. Das Sidebar-Overlay wurde von `role="button"` auf
`role="presentation"` korrigiert.

### B-08 — Übersprungene Überschriftenebenen · **OFFEN** · WCAG 1.3.1 (A, Best Practice)

Auf der Startseite folgt auf `h2` direkt `h4` (Zeilen 343–373, 422–445); `h3` fehlt.
Die Reihenfolge ist damit nicht lückenlos. Wirkung: Wer per Überschriftenliste
navigiert, bekommt eine irreführende Gliederungstiefe. Kein Verstoß gegen ein hartes
AA-Erfolgskriterium, aber ein Mangel gegen die BITV-Auslegung von 1.3.1.

**Nicht behoben,** weil die `h4`-Klassen im CSS gestaltet sind und ein Wechsel auf
`h3` optische Nebenwirkungen hätte. Empfehlung: `h4` → `h3` und die CSS-Regeln
gleichziehen.

### B-09 — MIS- und Investor-Bereich ohne Landmarks · **OFFEN** · WCAG 1.3.1, 2.4.1 (A)

Dieselbe Ursache wie B-07: Beide Bereiche umgehen den `LayoutWrapper` und haben
weder Skip-Link noch `<main>`. Da es sich um rein interne Bereiche handelt, wurden
sie gegenüber dem Admin-Bereich nachrangig behandelt. Der Fix ist identisch zu B-07.

---

## 3. Nicht geprüft

Diese Punkte sind mit statischer Analyse **nicht** entscheidbar und offen:

- **Echte Hilfsmittel:** kein Test mit NVDA, JAWS, VoiceOver oder Braillezeile.
- **Fokus-Reihenfolge und -Sichtbarkeit im Betrieb** (WCAG 2.4.3, 2.4.7): Die globale
  `:focus-visible`-Regel existiert, ob der Ring auf jedem Hintergrund sichtbar ist,
  wurde nicht gemessen.
- **Fokus-Falle in Dialogen** (WCAG 2.1.2): Ob der Fokus im geöffneten Dialog bleibt
  und beim Schließen zurückkehrt, und ob ESC schließt, wurde **nicht** geprüft. Die
  Dialoge tragen jetzt `aria-modal="true"`, was Screenreadern den Hintergrund
  verbirgt — echtes Fokus-Management ersetzt das nicht.
- **Vergrößerung auf 200 % / Reflow bei 320 px** (WCAG 1.4.4, 1.4.10).
- **Tatsächlich gerenderte Kontraste:** berechnet wurden die Token-Kombinationen,
  nicht jede real gerenderte Vorder-/Hintergrund-Paarung (Verläufe, Transparenzen,
  Farben auf Bildern).
- **Grafik- und Bedienelement-Kontraste** (WCAG 1.4.11): Rahmen, Icons, Zustände.
- **Sinnvolle Alternativtexte:** Es fehlt kein `alt`-Attribut, aber ob die Texte den
  Bildinhalt treffen, ist eine inhaltliche Frage.
- **Pflichtfeld-Kennzeichnung** (WCAG 3.3.2): 92 native `required`-Attribute stehen
  im Code; ob jedes visuell mit `*` markierte Feld auch technisch `required` ist,
  wurde nicht abgeglichen.
- **Bewegtbild, Audio, Untertitel** (WCAG 1.2.x).
- **Erklärung zur Barrierefreiheit** nach § 12b BGG: existiert nicht.

---

## 4. Methodik

Vier eigens geschriebene Scanner über 473 TSX-Dateien:

1. **Beschriftungs-Abdeckung** — zählt alle `input`/`select`/`textarea` (ohne
   `hidden`) und prüft je Feld: `aria-label`, `aria-labelledby`, `htmlFor`-Bezug,
   umschließendes `<label>` oder einen Wrapper, der ein `<label>` rendert. Wrapper
   werden **pro Datei** aufgelöst — der Name `Field` existiert 15-mal in
   unterschiedlicher Qualität, eine globale Auflösung hätte die Messung verfälscht.
2. **Zugängliche Namen** — Schaltflächen ohne Textinhalt und ohne `aria-label`,
   wobei String-Literale in JSX-Ausdrücken als Text gewertet werden.
3. **Tastaturzugang** — `div`/`span`/`li` mit `onClick`, aber ohne `role`/`tabIndex`.
4. **Kontrast** — WCAG-Relativluminanz für alle Vorder-/Hintergrund-Kombinationen
   der Token-Palette.

Vorher-Werte wurden gegen den unveränderten Stand aus `git archive HEAD` mit
**demselben** Scanner gemessen, damit die Zahlen vergleichbar sind.

**Absicherung:** `tsc --noEmit` nach jedem Umbauschritt. Der Typecheck fing drei
Stellen, an denen ein automatisch gesetztes Attribut ein bereits vorhandenes,
besseres doppelte (Ursache: das `>` in `=>` beendet einen naiven Tag-Regex zu früh) —
diese wurden zurückgenommen, das vorhandene Attribut blieb. Abschließend die volle
Testsuite.

**Werkzeuge nicht eingesetzt:** axe-core, Lighthouse, WAVE oder ein BITV-Prüfschritt-
Durchlauf. Ein Lauf mit axe-core gegen die laufende Anwendung ist der nächste
sinnvolle Schritt — er findet Laufzeitprobleme (berechnete Kontraste, ARIA-Bezüge
über Komponentengrenzen), die statisch nicht sichtbar sind.

---

## 5. Empfohlene nächste Schritte

| Prio | Maßnahme | Bezug |
|---|---|---|
| 1 | Fokus-Management in Dialogen: Fokus fangen, bei Schließen zurückgeben, ESC | WCAG 2.1.2, 2.4.3 |
| 2 | axe-core gegen die laufende Anwendung, je Rollenbereich | alle |
| 3 | Verbleibende 175 Felder beschriften (inhaltliche Entscheidung je Feld) | B-02 |
| 4 | Verbleibende 31 Klick-Elemente auf `klickbar()` aus `lib/a11y.ts` umstellen | B-05 |
| 5 | Skip-Link und `<main>` für MIS und Investor | B-09 |
| 6 | Überschriftenebenen der Startseite schließen | B-08 |
| 7 | Test mit Screenreader und mit Nutzenden mit Behinderung | alle |
| 8 | Erklärung zur Barrierefreiheit nach § 12b BGG erstellen | BITV |

---

## 6. Geänderte Dateien

75 Dateien. Die Änderungen mit der größten Reichweite:

| Datei | Änderung | Reichweite |
|---|---|---|
| `app/globals.css` | `--ink4`, `--ink5` auf AA-Kontrast | 758 Stellen |
| `components/admin/OpsUI.tsx` | `Banner` als Live-Region | 295 Stellen |
| 15 × `Field`/`Feld`/`ModalField`/`FormField`/`FieldRow` | `<div>` → `<label>` | 201 Felder |
| 26 Dateien | `aria-label` aus Platzhalter | 93 Felder |
| 5 Dateien | `aria-label` aus benachbarter Beschriftung | 46 Felder |
| 13 Dateien | `role="dialog"` + Name | 21 Dialoge |
| 19 Dateien | Tastaturzugang für Klick-Elemente | 50 Elemente |
| `app/admin/layout.tsx` | Skip-Link, `<main>`, Menü-Labels | Admin gesamt |
| `lib/a11y.ts` | **neu** — Helfer `klickbar()` | künftige Fälle |
