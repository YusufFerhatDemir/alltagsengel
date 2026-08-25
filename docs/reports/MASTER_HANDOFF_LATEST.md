# MASTER HANDOFF — Stand 25.08.2026, nach Phase 6A

Dieses Dokument ist die einzige Wahrheitsquelle für den technischen Zustand
beider Produkte. Jede neue Session liest zuerst diese Datei.

---

## 0. Commit-Anker

Die drei Werte müssen **identisch** sein. Weichen sie ab, beschreibt dieses
Dokument nicht den Stand, der tatsächlich deployed ist — dann zuerst
`git log`/`git fetch` prüfen, bevor irgendeiner Aussage unten geglaubt wird.

| Anker | Bedeutung | Wert |
|---|---|---|
| **CODE_HEAD** | lokaler `main`-HEAD | `17272f0` |
| **HANDOFF_COMMIT** | Commit, in dem dieses Dokument zuletzt geschrieben wurde | `17272f0` |
| **ORIGIN_MAIN** | `origin/main` nach `deploy.sh` (Remote-Wahrheit) | `17272f0` |

Prüfbefehl:

```bash
git rev-parse HEAD && git rev-parse origin/main
```

> **Zur Lesart der Anker.** Ein Dokument kann den Hash des Commits, der es
> selbst enthält, nicht im Voraus nennen. Die Anker wurden deshalb im
> unmittelbar folgenden `docs:`-Commit nachgezogen. **`HEAD` genau einen
> `docs:`-Commit vor diesen Ankern ist erwartet und keine Drift.** Alles
> darüber hinaus — insbesondere jeder Commit, der Code anfasst — bedeutet:
> dieses Dokument ist älter als der deployte Stand.

**Letzter Code-Commit vor diesem Handoff:** `5ed3ae9`
— `test: T1 PGlite-Integrationstests P1-Batch (Geld/Abrechnung)`

---

## 1. Repository-Stand

### Alltagsengel

| Feld | Wert |
|---|---|
| Branch | `main` |
| HEAD | siehe **CODE_HEAD** oben |
| Letzter Code-Commit | `5ed3ae9` — T1 PGlite-Integrationstests P1-Batch |
| Typecheck | **0 Fehler** (`npx tsc --noEmit`, gemessen auf `5ed3ae9`) |
| Tests | vitest **5.232** + node:test **2.175** = **7.407** |
| CI | **GRÜN** auf `3cbae72`, `ebb95ee` und `5ed3ae9` (alle drei Phase-6A-Commits abgeschlossen) |
| lint:forbidden | 0 Treffer |
| Live | alltagsengel.care → HTTP 200 |

### ChairMatch

| Feld | Wert |
|---|---|
| Branch | `main` |
| HEAD | `1706c5d` |
| Letzter Commit | `CI: actions/checkout + setup-node auf v5 (Node-20-Deprecation)` |
| Typecheck | 0 Fehler |
| Tests | vitest 487/487 |
| CI | GRÜN (`1706c5d`) |
| Live | chairmatch.de → HTTP 200 |

> In Phase 6A **nicht angefasst**. Werte aus dem Handoff vom 25.08., 22:00;
> HEAD und CI-Status wurden neu gegengeprüft und stimmen noch.

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

---

## 2. Supabase-Status

### Alltagsengel (nnwyktkqibdjxgimjyuq)

- Status: ACTIVE_HEALTHY
- Migrationen: 225+ angewendet
- Tabellen: 308, davon **308 mit RLS** (100 %)
- org_fence RESTRICTIVE: alle relevanten Tabellen, 2 dokumentierte Ausnahmen
  (`organization_members`: Multi-Org-Verwaltung; `state_waitlist`: öffentlich)
- anon writes: 0
- Storage: 7 Buckets gehärtet (file_size_limit + MIME-Allowlist)
- DTA-Policies: org-scoped (`foldername[2] = current_org_id`)
- **1 Migration wartet auf Live-Apply** → siehe §7 T-1

### ChairMatch (pwdbjqfpgumyfktbfswg)

- Status: ACTIVE_HEALTHY
- Migrationen: 43 angewendet
- Tabellen: 80, davon **79 mit RLS** (`spatial_ref_sys` = PostGIS-System, kein Risiko)
- protect_pricing + compliance_plans: Schema vollständig, RLS an, 7 CHECK-Constraints

### efy care (nsfbwhpjesmathsrqkfi)

- Status: ACTIVE_HEALTHY
- Repo führt 12 Migrationsdateien (3.522 Zeilen)
- ⚪ **Abgleich „lokale Migrationen == angewandte Migrationen" steht aus**

---

## 3. LIVE_VERIFIZIERT (gegen Supabase geprüft, 25.08.2026)

| Track | Commit/Migration | Verifikation |
|---|---|---|
| RLS 308/308 | diverse | `pg_tables.rowsecurity` = 308 |
| org_fence alle Tabellen | `0a84ade` | Live-Query bestätigt |
| DTA Storage org-scoped | `3561ab4` | `pg_policies` zeigt org-Filter |
| Storage Bucket Hardening (7 Buckets) | `354b056` | `storage.buckets` zeigt Limits+MIME |
| CAMT Dublettensperre DB | `20261003000000` | UNIQUE INDEX existiert live |
| ChairMatch Pricing Schema | `20260824_pricing_schema` | Alle Spalten+Constraints+RLS live |
| CAMT Parser App-seitig | diverse | 961-Zeilen E2E-Suite grün |
| Anforderungskatalog DiPA | `5b7fe21` | 60 Tests, 6 pure functions |
| P1-4 Testabdeckung Welle 6 | `0e8418f` | 358 neue Tests, 15 Dateien |
| Client-Upload-Validierung | `354b056` | SVG blockiert, HEIC erlaubt |

> Phase 6A hat **keine** neuen Live-Verifikationen gegen Supabase hinzugefügt —
> die Arbeit lief gegen PGlite (echtes Postgres im Prozess) und den Quelltext.

---

## 4. Zuletzt erledigte Arbeiten — Phase 6A (25.08.2026)

Alle fünf offenen technischen Punkte T1–T5 des Vorgänger-Handoffs sind
abgearbeitet. Volldokumentation:
**`docs/reports/PHASE6A_TECHNICAL_PROGRESS.md`**

### T0 — Bestandsaufnahme

Die Zahl „~120 ungetestete Module" aus dem Vorgänger-Handoff hielt der Prüfung
nicht stand. Belastbares Kriterium („wird das Modul von einer Testdatei direkt
importiert", nicht „kommt der Name irgendwo vor"):

- 237 `lib/`-Module mit Supabase-Bezug
- davon **36** ohne direkten Testimport
- davon **6** in den P1-Kategorien Geld / Abrechnung / CAMT / Mandantentrennung

### T1 — PGlite-Integrationstests, P1-Batch ✅ `ebb95ee`, `5ed3ae9`

6 neue Testdateien, **149 Tests**, gegen echtes Postgres (PGlite/WASM).
**7 Produktionsbefunde gefunden und gefixt** → §5.

Zusätzlich geschlossen: eine **systematische Lücke im PGlite-Shim**. Er baute
immer `SELECT *` und schnitt die Spalten hinterher in JavaScript zu — eine
Spalte, die es gar nicht gibt, kam als `undefined` zurück und der Test blieb
grün. PostgREST antwortet mit `42703` und die Abfrage ist live tot. Genau das
deckte Befund B-1. Der Shim prüft jetzt flache **und** eingebettete Spaltenlisten
gegen `information_schema.columns`.

Benannte Grenze: `no_overlapping_tariffs` ist live ein `EXCLUDE USING gist` und
braucht `btree_gist` — das liefert PGlite nicht. Statt den Fall stillschweigend
grün laufen zu lassen, steht dort ein Stellvertreter-Trigger. Geprüft wird nur
die *Reaktion der Anwendung*; **ob der echte Constraint greift, beweist das
nicht.**

### T2 — `euroZuCent`-Rundung ✅ `3cbae72`

`Math.round(betrag * 100)` ist am exakten Halb-Cent falsch (`1.005 * 100` ist in
IEEE-754 `100.49999999999999` → 100 statt 101). Ersetzt durch **String-basierte
Dezimalverschiebung** in `lib/geld.ts` — keine neue Abhängigkeit.
`+ Number.EPSILON` ist im Modul ausdrücklich als **verworfene** Variante
dokumentiert (der Summand ist um Faktor 64 zu klein).

**37 geldrelevante Stellen zentralisiert, 36 Tests.**
⚠️ Nicht restlos — siehe §7 T-2.

### T3 — `debtorName` ✅ `3cbae72`

Das Feld wurde befüllt, aber nie gerendert: jede Mahnung ging mit „Sehr geehrte
Damen und Herren" hinaus. `mahnungAnrede()` erzeugt jetzt die persönliche,
geschlechtsneutrale Anrede („Sehr geehrte/r …"), mit Rückfall auf die
allgemeine Form bei leerem Namen. **12 Tests.**

### T4 — Signierte URLs ✅ `3cbae72`

Rechnungs-PDF **30 Tage → 10 Minuten**, an beiden Stellen über eine gemeinsame
Konstante `RECHNUNGS_PDF_URL_TTL_SEKUNDEN`. Die 30 Tage brachten keinen Nutzen:
`GET /api/rechnungen/[id]/pdf` signiert bei jedem Aufruf frisch, nach
Berechtigungsprüfung.

Vollbestand aller 12 Signierstellen: `docs/security/signierte-urls-audit.md`.
Positiv: nirgends `getPublicUrl()` — alle Buckets privat.
3 Stellen mit 7 Tagen sind **BUSINESS_INPUT_REQUIRED** → §6 B3.

### T5 — efy care Baseline ✅ (nicht committed, Fremdrepo)

tsc 0 · lint 0 · 177 Tests grün / 30 übersprungen · Build Exit 0 ·
RLS 41/41 auf Migrationsebene · kein Service-Role-Key im Client · keine Secrets.

**3 kritische Befunde:** Buchung schreibt nicht in die DB (`buchung/[id].tsx`),
Konto-Löschung ist ein TODO (**DSGVO Art. 17**), Prod-Migrationsstand
unverifiziert.

Bericht: `/Users/work/efy-care/docs/EFY_CARE_BASELINE_2026-08-25.md`.
Die dortige Freigabe-Aussage aus `audit/GO_NO_GO_REPORT_v2.md` wurde bewusst
**nicht** übernommen.

---

## 5. Gefundene und behobene Produktionsbefunde (Phase 6A / T1)

Sieben Befunde, alle in produktiv erreichbarem Code, alle gefixt. **Alle sieben
lagen in Modulen ohne einen einzigen Test** — das ist der Befund hinter den
Befunden.

| # | Befund | Wirkung | Bereich |
|---|---|---|---|
| **B-1** | `listMandates()` wählte `client_number` — die Spalte heißt `customer_number`. PostgREST: `42703`. | `GET /api/billing/sepa/mandates` lieferte **ausnahmslos** einen Fehler. SEPA-Mandatsliste live komplett tot. | Funktion |
| **B-2** | `createMandate()` las den Klienten **ohne** `organization_id`-Filter (service-role = BYPASSRLS). | Admin von Mandant A konnte ein SEPA-Mandat auf einen Klienten von Mandant B anlegen → **Abbuchung von fremdem Konto**. | Sicherheit |
| **B-3** | `createSepaBatch()` las `invoices.status`, wertete ihn aber nie aus. | **Entwürfe, Stornos und abgeschriebene Rechnungen wurden eingezogen** — Beträge, die dem Unternehmen nicht zustehen. | Geld |
| **B-4** | Nichts hinderte daran, dieselbe Rechnung in einen zweiten Sammelauftrag zu legen. | **Doppelte Abbuchung.** Die zweite ist eine unberechtigte Lastschrift — bis zu **13 Monate** rückholbar. | Geld |
| **R-1** | `allocation_type = 'rueckzahlung'` stand nicht im CHECK-Constraint → `23514`, Rückgabewert wurde nicht gelesen. | `payment_allocations` behauptete weiter „bezahlt", während `payments.allocated_cents` schon reduziert war. Beide Tabellen widersprachen sich nach **jeder** Rücklastschrift. | Geld |
| **X-1** | `correction_of`-Nachschlag in `loadInvoiceXRechnungData()` ohne Mandantenfilter. | **Fremde Rechnungsnummer** als BT-25 in der CII-Datei — in einem Dokument, das an einen Kostenträger geht. | Sicherheit |
| **M-1** | Upsert auf `monthly_closings` ohne `organization_id` → Default `current_org_id()` fällt bei service-role auf die Stamm-Org. | **Jeder** Monatsabschluss landete in der Stamm-Organisation; der Mandant sah ihn wegen `org_fence` nie. Im Test beweisbar reproduziert. | Mandanten |

**Mitgenommen bei B-4:** Die Mandatsauswahl je Klient ist jetzt deterministisch
(neuestes aktives Mandat). Vorher entschied die Reihenfolge der Datenbank,
**wessen IBAN** belastet wird, sobald zwei aktive Mandate existierten
(Kontowechsel).

**R-1 ist nur halb geschlossen:** Migration
`20261004000000_payment_allocation_rueckzahlung.sql` **wartet auf Live-Apply**.
Bis dahin greift ein dokumentierter Rückfall (Zuordnungszeile wird entfernt —
Bücher konsistent, Historie fehlt), der im Ergebnis sichtbar ist statt still zu
bleiben.

Details je Befund: `docs/reports/PHASE6A_TECHNICAL_PROGRESS.md` §3.

---

## 6. EXTERN_BLOCKIERT und BUSINESS_INPUT_REQUIRED

### EXTERN_BLOCKIERT

| # | Was | Wer/Wo |
|---|---|---|
| E1 | `RECHNUNGSVERSAND_AUTOMATISCH` nicht gesetzt | Vercel Environment Variables |
| E2 | `MAHNVERSAND_AUTOMATISCH` nicht gesetzt | Vercel Environment Variables |
| E3 | Erster CAMT-Import nie produktiv gelaufen | Braucht echte Bankdatei (camt.053/054) + begleiteten Import |
| E4 | Erster Rechnungsversand nie produktiv | `invoice_email_log` = 0, Resend funktionsfähig aber nie genutzt |
| E5 | §45a Bayern Antrag unvollständig | Landesamt für Pflege, Erinnerung erhalten 24.08.2026 |

### BUSINESS_INPUT_REQUIRED

| # | Was | Details |
|---|---|---|
| B1 | ChairMatch Preise festlegen | `protect_pricing` + `compliance_plans` strukturell fertig, Tabellen leer. Beträge aus `20260310` sind Entwurfswerte und gelten NICHT. Befüllung über `supabase/seed/pricing.seed.template.sql` |
| B2 | Geldpfade Erstbetrieb | `payments` = 0, `camt_imports` = 0 — System gebaut und getestet, aber nie mit echtem Geld gelaufen |
| **B3** | **3× Signaturlaufzeit 7 Tage entscheiden** (neu aus T4) | `lib/upload-document.ts` (Ausweis/Führungszeugnis/Versicherung), `lib/upload-service-proof.ts`, `app/api/native/leistungsnachweis-upload/route.ts`. Im Quelltext an Ort und Stelle markiert. Entweder Re-Signier-Route bauen (für `documents` existiert `getSignedDocumentUrl()` schon, nur ohne Oberfläche) **oder** 7 Tage bewusst als Restrisiko tragen — ein Link auf einen Personalausweis überdauert dann Rollenwechsel und Konto-Deaktivierung um bis zu sieben Tage. **Empfehlung: Re-Signier-Route für `documents`.** |
| **B4** | **`getOposListe()` zeigt Entwürfe im Forderungsbestand** (neu aus T1) | Ausgeschlossen sind nur die Endstatus. Wer die Altersstruktur als Forderungsbestand liest, überschätzt ihn um die Summe aller Entwürfe. Der Mahnlauf ist **nicht** betroffen (wählt selbst). Der Test hält den Ist-Zustand fest, damit eine Änderung auffällt; geändert wurde nichts. |

---

## 7. Echte offene technische Probleme

T1–T5 des Vorgänger-Handoffs sind **alle erledigt** und hier entfernt.
Was neu offen ist:

| # | Problem | Priorität |
|---|---|---|
| **T-1** | **Migration `20261004000000_payment_allocation_rueckzahlung.sql` wartet auf Live-Apply** (Supabase SQL-Editor). Bis dahin verliert jede Rücklastschrift ihre Zuordnungshistorie. Rollback liegt daneben (`…000001_rollback_…`). | **P1** |
| **T-2** | **T2-Rest: 3 geldrelevante Euro→Cent-Umrechnungen laufen weiter an `lib/geld.ts` vorbei** — `lib/billing/camt/camt-parser.ts:172` (Bankdaten!), `app/admin/gutschriften/page.tsx:86`, `app/admin/abrechnung/page.tsx:258`. Die übrigen `Math.round(… * 100)`-Treffer sind Prozentwerte/Anzeigerundung und kein Befund. | P2 |
| **T-3** | **DATEV-Export ungetestet** (`lib/billing/datev/export-service.ts`, `buchungssatz-generator.ts`). Braucht zuerst `.or(…)` und **zweistufig verschachtelte** eingebettete Ressourcen im PGlite-Shim. Eigener Batch, nicht als Nebenprodukt. | P2 |
| **T-4** | **`lib/billing/tarif-verifizierung-service.ts` ungetestet** — braucht ebenfalls `.or(…)` im Shim. | P2 |
| **T-5** | 30 der 36 ungetesteten `lib/`-Module (P2/P3-Kategorien) stehen noch aus. | P2 |
| **T-6** | `no_overlapping_tariffs` bleibt unter PGlite **unbeweisbar** (kein `btree_gist`). Nur gegen echtes Postgres prüfbar. | benannte Grenze |
| **T-7** | efy care: Buchung schreibt nicht in die DB; Konto-Löschung ist ein TODO (**DSGVO Art. 17**). Beides Funktionen, die dem Nutzer etwas zusagen, was nicht passiert. | **P1** (Fremdrepo) |
| **T-8** | efy care: Prod-Migrationsstand, RLS live, Edge-Function-Deploy und Secrets unverifiziert. Solange offen, ist jede Deploy-Freigabe dort eine Annahme. | P1 (Fremdrepo) |
| **T-9** | efy care: 30 HTTP-Isolationstests übersprungen (PostgREST/GoTrue/Storage-Schicht). Braucht Shadow-Supabase-Instanz + 2 Env-Vars in CI. | P2 (Fremdrepo) |

---

## 8. Nächster sinnvoller Schritt

**Zuerst der eine Handgriff, der eine halbe Sache ganz macht:**

1. **`20261004000000_payment_allocation_rueckzahlung.sql` im Supabase
   SQL-Editor anwenden** (T-1). Das ist der einzige Punkt aus Phase 6A, der
   ohne Yusuf nicht abschließbar ist — ein `ALTER TABLE … CHECK`, 36 Zeilen,
   Rollback liegt daneben. Danach ist R-1 vollständig geschlossen.

**Danach Phase 6B — Erstbetrieb der Geldpfade, begleitet.**

Diese Reihenfolge steht seit dem letzten Handoff und ist durch Phase 6A
**dringender** geworden: B-3 und B-4 zeigen, dass der SEPA-Einzug bis gestern
Entwürfe eingezogen und doppelt abgebucht hätte. Der Erstbetrieb sollte auf
dem gefixten Stand laufen, nicht davor.

2. `RECHNUNGSVERSAND_AUTOMATISCH` in Vercel setzen (E1)
3. Erster Rechnungsversand an echten Empfänger, `invoice_email_log` gegenprüfen
4. Erster begleiteter CAMT-Import mit echter Bankdatei — **vorher T-2
   erledigen**, denn der CAMT-Parser ist eine der drei Stellen, die noch an der
   zentralen Rundung vorbeilaufen
5. Erster SEPA-Sammelauftrag, gegen B-3/B-4-Fixes gegengeprüft

**Parallel, ohne externe Abhängigkeit:** T-3/T-4 — den PGlite-Shim um `.or(…)`
und verschachtelte Einbettungen erweitern, dann DATEV und
`tarif-verifizierung-service` testen. Das ist der nächste Batch nach dem Muster
von T1, und T1 hat gezeigt, was in ungetesteten Geldmodulen liegt.

**Für efy care getrennt zu entscheiden:** T-7 ist kein Testthema, sondern ein
Produktentscheid — Buchungs-Button anbinden oder deaktivieren, Konto-Löschung
bauen oder Menüpunkt entfernen.

---

## 9. Relevante Dateipfade

| Zweck | Pfad |
|---|---|
| **Phase-6A-Fortschrittsbericht** | `docs/reports/PHASE6A_TECHNICAL_PROGRESS.md` |
| T1-Detailbericht | `docs/T1-PGLITE-INTEGRATIONSTESTS-P1-2026-08-25.md` |
| Signierte-URL-Audit | `docs/security/signierte-urls-audit.md` |
| efy-care-Baseline (Fremdrepo) | `/Users/work/efy-care/docs/EFY_CARE_BASELINE_2026-08-25.md` |
| Status-Matrix | `docs/reports/STATUS_MATRIX_2026-08-25.md` |
| Abschlussbericht 25.08. | `docs/reports/MASTER_ABSCHLUSSBERICHT_2026-08-25.md` |
| Geldrundung (zentral) | `lib/geld.ts` |
| **Wartende Migration** | `supabase/migrations/20261004000000_payment_allocation_rueckzahlung.sql` |
| Rollback dazu | `supabase/migrations/20261004000001_rollback_payment_allocation_rueckzahlung.sql` |
| PGlite-Shim | `__tests__/e2e/helpers/pglite-supabase.ts` |
| Schemaaufbau Kettentests | `__tests__/e2e/helpers/kette-schema.ts` |
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
- `CRON_SECRET`

### ChairMatch (Vercel)
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`

### efy care (Supabase Function Secrets — Setzstatus ungeprüft)
- `ANTHROPIC_API_KEY`, `OCR_ENABLED`
- `STRIPE_PRICE_STARTER` / `_PRO` / `_SCALE`
- `SHADOW_SUPABASE_URL`, `SHADOW_SUPABASE_ANON_KEY` (CI, für die 30 Skips)

---

*Aktualisiert 25.08.2026 nach Phase 6A — Alltagsengel*
