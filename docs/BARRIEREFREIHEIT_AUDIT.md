# Barrierefreiheit-Audit — BITV 2.0 / WCAG 2.1 AA

**Stand:** 21.08.2026 (zweiter Durchgang — Fokus-Management, Tastatur, axe-core)
**Prüfgegenstand:** Alltagsengel Web-App (Next.js) — Marketing-Seiten, Kunden-, Engel-, Fahrer-Portal, Admin- und MIS-Bereich, PflegeCoach
**Prüfumfang:** 473 TSX-Dateien in `app/` und `components/`
**Prüfmethode:** Statische Quellcode-Analyse (eigene Scanner, siehe Abschnitt „Methodik"), Kontrastberechnung nach WCAG-Formel; im zweiten Durchgang zusätzlich ein maschineller Laufzeit-Durchgang mit axe-core und eine Laufzeitprüfung des Fokus-Verhaltens (Playwright)
**Einordnung:** Track 7 (Security/DSGVO), Priorität P1

> **Wichtiger Vorbehalt:** Dieses Audit ist im Kern eine **statische Code-Prüfung**,
> im 2. Durchgang ergänzt um einen maschinellen Laufzeit-Durchgang. Beides ersetzt
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

| Kennzahl | Ausgangslage | 1. Durchgang | 2. Durchgang |
|---|---|---|---|
| Formularfelder mit programmatischer Beschriftung | 632 / 1053 (**60,0 %**) | 878 / 1053 (**83,4 %**) | unverändert |
| Bedienelemente ohne zugänglichen Namen (Icon-Buttons) | 11 | **0** | **0** |
| Klickbare Elemente ohne Tastaturzugang (`div`/`span`/`li`) | 121 | 32 | **1** |
| … erweiterter Umfang, zusätzlich `tr`/`td` | (nicht erfasst) | 49 | **2** |
| Modale Dialoge insgesamt **gefunden** | 21 bekannt | 24 | **34** |
| Dialoge ohne `role="dialog"` | 21 | 0 *(von 24 bekannten)* | **0** *(von 34)* |
| Dialoge ohne Fokus-Management | 24 | 23 | **0** |
| Statusmeldungen als Live-Region | 19 Stellen | **+295** (Banner-Komponente) | unverändert |
| Textfarben unter AA-Kontrast (Tokens) | 2 Tokens (bis 2,13:1) | **0** | **0** |
| Fokusring-Kontrast auf hellem Grund | (nicht gemessen) | (nicht gemessen) | 2,16:1 → **behoben** |
| axe-Lauf gegen die Produktion | nie gelaufen | nie gelaufen | **10/10 Testfälle grün** |

Zum axe-Lauf: Der **erste** Durchlauf gegen die Live-Seite ergab 6 von 10 grün. Alle
vier **Fokus**-Testfälle bestanden auf Anhieb — der Umbau wirkt in Produktion. Die
vier roten Fälle waren Bestandsmängel, keine Rückschritte. Einer davon (B-18,
`select-name`, kritisch) wurde sofort behoben, die drei übrigen (B-15 bis B-17) sind
als Altlasten dokumentiert und werden vom Test protokolliert statt verschwiegen.
Der abschließende Lauf steht auf 10/10.

Die zwei verbleibenden Klick-Elemente sind **keine** Bedienelemente, sondern reine
`stopPropagation`-Wächter (sie verhindern, dass ein Klick im Dialog-Inneren bzw. in
einer Tabellenzelle bis zum Overlay bzw. zur Zeile durchschlägt). Ein Fokus-Stop wäre
dort falsch.

**Geändert:** 1. Durchgang 75 Dateien (+303/−290). 2. Durchgang 59 Dateien in vier
Commits (`ad23806`, `45d90ac`, `f5eaba6` und dieser).

**Zum Verlauf, weil es für die Belastbarkeit der Zahlen zählt:** Der erste Commit des
2. Durchgangs brach den Produktions-Build (zwei Dateien syntaktisch zerlegt, siehe
Methodik). Der Typecheck hatte das gemeldet, die Meldung wurde beim Ablesen
übersehen. Behoben mit `45d90ac`. Der hier dokumentierte Endstand ist belegt mit
`tsc --noEmit` (Exit 0), `npm run build` (Exit 0), grüner CI und einem
Playwright-Lauf gegen die Produktion (10/10).

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

> **Korrektur (2. Durchgang):** Der Satz „alle 24" beschrieb den Bestand, den der
> damalige Scanner **sehen konnte** — er suchte nach der Klasse `.admin-modal`.
> Zehn weitere modale Dialoge tragen ihr Layout in Inline-Styles (`modalWrap`,
> `modalBox`, `overlayStyle`) und tauchten deshalb in keiner Zählung auf. Sie hatten
> weder Rolle noch Namen. Siehe **B-11**. Der richtige Bestand ist **34**, nicht 24.
> Lehre: eine Zählung, die an einem Klassennamen hängt, misst die Konvention, nicht
> die Wirklichkeit.

### B-05 — Klickbare Elemente ohne Tastaturzugang · **BEHOBEN** (2. Durchgang) · WCAG 2.1.1 (A)

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

~~**Offen: 31 Elemente.**~~ Im 2. Durchgang abgearbeitet — siehe **B-12**. Die
damalige Begründung („Handler nehmen das Maus-Event") traf zu, war aber lösbar:
der Tastatur-Handler bekommt eine parameterlose Fassung derselben Aktion, der
`onClick` mit `stopPropagation` bleibt daneben stehen.

Die Schwerpunktliste war zudem irreführend: `admin/tourenplanung` (6),
`mis/MisComponents` (3), `engel/einsaetze` (2) und `admin/personal/[id]` (2) waren
gar keine Bedienelemente, sondern die Overlay- und Inhaltscontainer der zehn
**übersehenen Dialoge** aus B-11.

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

### B-10 — Kein Fokus-Management in Dialogen · **BEHOBEN** (2. Durchgang) · WCAG 2.1.2, 2.4.3, 2.1.1 (A/AA)

Der schwerwiegendste Befund des zweiten Durchgangs. Kein einziger der 34 modalen
Dialoge hatte Fokus-Management. Genau **einer** (`CallbackWidget`) behandelte ESC.

`aria-modal="true"`, im 1. Durchgang ergänzt, verbirgt den Hintergrund nur für
Screenreader. Der **Tastaturfokus** ist davon unberührt: er stand beim Öffnen
weiterhin auf dem auslösenden Button hinter dem Dialog, wanderte beim Tabben durch
die verdeckte Seite und war nach dem Schließen verloren. Für sehende Maus-Nutzende
unsichtbar, für alle anderen der Unterschied zwischen bedienbar und unbedienbar.

Behoben durch **einen** Helfer statt 34 Einzellösungen:

- `useFokusFalle()` in `lib/a11y.ts` leistet die vier geforderten Dinge:
  1. Fokus beim Öffnen auf das erste bedienbare Element,
  2. Tab und Shift+Tab zyklieren innerhalb des Dialogs,
  3. ESC schließt,
  4. beim Schließen kehrt der Fokus zum auslösenden Element zurück.
- `components/DialogOverlay.tsx` kapselt das für die **21-fach kopierte**
  Overlay-Zeile im Admin-Bereich: aus
  `<div role="presentation" className="admin-modal-overlay" onClick={onClose}>`
  wird `<DialogOverlay onClose={onClose}>`. Ein Austausch, 21 Dialoge.
- Drei Dialoge binden den Helfer direkt ein (eigenes Overlay-Markup).

Umsetzungsentscheidungen, die nicht offensichtlich sind:

- **Sichtbarkeit über `getClientRects()`**, nicht über `offsetParent`: Letzteres ist
  bei `position: fixed` immer `null` — der Dialog hätte sich selbst für leer gehalten.
- **Listener am `document`, nicht am Dialog:** liegt der Fokus nach einem Re-Render
  hinter dem Dialog, feuert ein Listener am Dialog gar nicht mehr; die Falle könnte
  sich nicht selbst reparieren.
- **Fokus-Rückgabe nur, wenn das Element noch existiert** (`document.contains`) —
  nach einem Speichern ist der auslösende Button oft weg.
- **`BeratungsChat` bewusst ohne Tab-Zyklus** (`fangen: false`): das Chat-Panel ist
  ein *nicht*-modaler Dialog (kein `aria-modal`), es verdeckt die Seite nicht. Fokus
  dort einzusperren wäre eine echte Tastaturfalle nach WCAG 2.1.2. Fokus beim
  Öffnen, ESC und Fokus-Rückgabe gelten trotzdem.

### B-11 — Zehn modale Dialoge waren nie erfasst · **BEHOBEN** (2. Durchgang) · WCAG 4.1.2 (A)

Der Scanner des 1. Durchgangs suchte Dialoge über die Klasse `.admin-modal`. Zehn
Modale gestalten sich über Inline-Styles und blieben deshalb unsichtbar — sie hatten
weder `role="dialog"` noch `aria-modal` noch einen Namen und wurden als
strukturloses `<div>` angesagt:

| Datei | Dialog |
|---|---|
| `app/admin/tourenplanung/page.tsx` | Tour-Details, Vertretung suchen, Neue Tour (3) |
| `app/admin/expansion/page.tsx` | generische Modal-Komponente (Titel-Prop) |
| `app/admin/gutschriften/page.tsx` | Neue Gutschrift / Rechnung stornieren |
| `app/admin/personal/[id]/page.tsx` | generische `Modal`-Komponente |
| `app/engel/einsaetze/page.tsx` | Leistung dokumentieren |
| `app/engel/profil/page.tsx` | Konto löschen |
| `app/kunde/profil/page.tsx` | Konto löschen |
| `components/mis/MisComponents.tsx` | generische `Modal`-Komponente (ganzer MIS-Bereich) |

Drei davon sind wiederverwendbare Komponenten — der Fix wirkt dort auf alle
Aufrufstellen des jeweiligen Bereichs.

**Nebenbefund, korrigiert:** In `app/kunde/profil/page.tsx` hatte der automatische
Durchgang des 1. Audits dem **Overlay** `role="button"` samt Fokus-Stop verpasst.
Genau das, was der Bericht des 1. Durchgangs als bewusst vermieden beschrieb
(„Modal-Overlays wurden bewusst ausgenommen"), war an dieser Stelle passiert: Der
Screenreader sagte die abdunkelnde Fläche als Schaltfläche ohne Namen an.

### B-12 — Tastaturzugang komplettiert · **BEHOBEN** (2. Durchgang) · WCAG 2.1.1 (A)

Die 31 offenen Elemente aus B-05 wurden abgearbeitet; der Scanner wurde dabei um
`tr`/`td` erweitert, weil klickbare **Tabellenzeilen** die größte verbliebene Gruppe
waren und im alten Umfang (`div`/`span`/`li`) gar nicht auftauchten.

- **16 klickbare Tabellenzeilen** (Navigation in Klienten-, Rechnungs-, Budget-,
  Bonus-, Monatsabschluss- und Benachrichtigungslisten) — neuer Helfer
  `klickbareZeile()`.
- **13 klickbare `div`/`span`** — `klickbar()` aus dem 1. Durchgang, ergänzt um
  einen zutreffenden Namen und, wo es einen Zustand gibt, `aria-pressed` bzw.
  `aria-expanded`: Filterkacheln (`admin/fristen`), Favoriten-Herz und Optionsmenü
  (`kunde/engel/[id]`), Kalender-Einsatzblöcke, MIS-KPI-Kacheln und Schichtblöcke,
  Bewertungssterne, Klientenname in den Pflegenotizen.
- **Drei Datei-Ablageflächen** (`admin/ruecklaeufer`, `admin/zahlungseingaenge`,
  `components/admin/AktenUpload`) waren nur per Maus bedienbar — Ziehen-und-Ablegen
  hat ohnehin keine Tastaturentsprechung, der Ersatzweg „Klick öffnet den
  Dateidialog" war aber ebenfalls nicht erreichbar. Jetzt mit Rolle, Fokus-Stop und
  beschreibendem Namen.

**Bewusst *ohne* `role="button"`: die Tabellenzeilen.** Eine `<tr>` hat die implizite
Rolle `row`. Wird sie zur Schaltfläche umdeklariert, verliert die Tabelle für
Screenreader ihre Struktur — Zeilen- und Spaltennavigation brechen. Der Schaden wäre
größer als der Nutzen. `klickbareZeile()` vergibt deshalb nur `tabIndex` und die
Tastaturauslösung.

**Restgrenze, ausdrücklich offen:** Damit ist die Zeile *bedienbar* (2.1.1 erfüllt),
aber dass sie bedienbar ist, wird weiterhin nur **visuell** vermittelt (Zeigerform).
Sauber wäre ein echter Link in der ersten Zelle. Das ist eine Layout-Entscheidung pro
Tabelle und wurde nicht im Vorbeigehen getroffen.

### B-14 — Fokusring unsichtbar auf hellen Flächen · **BEHOBEN** (2. Durchgang) · WCAG 1.4.11 (AA)

Beim Nachmessen der globalen `:focus-visible`-Regel (die der 1. Durchgang als
vorhanden abgehakt, aber nicht gemessen hatte) fiel auf: Der Ring ist einfarbig
gold — und Gold trägt nur auf dunklem Grund.

| Ring auf | Kontrast | Bewertung |
|---|---|---|
| `--coal` `#1A1612` (Standard-Hintergrund) | **8,32:1** | sehr gut |
| `--coal2` `#252118` | **7,81:1** | sehr gut |
| Weiß `#FFFFFF` (MIS-Bereich, helle Karten) | **2,16:1** | **durchgefallen** (3:1 gefordert) |
| goldene Fläche `#C9963C` | **1,23:1** | **praktisch unsichtbar** |

Der MIS-Bereich arbeitet durchgehend mit weißen Flächen (`BRAND.white`). Dort war
der Tastaturfokus faktisch nicht erkennbar — der Ring war zwar da, aber nicht zu
sehen. Das trifft genau die Nutzenden, für die der Ring existiert.

**Behoben** durch einen zweiten, dunklen Ring **außen** um den goldenen
(`box-shadow: 0 0 0 6px rgba(26,22,18,.6)`): Auf dunklem Grund verschwindet der
Halo und Gold trägt; auf hellem Grund trägt der Halo. Eine einzelne „mittlere"
Farbe hätte auf keinem der beiden Gründe gereicht. Im Kontrastmodus
(`forced-colors: active`) treten beide zurück und die Systemfarbe `Highlight`
übernimmt.

**Nicht gemessen:** ob der Ring durch `overflow: hidden` an Karten- und
Tabellenrändern angeschnitten wird. Das ist eine Frage der gerenderten Seite, nicht
der Farbwerte.

### B-13 — axe-core lief nie gegen die Hauptanwendung · **BEHOBEN** (2. Durchgang)

Für den PflegeCoach existierte bereits ein sorgfältiger axe-Lauf
(`e2e/pflegecoach-axe.spec.ts`, DiPA-Prüfpunkt BF-03). Für die Hauptanwendung gab es
keinen. Neu: `e2e/landing-axe.spec.ts`, bewusst nach demselben Muster gebaut
(axe-core wird ins Dokument injiziert, statt `@axe-core/playwright` aufzunehmen).

Der Lauf enthält zwei Teile:

1. **Regelbasiert** — WCAG 2.1 A/AA über `/`, `/alltagsbegleitung`, `/finanzierung`
   und `/kontakt`, plus eine Prüfung, dass die Sprungmarke der Startseite auf ein
   existierendes Ziel zeigt.
2. **Fokus-Verhalten zur Laufzeit** — am Rückruf-Dialog der Startseite, dem einzigen
   modalen Dialog, der ohne Anmeldung erreichbar ist: Fokus springt hinein, Tab und
   Shift+Tab kommen über einen vollen Zyklus nicht heraus, ESC schließt, der Fokus
   kehrt zum Auslöser zurück. Zusätzlich ein axe-Lauf **am geöffneten Dialog** —
   Dialog-Markup ist im normalen Seitenlauf gar nicht im DOM und wurde deshalb nie
   geprüft. Da alle 34 Dialoge dieselbe `useFokusFalle` benutzen, ist dieser eine
   Dialog stellvertretend für den Rest.

**Nebenbefund:** `axe-core` war **keine** deklarierte Abhängigkeit — es kam nur
transitiv über `eslint-config-next` → `eslint-plugin-jsx-a11y` herein. Ein Bump der
Lint-Konfiguration hätte die gesamte A11y-Suite still lahmgelegt (der Testlauf hätte
die Datei nicht mehr gefunden). Jetzt ausdrückliche devDependency.

### B-15 bis B-18 — Ergebnisse des ersten axe-Laufs gegen die Produktion

Der Lauf (21.08.2026, `https://alltagsengel.care`, Chromium) brachte **6 von 10**
Testfällen grün. Alle vier Fokus-Testfälle bestanden — der Umbau aus B-10 wirkt in
Produktion, nicht nur im Code. Die vier roten Fälle sind **Bestandsmängel**, die die
statische Analyse des 1. Durchgangs prinzipiell nicht sehen konnte:

| Nr. | Regel | Umfang | Status |
|---|---|---|---|
| **B-18** | `select-name` (kritisch) | 1 Element, auf **jeder** öffentlichen Seite | **BEHOBEN** |
| B-15 | `color-contrast` (ernst) | 12–44 Knoten je Seite | **OFFEN** |
| B-16 | `nested-interactive` (ernst) | 1 SVG-Grafik | **OFFEN** |
| B-17 | `scrollable-region-focusable` (ernst) | 1 Bereich auf `/finanzierung` | **OFFEN** |

**B-18 — `<select>` ohne zugänglichen Namen · BEHOBEN · WCAG 4.1.2 (A)**
Die Auswahlfelder in `components/LeadForm.tsx` („Interesse an…") und
`components/EngelBewerbungForm.tsx` („Erfahrung") hatten weder `<label>` noch
`aria-label`. Eine erste `<option>` mit Platzhaltertext ist **kein** Name — der
Screenreader sagt „Auswahlfeld, Interesse an… (optional)" nur beim Betreten der
Liste an, nicht bei der Feldnavigation. Beide Felder stehen in den zwei
Hauptformularen der Website (Kundenanfrage und Engel-Bewerbung); das benachbarte
`<textarea>` hatte sein `aria-label` bereits, das `<select>` war schlicht übersehen
worden. Behoben mit `aria-label`.

Dieser Befund ist zugleich ein Beleg für die Grenze von B-02: Der Beschriftungs-
Scanner des 1. Durchgangs hatte diese Felder unter den „175 offenen" verbucht und
damit als bekannt, aber nachrangig eingestuft. Erst der Laufzeitlauf zeigte, dass
eines davon auf **jeder** Seite steht und als *kritisch* eingestuft wird.

**B-15 — Farbkontrast im Marketing-Fließtext · OFFEN · WCAG 1.4.3 (AA)**
Bis zu 44 Knoten je Seite, Schwerpunkt `.lp-text` und die Preiskarten der
Landingpage-Varianten. Der 1. Durchgang hatte die Farb**tokens** korrigiert (B-01);
diese Stellen setzen ihre Farben direkt, nicht über Tokens, und blieben deshalb
unberührt. Der Fix ist derselbe wie bei B-01, nur an anderer Stelle.

**B-16 — verschachtelte Bedienelemente · OFFEN · WCAG 4.1.2 (A)**
Eine SVG-Grafik (`viewBox="0 0 400 290"`) enthält ineinander liegende bedienbare
Elemente. Screenreader melden dafür widersprüchliche Rollen.

**B-17 — scrollbarer Bereich ohne Tastaturzugang · OFFEN · WCAG 2.1.1 (A)**
Ein scrollbarer Abschnitt auf `/finanzierung` ist per Tastatur nicht
erreichbar; sein Inhalt ist damit für Tastaturnutzende ab dem sichtbaren Ausschnitt
zu Ende. Fix: `tabindex="0"` und ein Name am Scroll-Container.

Für B-15 bis B-17 hält `e2e/landing-axe.spec.ts` eine **Altlasten-Liste**: Der Test
protokolliert sie mit Knotenzahl bei jedem Lauf und schlägt fehl, sobald eine
Regel **außerhalb** dieser Liste bricht. So bleibt der Bestand sichtbar, ohne dass
der Test dauerhaft rot steht — und ein Rückschritt fällt sofort auf. Die Liste ist
zum Schrumpfen da.

---

## 3. Nicht geprüft

Diese Punkte sind mit statischer Analyse **nicht** entscheidbar und offen:

- **Echte Hilfsmittel:** kein Test mit NVDA, JAWS, VoiceOver oder Braillezeile.
- **Fokus-Reihenfolge und -Sichtbarkeit im Betrieb** (WCAG 2.4.3, 2.4.7): Die globale
  `:focus-visible`-Regel existiert (`app/globals.css`, 2 px `--gold2` mit 2 px
  Versatz; der PflegeCoach hat eine eigene, kräftigere Regel). Ob der Ring auf jedem
  Hintergrund den geforderten Kontrast von 3:1 erreicht, wurde weiterhin **nicht**
  gemessen — insbesondere auf goldfarbenen Flächen steht Gold auf Gold.
- ~~**Fokus-Falle in Dialogen** (WCAG 2.1.2)~~ — im 2. Durchgang umgesetzt (B-10)
  und zur Laufzeit geprüft (B-13). **Grenze:** Der Laufzeittest läuft gegen **einen**
  Dialog (Rückruf-Dialog der Startseite); die übrigen 33 teilen sich denselben
  Helfer, sind aber nicht einzeln durchgespielt. Dialoge hinter einer Anmeldung
  (Admin, MIS, Portale) sind maschinell nicht abgedeckt, weil die E2E-Suite
  bewusst ohne Anmeldung läuft.
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

~~**Werkzeuge nicht eingesetzt:** axe-core, Lighthouse, WAVE …~~ — im 2. Durchgang
nachgeholt, siehe B-13. Lighthouse und WAVE weiterhin nicht eingesetzt, ebenso wenig
ein BITV-Prüfschritt-Durchlauf.

### Methodik 2. Durchgang (21.08.2026)

- **Dialog-Inventur ohne Klassennamen.** Der Scanner des 1. Durchgangs hing an
  `.admin-modal` und übersah zehn Dialoge (B-11). Neu wird über die *Struktur*
  gesucht: jedes `div`/`span`/`li`/`tr`/`td` mit `onClick`, dessen Tag weder `role`
  noch `tabIndex` noch `onKeyDown` trägt — ein JSX-Tag-Scanner mit Klammer- und
  Zeichenketten-Behandlung statt eines Zeilen-Regex, damit mehrzeilige Tags und
  `=>` in Attributwerten nicht falsch geschnitten werden. Modale fallen dabei als
  Overlay-/Container-Paare auf.
- **Vorher-Werte** wieder gegen `git archive HEAD` mit **demselben** Scanner
  gemessen. Der Umfang wurde um `tr`/`td` erweitert (klickbare Tabellenzeilen), die
  Tabelle in Abschnitt 1 weist beide Umfänge getrennt aus, damit die Zahlen des
  1. Durchgangs vergleichbar bleiben.
- **Kontrast des Fokusrings** nach WCAG-Relativluminanz berechnet — das war der
  Auslöser für die Zweiring-Lösung (B-14).

**Fehler im Verlauf, der Nachbesserung nötig machte:** Der Reihenumbau setzte den
neuen Import nach dem letzten Treffer von `/^import .*$/`. Bei einem *mehrzeiligen*
Import ist das die Zeile `import {` — der neue Import landete zwischen den Klammern
und zerlegte zwei Dateien syntaktisch (`admin/expansion`, `admin/invoices`). Der
Bruch ging in Commit `ad23806` auf `main` und wurde mit `45d90ac` behoben.

Er war vermeidbar: `tsc --noEmit` hatte ihn beide Male gemeldet, aber der Prüflauf
endete auf `… | tail`, und gelesen wurde der Exit-Code der Pipeline (immer 0) statt
der von `tsc` (2). **Regel daraus:** Ein Verifikationslauf darf nicht auf `tail`,
`head` oder `grep` enden — sonst verdeckt deren Exit-Code das Ergebnis. Seither wird
`tsc` ohne nachgeschaltete Pipe ausgeführt und der Exit-Code ausgegeben; der
abschließende Stand ist mit `tsc --noEmit` (Exit 0) **und** `npm run build` (Exit 0)
belegt.

---

## 5. Empfohlene nächste Schritte

**Erledigt im 2. Durchgang:** ~~1 Fokus-Management~~ (B-10), ~~2 axe-core~~ (B-13,
öffentliche Seiten), ~~4 verbleibende Klick-Elemente~~ (B-12).

| Prio | Maßnahme | Bezug |
|---|---|---|
| 1 | Farbkontrast im Marketing-Fließtext (bis 44 Knoten je Seite) | B-15 |
| 1 | Scrollbaren Bereich auf `/finanzierung` tastaturzugänglich machen | B-17 |
| 2 | Verbleibende 175 Felder beschriften (inhaltliche Entscheidung je Feld) | B-02 |
| 2 | Verschachtelte Bedienelemente in der SVG-Grafik auflösen | B-16 |
| 2 | axe-core auf die **angemeldeten** Bereiche ausweiten (Admin, MIS, Portale) — braucht einen Testmandanten, die E2E-Suite läuft bisher bewusst ohne Anmeldung | B-13 |
| 3 | Skip-Link und `<main>` für MIS und Investor | B-09 |
| 4 | Klickbare Tabellenzeilen: echten Link in die erste Zelle, statt nur Fokus-Stop auf der Zeile | B-12 |
| 5 | Überschriftenebenen der Startseite schließen | B-08 |
| 6 | Fokusring auf Anschnitt durch `overflow: hidden` prüfen | B-14 |
| 7 | Test mit Screenreader und mit Nutzenden mit Behinderung | alle |
| 8 | Erklärung zur Barrierefreiheit nach § 12b BGG erstellen | BITV |

---

## 6. Geänderte Dateien

### 1. Durchgang — 75 Dateien. Die Änderungen mit der größten Reichweite:

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

### 2. Durchgang — 53 Dateien

| Datei | Änderung | Reichweite |
|---|---|---|
| `lib/a11y.ts` | `useFokusFalle()` + `klickbareZeile()` ergänzt | alle Dialoge, alle Zeilen |
| `components/DialogOverlay.tsx` | **neu** — Overlay mit Fokus-Management | 31 Dialoge |
| 21 Admin-Dateien | Overlay-`div` → `<DialogOverlay>` | 21 Dialoge |
| 8 Dateien | 10 übersehene Modale: `role`, `aria-modal`, Name, Fokus | 10 Dialoge, davon 3 generische Komponenten |
| 16 Dateien | `klickbareZeile()` an klickbaren Tabellenzeilen | 16 Zeilen-Typen |
| 11 Dateien | `klickbar()` + Name/Zustand an Klick-Elementen | 13 Elemente |
| `app/globals.css` | Fokusring mit dunklem Außenring (B-14) | jedes fokussierbare Element |
| `e2e/landing-axe.spec.ts` | **neu** — axe + Fokus-Laufzeitprüfung | 4 Seiten + 1 Dialog |
| `package.json` | `axe-core` als ausdrückliche devDependency | gesamte A11y-Suite |
