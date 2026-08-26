# MASTER HANDOFF — Stand 26.08.2026, nach Phase 7 (Tracks 1–8, abgeschlossen)

Dieses Dokument ist die einzige Wahrheitsquelle für den technischen Zustand
beider Produkte. Jede neue Session liest zuerst diese Datei.

> ## Gesamtstatus: `READY_FOR_FIRST_CONTROLLED_REAL_TRANSACTION`
>
> **Technisch ist nichts mehr offen, was einen ersten echten Geldvorgang
> verhindert.** Kein P0 und kein P1 im Alltagsengel-Repo. CI grün auf `0ed44c8`
> (beide Jobs), Typecheck 0 Fehler, 7.838 Tests grün, keine wartende Migration.
>
> **Was dieser Status bedeutet:** **Eine** echte Transaktion je Geldpfad darf
> jetzt stattfinden — begleitet, einzeln, mit Gegenprüfung danach. Für jeden der
> drei Pfade gibt es eine Vorstufe, die das Ergebnis zeigt, **ohne es
> auszulösen** (CAMT-Trockenlauf, Rechnungs-Preflight, Mahn-Safety-Gate) und
> eine Betriebsanzeige, die zeigt, was danach liegen geblieben ist
> (`/admin/pilot` Abschnitt 3). Der Erstbetrieb beginnt damit — **nicht** mit
> dem Umlegen eines Schalters.
>
> **Was er ausdrücklich NICHT bedeutet:**
> - **Keine Freigabe für unbeaufsichtigten Regelbetrieb.** Ein begleiteter
>   Einzelvorgang ist etwas anderes als ein Automat, der nachts läuft.
> - **`payments` = 0, `camt_imports` = 0, `invoice_email_log` = 0.** Das System
>   ist gebaut, getestet und gegen Abbruchszenarien gehärtet — aber **nie mit
>   echtem Geld gelaufen.** Kein Test ersetzt diesen Beleg.
> - **Kein Schalter ist umgelegt.** Beide Versand-Flags sind ungesetzt,
>   `CAMT_IMPORT_MODE` steht auf DRY_RUN. Das Umlegen ist eine
>   Geschäftsentscheidung (§6, `docs/ENV_KONFIGURATION.md` §1).
> - **Der DATEV-Export ist ohne D1/D2 nicht lauffähig** — Berater- und
>   Mandantennummer fehlen, der Export bricht vorher ab (§6).
>
> **Für efy care (Fremdrepo) gilt dieser Status ausdrücklich nicht** — dort
> stehen zwei P1 offen (§7 T-6/T-7).

---

> ## ⚠️ NACHTRAG 26.08.2026 — Phase 8 läuft, dieses Dokument beschreibt Phase 7
>
> Der Fließtext unten (§§ 0–10) ist auf dem Stand **nach Phase 7** und wurde
> für Phase 8 **nicht** neu geschrieben. Er ist damit älter als der deployte
> Stand — insbesondere die Commit-Anker in §0.
>
> **Für Phase 8 gelten diese beiden Berichte:**
>
> | Bericht | Inhalt |
> |---|---|
> | `docs/reports/PHASE8_TRACKS_1-4.md` | Pilot-Snapshot, Rechnungs-Pilotprüfung, Einmal-Freigabe für den Erstversand, Nachprüfung nach Versand — Commit `f0d14c2` |
> | `docs/reports/PHASE8_TRACKS_5-10.md` | CAMT-Pilot (fest DRY_RUN), Zuordnungs-Gate, Mahn-Trockenlauf, Money-Path-Abstimmung, Business Inputs, Control-Center-Phasenkette |
>
> **Was sich am Gesamtstatus NICHT geändert hat:** `payments` = 0,
> `camt_imports` = 0, `invoice_email_log` = 0. Kein Schalter ist umgelegt.
> Phase 8 hat ausschließlich Vorstufen und Anzeigen gebaut — keine echte
> Transaktion, kein echter Versand, keine Buchung.
>
> **Neu offen:** Migration `20261005000000_pilot_send_gate.sql` wartet auf den
> Supabase-SQL-Editor. Sie ist die erste wartende Migration seit Phase 6B; ohne
> sie ist die Einmal-Freigabe für den Erstversand nicht benutzbar, und die
> `APPROVAL`-Phase in `/admin/pilot` steht auf BLOCKIERT (mit korrekter
> Begründung).
>
> **Der nächste vollständige Handoff schreibt §§ 0–10 neu.** Bis dahin gilt:
> Phase-7-Aussagen unten sind weiterhin richtig, aber nicht mehr vollständig.

---

## 0. Commit-Anker

Die drei Werte müssen **identisch** sein. Weichen sie ab, beschreibt dieses
Dokument nicht den Stand, der tatsächlich deployed ist — dann zuerst
`git log`/`git fetch` prüfen, bevor irgendeiner Aussage unten geglaubt wird.

| Anker | Bedeutung | Wert |
|---|---|---|
| **CODE_HEAD** | lokaler `main`-HEAD | `5ac312b` |
| **HANDOFF_COMMIT** | Commit, in dem dieses Dokument zuletzt geschrieben wurde | `5ac312b` |
| **ORIGIN_MAIN** | `origin/main` nach `deploy.sh` (Remote-Wahrheit) | `5ac312b` |

Prüfbefehl:

```bash
git rev-parse HEAD && git rev-parse origin/main
```

> **Zur Lesart der Anker.** Ein Dokument kann den Hash des Commits, der es
> selbst enthält, nicht im Voraus nennen. Die Anker werden deshalb im
> unmittelbar folgenden `docs:`-Commit nachgezogen. **`HEAD` genau einen
> `docs:`-Commit vor diesen Ankern ist erwartet und keine Drift.** Alles
> darüber hinaus — insbesondere jeder Commit, der Code anfasst — bedeutet:
> dieses Dokument ist älter als der deployte Stand.

**Letzter Code-Commit** (der letzte Commit, der Anwendungscode anfasst): `0ed44c8`
— alles danach ist Dokumentation.

**Dieser Handoff:** `5ac312b` — `docs: Phase 7 Money Path Pilot — Handoff + Abschluss`

**Letzter Code-Commit vor diesem Handoff:** `0ed44c8`
— `fix: Schema-Drift-Befunde nachgeprueft — 8 Fehlalarme begruendet als Ausnahmen`

**Phase-7-Commits (Alltagsengel):**

| Commit | Inhalt |
|---|---|
| `a994885` | Tracks 5–8 — DATEV-Validator, ChairMatch-Prüfung, Pilot Control Center, Chaos-Tests |
| `5967009` | Tracks 1–4 — Versand-Flags, CAMT-/Rechnungs-Preflight, Mahn-Safety-Gate |
| `0ed44c8` | Schema-Drift-Befunde nachgeprüft — 8 Fehlalarme begründet als Ausnahmen |

**ChairMatch:** `db50334` — Track 6 (Preis-Schema verifiziert, Gültigkeitsmigration vorbereitet).

> ### ⚠️ Zur Commit-Reihenfolge — wichtig für Rollback
>
> `a994885` (Tracks 5–8) liegt **vor** `5967009` (Tracks 1–4). Track 7 importiert
> ein Modul aus Track 1. **`a994885` ist deshalb allein nicht baubar** — der
> CI-Lauf `32906028213` scheiterte mit *„Module not found:
> `@/lib/config/versand-flags`"*. Ab `5967009` ist der Baum geschlossen und CI
> grün.
>
> **Folge:** Ein Revert bis einschließlich `5967009` ist zulässig. Ein
> Stehenbleiben auf `a994885` ist es **nicht** — dort baut die Anwendung nicht.

**Phase-6B-Commits (Vorgänger):** `6ef8d7f`, `8a99e04`, `0a63657`

---

## 1. Repository-Stand

### Alltagsengel

| Feld | Wert |
|---|---|
| Branch | `main` |
| HEAD | siehe **CODE_HEAD** oben |
| Letzter Code-Commit | Phase 7, alle 8 Tracks abgeschlossen |
| Typecheck | **0 Fehler** (`npx tsc --noEmit`, Exit 0) |
| Tests | vitest **5.627** + node:test **2.211** = **7.838** (vorher 7.530 → **+308**) |
| Testläufe | node:test 2.211 grün / 0 rot · vitest 5.627 grün / 38 übersprungen / 0 rot (nacheinander gelaufen, nicht gleichzeitig, nicht parallel zum Typecheck) |
| CI | **GRÜN auf `0ed44c8`** — beide Jobs (`Typecheck, Lint, Tests, Build` und `E2E — PflegeCoach + Barrierefreiheit`), Lauf `32906966861`. Zur roten CI auf `a994885` siehe §0. |
| lint:forbidden | **0 Treffer** (24.578 Dateien, FULL-Scan, Exit 0) |
| check:schema-drift | **0 Befunde** (1.288 Dateien gegen 331 Live-Tabellen). Die 8 zunächst gemeldeten waren sämtlich Fehlalarme des Zuordners und stehen begründet in `AUSNAHMEN` — Nachweis im Phase-7-Bericht §8. Der Check ist weiterhin **nicht** in CI oder Precommit-Guard verdrahtet. |
| Live | alltagsengel.care → HTTP 200 |

### ChairMatch

| Feld | Wert |
|---|---|
| Branch | `main` |
| HEAD | `db50334` |
| Letzter Commit | `Phase 7 Track 6: Preis-Schema verifiziert (33 Tests + Live-Probe), Gueltigkeitszeitraum-Migration vorbereitet` |
| Typecheck | 0 Fehler |
| Tests | vitest **520/520** (vorher 487 → +33) |
| Live | chairmatch.de → 308 → www.chairmatch.de → HTTP 200 |
| **Wartende Migration** | `20260826_pricing_gueltigkeit.sql` — **vorbereitet, NICHT angewendet.** Bewusst: das Anwenden ist Geschäftsentscheidung C5 (§6). |

> In Phase 7 (Track 6) **geprüft, nicht verändert**: Schema und RLS live
> verifiziert (`anon` → HTTP 401), 33 Strukturtests neu, eine Migration
> vorbereitet und bewusst nicht angewendet. **Keine Preise gesetzt.**
> Im Arbeitsverzeichnis liegt eine uncommittete Änderung an `STATUS.md` — sie
> gehört nicht zu Phase 7 und wurde nicht angefasst.

### efy care

| Feld | Wert |
|---|---|
| Repo | `/Users/work/efy-care` (Fremdrepo, nicht Teil von Alltagsengel) |
| HEAD | `a6904c1` |
| Typecheck / Lint / Build | je Exit 0 |
| Tests | **177 grün / 30 übersprungen** |
| RLS (Migrationsebene) | **41/41** Tabellen, 185 Policies |
| RLS (Produktiv-DB) | ⚪ **ungeprüft** |
| Supabase | ACTIVE_HEALTHY, 12 Migrationsdateien im Repo |
| Baseline-Bericht | `/Users/work/efy-care/docs/EFY_CARE_BASELINE_2026-08-25.md` |

> In Phase 6B **nicht angefasst**. Werte aus der 6A-Baseline.

---

## 2. Supabase-Status

### Alltagsengel (nnwyktkqibdjxgimjyuq)

- Status: ACTIVE_HEALTHY
- Migrationen: 226+ angewendet — **inkl. `20261004000000`** (neu in 6B)
- Tabellen: 308, davon **308 mit RLS** (100 %)
- org_fence RESTRICTIVE: alle relevanten Tabellen, 2 dokumentierte Ausnahmen
  (`organization_members`: Multi-Org-Verwaltung; `state_waitlist`: öffentlich)
- anon writes: 0
- Storage: 7 Buckets gehärtet (file_size_limit + MIME-Allowlist)
- DTA-Policies: org-scoped (`foldername[2] = current_org_id`)
- **Keine wartende Migration mehr.** (Der 6A-Punkt T-1 ist erledigt, §3.)

### ChairMatch (pwdbjqfpgumyfktbfswg)

- Status: ACTIVE_HEALTHY
- Migrationen: 43 angewendet
- Tabellen: 80, davon **79 mit RLS** (`spatial_ref_sys` = PostGIS-System, kein Risiko)
- protect_pricing + compliance_plans: Schema vollständig, RLS an, 7 CHECK-Constraints
- **In Phase 7 live gegengeprüft:** alle Spalten vorhanden, `anon` auf beiden
  Tabellen abgewiesen (HTTP 401). Beide Tabellen **leer** — das ist gewollt, bis
  C1 entschieden ist.
- ⚠️ **Eine wartende Migration:** `20260826_pricing_gueltigkeit.sql`
  (`effective_from`/`effective_to`). **Bewusst nicht angewendet** — Entscheidung
  C5 (§6).

### efy care (nsfbwhpjesmathsrqkfi)

- Status: ACTIVE_HEALTHY
- Repo führt 12 Migrationsdateien (3.522 Zeilen)
- ⚪ **Abgleich „lokale Migrationen == angewandte Migrationen" steht aus**

---

## 3. LIVE_VERIFIZIERT (gegen Supabase geprüft)

| Track | Commit/Migration | Verifikation |
|---|---|---|
| **payment_allocation `rueckzahlung`** (neu 6B) | `20261004000000` | **CHECK trägt 6 Werte inkl. `rueckzahlung`; alle 5 Altwerte erhalten; 0 Bestandsverletzer; RLS aktiv; `org_fence_payment_allocations` weiterhin RESTRICTIVE.** Nachgeprüft mit `scripts/verify-payment-allocation-rueckzahlung.mjs` → Exit 0 |
| RLS 308/308 | diverse | `pg_tables.rowsecurity` = 308 |
| org_fence alle Tabellen | `0a84ade` | Live-Query bestätigt |
| DTA Storage org-scoped | `3561ab4` | `pg_policies` zeigt org-Filter |
| Storage Bucket Hardening (7 Buckets) | `354b056` | `storage.buckets` zeigt Limits+MIME |
| CAMT Dublettensperre DB | `20261003000000` | UNIQUE INDEX existiert live |
| **ChairMatch Pricing** (neu geprüft in 7) | `20260824_pricing_schema` | **Alle Spalten live vorhanden; `anon` auf beiden Tabellen HTTP 401.** Nachgeprüft mit `scripts/verify-pricing-schema.mjs` (nur lesend). Methode: PostgREST beantwortet eine unbekannte Spalte mit `42703`, **bevor** es Rechte prüft — Spaltenexistenz und RLS-Lage kommen aus derselben Antwort. Ohne Keys endet das Skript mit **Exit 2** („nicht geprüft"), nicht mit 0. |
| **CAMT-Trockenlauf schreibt nichts** (neu in 7) | — | Gegen echtes Postgres (PGlite): Zeilenzahlen von 6 Tabellen vor/nach dem Aufruf identisch, **plus Gegenprobe**, dass `LIVE` sehr wohl anlegt |
| CAMT Parser App-seitig | diverse | 961-Zeilen E2E-Suite grün |
| Anforderungskatalog DiPA | `5b7fe21` | 60 Tests, 6 pure functions |
| P1-4 Testabdeckung Welle 6 | `0e8418f` | 358 neue Tests, 15 Dateien |
| Client-Upload-Validierung | `354b056` | SVG blockiert, HEIC erlaubt |

**Das Verifikationsskript ist nebenwirkungsfrei** — es liest ausschließlich über
das `_run_sql`-Lese-Orakel (`RAISE`-Fehlermeldung als Rückkanal) und schreibt
nichts. Es ist jederzeit wiederholbar.

---

## 4a. Zuletzt erledigte Arbeiten — Phase 7, alle 8 Tracks (25./26.08.2026)

Volldokumentation: **`docs/reports/PHASE7_MONEY_PATH_PILOT.md`**
Detailberichte: `PHASE7_TRACKS_1-4.md` · `PHASE7_TRACKS_5-8.md`

Phase 6B endete mit „was jetzt bleibt, ist kein Code mehr, sondern Erstbetrieb".
Das stimmte für die Frage, ob die Geldpfade *funktionieren* — nicht für die
Frage, ob man sie *gefahrlos scharf stellen* kann. Phase 7 baut für jeden
Geldpfad eine Vorstufe, die das Ergebnis zeigt, **ohne es auszulösen**, und
prüft anschließend, was passiert, wenn mitten im Vorgang etwas abbricht.

**Nichts wurde scharf gestellt.** Keine Rechnung versendet, keine Mahnung
verschickt, keine Bankdatei importiert, keine Zahlung gebucht, keine Migration
angewendet, kein Preis festgelegt.

| Track | Ergebnis |
|---|---|
| **1 — Versand-Schalter** | Zentrale Auswertung (`lib/config/versand-flags.ts`), **keine Route liest `process.env` mehr direkt**. Umgebungstrennung: eine „All Environments"-Variable — die Vorauswahl im Vercel-Dialog — hätte **jeden Branch-Preview** echte Post verschicken lassen, gegen dieselbe Produktionsdatenbank. Ungültige Werte sind sichtbar statt still (5 unterscheidbare Befunde). Audit-Eintrag **bei Wechsel**, je Mandant. **Beide Flags bleiben ungesetzt.** |
| **2 — CAMT-Preflight** | `CAMT_IMPORT_MODE`, Standard **DRY_RUN** (alles außer `LIVE`, auch das Fehlen). 6 Klassifikationen mit Rangfolge: `INVALID` › `CROSS_TENANT_BLOCKED` › `DUPLICATE` › `AMBIGUOUS` › `UNMATCHED` › `MATCHED` — **derselbe** Bewertungscode wie der scharfe Lauf, nicht ein zweiter. Menschenlesbarer Pilot-Bericht (`?format=text`), ohne vollständige IBAN, ohne fremde Mandantenkennung. **Gegen echtes Postgres belegt, dass DRY_RUN nichts schreibt** — inkl. Gegenprobe, dass `LIVE` sehr wohl anlegt. |
| **3 — Rechnungs-Preflight** | 16-Punkte-Checkliste, drei Urteile: `READY_FOR_SEND` / `NEEDS_REVIEW` / `BLOCKED`. Die Unterscheidung der letzten beiden ist der Kern — sonst geht jede Unsicherheit durch oder blockiert alles. **Fail-closed verdrahtet ohne stillen Standardwert:** alle vier Aufrufer setzen die Strenge ausdrücklich, ein Regressionstest scannt `app/` und `lib/` gegen das Überspringen. |
| **4 — Mahn-Safety-Gate** | 10 Sperren an **einer** Stelle (`pruefeMahnbarkeit()`), gerufen von `advanceDunning()` — dem einzigen Ort, an dem eine Mahnstufe steigt. Kein Aufrufer, auch kein künftiger, kann daran vorbei eskalieren. Mahnfristen (14/28/42/56/70) unverändert; das Gate macht das Mahnwesen nur **zurückhaltender**. |
| **5 — DATEV Reality Check** | `lib/billing/datev/datev-validator.ts`, zwei Prüfebenen: **vor** dem Formatieren (sieht gerundete Beträge, die in der fertigen Datei korrekt aussehen) und **auf** dem Artefakt (eigener CSV-Parser nach DATEV-Regeln — genau der Unterschied zu `split(';')` ist der gesuchte Fehler). 31 Tests auf **einem** repräsentativen Monat mit allen Vorfällen nebeneinander. **Fail-closed vor dem Storage-Upload:** bei Befunden kein CSV, kein `erstellt`-Datensatz, Route antwortet 422 mit den Befunden. |
| **6 — ChairMatch Pricing** | Schema + RLS **live verifiziert** (`anon` → HTTP 401, nur lesendes Prüfskript). 33 Strukturtests gegen die Migration. **Befund: keine Zeitversionierung** — der Seed überschreibt per `ON CONFLICT … DO UPDATE`, zu einem Vertrag von gestern ließe sich der damals gültige Preis nicht mehr feststellen. Migration `effective_from`/`effective_to` **vorbereitet, nicht angewendet** — Geschäftsentscheidung (C5). |
| **7 — Pilot Control Center** | `/admin/pilot` Abschnitt 3: Money Path Dashboard über CAMT, Rechnung, Mahnung, DATEV, System. **Keine Schreiboperation** — getestet, dass das Modul kein `insert`/`update`/`delete` kennt, die Seite kein `<form>`/`<button>`/`onClick`, die Route kein `POST`/`PUT`/`PATCH`/`DELETE`. **Jede** der über zehn Abfragen ist org-gefiltert (Test prüft jede einzelne). Fehlmessung ergibt `null`, nie `0` — und ein `null` ist nie grün. |
| **8 — Chaos Tests** | 33 Tests gegen Abbruch mitten im Geldvorgang, mit einem Werkzeug, das **gezielt den dritten von vier** Aufrufen scheitern lässt. **Ein P1-Befund** gefunden und gefixt (C-1, §5). Idempotenter Wiederholungslauf bei `23505`. Resend-Fehlerpfade und CAMT-Dubletten waren bereits abgedeckt und sind benannt statt doppelt geprüft. |

**7 neue Produktionsbefunde gefunden und behoben** (§5). Die zwei schwersten:
über `POST /api/billing/dunning/advance` liefen **alle Mahnstufen samt aller
vier Mahngebühren** in Sekunden durch (M-4), und ein nach dem Insert
abgebrochener Zahlungslauf hinterließ eine verwaiste Zuordnungszeile — **ein
Kunde, der bezahlt hat, wäre gemahnt worden** (C-1).

**Nebenbei geklärt:** `npm run check:schema-drift` meldete 8 Befunde — alle acht
nachgeprüft und als Fehlalarme des Tabellen-Zuordners belegt (Kommentar-Treffer
bzw. Abfragen aus Hilfsfunktionen). Begründet in `AUSNAHMEN` eingetragen, danach
0 Befunde. **Der Check ist weiterhin nicht in CI oder Precommit-Guard
verdrahtet** — das ist der eigentliche offene Punkt (§7 T-0).

**Geschlossen im Verlauf:** Der Punkt P-5 aus dem Tracks-5–8-Bericht
(`sammelrechnung-lauf.ts` reicht den neuen `preflight`-Parameter nicht durch)
hat sich mit `5967009` erledigt. Nachgeprüft: der Sammelrechnungslauf verschickt
über die Festschreibung (`invoice-engine.ts`), die `preflight: 'automatisch'`
setzt. Die sechs roten Tests aus dem Zwischenstand sind grün.

---

## 4. Zuletzt erledigte Arbeiten — Phase 6B (25.08.2026)

Volldokumentation: **`docs/reports/PHASE6B_TECHNICAL_PROGRESS.md`**

Phase 6B hat die drei technischen Punkte abgearbeitet, die Phase 6A offen
gelassen hatte (T-1 bis T-4 des Vorgänger-Handoffs).

### Track 1 — Migration `payment_allocation_rueckzahlung` ✅ LIVE

Vor dem Apply zwei Vorarbeiten (`6ef8d7f`):

**Transaktionale Kapselung.** `DROP CONSTRAINT` und `ADD CONSTRAINT` liefen als
zwei getrennte Anweisungen. Scheitert das `ADD`, stünde `payment_allocations`
danach **ganz ohne** `allocation_type`-Prüfung da — schlimmer als der Zustand,
den die Migration beheben soll. Migration und Rollback sind jetzt in
`BEGIN; … COMMIT;` gefasst.

**Verifikationsskript.** `scripts/verify-payment-allocation-rueckzahlung.mjs`
prüft fünf Dinge statt nur eines: den neuen Wert, **alle fünf Altwerte** (ein
`DROP`+`ADD` kann sie verlieren), Bestandsdaten, RLS und den RESTRICTIVE
`org_fence`. Die letzten beiden stehen dort, weil eine Constraint-Migration kein
Anlass ist, die Sicherheitslage einer Geldtabelle ungeprüft zu lassen.

Der Apply ist erfolgt und **live nachgeprüft** (§3). **Befund R-1 aus Phase 6A
ist damit vollständig geschlossen.**

Der Rückfall im Code (`lib/billing/sepa/ruecklastschrift.ts:185`) bleibt stehen.
Er ist jetzt ein toter Zweig — und genau deshalb sinnvoll: liefe die Anwendung je
gegen eine Datenbank ohne diese Migration (Shadow-Instanz, neuer Mandanten-Stack,
Rollback), bleiben die Bücher konsistent statt still auseinanderzulaufen.

### Track 2 — Geldrundung Reststellen ✅ `8a99e04`, `0a63657`

Die drei im 6A-Bericht genannten Reststellen sind umgestellt (CAMT-Parser,
Gutschriften-Dialog, Abrechnungsseite). **Die anschließende globale Durchsicht
fand 18 weitere** geldrelevante Stellen — und ein zweites Fehlerbild, das im
6A-Bericht nicht vorkam:

**Cent-Zwischenergebnisse.** `Math.round(cent)` auf einem Wert, der schon in Cent
gerechnet ist (Einzelpreis × Menge, Zuschlag, Gesamtpreis ÷ Menge). Die
Kommaverschiebung hilft dort nichts; was bleibt, ist die Asymmetrie:
`Math.round(100.5) = 101`, aber `Math.round(-100.5) = -100`. Auf einer
**Gutschrift**, einer **Storno-Position** oder einer **Rücklastschrift** steht
damit ein Cent weniger als auf der Rechnung, die sie ausgleichen soll — die
Position gleicht sich nicht auf null aus.

→ **`centRunden()`** neu in `lib/geld.ts` (symmetrisch, DIN 1333,
`-0`-Normalisierung, wirft bei Müll).

**Zwei echte Bugs nebenbei gefunden** → §5 (G-1, G-2).

**`docs/MONEY_ROUNDING_REVIEW_COMPLETE.md`** hält zusätzlich rund **60 bewusst
nicht geänderte Stellen** mit Begründung fest (Prozentwerte, Mengen/Zeiten,
`toFixed()`-Darstellung, und die Bestandstests, die `Math.round(x*100)`
absichtlich als dokumentiertes Fehlerbild zitieren). Ohne diesen zweiten Teil
prüft die nächste Durchsicht dieselben 60 Fundstellen noch einmal einzeln.

### Track 3 — DATEV + Tarif-Verifizierung auf PGlite ✅ `0a63657`

T-3 und T-4 des Vorgänger-Handoffs. Beide Module waren ungetestet, weil der
PGlite-Shim die von ihnen benutzten PostgREST-Merkmale nicht abbilden konnte.

**Shim erweitert:** `.or(…)`, `.not(spalte,'eq',wert)`, rekursiv verschachtelte
Einbettungen und eins-zu-viele-Einbettungen (Richtung am echten Schema bestimmt:
FK am Eltern → Objekt, FK am Kind → Array).

**Die Falle dabei:** Die erste Fassung löste die tiefere Ebene auf der schon
**zugeschnittenen** Zeile auf. Fordert ein Embed keine flachen Spalten an (auch
nicht den Fremdschlüssel), findet man ihn dort nicht mehr und liefert still
`null`. Ohne die Korrektur wäre der Test grün geworden und hätte behauptet, die
Rücklastschrift trage ein Debitorenkonto — sie fiel in Wahrheit auf das
Sammelkonto 1400 zurück. Dasselbe Muster wie die Shim-Lücke aus Phase 6A: **ein
Testhilfsmittel, das freundlicher antwortet als die echte Schicht, beweist
nichts.**

**Zwei neue Suiten:** DATEV-Export **46 Tests**, Tarif-Verifizierung **41 Tests**.
**Zwei echte Bugs gefunden** → §5 (D-1, D-2).

Die 111 bestehenden PGlite-Suiten laufen mit dem erweiterten Shim unverändert
grün — die Erweiterungen sind additiv.

---

## 5. Gefundene und behobene Produktionsbefunde

### Phase 7 — sieben neue Befunde, alle gefixt

| # | Track | Befund | Wirkung | Schwere |
|---|---|---|---|---|
| **C-1** | 8 | **Halb gebuchter Zahlungseingang.** Bricht `allocatePayment()` nach dem Insert ab (Verbindungsabbruch, Audit-Fehler, Prozessende), bleibt eine verwaiste Zeile in `payment_allocations`, während `invoices.paid_amount` und `payments.allocated_cents` den alten Stand tragen. Jeder Wiederholungslauf scheitert am `UNIQUE` mit `23505`. | Drei Dinge gleichzeitig, keines sichtbar: DATEV **bucht** die Zahlung (liest genau diese Tabelle), die Rechnung gilt weiter als **offen** und wird **gemahnt**, und kein Wiederholungslauf kommt je durch. **Ein Kunde, der bezahlt hat, bekommt eine Mahnung.** | 🔴 **P1 Geld** |
| **M-4** | 4 | **Über `POST /api/billing/dunning/advance` liefen alle Mahnstufen unmittelbar hintereinander durch.** `advanceDunning()` prüfte den Stufenabstand nicht — nur der Massenlauf tat das. | Eine Rechnung ließ sich in Sekunden von „offen" bis „Inkasso-Vorbereitung" treiben, **samt aller vier Mahngebühren** (2,50 + 5,00 + 7,50 + 10,00 €). Der Kunde bekäme vier Mahnungen in einer Zustellung. | 🔴 **P1 Geld** |
| **P-1** | 3 | **Schema-Drift im neu gebauten Preflight:** `clients.deleted_at` selektiert — die Spalte existiert nicht (Soft-Delete liegt auf `profiles`). | PostgREST hätte mit `42703` geantwortet; weil nur `data` ausgewertet wurde, wäre daraus **„Klient existiert nicht mehr"** geworden — eine falsche, aber plausible Sperre auf **jeder** Rechnung. Vor dem ersten Einsatz gefunden. | 🔴 **P1 Funktion** |
| **P-2** | 3 | **Punkt 11 hätte jeden automatischen Erstversand blockiert.** Erste Fassung stellte ein fehlendes Belegpaket zur Sichtung — beim Erstversand existiert nie eines, es entsteht *im* Versand. | Der Automat hätte dauerhaft geschwiegen, mit der plausibel klingenden Begründung „PDF noch nicht erzeugt". Genau die Sorte Fehler, die der Preflight verhindern soll. | 🟠 **P2 Funktion** |
| **M-1** | 4 | `checkDunningBlocks()` filterte Gutschriften nicht auf `deleted_at IS NULL`; `verwerfeGutschrift()` setzt beim Verwerfen nur `deleted_at` und lässt `status='entwurf'` stehen. | Eine **verworfene** Gutschrift blockierte die Mahnung dieser Rechnung **für immer**. Fail-closed, deshalb ohne Geldschaden — aber eine berechtigte Forderung lief still aus dem Mahnwesen heraus. | 🟠 **P2 Geld** |
| **F-1** | 1 | `letzterFlagZustand()` fing nur das `error`-Feld, nicht die geworfene Ausnahme. Der PostgREST-Client meldet einen Verbindungsabbruch als Ausnahme. | Ein Netzwerkfehler beim **Lesen** des Audit-Trails hätte die gesamte Festschreibung mitgerissen: eine korrekt erzeugte Rechnung wäre wegen eines Protokolleintrags nicht zustande gekommen. Vom Test gefunden, nicht vom Code. | 🟠 **P2 Funktion** |
| **M-3** | 4 | `dunning_entries.amount_paid_cents` wurde einmal bei der Anlage geschrieben und danach nie wieder; `getDunningOverview()` rechnet den offenen Betrag aber aus dem **Mahneintrag**. | Die Mahnübersicht wies dauerhaft den vollen Rechnungsbetrag als offen aus, auch bei längst bezahlten Posten. Der Mahnlauf selbst war nie betroffen (er liest die Rechnung) — falsch war die **Anzeige** des Forderungsbestands. | 🟡 **P3 Anzeige** |

**Zusätzlich als Härtung, kein Befund:** `ensureDunningEntry()`,
`checkDunningBlocks()`, `advanceDunning()` und `ermittleStoppgrund()` lasen ohne
`organization_id` bei service-role (BYPASSRLS). **Kein Leck** — alle Routen
fencen davor. Aber eine Funktion, die eine Mahngebühr bucht, darf sich darauf
nicht verlassen; `advanceDunning()` verlangt den Mandanten jetzt als
Pflichtparameter.

> **Zwei der sieben Befunde stammen aus dem in Phase 7 neu gebauten Code**
> (P-1, P-2), beide vor dem ersten Einsatz gefunden — nicht durch Nachdenken,
> sondern weil die bestehenden E2E-Ketten den neuen Code sofort mitgefahren
> haben. **Eine Absicherung, die man nur gegen ihre eigenen Tests baut, prüft
> sich selbst.**

### Phase 6B — vier Befunde, alle gefixt (unverändert)

| # | Befund | Wirkung | Schweregrad |
|---|---|---|---|
| **G-1** || # | Befund | Wirkung | Schweregrad |
|---|---|---|---|
| **G-1** | `parseBetragZuCent('12€34')` ergab **1.234,00 €**. `lib/admin/betrag.ts` strich das € **global**, also auch mitten in der Zahl. | Der naheliegende Vertipper `12€34` (gemeint 12,34 €) wurde zum **hundertfachen Betrag**, ohne Warnung. Inzwischen rufen **drei** Dialoge den Parser auf: Gutschrift, Rechnungszahlung, Zahlungszuordnung. Eine als 1.234 € gebuchte Gutschrift von 12,34 € ist ein Verlust von 1.221,66 €, den erst der Kontoabgleich findet. | 🔴 **P1 Geld** |
| **D-1** | CSV-Injection über die **Debitorennummer**. `generateDatevBuchungszeile()` schrieb Konto/Gegenkonto ohne Anführungszeichen-Verdopplung und ohne Formel-Riegel — anders als jedes andere Textfeld derselben Zeile. Die Route prüfte nur „nicht leer". | Ein Wert wie `1";"9999` beendet das Feld mitten in der Zeile und schiebt alles Folgende in die falsche Spalte — **der Steuerberater importiert Beträge auf fremde Konten**. Führendes `=` war in Excel eine Formel. | 🔴 **P1 Sicherheit/Geld** |
| **G-2** | `parseFloat()` im Leistungsnachweis-Formular. Akzeptierte Müll-Suffix still (`'12.5x'` → 12.5) und lieferte bei ungültiger Eingabe `NaN` → als `null` verschickt. | Der Leistungsnachweis entstand **ohne Betrag** und war damit nicht abrechenbar. | 🟠 **P2 Funktion** |
| **D-2** | `getKonto()` griff mit `KONTENRAHMEN[rahmen][schluessel]` doppelt zu; `getDatevConfig()` castet den JSONB-Wert nur. | Bei einem anderen Wert als SKR03/SKR04 kam „Cannot read properties of undefined (reading 'bank')" aus der Tiefe des Generators statt einer klaren Meldung. | 🟡 **P3 Diagnose** |

**Fixes:**
- G-1: € nur noch an den Rändern entfernt; innen fällt es durch die Formatprüfung.
  Leerraum darf weiterhin überall weg (`1 234,56` bleibt lesbar).
- D-1: **an beiden Enden** — neue `pruefeDebitorennummer()` (ganzzahlig
  10000–69999, dieselbe Regel wie die automatische Vergabe; Route gibt 400
  zurück) **und** `escapeText(sanitize(…, 9))` im CSV-Format, weil die Zeile auch
  aus Werten entsteht, die **vor** der neuen Eingangsprüfung in die Tabelle
  gelangt sind.
- G-2: `Number()` (streng), Fehlermeldung statt stillem `null`, `aufCent()` vor
  dem Versand.
- D-2: `getKonto()` meldet Klartext.

**Nebenbefund:** Der Gutschriften-Dialog hatte einen eigenen Parser, dessen
Normalisierung Punkte **bedingungslos** strich — die englische Schreibweise
`12.50` wurde als **1.250 €** gelesen. Mit der Umstellung auf
`parseBetragZuCent()` miterledigt.

> **Zwei von vier Befunden lagen außerhalb des beauftragten Umfangs.** Der
> Auftrag nannte drei Reststellen; die vollständige Durchsicht fand 18 weitere
> und die beiden schwersten Fehler. Derselbe Befund hinter den Befunden wie in
> Phase 6A — mit dem Zusatz, dass diesmal nicht fehlende Tests das Problem waren,
> sondern eine **zu eng gefasste Fundstellenliste**.

### Phase 6A — sieben Befunde, alle gefixt (unverändert)

| # | Befund | Wirkung | Bereich |
|---|---|---|---|
| **B-1** | `listMandates()` wählte `client_number` — die Spalte heißt `customer_number`. PostgREST: `42703`. | `GET /api/billing/sepa/mandates` lieferte **ausnahmslos** einen Fehler. SEPA-Mandatsliste live komplett tot. | Funktion |
| **B-2** | `createMandate()` las den Klienten **ohne** `organization_id`-Filter (service-role = BYPASSRLS). | Admin von Mandant A konnte ein SEPA-Mandat auf einen Klienten von Mandant B anlegen → **Abbuchung von fremdem Konto**. | Sicherheit |
| **B-3** | `createSepaBatch()` las `invoices.status`, wertete ihn aber nie aus. | **Entwürfe, Stornos und abgeschriebene Rechnungen wurden eingezogen** — Beträge, die dem Unternehmen nicht zustehen. | Geld |
| **B-4** | Nichts hinderte daran, dieselbe Rechnung in einen zweiten Sammelauftrag zu legen. | **Doppelte Abbuchung.** Die zweite ist eine unberechtigte Lastschrift — bis zu **13 Monate** rückholbar. | Geld |
| **R-1** | `allocation_type = 'rueckzahlung'` stand nicht im CHECK-Constraint → `23514`. | `payment_allocations` behauptete weiter „bezahlt", während `payments.allocated_cents` schon reduziert war. | Geld — **in 6B vollständig geschlossen** |
| **X-1** | `correction_of`-Nachschlag in `loadInvoiceXRechnungData()` ohne Mandantenfilter. | **Fremde Rechnungsnummer** als BT-25 in der CII-Datei — in einem Dokument, das an einen Kostenträger geht. | Sicherheit |
| **M-1** | Upsert auf `monthly_closings` ohne `organization_id` → Default `current_org_id()` fällt bei service-role auf die Stamm-Org. | **Jeder** Monatsabschluss landete in der Stamm-Organisation; der Mandant sah ihn wegen `org_fence` nie. | Mandanten |

Details: `docs/reports/PHASE6A_TECHNICAL_PROGRESS.md` §3 und
`docs/reports/PHASE6B_TECHNICAL_PROGRESS.md` §4.

---

## 6. EXTERN_BLOCKIERT und BUSINESS_INPUT_REQUIRED

**Alles, was einen echten Geldvorgang noch verhindert, steht in diesem
Abschnitt.** Nichts davon ist ein Code-Problem.

### EXTERN_BLOCKIERT

| # | Was | Wer/Wo |
|---|---|---|
| E1 | `RECHNUNGSVERSAND_AUTOMATISCH` nicht gesetzt | Vercel Environment Variables — **Reihenfolge und Vorbedingungen: `docs/ENV_KONFIGURATION.md` §1.** Seit Phase 7 nur noch im Produktionslauf wirksam; „All Environments" ist damit entschärft, aber trotzdem die falsche Wahl. |
| E2 | `MAHNVERSAND_AUTOMATISCH` nicht gesetzt | dito; erst sinnvoll nach einem belegten Rechnungsversand |
| E2b | `CAMT_IMPORT_MODE` nicht auf `LIVE` | fail-closed. Ohne die Variable liest der Import die Datei vollständig und **prüft sie**, bucht aber nichts. |
| E3 | Erster CAMT-Import nie produktiv gelaufen | Braucht echte Bankdatei (camt.053/054). **Risikofreie Vorstufe: `POST /api/billing/camt/preflight?format=text`** |
| E4 | Erster Rechnungsversand nie produktiv | `invoice_email_log` = 0. Resend ist funktionsfähig (Domain + Prod-Key verifiziert), aber nie genutzt. **Vorstufe: `GET /api/billing/invoices/<id>/preflight`** |
| E5 | §45a Bayern Antrag unvollständig | Landesamt für Pflege, Erinnerung erhalten 24.08.2026 |

### BUSINESS_INPUT_REQUIRED

#### DATEV — Kanzlei-Vorgaben (neu in Phase 7)

Der Validator führt die Liste selbst (`BERATER_VORGABE_ERFORDERLICH`), damit sie
nicht in einem Bericht verschwindet.

| # | Vorgabe | Wirkung, solange offen |
|---|---|---|
| **D1** | **Beraternummer** | **Export bricht ab**, bevor irgendetwas erzeugt wird |
| **D2** | **Mandantennummer** | dito |
| D3 | Kontenrahmen SKR03/SKR04 — *bestätigt* | Standardwert wird benutzt, ist aber unbestätigt |
| D4 | Erlöskonto steuerfreie Pflege (§ 4 Nr. 16 UStG) | dito |
| D5 | Sachkontenlänge (4 oder 5) | dito |
| D6 | Wirtschaftsjahresbeginn | dito |

> D3–D6 tragen heute Standardwerte aus dem SKR03/SKR04-Kontenrahmen. **Erfunden
> ist keiner davon, bestätigt aber auch keiner.** Ob die Kontonummern die
> *richtigen* sind, kann kein Code wissen — geprüft wird, dass jedes Konto
> **aus** einem definierten Vorrat stammt, nicht dass der Vorrat der richtige ist.

#### ChairMatch — Preise

| # | Frage |
|---|---|
| **C1** | **Welche Beträge?** `protect_pricing` und `compliance_plans` sind strukturell fertig und **leer**. Die Werte aus `20260310` sind Entwurf und gelten NICHT. Befüllung über `supabase/seed/pricing.seed.template.sql`. |
| C2 | Wird Protect für alle vier Risikostufen verkauft oder nur HIGH/VERY_HIGH? Nicht verkaufte Stufen: Zeile **streichen**, nicht mit 0 befüllen (0 heißt „gratis"). |
| C3 | Netto oder brutto? Die Spalten heißen `*_cents` ohne Steuerkennzeichen. |
| C4 | Bleibt es bei `one_time` / `yearly` / `monthly`? |
| **C5** | **Soll `20260826_pricing_gueltigkeit.sql` angewendet werden?** Sie fügt `effective_from`/`effective_to` hinzu und ersetzt den UNIQUE-Index durch einen `EXCLUDE`-Constraint. Ohne sie überschreibt der Seed alte Preise, und zu einem Vertrag von gestern lässt sich der damals gültige Preis nicht mehr feststellen — eine Nachweislücke gegenüber Kunde und Finanzamt. **Solange beide Tabellen leer sind, ist der Schaden null. Vor dem ersten verkauften Vertrag ist die Migration billig, danach teuer.** Sie ändert außerdem die Seed-Semantik (`ON CONFLICT (risk_level)` scheitert danach mit `42P10`; Ersatz-Template liegt bereit). |

#### Alltagsengel — Betrieb

| # | Was | Details |
|---|---|---|
| B2 | **Geldpfade Erstbetrieb** | `payments` = 0, `camt_imports` = 0, `invoice_email_log` = 0 — System gebaut, getestet, gegen Abbruch gehärtet, aber **nie mit echtem Geld gelaufen** |
| B3 | **3× Signaturlaufzeit 7 Tage entscheiden** | `lib/upload-document.ts` (Ausweis/Führungszeugnis/Versicherung), `lib/upload-service-proof.ts`, `app/api/native/leistungsnachweis-upload/route.ts`. Im Quelltext an Ort und Stelle markiert. Entweder Re-Signier-Route bauen (für `documents` existiert `getSignedDocumentUrl()` schon, nur ohne Oberfläche) **oder** 7 Tage bewusst als Restrisiko tragen — ein Link auf einen Personalausweis überdauert dann Rollenwechsel und Konto-Deaktivierung um bis zu sieben Tage. **Empfehlung: Re-Signier-Route für `documents`.** |
| B4 | **`getOposListe()` zeigt Entwürfe im Forderungsbestand** | Ausgeschlossen sind nur die Endstatus. Wer die Altersstruktur als Forderungsbestand liest, überschätzt ihn um die Summe aller Entwürfe. Der Mahnlauf ist **nicht** betroffen (wählt selbst). Der Test hält den Ist-Zustand fest, damit eine Änderung auffällt; geändert wurde nichts. |

> **Entfallen:** „Migration `20261004000000` wartet auf Live-Apply" (in 6B
> erledigt und live verifiziert, §3) und „ChairMatch Preise" als reine
> Strukturfrage — das Schema ist seit Track 6 live nachgewiesen, offen sind nur
> noch die Beträge (C1) und die Versionierungsentscheidung (C5).

---

## 7. Echte offene technische Probleme

**Kein technischer P0/P1 im Alltagsengel-Repo offen.** T-1 bis T-4 des
6A-Handoffs sind erledigt; die Phase-7-Befunde sind sämtlich behoben (§5).

| # | Problem | Priorität |
|---|---|---|
| **T-0** | **`npm run check:schema-drift` ist weder in CI noch im Precommit-Guard verdrahtet.** Ein Prüfschritt, den niemand ausführt, ist keiner — und die Klasse, die er fängt (eine unbekannte Spalte lässt die ganze Abfrage still scheitern), ist in diesem Repo mehrfach aufgetreten, zuletzt als Befund P-1 in Phase 7. Zusätzlich: brächte man dem Zuordner bei, Kommentare zu überspringen, wären fünf der acht Ausnahmen überflüssig. | **P2 — der greifbarste offene Punkt** |
| **T-1** | 30 der 36 ungetesteten `lib/`-Module (P2/P3-Kategorien) stehen noch aus. Drei Phasen in Folge haben gezeigt, was dort liegt: 6A/T1 sieben Befunde, 6B/Track 3 zwei, Phase 7 sieben. | P2 |
| **T-2** | **DATEV-Storage-Schicht ungeprüft.** `erstelleDatevExport()` schreibt in Supabase Storage; der PGlite-Shim bildet Storage nicht ab. Die neue Stapelprüfung aus Track 5 sitzt **davor** und verhindert, dass eine fehlerhafte Datei überhaupt hochgeladen wird — aber der Upload selbst bleibt ungetestet. | benannte Grenze |
| **T-2b** | **Die erste echte DATEV-CSV sollte jemand öffnen und die Spaltenausrichtung ansehen**, bevor sie importiert wird. Grund: Befund D-1 aus Phase 6B (CSV-Injection über die Debitorennummer). Kein Code kann das ersetzen. | Erstbetrieb |
| **T-3** | `no_overlapping_tariffs` bleibt unter PGlite **unbeweisbar** (kein `btree_gist`). Ein Stellvertreter-Trigger prüft nur die **Reaktion** der Anwendung, nicht den echten Constraint. Nur gegen echtes Postgres prüfbar. | benannte Grenze |
| **T-4** | `tarif-verifizierung-service.ts` begründet den ODER-Zweig `organization_id.is.null` mit `leistungspreise`-Altbestand vor Phase 3. Nach Schema kann es den nicht geben (`20260801` setzt `NOT NULL`). **Kein Leck** — der Zweig öffnet nur für herrenlose Zeilen, nie für fremde. Ob die Spalte live `NOT NULL` ist, wäre einmal zu prüfen. | P3 / Beobachtung |
| **T-5** | Der Rückfall in `lib/billing/sepa/ruecklastschrift.ts:185` ist seit dem Live-Apply ein **toter Zweig**. Bewusst stehen gelassen (Shadow-Instanzen, Rollback). Kein Handlungsbedarf — hier notiert, damit ihn niemand als Fehler meldet. | keine |
| **T-6** | efy care: Buchung schreibt nicht in die DB; Konto-Löschung ist ein TODO (**DSGVO Art. 17**). Beides Funktionen, die dem Nutzer etwas zusagen, was nicht passiert. | **P1** (Fremdrepo) |
| **T-7** | efy care: Prod-Migrationsstand, RLS live, Edge-Function-Deploy und Secrets unverifiziert. Solange offen, ist jede Deploy-Freigabe dort eine Annahme. | **P1** (Fremdrepo) |
| **T-8** | efy care: 30 HTTP-Isolationstests übersprungen (PostgREST/GoTrue/Storage-Schicht). Braucht Shadow-Supabase-Instanz + 2 Env-Vars in CI. | P2 (Fremdrepo) |

---

## 8. Nächster sinnvoller Schritt

**Phase 8 — die erste kontrollierte echte Transaktion.** Technisch ist der Weg
frei; jeder Schritt hat eine Vorstufe, die nichts auslöst. Reihenfolge:

1. **Trockenlauf CAMT.** Eine echte Bankdatei durch
   `POST /api/billing/camt/preflight?format=text`. Kostet nichts, bucht nichts,
   beantwortet vorab, was der scharfe Import täte. **Erst wenn der Bericht in
   Zeile 1 grünes Licht gibt**, `CAMT_IMPORT_MODE=LIVE` erwägen.
2. **Trockenlauf Rechnung.** Eine echte Rechnung durch
   `GET /api/billing/invoices/<id>/preflight`. Steht dort nicht
   `READY_FOR_SEND`, verschickt der Automat auch mit gesetztem Schalter nichts —
   der Preflight nennt den Grund.
3. **`/admin/pilot` Abschnitt 3 ansehen**, bevor irgendein Schalter fällt. Ein
   `—` statt einer Zahl heißt „nicht messbar", nicht „nichts da".
4. **`RECHNUNGSVERSAND_AUTOMATISCH` setzen** — nur `Production`, nicht „All
   Environments" (E1, `docs/ENV_KONFIGURATION.md` §1). Danach **ein** echter
   Versand, anschließend `invoice_email_log` gegenprüfen.
5. **Erster begleiteter CAMT-Import** auf dem gefixten Rundungsstand.
6. **Erster SEPA-Sammelauftrag** — ausdrücklich gegen die 6A-Fixes B-3/B-4
   gegengeprüft (keine Entwürfe im Stapel, keine Rechnung zweimal).
7. **Erste DATEV-Ausleitung:** D1/D2 von der Kanzlei holen, dann eine CSV
   erzeugen und **öffnen** — Spaltenausrichtung ansehen, bevor sie importiert
   wird (T-2b).
8. **`MAHNVERSAND_AUTOMATISCH`** zuletzt, erst nach einem belegten
   Rechnungsversand.

> **Nach jedem Schritt gegenprüfen, bevor der nächste kommt.** Der Sinn der
> Vorstufen ist, dass ein Fehler beim ersten Vorgang auffällt und nicht beim
> fünfzigsten.

**Parallel, ohne externe Abhängigkeit:**
- **T-0** — `check:schema-drift` in CI und Precommit-Guard verdrahten. Der
  greifbarste offene Punkt, und Phase 7 hat mit P-1 gerade wieder gezeigt,
  warum.
- **T-1** — die verbleibenden 30 ungetesteten `lib/`-Module.

**Getrennt zu entscheiden:**
- **ChairMatch C5** — Gültigkeitsmigration anwenden oder bewusst nicht. Die
  Entscheidung ist **jetzt** billig, nach dem ersten Vertrag nicht mehr.
- **efy care T-6** — kein Testthema, sondern ein Produktentscheid:
  Buchungs-Button anbinden oder deaktivieren, Konto-Löschung bauen oder
  Menüpunkt entfernen.

---

## 9. Relevante Dateipfade

| Zweck | Pfad |
|---|---|
| **Phase-7-Gesamtbericht (alle 8 Tracks)** | `docs/reports/PHASE7_MONEY_PATH_PILOT.md` |
| Phase-7-Detailbericht Tracks 1–4 | `docs/reports/PHASE7_TRACKS_1-4.md` |
| Phase-7-Detailbericht Tracks 5–8 | `docs/reports/PHASE7_TRACKS_5-8.md` |
| Phase-6B-Fortschrittsbericht | `docs/reports/PHASE6B_TECHNICAL_PROGRESS.md` |
| Phase-6A-Fortschrittsbericht | `docs/reports/PHASE6A_TECHNICAL_PROGRESS.md` |
| Geldrundung-Durchsichtsprotokoll (inkl. ~60 nicht geänderter Stellen) | `docs/MONEY_ROUNDING_REVIEW_COMPLETE.md` |
| DATEV-/Tarif-Testbericht | `docs/DATEV_TARIF_PGLITE_TESTS.md` |
| T1-Detailbericht (6A) | `docs/T1-PGLITE-INTEGRATIONSTESTS-P1-2026-08-25.md` |
| Signierte-URL-Audit | `docs/security/signierte-urls-audit.md` |
| efy-care-Baseline (Fremdrepo) | `/Users/work/efy-care/docs/EFY_CARE_BASELINE_2026-08-25.md` |
| Status-Matrix | `docs/reports/STATUS_MATRIX_2026-08-25.md` |
| Abschlussbericht 25.08. | `docs/reports/MASTER_ABSCHLUSSBERICHT_2026-08-25.md` |
| Geldrundung (zentral) | `lib/geld.ts` |
| Betragsparser (G-1) | `lib/admin/betrag.ts` |
| DATEV-Kontenrahmen (D-1, D-2) | `lib/billing/datev/kontenrahmen.ts` |
| DATEV-CSV-Format (D-1) | `lib/billing/datev/datev-format.ts` |
| **Migration (LIVE)** | `supabase/migrations/20261004000000_payment_allocation_rueckzahlung.sql` |
| Rollback dazu | `supabase/migrations/20261004000001_rollback_payment_allocation_rueckzahlung.sql` |
| **Live-Verifikationsskript dazu** | `scripts/verify-payment-allocation-rueckzahlung.mjs` |
| PGlite-Shim | `__tests__/e2e/helpers/pglite-supabase.ts` |
| Schemaaufbau Kettentests | `__tests__/e2e/helpers/kette-schema.ts` |
| Versand-Schalter (zentral) | `lib/config/versand-flags.ts` + `…/versand-flags-audit.ts` |
| CAMT-Betriebsart + Preflight | `lib/billing/camt/camt-modus.ts`, `…/camt-preflight.ts`, `…/camt-preflight-bericht.ts` |
| Rechnungs-Preflight (16 Punkte) | `lib/billing/preflight/rechnung-preflight.ts` |
| Mahn-Safety-Gate (10 Sperren) | `lib/billing/dunning/mahn-safety-gate.ts` |
| DATEV-Validator (2 Prüfebenen) | `lib/billing/datev/datev-validator.ts` |
| Pilot Control Center | `lib/pilot/control-center.ts` · Seite `app/admin/pilot/page.tsx` |
| Zahlungszuordnung (Befund C-1) | `lib/billing/core/payments.ts` |
| Chaos-Testwerkzeug | `__tests__/chaos/helpers/chaos-client.ts` |
| **Preflight-Routen (nur lesend)** | `app/api/billing/camt/preflight/route.ts` · `app/api/billing/invoices/[id]/preflight/route.ts` |
| **ChairMatch: Prüfskript (nur lesend)** | `/Users/work/chairmatch/scripts/verify-pricing-schema.mjs` |
| **ChairMatch: Migration (NICHT angewendet)** | `/Users/work/chairmatch/supabase/migrations/20260826_pricing_gueltigkeit.sql` |
| ChairMatch: Seed versioniert | `/Users/work/chairmatch/supabase/seed/pricing.seed.versioniert.template.sql` |
| Deploy-Skript | `./deploy.sh` |
| Rollback-Skript | `./scripts/rollback.sh` |
| Precommit-Guard | `./scripts/precommit-guard.sh` |
| Forbidden-Strings | `scripts/forbidden-strings.json` |
| CAMT-Migration (live) | `supabase/migrations/20261003000000_camt_buchungsdublette.sql` |
| ChairMatch Pricing (live) | `supabase/migrations/20260824_pricing_schema.sql` |
| Pricing Seed Template | `supabase/seed/pricing.seed.template.sql` |

---

## 10. ENV-Variablen (Namen, KEINE Werte)

### Alltagsengel (Vercel)
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`
- `RECHNUNGSVERSAND_AUTOMATISCH` ← NICHT GESETZT
- `MAHNVERSAND_AUTOMATISCH` ← NICHT GESETZT
- `CAMT_IMPORT_MODE` ← NICHT GESETZT (⇒ Trockenlauf, fail-closed)
- `VERSAND_NICHT_PRODUKTION_ERLAUBT` ← nicht gesetzt und gehört NICHT in die Produktion
- `CRON_SECRET`

### ChairMatch (Vercel)
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`

### efy care (Supabase Function Secrets — Setzstatus ungeprüft)
- `ANTHROPIC_API_KEY`, `OCR_ENABLED`
- `STRIPE_PRICE_STARTER` / `_PRO` / `_SCALE`
- `SHADOW_SUPABASE_URL`, `SHADOW_SUPABASE_ANON_KEY` (CI, für die 30 Skips)

---

*Aktualisiert 26.08.2026 nach Phase 7 (Tracks 1–8, abgeschlossen) — Alltagsengel*
