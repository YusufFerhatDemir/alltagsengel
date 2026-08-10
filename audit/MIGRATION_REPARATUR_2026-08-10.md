# Migration-Reparatur — 2026-08-10

**Branch:** `staging/expansion-abnahme`
**Grundlage:** `audit/MIGRATION_INVENTAR_2026-08-10.md`
**Supabase-MCP:** nicht verfügbar (kein Live-Abgleich möglich)

---

## 1. Durchgeführte Fixes

### Fix 1: Payments-Kollision (`20260808210000`)

**Problem:** `CREATE TABLE IF NOT EXISTS public.payments` kollidiert mit Legacy-Payments-Tabelle aus `initial-setup.sql` (Stripe/Booking-Schema ohne `organization_id`). `IF NOT EXISTS` → No-Op, danach bricht `CREATE INDEX … ON payments(organization_id)` ab.

**Lösung:** Block 0 eingefügt — erkennt Legacy-Tabelle (hat `booking_id`, kein `organization_id`), entfernt deren Policies, benennt sie in `legacy_stripe_payments` um. Danach greift `CREATE TABLE IF NOT EXISTS` korrekt.

```sql
DO $legacy_check$
BEGIN
  IF EXISTS (... booking_id ...) AND NOT EXISTS (... organization_id ...) THEN
    DROP POLICY IF EXISTS "Kullanıcı kendi ödemelerini okuyabilir" ON public.payments;
    DROP POLICY IF EXISTS "Admin ödemeleri yönetebilir" ON public.payments;
    ALTER TABLE public.payments RENAME TO legacy_stripe_payments;
  END IF;
END $legacy_check$;
```

### Fix 2: profiles.organization_id → current_org_id() (`20260808220000`)

**Problem:** 10 RESTRICTIVE-Policies referenzieren `SELECT p.organization_id FROM public.profiles p WHERE p.id = auth.uid()`. `profiles` hat keine Spalte `organization_id` — bricht sofort ab.

**Lösung:** Alle 10 Vorkommen ersetzt durch `public.current_org_id()` (der projekteigene Helper aus Phase-3-Migration). 2 Policies mit `organization_id IS NULL OR ...`-Guard ebenfalls korrigiert.

### Fix 3: Idempotenz Aufgaben (`20260812010000`)

**Problem:** 44 `CREATE POLICY`-Statements ohne vorheriges `DROP POLICY IF EXISTS` → Wiederholungslauf nach Teil-Fehler bricht ab.

**Lösung:** `DROP POLICY IF EXISTS "name" ON table;` vor jedes `CREATE POLICY` eingefügt (45 Stück, inkl. der admin-Policies).

### Fix 4: Idempotenz + Security Workflow-Engine (`20260813010000`)

**Problem 4a:** 7 org_fence + 7 admin Policies ohne `DROP POLICY IF EXISTS`.
**Lösung:** 14 `DROP POLICY IF EXISTS` eingefügt.

**Problem 4b:** 6 SECURITY DEFINER-Funktionen (`wf_emit_event`, `wf_process_event`, `wf_execute_queue_item`, `wf_process_pending`, `wf_check_fristen`, `next_billing_number`) waren per Default für `anon` aufrufbar.
**Lösung:** TEIL 17 eingefügt — explizites `REVOKE ALL FROM PUBLIC, anon, authenticated` + `GRANT TO service_role` für alle 6 Funktionen (Defense in Depth, unabhängig von `20260817030000`).

### Fix 5: Funktions-Signaturwechsel (`20260814010000`)

**Problem:** `get_monthly_closing_overview(date)` ändert Rückgabetyp (12→10 Spalten). `CREATE OR REPLACE FUNCTION` kann Rückgabetypen nicht ändern — braucht vorheriges DROP.

**Lösung:** `DROP FUNCTION IF EXISTS public.get_monthly_closing_overview(date);` vor `CREATE OR REPLACE` eingefügt.

---

## 2. Ergänzte Rollback-Dateien

| Migration | Rollback-Datei | Status |
|---|---|---|
| `20260809010000_dokumentenmanagement_akten.sql` | `20260809010001_rollback_dokumentenmanagement_akten.sql` | NEU |
| `20260810010000_pflegedokumentation.sql` | `20260810010001_rollback_pflegedokumentation.sql` | NEU |
| `20260811010000_personalmanagement.sql` | `20260811010001_rollback_personalmanagement.sql` | NEU |
| `20260812010000_aufgaben_kommunikation.sql` | `20260812010001_rollback_aufgaben_kommunikation.sql` | NEU |
| `20260813010000_workflow_engine.sql` | `20260813010001_rollback_workflow_engine.sql` | NEU |
| `20260814010000_leistungsnachweis_haertung.sql` | `20260814010001_rollback_leistungsnachweis_haertung.sql` | NEU |
| `20260817030002_zusaetzliche_secdef_haertung.sql` | `20260817030003_rollback_zusaetzliche_secdef_haertung.sql` | NEU |

**Nicht erstellt (kein Rollback nötig):**
- `20260808120001_plz_bundesland_seed.sql` — reiner Daten-Seed, bei Bedarf `TRUNCATE plz_bundesland_regeln`

---

## 3. Geordnete Apply-Reihenfolge (AUSSTEHEND + UNGEWISS)

**VORAUSSETZUNG:** Live-Check per Supabase-MCP oder SQL-Editor, bevor irgendetwas angewendet wird:
```sql
SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version;
SELECT to_regclass('public.dta_ruecklaeufer'), to_regclass('public.ops_aufgaben'), to_regclass('public.payments');
\d public.payments;
\d public.profiles;
```

### Phase A: Security-kritisch (sofort nach Live-Check)

| # | Migration | Begründung | Risiko |
|---|---|---|---|
| 1 | `20260705_rls_lockdown_new_mis_modules.sql` | 15 Tabellen ohne RLS (P0-Charakter) — **nur wenn Live-Check bestätigt: nicht vorhanden** | HOCH |
| 2 | `20260719_booking_request_workflow.sql` | RLS-Lücke im Booking-Flow | HOCH |
| 3 | `20260719_angel_availability.sql` | Abhängigkeit von #2 | NIEDRIG |
| 4 | `20260817040000_bookings_policy_rekursion.sql` | **Höchste Priorität** — 42P17-Rekursion betrifft Login-Pfad | HOCH |
| 5 | `20260819020000_billing_org_fence_haertung.sql` | org_fence auf invoices/items/disputes | NIEDRIG |

### Phase B: Kollisions-Fixes (nur wenn Live-Check zeigt: Tabellen fehlen)

| # | Migration | Bedingung |
|---|---|---|
| 6 | `20260808210000_zahlungen_forderungen_monatsabschluss.sql` (GEFIXT) | NUR wenn `payments` noch Legacy-Schema hat oder Tabelle fehlt |
| 7 | `20260808220000_kassenabrechnung_dta_dakota.sql` (GEFIXT) | NUR wenn `dta_ruecklaeufer` etc. nicht existieren |
| 8 | `20260812010000_aufgaben_kommunikation.sql` (GEFIXT) | Prüfen ob `ops_aufgaben` bereits existiert |
| 9 | `20260813010000_workflow_engine.sql` (GEFIXT) | Prüfen ob `wf_events` bereits existiert |
| 10 | `20260814010000_leistungsnachweis_haertung.sql` (GEFIXT) | Prüfen ob Rollback 200001 auf Prod lief |

### Phase C: Unabhängige Module (beliebige Reihenfolge, einzeln testbar)

| # | Migration | Abhängigkeit |
|---|---|---|
| 11 | `20260809010000_dokumentenmanagement_akten.sql` | Phase 3 |
| 12 | `20260809120000_tourenplanung.sql` | 200000 (assignments) |
| 13 | `20260810010000_pflegedokumentation.sql` | Phase 3 |
| 14 | `20260811010000_personalmanagement.sql` | Phase 3 |
| 15 | `20260818010000_sis_strukturierte_informationssammlung.sql` | Phase 3 |
| 16 | `20260818010000_vitalwerte.sql` | Phase 3 (**Namenskollision** mit SIS: gleicher Zeitstempel!) |
| 17 | `20260818030000_wunddokumentation.sql` | Phase 3 |
| 18 | `20260819010000_pflegecoach_dipa_modul.sql` | Phase 3 |
| 19 | `20260820010000_medikamentenmanagement.sql` | Phase 3 (prüfen: `medikamentenplan` Live-Daten?) |
| 20 | `20260821010000_angehoerigenzugang.sql` | Phase 3 |
| 21 | `20260821020000_digitale_signaturen.sql` | Phase 3 |

---

## 4. Bekannte Risiken

1. **Kein Live-Abgleich möglich** — Supabase-MCP nicht verbunden. Alle Status-Angaben basieren auf Inventar + Memory-Quellen.
2. **Namenskollision** `20260818010000_sis_*` und `20260818010000_vitalwerte*` — identischer Zeitstempel. Alphabetische Sortierung entscheidet die Reihenfolge. Empfehlung: einen davon umbenennen (z.B. `20260818020000_vitalwerte.sql`).
3. **`medikamentenplan`-Tabelle** — Migration `20260820010000` ersetzt diese. Vor Apply prüfen ob Live-Daten existieren, die migriert werden müssen.
4. **Shadow-DB-Verifikation** — nach allen Fixes muss `./scripts/shadow-db.sh reset && ./scripts/shadow-db.sh idempotency` 0 Fehler liefern.

---

## 5. Staging-Apply-Checkliste

Sobald Supabase-MCP verfügbar:

- [ ] Live-Check: `schema_migrations`, Tabellen, Policies, Functions Counts
- [ ] Schema-Snapshot VOR Apply (Tabellen-Count, Policy-Count, Functions-Count)
- [ ] Migrationen einzeln in Reihenfolge aus §3 anwenden
- [ ] Nach jeder Migration: Fehler prüfen
- [ ] Schema-Snapshot NACH Apply
- [ ] RLS Cross-Org Test: `current_org_id()` verifizieren
- [ ] `npm run test` — alle Tests grün
- [ ] Billing E2E mit Test-Tarif
- [ ] Security-Verifikation: `SELECT has_function_privilege('anon', 'wf_emit_event(...)', 'execute')` = false

*Erstellt 2026-08-10 als Teil von Track 1: Migration-Reparatur + Staging Readiness.*
