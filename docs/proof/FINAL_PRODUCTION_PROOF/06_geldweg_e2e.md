# Phase 6 — Geldweg E2E Beweis

**Gemessen am 30.08.2026, live aus Production-DB**

## Geldweg-Kette: Tabellen in Production

| # | Tabelle | RLS-Policies | RLS enabled | Trigger |
|---|---------|-------------|-------------|---------|
| 1 | invoices | 7 | ✓ | 5 |
| 2 | invoice_items | 7 | ✓ | 0 |
| 3 | invoice_corrections | 4 | ✓ | 0 |
| 4 | invoice_snapshots | 3 | ✓ | 0 |
| 5 | invoice_line_snapshots | 3 | ✓ | 0 |
| 6 | invoice_email_log | 3 | ✓ | 0 |
| 7 | payments | 5 | ✓ | 2 |
| 8 | payment_status | 4 | ✓ | 0 |
| 9 | payment_allocations | 2 | ✓ | 0 |
| 10 | payment_differences | 2 | ✓ | 1 |
| 11 | camt_imports | 2 | ✓ | 0 |
| 12 | sepa_mandates | 4 | ✓ | 1 |
| 13 | sepa_batches | 4 | ✓ | 1 |
| 14 | sepa_batch_items | 2 | ✓ | 0 |
| 15 | signaturen | 4 | ✓ | 0 |
| 16 | service_signatures | 5 | ✓ | 0 |
| 17 | signatur_dokumente | 3 | ✓ | 0 |
| 18 | pilot_versand_sperre | 2 | ✓ | 0 |
| 19 | dta_versand_protokoll | 2 | ✓ | 0 |
| 20 | billing_audit_trail | 4 | ✓ | 2 |
| 21 | zahlungseingaenge | 4 | ✓ | 0 |

**21/21 Tabellen mit RLS enabled und mindestens 2 Policies.**

## Schutzfunktionen (6/6 live)

| Funktion | SECDEF | Live |
|----------|--------|------|
| prevent_locked_record_change | ✓ | ✓ |
| prevent_finalized_invoice_mutation | — | ✓ |
| validate_invoice_status_transition | — | ✓ |
| compute_signature_hash | ✓ | ✓ |
| log_arbeitszeit_korrektur | ✓ | ✓ |
| prevent_zeitkorrektur_edit | ✓ | ✓ |

## Sicherheitsriegel

| Riegel | Typ | Wert | Quelle |
|--------|-----|------|--------|
| FIRST_REAL_INVOICE_APPROVED | Hardcoded Konstante | `false` | lib/pilot/send-gate.ts:138 |
| PILOT_ERSTVERSAND_FREIGEGEBEN | Env-Variable | nicht gesetzt | lib/env/register.ts:195 |
| RECHNUNGSVERSAND_AUTOMATISCH | Env-Variable | nicht gesetzt | lib/env/register.ts:158 |
| MAHNVERSAND_AUTOMATISCH | Env-Variable | nicht gesetzt | lib/env/register.ts:167 |
| pilot_versand_sperre (DB) | Tabelle | 0 Zeilen | Production-Query |
| app_settings | Key-Value Store | nur demo_enabled/demo_expires/demo_password | Production-Query |

### Tests die Riegel verifizieren

- `__tests__/pilot/erstversand-flag-safety.test.ts` — prüft `FIRST_REAL_INVOICE_APPROVED === false`
- `__tests__/pilot/send-gate.test.ts` — prüft Send-Gate-Logik
- `__tests__/billing/rechnung-versand-sendgate.test.ts` — prüft Versandsperre

## Bewertung

**PRODUCTION VERIFIED** — Geldweg-Kette vollständig in Production, alle Sicherheitsriegel aktiv, kein Versand möglich.
