# Security-P0 — Befunde, Apply-Weg, Verifikationsplan

**Stand:** 09.08.2026 · **Branch:** `staging/expansion-abnahme` · **Projekt:** `nnwyktkqibdjxgimjyuq`

Alle Befunde sind **live gegen Production gemessen**, nicht aus dem Repo abgeleitet.
Messwege: PostgREST mit dem öffentlichen anon-Key, sowie Katalogabfragen
(`pg_proc`, `pg_policies`, `has_function_privilege`) über `service_role`.

---

## 1. Befundlage

| # | Befund | Schwere | Status auf Production |
|---|--------|---------|----------------------|
| 1 | `public._run_sql(p text)` führt beliebiges SQL für `anon` aus | P0 | **GESCHLOSSEN** (während der Session eingespielt) |
| 2 | `public._sql_parts` ohne RLS, volle CRUD-Grants für `anon` | P0 | **GESCHLOSSEN** |
| 3 | 6 SECURITY-DEFINER-RPCs für `anon` ausführbar (`wf_*`, `next_billing_number`) | **P0** | **OFFEN** |
| 4 | `profiles`: zwei permissive SELECT-Policies für Rolle `public` | P0 | **GESCHLOSSEN** |
| 5 | `profiles`: 42P17-Totalblockade — transitiv über `bookings` | **P0** | **OFFEN** |
| 6 | 74 Policies auf 70 Tabellen mit `profiles`-Subquery (schlafende Rekursion) | P2 | offen, bewusst nicht im Hotfix |
| 7 | 3 SECURITY-DEFINER-Funktionen ohne `search_path` | P2 | OFFEN (in Teil 2 mitbehoben) |
| 8 | `billing_audit_trail`: Probe-Zeile `__probe__` | Doku | **DOKUMENTIERT** |

### Befund 3 — der schwerwiegendste noch offene Punkt

Sechs Funktionen sind `SECURITY DEFINER` (laufen als `postgres`, umgehen **jede**
RLS), nehmen die Mandanten-ID **als Parameter** entgegen und prüfen im Body
**keine Berechtigung**. `has_function_privilege('anon', …, 'EXECUTE') = true`:

```
wf_emit_event   wf_process_event   wf_execute_queue_item
wf_process_pending   wf_check_fristen   next_billing_number
```

Konkrete Wirkung ohne jede Anmeldung, nur mit dem Browser-Key:

- `next_billing_number(p_org_id)` zählt den Rechnungsnummernkreis eines **frei
  wählbaren** Mandanten hoch → Lücken in der fortlaufenden Nummer
  (§14 Abs. 4 UStG, GoBD-Vollständigkeit).
- `wf_emit_event(p_organization_id, …)` schreibt frei bestimmbare Zeilen in
  `wf_events` **und `wf_audit_log`** jedes Mandanten → Fremdbeschreibung des
  Audit-Logs durch einen Unangemeldeten.
- `wf_process_pending()` / `wf_execute_queue_item()` arbeiten die Warteschlange
  als `postgres` ab und legen dabei `ops_aufgaben`, `ops_benachrichtigungen`,
  `ops_wiedervorlagen` mandantenweit **an der RLS vorbei** an.

**Ursache — kein Einzelfehler:** `20260813010000_workflow_engine.sql` enthält
kein einziges `GRANT`. Die Rechte stammen aus den Default-Privileges von
Supabase, die im Schema `public` EXECUTE an `anon` und `authenticated` erteilen.
Jede Funktion ohne ausdrücklichen `REVOKE` ist damit öffentlich. Die neueren
Funktionen machen es richtig (`update_state_settings`, `claim_waitlist_batch`,
`activate_insurance_billing`, `deactivate_insurance_billing` → `anon=false`).

**Warum der Entzug gefahrlos ist:** alle Produktionsaufrufer nutzen
`createAdminClient()` = `service_role`:

- `app/api/ops/workflow/events/route.ts:10,30`
- `app/api/ops/workflow/processing/route.ts:9`
- `lib/billing/core/invoice-engine.ts:402` — wird außerhalb `__tests__`
  nirgends importiert und fängt RPC-Fehler mit einem Fallback ab (Zeile 409–412)
- Einziger Browser-`.rpc()` im gesamten Repo: `get_emergency_info_with_pin`
  (`app/notfall/[id]/page.tsx:84`) — PIN-gated, absichtlich anon-fähig, **nicht betroffen**

### Befund 5 — die Diagnose in `20260815010000` war unvollständig

Die drei `profiles`-Alt-Policies sind entfernt (live bestätigt). Trotzdem:

```
GET /rest/v1/profiles?select=id,email
→ 500 {"code":"42P17","message":"infinite recursion detected in policy for relation \"profiles\""}
```

Der Zyklus läuft nicht innerhalb von `profiles`, sondern über eine zweite Tabelle:

```
profiles.profiles_select_booking_partner
    USING (… EXISTS (SELECT 1 FROM bookings b WHERE b.customer_id = profiles.id …))
                 │  löst die RLS von bookings aus
                 ▼
bookings."Admin bookingleri yönetebilir"   FOR ALL
    USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND role = 'admin'))
                 │  ruft die profiles-Policies erneut auf
                 ══> Rekursion
```

Exakt dieselbe Anti-Pattern wie die bereits entfernte `"Admin profilleri
yönetebilir"`, nur eine Tabelle weiter. Der Ersatz `bookings_admin USING
(is_admin())` steht bereits und ist aktiv; `is_admin()` ist SECURITY DEFINER,
umgeht die Policies und deckt **mehr** ab als die Alt-Policy
(`role IN ('admin','superadmin') AND deleted_at IS NULL` statt `role = 'admin'`).

> **Wichtig:** Die Rekursion ist keine Absicherung. Sie *verdeckt* Befund 4 nur.
> Deshalb mussten Befund 4 und 5 gemeinsam behoben werden — was Teil 3 + 3b tun.

### Korrektur zu `audit/SECURITY-RELEASE-REPORT_2026-08-09.md`

Dieser Report (aus einer parallelen Session, die die Migrationen 20260817010000,
20260815010000 und 20260817020000 eingespielt hat) führt

> **profiles Rekursion** | BEHOBEN (keine rekursive Policy) | **PASS**

Das ist **strukturell** geprüft — es steht keine rekursive Policy mehr *auf
profiles* — aber nicht **funktional**. Der Live-Aufruf am 09.08.2026, 12:10 Uhr
liefert weiterhin 42P17 (siehe oben). Die Rekursion läuft transitiv über
`bookings` und ist erst mit Teil 3b beseitigt. Bis dahin gilt Befund 5 als offen.

Die übrigen PASS-Einträge des Reports habe ich unabhängig nachgemessen und
bestätigt: `_run_sql`-ACL ist `{postgres, service_role}`, `_sql_parts` hat RLS an
und keine anon-Grants, die drei profiles-Alt-Policies sind weg, der
Tabellenkommentar auf `billing_audit_trail` steht.

---

## 2. Was Yusuf tun muss

**Eine Aktion:** `SECURITY_P0_APPLY.sql` im Supabase-SQL-Editor ausführen
(Projekt `nnwyktkqibdjxgimjyuq` → SQL Editor → Inhalt einfügen → Run).

Der Block ist **idempotent**. Die bereits eingespielten Teile 1, 3 und 4 laufen
als No-Op durch; scharf sind **Teil 2** (Befund 3 + 7) und **Teil 3b** (Befund 5).

Eigenschaften:

- **Eine** Transaktion — schlägt ein Schritt fehl, wird alles zurückgerollt.
- **Teil 0** prüft alle Vorbedingungen, **bevor** die erste Änderung passiert.
  Stimmt etwas nicht, bricht der Block mit Klartext ab und die DB bleibt unberührt.
- Kein `DELETE`, `UPDATE`, `TRUNCATE` auf Nutzdaten. Kein `DROP TABLE`,
  `DROP FUNCTION`, `DROP TRIGGER`.
- Der Immutabilitätsschutz von `billing_audit_trail` wird nicht angefasst.
- Am Ende laufen vier Ergebnisabfragen automatisch mit.

---

## 3. Verifikationsplan — nach dem Ausführen

### Schritt 1 — Ergebnisabfragen im SQL-Editor

Die vier Tabellen am Ende des Blocks müssen zeigen:

| Abfrage | Erwartung |
|---|---|
| (1) Funktionsrechte | `anon = false`, `authenticated = false`, `service_role = true`, `befund = ok` für alle **7** Zeilen |
| (2) `_sql_parts` | `rls_aktiv = true`, `anon_select = false`, `befund = ok` |
| (3) Alt-Policies | alle **4** Zeilen `entfernt` |
| (4) Ersatzpfade | alle **3** Zeilen `vorhanden` |

Ein einziges `!!! OFFEN` oder `!!! FEHLT` = nicht fertig, nicht weitermachen.

### Schritt 2 — automatischer Live-Check

```
node scripts/verify-security-p0.mjs
```

Erwartet: **9/9 bestanden**, Exit 0. Das Skript ist nebenwirkungsfrei — die
einzige aktiv gerufene RPC ist `wf_execute_queue_item` mit einer Null-UUID, die
laut Body vor jedem Schreibvorgang mit `RETURN false` zurückkehrt.
`next_billing_number` und `wf_emit_event` werden **nie** aufgerufen (sie
schreiben sofort); ihr Zustand wird über den Katalog geprüft.

### Schritt 3 — Regressionsprobe der Anwendung

Nach dem Apply ändert sich Verhalten, das vorher durch die 42P17-Blockade tot
war. Diese vier Pfade prüfen:

| Pfad | Erwartung |
|---|---|
| Login + Profilanzeige | funktioniert wieder (vorher 42P17) — `profiles_select_own` |
| Engel-Liste als eingeloggter Kunde | sichtbar — `profiles_select_engels` |
| Admin: Buchungsübersicht | vollständig sichtbar — `bookings_admin` |
| Workflow-Verarbeitung `/api/ops/workflow/processing` | 200, läuft über `service_role` |

### Schritt 4 — Gegenprobe: das Leck ist wirklich zu

```
curl -s "https://nnwyktkqibdjxgimjyuq.supabase.co/rest/v1/profiles?select=id,email&limit=5" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON"
```

Erwartet: `[]` — leer. **Nicht** erwartet: Profilzeilen, **nicht** erwartet: `42P17`.

---

## 4. Rollback

Jede Migration hat eine Gegenmigration im Repo:

```
20260817010001_rollback_sql_exec_rpc_absichern.sql
20260817030001_rollback_secdef_rpc_haertung.sql
20260815010001_rollback_profiles_rls_rekursion_und_anon_leck.sql
20260817040001_rollback_bookings_policy_rekursion.sql
20260817020001_rollback_audit_probe_zeile_dokumentieren.sql
```

Alle stellen ausdrücklich eine Sicherheitslücke bzw. die Totalblockade wieder
her und sagen das im Kopf. Es gibt keinen fachlichen Grund, sie auszuführen.

---

## 5. Offen nach diesem Hotfix

**Befund 6 — 74 Policies auf 70 Tabellen mit `profiles`-Subquery.** Jede ist
eine schlafende Rekursionsquelle: sie zündet, sobald eine `profiles`-Policy die
betroffene Tabelle abfragt. Aktuell zündet nur `bookings`. Das systematisch auf
`is_admin()` / `is_org_member()` / `has_org_role()` umzustellen ist eine eigene
Änderung mit eigener Testmatrix und gehört nicht in einen P0-Hotfix.

**Regel für neue Policies:** nie `SELECT … FROM profiles` in einer Policy.

**Befund zur Ursache:** solange die Supabase-Default-Privileges im Schema
`public` EXECUTE an `anon`/`authenticated` erteilen, ist **jede neue Funktion**
standardmäßig öffentlich. Eine `ALTER DEFAULT PRIVILEGES`-Umstellung wäre der
strukturelle Fix — Blast-Radius zu groß für diesen Hotfix, aber der richtige
nächste Schritt.
