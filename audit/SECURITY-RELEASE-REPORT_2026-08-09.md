# SECURITY RELEASE REPORT — 2026-08-09

## Zusammenfassung

Drei Security-Migrations auf Production angewendet (Supabase-Projekt `nnwyktkqibdjxgimjyuq`).
Alle drei PASS. Zusätzlicher Security-Scan durchgeführt — P1-Findings dokumentiert.

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
| `_run_sql` EXECUTE Grants | NUR `service_role`, `postgres` | **PASS** |
| `_sql_parts` RLS enabled | `true` | **PASS** |
| `_sql_parts` anon/auth Grants | KEINE | **PASS** |

---

### Migration 2: `20260815010000_profiles_rls_rekursion_und_anon_leck.sql`

**Befund:** Policy "Admin profilleri yönetebilir" auf profiles verursachte 42P17
(infinite recursion). Zwei offene SELECT-Policies für Rolle `public` erlaubten
anon-Lesezugriff auf alle 59 Profile (email, phone, postal_code, location).
Die Rekursion verdeckte das Leck — sobald nur die Rekursion behoben würde,
wären alle Profile öffentlich lesbar gewesen.

**Fix:** Drei Policies gedroppt:
- `Admin profilleri yönetebilir` (rekursiv, FOR ALL)
- `Herkes profilleri okuyabilir` (USING(true), SELECT)
- `Anyone can view public profiles` (USING(deleted_at IS NULL), SELECT)

Absicherung: `Admins can manage all profiles` (is_admin()) und `profiles_select_own`
(auth.uid() = id) existieren und wurden verifiziert.

**Verifikation:**

| Check | Ergebnis |
|---|---|
| Rekursive Policy entfernt | NICHT in pg_policies | **PASS** |
| "Herkes profilleri okuyabilir" entfernt | NICHT in pg_policies | **PASS** |
| "Anyone can view public profiles" entfernt | NICHT in pg_policies | **PASS** |
| "Admins can manage all profiles" existiert | is_admin() | **PASS** |
| profiles_select_own existiert | auth.uid() = id | **PASS** |
| Verbleibende Policies: alle safety_status=OK | 12/12 OK | **PASS** |

---

### Migration 3: `20260817020000_audit_probe_zeile_dokumentieren.sql`

**Befund:** `billing_audit_trail` enthält eine Probe-Zeile
(id `e9c8908f-...`, action=`__probe__`) vom CHECK-Constraint-Test.
Die Zeile kann nicht gelöscht werden (Immutabilitäts-Trigger).

**Fix:** COMMENT auf `billing_audit_trail` gesetzt, der die Zeile als bekanntes
Systemereignis dokumentiert. Keine Datenänderung.

**Verifikation:**

| Check | Ergebnis |
|---|---|
| Table-Comment gesetzt | Vollständiger Text mit Probe-Zeile-Referenz | **PASS** |

---

## 2. GESAMTVERIFIKATION

| Prüfpunkt | Ergebnis |
|---|---|
| **Tabellen ohne RLS** | 0 (vorher 1: `_sql_parts`) | **PASS** |
| **`_run_sql` anon-Zugriff** | GESPERRT | **PASS** |
| **profiles anon-Lesezugriff** | GESPERRT (0 offene SELECT-Policies) | **PASS** |
| **profiles Rekursion** | BEHOBEN (keine rekursive Policy) | **PASS** |
| **Storage Buckets** | 8/8 private | **PASS** |
| **Service-Key-Leaks in Storage** | 0 gefunden | **PASS** |
| **Produktionsdaten-Regression** | profiles=59, clients=4, invoices=5, service_records=31, caregivers=2, abrechnungslaeufe=1, billing_audit_trail=1 — ALLE UNVERÄNDERT | **PASS** |

---

## 3. ZUSÄTZLICHER SECURITY-SCAN — P1-FINDINGS

### P1-A: Workflow-RPC-Funktionen für anon aufrufbar

**5 SECURITY DEFINER Funktionen** sind über PostgREST RPC von anon erreichbar:

| Funktion | Risiko |
|---|---|
| `wf_emit_event(uuid,text,text,text,uuid,jsonb,text,text,uuid)` | Event-Injection |
| `wf_execute_queue_item(uuid)` | Queue-Manipulation |
| `wf_process_event(uuid)` | Event-Verarbeitung |
| `wf_process_pending(integer)` | Batch-Trigger |
| `wf_check_fristen()` | Fristen-Lesen (read-only) |

**Auswirkung:** Anon könnte Workflow-Events injizieren, Queue-Items verarbeiten
oder Batch-Processing auslösen. Da die Funktionen SECURITY DEFINER sind,
umgehen sie RLS.

**Empfehlung:** REVOKE EXECUTE auf alle `wf_*` Funktionen für `anon`. Nur
`service_role` und `authenticated` behalten.

### P1-B: `next_billing_number` für anon aufrufbar

**Funktion:** `next_billing_number(uuid, text, integer)` — SECURITY DEFINER.

**Auswirkung:** Anon könnte Rechnungsnummern verbrennen (Sequenzlücken erzeugen).

**Empfehlung:** REVOKE EXECUTE für `anon`.

### P1-C: Auth-Utility-Funktionen für anon aufrufbar (niedriges Risiko)

`is_admin()`, `current_org_id()`, `is_org_member()`, etc. — alle SECURITY DEFINER,
alle für anon aufrufbar. Geben für anon false/null zurück. Minimales
Informationsleck (`is_profile_soft_deleted(uuid)` könnte UUID-Existenz verraten).

**Empfehlung:** Mittelfristig REVOKE für `anon` auf alle Nicht-Trigger SECURITY
DEFINER Funktionen außer `bundesland_fuer_plz` (öffentliches PLZ-Lookup).

---

## 4. GO/NO-GO ENTSCHEIDUNGEN

### CODE-PRODUCTION (Vercel Deployment)

**GO** — Alle P0-Schwachstellen geschlossen. Build, TypeScript, Tests grün.
Vercel OOM behoben. E2E-Kette bis Monatsabschluss implementiert.

### PRODUCTION (Datenbank-Sicherheit)

**CONDITIONAL GO** — Alle P0 geschlossen (Migration 1+2+3 angewendet und verifiziert).
P1 offen (wf_* anon RPC). Kein sofortiges Risiko für Datenverlust/-abfluss,
aber nächste Iteration sollte die P1-Fixes enthalten.

### KASSENABRECHNUNG (§302 SGB V DTA)

**NO-GO** — Externe Blocker:
1. ITSG SECON-Zertifikat nicht beantragt
2. SFTP-Zugang bei Datenannahmestelle fehlt
3. Kassen-Stammdaten und Tarife nicht eingepflegt
4. §45a-Anerkennungsbescheid ausstehend

### DiPA-WEITERENTWICKLUNG

**CONDITIONAL GO** — Codebase ist stabil, Security-Baseline hergestellt.
Voraussetzung: P1-Findings (wf_* anon RPC) vor nächstem Feature-Block schließen.

---

## 5. MIGRATIONS-ZEITSTEMPEL

| Migration | Angewendet | Status |
|---|---|---|
| `20260817010000_sql_exec_rpc_absichern.sql` | 2026-08-09 | **APPLIED** |
| `20260815010000_profiles_rls_rekursion_und_anon_leck.sql` | 2026-08-09 | **APPLIED** |
| `20260817020000_audit_probe_zeile_dokumentieren.sql` | 2026-08-09 | **APPLIED** |

Rollback-Dateien existieren im Repo:
- `20260817010001_rollback_sql_exec_rpc_absichern.sql`
- `20260815010001_rollback_profiles_rls_rekursion_und_anon_leck.sql`
- `20260817020001_rollback_audit_probe_zeile_dokumentieren.sql`

---

*Report erstellt: 2026-08-09, autonome Ausführung via Supabase MCP execute_sql*
*Production-Projekt: nnwyktkqibdjxgimjyuq*
*Branch: staging/expansion-abnahme*
