# Migration-Drift-Analyse

**Datum:** 2026-08-15  
**Projekt:** Alltagsengel UG (Supabase: `nnwyktkqibdjxgimjyuq`)  
**Lokale Dateien:** 319 | **Live-Migrationen:** 252

---

## Zusammenfassung

| Kategorie | Anzahl | Beschreibung |
|---|---|---|
| MATCHED | 139 | Direkt in Live vorhanden (Name stimmt) |
| ROLLBACK | 123 | Rollback-Dateien, nur fuer Notfall-Revert |
| ALREADY_LIVE_RENAMED | 45 | In Live unter anderem Namen / als Split-Teile |
| ALREADY_LIVE_UNTRACKED | 4 | Manuell applied, nicht in `schema_migrations` |
| OBSOLETE | 2 | Durch spaetere Migrationen ueberfluessig |
| DEV_ONLY | 3 | Feature noch nicht deployed |
| APPLIED_2026-08-15 | 3 | In dieser Analyse live angewendet |
| LIVE_ONLY (Legacy) | 113 | Nur in Live (Pre-Timestamp-Konvention, Splits) |

---

## APPLIED_2026-08-15 (3 Migrationen angewendet)

| Datei | Beschreibung | Risiko |
|---|---|---|
| `20260831010100_d4_cascade_to_restrict.sql` | CASCADE -> RESTRICT auf 17 Pflege-FKs (gesetzliche Aufbewahrungspflicht) | Keins (idempotent, nur RESTRICT statt CASCADE) |
| `20260831020000_d2_vp_budget.sql` | budget_type-Spalte auf client_budgets + Unique-Constraint | Keins (IF NOT EXISTS Guards) |
| `20260921020000_pflege_uebersicht_care_level.sql` | VIEW pflege_uebersicht liefert care_level zusaetzlich | Keins (CREATE OR REPLACE VIEW, Spalte am Ende) |

---

## ALREADY_LIVE_RENAMED (45 Dateien)

Lokale Umbrella-Dateien, die in Live als mehrere Teil-Migrationen existieren:

| Lokale Datei | Live-Gegenstueck(e) |
|---|---|
| `20260808200000_einsatzplanung_leistungsnachweise.sql` | `einsatzplanung_teil1..teil5` (5 Teile) |
| `20260808210000_zahlungen_forderungen_monatsabschluss.sql` | `zahlungen_teil1..teil4` + `monatsabschluss_*` (7 Teile) |
| `20260808220000_kassenabrechnung_dta_dakota.sql` | `dta_teil1..teil5` (5 Teile) |
| `20260809010000_dokumentenmanagement_akten.sql` | `akten_teil1..teil5` (5 Teile) |
| `20260719000200_eylem_audit_complete_features.sql` | `eylem_audit_*` (5 Teile) |
| `20260812030000_replace_profiles_subquery_policies.sql` | `replace_profiles_subquery_policies_batch1..3` |
| ... und 39 weitere (Einzelumbenennungen) | |

Vollstaendige Zuordnung: Lokaler Name wurde bei Live-Apply in beschreibenderen Namen umbenannt oder mit Versionssuffix versehen (z.B. `soft_delete` -> `soft_delete_dsgvo`, `p1_missing_rls` -> `p1_missing_rls_v2`).

---

## ALREADY_LIVE_UNTRACKED (4 Dateien)

Manuell via `execute_sql` oder Dashboard angewendet, aber nicht in `schema_migrations` eingetragen:

| Datei | Beweis |
|---|---|
| `20260412000000_newsletter_subscribers.sql` | Tabelle `newsletter_subscribers` existiert in Live |
| `20260412000100_onboarding_column.sql` | Spalte `profiles.onboarding_completed` existiert |
| `20260816010000_ereignis_typ_konsistenz.sql` | Tabelle `ops_ereignis_regeln` existiert |
| `20260915010000_block_unverified_35eur_tarife.sql` | Kommentar im File: "Applied to Production 14.08.2026 via Supabase MCP execute_sql" |

---

## OBSOLETE (2 Dateien)

| Datei | Grund |
|---|---|
| `20260804210000_grant_is_admin_to_anon.sql` | GRANT is_admin() TO anon -- durch spaetere Security-Hardening (revoke_anon_select_haertung) widerrufen |
| `20260811210000_fix_referral_code_search_path.sql` | search_path-Fix -- bereits in Live korrigiert (generate_referral_code hat keinen search_path-Bug mehr) |

---

## DEV_ONLY (3 Dateien)

Features, die lokal vorbereitet aber noch nicht in Produktion deployed sind:

| Datei | Feature | Status |
|---|---|---|
| `20260813010000_workflow_engine.sql` | Workflow-Engine + Automatisierungen | Tabellen `workflow_templates`/`workflow_instances` existieren nicht in Live |
| `20260814010000_leistungsnachweis_haertung.sql` | Audit-Tabelle + Integritaets-Trigger | `leistungsnachweis_audit_log` existiert nicht in Live |
| `20260831010000_abgeschrieben_credit_cas.sql` | Abgeschrieben-Status + atomare Gutschrift/Korrektur-RPCs | Kein `abgeschrieben` CHECK-Constraint in Live |

---

## ROLLBACK (123 Dateien)

Alle Dateien mit `rollback` im Namen. Werden nur bei Notfall-Revert ausgefuehrt, nie als Forward-Migration. Jede Rollback-Datei ist dem zugehoerigen Forward-Migration-Timestamp zugeordnet (z.B. `20260806100001_rollback_org_fence_mis_ai_conversations.sql` revertiert `20260806100000_org_fence_mis_ai_conversations.sql`).

---

## LIVE_ONLY (113 Legacy-Migrationen)

113 Migrationen existieren in Live ohne direktes lokales File. Diese stammen aus der Zeit vor der Timestamp-Namenskonvention oder sind Split-Teile von lokalen Umbrella-Dateien. Beispiele:

- `create_*` (28 Tabellen-Erstellungen aus der Anfangsphase)
- `add_*` (12 Schema-Erweiterungen)
- `fix_*` (diverse Hotfixes, manuell applied)
- `*_teil1..teil5` (Split-Teile grosser Umbrella-Migrationen)
- `enable_rls_*`, `security_hardening_*` (RLS/Security-Passes)

Diese Migrationen sind alle angewendet und funktional. Die Drift entsteht, weil das lokale Repo spaeter auf eine Timestamp-Konvention umgestellt wurde und grosse Migrationen konsolidiert.

---

## Handlungsbedarf

1. **DEV_ONLY pruefen:** Workflow-Engine, Leistungsnachweis-Haertung und Abgeschrieben-Status bei Bedarf einzeln anwenden.
2. **UNTRACKED registrieren:** Die 4 manuell angewendeten Migrationen sollten nachtraeglich in `schema_migrations` eingetragen werden, um zukuenftige Drift-Analysen zu vereinfachen.
3. **Naming-Konvention:** Zukuenftige Migrationen konsequent mit Timestamp-Prefix UND unveraendertem Namen anwenden (kein Rename bei Apply).
