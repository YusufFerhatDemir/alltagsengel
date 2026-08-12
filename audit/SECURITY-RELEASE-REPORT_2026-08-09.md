# SECURITY RELEASE REPORT — 2026-08-09

## Zusammenfassung

Vier Security-Migrations auf Production angewendet (Supabase-Projekt `nnwyktkqibdjxgimjyuq`).
Alle vier PASS. Vollständiger Security-Scan durchgeführt — **P0 = 0, P1 = 0**.

---

## 1. ANGEWENDETE MIGRATIONS

### Migration 1: `20260817010000_sql_exec_rpc_absichern.sql`

**Befund:** `public._run_sql(text)` war SECURITY INVOKER mit EXECUTE-Grants für PUBLIC, anon,
authenticated. Jeder Browser-Besucher konnte über den öffentlichen Anon-Key beliebiges SQL
gegen die Produktionsdatenbank absetzen (DoS, Daten-Orakel, RLS-Umgehung).
`public._sql_parts` hatte kein RLS (einzige Tabelle im Schema ohne RLS).

**Fix:** REVOKE ALL auf `_run_sql` für PUBLIC, anon, authenticated. RLS auf `_sql_parts`
aktiviert, alle Grants für anon/authenticated entzogen. Nichts gelöscht.

**Verifikation:**

| Check | Ergebnis |
|---|---|
| `_run_sql` EXECUTE Grants | NUR `service_role`, `postgres` — **PASS** |
| `_sql_parts` RLS enabled | `true` — **PASS** |
| `_sql_parts` anon/auth Grants | KEINE — **PASS** |

---

### Migration 2: `20260815010000_profiles_rls_rekursion_und_anon_leck.sql`

**Befund:** Policy "Admin profilleri yönetebilir" auf profiles verursachte 42P17
(infinite recursion). Zwei offene SELECT-Policies für Rolle `public` erlaubten
anon-Lesezugriff auf alle 59 Profile (email, phone, postal_code, location).

**Fix:** Drei Policies gedroppt:
- `Admin profilleri yönetebilir` (rekursiv, FOR ALL)
- `Herkes profilleri okuyabilir` (USING(true), SELECT)
- `Anyone can view public profiles` (USING(deleted_at IS NULL), SELECT)

**Verifikation:**

| Check | Ergebnis |
|---|---|
| Rekursive Policy entfernt | NICHT in pg_policies — **PASS** |
| "Herkes profilleri okuyabilir" entfernt | NICHT in pg_policies — **PASS** |
| "Anyone can view public profiles" entfernt | NICHT in pg_policies — **PASS** |
| "Admins can manage all profiles" existiert | is_admin() — **PASS** |
| profiles_select_own existiert | auth.uid() = id — **PASS** |
| Verbleibende Policies: alle safety_status=OK | 12/12 OK — **PASS** |

---

### Migration 3: `20260817020000_audit_probe_zeile_dokumentieren.sql`

**Befund:** `billing_audit_trail` enthält eine Probe-Zeile
(id `e9c8908f-...`, action=`__probe__`) vom CHECK-Constraint-Test.
Die Zeile kann nicht gelöscht werden (Immutabilitäts-Trigger).

**Fix:** COMMENT auf `billing_audit_trail` gesetzt. Keine Datenänderung.

**Verifikation:**

| Check | Ergebnis |
|---|---|
| Table-Comment gesetzt | Vollständiger Text mit Probe-Zeile-Referenz — **PASS** |

---

### Migration 4: `20260817030000_secdef_rpc_haertung.sql`

**Befund (P1):** Sechs SECURITY DEFINER Funktionen waren für anon aufrufbar:

| Funktion | Risiko |
|---|---|
| `wf_emit_event` | Event-Injection in beliebigen Mandanten |
| `wf_process_event` | Event-Verarbeitung als postgres |
| `wf_execute_queue_item` | Queue-Manipulation |
| `wf_process_pending` | Batch-Processing-Trigger |
| `wf_check_fristen` | Fristen-Lesen |
| `next_billing_number` | Rechnungsnummern verbrennen (§14 UStG) |

Alle Funktionen laufen als `postgres` (SECURITY DEFINER), nehmen Mandanten-ID als
Parameter und prüfen KEINE Berechtigung im Body. Produktionsaufrufe laufen ausschließlich
über `createAdminClient()` (service_role) in geschützten API-Routes mit `requireOpsAdmin()`.

**Fix:** REVOKE ALL für PUBLIC, anon, authenticated. GRANT EXECUTE nur für service_role.
Alle SECURITY DEFINER Funktionen ohne search_path nachgezogen.

**Verifikation:**

| Check | Ergebnis |
|---|---|
| wf_emit_event | anon=false, auth=false, svc=true — **PASS** |
| wf_process_event | anon=false, auth=false, svc=true — **PASS** |
| wf_execute_queue_item | anon=false, auth=false, svc=true — **PASS** |
| wf_process_pending | anon=false, auth=false, svc=true — **PASS** |
| wf_check_fristen | anon=false, auth=false, svc=true — **PASS** |
| next_billing_number | anon=false, auth=false, svc=true — **PASS** |
| SECDEF ohne search_path | 0 verbleibend — **PASS** |

---

### Zusätzliche Härtung: `20260817030002_zusaetzliche_secdef_haertung.sql`

**Befund:** `kassenabrechnung_erlaubt(uuid,text)` und `bundesland_fuer_plz(text)` —
beide SECURITY DEFINER, nicht in RLS referenziert, für anon aufrufbar.

**Fix:** REVOKE für anon, GRANT für authenticated + service_role. Auf Production live
angewendet am 09.08.2026.

**Verifikation:**

| Check | Ergebnis |
|---|---|
| kassenabrechnung_erlaubt | anon=false, auth=true, svc=true — **PASS** |
| bundesland_fuer_plz | anon=false, auth=true, svc=true — **PASS** |

---

## 2. VOLLSTÄNDIGER SECURITY-SCAN

### 2.1 Tabellen ohne RLS

| Prüfpunkt | Ergebnis |
|---|---|
| Tabellen ohne RLS | **0** — **PASS** |

### 2.2 SECURITY DEFINER Funktionen

| Prüfpunkt | Ergebnis |
|---|---|
| SECDEF + anon ohne RLS-Nutzung | **0** (nach Fix) — **PASS** |
| SECDEF ohne search_path | **0** — **PASS** |
| SECDEF + anon mit RLS-Nutzung (by design) | 9 Auth-Utilities (is_admin, current_org_id, etc.) — alle return false/null für anon, search_path gesetzt — **AKZEPTIERT** |

Die 9 verbleibenden SECDEF+anon-Funktionen (is_admin, is_internal_staff, is_org_member,
is_own_caregiver, is_own_client, is_profile_soft_deleted, has_org_role, current_org_id,
state_flag) werden in RLS-Policies referenziert. PostgreSQL evaluiert ALLE zutreffenden
Policies — ein REVOKE für anon würde die RLS-Auswertung brechen. Alle geben für
anon false/null zurück — keine Privilege-Escalation möglich.

### 2.3 RPC-Funktionen (non-SECDEF) mit anon EXECUTE

| Kategorie | Funktionen | Bewertung |
|---|---|---|
| btree_gist Extension | ~150 gbt_* Funktionen | Intern, INVOKER, nicht über PostgREST aufrufbar — **KEIN RISIKO** |
| App INVOKER-Funktionen | get_calendar_assignments, get_monthly_closing_overview, landesregel, normalize_bundesland, etc. | INVOKER + RLS auf allen Tabellen → anon bekommt 0 Zeilen — **KEIN RISIKO** |
| Referenz-Funktionen | eindeutiges_bundesland_fuer_plz, validate_ik_nummer | Öffentliche Validierung, INVOKER — **BY DESIGN** |

### 2.4 Storage

| Prüfpunkt | Ergebnis |
|---|---|
| Public Buckets | **0** (8/8 private) — **PASS** |
| INSERT-Policies | Alle mit is_admin() oder auth.uid()-Check — **PASS** |
| SELECT-Policies | Alle mit is_admin() oder auth.uid()-Check — **PASS** |
| DELETE-Policies | Alle mit is_admin() oder auth.uid()-Check — **PASS** |

### 2.5 Anon-lesbare Tabellen (USING(true) mit {public})

| Tabelle | Policy | Bewertung |
|---|---|---|
| angel_reviews | "Jeder kann Bewertungen lesen" | Öffentliche Bewertungen — **BY DESIGN** |
| angels | "Herkes engelleri okuyabilir" | Öffentliche Engel-Profile (Marktplatz) — **BY DESIGN** |
| reviews | "Herkes reviewleri okuyabilir" + reviews_select | Öffentliche Reviews — **BY DESIGN** |
| kf_feature_flags | "Auth can read feature flags" | Feature-Flags, nicht sensitiv — **BY DESIGN** |
| bundeslaender | bundeslaender_read ({anon,authenticated}) | Referenzdaten — **BY DESIGN** |
| plz_bundesland_regeln | plz_regeln_read ({anon,authenticated}) | Referenzdaten — **BY DESIGN** |

### 2.6 Mandantentrennung

| Prüfpunkt | Ergebnis |
|---|---|
| Admin-Policies ohne org_id | Nutzen is_admin() — bei Single-Org akzeptabel — **P3 (Multi-Tenant-Readiness)** |
| Billing-Referenztabellen USING(true) {authenticated} | billing_tariffs, billing_feiertage, etc. — Referenzdaten — **BY DESIGN** |
| IDOR/BOLA | Alle Datenzugriffe über auth.uid()-JOINs oder is_admin()/is_internal_staff() — **PASS** |

### 2.7 Service-Role-Exposure

| Prüfpunkt | Ergebnis |
|---|---|
| `*_service_all` Policies | Alle auf `{service_role}` beschränkt — **PASS** |
| API-Routes mit createAdminClient() | Alle hinter requireOpsAdmin() — **PASS** |
| Anon-RPC `get_emergency_info_with_pin` | PIN-gated, einziger anon-RPC im Frontend — **BY DESIGN** |

### 2.8 Produktionsdaten-Regression

| Tabelle | Vorher | Nachher | Status |
|---|---|---|---|
| profiles | 59 | 59 | **UNVERÄNDERT** |
| clients | 4 | 4 | **UNVERÄNDERT** |
| invoices | 5 | 5 | **UNVERÄNDERT** |
| service_records | 31 | 31 | **UNVERÄNDERT** |
| caregivers | 2 | 2 | **UNVERÄNDERT** |
| abrechnungslaeufe | 1 | 1 | **UNVERÄNDERT** |
| billing_audit_trail | 1 | 1 | **UNVERÄNDERT** |
| organizations | 3 | 3 | **UNVERÄNDERT** |

---

## 3. GO/NO-GO ENTSCHEIDUNGEN

### CODE-PRODUCTION (Vercel Deployment)

**GO** — Alle P0/P1-Schwachstellen geschlossen. Build, TypeScript, Tests grün.

### PRODUCTION DB-SECURITY

**GO** — P0 = 0, P1 = 0. Vollständiger Security-Scan abgeschlossen:
- 0 Tabellen ohne RLS
- 0 gefährliche SECDEF+anon-Funktionen
- 0 SECDEF ohne search_path
- 0 public Storage-Buckets
- 0 anon-lesbare sensitive Daten
- Produktionsdaten vollständig unverändert
- Alle API-Routes mit Auth-Guards

### KASSENABRECHNUNG (§302 SGB V DTA)

**NO-GO** — Externe Blocker (NICHT technisch):

| # | Blocker | Typ |
|---|---|---|
| A1 | ITSG SECON-Zertifikat nicht beantragt | Extern/regulatorisch |
| A2 | SFTP-Zugang bei Datenannahmestelle fehlt | Extern/regulatorisch |
| A3 | Kassen-Stammdaten und Tarife nicht eingepflegt | Intern/Daten |
| A4 | §45a-Anerkennungsbescheid ausstehend | Extern/regulatorisch |

Technische Infrastruktur (DB-Schema, Validierung, DTA-Format, Audit-Trail) ist
produktionsbereit. Die Blocker sind ausschließlich extern/regulatorisch.

### DiPA-WEITERENTWICKLUNG

**GO** — Codebase stabil, Security-Baseline hergestellt, P0/P1 = 0.

---

## 4. MIGRATIONS-ZEITSTEMPEL

| Migration | Angewendet | Status |
|---|---|---|
| `20260817010000_sql_exec_rpc_absichern.sql` | 2026-08-09 | **APPLIED** |
| `20260815010000_profiles_rls_rekursion_und_anon_leck.sql` | 2026-08-09 | **APPLIED** |
| `20260817020000_audit_probe_zeile_dokumentieren.sql` | 2026-08-09 | **APPLIED** |
| `20260817030000_secdef_rpc_haertung.sql` | 2026-08-09 | **APPLIED** |
| `20260817030002_zusaetzliche_secdef_haertung.sql` | 2026-08-09 | **APPLIED** |

Rollback-Dateien existieren im Repo:
- `20260817010001_rollback_sql_exec_rpc_absichern.sql`
- `20260815010001_rollback_profiles_rls_rekursion_und_anon_leck.sql`
- `20260817020001_rollback_audit_probe_zeile_dokumentieren.sql`
- `20260817030001_rollback_secdef_rpc_haertung.sql`

---

## 5. VERBLEIBENDE P2/P3 (NICHT BLOCKIEREND)

| # | Finding | Prio | Beschreibung |
|---|---|---|---|
| P2-1 | Multi-Tenant org_id Filterung | P3 | Admin-Policies ohne org_id-Check — akzeptabel bei Single-Org |
| P2-2 | Billing-Referenz USING(true) | P3 | authenticated kann alle Tarife/Feiertage lesen — Referenzdaten |
| P2-3 | Duplicate review policies | P3 | `reviews` hat 2× SELECT USING(true) für {public} — funktional harmlos |

---

*Report erstellt: 2026-08-09, autonome Ausführung via Supabase MCP execute_sql*
*Production-Projekt: nnwyktkqibdjxgimjyuq*
*Branch: staging/expansion-abnahme*
*Vollständiger Security-Scan: P0=0, P1=0*
*CODE-PRODUCTION: GO | PRODUCTION DB-SECURITY: GO*
