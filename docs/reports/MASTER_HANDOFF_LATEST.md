# MASTER HANDOFF — Stand 25.08.2026, nach Phase 6B

Dieses Dokument ist die einzige Wahrheitsquelle für den technischen Zustand
beider Produkte. Jede neue Session liest zuerst diese Datei.

> ## Gesamtstatus: `TECHNICAL_READY_FOR_CONTROLLED_MONEY_PATH_PILOT`
>
> **Kein technischer P0 oder P1 im Alltagsengel-Repo ist mehr offen.** Alle
> Punkte T-1 bis T-4 aus dem Phase-6A-Handoff sind geschlossen; die einzige
> wartende Migration ist live und live nachgeprüft.
>
> **Was dieser Status bedeutet:** Der Erstbetrieb der Geldpfade kann
> **begleitet** beginnen — ein Rechnungsversand, ein CAMT-Import, ein
> SEPA-Sammelauftrag, jeweils gegengeprüft.
>
> **Was er nicht bedeutet:** Keine Freigabe für unbeaufsichtigten Regelbetrieb.
> `payments` = 0 und `camt_imports` = 0 — das System ist gebaut und getestet,
> aber **nie mit echtem Geld gelaufen**. Was noch aussteht, liegt außerhalb des
> Codes: zwei Vercel-Variablen, eine echte Bankdatei, ein echter Empfänger
> (§6). Für **efy care** (Fremdrepo) gilt dieser Status ausdrücklich **nicht** —
> dort stehen zwei P1 offen (§7 T-6/T-7).

---

## 0. Commit-Anker

Die drei Werte müssen **identisch** sein. Weichen sie ab, beschreibt dieses
Dokument nicht den Stand, der tatsächlich deployed ist — dann zuerst
`git log`/`git fetch` prüfen, bevor irgendeiner Aussage unten geglaubt wird.

| Anker | Bedeutung | Wert |
|---|---|---|
| **CODE_HEAD** | lokaler `main`-HEAD | `0a63657` |
| **HANDOFF_COMMIT** | Commit, in dem dieses Dokument zuletzt geschrieben wurde | `0a63657` |
| **ORIGIN_MAIN** | `origin/main` nach `deploy.sh` (Remote-Wahrheit) | `0a63657` |

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

**Letzter Code-Commit vor diesem Handoff:** `0a63657`
— `fix: Track 2+3 — Geldrundung Reststellen + DATEV/Tarif PGlite-Tests`

**Phase-6B-Commits:**

| Commit | Inhalt |
|---|---|
| `6ef8d7f` | Migration `20261004000000` transaktional (`BEGIN`/`COMMIT`) + Live-Verifikationsskript |
| `8a99e04` | Track 2 — Geldrundung Reststellen auf `lib/geld.ts` + Regressionssuite |
| `0a63657` | Track 2+3 — Rest der Geldrundung + DATEV-/Tarif-PGlite-Suiten |

---

## 1. Repository-Stand

### Alltagsengel

| Feld | Wert |
|---|---|
| Branch | `main` |
| HEAD | siehe **CODE_HEAD** oben |
| Letzter Code-Commit | `0a63657` — Track 2+3 |
| Typecheck | **0 Fehler** (`npx tsc --noEmit`, gemessen auf `0a63657`) |
| Tests | vitest **5.319** + node:test **2.211** = **7.530** |
| Testläufe | node:test 2.211 grün / 0 rot · vitest 5.319 grün / 38 übersprungen / 0 rot (nacheinander gelaufen, nicht gleichzeitig) |
| CI | GRÜN auf den Phase-6A-Commits; die drei 6B-Commits laufen nach diesem Deploy |
| lint:forbidden | **0 Treffer** (24.553 Dateien, FULL-Scan, gemessen auf `0a63657`) |
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
| Live | chairmatch.de → 308 → www.chairmatch.de → HTTP 200 |

> In Phase 6B **nicht angefasst**. Test- und Typecheck-Werte aus dem Handoff vom
> 25.08.; HEAD und Live-Erreichbarkeit wurden neu gegengeprüft und stimmen noch.

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
| ChairMatch Pricing Schema | `20260824_pricing_schema` | Alle Spalten+Constraints+RLS live |
| CAMT Parser App-seitig | diverse | 961-Zeilen E2E-Suite grün |
| Anforderungskatalog DiPA | `5b7fe21` | 60 Tests, 6 pure functions |
| P1-4 Testabdeckung Welle 6 | `0e8418f` | 358 neue Tests, 15 Dateien |
| Client-Upload-Validierung | `354b056` | SVG blockiert, HEIC erlaubt |

**Das Verifikationsskript ist nebenwirkungsfrei** — es liest ausschließlich über
das `_run_sql`-Lese-Orakel (`RAISE`-Fehlermeldung als Rückkanal) und schreibt
nichts. Es ist jederzeit wiederholbar.

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

### Phase 6B — vier neue Befunde, alle gefixt

| # | Befund | Wirkung | Schweregrad |
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

### EXTERN_BLOCKIERT

| # | Was | Wer/Wo |
|---|---|---|
| E1 | `RECHNUNGSVERSAND_AUTOMATISCH` nicht gesetzt | Vercel Environment Variables |
| E2 | `MAHNVERSAND_AUTOMATISCH` nicht gesetzt | Vercel Environment Variables |
| E3 | Erster CAMT-Import nie produktiv gelaufen | Braucht echte Bankdatei (camt.053/054) + begleiteten Import |
| E4 | Erster Rechnungsversand nie produktiv | `invoice_email_log` = 0, Resend funktionsfähig aber nie genutzt |
| E5 | §45a Bayern Antrag unvollständig | Landesamt für Pflege, Erinnerung erhalten 24.08.2026 |

> **Entfallen:** Der Punkt „Migration `20261004000000` wartet auf Live-Apply"
> stand hier im 6A-Handoff. Die Migration ist **live und verifiziert** (§3).

### BUSINESS_INPUT_REQUIRED

| # | Was | Details |
|---|---|---|
| B1 | ChairMatch Preise festlegen | `protect_pricing` + `compliance_plans` strukturell fertig, Tabellen leer. Beträge aus `20260310` sind Entwurfswerte und gelten NICHT. Befüllung über `supabase/seed/pricing.seed.template.sql` |
| B2 | Geldpfade Erstbetrieb | `payments` = 0, `camt_imports` = 0 — System gebaut und getestet, aber nie mit echtem Geld gelaufen |
| B3 | **3× Signaturlaufzeit 7 Tage entscheiden** | `lib/upload-document.ts` (Ausweis/Führungszeugnis/Versicherung), `lib/upload-service-proof.ts`, `app/api/native/leistungsnachweis-upload/route.ts`. Im Quelltext an Ort und Stelle markiert. Entweder Re-Signier-Route bauen (für `documents` existiert `getSignedDocumentUrl()` schon, nur ohne Oberfläche) **oder** 7 Tage bewusst als Restrisiko tragen — ein Link auf einen Personalausweis überdauert dann Rollenwechsel und Konto-Deaktivierung um bis zu sieben Tage. **Empfehlung: Re-Signier-Route für `documents`.** |
| B4 | **`getOposListe()` zeigt Entwürfe im Forderungsbestand** | Ausgeschlossen sind nur die Endstatus. Wer die Altersstruktur als Forderungsbestand liest, überschätzt ihn um die Summe aller Entwürfe. Der Mahnlauf ist **nicht** betroffen (wählt selbst). Der Test hält den Ist-Zustand fest, damit eine Änderung auffällt; geändert wurde nichts. |

---

## 7. Echte offene technische Probleme

T-1 bis T-4 des Vorgänger-Handoffs sind **erledigt** und hier entfernt.
**Kein technischer P0/P1 im Alltagsengel-Repo mehr offen.**

| # | Problem | Priorität |
|---|---|---|
| **T-1** | 30 der 36 ungetesteten `lib/`-Module (P2/P3-Kategorien) stehen noch aus. Nach dem Muster von 6A/T1 und 6B/Track 3: in ungetesteten Modulen liegen Befunde. | P2 |
| **T-2** | **DATEV-Storage-Schicht ungeprüft.** `erstelleDatevExport()` schreibt in Supabase Storage; der PGlite-Shim bildet Storage nicht ab. Die neue Suite läuft auf den beiden Schichten darunter (Buchungssatz-Generator, CSV-Format). | benannte Grenze |
| **T-3** | `no_overlapping_tariffs` bleibt unter PGlite **unbeweisbar** (kein `btree_gist`). Ein Stellvertreter-Trigger prüft nur die **Reaktion** der Anwendung, nicht den echten Constraint. Nur gegen echtes Postgres prüfbar. | benannte Grenze |
| **T-4** | `tarif-verifizierung-service.ts` begründet den ODER-Zweig `organization_id.is.null` mit `leistungspreise`-Altbestand vor Phase 3. Nach Schema kann es den nicht geben (`20260801` setzt `NOT NULL`). **Kein Leck** — der Zweig öffnet nur für herrenlose Zeilen, nie für fremde. Ob die Spalte live `NOT NULL` ist, wäre einmal zu prüfen. | P3 / Beobachtung |
| **T-5** | Der Rückfall in `lib/billing/sepa/ruecklastschrift.ts:185` ist seit dem Live-Apply ein **toter Zweig**. Bewusst stehen gelassen (Shadow-Instanzen, Rollback). Kein Handlungsbedarf — hier notiert, damit ihn niemand als Fehler meldet. | keine |
| **T-6** | efy care: Buchung schreibt nicht in die DB; Konto-Löschung ist ein TODO (**DSGVO Art. 17**). Beides Funktionen, die dem Nutzer etwas zusagen, was nicht passiert. | **P1** (Fremdrepo) |
| **T-7** | efy care: Prod-Migrationsstand, RLS live, Edge-Function-Deploy und Secrets unverifiziert. Solange offen, ist jede Deploy-Freigabe dort eine Annahme. | **P1** (Fremdrepo) |
| **T-8** | efy care: 30 HTTP-Isolationstests übersprungen (PostgREST/GoTrue/Storage-Schicht). Braucht Shadow-Supabase-Instanz + 2 Env-Vars in CI. | P2 (Fremdrepo) |

---

## 8. Nächster sinnvoller Schritt

Der eine Handgriff, der seit zwei Handoffs oben stand, ist erledigt: die
Migration ist live. **Was jetzt bleibt, ist kein Code mehr, sondern
Erstbetrieb.**

**Phase 6C — begleiteter Erstbetrieb der Geldpfade.** Reihenfolge:

1. `RECHNUNGSVERSAND_AUTOMATISCH` in Vercel setzen (E1)
2. **Erster Rechnungsversand an einen echten Empfänger**, danach
   `invoice_email_log` gegenprüfen. Bis heute steht die Tabelle auf 0 — die
   Versandkette ist getestet, aber nie gelaufen.
3. **Erster begleiteter CAMT-Import** mit echter Bankdatei. Der CAMT-Parser lief
   bis Phase 6B an der zentralen Rundung vorbei; das ist jetzt behoben, der
   Erstbetrieb sollte auf dem gefixten Stand laufen.
4. **Erster SEPA-Sammelauftrag** — ausdrücklich gegen die 6A-Fixes B-3/B-4
   gegengeprüft (keine Entwürfe im Stapel, keine Rechnung zweimal).
5. **Erste DATEV-Ausleitung an den Steuerberater** — neu in dieser Liste wegen
   D-1. Die erste echte CSV sollte jemand öffnen und die Spaltenausrichtung
   ansehen, bevor sie importiert wird.

**Parallel, ohne externe Abhängigkeit:** T-1 — die verbleibenden 30 ungetesteten
`lib/`-Module. Zwei Phasen in Folge haben gezeigt, was dort liegt: 6A/T1 fand
sieben Befunde in sechs Modulen, 6B/Track 3 zwei weitere in zwei Modulen.

**Für efy care getrennt zu entscheiden:** T-6 ist kein Testthema, sondern ein
Produktentscheid — Buchungs-Button anbinden oder deaktivieren, Konto-Löschung
bauen oder Menüpunkt entfernen.

---

## 9. Relevante Dateipfade

| Zweck | Pfad |
|---|---|
| **Phase-6B-Fortschrittsbericht** | `docs/reports/PHASE6B_TECHNICAL_PROGRESS.md` |
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

*Aktualisiert 25.08.2026 nach Phase 6B — Alltagsengel*
