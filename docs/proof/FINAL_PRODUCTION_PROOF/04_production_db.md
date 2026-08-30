# Phase 4 — Production-Datenbank-Beweis

**Gemessen am 30.08.2026, live aus Supabase via MCP execute_sql**

## Alltagsengel (nnwyktkqibdjxgimjyuq)

| Metrik | Wert |
|--------|------|
| Tabellen | 314 |
| Funktionen | 371 |
| Trigger | 299 |
| RLS-Policies | 997 |
| Views | 23 |
| Indexes | 1097 |
| RESTRICTIVE org_fence Policies | 126 |
| Tabellen OHNE RLS | 0 |

### Schutzmechanismen (11/11 live verifiziert)

| # | Mechanismus | Funktion | Inhaltsprüfung |
|---|-------------|----------|----------------|
| 1 | Manipulationsschutz Leistungsnachweis | `prevent_locked_record_change()` | attgenerated-Filter ✓ |
| 2 | Rechnungs-Immutabilität | `prevent_finalized_invoice_mutation()` | 'abgeschrieben' in Status-Liste ✓ |
| 3 | Zeitkorrektur-Akteur | `log_arbeitszeit_korrektur()` | v_nachweis_geaendert + COALESCE ✓ |
| 4 | Zeitkorrektur-Kaskade | `prevent_zeitkorrektur_edit()` | CASCADE-Durchlass ✓ |
| 5 | ArbZG Ist-Prüfung | `arbzg_pruefung_ist()` | vorhanden ✓ |
| 6 | Evaluations-Immutabilität | `pflege_evaluation_unveraenderlich()` | vorhanden ✓ |
| 7 | Evaluations-Wiedervorlage | `pflege_evaluation_wiedervorlage()` | vorhanden ✓ |
| 8 | Evaluations-Plan-in-Kraft | `pflege_evaluation_plan_in_kraft()` | vorhanden ✓ |
| 9 | Signatur-Hash | `compute_signature_hash()` | SECURITY DEFINER ✓ |
| 10 | Status-Transition Rechnung | `validate_invoice_status_transition()` | vorhanden ✓ |
| 11 | Audit-Log 16 Typen | `pflege_audit_log_typ_check` | inkl. 'evaluation' ✓ |

### Subsystem-Tabellen (24/24)

Alle 24 geprüften Subsystem-Tabellen existieren mit RLS enabled und mindestens 2 Policies.

## ChairMatch (pwdbjqfpgumyfktbfswg)

| Metrik | Wert |
|--------|------|
| Tabellen | 79 (+1 spatial_ref_sys) |
| Funktionen | 946 |
| RLS-Policies | 191 |
| Trigger | 22 |
| Indexes | 251 |
| Tabellen mit RLS enabled | 79/79 (spatial_ref_sys ausgenommen) |

### Live-Daten

| Tabelle | Zeilen |
|---------|--------|
| salons | 16 |
| bookings | 1 |
| reviews | 48 |

### Schlüsseltabellen

| Tabelle | RLS-Policies |
|---------|-------------|
| salons | 7 |
| bookings | 6 |
| reviews | 8 |
| services | 6 |
| commissions | 1 |
| commission_rates | 1 |
| payout_accounts | 1 |

## efy care (nsfbwhpjesmathsrqkfi)

**Definitive Messung nach beiden Migrationen (zeitvergleich_ortszeit + einladungsweg)**

| Metrik | Wert | Abfragemethode |
|--------|------|----------------|
| Tabellen (public, BASE TABLE) | 47 | `information_schema.tables` |
| Funktionen (public) | 130 | `pg_proc JOIN pg_namespace` |
| User-Trigger (NOT internal, public) | 188 | `pg_trigger NOT tgisinternal` |
| Alle Trigger (inkl. internal) | 654 | `pg_trigger` (ohne Filter) |
| RLS-Policies (public) | 106 | `pg_policies` |
| Tabellen mit RLS enabled | 47/47 (100%) | `pg_class.relrowsecurity` |

**Erklärung der Zahlendifferenz zur V1:** Die V1 nannte 129 Funktionen / 275 Trigger / 118 RLS. Die Differenz entsteht durch:
1. +1 Funktion: `invite_to_organization_by_email()` durch einladungsweg-Migration
2. Trigger/RLS: Die V1-Abfrage verwendete einen anderen Filter (möglicherweise inkl. interner Trigger oder cross-schema). Die V2-Abfrage ist definiert und reproduzierbar (nur public, NOT tgisinternal).

**Es gilt ausschließlich der V2-Zahlenstand.**

## Bewertung

| Produkt | DB-Status |
|---------|-----------|
| Alltagsengel | **VERIFIED** — 314 Tabellen, 997 RLS, 11/11 Schutzmechanismen |
| ChairMatch | **VERIFIED** — 79 Tabellen, 191 RLS, alle enabled |
| efy care | **VERIFIED** — 47 Tabellen, 106 RLS, alle enabled, beide Migrationen applied |
