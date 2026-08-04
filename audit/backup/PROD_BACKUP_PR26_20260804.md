# Produktionsbackup vor PR #26 Migration

**Datum:** 2026-08-04 ~14:20 UTC+2
**Projekt:** nnwyktkqibdjxgimjyuq (Produktion)
**Zweck:** Baseline-Snapshot vor CREATE TABLE documents Migration

---

## C1: Tabellen-Anzahl

| Metrik | Wert |
|--------|------|
| Tabellen in `public` | 125 |

## C2: documents-Tabelle existiert NICHT

```
documents_exists = false
```

## C3: Policy-Snapshot

Policy-Snapshot wurde separat erfasst (64 KB, zu groß für inline).
Gespeichert zum Zeitpunkt der Abfrage.

Schlüssel-Policies für Regressions-Check:

| Tabelle | Policy | CMD | Permissive |
|---------|--------|-----|------------|
| bookings | bookings_admin | ALL | PERMISSIVE |
| bookings | bookings_engel_select | SELECT | PERMISSIVE |
| bookings | bookings_kunde_select | SELECT | PERMISSIVE |
| bookings | bookings_org_fence | ALL | RESTRICTIVE |
| bookings | bookings_update_own | UPDATE | PERMISSIVE |

## C4: Trigger-Snapshot (35 Trigger)

Schlüssel-Trigger:
- `on_auth_user_created` (auth.users)
- `trg_booking_status_transition` (bookings)
- `trg_generate_referral_code` (profiles)
- `trg_onboarding_new_kunde` (profiles)
- `trg_prevent_role_escalation` (profiles)
- `trg_prevent_role_escalation_insert` (profiles)
- `trg_service_records_no_finalized_edit` (service_records)
- `trg_invoices_no_finalized_edit` (invoices)
- `trg_audit_logs_no_delete` (audit_logs)
- `trg_audit_logs_no_update` (audit_logs)

## C5: Bookings-Policies

```
bookings_policy_count = 5 ✅ (erwartet: 5)
```

## C6: Storage-Buckets

| Bucket | Public |
|--------|--------|
| abrechnung | false |
| mis-documents | false |
| service-proofs | false |
| verordnungen | false |

**Kein `documents` Bucket vorhanden** (wird durch Migration erstellt).

---

## Verifizierung

- [x] Tabellen-Count erfasst (125)
- [x] documents existiert nicht (Baseline)
- [x] Policy-Snapshot vollständig
- [x] Trigger-Snapshot vollständig
- [x] Bookings-Policies = 5 (Regression-Baseline)
- [x] Storage-Buckets dokumentiert (4, alle privat)
