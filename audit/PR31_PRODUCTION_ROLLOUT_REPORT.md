# PR #31 — Produktions-Rollout Report

## Zusammenfassung

| Feld | Wert |
|------|------|
| Datum | 2026-08-05 00:10 UTC |
| PR | #31 — DSGVO: Profil-Löschung — profiles FKs auf SET NULL (inkl. Krankenfahrten) |
| Merge-Commit | `2a6fff55d9d33efebf25451f9926185898427859` |
| Migration | `20260804400000_fix_profiles_fk_on_delete.sql` via Supabase MCP angewandt |
| Backup-ID | `BACKUP_PR31_20260804_235800` |
| Ergebnis | **GO** |

---

## Backup (Ist-Zustand VOR Migration)

### FK-Matrix Vorher (13 blockierende FKs)

| # | FK-Name | Tabelle | Spalte | delete_rule | Nullable |
|---|---------|---------|--------|-------------|----------|
| 1 | krankenfahrten_customer_id_fkey | krankenfahrten | customer_id | NO ACTION | NOT NULL |
| 2 | bookings_customer_id_fkey | bookings | customer_id | NO ACTION | NOT NULL |
| 3 | hygienebox_orders_user_id_fkey | hygienebox_orders | user_id | NO ACTION | NOT NULL |
| 4 | krankenfahrt_providers_user_id_fkey | krankenfahrt_providers | user_id | NO ACTION | NOT NULL |
| 5 | krankenfahrt_reviews_customer_id_fkey | krankenfahrt_reviews | customer_id | NO ACTION | NOT NULL |
| 6 | kf_booking_reviews_assigned_to_fkey | kf_booking_reviews | assigned_to | NO ACTION | NULLABLE |
| 7 | kf_booking_reviews_reviewed_by_fkey | kf_booking_reviews | reviewed_by | NO ACTION | NULLABLE |
| 8 | kf_partners_user_id_fkey | kf_partners | user_id | NO ACTION | NULLABLE |
| 9 | kf_pricing_rules_created_by_fkey | kf_pricing_rules | created_by | NO ACTION | NULLABLE |
| 10 | profiles_referred_by_fkey | profiles | referred_by | NO ACTION | NULLABLE |
| 11 | referrals_referred_id_fkey | referrals | referred_id | NO ACTION | NOT NULL |
| 12 | referrals_referrer_id_fkey | referrals | referrer_id | NO ACTION | NOT NULL |
| 13 | reviews_reviewer_id_fkey | reviews | reviewer_id | NO ACTION | NOT NULL |

### Zeilenanzahlen Vorher

| Tabelle | Zeilen |
|---------|--------|
| profiles | 55 |
| bookings | 10 |
| krankenfahrten | 9 |
| krankenfahrt_providers | 2 |
| reviews | 1 |
| hygienebox_orders | 0 |
| kf_booking_reviews | 0 |
| kf_partners | 0 |
| kf_pricing_rules | 0 |
| krankenfahrt_reviews | 0 |
| referrals | 0 |

### RLS-Status

Alle 11 betroffenen Tabellen: **RLS aktiviert**

### Rollback-Pfad

`audit/rollback/ROLLBACK_PROFILES_FK.sql`

---

## FK-Matrix (Vorher → Nachher)

| # | FK-Name | Tabelle | Spalte | Vorher | Nachher | Nullable |
|---|---------|---------|--------|--------|---------|----------|
| 1 | krankenfahrten_customer_id_fkey | krankenfahrten | customer_id | NO ACTION | **SET NULL** | NULLABLE |
| 2 | bookings_customer_id_fkey | bookings | customer_id | NO ACTION | **SET NULL** | NULLABLE |
| 3 | hygienebox_orders_user_id_fkey | hygienebox_orders | user_id | NO ACTION | **SET NULL** | NULLABLE |
| 4 | krankenfahrt_providers_user_id_fkey | krankenfahrt_providers | user_id | NO ACTION | **SET NULL** | NULLABLE |
| 5 | krankenfahrt_reviews_customer_id_fkey | krankenfahrt_reviews | customer_id | NO ACTION | **SET NULL** | NULLABLE |
| 6 | kf_booking_reviews_assigned_to_fkey | kf_booking_reviews | assigned_to | NO ACTION | **SET NULL** | NULLABLE |
| 7 | kf_booking_reviews_reviewed_by_fkey | kf_booking_reviews | reviewed_by | NO ACTION | **SET NULL** | NULLABLE |
| 8 | kf_partners_user_id_fkey | kf_partners | user_id | NO ACTION | **SET NULL** | NULLABLE |
| 9 | kf_pricing_rules_created_by_fkey | kf_pricing_rules | created_by | NO ACTION | **SET NULL** | NULLABLE |
| 10 | profiles_referred_by_fkey | profiles | referred_by | NO ACTION | **SET NULL** | NULLABLE |
| 11 | referrals_referred_id_fkey | referrals | referred_id | NO ACTION | **SET NULL** | NULLABLE |
| 12 | referrals_referrer_id_fkey | referrals | referrer_id | NO ACTION | **SET NULL** | NULLABLE |
| 13 | reviews_reviewer_id_fkey | reviews | reviewer_id | NO ACTION | **SET NULL** | NULLABLE |

**0 × NO ACTION / RESTRICT** nach Migration (vorher 13)

---

## Löschtest

| Prüfpunkt | Ergebnis |
|-----------|----------|
| Testnutzer-ID | `e84bbbeb-****-****-****-************` (anonymisiert) |
| Profil-Löschung | **PASS** |
| FK = NULL (10 Tabellen, 13 FK-Spalten) | **PASS** |
| Datensätze erhalten | **PASS** (alle 10 Tabellen) |
| auth.users nach Profil-Löschung | **PASS** (noch vorhanden) |
| auth.users-Löschung (vollständige Kette) | **PASS** |
| Verwaiste Referenzen | **0** |
| Testdaten-Cleanup | **bestätigt** (Zeilenanzahlen = Backup) |

### FK = NULL pro Tabelle

| Tabelle | FK-Spalte | Datensatz da | FK = NULL |
|---------|-----------|-------------|-----------|
| krankenfahrten | customer_id | PASS | PASS |
| bookings | customer_id | PASS | PASS |
| hygienebox_orders | user_id | PASS | PASS |
| krankenfahrt_providers | user_id | PASS | PASS |
| krankenfahrt_reviews | customer_id | PASS | PASS |
| kf_booking_reviews | assigned_to | PASS | PASS |
| kf_partners | user_id | PASS | PASS |
| kf_pricing_rules | created_by | PASS | PASS |
| referrals | referred_id | PASS | PASS |
| reviews | reviewer_id | PASS | PASS |

---

## Smoke-Tests

| Bereich | URL | Status |
|---------|-----|--------|
| Startseite | / | OK |
| Login | /auth/login | OK |
| Registrierung | /auth/register | OK |
| Kundenbereich | /kunde | Redirect → 404 (erwartet ohne Auth) |
| Engelbereich | /engel | Redirect → 404 (erwartet ohne Auth) |
| Admin | /admin | Redirect → Login (erwartet) |
| Krankenfahrten | /krankenfahrten | OK |
| Console-Errors | — | React #418 Hydration (pre-existent, nicht migrationsbezogen) |

---

## Zeilenanzahlen (Vorher = Nachher)

| Tabelle | Vorher | Nachher |
|---------|--------|---------|
| profiles | 55 | 55 |
| bookings | 10 | 10 |
| krankenfahrten | 9 | 9 |
| krankenfahrt_providers | 2 | 2 |
| reviews | 1 | 1 |
| hygienebox_orders | 0 | 0 |
| kf_booking_reviews | 0 | 0 |
| kf_partners | 0 | 0 |
| kf_pricing_rules | 0 | 0 |
| krankenfahrt_reviews | 0 | 0 |
| referrals | 0 | 0 |

---

## CI / Deployment

| Schritt | Status |
|---------|--------|
| CI (Typecheck, Lint, Tests, Build) | PASS |
| Vercel-Deployment | PASS |
| GitHub Pages | PASS |
| alltagsengel.care erreichbar | PASS |

---

## Ergebnis

### **GO**

Alle 13 blockierenden Foreign Keys auf `public.profiles` wurden erfolgreich von `NO ACTION` auf `ON DELETE SET NULL` migriert. Die DSGVO-Profil-Löschung ist jetzt auf Produktionsebene möglich, ohne Geschäfts- oder Abrechnungsdaten zu verlieren.
