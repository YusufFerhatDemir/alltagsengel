# DSGVO: Profil-Löschung — profiles FK-Report

**Datum:** 2026-08-04
**Branch:** fix/profiles-fk-krankenfahrten
**PR:** #31
**Kontext:** auth.users FKs bereits auf SET NULL (PR #29 + #30). Dieser Report behandelt die verbleibenden FKs auf `public.profiles`.

## FK-Matrix

| # | FK-Name | Tabelle | Spalte | Vorher | Nachher | Nullable | Zeilen (Prod) | Begründung |
|---|---------|---------|--------|--------|---------|----------|---------------|------------|
| 1 | krankenfahrten_customer_id_fkey | krankenfahrten | customer_id | NO ACTION, NOT NULL | SET NULL, NULLABLE | geändert | 9 | Abrechnungsdaten — erhalten bleiben |
| 2 | bookings_customer_id_fkey | bookings | customer_id | NO ACTION, NOT NULL | SET NULL, NULLABLE | geändert | 10 | Buchungsdaten — erhalten bleiben |
| 3 | hygienebox_orders_user_id_fkey | hygienebox_orders | user_id | NO ACTION, NOT NULL | SET NULL, NULLABLE | geändert | 0 | Bestelldaten — erhalten bleiben |
| 4 | krankenfahrt_providers_user_id_fkey | krankenfahrt_providers | user_id | NO ACTION, NOT NULL | SET NULL, NULLABLE | geändert | 2 | Provider-Zuordnung — erhalten bleiben |
| 5 | krankenfahrt_reviews_customer_id_fkey | krankenfahrt_reviews | customer_id | NO ACTION, NOT NULL | SET NULL, NULLABLE | geändert | 0 | Bewertungsdaten — erhalten bleiben |
| 6 | kf_booking_reviews_assigned_to_fkey | kf_booking_reviews | assigned_to | NO ACTION | SET NULL | war NULLABLE | 0 | Review-Zuordnung |
| 7 | kf_booking_reviews_reviewed_by_fkey | kf_booking_reviews | reviewed_by | NO ACTION | SET NULL | war NULLABLE | 0 | Review-Zuordnung |
| 8 | kf_partners_user_id_fkey | kf_partners | user_id | NO ACTION | SET NULL | war NULLABLE | 0 | Partner-Zuordnung |
| 9 | kf_pricing_rules_created_by_fkey | kf_pricing_rules | created_by | NO ACTION | SET NULL | war NULLABLE | 0 | Ersteller-Referenz |
| 10 | profiles_referred_by_fkey | profiles | referred_by | NO ACTION | SET NULL | war NULLABLE | — | Self-Referenz (Empfehlung) |
| 11 | referrals_referred_id_fkey | referrals | referred_id | NO ACTION, NOT NULL | SET NULL, NULLABLE | geändert | 0 | Empfehlungsdaten — erhalten bleiben |
| 12 | referrals_referrer_id_fkey | referrals | referrer_id | NO ACTION, NOT NULL | SET NULL, NULLABLE | geändert | 0 | Empfehlungsdaten — erhalten bleiben |
| 13 | reviews_reviewer_id_fkey | reviews | reviewer_id | NO ACTION, NOT NULL | SET NULL, NULLABLE | geändert | 1 | Bewertungsdaten — erhalten bleiben |

**Bereits korrekt konfigurierte FKs (nicht geändert):**
- 20 FKs mit SET NULL (audit_logs, content_blocks, invoice_packages, mis_*, monthly_closings, offline_queue, review_errors, sync_conflicts, visitor_locations)
- 10 FKs mit CASCADE (angel_availability, angel_reviews, angels, care_recipients, documents, messages, mis_notifications, mis_training_records, notifications)

## Änderungen

- **Migration:** `supabase/migrations/20260804400000_fix_profiles_fk_on_delete.sql`
  - 13 FKs von NO ACTION → SET NULL
  - 8 Spalten von NOT NULL → NULLABLE
  - Idempotent (DO $$ BEGIN / IF EXISTS / DROP CONSTRAINT IF EXISTS)
- **Rollback:** `audit/rollback/ROLLBACK_PROFILES_FK.sql`
  - Alle 13 FKs zurück auf NO ACTION
  - NOT NULL wiederhergestellt
- **Tests:** `__tests__/profiles-fk-krankenfahrten.test.ts` — 56 Tests

## Preview-Branch Testergebnisse

| Test | Ergebnis |
|------|----------|
| FK-Status nach Migration (0× NO ACTION) | PASS |
| Krankenfahrt-Löschtest (Profil gelöscht, Fahrt erhalten, customer_id=NULL) | PASS |
| Keine verwaisten Referenzen | PASS |
| Andere Nutzer unverändert | PASS |
| Idempotenz (Migration 2× anwenden) | PASS |
| Rollback-Roundtrip (SET NULL → NO ACTION → SET NULL) | PASS |
| Regressionstests (INSERT/UPDATE/SELECT auf Krankenfahrten, Bookings, Profiles) | PASS |

## Kaskadierende Abhängigkeiten

Folgende Tabellen referenzieren die geänderten Tabellen — aber da wir SET NULL (nicht CASCADE) verwenden, werden diese Ketten NICHT ausgelöst:

- `reviews` → `bookings` (NO ACTION)
- `fahrzeuge` → `krankenfahrt_providers` (NO ACTION)
- `krankenfahrten` → `krankenfahrt_providers` (NO ACTION)
- `krankenfahrt_reviews` → `krankenfahrten` (CASCADE)
- `chat_messages` → `krankenfahrten` (CASCADE)
- `kf_partner_availability` → `kf_partners` (CASCADE)
- `messages` → `bookings` (CASCADE)
- `angel_reviews` → `bookings` (CASCADE)

**Kein Risiko:** Bei SET NULL auf profiles werden die Zwischentabellen nicht gelöscht, daher feuern die Kaskaden nicht.

## Verbleibende Risiken

1. **Abrechnung:** Krankenfahrten mit `customer_id = NULL` sind keinem Kunden mehr zuordenbar. Die Abrechnungslogik muss NULL-Werte in `customer_id` tolerieren. → Prüfung empfohlen.
2. **Krankenfahrten-Modul:** UI/API-Code der `.customer_id` als NOT NULL voraussetzt könnte Fehler werfen. → Code-Review empfohlen.
3. **RLS-Policies:** Alle betroffenen Tabellen haben RLS aktiv. Policies die auf `customer_id = auth.uid()` filtern, zeigen Datensätze mit `customer_id = NULL` nicht mehr an. → Für Admin-Ansichten ggf. anpassen.
4. **Booking-Reviews:** `reviews.booking_id → bookings` ist weiterhin NO ACTION. Wenn Bookings gelöscht werden sollen, muss dieser FK separat behandelt werden.

## GO / NO-GO

**GO** — Migration ist getestet, idempotent, mit Rollback abgesichert und blockiert keine bestehenden Daten.

**Vor Anwendung auf Produktion:**
- [ ] Code-Review: Stellen prüfen die `customer_id NOT NULL` voraussetzen
- [ ] Abrechnungslogik auf NULL-Toleranz prüfen
- [ ] RLS-Policies für Admin-Zugriff auf verwaiste Datensätze prüfen
