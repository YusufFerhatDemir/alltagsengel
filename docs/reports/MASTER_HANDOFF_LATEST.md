# MASTER HANDOFF -- Stand 28.08.2026, nach Haerte-Track 12 (Abrechnung und Finanzfluesse)

Dieses Dokument ist die einzige Wahrheitsquelle fuer den technischen Zustand
beider Produkte. Jede neue Session liest zuerst diese Datei.

> ## Gesamtstatus: `READY_FOR_EXPLICIT_USER_APPROVAL`
>
> **Kein technischer P0/P1 offen.** Migration `20261005000000_pilot_send_gate.sql`
> ist LIVE_VERIFIZIERT (Phase 8.4, via Supabase MCP `apply_migration`).
> Beide Tabellen existieren, Constraints korrekt, RLS aktiv, Policies korrekt,
> 0 Zeilen. Typecheck 0 Fehler, 8.228+ Tests gruen.
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
> - **Migration `20261005000000` ist LIVE_VERIFIZIERT.** Einmal-Freigabe
>   benutzbar, `APPROVAL`-Phase in `/admin/pilot` nicht mehr BLOCKIERT.
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
| **CODE_HEAD** | lokaler `main`-HEAD | `b99a893` (Track 11) -- fortgeschrieben im Track-12-Commit |
| **HANDOFF_COMMIT** | Commit, in dem dieses Dokument zuletzt geschrieben wurde | Track 12, Abrechnung und Finanzfluesse |
| **ORIGIN_MAIN** | `origin/main` nach `deploy.sh` (Remote-Wahrheit) | per `git rev-parse origin/main` pruefen |

> Der Anker nennt bewusst `b99a893` und nicht den Track-12-Commit: ein
> Dokument kann den Hash des Commits, der es enthaelt, nicht enthalten.
> `b99a893` ist der Stand, GEGEN den Track 12 geprueft hat.

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

**Letzter Code-Commit** (der letzte Commit, der Anwendungscode anfasst): `175ee7f`

**Phase-8.6-Commits (Alltagsengel):**

| Commit | Inhalt |
|---|---|
| `fc47b46` | SEPA-Einzug: Erlaubnisliste, frozen_at-Tor, Soft-Delete-Filter, CAS-Guard (B-5..B-8) |
| `8f63d93` | Rechnungsversand: PDF-Fehlschlag protokolliert (V-1), CAS-Guard Festschreibung |
| `0220501` | Tests 3 Kernmodule (require-admin, transport, fehlerprotokoll) + FP-1/2/3 |
| `ee44ac4` | IK mandantenfest (IK-1/IK-2), budget_type-Umbuchung gestoppt (SR-1) |
| `ae5eeff` | Admin-Routen-Invariante (163 Faelle) |
| `175ee7f` | Docs: Phase 8.6 im MASTER_HANDOFF |

**Phase-8.5-Commits (Alltagsengel):**

| Commit | Inhalt |
|---|---|
| `bd4d8b7` | T-0: Schema-Drift-Check in CI + Precommit-Guard (warn-only); Falsch-Gruen beim Schema-Abruf geschlossen |
| `fbc05cc` | Tests fuer 5 ungetestete lib-Kernmodule; Sanitizer-Leck `permission denied for relation/view` geschlossen |
| `2147320` | Mitgliedschafts-Orakel im Coach-Freigabeweg gedeckelt; Apple-App-Site-Association Content-Type |
| `aa76da3` | Altbefunde F-1 und F-2 geschlossen, C-1 belegt; neuer Befund RL-1 gefixt |

**Phase-8.4-Commits (Alltagsengel):**

| Commit | Inhalt |
|---|---|
| `06c27b9` | Token-Enforcement, Audit-Trail, Control-Center-Fix, Tests |
| `a224175` | Phase 8.4 Production Readiness Bericht |

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
| Tests | vitest **6.527** + node:test **2.211** = **8.738** (vorher 8.300, **+438**) |
| Testlaeufe | node:test 2.211 gruen / 0 rot -- vitest 6.527 gruen / 0 rot (nacheinander gelaufen, nicht gleichzeitig, nicht parallel zum Typecheck) |
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
- Migrationen: 227+ angewendet -- **inkl. `20261004000000`** (neu in 6B), **`20261005000000`** (Phase 8.4 LIVE) und **`20261006000000`** (Phase 8.6 LIVE)
- Tabellen: 310, davon **310 mit RLS** (100 %)
- org_fence RESTRICTIVE: alle relevanten Tabellen, 2 dokumentierte Ausnahmen
  (`organization_members`: Multi-Org-Verwaltung; `state_waitlist`: oeffentlich)
- anon writes: 0
- Storage: 7 Buckets gehaertet (file_size_limit + MIME-Allowlist)
- DTA-Policies: org-scoped (`foldername[2] = current_org_id`)
- **Migration `20261005000000` LIVE_VERIFIZIERT (Phase 8.4):** Angewendet via
  Supabase MCP `apply_migration`. Beide Tabellen existieren, 13+11 Spalten,
  4+2 CHECK-Constraints, 2+2 FK-Constraints, 4+2 Indexes (inkl. 2 UNIQUE partial),
  RLS aktiv, je 2 Policies (admin + org_fence RESTRICTIVE), 0 Zeilen.

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
| **SEPA Doppeleinzug-Sperre** (Phase 8.6) | `20261006000000` | Partieller UNIQUE-Index `uq_sepa_batch_items_invoice_offen` existiert live; 0 Duplikate vor Anlage; `WHERE status IN ('offen','eingezogen')` |
| **CAMT-Trockenlauf schreibt nichts** (Phase 7) | -- | Gegen echtes Postgres (PGlite): Zeilenzahlen vor/nach identisch, plus Gegenprobe |
| CAMT Parser App-seitig | diverse | 961-Zeilen E2E-Suite gruen |
| Anforderungskatalog DiPA | `5b7fe21` | 60 Tests, 6 pure functions |
| P1-4 Testabdeckung Welle 6 | `0e8418f` | 358 neue Tests, 15 Dateien |
| Client-Upload-Validierung | `354b056` | SVG blockiert, HEIC erlaubt |

---

## 4-0. Haerte-Tracks 8-12 (28.08.2026) -- die Serie nach Phase 8.6

Fuenf aufeinander aufbauende Sicherheits-Tracks. Jeder hat einen eigenen
Bericht unter `docs/reports/`; hier steht nur, welche Frage er beantwortet
hat und was offen blieb.

| Track | Angriffsflaeche | Befunde | Bericht |
|---|---|---|---|
| 8 | Tourenplanung und Einsatzdokumentation | 1 P1, 11 Negativbefunde | `track-8-tourenplanung-audit.md` |
| 9 | Personalverwaltung und Berechtigungssystem | 1 P0, 1 P1, 1 P2, 13 Negativbefunde | `track-9-personalverwaltung-audit.md` |
| 10 | Subjekt-/Objektbindung innerhalb des Mandanten (BOLA) | 2 P1, 3 P2, 9 Negativbefunde | `track-10-subjektbindung-audit.md` |
| 11 | Betroffenenrechte und Loeschkette (DSGVO Art. 15/17) | 3 P1, 2 P2, 1 P3, 8 Negativbefunde | `track-11-loeschkette-audit.md` |
| 12 | Abrechnung und Finanzfluesse | 3 P1, 3 P2, 1 P3, 12 Negativbefunde | `track-12-abrechnung-finanzfluesse-audit.md` |

### Warum Track 12 eine andere Frage stellt als 1-11

Die Tracks 1-11 haben nacheinander „**wer darf welche Daten sehen und
schreiben**" geschlossen. Track 12 fragt: **stimmt der Betrag?** Ein
Zugriffsaudit kann das prinzipiell nicht beantworten -- wer eine Zeile
schreiben *darf*, kann sie mit einem falschen Wert schreiben, und der Weg
sieht in jedem Zugriffstest korrekt aus. Alle Befunde des Tracks liegen
deshalb **hinter** einer bestandenen Berechtigungspruefung.

### Track 12 -- die drei P1

**B1 -- Die Registrierung war das offene Gegenstueck zur Track-9-Sperre.**
Track 9 hat `angels.hourly_rate`, `qualification`, `is_certified` und
`is_45b_capable` fuer `authenticated` an der Datenbank verriegelt (live
bestaetigt ueber `has_column_privilege`). Im selben Zug wanderte
`registerAsEngel` auf den Admin-Client, der die Sperre umgeht -- als
`upsert` auf `id`, also idempotent, und mit einem `requireAuth()`, das nur
prueft, DASS jemand angemeldet ist. Ein laengst registrierter Engel konnte
die Server Action erneut aufrufen und genau diese vier Spalten frei setzen.
Jetzt: Stundensatz aus der Serverkonstante, Bestand lesen, danach nur noch
die vier selbstgepflegten Felder fortschreiben, fail-closed bei Lesefehler.

**B2 -- „Unterschrieben" ohne Unterschrift, an der Datenbank vorbei.** Die
Unterschriftspflicht wurde nur auf der SCHREIBENDEN Seite durchgesetzt.
Daneben liegt ein zweiter Weg: `authenticated` hat live UPDATE auf
`service_records`, und die Policy `sr_engel_own` ist FOR ALL -- permissive
Policies werden ODER-verknuepft, die daneben liegende Statusbeschraenkung
der Policy `service_records_caregiver_update` ist damit wirkungslos. Ein
`PATCH` auf `proof_status` macht den eigenen Nachweis abrechenbar, ohne
dass `compute_signature_hash` laeuft (der verlangt `client_signed_at`), und
die Rechnungs-RPC laesst den blossen Statuswert als Unterschrift gelten.
Ueber `/api/billing/auto-invoice` -- das die Pflegekraft mit
Native-Bearer-Token aufrufen darf -- laeuft die Kette bis zur fertigen
Rechnung durch. Jetzt: `assertBelegteNachweise` in `createInvoiceDraft`,
der einen Stelle, durch die jeder Rechnungsweg laeuft; dazu Migration
`20261017000000` (Beleg-Trigger + Entfernen von `sr_engel_own`).

**B5 -- Ein Nachtdienst erzeugt eine Rechnungsposition, die Geld abzieht.**
`service_records.duration_minutes` ist eine GENERATED-Spalte
`(end_time - start_time)/60` und bestimmt den Rechnungsbetrag. Kein CHECK
und keine Anwendungspruefung verlangte `end_time > start_time`. 22:00-06:00
ergibt `-960` Minuten und damit einen negativen Rechnungsbetrag.
`angel_availability` traegt genau diesen CHECK bereits -- fuer
`service_records` fehlte er. Latent: live 0 betroffene Zeilen.

### Track 12 -- Bestandsbefund, LIVE_VERIFIZIERT

**Der Manipulationsschutz auf `service_records` hat noch nie gegriffen.**
Von 30 Zeilen traegt KEINE `signature_hash` oder `client_signed_at`;
`is_locked` ist ueberall FALSE -- auch auf den 15 bereits abgerechneten.
`prevent_locked_record_change` schuetzt derzeit nichts, weil er
vollstaendig daran haengt, dass `compute_signature_hash` vorher lief. Vier
Nachweise tragen ueberhaupt keinen Unterschriftsnachweis, einer davon ist
`invoiced`. Bewusst NICHT durch einen Backfill vorweggenommen: ob
nachtraeglich zu unterschreiben, zu stornieren oder als Altbestand zu
belassen, ist eine aufbewahrungsrechtliche Entscheidung (§ 630f BGB).

### Track 12 -- Migrationen: EINGECHECKT, NICHT ANGEWENDET

| Datei | Wirkung |
|---|---|
| `20261017000000_abrechnungsintegritaet_leistungsnachweis.sql` | Beleg-Trigger, Zeitfenster-CHECK, entfernt `sr_engel_own` |
| `20261017000002_obergrenze_angebotstyp.sql` | PfluV-Obergrenze nach Angebotstyp statt Gleichstand |

Beide mit Rollback. Beide verletzen heute **null** Bestandszeilen. DDL ueber
den Dienstschluessel wird live mit `42501` abgewiesen -- Ausfuehrung nur
manuell im SQL-Editor.

### Track 12 -- neues Live-Pruefskript

`npm run verify:abrechnung` (`scripts/verify-abrechnung-live.mjs`) prueft
nur lesend gegen die Produktion: Track-9-Spaltensperre, effektive Rechte auf
acht Geldtabellen, `anon`-Zugriff auf neun Tabellen, die FOR-ALL-Policy aus
B2, die Auswahl des Obergrenzen-Triggers, negative Einsatzdauern und den
Unterschriftsbeleg im Bestand. **5 von 7 bestanden**, 2 Berichte. Die zwei
offenen Punkte sind genau die beiden nicht angewendeten Migrationen; das
Skript schreibt das selbst in seine Schlussmeldung.

### Stand der Pruefungen nach Track 12

| Pruefung | Ergebnis |
|---|---|
| `tsc --noEmit` | **0 Fehler** |
| `vitest run` | **7.855 gruen / 0 rot** (vorher 7.809) |
| `npm run test:unit` (node:test) | **2.513 gruen / 0 rot** |
| `npm run lint:forbidden` | **0 Treffer** (24.811 Dateien) |
| `npm run lint:route-auth` | **0 Treffer** (412 Routen) |
| `npm run lint:org-id` | **0 Treffer** (1.419 Dateien) |

---

## 4a00. Zuletzt erledigte Arbeiten -- Phase 8.6, Geldwege (27.08.2026)

Fuenf Befunde, alle in der Kategorie „laeuft durch und ist falsch" -- keiner
haette einen Fehler geworfen, jeder haette Geld in die falsche Richtung
bewegt. Alle mit Gegenprobe belegt (Fix zurueckgenommen ⇒ Test rot).

**Track 4 — SEPA-Lastschrifteinzug** (`fc47b46`)

`createSepaBatch()` entschied ueber eine SPERRliste, welche Rechnungen
eingezogen werden. Der Status-Automat kennt fuenfzehn Status; auf der Liste
standen sechs. Einziehbar waren dadurch unter anderem `geprueft` (nicht
festgeschrieben, nie beim Kunden), `strittig` (der Kunde bestreitet die
Forderung gerade), `korrektur_erforderlich` (die Rechnung ist bekannt falsch)
und `gekuerzt` (der offene Betrag steht nicht fest). Jetzt eine
ERLAUBNISliste: `freigegeben`, `uebermittelt`, `quittiert`,
`teilweise_bezahlt`.

Dazu drei weitere Loecher im selben Weg:
- **Kein Festschreibungstor.** Der Einzug war der einzige Aussenweg ohne
  `frozen_at`-Pruefung. Jetzt geprueft, redundant zum Status und bewusst so.
- **Kein Soft-Delete-Filter.** Geloeschte Rechnungen (`deleted_at`) wurden
  eingezogen -- Geld vom Konto fuer einen Vorgang, der nirgends mehr steht.
- **Doppelter Einzug bei parallelen Laeufen.** Die B-4-Sperre war ein
  Lesen-dann-Schreiben ohne Datenbank-Bedingung. Jetzt CAS-Guard nach dem
  Einfuegen (aeltester Posten je Rechnung gewinnt, der Verlierer nimmt den
  GANZEN Lauf zurueck) plus Migration `20261006000000` mit partiellem
  Eindeutigkeits-Index `WHERE status IN ('offen','eingezogen')`.

Regressionstests B-5 bis B-8 in `__tests__/billing/sepa-service-pglite.test.ts`.

**Track 3 — Rechnungsworkflow** (`8f63d93`)

`versendeRechnungPerEmail()` protokollierte jeden Ausgang in
`invoice_email_log` -- ausser einem: warf `erzeugeRechnungsPaket()` (fehlende
Schriftart, Storage nicht erreichbar), flog die Ausnahme am Protokollieren
vorbei nach oben. Beim automatischen Versand aus `freezeInvoice()` wird sie
dort zusaetzlich geschluckt: Rechnung festgeschrieben, Mail nie unterwegs,
`invoice_email_log` leer, `sent_at` leer -- und der Betrieb liest den
Zustellstand genau an diesen beiden Stellen ab. Ein PDF-Fehler ist jetzt
derselbe Fall wie ein Provider-Fehler: protokolliert, auditiert,
`status: 'fehlgeschlagen'`.

Zusaetzlich CAS-Guard `.is('frozen_at', null)` bei der Festschreibung. Der
Wettlauf lief bisher in den UNIQUE-Constraint auf `invoice_snapshots` --
ein Nebeneffekt einer fremden Bedingung, kein Vorsatz.

**Track 2 — Abrechnungslogik SGB XI: geprueft, keine Abweichung**

Entlastungsbetrag 131 EUR/Monat, gemeinsamer Jahresbetrag VP/KZP 3.539 EUR,
VP/KZP je 56 Tage ab 2025, PfluV-Obergrenzen 30/25 EUR -- alle Werte stimmen
und liegen versioniert (`lib/config/budget-constants.ts`,
`lib/billing/vpkzp/konstanten.ts`, Seed in `20260808110000`).
**Offen (P2, siehe Paragraph 7):** `billing_gesetzliche_obergrenzen` traegt die
PfluV-Saetze, wird aber von KEINEM Anwendungscode gelesen -- die Obergrenze
ist dokumentiert, nicht durchgesetzt. Der Seed ist zudem `bestaetigt = FALSE`;
eine Durchsetzung auf unbestaetigten Werten waere geraten.

**Track 1 — fuenf ungetestete Kernmodule** (`0220501`, `ee44ac4`)

| Modul | Tests | Dabei gefunden |
|---|---|---|
| `lib/abrechnung/require-admin.ts` | 20 | -- (Schranke vor ~25 Kassenrouten, war ungetestet) |
| `lib/abrechnung/transport.ts` | 21 | -- (Phase = Wiederholungsbremse jetzt festgehalten) |
| `lib/abrechnung/fehlerprotokoll.ts` | 26 | FP-1/2/3 |
| `lib/config/org-config.ts` | 14 | IK-1, IK-2 |
| `lib/admin/service-records.ts` | 11 | SR-1 |

- **FP-1** Die Uebergangstabelle kannte `erledigt` und `ignoriert` nicht, und
  die Pruefung lautete `if (erlaubt[current] && …)`. Ein Status ohne
  Tabelleneintrag hatte damit keine Beschraenkung -- ausgerechnet die beiden
  Zustaende, die als abgeschlossen gelesen werden, waren die einzigen ohne
  Riegel. Jetzt vollstaendig, mit leeren Listen als Endzustand.
- **FP-2** Der Zielstatus kam ungeprueft aus dem Anfragekoerper.
- **FP-3** Das UPDATE-Ergebnis wurde nur abgewartet, nicht ausgewertet: eine
  RLS-Sperre oder ein abgelehnter CHECK fielen still unter den Tisch, die
  Route meldete `{ success: true }`, und der Pruefpfad bekam einen Eintrag
  ueber einen Statuswechsel, den es nie gab.
- **IK-1** `app/api/leistungsnachweis/route.ts` rief `getOrgIK(admin)` OHNE
  Organisation auf, obwohl die aktive Organisation zwei Zeilen darueber
  geladen und fail-closed geprueft war. Jeder Leistungsnachweis eines zweiten
  Mandanten trug die IK von Alltagsengel.
- **IK-2** Der Env-Rueckfall `ALLTAGSENGEL_IK` galt fuer JEDE Organisation.
  Ein Mandant ohne gepflegte `ik_nummer` rechnete still unter fremdem
  Institutionskennzeichen ab. Jetzt nur noch fuer die Stamm-Organisation;
  fuer jede andere ein Abbruch.
- **SR-1** `saveServiceRecord()` wertete bei alten CHECK-Constraints nicht nur
  den Status ab, sondern stellte auch `budget_type` auf `entlastung` zurueck.
  Das ist keine Abwertung, sondern eine Umbuchung: eine Leistung auf
  Verhinderungspflege (Paragraph 39) oder auf Privatzahlung verbrauchte dann den
  Entlastungsbetrag nach Paragraph 45b. Zwei von drei Aufrufern werteten `degraded`
  ausserdem gar nicht aus. Der Budget-Topf wird jetzt NIE ersetzt -- statt
  dessen eine deutliche Fehlermeldung. Die Statusabwertung auf `draft` bleibt
  (sichtbar unfertig, nicht abrechenbar, Arbeit nicht verloren).

**Track 5 — Admin-Routen: geprueft, keine Luecke** (`ae5eeff`)

Alle Handler unter `app/api/admin/**` pruefen Anmeldung UND Berechtigung --
teils ueber einen Helfer (`requireAdmin`, `requireKimAdmin`, `requireSigAdmin`,
`requireAngehAdmin`, `checkAdmin`), teils inline. Neuer Regressionstest
`__tests__/security/admin-api-routen-guard.test.ts` (163 Faelle) haelt das
fest und wertet eine reine `auth.getUser()`-Pruefung ausdruecklich NICHT als
Schranke -- unter `/api/admin` ist auch jeder Kunde angemeldet.

**Stand:** Typecheck 0 Fehler, vitest 6.527 gruen, `npm run test:unit` 2.211
gruen. Migration `20261006000000` via Supabase MCP `apply_migration`
LIVE_VERIFIZIERT (partieller UNIQUE-Index existiert, 0 Duplikate).

---

## 4a0. Zuletzt erledigte Arbeiten -- Phase 8.5, Pruefinfrastruktur + Altbefunde (27.08.2026)

**Track 0 — Schema-Drift-Check verdrahtet** (`bd4d8b7`)

Der Check lief bisher nur von Hand. Er haengt jetzt an zwei Stellen:
CI (`.github/workflows/ci.yml`, Schritt im `verify`-Job) und
`scripts/precommit-guard.sh` — beide **warn-only**, weil Schema-Drift P2 ist
und kein Merge- oder Commit-Blocker sein soll.

Dabei ein **Falsch-Gruen im Check selbst** geschlossen: `scripts/schema-drift-check.mjs`
las das Live-Schema ohne Fehlerbehandlung. Ein HTTP 401 oder eine leere
OpenAPI-Antwort ergab ein leeres Schema — der Check uebersprang dann jede
Tabelle und meldete `✅ OK ... gegen 0 Live-Tabellen`. Jetzt: harter Abbruch,
und ohne Zugangsdaten eine laute `ÜBERSPRUNGEN`-Meldung statt eines gruenen
Laufs (vier Pfade einzeln geprueft).

> **Aktivierung in CI offen:** der Check braucht ein echtes PostgREST. Die
> Shadow-DB ist ein lokales Postgres ohne API-Schicht. Solange die Secrets
> `SCHEMA_DRIFT_SUPABASE_URL` + `SCHEMA_DRIFT_SUPABASE_SECRET_KEY` nicht
> gesetzt sind, meldet der Schritt in jedem Lauf sichtbar `ÜBERSPRUNGEN —
> NICHTS GEPRÜFT` (belegt in Run 33056319318). Lokal laeuft er vollstaendig:
> 1.307 Dateien gegen 333 Live-Tabellen, 0 Befunde.

**Track 2 — Tests fuer 5 ungetestete lib-Kernmodule** (`fbc05cc`)

166 der 421 `lib/`-Module hatten keinen Import in irgendeinem Test. Mehrere
davon galten als "getestet", weil eine Security-Suite ihren QUELLTEXT liest
und darin greppt — ein Grep sieht, dass eine Pruefung im Code steht, nicht
ob sie das Richtige durchlaesst. Nach Prioritaet (billing > payments >
dunning > invoices > sepa > camt > datev > auth) getestet:

| Modul | Tests | Was jetzt bewacht ist |
|---|---|---|
| `lib/abrechnung/edifact-validator.ts` | 37 | IK-/KVNR-Pruefziffern, Zaehlerabweichungen (UNZ/UNH, UNT), Summenabgleich ELS↔IAF↔GES, Testdatei-Indikator, doppelte Belegnummern |
| `lib/billing/tarif-verifizierung-service.ts` | 31 | Beleg eines FREMDEN Mandanten → 403, Beleg fremder Zeile → 400, Ruecknahme loest die Belegzuordnung, Org-Fence beider Preistabellen |
| `lib/billing/datev/export-service.ts` | 26 | fail-closed: bei fehlgeschlagener Pruefung landet NICHTS im Storage; Duplikat-Gate, Periodenfehler, Org-Fence in Liste und Download |
| `lib/api/cron-auth.ts` | 23 | 10 abgelehnte Header-Formen, `Bearer undefined` ohne gesetztes Geheimnis, Laengenpruefung vor `timingSafeEqual` |
| `lib/abrechnung/versand-guard.ts` | 10 | wirft statt `return false`; gelb blockiert nicht, `erstversand` blockiert sich nicht selbst |

Der geteilte Supabase-Doppelgaenger (`__tests__/helpers/supabase-fake.ts`) hat
jetzt einen **Storage-Rekorder**. Ohne ihn laesst sich bei einem fail-closed-Pfad
nur der geworfene Fehler pruefen — nicht die eigentliche Aussage: *es wurde
nichts abgelegt*.

**Dabei gefunden und gefixt:** `lib/utils/api-error.ts` maskierte
`permission denied for table|schema|function`. Postgres schreibt je nach
Objektart aber auch `... for relation`, `... for view`, `... for sequence` —
diese Meldungen gingen samt Tabellennamen an den Client.

**Track 3 — TODO/FIXME/HACK** (`2147320`)

Vollscan ueber `lib/`, `app/`, `components/`, `supabase/`: **im Quellcode
kein einziges echtes TODO/FIXME/HACK.** Die Treffer waren
(a) BIC-Testwerte, die die Zeichenfolge zufaellig enthalten (`QNTODEB2XXX`),
(b) ein veralteter Git-Worktree unter `.claude/worktrees/` (untracked,
detached `c8b5cf3`, nicht angefasst — moeglicherweise eine Parallel-Session),
(c) zwei Hinweise in bereits angewendeten Migrationen (nicht editierbar,
Historie).

Zwei echte offene Punkte kamen dabei heraus:

| # | Befund | Status |
|---|---|---|
| **CO-1** | Mitgliedschafts-Orakel: ein angemeldeter Coach-Nutzer konnte per Ausprobieren feststellen, ob eine beliebige E-Mail ein PflegeCoach-Konto hat. In `20260916000000` als bekannte, offene Einschraenkung vermerkt. | **GEFIXT** — Deckel 10 Suchen/Stunde **je Nutzer** (nicht je IP: geteilt im Praxis-Netz, wechselbar im Mobilfunk), persistent ueber Instanzen. 6 Tests. |
| **DL-1** | `.well-known/apple-app-site-association` wurde live als `application/octet-stream` ausgeliefert (Datei ohne Endung). Apple verlangt `application/json` — Universal Links konnten gar nicht verifizieren. | **GEFIXT + LIVE BELEGT** (`content-type: application/json`, `x-vercel-id: fra1::mt2nn-…`). |

> **DL-2 bleibt offen (BUSINESS_INPUT_REQUIRED):** beide Deep-Link-Dateien
> tragen Platzhalter — `assetlinks.json` den Text
> `TODO:REPLACE_WITH_ACTUAL_SHA256_FINGERPRINT`, die AASA die appID
> `TEAMID.care.alltagsengel.app`. Der echte SHA-256-Fingerabdruck des
> Android-Signaturschluessels und die Apple-Team-ID liegen ausserhalb des
> Repos (`keystore.properties` ist gitignored). **Nicht erfindbar** —
> Deep Links verifizieren bis dahin nicht, Links oeffnen im Browser statt in
> der App. Kein Datenrisiko.

**Track 4 — Altbefunde F-1, F-2, C-1** (`aa76da3`)

| # | Frage | Ergebnis |
|---|---|---|
| **F-1** | fixbar ohne Geschaeftslogik-Entscheidung? | **JA, gefixt.** Die Entscheidung faellt ohnehin die Datenbank (`uq_zahlungseingaenge_org_buchungshash`, 20261003000000) — sie wurde nur mit einem nackten `23505` durchgesetzt, landete in `nichtGespeichert` und setzte den ganzen Import auf `fehler`, obwohl nichts fehlte. Jetzt: Dublette innerhalb derselben Datei wird vorher erkannt, gezaehlt (`dateiDublettenUebersprungen`) und benannt. 4 Tests inkl. Gegenprobe. |
| **F-2** | fixbar? | **TEILWEISE, der eindeutige Teil ist gefixt.** Dass eine Ruecklastschrift NICHT auf den regulaeren Stufenabstand wartet, ist Absicht — die Gate-Punkte 5/9/10 wuerden hier das Falsche tun. Eine **manuelle Mahnsperre** (`block_dunning`) ist etwas anderes: sie wurde stillschweigend uebergangen, der Kunde sprang beim Aufheben der Sperre ohne Zwischenschritt auf `mahnung_1`. Jetzt: Stufe bleibt stehen, Grund steht im Ergebnis und im Audit-Trail. Zusaetzlich der fehlende Org-Fence auf allen drei Mahn-Schreibzugriffen. 6 Tests inkl. Gegenprobe (rot ohne Fix). |
| **C-1** | echter Sicherheitsbefund? | **NEIN — die Bezeichnung ueberzeichnet.** Richtig ist, dass `pruefeMandantengrenze()` aus `camt-preflight.ts` nur im DRY_RUN-Weg laeuft. Ein Mandantenleck folgt daraus nicht: jede schreibende Abfrage dahinter (`matchBuchung`, `verarbeiteRuecklastschrift`) traegt ihren eigenen `organization_id`-Filter. Neu belegt fuer den teuersten Weg — die Ruecklastschrift mit fuenf Schreibwirkungen: 5 Tests am echten Route-Handler gegen echtes Postgres, Rechnung/Mandat/Lastschriftposten des fremden Mandanten bleiben unberuehrt. **Bleibt als Komfortbefund:** im buchenden Weg fehlt die fruehe, lesbare Warnung. |

**RL-1 (neu, beim Belegen von C-1 gefunden) — GEFIXT:**
`verarbeiteRuecklastschrift()` gab `erkannt: true` vorbelegt zurueck und setzte
es beim Ausgang „keine Lastschrift gefunden" **nie zurueck**. Der Aufrufer
entscheidet daran, ob die Buchung als verarbeitet oder als Klaerfall zaehlt —
eine nicht zuordenbare Ruecklastschrift kam deshalb als
`ruecklastschrift_verarbeitet` und als „zugeordnet" in der Antwort an, obwohl
nichts storniert, nichts wieder geoeffnet und keine Gebuehr gebucht wurde:
**Geld zurueck, Rechnung weiter `bezahlt`, niemand zustaendig.** Jetzt
`erkannt: false` (auch nach einem Abbruch mitten im Vorgang), und die Route
legt fuer diesen Fall einen echten **Klaerfall** an — dieselbe Behandlung, die
der normale Zahlungsweg an derselben Stelle schon hatte. Ein bestehender Test
hielt die Fehlbehandlung fest (`expect(r.erkannt).toBe(true)`) und wurde auf
den korrigierten Vertrag gezogen.

**Verifikation Phase 8.5:** Typecheck 0 Fehler, vitest 6.262 + node:test 2.211
= **8.473 Tests gruen**, Schema-Drift 0 Befunde, CI gruen.

**REAL_ACTIONS_EXECUTED: NONE**

---

## 4a. Zuletzt erledigte Arbeiten -- Phase 8.4, Production Readiness (27.08.2026)

Volldokumentation: **`docs/reports/PHASE8_4_PRODUCTION_READINESS.md`**

**Migration `20261005000000` LIVE_VERIFIZIERT** — 26/26 Pruefpunkte bestanden.

**3 Befunde gefunden und geschlossen:**

| # | Schwere | Befund |
|---|---|---|
| **B-1** | **P0** | Einmal-Freigabe war ausstellbar und wirkungslos: `pruefeSendeToken()`/`verbraucheSendeToken()` hatten keinen Aufrufer im Versandweg. Token-Enforcement jetzt in `versendeRechnungPerEmail()` verdrahtet (an `PILOT_ERSTVERSAND_FREIGEGEBEN` gebunden). |
| **B-2** | **P1** | Token-Lebenslauf ohne Audit-Trail. Jetzt in `billing_audit_trail`: Erteilung, Verbrauch, Ablehnung, Entwertung. |
| **B-3** | **P1** | `sent_at` galt als Beweis fuer erfolgten Versand. Die 3 Seed-Rechnungen trugen `sent_at` ohne `frozen_at` und ohne Protokollzeile — Control Center meldete faelschlich VERIFIED. Jetzt nur noch `versendetBelegt` (sent_at + Protokolleintrag). |

**Verifikation:** Migration 26/26, Control Center 14/14 (APPROVAL nicht mehr BLOCKED),
Resend-Kette komplett, alle Produktions-Schalter nicht gesetzt (via `vercel env ls`),
Typecheck 0, vitest 6089 + node:test 2211 = 8300 gruen.

**REAL_ACTIONS_EXECUTED: NONE**

---

## 4b. Phase 8.3, alle 10 Tracks (27.08.2026)

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

## 4c. Phase 8.2, alle 12 Tracks (26.08.2026)

Volldokumentation: **`docs/reports/PHASE8_2_LIVE_PILOT_FINAL_READINESS.md`**
Detailberichte: `PHASE8_2_TRACKS_1-6.md` -- `PHASE8_2_TRACKS_7-12.md`

Phase 8.2 schliesst die Live-Pilot-Vorbereitung ab. Alle technischen Blocker
sind beseitigt, alle Sicherheitsmechanismen verifiziert.

**Korrektur:** Phase 8.2 meldete Migration `20261005000000` faelschlich als LIVE.
Phase 8.3 widerlegte das. **Phase 8.4 hat sie korrekt angewendet** (via Supabase MCP).

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

## 4d. Phase 8, alle 10 Tracks (26.08.2026)

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

## 4e. Phase 7 -- alle 8 Tracks (25./26.08.2026)

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

## 4f. Phase 6B (25.08.2026)

Volldokumentation: **`docs/reports/PHASE6B_TECHNICAL_PROGRESS.md`**

Track 1: Migration `payment_allocation_rueckzahlung` -- LIVE angewendet und
verifiziert. Track 2: Geldrundung -- 21 Stellen umgestellt, `centRunden()`
eingefuehrt, zwei echte Bugs gefunden. Track 3: DATEV + Tarif-Verifizierung
auf PGlite -- Shim erweitert, zwei neue Suiten, zwei echte Bugs gefunden.

---

## 5. Gefundene und behobene Produktionsbefunde

**41 Befunde insgesamt** ueber Phasen 6A--8.5 gefunden und behoben bzw. benannt.

### Phase 8.5 -- 5 Befunde (4 gefixt, 1 BUSINESS_INPUT_REQUIRED)

| # | Track | Befund | Schwere |
|---|---|---|---|
| **RL-1** | 4 | Nicht zuordenbare Ruecklastschrift galt als verarbeitet: `erkannt` war auf `true` vorbelegt und wurde nie zurueckgesetzt. Geld zurueck, Rechnung weiter `bezahlt`, kein Klaerfall. | **P1 Geld / GEFIXT** |
| **SD-1** | 0 | `schema-drift-check.mjs` meldete bei 401 oder leerer OpenAPI-Antwort `✅ OK ... gegen 0 Live-Tabellen` — ein nicht durchgefuehrter Check sah aus wie ein bestandener. | MITTEL / **GEFIXT** |
| **AE-1** | 2 | `safeDbError()` maskierte nur `permission denied for table\|schema\|function`; `... for relation/view/sequence` ging samt Tabellenname an den Client. | GERING / **GEFIXT** |
| **CO-1** | 3 | Mitgliedschafts-Orakel im Coach-Freigabeweg ohne Rate-Limit (in `20260916000000` als offen vermerkt). | GERING / **GEFIXT** |
| **DL-2** | 3 | Deep-Link-Dateien tragen Platzhalter (Android-Fingerabdruck, Apple-Team-ID). Verifizierung schlaegt fehl, Links oeffnen im Browser. | GERING / **BUSINESS_INPUT_REQUIRED** |

Zusaetzlich aus Phase 8/8.2 geschlossen: **F-1** (gefixt), **F-2** (der
eindeutige Teil gefixt), **C-1** (geprueft — kein Mandantenleck, siehe 4a0).

### Phase 8.4 -- 3 Befunde, alle gefixt

| # | Track | Befund | Schwere |
|---|---|---|---|
| **B-1** | 4 | Token-Enforcement fehlte: `pruefeSendeToken()`/`verbraucheSendeToken()` hatten keinen Aufrufer im Versandweg | **P0 Geld** |
| **B-2** | 7 | Token-Lebenslauf (Erteilung/Verbrauch/Entwertung) ohne Audit-Trail | **P1 Audit** |
| **B-3** | 1 | `sent_at` galt als Beweis; Seed-Daten taeuschen Control Center | **P1 Funktion** |

### Phase 8.3 -- 4 Befunde (2 gefixt, 2 Beobachtungen)

| # | Track | Befund | Schwere |
|---|---|---|---|
| **T3-1** | 3 | Token→Versandweg nicht verdrahtet (geschlossen durch B-1 in Phase 8.4) | **P0** |
| **I-1** | 9 | Idempotenz-Key hatte 0 Tests, 2 ergaenzt | **MITTEL / GEFIXT** |
| **R-1** | 6 | replyTo nie gesetzt | GERING / Beobachtung |
| **R-2** | 6 | Kein Apex-SPF | Info |

### Phase 8.2 -- 7 Befunde (1 gefixt, 6 Beobachtungen)

| # | Track | Befund | Schwere |
|---|---|---|---|
| **C-1** | 7 | Cross-Tenant-Check fehlt im Live-Import-Route (Preflight prueft, Live-Route nicht) | **GEPRUEFT in 8.5: kein Mandantenleck** — alle Schreibwege sind org-gefenced, 5 Tests am echten Handler. Bleibt als Komfortbefund (fehlende fruehe Warnung). |
| **D-3** | 12 | Format-Validierung Beraternummer/Mandantennummer fehlte | MITTEL / **GEFIXT** |
| **C-2** | 7 | CdtDbtInd-Fallback auf CRDT bei fehlendem Tag | GERING / Beobachtung |
| **C-3** | 7 | Sts-Fallback auf BOOK bei fehlendem Tag | GERING / Beobachtung |
| **C-4** | 7 | CAMT-Freigabe global (env), nicht pro Datei | GERING / Beobachtung |
| **D-1** (P8.2) | 12 | Windows-1252 Header deklariert, UTF-8 erzeugt | GERING / Offen |
| **D-2** (P8.2) | 12 | Kein Audit-Trail bei DATEV-Config-Aenderungen | GERING / Offen |

### Phase 8 -- 3 Befunde + 2 Selbstkorrekturen

| # | Track | Befund | Schwere |
|---|---|---|---|
| **F-1** | 5 | CAMT: Datei-interne Dublette nicht erkannt. DB-UNIQUE faengt, aber mit kryptischem `23505`. | **GESCHLOSSEN in 8.5** (`aa76da3`) |
| **F-2** | 7 | Ruecklastschrift umgeht das Mahn-Gate. Setzt Mahnstufe direkt, ohne `advanceDunning()`. | **TEILS GESCHLOSSEN in 8.5** — Mahnsperre wird respektiert; der Stufenabstand bleibt bewusst uebersprungen (`aa76da3`) |
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
| ~~E6~~ | ~~Migration `20261005000000_pilot_send_gate.sql`~~ | **ERLEDIGT Phase 8.4:** via Supabase MCP `apply_migration` angewendet und LIVE_VERIFIZIERT. |

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

**Kein technischer P0/P1 im Alltagsengel-Repo offen.** Migration
`20261005000000` ist LIVE_VERIFIZIERT (Phase 8.4). T-1 bis T-4 des
6A-Handoffs sind erledigt; die Phase-7- und Phase-8-Befunde sind saemtlich
behoben oder als benannte Grenzen dokumentiert (Paragraph 5).

**Wartet auf den SQL-Editor:** `20261006000000_sepa_batch_items_kein_doppelter_einzug.sql`
(partieller Eindeutigkeits-Index gegen den doppelten Lastschrifteinzug).
Solange sie nicht eingespielt ist, haelt allein der CAS-Guard in
`createSepaBatch()` -- er deckt den Anwendungsweg ab, aber nicht ein Skript
oder den SQL-Editor. Vorpruefung auf bereits vorhandene Dubletten steht im
Kopf der Migration.

| # | Problem | Prioritaet |
|---|---|---|
| ~~T-0~~ | ~~Schema-Drift-Check nicht verdrahtet.~~ **Erledigt in Phase 8.5** (`bd4d8b7`). | erledigt |
| **T-1** | **~25 ungetestete `lib/`-Module stehen noch aus** (Phase 8.6 hat fuenf davon geschlossen und dabei fuenf Befunde gefunden -- FP-1/2/3, IK-1/2, SR-1). Vier Phasen in Folge haben gezeigt, was dort liegt. Naechste nach Gewicht: `lib/abrechnung/health.ts` (421 Z.), `lib/abrechnung/sgb-v/storno-korrektur.ts` (179 Z., Geld), `lib/abrechnung/sgb-v/ruecklaufer-service.ts`, `lib/stripe/helpers.ts`, `lib/offline/offline-queue.ts`. | P2 |
| **T-9** | **PfluV-Obergrenzen sind dokumentiert, aber nicht durchgesetzt.** `billing_gesetzliche_obergrenzen` (Seed `20260808110000`: 30 EUR/Std Betreuung, 25 EUR/Std Hauswirtschaft) wird von KEINEM Anwendungscode gelesen -- der Preisweg prueft keine gesetzliche Obergrenze. Heute folgenlos, weil die Tarif-Verifizierung fail-closed sperrt (nur 1 Kassentarif `verified`). Vor einer Durchsetzung muss der Seed bestaetigt werden: er steht auf `bestaetigt = FALSE`, die PfluV-Novelle war in der Verbaendeanhoerung. **Kein Wert darf hier geraten werden.** | **P2** |
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
| `pilot_send_gate` Tabelle | Faelschlich LIVE gemeldet | **LIVE_VERIFIZIERT** (Phase 8.4 via Supabase MCP) |
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
