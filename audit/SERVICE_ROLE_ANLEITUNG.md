# SERVICE_ROLE_ANLEITUNG — Staging-Blocker (Migrationen)

Stand: 2026-08-10 | Branch: `staging/expansion-abnahme`

## Zusammenfassung

Alle Code-Fixes (P0/P1/P2) sind committet und deployed.
Die folgenden **SQL-Migrationen** warten auf manuellen Apply im Supabase SQL-Editor,
da das Projekt `nnwyktkqibdjxgimjyuq` keinen `service_role`-Zugriff via Agent erlaubt.

## Reihenfolge (strikt einhalten!)

### Phase 1 — Security (ZUERST, in genau dieser Reihenfolge)

| # | Migration | Zweck |
|---|-----------|-------|
| 1 | `20260817010000_sql_exec_rpc_absichern.sql` | `_run_sql` RPC fuer anon sperren |
| 2 | `20260817020000_audit_probe_zeile_dokumentieren.sql` | Audit-Trail Probe-Zeile |
| 3 | `20260817030000_secdef_rpc_haertung.sql` | 6 SECDEF-RPCs fuer anon/authenticated sperren |
| 4 | `20260817030002_zusaetzliche_secdef_haertung.sql` | Weitere SECDEF-Haertung |
| 5 | `20260817040000_bookings_policy_rekursion.sql` | 42P17-Rekursion in bookings-Policy brechen |

**Alternativ:** `SECURITY_P0_APPLY.sql` (Root-Verzeichnis) enthaelt Phase 1 als einzelne Transaktion.

### Phase 2 — Schema-Erweiterungen (Module)

| # | Migration | Zweck |
|---|-----------|-------|
| 6 | `20260818010000_sis_strukturierte_informationssammlung.sql` | SIS-Modul Tabellen |
| 7 | `20260818010000_vitalwerte.sql` | Vitalwerte-Modul Tabellen |
| 8 | `20260818030000_wunddokumentation.sql` | Wunddokumentation Tabellen |
| 9 | `20260819010000_pflegecoach_dipa_modul.sql` | PflegeCoach/DiPA Tabellen |
| 10 | `20260819020000_billing_org_fence_haertung.sql` | Billing org_fence RLS |
| 11 | `20260820010000_medikamentenmanagement.sql` | Medikamente + Eingaben |
| 12 | `20260821010000_angehoerigenzugang.sql` | Angehoerigen-Portal Tabellen |
| 13 | `20260821020000_digitale_signaturen.sql` | Signaturen-Modul Tabellen |

### Phase 3 — Security-Haertung (nach Schema)

| # | Migration | Zweck |
|---|-----------|-------|
| 14 | `20260822010000_mis_audit_log_org_id.sql` | Audit-Log org_id-Fence |
| 15 | `20260822020000_billing_policies_is_admin.sql` | Billing-Policies auf is_admin() |
| 16 | `20260823010000_secdef_trigger_revoke.sql` | SECDEF-Trigger REVOKE |
| 17 | `20260823020000_profiles_subquery_to_is_admin.sql` | profiles-Subqueries → is_admin() |

### Phase 4 — P0/P1 Fixes

| # | Migration | Zweck |
|---|-----------|-------|
| 18 | `20260824010000_p0_race_condition_fixes.sql` | OCC + CAS fuer Race Conditions |
| 19 | `20260824020000_p1_service_record_unique.sql` | UNIQUE auf service_records |
| 20 | `20260824030000_p1_missing_rls.sql` | RLS auf 9 fehlende Tabellen |

## Apply-Anleitung

1. Supabase Dashboard oeffnen → SQL Editor
2. Jede Migration einzeln einfuegen und ausfuehren (Reihenfolge!)
3. Bei Fehler: Rollback-Migration (`*_rollback_*.sql`) desselben Blocks ausfuehren
4. Nach jeder Phase: Funktionstest der betroffenen Module

## Verifikation nach Apply

```sql
-- Phase 1: Security
SELECT has_function_privilege('anon', 'wf_emit_event(uuid,text,text,jsonb)', 'EXECUTE');
-- Erwartet: false

-- Phase 4: Race Conditions
SELECT column_name FROM information_schema.columns
WHERE table_name = 'abrechnungslaeufe' AND column_name = 'idempotency_key';
-- Erwartet: 1 Zeile
```

## Rollback

Jede Migration hat eine `_rollback_`-Variante im selben Verzeichnis.
Rollback in umgekehrter Reihenfolge ausfuehren (20 → 1).
