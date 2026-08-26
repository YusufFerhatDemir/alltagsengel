# MASTER HANDOFF -- Stand 27.08.2026, nach Phase 8.3 (Final Live-Pilot Preparation)

Dieses Dokument ist die einzige Wahrheitsquelle fuer den technischen Zustand
beider Produkte. Jede neue Session liest zuerst diese Datei.

> ## Gesamtstatus: `NOT_READY_FOR_LIVE_PILOT` — ein P0 offen
>
> **Ein technischer Blocker verhindert die Pilotbereitschaft:** Migration
> `20261005000000_pilot_send_gate.sql` ist **NICHT LIVE**. Phase 8.2 hatte
> sie faelschlich als angewendet gemeldet -- Phase 8.3 widerlegt das mit
> zwei unabhaengigen Pruefwegen (`to_regclass` = NULL, PostgREST 404).
> Alles andere ist technisch sauber. Typecheck 0 Fehler, 8.228+ Tests gruen.
>
> **Was dieser Status bedeutet:** Der Geschaeftsfuehrer entscheidet, wann und
> ob der erste echte Vorgang stattfindet. Fuer jeden der drei Geldpfade gibt
> es eine Vorstufe, die das Ergebnis zeigt, **ohne es auszuloesen**, eine
> Pilotpruefung, die strenger ist als der Regelbetrieb, eine Einmal-Freigabe
> mit Datenbank-Riegeln, und eine Nachpruefung, die den Vorgang bestaetigt
> oder sperrt. Die Phasenkette in `/admin/pilot` zeigt den Stand.
>
> **Was er ausdruecklich NICHT bedeutet:**
> - **Keine Freigabe fuer unbeaufsichtigten Regelbetrieb.** Ein begleiteter
>   Einzelvorgang ist etwas anderes als ein Automat, der nachts laeuft.
> - **`payments` = 0, `camt_imports` = 0, `invoice_email_log` = 0.** Das
>   System ist gebaut, getestet und gegen Abbruchszenarien gehaertet -- aber
>   **nie mit echtem Geld gelaufen.** Kein Test ersetzt diesen Beleg.
> - **Kein Schalter ist umgelegt.** Beide Versand-Flags sind ungesetzt,
>   `CAMT_IMPORT_MODE` steht auf DRY_RUN, `FIRST_REAL_INVOICE_APPROVED`
>   steht auf `false`, `PILOT_ERSTVERSAND_FREIGEGEBEN` ist nicht gesetzt.
> - **Der DATEV-Export ist ohne D1/D2 nicht lauffaehig** -- Berater- und
>   Mandantennummer fehlen, der Export bricht vorher ab (Paragraph 6,
>   `docs/ENV_KONFIGURATION.md` Paragraph 1).
> - **Kein Pilot-Kandidat vorhanden.** Alle 3 Rechnungen sind Seed-Daten.
>   Fuer den Pilot muss ein neuer Klient + Rechnung erzeugt werden.
> - **Migration `20261005000000` wartet auf den Supabase-SQL-Editor.** Ohne
>   sie ist die Einmal-Freigabe nicht benutzbar und die `APPROVAL`-Phase
>   in `/admin/pilot` steht auf BLOCKIERT.
>
> **Fuer efy care (Fremdrepo) gilt dieser Status ausdruecklich nicht** --
> dort stehen zwei P1 offen (Paragraph 7 T-6/T-7).

---

## 0. Commit-Anker

Die drei Werte muessen **identisch** sein. Weichen sie ab, beschreibt dieses
Dokument nicht den Stand, der tatsaechlich deployed ist -- dann zuerst
`git log`/`git fetch` pruefen, bevor irgendeiner Aussage unten geglaubt wird.

| Anker | Bedeutung | Wert |
|---|---|---|
| **CODE_HEAD** | lokaler `main`-HEAD | `8d5f52a` (Phase 8.3 Code+Docs) |
| **HANDOFF_COMMIT** | Commit, in dem dieses Dokument zuletzt geschrieben wurde | `8d5f52a` |
| **ORIGIN_MAIN** | `origin/main` nach `deploy.sh` (Remote-Wahrheit) | `8d5f52a` |

Pruefbefehl:

```bash
git rev-parse HEAD && git rev-parse origin/main
```

> **Zur Lesart der Anker.** Ein Dokument kann den Hash des Commits, der es
> selbst enthaelt, nicht im Voraus nennen. Die Anker werden deshalb im
> unmittelbar folgenden `docs:`-Commit nachgezogen. **`HEAD` genau einen
> `docs:`-Commit vor diesen Ankern ist erwartet und keine Drift.** Alles
> darueber hinaus -- insbesondere jeder Commit, der Code anfasst -- bedeutet:
> dieses Dokument ist aelter als der deployte Stand.

**Letzter Code-Commit** (der letzte Commit, der Anwendungscode anfasst): `8d5f52a`

**Phase-8.3-Commits (Alltagsengel):**

| Commit | Inhalt |
|---|---|
| `aa50d11` | Tracks 1-5: Source-of-Truth, Send-Gate-Verifikation, Pilot-Kandidat, Laufzeit-Herkunft, Control Center |
| `8d5f52a` | Tracks 6-10: Idempotenz-Tests, Reports, Handoff |

**Phase-8.2-Commits (Alltagsengel):**

| Commit | Inhalt |
|---|---|
| `d6d4f1f` | Phase 8.2: DATEV-Validierung, P0-Detailtabelle, VersandSperreDetail, Reports, Pricing-Template |
| `d534383` | Phase 8.2 Commit-Anker nachgezogen |

**Phase-8-Commits (Alltagsengel):**

| Commit | Inhalt |
|---|---|
| `f0d14c2` | Tracks 1--4: Pre-Pilot-Snapshot, Rechnungs-Pilot, Einmal-Freigabe, Nachpruefung |
| `f4ded2a` | Tracks 5--10: CAMT-Pilot, Zuordnungs-Gate, Mahn-Trockenlauf, Abstimmung, Business Inputs, Phasenkette |

**Phase-7-Commits (Alltagsengel):**

| Commit | Inhalt |
|---|---|
| `a994885` | Tracks 5--8: DATEV-Validator, ChairMatch-Pruefung, Pilot Control Center, Chaos-Tests |
| `5967009` | Tracks 1--4: Versand-Flags, CAMT-/Rechnungs-Preflight, Mahn-Safety-Gate |
| `0ed44c8` | Schema-Drift-Befunde nachgeprueft -- 8 Fehlalarme begruendet als Ausnahmen |

**ChairMatch:** `db50334` -- Track 6 (Preis-Schema verifiziert, Gueltigkeitsmigration vorbereitet).

**Phase-6B-Commits (Vorgaenger):** `6ef8d7f`, `8a99e04`, `0a63657`

---

## 1. Repository-Stand

### Alltagsengel

| Feld | Wert |
|---|---|
| Branch | `main` |
| HEAD | siehe **CODE_HEAD** oben |
| Letzter Code-Commit | Phase 8, alle 10 Tracks abgeschlossen |
| Typecheck | **0 Fehler** (`npx tsc --noEmit`, Exit 0) |
| Tests | vitest **6.017** + node:test **2.211** = **8.228** (vorher 7.838, **+390**) |
| Testlaeufe | node:test 2.211 gruen / 0 rot -- vitest 6.017 gruen / 38 uebersprungen / 0 rot (nacheinander gelaufen, nicht gleichzeitig, nicht parallel zum Typecheck) |
| CI | **GRUEN auf `ae080be`** (4/4 Checks: Typecheck/Lint/Tests/Build, E2E, Health Check, Wiederholungslauf) |
| lint:forbidden | **0 Treffer** (24.608 Dateien, FULL-Scan, Exit 0) |
| check:schema-drift | **0 Befunde** (1.305 Dateien gegen 331 Live-Tabellen) |
| Live | alltagsengel.care -- HTTP 200 |

### ChairMatch

| Feld | Wert |
|---|---|
| Branch | `main` |
| HEAD | `db50334` |
| Letzter Commit | Phase 7 Track 6: Preis-Schema verifiziert, Gueltigkeitsmigration vorbereitet |
| Typecheck | 0 Fehler |
| Tests | vitest **520/520** (vorher 487, +33) |
| Live | chairmatch.de -- 308 -- www.chairmatch.de -- HTTP 200 |
| **Wartende Migration** | `20260826_pricing_gueltigkeit.sql` -- vorbereitet, NICHT angewendet. Geschaeftsentscheidung C5 (Paragraph 6). |

> In Phase 7 (Track 6) **geprueft, nicht veraendert**: Schema und RLS live
> verifiziert (`anon` -- HTTP 401), 33 Strukturtests neu, eine Migration
> vorbereitet und bewusst nicht angewendet. **Keine Preise gesetzt.**

### efy care

| Feld | Wert |
|---|---|
| Repo | `/Users/work/efy-care` (Fremdrepo, nicht Teil von Alltagsengel) |
| HEAD | `a6904c1` |
| Typecheck / Lint / Build | je Exit 0 |
| Tests | **177 gruen / 30 uebersprungen** |
| RLS (Migrationsebene) | **41/41** Tabellen, 185 Policies |
| RLS (Produktiv-DB) | **ungeprueft** |
| Supabase | ACTIVE_HEALTHY, 12 Migrationsdateien im Repo |
| Baseline-Bericht | `/Users/work/efy-care/docs/EFY_CARE_BASELINE_2026-08-25.md` |

> In Phase 6B und danach **nicht angefasst**. Werte aus der 6A-Baseline.

---

## 2. Supabase-Status

### Alltagsengel (nnwyktkqibdjxgimjyuq)

- Status: ACTIVE_HEALTHY
- Migrationen: 226+ angewendet -- **inkl. `20261004000000`** (neu in 6B)
- Tabellen: 308, davon **308 mit RLS** (100 %)
- org_fence RESTRICTIVE: alle relevanten Tabellen, 2 dokumentierte Ausnahmen
  (`organization_members`: Multi-Org-Verwaltung; `state_waitlist`: oeffentlich)
- anon writes: 0
- Storage: 7 Buckets gehaertet (file_size_limit + MIME-Allowlist)
- DTA-Policies: org-scoped (`foldername[2] = current_org_id`)
- **Migration `20261005000000` NICHT LIVE:** Phase 8.2 meldete sie als
  angewendet, Phase 8.3 widerlegt das (`to_regclass` = NULL, PostgREST 404).
  Wartet auf den Supabase-SQL-Editor. Verifikation: `scripts/verify-pilot-send-gate.mjs`
  (26 Pruefpunkte, muss 26/26 zeigen).

### ChairMatch (pwdbjqfpgumyfktbfswg)

- Status: ACTIVE_HEALTHY
- Migrationen: 43 angewendet
- Tabellen: 80, davon **79 mit RLS** (`spatial_ref_sys` = PostGIS-System, kein Risiko)
- protect_pricing + compliance_plans: Schema vollstaendig, RLS an, 7 CHECK-Constraints
- In Phase 7 live gegengeprueft: alle Spalten vorhanden, `anon` auf beiden
  Tabellen abgewiesen (HTTP 401). Beide Tabellen **leer** -- das ist gewollt,
  bis C1 entschieden ist.
- **Eine wartende Migration:** `20260826_pricing_gueltigkeit.sql`
  (`effective_from`/`effective_to`). Bewusst nicht angewendet -- Entscheidung
  C5 (Paragraph 6).

### efy care (nsfbwhpjesmathsrqkfi)

- Status: ACTIVE_HEALTHY
- Repo fuehrt 12 Migrationsdateien (3.522 Zeilen)
- **Abgleich „lokale Migrationen == angewandte Migrationen" steht aus**

---

## 3. LIVE_VERIFIZIERT (gegen Supabase geprueft)

| Track | Commit/Migration | Verifikation |
|---|---|---|
| **payment_allocation `rueckzahlung`** (neu 6B) | `20261004000000` | CHECK traegt 6 Werte inkl. `rueckzahlung`; alle 5 Altwerte erhalten; 0 Bestandsverletzer; RLS aktiv; `org_fence_payment_allocations` weiterhin RESTRICTIVE. |
| RLS 308/308 | diverse | `pg_tables.rowsecurity` = 308 |
| org_fence alle Tabellen | `0a84ade` | Live-Query bestaetigt |
| DTA Storage org-scoped | `3561ab4` | `pg_policies` zeigt org-Filter |
| Storage Bucket Hardening (7 Buckets) | `354b056` | `storage.buckets` zeigt Limits+MIME |
| CAMT Dublettensperre DB | `20261003000000` | UNIQUE INDEX existiert live |
| **ChairMatch Pricing** (Phase 7) | `20260824_pricing_schema` | Alle Spalten live vorhanden; `anon` auf beiden Tabellen HTTP 401. |
| **CAMT-Trockenlauf schreibt nichts** (Phase 7) | -- | Gegen echtes Postgres (PGlite): Zeilenzahlen vor/nach identisch, plus Gegenprobe |
| CAMT Parser App-seitig | diverse | 961-Zeilen E2E-Suite gruen |
| Anforderungskatalog DiPA | `5b7fe21` | 60 Tests, 6 pure functions |
| P1-4 Testabdeckung Welle 6 | `0e8418f` | 358 neue Tests, 15 Dateien |
| Client-Upload-Validierung | `354b056` | SVG blockiert, HEIC erlaubt |

---

## 4a. Zuletzt erledigte Arbeiten -- Phase 8.3, alle 10 Tracks (27.08.2026)

Volldokumentation: **`docs/reports/PHASE8_3_FINAL_LIVE_PILOT_PREP.md`**
Detailberichte: `PHASE8_3_TRACKS_1-5.md` -- `PHASE8_3_TRACKS_6-10.md`

**P0: Migration `20261005000000` ist NICHT LIVE.** Phase 8.2 hatte sie
faelschlich als angewendet gemeldet. Zwei unabhaengige Pruefwege widerlegen
das (`to_regclass` = NULL, PostgREST 404). Das Verifikations-Tool
`scripts/verify-pilot-send-gate.mjs` (26 Pruefpunkte) meldet 0/26.

| Track | Ergebnis |
|---|---|
| **1 -- Source of Truth** | GEKLAERT: Lock-Datei verursachte stale cache, kein echter Widerspruch |
| **2 -- Pilot Send Gate** | **P0: NICHT LIVE.** Beide Tabellen fehlen |
| **3 -- Pilot-Workflow** | 12/15 verdrahtet, 2 bewusst offen (Token→Versand, Post-Send nicht aufgerufen) |
| **4 -- /admin/pilot** | 3 Punkte nachgeruestet: Kandidat, Herkunft, Token-Zaehlung |
| **5 -- Flag-Safety** | SAFE: Variable allein kann keinen Versand ausloesen |
| **6 -- Resend** | VERSANDBEREIT: API Key gueltig, Domain verifiziert, DKIM/SPF/DMARC korrekt |
| **7 -- CAMT** | Bereit (DRY_RUN fest), C-1 weiterhin offen |
| **8 -- Business Input** | D1/D2 fehlen, Template bereit, §45a offen |
| **9 -- Tests** | 1 Fund: Idempotenz-Key hatte 0 Tests, 2 ergaenzt (15/15 gruen) |
| **10 -- Reports** | Erstellt, nicht scharf gestellt |

**3 Code-Aenderungen:** pilot-kandidat.ts, laufzeit-herkunft.ts, verify-pilot-send-gate.mjs.
**2 Befunde** (R-1 niedrig: replyTo nie gesetzt; R-2 info: kein Apex-SPF).
**1 Praezisierung:** Duplikatschutz = 3 Ebenen vor Versand (nicht 4).
**1 Fund:** Idempotenz-Key hatte 0 Tests.

**Nichts wurde scharf gestellt.** Kein Versand, kein Token, kein Flag, kein DDL.

---

## 4b. Phase 8.2, alle 12 Tracks (26.08.2026)

Volldokumentation: **`docs/reports/PHASE8_2_LIVE_PILOT_FINAL_READINESS.md`**
Detailberichte: `PHASE8_2_TRACKS_1-6.md` -- `PHASE8_2_TRACKS_7-12.md`

Phase 8.2 schliesst die Live-Pilot-Vorbereitung ab. Alle technischen Blocker
sind beseitigt, alle Sicherheitsmechanismen verifiziert.

**Kritische Statusaenderung:** Migration `20261005000000` ist jetzt **LIVE**.
Die `APPROVAL`-Phase in `/admin/pilot` steht nicht mehr auf BLOCKIERT.

**Invoice-Log-Widerspruch aufgeklaert:** Die 3 Rechnungen mit `sent_at` sind
Seed-Daten (Masseneinfuegung 2026-07-02, `versand_elektronisch = false`,
`frozen_at = NULL`). Kein echter Versand hat je stattgefunden.

| Track | Ergebnis |
|---|---|
| **1 -- Source of Truth** | SYNCHRON: HEAD=Origin=GitHub=Vercel=5019ac4, CI gruen |
| **2 -- Pilot Send Gate** | LIVE: Tabellen existieren, Constraints korrekt, 0 Zeilen, RLS aktiv |
| **3 -- Invoice Log** | Aufgeklaert: 3 Seed-Rechnungen, nie echt versendet |
| **4 -- Pilot Candidate** | BUSINESS_INPUT_REQUIRED: 0 unversendete Rechnungen |
| **5 -- Resend Preflight** | Versandkette komplett: 14 Pruefpunkte, 4 Duplikat-Sperren, fail-closed |
| **6 -- Versand-Flags** | Fail-closed: alle AUS, Code-Default AUS |
| **7 -- CAMT** | Bereit: DRY_RUN fest (Object.freeze), Post-Assertion |
| **8 -- Control Center** | 14/14 Kategorien, P0-Detailliste ergaenzt |
| **9 -- Chaos Check** | 10/10 Szenarien fail-closed, DB-UNIQUE-Riegel |
| **10 -- Mac Storage** | Bereinigung durchgefuehrt |
| **11 -- ChairMatch** | Template erstellt, blockiert Alltagsengel NICHT |
| **12 -- DATEV** | Format-Validierung gefixt (D-3), D1/D2 fehlen weiterhin |

**3 Code-Aenderungen:** Format-Validierung DATEV-Config, P0-Detailtabelle in
Pilot-UI, VersandSperreDetail-Interface. **7 neue Befunde** (1 MITTEL gefixt,
1 MITTEL Beobachtung, 5 GERING).

**Nichts wurde scharf gestellt.** Keine echte Rechnung versendet, keine Mahnung,
keine Bankdatei, keine Zahlung, kein Flag aktiviert, keine Preise gesetzt.

---

## 4c. Phase 8, alle 10 Tracks (26.08.2026)

Volldokumentation: **`docs/reports/PHASE8_FIRST_REAL_PILOT.md`**
Detailberichte: `PHASE8_TRACKS_1-4.md` -- `PHASE8_TRACKS_5-10.md`

Phase 7 endete mit dem Status `READY_FOR_FIRST_CONTROLLED_REAL_TRANSACTION`.
Phase 8 baut darauf auf und liefert die Werkzeuge fuer den **begleiteten
Erstbetrieb** -- nicht die Vorstufen, die zeigen, was passieren wuerde
(Phase 7), sondern die Kontrollebene, die den Erstbetrieb **begleitet,
begrenzt und nachprueft**.

**Nichts wurde scharf gestellt.** Keine Rechnung versendet, keine Mahnung
verschickt, keine Bankdatei importiert, keine Zahlung gebucht, keine
Migration angewendet, kein Preis festgelegt, keine Beraternummer erfunden.

| Track | Ergebnis |
|---|---|
| **1 -- Pre-Pilot-Snapshot** | Umgebungs-Snapshot mit sieben Abschnitten. Jeder Punkt traegt seine Herkunft (`gemessen`/`gemeldet`/`dokumentiert`/`nicht_messbar`). Kein `dokumentiert`- oder `nicht_messbar`-Punkt darf gruen erscheinen. Der wertvollste Punkt: der Commit-Abgleich -- weichen die drei Werte ab, beschreibt jede folgende Aussage einen anderen Stand. Geheimnisse stehen nie im Bericht. |
| **2 -- Rechnungs-Pilot** | Fuehrt den bestehenden 16-Punkte-Preflight vollstaendig aus, legt drei Pilot-Pruefungen darueber: zwei zusaetzliche Doppelversand-Beine und die offene Versandsperre. Fail-closed und strenger als im Regelbetrieb. Kann **nicht versenden** (Regressionstest auf Import-Zeilen und Datenbankaufrufe). |
| **3 -- Einmal-Freigabe** | `FIRST_REAL_INVOICE_APPROVED = false` (Konstante). Drei DB-Riegel (UNIQUE-Teilindizes). Der Verbrauch ist ein bedingtes UPDATE, kein Lesen-dann-Schreiben. Reihenfolge: erst verbrauchen, dann senden. Verdrahtung in den Versandweg bewusst nicht gebaut. **Migration wartet auf SQL-Editor.** |
| **4 -- Nachpruefung** | Acht Pruefpunkte gegen einen erfolgten Versand. Bei jeder Abweichung: P0-Sperre, Entwertung aller offenen Freigaben, Audit. Heilt nichts -- setzt nichts nach, loescht nichts. |
| **5 -- CAMT-Pilot** | Fest auf DRY_RUN (`PILOT_QUELLE` ist `Object.freeze`). Bricht ab, falls der Preflight trotz fester Quelle `buchend` meldet. Piloturteil strenger als `freigabefaehig`. **Befund F-1:** Datei-interne Dublette nicht erkannt (DB faengt, aber mit kryptischem Fehler). |
| **6 -- Zuordnungs-Gate** | Zehn Punkte fuer genau eine Zahlung-Rechnung-Kombination. UUID-Token mit 15-Minuten-Ablauf. Vollstaendige Wiederholungspruefung bei Einloesung. Token-Ausstellung bewusst nicht als Route veroeffentlicht. |
| **7 -- Mahn-Trockenlauf** | Vier Urteile statt zwei (`NOT_ELIGIBLE`/`ELIGIBLE`/`NEEDS_REVIEW`/`BLOCKED`). Ruft `pruefeMahnbarkeit()` -- dieselbe Pruefung wie `advanceDunning()`. **Befund F-2:** Ruecklastschrift umgeht das Gate. Bericht nennt Summe der Mahngebuehren, die heute gebucht wuerden. |
| **8 -- Abstimmung** | Neun Stufen. Prueft die **Naehte** zwischen den Stufen. 39 Tests auf echtem Postgres. **Befund F-3:** `zuordnung_ohne_betrag` ist toter Zweig. DATEV-Stufe prueft nur Abdeckung, nicht Inhalt. |
| **9 -- Business Inputs** | **Rechnungspilot blockiert: NEIN.** Keine offene Geschaeftsangabe liegt auf dem Rechnungsweg (Regressionstest auf die 5 Dateien). D1/D2 blockieren den DATEV-Export. |
| **10 -- Phasenkette** | Neun Phasen (`PRE-FLIGHT` bis `AUDIT`) mit Status, Begruendung, naechstem Schritt und Gate. Keine kritische Aktion ohne Backend-Gate. `RECONCILIATION` ist niemals `VERIFIED` (die Abstimmung wird eigens gerechnet). `APPROVAL` blockiert, solange Migration nicht angewendet. |

**3 neue Befunde gefunden** (F-1 bis F-3, alle Beobachtungen, keine P1/P2):
Datei-interne CAMT-Dublette nicht erkannt, Ruecklastschrift umgeht das
Mahn-Gate, toter Abstimmungszweig.

**2 Selbstkorrekturen** am eigenen neuen Code (A-1, A-2): defensives Lesen
fuer `gesetzt_am`, Regressionstest auf Import-Zeilen statt Volltext.

---

## 4d. Phase 7 -- alle 8 Tracks (25./26.08.2026)

Volldokumentation: **`docs/reports/PHASE7_MONEY_PATH_PILOT.md`**
Detailberichte: `PHASE7_TRACKS_1-4.md` -- `PHASE7_TRACKS_5-8.md`

Phase 7 baute fuer jeden Geldpfad eine Vorstufe, die das Ergebnis zeigt,
**ohne es auszuloesen**, und pruefte anschliessend, was passiert, wenn mitten
im Vorgang etwas abbricht.

| Track | Ergebnis |
|---|---|
| **1 -- Versand-Schalter** | Zentrale Auswertung, keine Route liest `process.env` direkt. Umgebungstrennung gehaertet. Beide Flags ungesetzt. |
| **2 -- CAMT-Preflight** | `CAMT_IMPORT_MODE`, Standard DRY_RUN. 6 Klassifikationen mit Rangfolge. Gegen echtes Postgres belegt, dass DRY_RUN nichts schreibt. |
| **3 -- Rechnungs-Preflight** | 16-Punkte-Checkliste, fail-closed ohne stillen Standardwert. |
| **4 -- Mahn-Safety-Gate** | 10 Sperren an einer Stelle (`pruefeMahnbarkeit()`). |
| **5 -- DATEV Reality Check** | Zwei Pruefebenen: vor dem Formatieren und auf dem Artefakt. Fail-closed vor dem Storage-Upload. |
| **6 -- ChairMatch Pricing** | Schema + RLS live verifiziert. Migration vorbereitet, nicht angewendet. |
| **7 -- Pilot Control Center** | `/admin/pilot` Abschnitt 3. Keine Schreiboperation. Jede Abfrage org-gefiltert. |
| **8 -- Chaos Tests** | 33 Tests gegen Abbruch mitten im Geldvorgang. **Ein P1-Befund** gefunden und gefixt (C-1). |

**7 neue Produktionsbefunde gefunden und behoben** (Paragraph 5). Die zwei
schwersten: ueber `POST /api/billing/dunning/advance` liefen alle Mahnstufen
in Sekunden durch (M-4), und ein halb gebuchter Zahlungseingang fuehrte zu
einer Mahnung an einen zahlenden Kunden (C-1).

---

## 4e. Phase 6B (25.08.2026)

Volldokumentation: **`docs/reports/PHASE6B_TECHNICAL_PROGRESS.md`**

Track 1: Migration `payment_allocation_rueckzahlung` -- LIVE angewendet und
verifiziert. Track 2: Geldrundung -- 21 Stellen umgestellt, `centRunden()`
eingefuehrt, zwei echte Bugs gefunden. Track 3: DATEV + Tarif-Verifizierung
auf PGlite -- Shim erweitert, zwei neue Suiten, zwei echte Bugs gefunden.

---

## 5. Gefundene und behobene Produktionsbefunde

**30 Befunde insgesamt** ueber Phasen 6A--8.2 gefunden und behoben bzw. benannt.

### Phase 8.2 -- 7 Befunde (1 gefixt, 6 Beobachtungen)

| # | Track | Befund | Schwere |
|---|---|---|---|
| **C-1** | 7 | Cross-Tenant-Check fehlt im Live-Import-Route (Preflight prueft, Live-Route nicht) | MITTEL / Beobachtung |
| **D-3** | 12 | Format-Validierung Beraternummer/Mandantennummer fehlte | MITTEL / **GEFIXT** |
| **C-2** | 7 | CdtDbtInd-Fallback auf CRDT bei fehlendem Tag | GERING / Beobachtung |
| **C-3** | 7 | Sts-Fallback auf BOOK bei fehlendem Tag | GERING / Beobachtung |
| **C-4** | 7 | CAMT-Freigabe global (env), nicht pro Datei | GERING / Beobachtung |
| **D-1** (P8.2) | 12 | Windows-1252 Header deklariert, UTF-8 erzeugt | GERING / Offen |
| **D-2** (P8.2) | 12 | Kein Audit-Trail bei DATEV-Config-Aenderungen | GERING / Offen |

### Phase 8 -- 3 Befunde + 2 Selbstkorrekturen

| # | Track | Befund | Schwere |
|---|---|---|---|
| **F-1** | 5 | CAMT: Datei-interne Dublette nicht erkannt. DB-UNIQUE faengt, aber mit kryptischem `23505`. | Beobachtung |
| **F-2** | 7 | Ruecklastschrift umgeht das Mahn-Gate. Setzt Mahnstufe direkt, ohne `advanceDunning()`. | Beobachtung |
| **F-3** | 8 | `zuordnung_ohne_betrag` ist toter Zweig (DB CHECK constraint). | Beobachtung |
| **A-1** | 1--4 | `gesetzt_am` fehlte -- echte Sperre als „Quelle unlesbar" gemeldet. Gefixt. | P3 Diagnose |
| **A-2** | 1--4 | Regressionstest scannte Volltext statt Import-Zeilen. Gefixt. | Test |

### Phase 7 -- 7 Befunde, alle gefixt

| # | Track | Befund | Schwere |
|---|---|---|---|
| **C-1** | 8 | Halb gebuchter Zahlungseingang: verwaiste Zuordnungszeile, Kunde wird trotz Zahlung gemahnt. | **P1 Geld** |
| **M-4** | 4 | Alle Mahnstufen liefen ueber `POST .../advance` in Sekunden durch, samt aller Mahngebuehren. | **P1 Geld** |
| **P-1** | 3 | Schema-Drift im Preflight: `clients.deleted_at` existiert nicht. | **P1 Funktion** |
| **P-2** | 3 | Punkt 11 haette jeden automatischen Erstversand blockiert (PDF beim Erstversand nie vorhanden). | P2 Funktion |
| **M-1** | 4 | Verworfene Gutschrift blockierte Mahnung fuer immer (Soft-Delete nicht gefiltert). | P2 Geld |
| **F-1** (P7) | 1 | `letzterFlagZustand()` fing keine geworfenen Ausnahmen. | P2 Funktion |
| **M-3** | 4 | `amount_paid_cents` nie aktualisiert; Mahnanzeige dauerhaft falsch. | P3 Anzeige |

### Phase 6B -- 4 Befunde, alle gefixt

| # | Befund | Schwere |
|---|---|---|
| **G-1** | `parseBetragZuCent('12EUR34')` ergab 1.234,00 EUR -- hundertfacher Betrag. | **P1 Geld** |
| **D-1** | CSV-Injection ueber die Debitorennummer im DATEV-Export. | **P1 Sicherheit/Geld** |
| **G-2** | `parseFloat()` im Leistungsnachweis: Muell-Suffix still, `NaN` als `null`. | P2 Funktion |
| **D-2** | `getKonto()` griff doppelt zu; fehlende Fehlermeldung bei unbekanntem Kontenrahmen. | P3 Diagnose |

### Phase 6A -- 7 Befunde, alle gefixt

| # | Befund | Schwere |
|---|---|---|
| **B-1** | `listMandates()`: falsche Spalte `client_number` (heisst `customer_number`). | Funktion |
| **B-2** | `createMandate()`: kein `organization_id`-Filter (Cross-Tenant SEPA-Mandat). | Sicherheit |
| **B-3** | `createSepaBatch()`: Entwuerfe/Stornos wurden eingezogen. | Geld |
| **B-4** | Keine Duplikatsperre: dieselbe Rechnung in zwei Sammelauftraegen. | Geld |
| **R-1** | `allocation_type = 'rueckzahlung'` fehlte im CHECK -- in 6B vollstaendig geschlossen. | Geld |
| **X-1** | `correction_of`-Nachschlag ohne Mandantenfilter in XRechnung. | Sicherheit |
| **M-1** (P6A) | Upsert auf `monthly_closings` ohne `organization_id`. | Mandanten |

Details: `PHASE6A_TECHNICAL_PROGRESS.md`, `PHASE6B_TECHNICAL_PROGRESS.md`,
`PHASE7_MONEY_PATH_PILOT.md`, `PHASE8_FIRST_REAL_PILOT.md`.

---

## 6. EXTERN_BLOCKIERT und BUSINESS_INPUT_REQUIRED

**Alles, was einen echten Geldvorgang noch verhindert, steht in diesem
Abschnitt.** Nichts davon ist ein Code-Problem.

### EXTERN_BLOCKIERT

| # | Was | Wer/Wo |
|---|---|---|
| E1 | `RECHNUNGSVERSAND_AUTOMATISCH` nicht gesetzt | Vercel Environment Variables -- nur `Production`, nicht „All Environments". Seit Phase 7 nur noch im Produktionslauf wirksam. |
| E2 | `MAHNVERSAND_AUTOMATISCH` nicht gesetzt | dito; erst sinnvoll nach einem belegten Rechnungsversand |
| E2b | `CAMT_IMPORT_MODE` nicht auf `LIVE` | fail-closed. Ohne die Variable prueft der Import die Datei, bucht aber nichts. |
| E3 | Erster CAMT-Import nie produktiv gelaufen | Braucht echte Bankdatei. **Vorstufe: `POST /api/pilot/camt-dry-run?format=text`** |
| E4 | Erster Rechnungsversand nie produktiv | `invoice_email_log` = 0. **Vorstufe: `GET /api/billing/invoices/<id>/pilot?format=text`** |
| E5 | Paragraph 45a Bayern Antrag unvollstaendig | Landesamt fuer Pflege |
| **E6** | **Migration `20261005000000_pilot_send_gate.sql` NICHT angewendet** | Supabase SQL-Editor (DDL). Phase 8.2 meldete faelschlich LIVE; Phase 8.3 widerlegt. Verifikation: `scripts/verify-pilot-send-gate.mjs` (26 Punkte). **Erster Schritt vor allem anderen.** |

### BUSINESS_INPUT_REQUIRED

#### DATEV -- Kanzlei-Vorgaben

Der Validator fuehrt die Liste selbst (`BERATER_VORGABE_ERFORDERLICH`), damit
sie nicht in einem Bericht verschwindet.

| # | Vorgabe | Wirkung, solange offen |
|---|---|---|
| **D1** | **Beraternummer** | **Export bricht ab**, bevor irgendetwas erzeugt wird |
| **D2** | **Mandantennummer** | dito |
| D3 | Kontenrahmen SKR03/SKR04 -- *bestaetigt* | Standardwert wird benutzt, ist aber unbestaetigt |
| D4 | Erloeskonto steuerfreie Pflege (Paragraph 4 Nr. 16 UStG) | dito |
| D5 | Sachkontenlaenge (4 oder 5) | dito |
| D6 | Wirtschaftsjahresbeginn | dito |

> D3--D6 tragen heute Standardwerte aus dem SKR03/SKR04-Kontenrahmen. **Erfunden
> ist keiner davon, bestaetigt aber auch keiner.** Ob die Kontonummern die
> *richtigen* sind, kann kein Code wissen.

#### ChairMatch -- Preise

| # | Frage |
|---|---|
| **C1** | **Welche Betraege?** `protect_pricing` und `compliance_plans` sind strukturell fertig und **leer**. Befuellung ueber `supabase/seed/pricing.seed.template.sql`. |
| C2 | Wird Protect fuer alle vier Risikostufen verkauft oder nur HIGH/VERY_HIGH? |
| C3 | Netto oder brutto? |
| C4 | Bleibt es bei `one_time` / `yearly` / `monthly`? |
| **C5** | **Soll `20260826_pricing_gueltigkeit.sql` angewendet werden?** Vor dem ersten Vertrag billig, danach teuer. |

#### Alltagsengel -- Betrieb

| # | Was | Details |
|---|---|---|
| B2 | **Geldpfade Erstbetrieb** | `payments` = 0, `camt_imports` = 0, `invoice_email_log` = 0 -- System gebaut, getestet, gegen Abbruch gehaertet, aber **nie mit echtem Geld gelaufen** |
| B3 | **3x Signaturlaufzeit 7 Tage entscheiden** | `lib/upload-document.ts`, `lib/upload-service-proof.ts`, `app/api/native/leistungsnachweis-upload/route.ts`. Empfehlung: Re-Signier-Route fuer `documents`. |
| B4 | **`getOposListe()` zeigt Entwuerfe im Forderungsbestand** | Mahnlauf nicht betroffen (waehlt selbst). Test haelt Ist-Zustand fest. |

---

## 7. Echte offene technische Probleme

**Kein technischer P0/P1 im Alltagsengel-Repo offen.** T-1 bis T-4 des
6A-Handoffs sind erledigt; die Phase-7- und Phase-8-Befunde sind saemtlich
behoben oder als benannte Grenzen dokumentiert (Paragraph 5).

| # | Problem | Prioritaet |
|---|---|---|
| **T-0** | **`npm run check:schema-drift` ist weder in CI noch im Precommit-Guard verdrahtet.** Phase 7 zeigte mit P-1, warum das zaehlt. | **P2** |
| **T-1** | 30 der 36 ungetesteten `lib/`-Module stehen noch aus. Drei Phasen in Folge haben gezeigt, was dort liegt. | P2 |
| **T-2** | DATEV-Storage-Schicht ungetestet (PGlite bildet Storage nicht ab). Phase-7-Validator sitzt davor. | benannte Grenze |
| **T-2b** | Die erste echte DATEV-CSV sollte jemand oeffnen und die Spaltenausrichtung ansehen (Befund D-1). | Erstbetrieb |
| **T-3** | `no_overlapping_tariffs` unter PGlite unbeweisbar (kein `btree_gist`). Nur gegen echtes Postgres pruefbar. | benannte Grenze |
| **T-4** | `tarif-verifizierung-service.ts` ODER-Zweig fuer `organization_id.is.null`. Kein Leck. | P3 / Beobachtung |
| **T-5** | Rueckfall in `ruecklastschrift.ts:185` ist toter Zweig. Bewusst stehen gelassen. | keine |
| P8-2 | `oeffneAllocationGate()` / `loeseAllocationGateEin()` haben keine Route. Bewusst -- freizulegen mit dem begleiteten Erstlauf. | Erstbetrieb |
| P8-3 | Zuordnungs-Token nicht atomar gegen zwei gleichzeitige Einloesungen. Riegel bleibt UNIQUE. | benannte Grenze |
| P8-4 | DATEV-Abstimmung prueft nur Abdeckung, nicht Inhalt (keine Tabelle `datev_buchungen`). | benannte Grenze |
| **T-6** | efy care: Buchung schreibt nicht in die DB; Konto-Loeschung ist ein TODO (DSGVO Art. 17). | **P1** (Fremdrepo) |
| **T-7** | efy care: Prod-Migrationsstand, RLS live, Edge-Function-Deploy und Secrets unverifiziert. | **P1** (Fremdrepo) |
| **T-8** | efy care: 30 HTTP-Isolationstests uebersprungen. Braucht Shadow-Supabase-Instanz. | P2 (Fremdrepo) |

---

## 8. Naechster sinnvoller Schritt

**Phase 8.2 ist abgeschlossen. Der naechste Schritt ist eine
Geschaeftsentscheidung, keine technische Aufgabe.**

### Reihenfolge fuer den begleiteten Erstbetrieb

1. **Migration `20261005000000` im Supabase-SQL-Editor anwenden.** Danach
   `scripts/verify-pilot-send-gate.mjs` ausfuehren -- muss 26/26 zeigen.
2. **`/admin/pilot` Abschnitt 4 oeffnen.** Die Phasenkette zeigt, wo der
   Erstbetrieb steht. Ein `--` statt einer Zahl heisst „nicht messbar".
3. **`GET /api/pilot/snapshot?format=text`** einmal ansehen -- Zeile 1 muss
   `RUHEND` sagen.
4. **Echte Bankdatei durch `POST /api/pilot/camt-dry-run?format=text`.**
   Erst bei `PILOT_TAUGLICH` den naechsten Schritt erwaegen.
5. **`GET /api/billing/invoices/<id>/pilot?format=text`** auf eine echte
   Rechnung. Steht dort `READY_FOR_SEND`, ist der Beleg ein Kandidat.
6. **`RECHNUNGSVERSAND_AUTOMATISCH` setzen** -- nur `Production`, nicht
   „All Environments". Danach **ein** echter Versand, anschliessend
   `pruefeNachVersand()` und `invoice_email_log` gegenpruefen.
7. **`GET /api/pilot/mahnwesen?format=text`** vor jeder Diskussion ueber
   `MAHNVERSAND_AUTOMATISCH`. Die Zeile „Mahngebuehren, die heute gebucht
   wuerden" ist die Zahl, um die es geht.
8. **`GET /api/pilot/abstimmung?format=text`** als Ausgangsaufnahme -- jetzt,
   solange die Kette noch leer ist.
9. **Erster begleiteter CAMT-Import** auf dem gefixten Rundungsstand.
10. **Erster SEPA-Sammelauftrag** -- gegen die 6A-Fixes B-3/B-4
    gegengeprueft.
11. **Erste DATEV-Ausleitung:** D1/D2 von der Kanzlei holen, CSV erzeugen,
    **oeffnen** und Spaltenausrichtung ansehen (T-2b).
12. **`MAHNVERSAND_AUTOMATISCH`** zuletzt, erst nach einem belegten
    Rechnungsversand.

> **Nach jedem Schritt gegenpruefen, bevor der naechste kommt.** Der Sinn der
> Vorstufen ist, dass ein Fehler beim ersten Vorgang auffaellt und nicht beim
> fuenfzigsten.

### Parallel, ohne externe Abhaengigkeit

- **T-0** -- `check:schema-drift` in CI und Precommit-Guard verdrahten.
- **T-1** -- die verbleibenden 30 ungetesteten `lib/`-Module.

### Getrennt zu entscheiden

- **ChairMatch C5** -- Gueltigkeitsmigration anwenden oder bewusst nicht. Die
  Entscheidung ist **jetzt** billig, nach dem ersten Vertrag nicht mehr.
- **efy care T-6** -- kein Testthema, sondern ein Produktentscheid.

---

## 9. Relevante Dateipfade

| Zweck | Pfad |
|---|---|
| **Phase-8.3-Gesamtbericht** | `docs/reports/PHASE8_3_FINAL_LIVE_PILOT_PREP.md` |
| Phase-8.3-Detailbericht Tracks 1--5 | `docs/reports/PHASE8_3_TRACKS_1-5.md` |
| Phase-8.3-Detailbericht Tracks 6--10 | `docs/reports/PHASE8_3_TRACKS_6-10.md` |
| Send-Gate-Verifikation (26 Punkte) | `scripts/verify-pilot-send-gate.mjs` |
| Pilot-Kandidat | `lib/pilot/pilot-kandidat.ts` |
| Laufzeit-Herkunft | `lib/pilot/laufzeit-herkunft.ts` |
| **Phase-8.2-Gesamtbericht** | `docs/reports/PHASE8_2_LIVE_PILOT_FINAL_READINESS.md` |
| Phase-8.2-Detailbericht Tracks 1--6 | `docs/reports/PHASE8_2_TRACKS_1-6.md` |
| Phase-8.2-Detailbericht Tracks 7--12 | `docs/reports/PHASE8_2_TRACKS_7-12.md` |
| ChairMatch Pricing Template | `docs/chairmatch-pricing-template.md` |
| **Phase-8-Gesamtbericht** | `docs/reports/PHASE8_FIRST_REAL_PILOT.md` |
| Phase-8-Detailbericht Tracks 1--4 | `docs/reports/PHASE8_TRACKS_1-4.md` |
| Phase-8-Detailbericht Tracks 5--10 | `docs/reports/PHASE8_TRACKS_5-10.md` |
| Phase-7-Gesamtbericht | `docs/reports/PHASE7_MONEY_PATH_PILOT.md` |
| Phase-7-Detailbericht Tracks 1--4 | `docs/reports/PHASE7_TRACKS_1-4.md` |
| Phase-7-Detailbericht Tracks 5--8 | `docs/reports/PHASE7_TRACKS_5-8.md` |
| Phase-6B-Fortschrittsbericht | `docs/reports/PHASE6B_TECHNICAL_PROGRESS.md` |
| Phase-6A-Fortschrittsbericht | `docs/reports/PHASE6A_TECHNICAL_PROGRESS.md` |
| Geldrundung-Durchsichtsprotokoll | `docs/MONEY_ROUNDING_REVIEW_COMPLETE.md` |
| DATEV-/Tarif-Testbericht | `docs/DATEV_TARIF_PGLITE_TESTS.md` |
| Pre-Pilot-Snapshot | `lib/pilot/pre-pilot-snapshot.ts` |
| Rechnungs-Pilot | `lib/pilot/rechnung-pilot.ts` |
| Einmal-Freigabe (Send Gate) | `lib/pilot/send-gate.ts` |
| Nachpruefung | `lib/pilot/post-send-verification.ts` |
| CAMT-Pilot | `lib/pilot/camt-pilot.ts` |
| Zuordnungs-Gate | `lib/pilot/allocation-gate.ts` |
| Mahn-Trockenlauf | `lib/pilot/mahnwesen-dryrun.ts` |
| Abstimmung | `lib/pilot/reconciliation.ts` |
| Business Inputs | `lib/pilot/business-inputs.ts` |
| Phasenkette | `lib/pilot/pilot-phasen.ts` |
| Control Center | `lib/pilot/control-center.ts` |
| Migration (**wartet auf Apply**) | `supabase/migrations/20261005000000_pilot_send_gate.sql` |
| Rollback dazu | `supabase/migrations/20261005000001_rollback_pilot_send_gate.sql` |
| Versand-Schalter | `lib/config/versand-flags.ts` + `versand-flags-audit.ts` |
| CAMT-Betriebsart + Preflight | `lib/billing/camt/camt-modus.ts`, `camt-preflight.ts`, `camt-preflight-bericht.ts` |
| Rechnungs-Preflight (16 Punkte) | `lib/billing/preflight/rechnung-preflight.ts` |
| Mahn-Safety-Gate (10 Sperren) | `lib/billing/dunning/mahn-safety-gate.ts` |
| DATEV-Validator (2 Pruefebenen) | `lib/billing/datev/datev-validator.ts` |
| Zahlungszuordnung (Befund C-1) | `lib/billing/core/payments.ts` |
| Chaos-Testwerkzeug | `__tests__/chaos/helpers/chaos-client.ts` |
| Pilot-Routen (lesend) | `app/api/pilot/snapshot/route.ts`, `app/api/pilot/camt-dry-run/route.ts`, `app/api/pilot/mahnwesen/route.ts`, `app/api/pilot/abstimmung/route.ts`, `app/api/pilot/zuordnung-pruefung/route.ts` |
| Freigabe-Route | `app/api/billing/invoices/[id]/freigabe/route.ts` |
| Pilot-Bericht-Route | `app/api/billing/invoices/[id]/pilot/route.ts` |
| **Phase-8.1-Preflight** | `docs/reports/PHASE8_1_LIVE_PILOT_PREFLIGHT.md` |
| Preflight-Routen (Phase 7) | `app/api/billing/camt/preflight/route.ts`, `app/api/billing/invoices/[id]/preflight/route.ts` |
| ChairMatch: Pruefskript | `/Users/work/chairmatch/scripts/verify-pricing-schema.mjs` |
| ChairMatch: Migration (NICHT angewendet) | `/Users/work/chairmatch/supabase/migrations/20260826_pricing_gueltigkeit.sql` |
| Deploy-Skript | `./deploy.sh` |
| Rollback-Skript | `./scripts/rollback.sh` |
| Precommit-Guard | `./scripts/precommit-guard.sh` |
| Forbidden-Strings | `scripts/forbidden-strings.json` |
| Geldrundung (zentral) | `lib/geld.ts` |
| PGlite-Shim | `__tests__/e2e/helpers/pglite-supabase.ts` |

---

## 10. ENV-Variablen (Namen, KEINE Werte)

### Alltagsengel (Vercel)
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`
- `RECHNUNGSVERSAND_AUTOMATISCH` -- NICHT GESETZT
- `MAHNVERSAND_AUTOMATISCH` -- NICHT GESETZT
- `CAMT_IMPORT_MODE` -- NICHT GESETZT (Trockenlauf, fail-closed)
- `PILOT_ERSTVERSAND_FREIGEGEBEN` -- NICHT GESETZT
- `VERSAND_NICHT_PRODUKTION_ERLAUBT` -- nicht gesetzt, gehoert NICHT in die Produktion
- `CRON_SECRET`

### ChairMatch (Vercel)
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`

### efy care (Supabase Function Secrets -- Setzstatus ungeprueft)
- `ANTHROPIC_API_KEY`, `OCR_ENABLED`
- `STRIPE_PRICE_STARTER` / `_PRO` / `_SCALE`
- `SHADOW_SUPABASE_URL`, `SHADOW_SUPABASE_ANON_KEY` (CI, fuer die 30 Skips)

---

---

## 11. Phase 8.3 -- Final Live-Pilot Preparation (27.08.2026)

| Pruefpunkt | Phase 8.2 | Phase 8.3 |
|---|---|---|
| HEAD = origin/main | `d534383` | `aa50d11` + Tracks 6-10 |
| CI | GRUEN | GRUEN |
| `pilot_send_gate` Tabelle | Faelschlich LIVE gemeldet | **NICHT LIVE** (P0) |
| Resend API Key | ungeprüeft | **GUELTIG** (HTTP 200) |
| Domain/DKIM/SPF/DMARC | dokumentiert | **LIVE VERIFIZIERT** |
| Idempotenz-Key Tests | 0 | **2 ergaenzt (15/15)** |
| Flag-Safety | -- | **SAFE** |
| Pilot-Kandidat UI | fehlte | **nachgeruestet** |
| Workflow-Verdrahtung | -- | 12/15 (2 bewusst, 1 unbeabsichtigt) |

**REAL_ACTIONS_EXECUTED: NONE**

---

## 11b. Phase 8.2 -- Live Pilot Final Readiness (26.08.2026)

Abschliessende Pruefung aller 12 Tracks. Vollbericht:
`docs/reports/PHASE8_2_LIVE_PILOT_FINAL_READINESS.md`

| Pruefpunkt | Phase 8.1 | Phase 8.2 |
|---|---|---|
| HEAD = origin/main = GitHub = Vercel | `ae080be` | `5019ac4` -- **identisch** |
| CI | 4/4 GRUEN | **GRUEN** |
| `pilot_send_gate` Tabelle | existiert NICHT | **LIVE** (0 Zeilen, RLS aktiv) |
| `pilot_versand_sperre` Tabelle | existiert NICHT | **LIVE** (0 Zeilen, RLS aktiv) |
| `payments` | 0 | 0 |
| `camt_imports` | 0 | 0 |
| `invoice_email_log` | 0 | 0 (Widerspruch aufgeklaert) |
| `payment_allocations` | 0 | 0 |
| Rechnungskandidaten | 0 | 0 (3 Seed, neue Rechnung noetig) |
| Versand-Schalter | alle AUS | alle AUS |
| CAMT-Modus | DRY_RUN | DRY_RUN (Object.freeze) |
| FIRST_REAL_INVOICE_APPROVED | false | false |
| Chaos-Tests | -- | **10/10 verifiziert** |
| Control Center | -- | **14/14 Kategorien** |
| DATEV Format-Validierung | -- | **hinzugefuegt** |

**REAL_ACTIONS_EXECUTED: NONE**

*Aktualisiert 27.08.2026 nach Phase 8.3 (Final Live-Pilot Preparation) -- Alltagsengel*
