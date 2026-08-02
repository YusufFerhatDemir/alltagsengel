# Database Schema Gap Report — Live-Supabase vs. Repo-Migrationen

**Datum:** 2026-08-02
**Branch:** `audit/phase3-production-readiness`
**Supabase-Projekt:** `nnwyktkqibdjxgimjyuq` (Live/Produktion)
**Vergleichsbasis Repo:** Shadow-DB, gebaut ausschließlich aus dem Repo (`scripts/shadow-db.sh`: `supabase/shadow/00_supabase_bootstrap.sql` → `supabase/initial-setup.sql` → 41 Migrationen)
**Produktivdatenbank wurde ausschließlich READ-ONLY introspiziert. Nichts wurde live verändert.**

---

## 0. Kurzfassung

| Frage | Antwort |
|---|---|
| Kann eine leere DB vollständig aus dem Repo aufgebaut werden? | ✅ **Ja, seit heute.** 43 SQL-Dateien laufen fehlerfrei von null durch (vorher: Abbruch bei `relation "public.clients" does not exist`). |
| Fehlen live vorhandene **Tabellen** im Repo? | ✅ Nein mehr — alle 124 Live-Tabellen werden im Repo-Aufbau angelegt (61 davon via neue Baseline `20260101000000`). |
| Fehlen live vorhandene **Spalten** im Repo? | ✅ Nein mehr — die letzten 20 Live-only-Spalten (4 Tabellen) schließt `20260802000200`. |
| Fehlen live vorhandene **Buckets** im Repo? | ✅ Nein mehr — `abrechnung` ergänzt in `20260802000200`; die 3 anderen legten ihre Migrationen schon an. |
| Ist die Phase-3-Migration (`20260801`) live? | ✅ **Ja** (entgegen bisheriger Annahme): 65 `*_org_fence`-Policies live, alle RESTRICTIVE; `organizations`, `organization_members`, `current_org_id()` existieren live. |
| RLS-Lücken live? | ✅ Keine: **0 von 124** Live-Tabellen ohne RLS. |
| Größte verbleibende Lücke | ⚠️ **Policy-Drift**: 166 Policy-Namen nur live / 97 nur im Repo (Details §5) — Isolation ist beidseitig gegeben, aber der Repo-Replay reproduziert nicht wortgleich die Live-Policy-Landschaft. |
| Live kaputt (Repo voraus) | 🔴 `profiles.deleted_at` + `account_deletion_tokens` fehlen LIVE → `/api/user/delete` (+ `/undo`) bricht live zur Laufzeit (DSGVO-Art.-17-Flow). Migration `20260419_soft_delete.sql` ist live nie (vollständig) angewendet worden. |

## 1. Methodik & Grenzen

**Live-Introspektion (alles read-only):**
- PostgREST-OpenAPI (`GET /rest/v1/`): alle Tabellen + Spalten + Typen + REST-exponierte RPCs.
- `GET /storage/v1/bucket`: Storage-Buckets.
- RPCs `audit_rls_all_status()` / `audit_rls_all_policies()` (SECURITY DEFINER, service-role-only, aus `20260419_rls_matrix_rpcs.sql`): RLS-Status aller 124 public-Tabellen + alle 407 public-Policies inkl. USING/WITH CHECK.

**Repo-Seite:** identische Abfragen (`pg_tables`, `pg_policies`, `pg_proc`, `information_schema`) gegen die von null gebaute Shadow-DB — verglichen wird also nicht Text, sondern das tatsächlich entstehende Schema.

**Grenzen (live nicht introspizierbar ohne SQL-Zugang):**
- **Trigger** und **Check-/FK-Constraints** live: keine Audit-RPC vorhanden. Bekannt aus Session-Memory: `used_amount`-Trigger existiert live; die Live-Check-Constraints `service_records.status/budget_type` weichen vom Soll ab. → Restlücke, siehe §8 Empfehlung E-4.
- **Storage-Objekt-Policies** (`storage.objects`): `audit_rls_all_policies()` filtert auf `schemaname='public'`. Repo definiert 4+ Policies auf `storage.objects` (service-proofs, verordnungen); Live-Stand nicht verifizierbar.
- **Nicht-REST-Funktionen** live (Trigger-Funktionen etc.): OpenAPI listet nur exponierte RPCs.

## 2. Tabellen (124 live / 132 repo)

**Live ⊆ Repo: jede Live-Tabelle wird im Repo-Aufbau angelegt.** Die Lücke von 61 „Live-only"-Tabellen (u. a. `clients`, `caregivers`, `service_records`, `invoices`, `fahrzeuge` — historisch direkt im Dashboard angelegt) schließt die neue Baseline:

- `20260101000000_baseline_live_only_tables.sql` — 62 `CREATE TABLE IF NOT EXISTS` (Spalten/Typen/Defaults/PKs aus Live-OpenAPI rekonstruiert). Läuft bewusst VOR allen datierten Migrationen. `organization_id` für die 30 tenant_tables darunter kommt weiterhin aus `20260801` (eine Quelle der Wahrheit).
- `20260101000100_baseline_live_only_functions.sql` — live vorhandene Funktionen (`prevent_role_escalation`, `generate_referral_code`, `get_emergency_info_with_pin`, Audit-RPCs, …).
- `20260802000100_baseline_live_only_constraints.sql` — FKs der Baseline-Tabellen (separat, weil Zieltabellen teils erst später entstehen).
- `20260802000200_baseline_live_only_columns_and_bucket.sql` — **neu heute**: letzte 20 Live-only-Spalten + Bucket `abrechnung` (§3/§6).

**Repo-only (8 Tabellen — im Repo definiert, live NICHT vorhanden):**

| Tabelle | Quelle im Repo | RLS/Policies im Repo | org_id | Risiko |
|---|---|---|---|---|
| `documents` | `initial-setup.sql` | ✅ 5 Policies (owner+admin) | ✳️ nein | P2 — bekannter Dead-Code (`upload-document.ts`), live nie angelegt |
| `payments` | `initial-setup.sql` | ✅ 2 Policies | ✳️ nein | P2 — Stripe-Flow nutzt eigene Tabellen; klären ob obsolet |
| `carebox_cart` / `carebox_catalog_items` / `carebox_order_requests` | `initial-setup.sql` | ✅ je 2–4 Policies | ✳️ nein | P2 — Feature live nie ausgerollt |
| `care_eligibility` | `initial-setup.sql` | ✅ 4 Policies | ✳️ nein | P2 |
| `account_deletion_tokens` | `20260419_soft_delete.sql` | ✅ service-role-only | ✳️ nein | 🔴 **P1** — fehlt live, `/api/user/delete` bricht (s. §0) |
| `analytics_events` | `20260525_analytics_events.sql` | ✅ 2 Policies | ✳️ nein | P2 — Route `app/api/analytics` schreibt vermutlich ins Leere/Fehler |

> Diese 8 sind KEIN Shadow-DB-Baufehler, sondern live nie angewendete Migrationen/Setups. Anwendung auf Live ist bewusst NICHT erfolgt (Stoppregel). → Empfehlung E-1.

## 3. Spalten

Nach `20260802000200` ist der Spaltenstand deckungsgleich, mit einer Ausnahme in Gegenrichtung:

| Tabelle | Diff | Status |
|---|---|---|
| `bookings` | live-only: `care_recipient_id`, `is_flexible` | ✅ geschlossen (20260802000200) |
| `lead_inquiries` | live-only: `service`, `utm_source` | ✅ geschlossen |
| `page_views` | live-only: `ip_address` | ✅ geschlossen |
| `visitors` | live-only: 15 Geo-/UTM-Spalten | ✅ geschlossen |
| `profiles` | **repo-only: `deleted_at`** | 🔴 offen — live fehlt die Spalte (P1, §0) |

## 4. organization_id & RLS (live verifiziert)

- **0 von 124** Live-Tabellen ohne RLS (`rowsecurity=false`: keine).
- **67** Live-Tabellen mit `organization_id`; davon **65 mit `*_org_fence`-Policy — alle RESTRICTIVE** (identisch mit dem Repo-Aufbau: ebenfalls 65, gleiche Tabellen).
- Die 2 ohne Fence sind `organization_members` und `organization_subscriptions` — **by design**: sie sind die Quelle der Mitgliedschaft und haben eigene Policies aus `20260801`.
- Keine Fence-Policy ohne zugehörige `organization_id`-Spalte.

**⇒ Die DB-seitige Tenant-Isolation (Phase 3) ist live vollständig aktiv.** (Memory-Stand „20260801 noch nicht live" war veraltet; korrigiert.)

## 5. Policies — der eigentliche Gap: Drift (P1)

| Messung | Wert |
|---|---|
| Policies live (public) | 407 |
| Policies Repo-Aufbau | 338 |
| Namensgleich beidseitig | 241 (inkl. aller 65 org_fence) |
| Nur live | **166** |
| Nur Repo | **97** |

Klassifikation der Differenzen (Stichproben-verifiziert an USING/WITH CHECK):

1. **Namens-Drift, semantisch äquivalent (~Großteil):** Live trägt noch die Alt-Namen (teils türkisch: `Herkes engelleri okuyabilir`, `Müşteri booking oluşturabilir`), das Repo die renovierten Namen aus `fix_rls_policies.sql`/Lockdowns (`Anyone can view angels`, `Customers can create bookings`). Die Renovierungs-Migrationen wurden live offenbar in anderer Form (Supabase-MCP/SQL-Editor) angewendet als committet.
2. **Live-only `*_service_all`-Policies** (`clients_service_all`, `invoices_service_all`, …, ~30 Stück): redundant, da `service_role` `BYPASSRLS` hat — im Repo bewusst nicht mehr enthalten. Unkritisch.
3. **Live-only `mis_*_staff_*`-Policies** (is_internal_staff-basiert) vs. Repo `mis_*_admin_all`: Der Live-Stand ist hier FEINER (staff-select/insert/update/delete getrennt) als der Repo-Stand. Der Repo-Replay würde die staff-Abstufung NICHT herstellen.
4. **Repo-only-Policies auf Repo-only-Tabellen** (documents, payments, carebox_*, …): folgen aus §2.

**Risiko:** Kein akutes Isolations-Loch (Fences + RLS beidseitig komplett), aber: ein Disaster-Recovery-Aufbau aus dem Repo ergäbe eine ANDERE Policy-Landschaft als live — insbesondere ohne die staff-Abstufungen (3). → E-2.

## 6. Storage-Buckets

| Bucket | Live | Repo-Migration | public |
|---|---|---|---|
| `mis-documents` | ✅ | `20260302_mis_schema.sql` | ❌ privat |
| `service-proofs` | ✅ | `20260706_monatsabschluss_ki_pruefzentrale.sql` | ❌ privat |
| `verordnungen` | ✅ | `20260730_verordnungen_workflow_complete.sql` | ❌ privat |
| `abrechnung` | ✅ | **war nirgends** → ✅ `20260802000200` | ❌ privat |

Alle Live-Buckets privat ✅. Objekt-Policies: Repo definiert welche für service-proofs/verordnungen; Live-Stand nicht read-only prüfbar (§1 Grenzen).

## 7. Funktionen / RPCs / Trigger

- **Alle 16 REST-exponierten Live-RPCs existieren im Repo-Aufbau** (`current_org_id`, `is_admin`, `is_org_member`, `has_org_role`, `get_engel_cards`, `get_emergency_info_with_pin`, Audit-RPCs, …). Keine Live-RPC fehlt im Repo.
- Repo-Aufbau erzeugt 25 public-Funktionen und 21 Trigger. Live-Trigger/-Funktionen jenseits der REST-Schicht: nicht introspizierbar (§1) — bekannte Live-Besonderheiten aus Memory: `used_amount`-Trigger vorhanden, `combined_used_amount` fehlt, Check-Constraints `service_records.status/budget_type` live falsch.

## 8. Empfehlungen (KEINE davon heute ausgeführt — Stoppregel)

| # | Prio | Maßnahme |
|---|---|---|
| E-1 | **P1** | `20260419_soft_delete.sql` (profiles.deleted_at + account_deletion_tokens) kontrolliert auf Live anwenden — bis dahin ist der Konto-Lösch-Flow live kaputt. Vorher `/api/user/delete` manuell gegen Preview testen. |
| E-2 | P1 | Policy-Konsolidierungs-Migration erstellen: Live-Alt-Policies droppen/umbenennen, `mis_*_staff_*`-Abstufung ins Repo übernehmen — Ziel: Repo-Replay ≡ Live. Vorher `audit_rls_all_policies()`-Dump als Fixture einfrieren. |
| E-3 | P2 | Entscheid je Repo-only-Tabelle (documents/payments/carebox_*/care_eligibility/analytics_events): live anlegen ODER Migration + Code entfernen. |
| E-4 | P2 | Introspektions-RPCs für Trigger + Constraints + storage-Policies ergänzen (analog `audit_rls_all_policies`), damit dieser Report-Teil automatisierbar wird. |
| E-5 | P2 | `visitors`/`page_views` speichern IP + Geo (personenbezogen) — DSGVO-Löschkonzept/TTL prüfen. |

## 9. Beleg: leere DB aus Repo baubar

```
$ ./scripts/shadow-db.sh test        # Aufbau von null
  Dateien: 43 OK, 0 fehlgeschlagen
  Tenant-Tests: 28/28 PASS
$ ./scripts/shadow-db.sh idempotency # kompletter Zweitlauf aller 41 Migrationen
  41 OK, 0 FEHLER
```

Details: `audit/SHADOW_DB_LIVE_TEST_REPORT.md`.
