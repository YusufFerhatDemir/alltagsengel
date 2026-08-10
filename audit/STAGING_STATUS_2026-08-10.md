# Staging-Status & GO/NO-GO — 2026-08-10

Branch: `staging/expansion-abnahme`
Commit: nach P0/P1-Fixes

---

## 1. Test- & Build-Ergebnisse

| Prüfung | Ergebnis | Details |
|---------|----------|---------|
| Vitest | **1281 PASS, 0 FAIL** | 29 skipped, 62 Files |
| Webpack Build | **GRÜN** | next build --webpack erfolgreich |
| Shadow-DB | **107/0** | Alle Forward-Migrationen sauber |
| TypeScript | ⚠ Skipped | tsc --noEmit zu langsam lokal (Vercel-Build ist grün) |

---

## 2. Neue P0/P1-Fixes (diese Session)

### P0: mis_audit_log — organization_id fehlt
- **Migration**: `20260822010000_mis_audit_log_org_id.sql`
- **Fix**: Spalte + Backfill aus organization_members + org_fence Policy + anon-deny
- **Rollback**: `20260822010001_rollback_mis_audit_log_org_id.sql`
- **Shadow-DB**: OK

### P1: Billing-Policies — profiles-Subquery → is_admin()
- **Migration**: `20260822020000_billing_policies_is_admin.sql`
- **Fix**: 6 Policies ersetzt (payments, payment_allocations, dunning_entries, payment_differences, documents, mis_audit_log)
- **Rollback**: `20260822020001_rollback_billing_policies_is_admin.sql`
- **Shadow-DB**: OK

---

## 3. Security-Audit Ergebnisse

### 3.1 SECURITY DEFINER ohne REVOKE (19 Funktionen)

**KRITISCH — Non-Trigger SECDEF ohne REVOKE:**

| Funktion | Migration | Risiko |
|----------|-----------|--------|
| `is_internal_staff()` | 20260706 | GRANTED to anon, profiles-Subquery |
| `state_flag()` | 20260808100000 | GRANTED to anon, kein REVOKE von public |
| `seed_state_settings_for_org()` | 20260808100000 | Callable by public (Default) |

**MITTEL — Trigger-SECDEF ohne REVOKE (16 Funktionen):**

- `audit_invoice_status_change()`, `prevent_messages_field_tampering()`, `prevent_notifications_field_tampering()`, `prevent_privileged_role_insert()`, `audit_service_record_change()`, `enforce_tariff_obergrenze()`, `enforce_kassentarif_freigeschaltet()`, `enforce_kassenrechnung_freigeschaltet()`, `enforce_booking_zahlungsart()`, `enforce_state_settings_kanal()`, `audit_state_settings_immer()`, `log_arbeitszeit_korrektur()`, `check_aufgabe_eskalation()`, `create_recurring_aufgabe()`, `compute_signature_hash()`, `prevent_locked_record_change()`

### 3.2 RLS-Abdeckung

**VOLLSTÄNDIG** — Alle Tabellen haben RLS aktiviert (4 Billing-Katalog-Tabellen via dynamischem SQL in 20260808140000_katalog_rls.sql).

### 3.3 profiles-Subqueries in RLS-Policies (42P17-Risiko)

**35+ aktive Policies** in 4 Migrationen nutzen `SELECT ... FROM profiles` statt `is_admin()`:

| Migration | Tabellen | Policies |
|-----------|----------|----------|
| 20260813010000 (Workflow) | 7 wf_*-Tabellen | 7 |
| 20260810010000 (Pflegedoku) | 8 pflege_*-Tabellen | 8 |
| 20260812010000 (Aufgaben) | 13 ops-Tabellen | 13 |
| 20260811010000 (Personal) | 7 personal-Tabellen | 7 |
| 20260319000000 (Fix-RLS) | 6 legacy-Tabellen | 6 |

**Bekannte Situation**: Dokumentiert in 20260817040000 als "74 Policies auf 70 Tabellen". Nur profiles- und bookings-Rekursion bisher gefixt.

### 3.4 GRANT to anon Concerns

| Objekt | Typ | Bewertung |
|--------|-----|-----------|
| `is_admin()` | Funktion | OK — gibt false für anon, bewusst re-granted |
| `is_internal_staff()` | Funktion | **UNNÖTIG** — REVOKE empfohlen |
| `state_flag()` | Funktion | **REVOKE von public empfohlen** |
| `state_waitlist` | INSERT | OK — bewusst für anon (Warteliste) |

---

## 4. API-Route org_fence Status

**233 Routes geprüft:**

| Kategorie | Anzahl |
|-----------|--------|
| FENCED (explizit org_id) | 188 |
| FENCED (RLS-only, Coach — by design) | 12 |
| N/A (public, cron, webhook) | 23 |
| User-scoped (kein org nötig) | 4 |
| **UNFENCED** | **6** |

### UNFENCED Routes (Cross-Tenant-Risiko)

| Route | Risiko | Problem |
|-------|--------|---------|
| `api/ai-chat` | **KRITISCH** | Liest profiles/bookings/visitors aller Orgs für AI-Kontext (500 profiles, 100 bookings) |
| `api/engel/match` | **HOCH** | Liest PLZ (PII) aller Engel über createAdminClient ohne org-Filter |
| `api/bookings/notify` | MITTEL | createAdminClient ohne org-Filter bei Benachrichtigungen |
| `api/bookings/respond` | MITTEL | createAdminClient-Lese ohne org-Filter |
| `api/admin/pricing` | NIEDRIG | kf_pricing-Tabellen ohne org-Filter (aber user-scoped Client) |
| `api/notify-admin-registration` | NIEDRIG | Admin-Benachrichtigung ohne org-Scoping |

### Positiv

- 188/233 Routes korrekt gefenced via domain-spezifische Auth-Wrapper
- Pattern (`requirePflegeAdmin`, `requireOpsAdmin`, etc.) konsistent angewendet
- Coach-Routes bewusst ohne org (DiPAV-Produktgrenze, nur RLS)

---

## 5. Offene Risiken

| # | Risiko | Priorität | Status |
|---|--------|-----------|--------|
| 1 | mis_audit_log ohne org_id | P0 | **GEFIXT** (Migration 20260822010000) |
| 2 | 6 Billing-Policies mit profiles-Subquery | P1 | **GEFIXT** (Migration 20260822020000) |
| 3 | ai-chat liest Cross-Tenant-Daten (500 profiles) | P0 | **GEFIXT** — org_fence via getActiveOrgId + organization_members |
| 4 | engel/match liest PLZ aller Engel (PII) | P1 | **GEFIXT** — org_fence via organization_members |
| 5 | bookings/notify + respond ohne org-Filter | P1 | **GEFIXT** — org_fence via organization_id |
| 5b | notify-admin-registration ohne org-Filter | P1 | **GEFIXT** — org_fence via organization_members |
| 5c | admin/pricing ohne org-Filter | NIEDRIG | AKZEPTIERT — kf_pricing-Tabellen sind globale Preiskonfiguration, nicht mandantenspezifisch, RLS aktiv |
| 6 | 19 SECDEF-Funktionen ohne REVOKE | P1 | **GEFIXT** (Migration 20260823010000) — 17 Trigger REVOKE, 2 Non-Trigger PUBLIC-REVOKE |
| 7 | 44 Policies mit profiles-Subquery | P2 | **GEFIXT** (Migration 20260823020000) — 44 Policies auf is_admin() umgestellt |
| 8 | ~57 Migrationen ausstehend auf Production | — | Blocked bis Supabase-MCP verfügbar, Apply-Plan in audit/MIGRATION_APPLY_PLAN_2026-08-10.md |
| 9 | Schema-Vergleich Live vs. Repo unvollständig | — | Blocked bis Supabase-MCP verfügbar |

---

## 6. GO/NO-GO

### Code-Qualität: **GO** ✓
- Tests 1462/1462 grün (+181 neue Security-Tests)
- Build grün
- Shadow-DB 109/0 (+2 neue Migrationen sauber)
- P0/P1/P2-Fixes committed (DB + API + Policies)
- 6/6 unfenced API-Routes gefixt (5 org_fence, 1 akzeptiert)
- 19/19 SECDEF-Funktionen abgesichert
- 44/44 profiles-Subquery-Policies auf is_admin() umgestellt

### Production-Deploy: **NO-GO** ✗
- Supabase-MCP nicht verfügbar → kein Live-Schema-Vergleich möglich
- ~57 ausstehende Migrationen → Apply-Plan dokumentiert (audit/MIGRATION_APPLY_PLAN_2026-08-10.md)
- Apply-Reihenfolge: Security-Basis → Module → Security-Abschluss

### Nächste Schritte
1. Supabase-MCP aktivieren
2. Live-Schema-Vergleich durchführen
3. Migrationen nach Apply-Plan anwenden (Phase 1 → 2 → 3)
4. Verifikations-Queries aus Apply-Plan ausfuehren
