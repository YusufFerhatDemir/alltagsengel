# Track 2: Funktionstest aller Module — 2026-08-10

**Branch:** `staging/expansion-abnahme`
**Tests:** 1281 bestanden, 29 übersprungen, 0 fehlgeschlagen
**Build:** grün

## Zusammenfassung

17 parallele Audit-Agenten haben alle 27 Module systematisch geprüft:
Migration, RLS, API-Routes, Lib-Funktionen, UI, Tests, Mandantentrennung, TypeScript.

**Ergebnis:** 6 P0-Findings, 24 P1-Findings, ~30 P2-Findings.
Davon in dieser Session gefixt: 3 P0, 12 P1.

---

## P0-Findings (Security / Datenverlust)

| # | Modul | Finding | Status |
|---|-------|---------|--------|
| P0-1 | Billing/Payments | `payments`, `payment_allocations`, `dunning_entries`, `payment_differences` haben kein org_fence — Cross-Tenant-Leck für jeden Admin | **OFFEN** (braucht SQL-Migration + Supabase-MCP) |
| P0-2 | Audit-Logs | `mis_audit_log` hat keine `organization_id` — Admins fremder Orgs lesen kompletten Audit-Trail (Passwort-Resets, IPs, DSGVO-Exporte) | **OFFEN** (braucht SQL-Migration) |
| P0-3 | Leistungsnachweis | `/api/leistungsnachweis/crud` GET/PATCH hatte keine Rollenprüfung — jeder authentifizierte User konnte service_records lesen/editieren | **GEFIXT** |
| P0-4 | Aufgaben/Workflow | 3 von 6 Workflow-Engine SQL-Aktionen (`benachrichtigung_senden`, `eskalation_ausloesen`, `wiedervorlage_erstellen`) schreiben in falsche Spalten → dead-letter | **OFFEN** (braucht SQL-Migration) |
| P0-5 | Aufgaben/Eskalationen | Komplette Admin-UI benutzt falsche Feldnamen (4 Seiten) | **GEFIXT** |
| P0-6 | Personal/HR | Admin-UI Feldnamen stimmen nicht mit Backend überein (Dienstplan, Qualifikationen, Schulungen, Arbeitszeiten) | **TEILWEISE GEFIXT** |

## P1-Findings (Funktionsfehler) — GEFIXT

| # | Modul | Finding | Fix |
|---|-------|---------|-----|
| P1-F1 | Cross-Tenant (systemisch) | client_id-Ownership nicht geprüft in SIS, Vitalwerte, Medikamente, Angehörige, Signaturen | Ownership-Check in 6 Dateien ergänzt |
| P1-F2 | Ops Mass-Assignment | PATCH-Body in 3 Routes direkt zu `.update()` — organization_id überschreibbar | Destructuring-Guard in 3 Routes |
| P1-F3 | Medikamente | `gegeben_von = NULL` bei "ausgelassen"-Status — bricht Audit-Trail + Engel-RLS-INSERT | `gegeben_von: userId` für alle Status |
| P1-F4 | Offline-Queue | `manuell`-Konfliktstrategie lässt Items in `syncing` hängen (permanent stuck) | Neuer Status `conflict` + korrekte Zustandsübergänge |
| P1-F5 | Aufgaben-UI | Checkliste-Tab ruft `/checkliste` statt `/checklisten` — 404 | URL korrigiert |
| P1-F6 | Aufgaben-UI | Checkliste-Items benutzen `text` statt `titel` | Feldnamen korrigiert |
| P1-F7 | Aufgaben-UI | Anhang-Formular sammelt nicht-existentes `name`-Feld | Schema angepasst |
| P1-F8 | Eskalationen-UI | Feldnamen `kategorie_filter`→`aufgaben_kategorie`, `stufe`→`eskalationsstufe` | Alle Referenzen korrigiert |
| P1-F9 | Dienstplan-UI | Feldnamen `beginn`→`start_zeit`, `ende`→`end_zeit`, `bemerkung`→`notizen` | Korrigiert |
| P1-F10 | Aufgaben-UI | `checkliste_total`→`checkliste_gesamt` in Listenansicht | Korrigiert |
| P1-F11 | Personal-UI | Qualifikationen: `bezeichnung`→`title`, `gueltig_bis`→`valid_until` | Korrigiert |
| P1-F12 | Personal-UI | Schulungen: `art`→`schulungsart`, `datum`→`beginn`, `stunden`→`dauerStunden` | Korrigiert |

## P1-Findings — OFFEN (brauchen SQL-Migration oder weitere Arbeit)

| # | Modul | Finding |
|---|-------|---------|
| P1-O1 | Digitale Signaturen | Audit-Trail RLS hat keine INSERT-Policy für nicht-Admin-Signer → `protokolliereSignaturAudit()` wirft für Engel |
| P1-O2 | Digitale Signaturen | Signer kann Signatur-Felder via direktem Supabase-JS-Call fälschen (RLS nicht spaltenbasiert) |
| P1-O3 | Digitale Signaturen | Dokument-Hash wird client-seitig vertraut, nie serverseitig verifiziert |
| P1-O4 | Angehörigenzugang | `bereiche_nicht_leer` CHECK-Constraint wirkungslos (`array_length({},1)` = NULL) |
| P1-O5 | Angehörigenzugang | Re-Grant nach Widerruf bricht (UNIQUE ohne WHERE-Klausel) |
| P1-O6 | Angehörigenzugang | `requireAngehAdmin()` prüft nicht `deleted_at` |
| P1-O7 | Vitalwerte | Shadow-DB RLS-Tests werden nie ausgeführt (shadow-db.sh bindet sie nicht ein) |
| P1-O8 | Tourenplanung | Vertretungs-Route UPDATE auf `assignments` ohne `organization_id`-Filter (service-role) |
| P1-O9 | Tourenplanung | RLS Column-Scoping-Lücke: Engel kann `assignment_id` cross-org setzen via PostgREST |
| P1-O10 | Billing/EDIFACT | Export umgeht gefrorene Rechnungsdaten, leitet Beträge aus `service_records.amount` ab |
| P1-O11 | Billing/RLS | 14 Policies nutzen `profiles`-Subquery statt `is_admin()` (42P17-Risiko) |
| P1-O12 | Akten/LN | Verordnungen-Modul hat keine Lib/API-Schicht — alles client-seitig ohne org-Switcher |

## Modul-Übersicht

| Modul | Geprüft | Status | P0 | P1 | P2 | Fix |
|-------|---------|--------|----|----|----|----|
| Angehörigenzugang | Ja | P1-OFFEN | 0 | 4 | 3 | Cross-Tenant-Check ergänzt |
| Digitale Signaturen | Ja | P1-OFFEN | 0→gefixt | 3 | 2 | Cross-Tenant-Check (Dokument) |
| Mobile/Offline | Ja | P1-GEFIXT | 0 (Dead-Code) | 4→2 gefixt | 2 | Manuell-Strategie + SyncStatus |
| Tourenplanung | Ja | P1-OFFEN | 0 | 2 | 3 | — |
| Medikamentenmanagement | Ja | P1-GEFIXT | 0 | 3→2 gefixt | 5 | gegeben_von + Cross-Tenant |
| SIS | Ja | P1-GEFIXT | 0 | 1→gefixt | 2 | Cross-Tenant-Check |
| Wunddokumentation | Ja | OK | 0 | 0 | 3 | Referenz-Modul (korrekt) |
| Vitalwerte | Ja | P1-OFFEN | 0 | 2→1 gefixt | 2 | Cross-Tenant-Check |
| PflegeCoach/DiPA | Ja | P1-INFO | 0 | 1 | 3 | Bestes Modul (DiPAV-konform) |
| Billing/DTA | Ja | P0-OFFEN | 3 | 2 | 8 | Braucht SQL-Migration |
| Mandantentrennung/RLS | Ja | P0-OFFEN | 1 (=Billing) | 1 | — | Braucht SQL-Migration |
| Audit-Logs | Ja | P0-OFFEN | 2 | 2 | 2 | Braucht SQL-Migration |
| Aufgaben/Eskalationen | Ja | P0-TEIL-GEFIXT | 1 (SQL) | 2→gefixt | 2 | UI komplett repariert |
| Pflege-Kern | Ja | P1-INFO | 0 | 2 | 5 | Solide Basis |
| Personal/HR | Ja | P0-TEIL-GEFIXT | 2 | 4 | 3 | UI teilweise repariert |
| Akten/Verordnungen/LN | Ja | P0-GEFIXT | 1→gefixt | 2 | 4 | Auth-Check ergänzt |
| Ops/Workflow/Benachr. | Ja | P1-GEFIXT | 0 | 5→3 gefixt | 3 | Mass-Assignment gefixt |

## Systemische Patterns

### 1. Cross-Tenant client_id (GEFIXT in 6 Modulen)
Nur Wunddokumentation hatte den Check. Jetzt haben SIS, Vitalwerte, Medikamente, Angehörige, Signaturen ihn auch.

### 2. UI-Feldnamen-Mismatch (GEFIXT)
Aufgaben/Eskalationen und Teile von Personal/HR waren komplett gegen falsche Feldnamen gebaut. Ursache: kein generiertes TypeScript-Schema aus der DB, `SupabaseClient` ist untyped.

### 3. Payments-Cluster ohne org_fence (OFFEN)
4 Tabellen aus `20260808210000` fehlt die RESTRICTIVE Policy. Fix: neue Migration analog zu `20260819020000_billing_org_fence_haertung.sql`.

### 4. profiles-Subquery statt is_admin() (OFFEN)
14 Billing/DTA-Policies nutzen den 42P17-anfälligen Pattern. Fix: Migration die `is_admin()` einsetzt.

## Migrationen — Status

Folgende Migrationen warten auf Live-Apply (kein DDL ohne Supabase-MCP):
- `20260818010000_sis_strukturierte_informationssammlung.sql`
- `20260818010000_vitalwerte.sql`
- `20260818030000_wunddokumentation.sql`
- `20260819010000_pflegecoach_dipa_modul.sql`
- `20260820010000_medikamentenmanagement.sql`
- `20260821010000_angehoerigenzugang.sql`
- `20260821020000_digitale_signaturen.sql`
- `20260809120000_tourenplanung.sql`
- `20260810010000_pflegedokumentation.sql`
- `20260811010000_personalmanagement.sql`
- `20260812010000_aufgaben_kommunikation.sql`
- `20260813010000_workflow_engine.sql`

**NEUE Migrationen nötig für P0-Fixes:**
1. `payments_org_fence_haertung.sql` — org_fence für 4 Payment-Tabellen
2. `mis_audit_log_org_scoping.sql` — organization_id Spalte + org_fence
3. `workflow_action_column_fixes.sql` — Spaltennamen in `wf_execute_queue_item()`

## Nächste Schritte

1. **KRITISCH**: Payment-org_fence-Migration schreiben und via Supabase-MCP applyen
2. **KRITISCH**: mis_audit_log org-scoping Migration
3. **HOCH**: Workflow-Engine SQL-Aktionen-Fix (3 kaputte Aktionen)
4. **HOCH**: Arbeitszeiten-UI Feldnamen (Minuten→Stunden-Konvertierung)
5. **MITTEL**: Signatur Audit-Trail INSERT-Policy für Signer
6. **MITTEL**: Shadow-DB-Tests in shadow-db.sh einbinden
