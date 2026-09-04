# Supabase Security Audit — 2026-09-04

## Geprüfte Projekte

| Kürzel | Projekt | Project-ID |
|--------|---------|------------|
| AE | Alltagsengel | nnwyktkqibdjxgimjyuq |
| EFY | efy care | nsfbwhpjesmathsrqkfi |
| CM | ChairMatch | pwdbjqfpgumyfktbfswg |

## Zusammenfassung

| Kategorie | Findings | Behoben |
|-----------|----------|---------|
| CRITICAL | 1 | 1 |
| HIGH | 4 | 4 |
| MEDIUM | 3 | 0 (dokumentiert) |
| LOW | 2 | 0 (akzeptables Risiko) |
| FALSE POSITIVE | 2 | — |

---

## 1. FORCE ROW LEVEL SECURITY

**Ausgangslage:** FORCE RLS war auf ALLEN Tabellen in ALLEN 3 Projekten deaktiviert (= `false`). Das bedeutet, dass Table Owner (z.B. `postgres`) RLS-Policies umgehen konnten.

**Fix:** Migration `force_rls_all_public_tables` auf alle 3 Projekte angewendet.

**Verifizierung nach Fix:**

| Projekt | Tabellen gesamt | FORCE RLS = true | FORCE RLS = false |
|---------|-----------------|-------------------|-------------------|
| AE | 326 | 326 | 0 |
| EFY | 48 | 48 | 0 |
| CM | 80 | 79 | 1 (spatial_ref_sys) |

**Klassifizierung:** HIGH → BEHOBEN
**Hinweis:** `spatial_ref_sys` in CM ist eine PostGIS-Systemtabelle und wurde bewusst ausgenommen.

---

## 2. Anon-Rolle: Schreibzugriff auf Tabellen

### 2a. efy care — anon hat FULL CRUD auf ALLE 48 Tabellen

**Klassifizierung:** CRITICAL

**Beschreibung:** Die `anon`-Rolle (= nicht authentifizierte API-Anfragen) hatte INSERT, UPDATE, DELETE und TRUNCATE auf sämtliche 48 public-Tabellen, darunter `clients`, `caregivers`, `invoices`, `organizations`, `profiles` etc. Ein Angreifer hätte ohne Authentifizierung Daten manipulieren oder löschen können.

**Ursache:** Vermutlich wurde bei der Ersteinrichtung `GRANT ALL ON ALL TABLES IN SCHEMA public TO anon` ausgeführt.

**Fix:** Migration `revoke_anon_write_all_tables` — alle Schreibrechte (INSERT/UPDATE/DELETE/TRUNCATE) von `anon` auf allen public-Tabellen entzogen.

**Verifizierung:** 0 anon-Schreibrechte nach Fix.

**Status:** BEHOBEN

### 2b. AE — anon Schreibzugriff auf ops_posteingang, state_settings_public

**Klassifizierung:** HIGH

**Beschreibung:** 2 Tabellen hatten unnötige Schreibrechte für `anon`.

**Fix:** Migration `revoke_anon_write_ops_posteingang_state_settings`.

**Status:** BEHOBEN

### 2c. CM — anon Schreibzugriff auf audit_log

**Klassifizierung:** HIGH

**Beschreibung:** `audit_log` hatte FULL CRUD für `anon`. Audit-Logs sollten nie von unauthentifizierten Nutzern beschreibbar sein.

**Fix:** Migration `revoke_anon_write_audit_log` — zusätzlich auch Schreibrechte auf `geography_columns` und `geometry_columns` (PostGIS-Views) entzogen.

**Status:** BEHOBEN

### 2d. CM — anon INSERT auf onboarding_drafts, submission_tickets, visit_logs

**Klassifizierung:** LOW (akzeptables Risiko)

**Beschreibung:** Diese 3 Tabellen erlauben INSERT für `anon`. Dies ist vermutlich beabsichtigt für öffentliche Onboarding-/Buchungsflows (z.B. Salon-Registrierung, Ticket-Einreichung, Besuchsprotokoll).

**Empfehlung:** Rate-Limiting auf API-Ebene sicherstellen. RLS-Policies prüfen, dass nur die gewünschten Spalten beschrieben werden können.

**Status:** AKZEPTIERT (kein Fix nötig)

---

## 3. TRUNCATE-Rechte für authenticated

**Klassifizierung:** HIGH

**Beschreibung:** Die `authenticated`-Rolle hatte TRUNCATE-Rechte auf allen Tabellen in allen 3 Projekten. TRUNCATE löscht alle Zeilen einer Tabelle unwiderruflich und wird von RLS-Policies nicht geschützt.

**Fix:** Migration `revoke_truncate_from_authenticated` auf alle 3 Projekte angewendet. Zusätzlich auf AE auch Views/Materialized Views bereinigt.

**Status:** BEHOBEN

---

## 4. SECURITY DEFINER Functions

**Beschreibung:** SECURITY DEFINER Functions laufen mit den Rechten des Erstellers (typischerweise `postgres`), nicht des aufrufenden Nutzers. Sie umgehen dadurch RLS.

| Projekt | Anzahl SECURITY DEFINER | Bewertung |
|---------|-------------------------|-----------|
| AE | ~110 | Trigger-Functions, RLS-Hilfsfunctions, Audit-Trigger — alle zweckgebunden |
| EFY | ~100 | Gleiche Kategorie — Mandantenzaun, Audit-Trigger, Org-Checks |
| CM | 12 | 3× PostGIS `st_estimatedextent` + 9 App-Functions (handle_new_user, audit, admin-checks) |

**Klassifizierung:** MEDIUM (dokumentiert)

**Bewertung:** Alle gefundenen SECURITY DEFINER Functions dienen internen Zwecken (Trigger, RLS-Hilfsfunktionen, Audit-Logging, Mandantentrennung). Keine der Functions exponiert direkt sensible Daten oder umgeht Berechtigungsprüfungen auf unsichere Weise.

**Empfehlung:** Bei neuen Functions immer prüfen, ob SECURITY INVOKER ausreichend ist. Regelmäßig auditieren.

**Status:** AKZEPTIERT

---

## 5. Functions mit anon-EXECUTE

**Beschreibung:** Viele public-Functions sind für `anon` aufrufbar.

| Projekt | Anon-callable Functions | Bewertung |
|---------|------------------------|-----------|
| AE | ~50 App-Functions + btree_gist Extension | Überwiegend Trigger-Functions und prevent_*-Guards |
| EFY | ~50 | Trigger-Functions, Mandantenzaun, Validierungen |
| CM | ~50 (fast nur PostGIS) | PostGIS-Systemfunctions — FALSE POSITIVE |

**Klassifizierung:** MEDIUM

**Bewertung:** Die anon-callable Functions in AE und EFY sind überwiegend Trigger-Functions (`prevent_*`, `set_updated_at`, `audit_*`), die nur intern aufgerufen werden. Sie stellen kein direktes Sicherheitsrisiko dar, da sie keine Daten zurückgeben und keine Schreiboperationen ermöglichen, die über RLS hinausgehen.

**Empfehlung:** Für Functions, die nicht von anon gebraucht werden, gezielt `REVOKE EXECUTE ON FUNCTION ... FROM anon` setzen. Dies ist ein Hardening-Schritt, kein akutes Risiko.

**Status:** DOKUMENTIERT

---

## 6. Public Schema Default Privileges

**Klassifizierung:** MEDIUM

**Beschreibung:** Supabase gewährt standardmäßig `SELECT`, `REFERENCES`, `TRIGGER` auf neue public-Tabellen an `anon`. Dies ist das erwartete Verhalten, da RLS-Policies den tatsächlichen Zugriff steuern.

**Empfehlung:** Bei sensiblen Tabellen (z.B. interne Audit-Logs) explizit `REVOKE SELECT FROM anon` setzen, falls kein anonymer Lesezugriff vorgesehen ist.

**Status:** DOKUMENTIERT

---

## 7. FALSE POSITIVES

| Finding | Projekt | Begründung |
|---------|---------|------------|
| `spatial_ref_sys` ohne FORCE RLS | CM | PostGIS-Systemtabelle, enthält nur EPSG-Koordinatensystem-Definitionen |
| PostGIS-Functions callable by anon | CM | Extension-Functions (`st_*`, `geometry_*`), werden für Geo-Queries benötigt |

---

## Angewendete Migrationen

| # | Projekt | Migration | Beschreibung |
|---|---------|-----------|--------------|
| 1 | AE | `force_rls_all_public_tables` | FORCE RLS auf allen 326 Tabellen |
| 2 | EFY | `force_rls_all_public_tables` | FORCE RLS auf allen 48 Tabellen |
| 3 | CM | `force_rls_all_public_tables` | FORCE RLS auf 79 Tabellen (ohne spatial_ref_sys) |
| 4 | EFY | `revoke_anon_write_all_tables` | CRITICAL: anon Schreibrechte auf allen 48 Tabellen entzogen |
| 5 | AE | `revoke_anon_write_ops_posteingang_state_settings` | anon Schreibrechte auf 2 Tabellen entzogen |
| 6 | CM | `revoke_anon_write_audit_log` | anon Schreibrechte auf audit_log + PostGIS-Views entzogen |
| 7 | AE | `revoke_truncate_from_authenticated` | TRUNCATE von authenticated auf allen Tabellen entzogen |
| 8 | EFY | `revoke_truncate_from_authenticated` | TRUNCATE von authenticated auf allen Tabellen entzogen |
| 9 | CM | `revoke_truncate_from_authenticated` | TRUNCATE von authenticated auf allen Tabellen entzogen |
| 10 | AE | `revoke_truncate_from_authenticated_views` | TRUNCATE von authenticated auf Views entzogen |

---

## Offene Empfehlungen (nicht-akut)

1. **Function-Hardening:** anon-EXECUTE gezielt für nicht benötigte Functions entziehen (AE, EFY)
2. **Rate-Limiting:** Für CM-Tabellen mit anon-INSERT (onboarding_drafts, submission_tickets, visit_logs) sicherstellen, dass API-seitiges Rate-Limiting aktiv ist
3. **Regelmäßige Audits:** Diesen Audit vierteljährlich wiederholen
4. **Default Privileges:** `ALTER DEFAULT PRIVILEGES` so setzen, dass neue Tabellen nicht automatisch Schreibrechte für anon bekommen

---

*Audit durchgeführt am 2026-09-04 von Alltagsengel Security Automation*
