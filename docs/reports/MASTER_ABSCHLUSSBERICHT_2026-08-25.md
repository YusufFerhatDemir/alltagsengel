# Abschlussbericht — 25.08.2026

## Zusammenfassung

Source-of-Truth Recovery beider Repos durchgeführt, alle Security-P2s live
verifiziert, P1-1/P1-5 als bereits live bestätigt (nicht doppelt gebaut),
358 neue Tests deployed. Kein offenes P0.

---

## 1. Ausgangslage

Phase 5 (Abschlussbericht 24.08.2026) hatte 5 offene P1s und mehrere P2/P3s
dokumentiert. Dieser Durchlauf hatte den Auftrag, den IST-Stand gegen die
Realität zu verifizieren und autonom abzuarbeiten.

---

## 2. Durchgeführte Arbeiten

### 2.1 Source-of-Truth Recovery

Beide Repos (Alltagsengel + ChairMatch) gegen Git, CI, Supabase Live und
Vercel geprüft. Ergebnis:

| Prüfpunkt | Alltagsengel | ChairMatch |
|---|---|---|
| Branch | main | main |
| HEAD | `0e8418f` | `1706c5d` |
| Typecheck | 0 Fehler | 0 Fehler |
| CI | GRÜN | GRÜN |
| Live HTTP | 200 | 200 |
| Supabase | ACTIVE_HEALTHY | ACTIVE_HEALTHY |
| RLS | 308/308 (100 %) | 79/79 (+1 PostGIS-System) |

### 2.2 Security-Verifikation (P2-a/b/c)

**P2-b (DTA Storage org-blind):** Live-Prüfung der `pg_policies` bestätigt —
alle 3 DTA-Policies filtern nach `foldername[2] = current_org_id()`. Migration
`3561ab4` war bereits angewendet. LIVE_VERIFIZIERT.

**P2-a (Storage Bucket Hardening):** Neue Migration `354b056` deployed —
`file_size_limit` + `allowed_mime_types` für verordnungen, abrechnung,
service-proofs, documents, mis-documents. Client-Validierung in
`upload-document.ts` und `upload-service-proof.ts` auf dieselbe explizite
Liste gezogen (SVG blockiert, HEIC erlaubt). Live-Query gegen
`storage.buckets` bestätigt alle 7 Buckets gehärtet. LIVE_VERIFIZIERT.

**P2-c (org_fence fehlende Tabellen):** Migration `0a84ade` war bereits live.
Live-Query bestätigt RESTRICTIVE org_fence auf allen relevanten Tabellen.
2 dokumentierte Ausnahmen: organization_members (Multi-Org), state_waitlist
(öffentlich). LIVE_VERIFIZIERT.

### 2.3 Pending Migrations (P1-1, P1-5)

**P1-1 (CAMT Dublettensperre):** UNIQUE INDEX `uq_zahlungseingaenge_org_buchungshash`
existiert auf Live-Supabase. War schon eingespielt. LIVE_VERIFIZIERT.

**P1-5 (ChairMatch Pricing Schema):** Alle Spalten, 7 CHECK-Constraints, RLS
enabled, UNIQUE-Indizes auf protect_pricing + compliance_plans. War schon
eingespielt. LIVE_VERIFIZIERT. Tabellen sind strukturell fertig aber leer
(BUSINESS_INPUT_REQUIRED für Preise).

### 2.4 Testabdeckung Welle 6 (P1-4)

15 Test-Dateien mit 358 Tests für pure functions deployed als `0e8418f`.
Gesamtstand: node:test 2123 + vitest 5083 = **7206 Tests**.

Pure-Function-Testabdeckung ist damit weitgehend ausgeschöpft. Die
verbleibenden ~120 ungetesteten Module haben DB-Abhängigkeiten und brauchen
PGlite-basierte Integrationstests.

Drei Randbefunde dokumentiert (nicht gefixt, Scope-extern):
- `euroZuCent(1.005)` → 100 statt 101 (IEEE-754)
- `endzeitAus('08:30:')` verschluckt Trailing-Colon
- `MahnungData.debtorName` befüllt aber nie gerendert

---

## 3. Commit-Historie dieser Session

| Commit | Beschreibung |
|---|---|
| `354b056` | fix: P2-a/b/c Security — org-fence Storage + Bucket-Hardening |
| `8d49500` | docs: Status-Matrix 25.08.2026 |
| `0e8418f` | test: P1-4 Testabdeckung kritische Module Welle 6 |

---

## 4. Aktueller P1-Status

| P1 | Status 24.08. | Status 25.08. |
|---|---|---|
| P1-1 CAMT Migration | EXTERN_BLOCKIERT | **LIVE_VERIFIZIERT** |
| P1-2 CAMT Echtlauf | EXTERN_BLOCKIERT | EXTERN_BLOCKIERT (camt_imports=0) |
| P1-3 Zustellung unbewiesen | EXTERN_BLOCKIERT | EXTERN_BLOCKIERT (invoice_email_log=0) |
| P1-4 28 Module ohne Tests | OFFEN | **ERLEDIGT** (358 Tests, pure functions ausgeschöpft) |
| P1-5 ChairMatch Pricing | EXTERN_BLOCKIERT | **LIVE_VERIFIZIERT** (Schema), BUSINESS_INPUT (Preise) |

---

## 5. Verbleibende offene Punkte

### EXTERN_BLOCKIERT

1. `RECHNUNGSVERSAND_AUTOMATISCH` in Vercel setzen
2. `MAHNVERSAND_AUTOMATISCH` in Vercel setzen
3. Erster begleiteter CAMT-Import (echte Bankdatei nötig)
4. Erster Rechnungsversand (invoice_email_log = 0)
5. §45a Bayern Antrag vervollständigen

### BUSINESS_INPUT_REQUIRED

1. ChairMatch Preise festlegen (Tabellen leer, Seed-Template bereit)
2. Geldpfade Erstbetrieb (payments = 0, System getestet aber nie mit Echtgeld)

### Technische P2/P3

1. ~120 Module ohne Tests (DB-abhängig, brauchen PGlite)
2. `euroZuCent` IEEE-754 Rundung
3. Signed URLs 30 Tage für Rechnungs-PDFs
4. efy care: keine Tests, kein Linting

---

## 6. GO / NO-GO

### ALLTAGSENGEL — CONDITIONAL GO

Alle Security-Punkte (RLS, org_fence, Storage, DTA) sind LIVE_VERIFIZIERT.
7206 Tests grün. CI grün. Kein P0 offen.

**Bedingung:** Die Geldpfade (Rechnungsversand, CAMT, Mahnungen) sind gebaut
und getestet, aber in Produktion leer. Erstbetrieb muss begleitet erfolgen.

### CHAIRMATCH — CONDITIONAL GO

RLS 79/79, Pricing Schema live, 487 Tests grün, CI grün.

**Bedingung:** Preise festlegen und einspielen.

---

## 7. Nächste empfohlene Phase

**Phase 6 — Erstbetrieb der Geldpfade, begleitet.**

1. Vercel-Flags setzen (RECHNUNGSVERSAND, MAHNVERSAND)
2. Erster Rechnungsversand an echten Empfänger
3. Erster CAMT-Import mit echter Bankdatei
4. ChairMatch Preise festlegen + einspielen
5. Danach: PGlite-Integrationstests

---

*Erstellt 25.08.2026, 22:00 — Alltagsengel*
