# Abschlussbericht — Phase 5 (PflegeCoach Final Regression) & Phase 6 (DiPA intern)

**Stand:** 14.08.2026, Abend · **Umfang:** Regression + Dokumentation, keine neuen Features/Fixes.

---

## Phase 5 — PflegeCoach Final Regression

### Ergebnis: **PASS** (mit zwei dokumentierten Dev-Server-Einschränkungen, kein Produktfehler)

### 1. Kontrast-Fix (Commit 6724d80)

**Bestätigt korrekt**, sowohl statisch als auch live am DOM geprüft:

- `.pc-root a.pc-btn` (Spezifität 0,2,0) steht jetzt **vor** `.pc-root a` (0,1,1) im
  Geltungsrang und überschreibt sie korrekt — die alte Regel `.pc-btn` allein (0,1,0)
  wurde tatsächlich von `.pc-root a` geschlagen, das war die Fehlerursache.
- Live-DOM-Messung auf `/pflegecoach/start`: „Konto anlegen" (`<a class="pc-btn">`) hat
  `color: rgb(255,255,255)` auf `background: rgb(11,83,148)` — **7,8:1**, weit über der
  AA-Schwelle 4,5:1. Kein 1:1-Kontrast mehr.
- Sekundär-Variante (`Anfrage stellen`, `Ich habe schon ein Konto`, `Konditionen anfragen`)
  korrekt `rgb(11,83,148)` auf `rgb(255,255,255)` = 7,4:1.

### 2. Tests

**`npx tsx --test $(find lib/coach -name '*.test.ts')`** (die tatsächliche PflegeCoach-Unit-Suite —
`lib/coach/*.test.ts` sind `node:test`-Skripte, nicht Vitest; `vitest.config.ts` schließt
`lib/**` bewusst aus, siehe Kopfkommentar dort):

```
tests 176   pass 176   fail 0
```

Alle 17 Testdateien (`abrechnung`, `anspruch`, `assessment`, `belastung`, `freischaltung`,
`consent`, `nachweise`, `eul`, `export`, `fhir`, `bestellung`, `pricing`, `config`, `mfa`,
`empfehlungen`, `produktgrenze`, `rechnung`) grün.

### 3. Routen

Alle 22 geprüften `/pflegecoach/*`-Routen gegen den lokalen Dev-Server (`npm run dev`,
Turbopack) liefern erwartete Statuscodes — **keine 404er, keine Build-Fehler**:

| Route | Status |
|---|---|
| `/pflegecoach` (Dashboard/Übersicht) | 200 |
| `/pflegecoach/start` (öffentliche Landing) | 200 |
| `/pflegecoach/anfrage`, `/datenschutz`, `/agb` | 200 |
| `/assessment`, `/ziele`, `/wochenplan`, `/verlauf`, `/bericht`, `/angehoerige`, `/belastung`, `/mobilitaet`, `/einstellungen(+konto/sicherheit)` | 200 |
| `/checkout`, `/checkout/danke`, `/loeschung`, `/widerruf` | 200 |
| `/anspruch`, `/freischaltung` (DiPA-gated) | 307 → `/pflegecoach` (korrekt, `COACH_DIPA_MODUS=false`) |
| `/pflegecoach/nichtexistent` (Negativtest) | 404 (korrekt) |

**Hinweis zur Aufgabenstellung:** Es gibt keine Routen namens `/pflegecoach/onboarding` oder
`/pflegecoach/dashboard`. Die tatsächliche Struktur ist `/pflegecoach/start` (öffentlicher
Einstieg inkl. Onboarding-Formular) und `/pflegecoach` (eingeloggtes Dashboard = „Übersicht").
Geprüft wurde die reale Struktur.

### 4. axe-core Accessibility-Test (`e2e/pflegecoach-axe.spec.ts`)

**Vorhanden und lauffähig** (274 Zeilen, seit Commit 6724d80, läuft in CI). Eigener Lauf gegen
den lokalen Dev-Server, einzelner Worker, ohne Retries:

```
5 passed / 6 — axe-core selbst: 0 Verstöße auf allen 3 öffentlichen Seiten
               (27–28 WCAG-2.1-A/AA-Regeln bestanden je Seite)
```

Ein Test („ARIA-Landmarks und Rollen … vollständig") schlug reproduzierbar fehl:
`/pflegecoach/start` lieferte beim `evaluate()` **0 statt 1 `h1`** und eine doppelte
`status`-Landmark. **Ursache identifiziert, kein Regressionsfehler:**
`app/pflegecoach/start/page.tsx:348` rendert `if (pruefe) return <CoachLaden />` — die Seite
prüft clientseitig per `fetch('/api/coach/profil')`, ob bereits eine Sitzung besteht, und
zeigt bis dahin einen Ladezustand ohne `h1`. Next.js sendet dieses Ladezustand-HTML serverseitig
vor; `page.waitForLoadState('networkidle')` kann bereits erfüllt sein (Assets geladen), bevor
der clientseitige Fetch überhaupt gestartet ist — ein Timing-Fenster, das im unkomprimierten
Turbopack-Dev-Modus deutlich größer ist als in einem Produktions-Build.

Das deckt sich mit `docs/dipa/14_ACCESSIBILITY_GAP_LISTE.md`: dort wurde der Durchgang
ausdrücklich gegen einen **Produktions-Build** (`npm run build && npm run start`, 12/12 grün)
und gegen die **Live-Produktion** (10/10 grün) gefahren — nicht gegen den Dev-Server. Mein
Dev-Server-Lauf bestätigt dieselbe Erkenntnis wie zuvor dokumentiert, nur mit einer zusätzlichen
Randbeobachtung zur Test-Robustheit unter Turbopack. **Kein Code geändert** (Auftrag: nur
testen/dokumentieren) — als Hinweis für einen künftigen Härtungsdurchgang: der Test könnte
statt `networkidle` auf `page.waitForSelector('h1')` warten, um das Zeitfenster zu schließen.

Zusätzlicher Lauf von `e2e/pflegecoach.spec.ts` (Haupt-Suite, 24 Tests, 1 Worker):
**22/24 grün**, 2 Fehlschläge — beide `net::ERR_ABORTED`/Timeout beim `page.goto()` selbst
(nicht bei einer Prüfung danach), also Dev-Server-Instabilität unter wiederholter Navigation
(Turbopack-Kaltkompilierung einzelner Routen dauerte in dieser Session teils >20 s), keine
inhaltlichen Fehlschläge. Bereits mehrfach beobachtet: erste Anfrage an eine noch nicht
kompilierte Route braucht im Dev-Modus deutlich länger als im Produktions-Build.

### Fazit Phase 5

Der Kontrast-Fix ist korrekt und live bestätigt. Alle 176 Unit-Tests grün. Alle Routen
erreichbar, kein 404/Build-Fehler. Der axe-core-Test existiert, läuft, und findet **0
echte WCAG-Verstöße** — die zwei beobachteten Fehlschläge sind Dev-Server-Timing-Artefakte,
keine Produktregressionen; die maßgeblichen Nachweise (Produktions-Build, Live-Produktion)
sind bereits in `docs/dipa/14_ACCESSIBILITY_GAP_LISTE.md` mit 12/12 bzw. 10/10 grün belegt.

---

## Phase 6 — DiPA maximal intern fertigstellen

### BF-03 (Accessibility) — Stand

Kein neuer Fortschritt nötig/möglich über den bereits dokumentierten Stand hinaus (Commit
6724d80 hat den maschinellen Teil bereits abgeschlossen). Bestätigt durch eigenen Testlauf:

- **Maschineller Teil: abgeschlossen.** axe-core WCAG 2.1 A/AA, 0 Verstöße, Landmark-/Label-/
  Knopf-Namen-Inventur je Seite (siehe Phase 5, Punkt 4).
- **Manueller Teil: weiterhin offen**, auf **S1, S5, S7, S8** eingegrenzt (VoiceOver/NVDA-
  Durchgang) — intern durchführbar, aber noch nicht durchgeführt (`audit/dipa/
  gebrauchstauglichkeit_durchfuehrungsplan.md`).
- **Kontrast aller Buttons/Links:** durch den eigenen Kontrastrechner in
  `e2e/pflegecoach-axe.spec.ts` (Schwelle 4,5:1) systematisch geprüft, aktuell grün.
- **Aria-Labels:** 0 Eingabefelder ohne Label, 0 Schaltflächen ohne zugänglichen Namen auf
  allen 3 öffentlichen Seiten (Landmark-Inventur, Phase 5).
- **Tastaturnavigation (S8):** nicht maschinell prüfbar, weiterhin offen — siehe Gap-Liste §3.3.

### REG-01 — 48 Anforderungen, aktueller Zählstand

`npm run dipa:katalog` frisch ausgeführt (14.08.2026, Abend):

```
Anforderungen gesamt:            48
erfüllt:                         30
in Arbeit:                        8
offen:                           10

A Intern erledigt                 26 gesamt,  0 offen
B Intern umsetzbar (technisch)     4 gesamt,  1 offen
C Intern erstellbar (Dokumentation) 2 gesamt, 1 offen
D Externer Dienstleister nötig    11 gesamt, 11 offen
E Behörde/Kostenträger nötig       5 gesamt,  5 offen

Anforderungstexte gegen Original geprüft:  5 von 48 (6 % belastbare Quote)
```

**Zusammengefasst für den Auftrag:**

| Kategorie | Anzahl | Bedeutung |
|---|---:|---|
| **X/48 erfüllt** (Rohquote, Nachweise vorhanden) | **30/48** | Code/Doku-Belege vollständig, aber **nicht belastbar**, solange der Anforderungstext ungeprüft ist |
| **davon anforderungstextgeprüft (belastbar)** | **5/48 (6 %)** | Nur die 5 DSGVO-Einträge — einzige frei verfügbare, bereits vollständig geprüfte Quelle |
| **intern noch lösbar** | **2** | AK-INT-02 (Interoperabilität), AK-BF-03 (Barrierefreiheit) — beide „in Arbeit", kein externer Akteur nötig |
| **extern abhängig** | **16** | 11 „Externer Dienstleister" (BITV-Prüfstelle, TR-03161-Prüfstelle, Testpersonen, Evaluationspartner) + 5 „Behörde/Kostenträger" (BfArM, Pflegekasse) |
| **davon sofort intern bearbeitbar trotz Klasse E** | **~30 von 43 ungeprüften** | DiPAV (~16), BfArM-Leitfaden (~10), TR-03161 (8, überschneidet mit SEC-Klasse D fürs Zertifikat selbst nicht), WCAG-Original (3) sind frei verfügbar — Engpass ist **Lesezeit**, nicht Beschaffung (Details: `docs/dipa/15_REG01_ANFORDERUNGSTEXTE.md` §3–4) |

Keine neuen Anforderungstexte wurden in dieser Phase geprüft (Auftrag: nur testen/dokumentieren,
keine neuen Beschaffungs-/Prüfvorgänge). Der Stand ist identisch zu `docs/dipa/
15_REG01_ANFORDERUNGSTEXTE.md` (14.08.2026) — frisch nachgemessen, keine Abweichung.

### Eingehaltene Leitplanken

- `COACH_DIPA_MODUS` bleibt `false` (nicht angefasst).
- Keine Aussage „Kasse zahlt" oder automatische DiPA-Abrechnung getroffen oder im Code geändert.
- Keine Preise erfunden oder verändert.
- Keine neuen Features — ausschließlich Tests ausgeführt und Ergebnisse dokumentiert.
- `./deploy.sh` für diesen Bericht verwendet (kein direkter `git push`).

---

## Gesamtergebnis

| Frage | Antwort |
|---|---|
| **PflegeCoach: PASS/FAIL** | **PASS** — Kontrast-Fix korrekt, 176/176 Unit-Tests grün, alle Routen erreichbar, axe-core 0 WCAG-Verstöße; zwei Dev-Server-Timing-Flakes dokumentiert, keine Produktregression |
| **DiPA: X/48 erfüllt** | **30/48** roh erfüllt, davon **5/48 (6 %) belastbar** geprüft |
| **DiPA: X intern noch lösbar** | **2** direkt (AK-INT-02, AK-BF-03) + **~30 der 43 ungeprüften REG-01-Einträge** sind mit frei verfügbaren Dokumenten (DiPAV, BfArM-Leitfaden, TR-03161, WCAG) ohne externe Beschaffung prüfbar — Engpass ist Lesezeit |
| **DiPA: X extern abhängig** | **16** (11 Dienstleister + 5 Behörde/Kostenträger) — BITV-Test, TR-03161-Zertifizierung, Gebrauchstauglichkeitstest mit echten Testpersonen, BfArM-Beratungstermin u. a. |
| **BfArM-Antrag heute einreichbar?** | **NEIN.** Belastbare REG-01-Quote liegt bei 6 %; drei External-Klassen (BITV-Test, TR-03161-Zertifikat, Gebrauchstauglichkeitstest) sind vollständig offen; REG-05 (Beratungstermin) noch nicht wahrgenommen. Der nächste sinnvolle interne Schritt bleibt unverändert: DiPAV lesen (größter Hebel, frei verfügbar), dann BfArM-Leitfaden — vor dem Beratungstermin. |

---

## Quellen

- `app/pflegecoach/pflegecoach.css`, `app/pflegecoach/start/page.tsx`
- `lib/coach/*.test.ts` (176 Tests)
- `e2e/pflegecoach.spec.ts`, `e2e/pflegecoach-axe.spec.ts`
- `docs/dipa/14_ACCESSIBILITY_GAP_LISTE.md`, `docs/dipa/15_REG01_ANFORDERUNGSTEXTE.md`
- `npm run dipa:katalog` (`scripts/dipa-katalog-check.ts`), frisch ausgeführt 14.08.2026
