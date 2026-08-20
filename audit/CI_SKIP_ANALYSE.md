# CI Skip-Analyse — 38 übersprungene Tests

> Stand: 2026-08-20 · CI Run nach Commit `f15b2d5`
> Alle 38 Skips sind **absichtlich** und folgen dem `describe.skipIf(!hasShadowDb)`-Pattern.

## Zusammenfassung

| Datei | Skips | Grund | CI-aktivierbar? |
|-------|-------|-------|-----------------|
| `__tests__/shadow-db/dsgvo-account-deletion.test.ts` | 11 | Shadow-DB fehlt | Ja, mit Secrets |
| `__tests__/shadow-db/tenant-isolation.test.ts` | 5 | Shadow-DB fehlt | Ja, mit Secrets |
| `__tests__/billing/fail-closed-invoice.test.ts` | 9 | Shadow-DB fehlt | Ja, mit Secrets |
| `__tests__/security/bookings-policy-consolidation.test.ts` | 13 | Shadow-DB fehlt | Ja, mit Secrets |
| **Gesamt** | **38** | | |

## Voraussetzung für alle 38 Tests

Alle Tests benötigen eine **Shadow-Supabase-Instanz** mit echten RLS-Policies und Seed-Daten.
Geprüfte Umgebungsvariablen:

| Variable | Geprüft von |
|----------|-------------|
| `SHADOW_SUPABASE_URL` | alle 4 Dateien |
| `SHADOW_SUPABASE_ANON_KEY` | 3 Dateien (nicht billing) |
| `SHADOW_SUPABASE_SERVICE_ROLE_KEY` | alle 4 Dateien |

Die Billing-Tests brauchen nur `URL` + `SERVICE_ROLE_KEY`, weil sie ausschließlich
service_role-RPCs testen (keine Client-Auth).

## Detailtabelle

### 1. `__tests__/shadow-db/dsgvo-account-deletion.test.ts` (11 Tests)

| # | Testname | Was wird geprüft | Absichtlich? | CI-aktivierbar? |
|---|----------|------------------|--------------|-----------------|
| 1 | DELETE ohne Session → 401 | Unauthentifizierter Löschversuch | Ja | Ja, mit Shadow-DB |
| 2 | DELETE mit falschem Passwort → 401, deleted_at bleibt NULL | Passwort-Validierung | Ja | Ja, mit Shadow-DB |
| 3 | Baseline: anderer angemeldeter Nutzer sieht das Profil (1 Zeile) | Sichtbarkeit vor Löschung | Ja | Ja, mit Shadow-DB |
| 4 | DELETE mit korrektem Passwort → 200, deleted_at gesetzt, Token angelegt, Mail + signOut | Vollständiger Soft-Delete-Flow | Ja | Ja, mit Shadow-DB |
| 5 | Nach Soft-Delete: Profil für andere Nutzer und anon unsichtbar (RLS) | RLS nach Soft-Delete | Ja | Ja, mit Shadow-DB |
| 6 | Zweiter DELETE (idempotent) → 200, Token wird regeneriert | Idempotenz | Ja | Ja, mit Shadow-DB |
| 7 | Undo mit unbekanntem Token → redirect undo_error=token_not_found | Undo-Fehlerfall | Ja | Ja, mit Shadow-DB |
| 8 | Undo mit gültigem Token → redirect reactivated=1, deleted_at NULL | Undo-Erfolg | Ja | Ja, mit Shadow-DB |
| 9 | Nach Undo: Profil wieder für andere Nutzer sichtbar | RLS nach Reactivation | Ja | Ja, mit Shadow-DB |
| 10 | Undo mit verbranntem Token → redirect undo_error=already_used | Token-Einmaligkeit | Ja | Ja, mit Shadow-DB |
| 11 | Engel-Rolle: soft-deleted Engel verschwindet aus profiles_select_engels | View-Filter bei Soft-Delete | Ja | Ja, mit Shadow-DB |

### 2. `__tests__/shadow-db/tenant-isolation.test.ts` (5 Tests)

| # | Testname | Was wird geprüft | Absichtlich? | CI-aktivierbar? |
|---|----------|------------------|--------------|-----------------|
| 1 | Org-A-User kann Org-B-Klienten NICHT lesen (SELECT) | RLS Cross-Tenant-Schutz | Ja | Ja, mit Shadow-DB |
| 2 | Org-A-User kann KEINE Zeile in Org B einfügen (INSERT) | RLS Insert-Schutz | Ja | Ja, mit Shadow-DB |
| 3 | Org-A-User kann Org-B-Klienten NICHT verändern (UPDATE) oder löschen (DELETE) | RLS Update/Delete-Schutz | Ja | Ja, mit Shadow-DB |
| 4 | service_role liest mandantenübergreifend (Admin-Panel bleibt funktionsfähig) | Admin-Bypass verifizieren | Ja | Ja, mit Shadow-DB |
| 5 | übersprungen — SHADOW_SUPABASE_URL/ANON_KEY/SERVICE_ROLE_KEY nicht gesetzt | Fallback-Platzhalter (it.skip) | Ja | Entfällt bei aktiver DB |

### 3. `__tests__/billing/fail-closed-invoice.test.ts` (9 Tests)

| # | Testname | Was wird geprüft | Absichtlich? | CI-aktivierbar? |
|---|----------|------------------|--------------|-----------------|
| 1 | initialisiert den Supabase-Client | Client-Setup | Ja | Ja, mit Shadow-DB |
| 2 | VERIFIED Kassentarif → Rechnung wird erstellt | Happy-Path Rechnungserstellung | Ja | Ja, mit Shadow-DB |
| 3 | UNVERIFIED Kassentarif → MISSING_VALID_TARIFF | Fail-Closed bei unverified | Ja | Ja, mit Shadow-DB |
| 4 | BLOCKED Kassentarif → MISSING_VALID_TARIFF | Fail-Closed bei blocked | Ja | Ja, mit Shadow-DB |
| 5 | deaktivierter Tarif (ist_aktiv=false) → MISSING_VALID_TARIFF trotz verified | Deaktivierungslogik | Ja | Ja, mit Shadow-DB |
| 6 | fremde Organisation → Klient-Zuordnungsfehler | Mandantentrennung | Ja | Ja, mit Shadow-DB |
| 7 | Privattarif VERIFIED → Rechnung wird erstellt | Privatpreise Happy-Path | Ja | Ja, mit Shadow-DB |
| 8 | Privattarif BLOCKED → MISSING_VALID_TARIFF | Privatpreise blocked | Ja | Ja, mit Shadow-DB |
| 9 | API-Manipulation: tarif_status=verified im Body → landet als unverified | Anti-Manipulation-Schutz | Ja | Ja, mit Shadow-DB |

### 4. `__tests__/security/bookings-policy-consolidation.test.ts` (13 Tests)

| # | Testname | Was wird geprüft | Absichtlich? | CI-aktivierbar? |
|---|----------|------------------|--------------|-----------------|
| 1 | Customer sieht seine eigene Buchung (aktive Profile) | RLS Select-Policy | Ja | Ja, mit Shadow-DB |
| 2 | Angel sieht seine eigene Buchung (aktive Profile) | RLS Select-Policy | Ja | Ja, mit Shadow-DB |
| 3 | User C sieht KEINE fremden Buchungen | Cross-User-Schutz | Ja | Ja, mit Shadow-DB |
| 4 | Soft-gelöschter Customer: Angel sieht Buchung NICHT mehr | Soft-Delete-RLS | Ja | Ja, mit Shadow-DB |
| 5 | Soft-gelöschter Angel: Customer sieht Buchung NICHT mehr | Soft-Delete-RLS | Ja | Ja, mit Shadow-DB |
| 6 | Soft-gelöschter Angel sieht eigene Buchungen NICHT mehr | Selbst-Ausschluss | Ja | Ja, mit Shadow-DB |
| 7 | Admin sieht ALLE Buchungen (auch mit soft-deleted Partnern) | Admin-Policy | Ja | Ja, mit Shadow-DB |
| 8 | Soft-gelöschter Admin sieht NICHTS | Admin-Soft-Delete | Ja | Ja, mit Shadow-DB |
| 9 | INSERT: Customer kann Buchung erstellen | Insert-Policy | Ja | Ja, mit Shadow-DB |
| 10 | UPDATE: Customer kann eigene Buchung aktualisieren | Update-Policy | Ja | Ja, mit Shadow-DB |
| 11 | DELETE: Regulärer User kann Buchung NICHT löschen | Kein DELETE-Policy | Ja | Ja, mit Shadow-DB |
| 12 | KEIN 42P17-Fehler bei SELECT auf bookings | Rekursions-Check | Ja | Ja, mit Shadow-DB |
| 13 | KEIN 42P17-Fehler bei SELECT auf profiles | Rekursions-Check | Ja | Ja, mit Shadow-DB |

## Bewertung: Mock/Test-DB als Alternative?

### Option A: Supabase Shadow-Branch als CI-Geheimnis

Die einfachste Lösung: eine dedizierte Supabase-Instanz (oder Branch) mit Seed-Daten,
deren Credentials als GitHub Repository Secrets hinterlegt werden
(`SHADOW_SUPABASE_URL`, `SHADOW_SUPABASE_ANON_KEY`, `SHADOW_SUPABASE_SERVICE_ROLE_KEY`).

**Vorteile:** Echte RLS-Policies werden getestet, kein Mock-Risiko.
**Nachteile:** Kosten (zweite Supabase-Instanz), Seed-Pflege, Netzwerkabhängigkeit in CI.

### Option B: Lokale PostgreSQL + Supabase-Auth-Shim

Docker-Container mit `supabase/postgres` + pgTAP für RLS-Tests.
Kein externer Netzwerkzugriff nötig.

**Vorteile:** Kostenlos, deterministisch, schnell.
**Nachteile:** Erheblicher Einrichtungsaufwand, Auth-Shim muss Supabase-JWT simulieren.

### Option C: Mocking (NICHT empfohlen)

Supabase-Client mocken und RLS-Verhalten simulieren.

**Vorteile:** Kein externer Dienst.
**Nachteile:** **Vollständig wertlos** — die Tests existieren *genau deshalb*, weil
Mock-basierte Tests RLS-Lücken nicht finden. Ein Mock-RLS-Test, der grün ist,
beweist nur, dass der Mock richtig programmiert ist, nicht dass die Datenbank
sicher ist. Das war der Anlass für die Shadow-DB-Architektur.

### Empfehlung

**Option A** (Shadow-Branch) ist der pragmatische Weg. Supabase Branching ist im
Pro-Plan enthalten. Sobald die drei Secrets als GitHub Repository Secrets gesetzt
sind, laufen alle 38 Tests sofort — kein Code-Change nötig.

## Fazit

- **0 unbegründete Skips** — alle 38 sind absichtlich und korrekt begründet
- **0 Tests, die durch Mocking aktiviert werden könnten** (Mocking würde den Zweck untergraben)
- **38 Tests aktivierbar** durch Bereitstellung einer Shadow-DB + 3 GitHub Secrets
- **Kein Code-Change nötig** — das `skipIf`-Pattern aktiviert sich automatisch
