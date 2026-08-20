# RLS & Mandantentrennungs-Audit — Alltagsengel Production

**Datum:** 2026-08-20  
**Supabase Project:** nnwyktkqibdjxgimjyuq  
**Prüfer:** Automatisierter Security-Audit  
**Scope:** Alle public-Schema Tabellen, RLS Policies, SECURITY DEFINER Funktionen, Anon-Zugriff, Org-Isolation

---

## Executive Summary

**248 Tabellen** im public-Schema geprüft. **Alle haben RLS aktiviert** — keine Tabelle ohne Row-Level-Security. Die Mandantentrennung ist grundsätzlich solide implementiert mit RESTRICTIVE org_fence Policies auf fast allen mandantenfähigen Tabellen. Es gibt jedoch **3 kritische und 5 mittlere Findings**, die behoben werden sollten.

---

## KRITISCHE FINDINGS

### FINDING-01: `current_org_id()` Hardcoded Fallback-UUID (KRITISCH)

**Funktion:**
```sql
SELECT COALESCE(
  NULLIF(auth.jwt() -> 'app_metadata' ->> 'org_id', '')::uuid,
  (SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid() ...),
  (SELECT cg.organization_id FROM caregivers cg WHERE cg.user_id = auth.uid() ...),
  (SELECT cl.organization_id FROM clients cl WHERE cl.user_id = auth.uid() ...),
  '00000000-0000-4000-8000-000460629986'::uuid   -- ← HARDCODED FALLBACK
);
```

**Problem:** Jeder authentifizierte User ohne Org-Zuordnung (z.B. frisch registriert, Org-Mitgliedschaft gelöscht) erhält automatisch Zugriff auf die Fallback-Organisation. Diese enthält **echte Produktionsdaten**: 10 Bookings, 4 Clients, 2 Caregivers, 5 Invoices, 30 Service Records.

**Risiko:** Horizontale Rechteausweitung — ein Nutzer ohne jede Org-Bindung sieht Daten der Fallback-Org, sofern eine PERMISSIVE Policy matcht.

**Empfehlung:** Fallback auf `NULL` ändern. RESTRICTIVE org_fence Policies mit `organization_id = NULL` ergeben `false` → kein Zugriff. Alternativ: Funktion mit `RAISE EXCEPTION` bei fehlender Org-Zuordnung.

---

### FINDING-02: `angels`-Tabelle öffentlich lesbar für anon (KRITISCH)

**Policy:** `"Herkes engelleri okuyabilir"` — `PERMISSIVE SELECT` mit `USING(true)` für Rolle `{public}`

Die Tabelle `angels` hat keine RESTRICTIVE Policy und keine Org-Zuordnung. Die Policy erlaubt **jeder Rolle inkl. anon** das Lesen aller Datensätze. Exponierte Spalten: `id` (UUID, korrelierbar mit `profiles`), `hourly_rate`, `services`, `availability`, `bio`, `qualification`, `is_certified`, `rating`.

**Risiko:** Unauthentifizierte Benutzer können alle Engel-Profile auslesen. Die `id`-Spalte ist ein direkter FK zu `profiles` und ermöglicht Korrelation.

**Empfehlung:** Policy auf `{authenticated}` beschränken oder `anon`-Deny-Policy hinzufügen. Falls bewusst öffentlich (Marktplatz): dokumentieren und sicherstellen, dass keine PII in der Tabelle stehen.

---

### FINDING-03: `anon` hat SELECT-GRANT auf 11 sensible Tabellen (HOCH)

| Tabelle | anon SELECT GRANT | Schutz durch Policy |
|---------|:-:|---|
| profiles | JA | Alle PERMISSIVE Policies prüfen `auth.uid()` → anon bekommt null → **kein Match** |
| clients | JA | org_fence RESTRICTIVE + auth.uid()-Prüfung → **geschützt** |
| bookings | JA | org_fence RESTRICTIVE + auth.uid()-Prüfung → **geschützt** |
| caregivers | JA | org_fence RESTRICTIVE + auth.uid()-Prüfung → **geschützt** |
| care_recipients | JA | org_fence RESTRICTIVE + auth.uid()-Prüfung → **geschützt** |
| documents | JA | org_fence RESTRICTIVE + auth.uid()-Prüfung → **geschützt** |
| invoices | JA | **Explizite anon_deny Policy** `USING(false)` → **sicher** |
| notifications | JA | Alle Policies prüfen `auth.uid()` → **geschützt** |
| organizations | JA | `is_org_member()` prüft `auth.uid()` → **geschützt** |
| payments | JA | org_fence RESTRICTIVE → **geschützt** |
| service_records | JA | org_fence RESTRICTIVE + auth.uid()-Prüfung → **geschützt** |

**Aktueller Schutz:** Die Tabellen sind de facto geschützt, weil alle PERMISSIVE Policies `auth.uid()` erfordern, was für `anon` `NULL` zurückgibt. **Aber: eine einzige neue Policy mit `USING(true)` würde den Schutz sofort aushebeln.**

**Empfehlung:** Explizite `RESTRICTIVE anon_deny`-Policies (wie bei `invoices`) auf alle sensiblen Tabellen setzen: `profiles`, `clients`, `bookings`, `caregivers`, `care_recipients`, `documents`, `notifications`, `payments`, `service_records`. Defence-in-Depth.

---

## MITTLERE FINDINGS

### FINDING-04: 8 Tabellen mit `organization_id` ohne RESTRICTIVE org_fence

| Tabelle | Aktueller Schutz | Risiko |
|---------|-----------------|--------|
| `organization_members` | `has_org_role()` / `is_org_member()` in PERMISSIVE | MEDIUM — korrekt für die Semantik (Cross-Org-Sichtbarkeit eigener Mitgliedschaften), aber kein RESTRICTIVE Fence |
| `organization_subscriptions` | `is_org_member()` in PERMISSIVE (nur SELECT) | MEDIUM — nur Lese-Policy |
| `billing_landesregeln` | `organization_id IS NULL OR organization_id = current_org_id()` in PERMISSIVE | LOW — bewusst global+org-spezifisch |
| `billing_tarif_belege` | `is_admin() AND org_member`-Prüfung in PERMISSIVE | MEDIUM — nur Admin-Zugriff |
| `billing_tariff_audit` | `current_org_id()` in PERMISSIVE (kein RESTRICTIVE) | MEDIUM — Audit-Daten |
| `state_settings` | `is_admin() AND current_org_id()` in PERMISSIVE | MEDIUM — nur Admin |
| `state_settings_audit` | `is_admin() AND current_org_id()` in PERMISSIVE | LOW — nur Lesen |
| `state_waitlist` | `current_org_id()` in PERMISSIVE + anon INSERT | LOW — Warteliste |

**Risiko:** PERMISSIVE Policies sind fragil — eine neue Policy mit breiterem Zugang hebelt die Org-Trennung aus, weil kein RESTRICTIVE Fence existiert.

**Empfehlung:** Mindestens für `organization_members`, `billing_tarif_belege`, `billing_tariff_audit`, und `state_settings` eine RESTRICTIVE org_fence hinzufügen. Bei `organization_members` mit Ausnahme für die eigene User-ID.

---

### FINDING-05: Nullable `organization_id` bei 5 Tabellen

| Tabelle | NOT NULL | Bewertung |
|---------|:--------:|-----------|
| `billing_landesregeln` | NEIN | OK — globale + org-spezifische Regeln by design |
| `billing_tariff_audit` | NEIN | **PROBLEMATISCH** — Audit-Einträge ohne Org-Zuordnung umgehen org_fence |
| `datenannahmestellen` | NEIN | OK — übergreifende Referenzdaten |
| `dta_fehlercode_katalog` | NEIN | OK — globaler Fehlerkatalog |
| `mis_audit_log` | NEIN | **PROBLEMATISCH** — Audit-Einträge ohne Org-Zuordnung |

**Empfehlung:** `billing_tariff_audit.organization_id` und `mis_audit_log.organization_id` auf `NOT NULL` setzen (nach Backfill bestehender NULL-Werte).

---

### FINDING-06: `relforcerowsecurity` nur bei 15 von 248 Tabellen aktiv

Nur die `mis_*`-Tabellen erzwingen RLS auch für den Table-Owner (= `postgres`-Rolle = `service_role`):

`mis_applicants`, `mis_availability`, `mis_complaints`, `mis_contracts`, `mis_crm_activities`, `mis_job_postings`, `mis_privacy_audit_log`, `mis_privacy_consents`, `mis_privacy_records`, `mis_privacy_requests`, `mis_shifts`, `mis_signature_requests`, `mis_training_catalog`, `mis_training_records`, `mis_vehicles`

**Alle anderen 233 Tabellen:** `service_role` bypassed RLS komplett.

**Bewertung:** Standard-Supabase-Pattern. `service_role` wird nur serverseitig verwendet und hat bewusst vollen Zugriff. **Kein akutes Risiko**, solange `service_role`-Key nicht im Client exponiert wird.

---

### FINDING-07: 3 Tabellen mit RLS aber ohne Policies (vollständig gesperrt)

| Tabelle | Bewertung |
|---------|-----------|
| `_sql_parts` | OK — internes Hilfstabelle |
| `api_rate_limits` | Prüfen — möglicherweise bewusst nur via SECURITY DEFINER Funktion zugreifbar |
| `coach_pseudonym_key` | OK — Schlüsselmaterial, korrekt gesperrt |

---

## SECURITY DEFINER Funktionen

**80+ Funktionen** im public-Schema mit `SECURITY DEFINER`. Stichprobenprüfung:

| Eigenschaft | Status |
|-------------|--------|
| `SET search_path TO 'public'` bei allen | **JA** ✅ — kein search_path Injection möglich |
| Berechtigungsprüfung (auth.uid(), is_admin()) | JA bei allen geprüften Funktionen ✅ |
| Sensible Funktionen geschützt | `get_emergency_info_with_pin` — PIN-basiert ✅, `admin_audit_log_purge` — prüft Admin-Rolle ✅ |
| `current_org_id()` | SECURITY DEFINER + STABLE + search_path gesetzt ✅ (aber Fallback-Problem, s. FINDING-01) |
| Hilfsfunktionen (`is_admin`, `is_org_member`, `has_org_role`, etc.) | Alle korrekt mit auth.uid()-Prüfung ✅ |

**Keine ungerechtfertigten SECURITY DEFINER Funktionen gefunden.** Alle dienen entweder der RLS-Evaluierung, Trigger-Logik oder geschützten Businessoperationen.

---

## Gesamtbewertung nach Tabellenkategorie

### Tabellen MIT `organization_id` + RESTRICTIVE org_fence (~190 Tabellen) → OK

Alle verwenden das Pattern: `RESTRICTIVE org_fence ALL: organization_id = current_org_id()`. Mandantentrennung funktioniert korrekt. Stichproben geprüft: `bookings`, `clients`, `caregivers`, `invoices`, `service_records`, `documents`, `payments`, `care_recipients`, `tours`, `assignments` etc.

### Tabellen OHNE `organization_id` (~55 Tabellen) → Differenziert

| Kategorie | Tabellen (Beispiele) | Risiko |
|-----------|---------------------|--------|
| Userbezogen (id/user_id = auth.uid()) | `profiles`, `angels`, `coach_users`, `fcm_tokens`, `push_subscriptions` | OK (außer FINDING-02) |
| Messaging (sender/receiver = auth.uid()) | `messages`, `notifications`, `chat_messages` | OK |
| Lookup/Referenz (öffentlich lesbar) | `bundeslaender`, `plz_bundesland_regeln`, `billing_leistungsarten`, `billing_rechtsgrundlagen` | OK |
| Coach-Modul (user_id-basiert) | `coach_*` Tabellen | OK — eigenes Isolationsmodell |
| Org-Verwaltung | `organizations`, `organization_members` | OK (s. FINDING-04) |

---

## Zusammenfassung der Risiken

| # | Finding | Risiko | Status |
|---|---------|--------|--------|
| 01 | `current_org_id()` Hardcoded Fallback mit echten Daten | **KRITISCH** | Offen |
| 02 | `angels`-Tabelle anon-lesbar (USING true) | **KRITISCH** | Offen |
| 03 | anon SELECT GRANT auf 11 sensible Tabellen ohne anon_deny | **HOCH** | Offen |
| 04 | 8 Tabellen mit org_id ohne RESTRICTIVE org_fence | **MITTEL** | Offen |
| 05 | Nullable organization_id bei billing_tariff_audit, mis_audit_log | **MITTEL** | Offen |
| 06 | relforcerowsecurity nur bei 15/248 Tabellen | **NIEDRIG** | Akzeptabel |
| 07 | 3 Tabellen mit RLS ohne Policies (gesperrt) | **NIEDRIG** | Prüfen |

---

## Empfohlene Maßnahmen (nach Priorität)

1. **SOFORT:** `current_org_id()` — Fallback von Hardcoded-UUID auf `NULL` ändern
2. **SOFORT:** `angels`-Tabelle — RESTRICTIVE anon_deny Policy oder Policy auf `{authenticated}` beschränken
3. **KURZFRISTIG:** Explizite RESTRICTIVE `anon_deny`-Policies auf alle 11 sensiblen Tabellen
4. **KURZFRISTIG:** RESTRICTIVE org_fence für `organization_members`, `billing_tariff_audit`, `state_settings`
5. **MITTELFRISTIG:** `NOT NULL`-Constraint für `billing_tariff_audit.organization_id` und `mis_audit_log.organization_id`
6. **LAUFEND:** Vor jeder neuen Policy prüfen, ob anon-Zugriff ausgeschlossen ist
