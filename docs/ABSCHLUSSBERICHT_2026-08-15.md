# Abschlussbericht — 15.08.2026

**Stand:** `main` @ `f07c6a9` (nach Basis `574fd19`) · Produktions-Domain `alltagsengel.care`
**Adressat:** Yusuf · **Grundsatz:** keine Wunschannahmen, jede Aussage mit Quelle belegt,
Unsicherheiten sind als UNGEKLÄRT markiert.

---

## 1. PflegeCoach technisch fertig: **NEIN**

Begründung: `npm run dipa:katalog` (Live-Lauf, 15.08.2026) meldet 31 von 48 Anforderungen
„erfüllt", aber nur 36 von 48 Anforderungstexten gegen die Originalquellen geprüft (44 %
belastbare Quote). 0 von 12 Pflegeinhaltsmodulen sind fachlich freigegeben
(`lib/coach/inhalte.ts`, `INHALT_ENTWURF_HINWEIS`; `docs/dipa/19_ZULASSUNGSSTRATEGIE_ANALYSE.md`
Abschnitt 6). Zusätzlich ist der letzte CI-Lauf auf `main` **rot** (siehe Punkt 14/15) — das
widerspricht der Commit-Aussage „Final Regression bestanden" in `f07c6a9`.

## 2. Kostenloser Endnutzerzugang: **JA**

Quelle: `docs/DIPA_EXTERNE_TODO_2026-08-14.md` Zeile 5 („PflegeCoach ist dauerhaft kostenlos für
Endnutzer"), `docs/GO_LIVE_CHECKLIST.md` Abschnitt B2 („Kein Abonnement, keine
Monats-/Jahrespreise, keine Paywall, keine Stripe-Zahlung durch Nutzer"). Code-seitig bestätigt:
`COACH_PREISE_FREIGEGEBEN_ENV` (`lib/coach/pricing.ts:32,43`) ist nur `true`, wenn die
Env-Variable explizit gesetzt ist — Default ist `false`, d. h. kein Preis wird angezeigt oder
verlangt.

## 3. Paywall vorhanden: **NEIN**

Der technische Selbstzahler-Verkaufsweg existiert im Code (`lib/coach/pricing.ts`), ist aber
laut `docs/GO_LIVE_CHECKLIST.md` B2 bewusst **nicht aktiviert**: `COACH_PREISE_FREIGEGEBEN`,
`COACH_FREISCHALTUNG_PFLICHT`, `COACH_DIPA_MODUS` stehen alle auf `false`
(`lib/coach/config.ts:22`, `lib/coach/pricing.ts:43` — beide lesen
`process.env[...] === 'true'`, Default also `false`). Er blockiert damit keinen Nutzer.

## 4. DiPA intern erfüllt: **31/48** (laut `lib/coach/anforderungskatalog.ts`)

Live-Lauf `npm run dipa:katalog` (15.08.2026): 48 Anforderungen gesamt, 31 erfüllt, 9 in
Arbeit, 8 offen. Davon sind **36/48 (44 %)** textlich gegen die Originalquellen geprüft — die
belastbare Quote laut Skript selbst. Rohquote (erfüllt ohne Prüfabgleich) und belastbare Quote
fallen auseinander; siehe auch `docs/dipa/18_PHASE4_REVERIFY_2026-08-14.md` Zeile 39-40.

## 5. Intern noch offen: **3** (AK-INT-02, AK-BF-03, AK-VS-02)

Laut Live-Lauf `npm run dipa:katalog` und `docs/dipa/18_PHASE4_REVERIFY_2026-08-14.md`
Abschnitt „Restliste":

- **AK-INT-02** (Klasse B) — Verbindlichkeit von FHIR/MIO im Einzelfall unklar, technisch
  bereits umgesetzt (`lib/coach/fhir.ts`, 13 Tests). Nur Klärung nötig, kein Code.
- **AK-BF-03** (Klasse C) — maschinelle Strukturprüfung fertig (axe-core), manueller
  VoiceOver/NVDA-Durchgang (Prüfpunkte S1, S5, S7, S8) noch offen. Intern durchführbar, aber
  Zeitaufwand.
- **AK-VS-02** (Klasse A) — 24-Stunden-Support-Antwortzusage nach Anlage 2 DiPAV §6 Abs. 5
  Punkt III.8 fehlt. Ist eine Geschäftsführungs-Entscheidung, keine reine Codeänderung.

## 6. Extern erforderlich: **16/48** (welche IDs?)

Laut `docs/DIPA_EXTERNE_TODO_2026-08-14.md` Zusammenfassungstabelle: 16 von 48 Punkten sind
Klasse D (Externer Dienstleister, 11 Punkte) oder E (Behörde/Kostenträger, 5 Punkte).

- **Klasse D (11):** DS-02, DS-04, SEC-01, SEC-04, SEC-05, BF-01, BF-02, QI-01, QI-02, NN-01,
  VS-04
- **Klasse E (5):** REG-01, REG-02, REG-03, REG-04, REG-05 — davon REG-02 und REG-03 laut
  Reverify bereits beantwortet/VERIFIED, REG-01/REG-04/REG-05 bleiben offen bzw. teilweise.

## 7. BfArM-Einreichung heute möglich: **NEIN**

Wörtliches Ergebnis aus `docs/DIPA_EXTERNE_TODO_2026-08-14.md`, letzter Absatz: „16 extern zu
erbringende Nachweise fehlen (davon 3 mit P0). Kein einziger dieser Punkte ist durch interne
Codearbeit allein schließbar." Zusätzlich bestätigt `docs/dipa/19_ZULASSUNGSSTRATEGIE_ANALYSE.md`
(Kernaussage, Zeile 21-26): kein Pflegeinhalt ist fachlich freigegeben, der Nutzennachweis
existiert nur als Absichtserklärung, die Doppelzielgruppen-Frage (Pflegebedürftige **und**
Angehörige in einem Produkt) ist eine offene Frage an eine noch nicht wahrgenommene
BfArM-Beratung.

## 8. Fehlende externe Nachweise (Liste)

Aus `docs/DIPA_EXTERNE_TODO_2026-08-14.md`, P0/P1 (P2 = Vorbereitung nach Aufnahme, siehe Datei):

**P0 — höchste Hebelwirkung:**
1. BSI-TR-03161-Zertifikat inkl. Penetrationstest, ein Mandat (SEC-01, SEC-04) — „längste
   Vorlaufzeit (Monate)"
2. Pflegefachliche Inhaltsfreigabe aller 12 Module (QI-01) — „höchstes Produktrisiko"
3. Datenschutzpaket: DSFA + AVV-Verträge + juristische Schlussprüfung MDR-Abgrenzung und
   Selbstzahler-AGB, ein Kanzlei-Mandat (DS-02, DS-04, PROD-02, VS-04)

**P1 — wichtig für Zulassungsfähigkeit:**
4. ISMS-Zertifizierung nach ISO 27001, DAkkS-akkreditiert (SEC-05) — „zwingender Bestandteil",
   keine Kann-Bestimmung
5. Konformitätsprüfung **DIN EN ISO 9241-171** (nicht WCAG/BITV/EN 301 549) + formative und
   summative Usability-Tests mit 5 Testpersonen (BF-01, BF-02)
6. Herstellerunabhängiges wissenschaftliches Institut für Evaluationskonzept + Ethikvotum
   (NN-01)
7. Lizenzvereinbarungen FES-I / BSFC-s / SUS (QI-02)
8. Datenschutzbeauftragter bestellen
9. Steuernummer/USt-IdNr. beim Steuerberater klären
10. 24-Stunden-Support-SLA festlegen (VS-02) — intern, aber Geschäftsführungs-Entscheidung

## 9. Security-Status

- **Server-only Guard:** `lib/supabase/admin.ts:12` führt `import 'server-only'` als erste
  Codezeile (zentral für den Service-Role-Client). Phase 2 (Commit `2d950f2`, nicht Teil des
  heutigen Deltas, aber Grundlage) zentralisierte den Guard für alle Admin-API-Routen. Heute
  (`cba88d1`) wurde ein **echter Leck-Fund** dazu behoben: `lib/vitals/vitals.ts` importierte
  den Service-Role-Client direkt und lief dadurch potenziell im Client-Bundle
  (`VitalChart`, `vitalwerte/[clientId]`) — CRUD-Funktionen wurden nach `lib/vitals/server.ts`
  ausgelagert.
- **MFA:** `lib/coach/mfa.ts` + `lib/coach/api-auth.ts` erzwingen serverseitig
  (`supabase.auth.mfa.getAuthenticatorAssuranceLevel()`), Schreibzugriff wird bei AAL1 ohne
  eingerichteten Faktor gesperrt (`mfaSperre`/`mfaStand`).
- **RLS:** Coach-Tabellen sind über 8 Migrationsdateien mit `coach_`-Bezug abgedeckt (Suche in
  `supabase/migrations/`). Ein vollständiger Live-Policy-Check war in dieser Session nicht
  möglich (kein Supabase-MCP, siehe Memory „Supabase-MCP nicht verfügbar") — **UNGEKLÄRT**, ob
  alle Policies exakt dem Code-Stand entsprechen.
- **Audit-Log:** `coach_audit_log` (append-only, nur Metadaten) ist implementiert und mit
  Tests (P7) belegt (`lib/coach/anforderungskatalog.ts:302`). Anforderung SEC-07
  („Auditierbarkeit") bleibt im Katalog trotzdem `NOT_VERIFIED`, weil kein DiPAV-Textfund
  existiert, der die Anforderung textlich deckt — die Implementierung selbst ist vorhanden.

## 10. Datenschutz-Status

- **Einwilligung:** DS-01 VERIFIED — `lib/coach/consent.ts`, `coach_consents` append-only,
  Art. 9 Abs. 2 lit. a DSGVO (`docs/dipa/18_PHASE4_REVERIFY_2026-08-14.md` Zeile 104).
- **DSFA:** DS-02 PARTIAL/EXTERNAL_REQUIRED — Vorbereitung liegt vor
  (`audit/dipa/dsfa_pflegecoach.md`), Kanzlei-Beauftragung fehlt.
- **AVV:** DS-04 PARTIAL/EXTERNAL_REQUIRED — Kette erhoben, Verträge mit Supabase/Vercel/
  Resend/Stripe fehlen (`audit/dipa/avv_dossier_pflegecoach.md`).
- **Löschkonzept:** DS-03 VERIFIED — `/pflegecoach/loeschung`, `audit/dipa/loeschkonzept.md`.
- **Export:** über `/api/coach/export`, Teil von DS-03.
- **DS-06 (Datenflüsse dokumentiert):** NOT_VERIFIED — kein eigener DiPAV-Textfund, deckt sich
  laut Reverify vermutlich mit DS-05/Art. 30 DSGVO, aber nicht bestätigt.

## 11. Barrierefreiheit

**Erfüllt:** Grundausstattung technisch umgesetzt (3 Schriftgrade, Kontrastmodus, Skip-Link,
ARIA-Landmarks, Touch-Ziele ≥ 44 px, `prefers-reduced-motion`), automatisierte axe-core-Prüfung
läuft in E2E (`e2e/pflegecoach-axe.spec.ts`, im letzten CI-Lauf: 0 Verstöße auf allen geprüften
Seiten).

**Fehlt:** Die tatsächlich einschlägige Norm ist laut Anlage 2 DiPAV + BfArM-Leitfaden Kap.
3.6.3.2 **DIN EN ISO 9241-171**, nicht WCAG/EN 301 549/BITV, wie der Katalog vorher fälschlich
zitierte (Korrektur in `docs/dipa/18_PHASE4_REVERIFY_2026-08-14.md`, Abschnitt „Drei echte
Korrekturen", Punkt 1). Eine externe Konformitätsprüfung gegen diese Norm liegt nicht vor
(BF-01, PARTIAL/EXTERNAL_REQUIRED). Der manuelle Screenreader-Durchgang (BF-03) ist ebenfalls
offen (siehe Punkt 5).

## 12. Usability

**Erfüllt:** Durchführungsplan mit 9 Aufgaben, Zeitlimits, Erfolgskriterien liegt fertig vor
(`audit/dipa/gebrauchstauglichkeit_durchfuehrungsplan.md`).

**Fehlt:** Der Plan deckt bislang nur eine **summative** Runde ab — BfArM-Leitfaden Kap.
3.6.3.1 verlangt formativ **und** summativ. Es wurden bislang **0 Testpersonen** durchgeführt
(BF-02, PARTIAL/EXTERNAL_REQUIRED).

## 13. Pflegerischer Nutzen / Evidenz

**Nachweisbar:** Die Zweckbestimmung ist technisch im Code abgebildet (Assessment, Ziele,
Wochenplan, Übungen als Code vorhanden), die MDR-Negativabgrenzung ist konsistent formuliert
(keine Diagnostik, kein Scoring), das Kostenlos-Modell ist fail-closed durchgesetzt.

**Fehlt:**
- Kein Nachweis tatsächlicher Wirkung: keine erhobenen Pilotdaten, kein abgeschlossenes
  Ethikvotum, kein wissenschaftlicher Partner beauftragt
  (`audit/dipa/evaluationskonzept.md` — selbst als „Herstellerrahmen, KEIN einreichungsreifes
  Konzept" bezeichnet).
- **0 von 12 Inhaltsmodulen** fachlich geprüft (`pruefstatus: 'entwurf'`,
  `INHALT_ENTWURF_HINWEIS`), im eigenen Risikoregister als „höchstes getragene Risiko des
  Produkts, nicht technisch lösbar" geführt (`risikoakte_pflegecoach.md`, R1.4).
- Strukturelle Diskrepanz laut Phase-6-Analyse: Alle Nutzer erhalten dieselben vier Übungen
  unabhängig vom Pflegegrad, obwohl die Zweckbestimmung eine Differenzierung nach Pflegegrad
  1–5 behauptet (`docs/dipa/19_ZULASSUNGSSTRATEGIE_ANALYSE.md` Abschnitt 4).
- Validierte Instrumente FES-I, BSFC-s, SUS existieren nur als Enum-Kennung, nicht als
  implementierte Erhebung (Lizenzfrage QI-02 ungeklärt).

## 14. Tests — letzte Ergebnisse (CI-Run `31846683884`, Commit `f07c6a9`, 14.08.2026 22:27 UTC)

| Prüfung | Ergebnis | Quelle |
|---|---|---|
| `tsc --noEmit` (Typecheck) | grün, keine Fehler | Job „Typecheck, Lint, Tests, Build" |
| Vitest (inkl. Shadow-DB-Tests) | 130 Testdateien bestanden, 1 übersprungen | Log-Zeile „Test Files 130 passed \| 1 skipped (131)" |
| `node:test` | 481 Tests gemeldet | Log-Zeile „# tests 481" |
| `npm run lint:forbidden` | grün — 2344 Dateien gescannt, 0 verbotene Strings | Log |
| Playwright-E2E (`e2e/pflegecoach.spec.ts` + `-axe.spec.ts`) | **ROT** — 3 fehlgeschlagen, 1 flaky, 66 bestanden | siehe Punkt 15 |

**Wichtig:** Die Vitest-/node:test-/Typecheck-Ergebnisse stammen aus dem CI-Run für den
aktuellen `main`-Stand, nicht aus einem lokalen Lauf (siehe Memory „Verifikation auf
Production" — lokale Läufe sind in dieser Umgebung unbrauchbar langsam).

## 15. CI — letzter Status: **FEHLGESCHLAGEN**

`gh run list` zeigt für den letzten Push (`f07c6a9`, „Phase 8: Final Regression bestanden")
Status **`failure`** (Run `31846683884`, 5m39s, 14.08.2026 22:27 UTC). Der Teil-Job
„Typecheck, Lint, Tests, Build" ist grün; der Job „E2E — PflegeCoach-Produktbereich
(DiPA-Matrix QS-05)" ist rot:

- 3 fehlgeschlagene Tests, alle auf `mobile-safari`, alle an derselben Stelle:
  `getByRole('heading', { level: 1 })` findet keine Überschrift (Timeout 5000 ms,
  `e2e/pflegecoach.spec.ts:161` und `:171`, betroffen: „öffentliche Seiten behaupten nirgends
  einen Preis…", „Startseite sagt ausdrücklich, dass die Nutzung kostenlos ist…",
  „`/api/coach/tarife` liefert ohne Verkaufsfreigabe keine Beträge…")
- 1 als „flaky" markierter Test (bestand beim Retry): „jede Seite hat genau eine
  Hauptüberschrift und einen eigenen Titel" (`e2e/pflegecoach.spec.ts:192`)
- 66 Tests bestanden

**Diskrepanz:** Die Commit-Message von `f07c6a9` behauptet „Final Regression bestanden" — der
tatsächliche CI-Lauf für genau diesen Commit ist rot. Alle drei Fehlschläge betreffen
ausschließlich `mobile-safari` und denselben Locator (`h1`), was auf ein
Browser-/Timing-spezifisches Problem hindeutet, nicht auf einen inhaltlichen Regressionsfehler
in Desktop-Browsern — das ist jedoch eine Einordnung, **keine Entwarnung**: der CI-Gate-Status
ist rot und muss vor der nächsten belastbaren Aussage „Tests grün" geklärt werden.
Der vorletzte Lauf (`dcfec9c`, Phase 4+5) war laut `gh run list` **grün**.

## 16. Production

- `https://alltagsengel.care/` → HTTP 200 (curl-verifiziert, 15.08.2026)
- `https://alltagsengel.care/pflegecoach/start` → HTTP 200 (curl-verifiziert, 15.08.2026)
- Der ausgelieferte Inhalt ist damit erreichbar. Der Vercel-Build-Status selbst konnte in
  dieser Session **nicht** direkt über die Vercel-API/gh-API geprüft werden (`gh api
  repos/.../deployments` lieferte 404 — falscher Ressourcenpfad für dieses Setup) — **UNGEKLÄRT**,
  ob der zuletzt erfolgreich deploybare Commit exakt `f07c6a9` ist oder ein älterer grüner
  Stand. Laut Memory „CI-/Deploy-Topologie" checkt Vercel selbst beim Build erneut typ, sodass
  ein rotes E2E-Gate den Vercel-Build nicht zwangsläufig verhindert (E2E läuft nur in GitHub
  Actions, nicht im Vercel-Build).

## 17. Neue Commits (6, chronologisch)

1. **`10c2123`** — REG-01: Anforderungstexte gegen DiPAV verifiziert (9→20/48, 35 % belastbare
   Quote). Erster Reverify-Durchgang, DiPAV nur bis §9 gelesen, keine Anlagen im Volltext.
2. **`cba88d1`** — Fix: `lib/vitals/vitals.ts` leckte den Service-Role-Client ins
   Client-Bundle (`VitalChart`, `vitalwerte/[clientId]`); CRUD-Funktionen nach
   `lib/vitals/server.ts` ausgelagert. Echter Sicherheitsfund, kein DiPA-Punkt.
3. **`faf1113`** — Phase 3: GAP-SHARES-UI, Datenfreigabe-Oberfläche mit Migration.
4. **`dcfec9c`** — Phase 4+5: DiPA-Reverify (20→36/48 geprüft) gegen DiPAV-Volltext,
   Anlagen 1+2, BfArM-Leitfaden v1.3 und MDR; 3 Korrekturen (BF-01-Norm, QMS-01-Fundstelle,
   VS-02-SLA); Freigaben-Consent-Regression gefixt; externe Todo-Liste aktualisiert.
5. **`7fbf656`** — Phase 6+7: Zulassungsstrategie-Analyse (kritische Prüfung, siehe
   `docs/dipa/19_ZULASSUNGSSTRATEGIE_ANALYSE.md`) + Kostenlos-Modell fail-closed abgesichert.
6. **`f07c6a9`** — Phase 8: Final Regression — Text „Zugang bestellen" → „Loslegen" korrigiert
   (passt zum Kostenlos-Modell, kein Bestellvorgang mehr), tote Imports entfernt,
   unescaped quotes gefixt. **CI-Lauf für diesen Commit ist rot** (siehe Punkt 15).

## 18. Aktuelle Risiken

**Technisch:**
- CI auf `main` ist aktuell rot (Punkt 15) — Diskrepanz zwischen Commit-Behauptung und
  tatsächlichem Testergebnis muss geklärt werden, bevor weitere „grün"-Aussagen getroffen
  werden.
- Vercel-Build-Status für `f07c6a9` in dieser Session nicht direkt verifizierbar
  (UNGEKLÄRT, Punkt 16).
- RLS-Live-Abgleich für Coach-Tabellen in dieser Session nicht möglich (kein Supabase-MCP,
  UNGEKLÄRT, Punkt 9).

**Regulatorisch:**
- BSI-TR-03161-Zertifikat nicht begonnen — laut `docs/dipa/19_ZULASSUNGSSTRATEGIE_ANALYSE.md`
  Abschnitt 8 „verhindert unabhängig vom Inhalt jede Antragstellung auf absehbare Zeit"
  (Monate Vorlauf).
- 0 von 12 Pflegeinhaltsmodulen fachlich freigegeben — höchstes Produktrisiko laut eigenem
  Risikoregister, betrifft **auch** den heute laufenden kostenlosen Betrieb, nicht nur eine
  künftige DiPA-Zulassung.
- Doppelzielgruppen-Frage (Pflegebedürftige + Angehörige in einem Produkt) ist eine offene,
  unbeantwortete Frage an eine noch nicht wahrgenommene BfArM-Beratung
  (`docs/dipa/19_ZULASSUNGSSTRATEGIE_ANALYSE.md` Abschnitt 7a).
- Zielgruppen-Gate (Pflegegrad-Pflicht) ist im Code nur deklarativ, nicht technisch
  durchgesetzt — die App steht faktisch „jedem Interessierten" offen (Abschnitt 1 und 7d
  derselben Analyse).
- MDR-Abgrenzung ist heute sauber, aber strukturell fragil: Sobald validierte Instrumente
  (FES-I, BSFC-s) für den Nutzennachweis mit Auswertungslogik verknüpft werden, wird laut
  `mdr_negativabgrenzung.md` eine Neubewertung fällig (Zielkonflikt Nutzennachweis vs.
  MDR-Risiko, Abschnitt 7b).

## 19. Was Yusuf persönlich als Nächstes tun muss (priorisiert)

Diese Punkte sind keine Codearbeit — sie erfordern eine externe Beauftragung, eine
Rechtsprüfung oder eine Geschäftsführungs-Entscheidung, die kein Agent treffen oder ausführen
kann.

1. **CI-Rot-Befund zur Kenntnis nehmen und entscheiden**, ob der mobile-safari-`h1`-Fehler
   (Punkt 15) ein reales Rendering-Problem oder ein Test-Infrastrukturproblem ist, bevor der
   nächste Deploy als „regressionsgeprüft" kommuniziert wird.
2. **BSI-TR-03161-Prüfstelle beauftragen** (P0, längste Vorlaufzeit — Monate). Unterlage liegt
   vor: `audit/dipa/tr03161_checkliste.md`.
3. **Pflegefachkraft für die Inhaltsprüfung beauftragen** (QI-01, höchstes Produktrisiko,
   betrifft auch den heute laufenden Selbstzahler-Weg). Unterlage liegt vor:
   `audit/dipa/inhalte_pruefdossier.md`.
4. **Kanzlei für Datenschutzpaket beauftragen** (DSFA, AVV-Verträge, MDR- und
   AGB-Schlussprüfung — ein Mandat). Unterlagen liegen vor: `audit/dipa/dsfa_pflegecoach.md`,
   `avv_dossier_pflegecoach.md`, `mdr_negativabgrenzung.md`,
   `nutzungsbedingungen_entwurf_selbstzahler.md`.
5. **24-Stunden-Support-SLA entscheiden** (VS-02) — Geschäftsführungs-Entscheidung: Zusage
   geben und organisatorisch sicherstellen (Personal/Vertretung), bevor sie öffentlich
   kommuniziert wird.
6. **BfArM-Beratungstermin beantragen** (REG-05, freiwillig laut DiPAV §22, aber laut
   Empfohlener Reihenfolge in `docs/DIPA_EXTERNE_TODO_2026-08-14.md` „günstigster nächster
   Schritt" — klärt mehrere offene Fragen in einem Termin). Fragenkatalog liegt vor:
   `audit/dipa/bfarm_fragenkatalog.md`.

## 20. Nächste 3 Schritte nach Wirkung priorisiert

1. **CI-Rot auf `main` klären** — solange das Gate rot ist, ist jede weitere Aussage
   „regressionsgetestet" nicht belastbar; betrifft jeden künftigen Commit, nicht nur diesen.
2. **TR-03161-Prüfstelle beauftragen** — hat die längste Vorlaufzeit der gesamten DiPA-Kette
   und blockiert unabhängig vom fachlichen Inhalt jede Antragstellung; je später beauftragt,
   desto später ist eine Einreichung überhaupt möglich.
3. **Pflegefachkraft für die Inhaltsprüfung beauftragen (QI-01)** — einzige Position, die laut
   eigenem Risikoregister das höchste Produktrisiko trägt **und** bereits den heute laufenden,
   kostenlosen Betrieb betrifft, nicht erst eine künftige DiPA-Zulassung.

---

**Entlastungsbetrag:** 131 €/Monat (§ 45b SGB XI, `entlastungJaehrlich: 1572`, gültig seit
01.01.2025) — nur zur Einordnung, kein PflegeCoach-Preis. PflegeCoach ist und bleibt kostenlos
für Endnutzer (Punkt 2). Keine DiPA-Zulassung liegt vor, ist beantragt oder steht bevor.

*Erstellt: 15.08.2026 · Phase 10 · Quellen: `npm run dipa:katalog` (Live-Lauf),
`docs/dipa/18_PHASE4_REVERIFY_2026-08-14.md`, `docs/dipa/19_ZULASSUNGSSTRATEGIE_ANALYSE.md`,
`docs/DIPA_EXTERNE_TODO_2026-08-14.md`, `docs/GO_LIVE_CHECKLIST.md`, `git log`, `gh run view
31846683884`, `curl` gegen `alltagsengel.care`.*
