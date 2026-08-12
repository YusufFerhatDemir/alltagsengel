# Migration-Status — 2026-08-10

Stand: Branch `staging/expansion-abnahme` @ Commit `7126f42`

## Legende

- **LIVE**: Auf Production applied und verifiziert
- **AUSSTEHEND**: Migration existiert im Repo, aber noch nicht auf Production applied
- **BILLING**: Migration gehoert zum Billing-Modul
- **ANDERE**: Migration gehoert zu anderen Modulen

---

## 1. Baseline-Migrationen (LIVE)

Diese Migrationen bilden den Kern und sind auf Production applied:

| Datei | Modul | Status |
|-------|-------|--------|
| 20250101000000_core_tables_baseline.sql | Core | LIVE |
| 20250101000050_missing_production_functions.sql | Core | LIVE |
| 20260101000000_baseline_live_only_tables.sql | Core | LIVE |
| 20260101000100_baseline_live_only_functions.sql | Core | LIVE |
| 20260301 — 20260412 (diverse) | Content/SEO/Pricing/Tracking/Notifications | LIVE |
| 20260414 — 20260419 (diverse) | RLS/Care-Recipients/Soft-Delete | LIVE |
| 20260502_revoke_anon_security_definer_funcs.sql | Security | LIVE |
| 20260525 — 20260704 (diverse) | Analytics/Leads/Service-Records/RLS | LIVE |
| 20260705 (diverse) | CRM/MIS/RLS | LIVE |
| 20260706_monatsabschluss_ki_pruefzentrale.sql | Billing (Monatsabschluss) | LIVE |
| 20260719 (diverse) | Bookings/Eylem/Availability | LIVE |
| 20260730_verordnungen_workflow_complete.sql | Verordnungen | LIVE |
| 20260731 (diverse) | Verordnungen Erweiterung | LIVE |
| 20260801_phase3_multi_mandant_saas.sql | **Multi-Mandant** | **LIVE** (verifiziert 02.08.) |
| 20260802 — 20260804 (diverse) | Constraints/Cleanup/Documents | LIVE (teilweise) |

## 2. Billing-Migrationen — Detailstatus

### Bereits LIVE (applied)

| Datei | Beschreibung | Applied |
|-------|-------------|---------|
| 20260706_monatsabschluss_ki_pruefzentrale.sql | monthly_closings Tabelle, Ampel-Logik | JA |
| 20260806200000_billing_core_corrections.sql | invoice_corrections, invoice_snapshots, invoice_line_snapshots, invoice_disputes | JA |
| 20260806300000_pr35_reconciliation_status_constraint.sql | Status-CHECK auf invoices | JA |
| 20260806400000_add_strittig_status.sql | Status 'strittig' hinzugefuegt | JA |
| 20260806500000_legacy_status_backfill.sql | Legacy-Status-Backfill | JA |
| 20260806600000_audit_security.sql | billing_audit_trail, Trigger | JA |
| 20260806600001_fix_finalized_edit.sql | Festgeschriebene Rechnungen nicht editierbar | JA |
| 20260806700000_overhauled_backfill.sql | Nochmaliger Backfill | JA |

### AUSSTEHEND — Billing

| Datei | Beschreibung | Risiko | Abhaengigkeiten |
|-------|-------------|--------|-----------------|
| 20260807100000_create_invoice_draft_atomic.sql | **Atomare Rechnungserstellung RPC** — SECURITY DEFINER, idempotent, Tarif-Aufloesung in Transaktion | MITTEL | Benoetigt billing_tariffs Tabelle (existiert via 20260807110000) |
| 20260807100001_rollback_... | Rollback: DROP FUNCTION | — | — |
| 20260807110000_tariff_based_invoice_creation.sql | **Tarif-basierte Rechnungserstellung** — Erweitert RPC um billing_tariffs-Aufloesung, neue Spalten auf invoice_items | MITTEL | Benoetigt billing_tariffs Tabelle |
| 20260807110001_rollback_... | Rollback | — | — |
| 20260807120000_tariff_model_hardening.sql | **Katalog-Tabellen** — billing_leistungsarten, billing_rechtsgrundlagen, FK-Constraints, IK-Validierung, Overlap-Exclusion | MITTEL | Benoetigt billing_tariffs Tabelle (fuer FK), kann unabhaengig applied werden |
| 20260807120001_rollback_... | Rollback | — | — |
| 20260807180000_tariff_stammdaten_v2.sql | Tarif-Stammdaten V2 — tarifquellen Katalog, erweiterte Constraints | NIEDRIG | Nach 20260807120000 |
| 20260807180001_rollback_... | Rollback | — | — |
| 20260808120003_rollback_invoice_bundesland_klient.sql | Rollback fuer invoice_bundesland_klient | — | — |
| **20260819020000_billing_org_fence_haertung.sql** | **Org-Fence RESTRICTIVE Policies** auf invoices, invoice_items, invoice_disputes + anon-Deny | NIEDRIG (idempotent, keine Daten veraendert) | Tabellen muessen existieren |
| 20260819020001_rollback_... | Rollback: DROP POLICY | — | — |

### Empfohlene Apply-Reihenfolge (Billing)

1. `20260807100000` — Atomare RPC (Basis)
2. `20260807110000` — Tarif-basierte Erweiterung
3. `20260807120000` — Kataloge + Constraints
4. `20260807180000` — Stammdaten V2
5. `20260819020000` — Org-Fence Haertung (**NOCH NICHT — erst nach Gesamt-Review**)

## 3. Expansion-Migrationen (AUSSTEHEND)

| Datei | Beschreibung | Risiko |
|-------|-------------|--------|
| 20260808100000_expansion_deutschland.sql | state_settings, bundesland-Felder, Laender-Seed | NIEDRIG |
| 20260808100001_rollback_... | Rollback | — |
| 20260808110000_tarifschichten_bundesland.sql | Bundesland-Schichten fuer Tarife | NIEDRIG |
| 20260808110001_rollback_... | Rollback | — |
| 20260808120000_expansion_review_fixes.sql | Review-Fixes | NIEDRIG |
| 20260808120001_plz_bundesland_seed.sql | PLZ→Bundesland Zuordnung | NIEDRIG |
| 20260808120002_invoice_bundesland_klient.sql | Bundesland-Feld auf Invoices | NIEDRIG |
| 20260808130000_expansion_phase2.sql | Phase 2 Expansion | NIEDRIG |
| 20260808130001_rollback_... | Rollback | — |
| 20260808140000 — 20260808220001 | Katalog-RLS, Views, AGB, Indizes, Policies, Einsatzplanung, Zahlungen, Kassenabrechnung DTA | NIEDRIG-MITTEL |

## 4. Andere Module (AUSSTEHEND)

| Datei | Modul | Status |
|-------|-------|--------|
| 20260809010000_dokumentenmanagement_akten.sql | Dokumentenmanagement | AUSSTEHEND |
| 20260809120000_tourenplanung.sql | Tourenplanung | AUSSTEHEND |
| 20260810010000 — 20260814010000 | Pflege-Doku, Personal, Aufgaben, Workflows, LN-Haertung | AUSSTEHEND |
| 20260815010000_profiles_rls_rekursion_und_anon_leck.sql | Security (Profiles RLS) | AUSSTEHEND |
| 20260816010000 — 20260817030002 | Ereignis-Typ, SQL-Exec, Audit-Probe, SECDEF-Haertung | AUSSTEHEND |
| 20260818010000_sis_strukturierte_informationssammlung.sql | SIS | AUSSTEHEND |
| 20260818010000_vitalwerte.sql | Vitalwerte | AUSSTEHEND |
| 20260818030000_wunddokumentation.sql | Wunddokumentation | AUSSTEHEND |
| 20260819010000_pflegecoach_dipa_modul.sql | PflegeCoach DiPA | AUSSTEHEND |

## 5. Migrations-Statistik

| Kategorie | Anzahl |
|-----------|--------|
| Gesamte Migrationen im Repo | ~130 |
| Davon Rollback-Dateien | ~35 |
| LIVE (geschaetzt) | ~75 |
| AUSSTEHEND | ~55 |
| Billing-spezifisch (ausstehend) | 10 (+ 5 Rollbacks) |
| Expansion-spezifisch (ausstehend) | 12 (+ Rollbacks) |
| Andere Module (ausstehend) | ~20 |

## 6. Risikobewertung

| Migration | Risiko | Begruendung |
|-----------|--------|-------------|
| Billing RPC (20260807*) | MITTEL | Neue Funktionen, kein Daten-Destroy, aber SECURITY DEFINER = Berechtigungs-Implikation |
| Org-Fence (20260819020000) | NIEDRIG | Idempotent, DROP IF EXISTS, keine Daten-Aenderung |
| Expansion (20260808*) | NIEDRIG | Neue Tabellen/Spalten, keine Daten-Aenderung |
| Profiles-RLS (20260815-20260817) | **HOCH** | Aendert Live-Policies, kann Login brechen wenn falsch |
| SIS/Vitalwerte/Wunddoku (20260818*) | NIEDRIG | Neue Tabellen, unabhaengig vom Rest |

## 7. Apply-Empfehlung

**Phase A (Billing-Kern):**
1. 20260807100000 + 20260807110000 + 20260807120000 + 20260807180000
2. Dann: billing_tariffs mit echten Preisen befuellen
3. Dann: 20260819020000 (Org-Fence)

**Phase B (Expansion):**
20260808* in Reihenfolge — erst nach Phase A

**Phase C (Module):**
SIS, Vitalwerte, Wunddoku, PflegeCoach — unabhaengig voneinander

**Phase D (Security-kritisch):**
20260815-20260817 — NUR mit Live-Test-Umgebung und Rollback-Plan
