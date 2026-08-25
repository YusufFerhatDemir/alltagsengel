# MASTER HANDOFF — Stand 25.08.2026, 22:00

Dieses Dokument ist die einzige Wahrheitsquelle für den technischen Zustand
beider Produkte. Jede neue Session liest zuerst diese Datei.

---

## 1. Repository-Stand

### Alltagsengel

| Feld | Wert |
|---|---|
| Branch | `main` |
| HEAD | `0e8418f` |
| Letzter Commit | `test: P1-4 Testabdeckung kritische Module Welle 6` |
| Typecheck | 0 Fehler |
| Tests | node:test 2123 + vitest 5083 = **7206** |
| CI | GRÜN (15+ aufeinanderfolgende grüne Runs seit 23.08.) |
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
| CI | GRÜN |
| Live | chairmatch.de → HTTP 200 |

### efy care

| Feld | Wert |
|---|---|
| Supabase | ACTIVE_HEALTHY, 24 Migrationen, letzte 02.08.2026 |

---

## 2. Supabase-Status

### Alltagsengel (nnwyktkqibdjxgimjyuq)

- Status: ACTIVE_HEALTHY
- Migrationen: 225+ angewendet
- Tabellen: 308, davon **308 mit RLS** (100 %)
- org_fence RESTRICTIVE: alle relevanten Tabellen, 2 dokumentierte Ausnahmen
  (organization_members: Multi-Org-Verwaltung; state_waitlist: öffentlich)
- anon writes: 0
- Storage: 7 Buckets gehärtet (file_size_limit + MIME-Allowlist)
- DTA-Policies: org-scoped (foldername[2] = current_org_id)

### ChairMatch (pwdbjqfpgumyfktbfswg)

- Status: ACTIVE_HEALTHY
- Migrationen: 43 angewendet
- Tabellen: 80, davon **79 mit RLS** (spatial_ref_sys = PostGIS-System, kein Risiko)
- protect_pricing + compliance_plans: Schema vollständig, RLS an, 7 CHECK-Constraints

### efy care (nsfbwhpjesmathsrqkfi)

- Status: ACTIVE_HEALTHY, 24 Migrationen

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

---

## 4. Zuletzt erledigte Arbeiten (25.08.2026)

1. **Source-of-Truth Recovery** — Beide Repos, CI, Supabase live gegen Realität geprüft
2. **P2-a Storage Bucket Hardening** — 20 MB + MIME-Allowlist für 5 Buckets, Client-Validierung nachgezogen (`354b056`)
3. **P2-b/c verifiziert** — DTA org-scoped + org_fence waren schon live, nicht doppelt gebaut
4. **P1-1/P1-5 verifiziert** — CAMT UNIQUE-Index und ChairMatch Pricing Schema waren schon live
5. **P1-4 Testabdeckung Welle 6** — 15 Test-Dateien, 358 Tests für pure functions (`0e8418f`)
6. **Status-Matrix** — `docs/reports/STATUS_MATRIX_2026-08-25.md` deployed (`8d49500`)

---

## 5. EXTERN_BLOCKIERT

| # | Was | Wer/Wo |
|---|---|---|
| E1 | `RECHNUNGSVERSAND_AUTOMATISCH` nicht gesetzt | Vercel Environment Variables |
| E2 | `MAHNVERSAND_AUTOMATISCH` nicht gesetzt | Vercel Environment Variables |
| E3 | Erster CAMT-Import nie produktiv gelaufen | Braucht echte Bankdatei (camt.053/054) + begleiteten Import |
| E4 | Erster Rechnungsversand nie produktiv | invoice_email_log = 0, Resend funktionsfähig aber nie genutzt |
| E5 | §45a Bayern Antrag unvollständig | Landesamt für Pflege, Erinnerung erhalten 24.08.2026 |

---

## 6. BUSINESS_INPUT_REQUIRED

| # | Was | Details |
|---|---|---|
| B1 | ChairMatch Preise festlegen | protect_pricing + compliance_plans strukturell fertig, Tabellen leer. Beträge aus 20260310 sind Entwurfswerte und gelten NICHT. Befüllung über `supabase/seed/pricing.seed.template.sql` |
| B2 | Geldpfade Erstbetrieb | payments=0, camt_imports=0 — System gebaut und getestet, aber nie mit echtem Geld gelaufen |

---

## 7. Echte offene technische Probleme

| # | Problem | Priorität |
|---|---|---|
| T1 | ~120 Module mit DB-Abhängigkeit ohne Tests (brauchen PGlite-Integration) | P2 |
| T2 | `euroZuCent(1.005)` → 100 statt 101 (IEEE-754 Rundung) | P3 |
| T3 | `MahnungData.debtorName` wird befüllt aber nie gerendert | P3 |
| T4 | P2-e: Signed URLs 30 Tage für Rechnungs-PDFs | P3 |
| T5 | efy care: keine Tests, kein Linting, handgepflegte Types | P2 |

---

## 8. Nächster sinnvoller Schritt

**Phase 6 — Erstbetrieb der Geldpfade, begleitet.**

Reihenfolge:
1. `RECHNUNGSVERSAND_AUTOMATISCH` in Vercel setzen (E1)
2. Erster Rechnungsversand an echten Empfänger, `invoice_email_log` gegenprüfen
3. Erster begleiteter CAMT-Import mit echter Bankdatei
4. Danach: PGlite-Integrationstests für die ~120 DB-abhängigen Module (T1)

---

## 9. Relevante Dateipfade

| Zweck | Pfad |
|---|---|
| Status-Matrix | `docs/reports/STATUS_MATRIX_2026-08-25.md` |
| Abschlussbericht Phase 5 | `docs/reports/MASTER_ABSCHLUSSBERICHT_2026-08-24_2000.md` |
| Abschlussbericht 25.08. | `docs/reports/MASTER_ABSCHLUSSBERICHT_2026-08-25.md` |
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

---

*Erstellt 25.08.2026, 22:00 — Alltagsengel*
