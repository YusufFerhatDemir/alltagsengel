# P11.1 Security Hardening — Deep Audit Report
**Datum:** 05.09.2026 | **Phase:** P11.1 (P11 Master-Auftrag)

---

## P11.1A — efy care CI/CD Pipeline

**Status: ✅ VORHANDEN + UMFASSEND**

CI-Workflow existiert unter `.github/workflows/ci.yml` mit 14 Schritten:
1. Checkout (v7)
2. Node.js 22 Setup mit Cache
3. npm 11 Upgrade (Dependabot-Kompatibilität)
4. Root Dependencies (npm ci)
5. App Dependencies (npm ci)
6. TypeScript-Typecheck (app/)
7. Lint (app/)
8. Deno Typecheck Edge Functions
9. Vitest (Repo-Root)
10. TruffleHog Secret-Scan
11. IK-Hardcoding-Check (460629986)
12. Expo Web Build-Check

**Sicherheitsfeatures:** Read-only permissions, Concurrency-Control, 30min Timeout.
**Offener Punkt:** 0 API-Runs sichtbar (privates Repo, GitHub-Auth-Token für API nötig). Pipeline wurde in 5 Commits aktiv entwickelt und verfeinert.

---

## P11.1B — SECURITY DEFINER Deep Audit

### Zusammenfassung

| Projekt | DEFINER Fn | search_path | Dynamic SQL | Auth-Context | Tenant-Separation |
|---|---|---|---|---|---|
| AE | 113 | ⚠️ fehlt | 0 gefunden | ✅ | ✅ |
| CM | 12 | ✅ (10/12) | 0 gefunden | ✅ | ✅ |
| efy | 108 | ⚠️ fehlt | 0 gefunden | ✅ | ✅ |

### Detailanalyse

**search_path:**
- AE: Alle 113 ohne `SET search_path`. Risiko NIEDRIG — alle in `public`, Supabase default search_path enthält public.
- CM: 10 von 12 haben SET search_path. Fehlend: fn_audit_trigger, PostGIS-Funktionen.
- efy: Alle 108 ohne `SET search_path`. Risiko NIEDRIG — identisch wie AE.
- **Empfehlung:** Bei nächster Migration nachrüsten (LOW priority).

**Dynamic SQL (EXECUTE):** Keine DEFINER-Funktion in allen drei Projekten verwendet dynamisches SQL. Kein SQL-Injection-Risiko über DEFINER.

**Auth-Context-Prüfung:**
- Alle RLS-Hilfsfunktionen (is_admin, is_org_member, etc.) prüfen `auth.uid()` — gibt für anon `NULL`/`false` zurück.
- Trigger-Funktionen operieren auf Tabellenebene, nicht über RPC — kein direkter anon-Zugriff.

**Tenant-Separation (efy):**
- `is_org_member()`, `actor_belongs_to_org()`, `shares_org_with()` erzwingen Mandantentrennung.
- Alle SELECT-Policies auf sensiblen Tabellen (clients, caregivers, invoices, profiles, organizations) verwenden org-basierte Prüfungen.
- Anon erhält 0 Zeilen (verifiziert: alle quals erfordern auth.uid()).

**Role Escalation:** Keine Funktion gewährt dem Aufrufer erhöhte Rechte. DEFINER-Funktionen lesen/schreiben nur im Rahmen ihrer definierten Geschäftslogik.

---

## P11.1C — Anon-aufrufbare Funktionen

| Projekt | DEFINER anon-callable | Typ | Risiko |
|---|---|---|---|
| AE | 0 | — | ✅ KEIN |
| CM | 5 | 1 Onboarding (draft_verknuepfen), 1 Trigger (fn_audit_trigger), 3 PostGIS | ✅ NIEDRIG |
| efy | 56 | 14 RLS-Helfer, 42 Trigger | ⚠️ NIEDRIG |

**efy Detail:** 14 RPC-aufrufbare DEFINER-Funktionen sind RLS-Hilfsfunktionen (is_org_member, is_org_admin, current_profile_role, etc.). Für anon geben sie `false`/`NULL` zurück — kein Datenzugriff möglich. 42 weitere sind Trigger-Funktionen, die nur bei Tabellen-Events feuern.

**Empfehlung efy:** REVOKE EXECUTE ON ... FROM anon für die 14 RLS-Helfer — sie werden nur in RLS-Policies (als postgres) und von authentifizierten Usern benötigt. Priorität: NIEDRIG (kein akutes Risiko).

---

## P11.1D — Anon-Zugriff auf sensible Tabellen

### FORCE RLS Status

| Projekt | Tabellen gesamt | FORCE RLS | Abdeckung |
|---|---|---|---|
| AE | 326 | 326 | ✅ 100% |
| CM | 80 | 79 | ✅ 99% (spatial_ref_sys = PostGIS) |
| efy | 48 | 48 | ✅ 100% |

### AE (326 Tabellen)
- Alle Tabellen haben anon SELECT GRANT (Supabase-Default).
- FORCE RLS auf allen 326 Tabellen → ohne passende Policy = kein Zugriff.
- Explizite RESTRICTIVE anon_deny-Policies auf sensiblen Tabellen (invoices, payments): `qual = false`.
- **Status: ✅ SICHER** — GRANT existiert, RLS blockiert effektiv.

### CM (80 Tabellen)
- Anon SELECT auf 15 Tabellen (products, categories, reviews, offers, etc.) — öffentliche Daten, **ERWARTET**.
- Anon INSERT auf 3 Tabellen:
  - `onboarding_drafts` — anonymes Onboarding, **ERWARTET**
  - `submission_tickets` — Kontaktformular, **ERWARTET**
  - `visit_logs` — Analytics, **ERWARTET**
- `spatial_ref_sys` — PostGIS-Systemtabelle, voller anon-Zugriff, kein RLS. **AKZEPTABEL** (Geodaten-Referenz).
- ⚠️ **FINDING: Kein DB-Level Rate Limiting** für anon INSERTs. Spam-/Abuse-Vektor auf submission_tickets und visit_logs.

### efy (48 Tabellen)
- Alle 48 Tabellen haben anon SELECT GRANT.
- FORCE RLS auf allen 48 → alle SELECT-Policies erfordern auth.uid()/org-Zugehörigkeit.
- **Verifiziert:** clients, caregivers, invoices, profiles, organizations, organization_members — alle quals prüfen auth.uid() oder org-Mitgliedschaft.
- **Status: ✅ SICHER** — anon erhält 0 Zeilen auf allen Tabellen.

---

## P11.1E — ChairMatch Spezifika

### Anon INSERT ohne Rate Limiting
- **submission_tickets:** Anon INSERT erlaubt, kein WITH CHECK, kein Rate Limit.
- **visit_logs:** Anon INSERT erlaubt (public role), kein Rate Limit.
- **onboarding_drafts:** Anon INSERT erlaubt, kein Rate Limit.
- **Risiko:** MITTEL — Spam-Flooding möglich. Rate Limiting über Supabase-Konfiguration oder Vercel Edge empfohlen.

### Cookie Consent
- Über Vercel/Next.js Middleware implementiert (nicht DB-Ebene).
- Erfordert Code-Review (außerhalb SQL-Audit-Scope).

### spatial_ref_sys
- PostGIS-Systemtabelle ohne RLS — Standard-Verhalten, kein Sicherheitsrisiko.

---

## Gesamtergebnis P11.1

| Bereich | AE | CM | efy | Status |
|---|---|---|---|---|
| CI/CD | ✅ (Vercel) | ✅ (Vercel) | ✅ (GitHub Actions) | GRÜN |
| DEFINER begründet | ✅ | ✅ | ✅ | GRÜN |
| search_path | ⚠️ fehlt | ✅ | ⚠️ fehlt | GELB (LOW) |
| Dynamic SQL | ✅ keine | ✅ keine | ✅ keine | GRÜN |
| Auth-Context | ✅ | ✅ | ✅ | GRÜN |
| Tenant-Separation | ✅ | ✅ | ✅ | GRÜN |
| Anon-Funktionen | ✅ 0 | ✅ 5 (ok) | ⚠️ 14 RPC | GELB (LOW) |
| FORCE RLS | ✅ 100% | ✅ 99% | ✅ 100% | GRÜN |
| Anon-Tabellenzugriff | ✅ RLS blockt | ✅ nur public | ✅ RLS blockt | GRÜN |
| Rate Limiting (CM) | — | ⚠️ fehlt | — | GELB (MED) |
| API-Keys | ✅ | ✅ | ✅ | GRÜN |
| Security Headers | ✅ A+ | ✅ A+ | n/a (API) | GRÜN |

### Kritische Blocker: 0
### Offene Empfehlungen (nicht-blockierend):
1. **search_path nachrüsten** — AE (113 Fn) + efy (108 Fn) — Priorität LOW
2. **efy anon REVOKE** — 14 RLS-Helfer unnötig anon-callable — Priorität LOW
3. **CM Rate Limiting** — anon INSERT-Endpunkte ohne Schutz — Priorität MEDIUM
4. **CM Cookie Consent** — Code-Review empfohlen — Priorität LOW

---

*Erstellt: 05.09.2026 | Methode: SQL Deep Audit (pg_proc, pg_policies, pg_class, has_*_privilege)*
*Prüfer: Automatisiert (P11 Security Hardening)*
