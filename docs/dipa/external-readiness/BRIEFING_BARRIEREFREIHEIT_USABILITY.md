# Briefing für eine Usability-/Accessibility-Prüfstelle — Digitaler PflegeCoach

| Feld | Eintrag |
|---|---|
| **Produkt** | Digitaler PflegeCoach (`/pflegecoach`), Version 0.5.0 (`lib/coach/version.ts`) |
| **Hersteller** | Alltagsengel UG (haftungsbeschränkt), Neue Mainzer Straße 66-68, 60311 Frankfurt am Main (Amtsgericht Frankfurt am Main, HRB 140351) |
| **Stand dieses Briefings** | 2026-08-15 |
| **Status** | **Briefing für Beauftragung — noch nicht beauftragt.** Dieses Dokument dient der Anfrage bei einer geeigneten Prüfstelle und der Angebotserstellung. Es ist kein Auftrag und kein Prüfbericht. |
| **Bezug** | DiPA-Antragsprojekt (Digitale Pflegeanwendung nach § 40a SGB XI). Externe To-do-Liste `docs/DIPA_EXTERNE_TODO_2026-08-14.md`, Punkt 5 (P1, BF-01/BF-02) |

---

## 0. Vorbemerkung — was dieses Briefing NICHT behauptet

- **Es liegt keine DiPA-Zulassung vor. Keine ist beantragt.** Die hier beschriebene Prüfung
  ist Teil der Vorbereitung eines möglichen künftigen Antrags, kein bestätigter Zulassungsschritt.
- Der Digitale PflegeCoach ist **dauerhaft kostenlos für Endnutzer**. Eine etwaige künftige
  Kostenerstattung durch Pflegekassen setzt eine tatsächliche DiPA-Zulassung voraus, die
  nicht vorliegt. Dieses Dokument enthält keine Preis- oder Erstattungsangaben.
- Dieses Dokument erfindet keine Anforderungen. Wo eine Quelle keine Aussage hergibt, ist
  das als offener Punkt benannt (siehe insbesondere §4).

---

## 1. Welche Norm gilt

Die für die Barrierefreiheitsprüfung **maßgebliche Norm ist DIN EN ISO 9241-171**
(Ergonomie der Mensch-System-Interaktion — Teil 171: Leitlinien für die Zugänglichkeit
von Software), insbesondere **Anhang C und Anhang D**.

**Fundstelle:** Anlage 2 DiPAV (Themenfeld 4, Anforderungen an Barrierefreiheit und
Gebrauchstauglichkeit) i. V. m. § 6 Abs. 6 DiPAV sowie BfArM-DiPA-Leitfaden, Version 1.3
(Stand 15.07.2026), Kapitel 3.6.3.2 (S. 73). Der Leitfaden benennt DIN EN ISO 9241-171 als
Maßstab; WCAG, EN 301 549 und BITV kommen dort **nicht** als verbindlicher Maßstab vor.

### Korrektur einer früheren internen Fehlannahme

In einer früheren Projektphase war der interne Anforderungskatalog (`lib/coach/anforderungskatalog.ts`,
Eintrag AK-BF-01) fälschlich auf **EN 301 549 / WCAG 2.1 AA** verortet — vermutlich, weil
dies die in der Webentwicklung geläufigeren Referenzen sind. Dieser Fehler wurde am
14.08.2026 im Rahmen eines Volltext-Reverifys gegen DiPAV und den BfArM-Leitfaden
identifiziert und korrigiert (siehe `docs/dipa/18_PHASE4_REVERIFY_2026-08-14.md`,
Abschnitt „Drei echte Korrekturen", Punkt 1).

**Diese Korrektur wird hier ausdrücklich benannt, damit die beauftragte Prüfstelle denselben
Fehler nicht wiederholt** — also nicht versehentlich gegen WCAG/EN 301 549/BITV statt gegen
DIN EN ISO 9241-171 prüft oder ein BITV-Testverfahren als Nachweisform vorschlägt, das für
diesen Antragstyp nicht die einschlägige Grundlage ist.

Offen bleibt unabhängig davon die konkrete Nachweisform (Prüfbericht, Zertifikat,
Selbsterklärung mit Prüfstellenbestätigung) — das ist mit dem BfArM zu klären
(`audit/dipa/bfarm_fragenkatalog.md`, Frage 12) und ggf. mit der beauftragten Prüfstelle
abzustimmen.

---

## 2. Vorhandene Maßnahmen zur Barrierefreiheit — und was sie nicht abdecken

### 2.1 Umgesetzte Grundausstattung

| Maßnahme | Umsetzung |
|---|---|
| 3 Schriftgrade, Option „sehr groß" | `app/pflegecoach/pflegecoach.css`, serverseitig gespeicherte Präferenzen (`coach_users.a11y_*`) |
| Kontrastmodus | `CoachShell.tsx` |
| Skip-Link zum Inhalt | `a.pc-skiplink` → `#pc-main` |
| ARIA-Landmarks (banner, navigation, main, contentinfo) | alle `/pflegecoach`-Seiten |
| Touch-Ziele ≥ 44 px | `.pc-btn`-Klasse |
| `prefers-reduced-motion` berücksichtigt | global |

### 2.2 Maschinelle Prüfung — Umfang und Grenze

Zusätzlich existiert eine automatisierte Testsuite (`e2e/pflegecoach.spec.ts`,
`e2e/pflegecoach-axe.spec.ts`) mit axe-core 4.11.3 gegen die WCAG-Regelsätze 2.1 A/AA,
zuletzt am 14.08.2026 gegen die Produktion ausgeführt (10/10 bestanden, 0 Verstöße auf
den öffentlichen Seiten `/pflegecoach/start`, `/pflegecoach/datenschutz`,
`/pflegecoach/anfrage`). Dabei wurde ein realer Kontrastfehler bei einem primären
Handlungsknopf gefunden und behoben (Details: `docs/dipa/14_ACCESSIBILITY_GAP_LISTE.md`, §2b).

**Zentraler Punkt für die Prüfstelle:** Diese maschinelle Prüfung ist **kein Nachweis der
Konformität gegen DIN EN ISO 9241-171** und auch keine WCAG-Konformitätsaussage im
formellen Sinn. axe-core prüft, was maschinell entscheidbar ist — Struktur, Kontrastwerte,
Vorhandensein von Labels und Landmarks. Nicht geprüft und nicht maschinell prüfbar sind
insbesondere:

- ob eine Screenreader-Ansage **verständlich** ist,
- ob eine Live-Region **zum richtigen Zeitpunkt** spricht,
- ob ein Alternativtext **inhaltlich** zutrifft,
- ob die **Vorlese-Reihenfolge** sinnvoll ist,
- ob in echter Screenreader-Bedienung eine **Fokusfalle** entsteht,
- die **inhaltliche** Angemessenheit von Bedienelement-Bezeichnungen.

Zusätzlich wurde intern (ohne echte Screenreader-Software) der Chromium-Accessibility-Baum
gelesen; dabei ist ein möglicher Prüfpunkt aufgefallen: Radiobuttons/Checkbox auf
`/pflegecoach/anfrage` zeigen im Baum den rohen `value`/Zustand statt des sichtbaren
Label-Texts. Ob das ein Werkzeugartefakt ist oder die tatsächliche Ansage betrifft, lässt
sich nur mit echter Screenreader-Software (VoiceOver/NVDA) klären — dies wird der
Prüfstelle als erster zu prüfender Punkt mitgegeben.

**Kurz:** Die vorhandene Grundausstattung und die axe-core-Suite sind die Basis, auf der
eine externe Konformitätsprüfung aufbaut — sie ersetzen diese Prüfung nicht.

---

## 3. Zwei getrennte Aufgaben

Die beauftragte Prüfstelle soll **zwei fachlich unterschiedliche Leistungen** erbringen, die
nicht gegeneinander austauschbar sind:

### (a) Konformitätsprüfung DIN EN ISO 9241-171

Prüfung des Produkts gegen die Anforderungen aus DIN EN ISO 9241-171, Anhang C und D, mit
schriftlichem Konformitätsprüfbericht.

### (b) Usability-Tests mit Testpersonen aus der Zielgruppe — formativ UND summativ

Nutzertests mit mindestens 5 Testpersonen aus der Zielgruppe (§5), **in zwei Runden**:

- **formativ** — während der Entwicklung/Optimierung, mit dem Ziel, Bedienprobleme früh
  aufzudecken und Änderungen daran auszurichten;
- **summativ** — abschließende Bewertung eines (nahezu) finalen Stands.

**Fundstelle für die Zweiteilung:** BfArM-Leitfaden Kap. 3.6.3.1 verlangt ausdrücklich
sowohl formative als auch summative Evaluation (siehe `docs/dipa/18_PHASE4_REVERIFY_2026-08-14.md`,
Eintrag BF-02).

### Offener Punkt vor Beauftragung

Der bestehende `audit/dipa/gebrauchstauglichkeit_durchfuehrungsplan.md` ist laut der
externen To-do-Liste (`docs/DIPA_EXTERNE_TODO_2026-08-14.md`, Punkt 5, Feld
„Abhängigkeiten") bislang **nur auf eine summative Runde ausgelegt**. Er muss **vor
Beauftragung** um eine formative Runde ergänzt werden — das ist eine noch offene
Vorbereitungsaufgabe, keine bereits erledigte. Dieses Briefing benennt den Punkt, löst ihn
aber nicht; die Ergänzung ist von Alltagsengel vor der tatsächlichen Beauftragung
nachzuziehen.

---

## 4. Zielgruppe für die Nutzertests

Quelle: `audit/dipa/zielgruppendefinition.md`. Der Digitale PflegeCoach hat eine
Doppelzielgruppe:

| Gruppe | Merkmale |
|---|---|
| **Pflegebedürftige** (Produktrolle `pflegebeduerftig`) | Pflegegrade 1–5 in häuslicher Versorgung, Schwerpunkt Pflegegrade 1–3; kognitiv/sensorisch in der Lage, die Anwendung ggf. mit Unterstützung zu bedienen |
| **Pflegende Angehörige und sonstige ehrenamtlich Pflegende** (Produktrolle `angehoerig`) | seit 1. DiPAV-ÄndV (01.07.2026) eigenständig adressierbare zweite Zielgruppe |

**Ausdrücklich nicht Zielgruppe:** stationär Versorgte, professionelle Pflegefachkräfte als
Endnutzer eines Arbeitswerkzeugs, Personen ohne Pflegegrad (außer im freiwilligen Pilot).

Der interne Durchführungsplan konkretisiert dies für die Testpersonen-Zusammensetzung
(5 Personen: Pflegegrad 1–2, Pflegegrad 3+ mit Hilfsmitteln, berufstätige/r pflegende/r
Angehörige/r, Person über 75 mit geringer Technikerfahrung, Person mit Seh- oder
Feinmotorikeinschränkung) — siehe §6.

---

## 5. Durchführungsplan — was bereits vorbereitet ist

Zusammenfassung aus `audit/dipa/gebrauchstauglichkeit_durchfuehrungsplan.md` (Stand
2026-08-14, Status dort: „INTERN OFFEN — Durchführung steht aus"):

| Baustein | Inhalt |
|---|---|
| Testpersonen | 5 Personen, Merkmale wie in §4 beschrieben; Ausschluss von Mitarbeitenden und Personen, die das Produkt bereits kennen |
| Aufgaben | 9 Aufgaben (A1–A9) mit Zeitlimits und Erfolgskriterien; A1 (Verständnis der Zweckbestimmung) und A8 (Nutzung beenden/Daten löschen) gelten als regulatorisch wichtigste Aufgaben |
| Erhebung je Aufgabe | Erfolg (selbständig/mit Hinweis/abgebrochen), Dauer, Fehlversuche, Hilfebedarf, wörtliche Äußerungen, sichtbare Belastung |
| Bewertungsmaßstab | ≥ 4/5 selbständig = tragfähig; 2–3/5 = Änderung vor Pilotstart nötig; ≤ 1/5 = schwerwiegend, Wiederholung nötig; jeder Abbruch bei A1 oder A8 gilt unabhängig von der Quote als schwerwiegender Befund |
| Ergänzender Protokollbogen | `audit/dipa/gebrauchstauglichkeit_testprotokoll.md` — durchführbare Vorlage mit Teilnehmenden-Tabelle, Einwilligungs-Checkliste, Aufgabenliste (A1–A11, teils abweichend nummeriert von A1-A9 im Durchführungsplan), Abschlussbefragung und Auswertungsbogen |
| Geschätzter Aufwand (bisheriger Plan, nur summative Runde) | ca. 3,5 Tage gesamt (Vorbereitung, Durchführung, Screenreader-Durchgang, Auswertung) |
| Status | **Nicht durchgeführt.** Kein technisches Hindernis — es fehlt bislang eine gewonnene Testperson aus der eigentlichen Zielgruppe |

**Wichtiger Hinweis für die Prüfstelle:** Wie in §3 benannt, deckt dieser Plan bislang nur
eine summative Runde ab. Die formative Runde ist vor der eigentlichen Beauftragung noch zu
ergänzen.

Getrennt davon — und nicht Gegenstand dieses Briefings, da intern durchführbar — ist ein
manueller Screenreader-Durchgang (VoiceOver/NVDA) gegen 8 Prüfpunkte (S1–S8), von denen
der maschinelle Anteil bereits abgedeckt ist und der manuelle Anteil (insbesondere S1, S5,
S7, S8) noch aussteht (`docs/dipa/14_ACCESSIBILITY_GAP_LISTE.md`, §3.3).

---

## 6. Was die Prüfstelle liefern muss (Deliverables)

| # | Deliverable | Bezug |
|---|---|---|
| 1 | **Konformitätsprüfbericht DIN EN ISO 9241-171** (Anhang C/D), mit Einzelfeststellungen je geprüftem Kriterium, Bewertung und ggf. Empfehlungen | §1, §3(a) |
| 2 | **Usability-Testbericht, formative Runde** — Durchführung, Rohdaten je Testperson/Aufgabe, identifizierte Bedienprobleme mit Schweregrad, Empfehlungen vor der summativen Runde | §3(b) |
| 3 | **Usability-Testbericht, summative Runde** — abschließende Bewertung, Bezug zum Bewertungsmaßstab aus §5, klare Aussage zu A1/A8 (Zweckbestimmungsverständnis, Beendbarkeit/Datenlöschung) | §3(b), §5 |
| 4 | Klärung/Bestätigung der **Nachweisform** gegenüber dem BfArM (Prüfbericht vs. Zertifikat vs. sonstige Form), soweit die Prüfstelle dazu Erfahrung hat | §1 |

Dieses Briefing selbst ist **kein** Deliverable-Ersatz — es ist die Grundlage für ein
Angebot und eine spätere Beauftragung.

---

## 7. Zuständige Stelle / Ansprechpartner

| Feld | Eintrag |
|---|---|
| **Auftraggeber** | Alltagsengel UG (haftungsbeschränkt), Neue Mainzer Straße 66-68, 60311 Frankfurt am Main |
| **Fachlicher Ansprechpartner** | [Platzhalter — vor Versand durch Alltagsengel einzutragen] |
| **E-Mail** | [Platzhalter — vor Versand durch Alltagsengel einzutragen] |
| **Prüfstelle** | [noch nicht ausgewählt — Auswahlkriterium: nachweisbare Erfahrung mit DIN EN ISO 9241-171 sowie mit formativen/summativen Usability-Tests im Gesundheits-/Pflegekontext] |

Kein Personenname wird hier als Absender geführt; externe Kommunikation läuft unter
„Alltagsengel".

---

## 8. Bereitzustellende Unterlagen

Der Prüfstelle sind vor bzw. bei Beauftragung folgende Dateien bereitzustellen:

| Datei | Inhalt |
|---|---|
| `docs/dipa/14_ACCESSIBILITY_GAP_LISTE.md` | Bestehende a11y-Maßnahmen, axe-core-Ergebnisse, offene Punkte S1–S8 |
| `audit/dipa/gebrauchstauglichkeit_durchfuehrungsplan.md` | Durchführungsplan Usability-Test (Testpersonen, Aufgaben, Bewertungsmaßstab) — vor Beauftragung um formative Runde zu ergänzen |
| `audit/dipa/gebrauchstauglichkeit_testprotokoll.md` | Protokollvorlage für die Testdurchführung |
| `audit/dipa/zielgruppendefinition.md` | Zielgruppendefinition |
| `docs/dipa/18_PHASE4_REVERIFY_2026-08-14.md` (Abschnitt „5. Barrierefreiheit und Gebrauchstauglichkeit") | Einträge BF-01/BF-02/BF-03 mit Fundstellen, Klasse, Status |
| `e2e/pflegecoach.spec.ts`, `e2e/pflegecoach-axe.spec.ts` | Automatisierte Struktur-/axe-core-Tests (zur Einordnung, kein Ersatz der externen Prüfung) |
| Zugang zu den öffentlichen Seiten `/pflegecoach/start`, `/pflegecoach/datenschutz`, `/pflegecoach/anfrage` sowie — nach Abstimmung — zu den angemeldeten Kernbereichen | Prüfgegenstand |
| `docs/DIPA_EXTERNE_TODO_2026-08-14.md`, Punkt 5 | Einordnung dieses Auftrags in die Gesamt-To-do-Liste |

---

## Quellen dieses Briefings

* `docs/dipa/14_ACCESSIBILITY_GAP_LISTE.md`
* `audit/dipa/gebrauchstauglichkeit_durchfuehrungsplan.md`
* `audit/dipa/gebrauchstauglichkeit_testprotokoll.md`
* `audit/dipa/zielgruppendefinition.md`
* `docs/DIPA_EXTERNE_TODO_2026-08-14.md` (Punkt 5)
* `docs/dipa/18_PHASE4_REVERIFY_2026-08-14.md` (Abschnitt „5. Barrierefreiheit und Gebrauchstauglichkeit")
* `app/impressum/page.tsx` (Firmendaten)
