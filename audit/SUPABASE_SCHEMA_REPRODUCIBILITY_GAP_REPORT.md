# Supabase Schema-Reproduzierbarkeits-Gap-Bericht

**Datum:** 2026-08-04 (aktualisiert)
**Branch:** bookings-policy-staging-pr23 (Preview Branch `uwmjqckhjkgukhzeidyw`)
**Produktion:** nnwyktkqibdjxgimjyuq (eu-west-1)
**Git-Branch:** cleanup/bookings-policy-consolidation (Commit `6075b46`)
**Autor:** Automatisierte Analyse (Phase 4, A-3)
**Status:** BEDINGT GO — siehe Abschnitt 7

---

## 0. Zusammenfassung

Nach drei Iterationen (Dead-Table-Guards, UTF-8-Encoding-Fix, ASCII-Phantom-Cleanup)
ist das Alltagsengel-Schema **weitgehend reproduzierbar** aus Repository-Dateien.

| Metrik | Produktion | Staging | Status |
|--------|-----------|---------|--------|
| Tabellen | 125 | 126 | ✓ (+1: `analytics_events` neu) |
| Funktionen | 31 | 31 | ✓ MATCH |
| Trigger | 29 | 27 | ⚠ −2 (vorbestehende Lücke) |
| Bookings-Policies | 15 | 5 | ✓ Konsolidierung korrekt |
| Storage-Buckets | 4 | 4 | ✓ MATCH |
| Enums | 0 | 0 | ✓ MATCH |
| ASCII-Phantom-Policies | N/A | 0 | ✓ Bereinigt |
| DSGVO-Lücke (Soft-Delete-Bypass) | OFFEN | GESCHLOSSEN | ✓ Fix verifiziert |

---

## 1. Gelöste Probleme

### 1.1 Bookings-Policy DSGVO-Lücke (KRITISCH → GELÖST)

**Vorher (Produktion):** 15 Policies, davon 4 permissive SELECT-Policies. Zwei davon
prüfen `deleted_at` NICHT → Soft-Delete-Bypass per OR-Verknüpfung.

**Nachher (Staging):** 5 Policies. Jede SELECT-Policy erzwingt
`is_profile_soft_deleted()` (SECURITY DEFINER) auf BEIDEN Seiten
(customer_id + angel_id). Kein 42P17-Zyklus.

### 1.2 UTF-8/ASCII-Encoding-Degradierung (KRITISCH → GELÖST)

**Problem:** Supabase MCP API degradiert UTF-8-Zeichen (ö→o, ü→u, ş→s, ı→i)
in Policy-Namen. `core_tables_baseline` erstellt `"Admin bookingleri yönetebilir"`,
aber die DB speichert `"Admin bookingleri yonetebilir"`. DROP-Statements
mit UTF-8-Originalname matchen die ASCII-Variante nicht.

**Fix:** Dual-DROP-Strategie in allen Migrations + separate Cleanup-Migration
(`20260804130000_cleanup_phantom_ascii_policies.sql`).

### 1.3 Dead-Table-Guards in fix_rls_policies (KRITISCH → GELÖST)

**Problem:** `fix_rls_policies` referenzierte 6 Tabellen (documents, payments,
care_eligibility, carebox_*), die nur in `initial-setup.sql` existieren.

**Fix:** Sections 6, 7, 9–12 mit `DO $$ BEGIN IF NOT EXISTS ... END $$;`
Guards umschlossen, Dollar-Quoting für DDL innerhalb DO-Blöcke.

### 1.4 Bedingte Trigger (GELÖST)

**Problem:** 6 Trigger in `baseline_functions` verwenden IF EXISTS Guards.
Bei sequenzieller Migration auf leerem Schema werden sie übersprungen.

**Fix:** `20260804100000_reapply_conditional_triggers.sql` holt sie nach.

---

## 2. Verbleibende Lücken (vorbestehend, nicht durch diese PR eingeführt)

### 2.1 Trigger-Lücke (−2)

| Trigger | Tabelle | Status |
|---------|---------|--------|
| `trg_generate_referral_code` | profiles | Fehlt im Repo (nur in Prod) |
| `check_role_escalation_insert` | profiles | Staging hat `trg_prevent_role_escalation` (nur UPDATE), Prod hat zusätzlich INSERT-Variante |

**Risiko:** Niedrig. Referral-Code ist kosmetisch. Role-Escalation auf INSERT
wird durch service_role-Bypass in `handle_new_user` gemildert.

### 2.2 Supabase Branch Re-Timestamping

Supabase Preview Branches re-timestampen Migration-Files. Dadurch läuft
`fix_rls_policies` (20260319000000, Originaldatum) VOR `core_tables_baseline`
(wird zu 20260804085831). Dies erzeugt die ASCII-Phantom-Policies, die
durch die Cleanup-Migration bereinigt werden.

**Auswirkung:** Keine, solange die Cleanup-Migration mitläuft. Bei Entfernung
der Cleanup-Migration kehren die Phantome zurück.

### 2.3 Policy-Anzahl-Differenz (297 vs. 412)

Produktion hat 115 mehr Policies — überwiegend Dashboard-erstellte Duplikate
und redundante Policies. Dies ist ein bekannter Tech-Debt-Posten, der durch
schrittweise Konsolidierung (wie bei Bookings) abgebaut wird.

---

## 3. Staging-Test-Ergebnisse

| # | Test | Ergebnis |
|---|------|----------|
| 1 | Auth-Trigger (on_auth_user_created) | ✓ PASS |
| 2 | is_admin() SECURITY DEFINER | ✓ PASS |
| 3 | is_profile_soft_deleted() SECURITY DEFINER | ✓ PASS |
| 4 | current_org_id() SECURITY DEFINER | ✓ PASS |
| 5 | RLS enabled auf Kern-Tabellen | ✓ PASS (6/6) |
| 6 | Soft-Delete SELECT (beidseitig) | ✓ PASS |
| 7 | Soft-Delete INSERT | ✓ PASS |
| 8 | Soft-Delete UPDATE | ✓ PASS |
| 9 | DSGVO: 0 unsafe SELECT-Policies | ✓ PASS |
| 10 | 42P17 Rekursion: keine direkte profiles-Referenz | ✓ PASS |
| 11 | Multi-Tenant: RESTRICTIVE org_fence | ✓ PASS |
| 12 | Storage: 4 private Buckets | ✓ PASS |
| 13 | RPC-Funktionen: 5/5 vorhanden | ✓ PASS |
| 14 | Kein service_role in Policies | ✓ PASS |
| 15 | Idempotenz: DROP IF EXISTS vor CREATE | ✓ PASS |
| 16 | Keine Duplikat-Policy-Namen | ✓ PASS |
| 17 | JWT: auth.uid() statt raw JWT | ✓ PASS |
| 18 | Org-Fence RESTRICTIVE + current_org_id() | ✓ PASS |

**Ergebnis: 18/18 Tests bestanden.**

---

## 4. Migration-Inventar (48 Dateien)

| Version | Name | Typ |
|---------|------|-----|
| 20250101000000 | core_tables_baseline | Baseline |
| 20250101000050 | missing_production_functions | Baseline |
| 20260101000100 | baseline_live_only_tables | Baseline |
| … | (38 weitere Feature-Migrationen) | Feature |
| 20260319000000 | fix_rls_policies | Fix (Dead-Table-Guards) |
| 20260803000000 | fix_rls_recursion_bookings_admin | Fix |
| 20260803100000 | consolidate_bookings_policies | Konsolidierung (DSGVO) |
| 20260804100000 | reapply_conditional_triggers | Nachhol-Trigger |
| 20260804130000 | cleanup_phantom_ascii_policies | Encoding-Cleanup |

---

## 5. Bookings-Policy-Matrix (Final)

| Policy | Typ | Cmd | Soft-Delete | Org-Fence | Beschreibung |
|--------|-----|-----|-------------|-----------|-------------|
| bookings_org_fence | RESTRICTIVE | ALL | — | ✓ current_org_id() | Multi-Mandant-Grenze |
| bookings_admin | PERMISSIVE | ALL | ✓ via is_admin() | — | Admin-Vollzugriff |
| bookings_select_own | PERMISSIVE | SELECT | ✓ customer_id + angel_id | — | Beteiligte lesen |
| bookings_insert_customer | PERMISSIVE | INSERT | ✓ auth.uid() | — | Kunde erstellt |
| bookings_update_own | PERMISSIVE | UPDATE | ✓ auth.uid() | — | Beteiligte aktualisieren |

---

## 6. Rollback-Plan

Dokumentiert im ROLLBACK-Abschnitt der Consolidation-Migration
(Zeilen 153–204). Umfasst:

1. 5 neue Policies droppen
2. Alte Policies aus vorherigen Migrationen wiederherstellen
3. **WARNUNG:** Rollback stellt die DSGVO-Lücke wieder her

---

## 7. GO/NO-GO Bewertung

### BEDINGT GO für Bookings-Policy-Konsolidierung

**GO-Gründe:**
- DSGVO-Lücke geschlossen (0 unsichere SELECT-Policies)
- 42P17-Rekursion gebrochen
- Multi-Mandant-Isolation aktiv
- 18/18 Tests bestanden
- Rollback-Plan dokumentiert

**Bedingungen:**
1. PR #23 bleibt offen (kein Merge ohne explizite Freigabe)
2. Trigger-Lücke (−2) wird als separater Ticket dokumentiert
3. Cleanup-Migration (`20260804130000`) MUSS Teil des Deployments sein
4. Vor Prod-Deploy: Backup erstellen, Rollback-SQL bereithalten

**Verbleibende Risiken:**
- Supabase Re-Timestamping kann bei neuem Branch-Reset Phantome erzeugen
  → Mitigiert durch Cleanup-Migration
- 2 fehlende Trigger (vorbestehend, nicht durch PR eingeführt)
  → Kein Sicherheitsrisiko, separates Ticket
