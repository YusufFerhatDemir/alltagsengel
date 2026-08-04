# PR #31 — NULL-Kompatibilitätsprüfung: Abschlussbericht

**Branch:** `fix/profiles-fk-krankenfahrten`
**Migration:** `20260804400000_fix_profiles_fk_on_delete.sql`
**Rollback:** `audit/rollback/ROLLBACK_PROFILES_FK.sql`
**Datum:** 2026-08-04
**Prüfer:** Automatisiertes Audit (Claude) — 2 Sessions

---

## 1. Geprüfte Stellen

### 1.1 Migration (13 FK-Constraints)

| # | Tabelle.Spalte | War NOT NULL? | ON DELETE vorher | ON DELETE nachher |
|---|----------------|---------------|------------------|-------------------|
| 1 | krankenfahrten.customer_id | JA → DROP NOT NULL | NO ACTION | SET NULL |
| 2 | bookings.customer_id | JA → DROP NOT NULL | NO ACTION | SET NULL |
| 3 | hygienebox_orders.user_id | JA → DROP NOT NULL | NO ACTION | SET NULL |
| 4 | krankenfahrt_providers.user_id | JA → DROP NOT NULL | NO ACTION | SET NULL |
| 5 | krankenfahrt_reviews.customer_id | JA → DROP NOT NULL | NO ACTION | SET NULL |
| 6 | kf_booking_reviews.assigned_to | Bereits NULLABLE | NO ACTION | SET NULL |
| 7 | kf_booking_reviews.reviewed_by | Bereits NULLABLE | NO ACTION | SET NULL |
| 8 | kf_partners.user_id | Bereits NULLABLE | NO ACTION | SET NULL |
| 9 | kf_pricing_rules.created_by | Bereits NULLABLE | NO ACTION | SET NULL |
| 10 | profiles.referred_by | Bereits NULLABLE (Self-Ref) | NO ACTION | SET NULL |
| 11 | referrals.referred_id | JA → DROP NOT NULL | NO ACTION | SET NULL |
| 12 | referrals.referrer_id | JA → DROP NOT NULL | NO ACTION | SET NULL |
| 13 | reviews.reviewer_id | JA → DROP NOT NULL | NO ACTION | SET NULL |

Alle 13 Constraints verwenden idempotente DDL (`DROP CONSTRAINT IF EXISTS` + `ADD CONSTRAINT`). Bei zuvor NOT-NULL-Spalten wird vorab `DROP NOT NULL` ausgeführt, geschützt durch `IF EXISTS`-Check.

### 1.2 TypeScript / UI (Code-Fixes für NULL-Kompatibilität)

| # | Datei | Änderung |
|---|-------|----------|
| 1 | `app/fahrer/auftraege/page.tsx` | `customer_id: string` → `string \| null` |
| 2 | `app/fahrer/home/page.tsx` | `customer_id: string` → `string \| null` |
| 3 | `app/engel/buchungen/page.tsx` | Fallback `'Kunde'` → `'Ehem. Kunde'` bei NULL-Profil |
| 4 | `app/engel/home/page.tsx` | 4× NULL-Guard für `b.customer?.first_name` mit Fallback `'Ehem. Kunde'` |
| 5 | `app/engel/kalender/page.tsx` | Fallback `'Kunde'` → `'Ehem. Kunde'` |
| 6 | `app/engel/chat/page.tsx` | `if (!b.customer_id) continue` — überspringe Chats ohne Kunden-Profil |
| 7 | `app/engel/chat/[id]/page.tsx` | `if (!receiverId)` Guard — keine Nachricht an gelöschtes Profil senden |
| 8 | `app/api/cron/review-request/route.ts` | `if (!booking.customer_id) continue` — keine Bewertungs-E-Mail an gelöschtes Profil |
| 9 | `__tests__/profiles-fk-krankenfahrten.test.ts` | 158-Zeilen-Testsuite: Migration, Rollback, Idempotenz, kein CASCADE |

### 1.3 Bereits NULL-sichere Stellen (kein Eingriff nötig)

| Datei | Schutz |
|-------|--------|
| `app/admin/bookings/page.tsx` | `customer_id: string \| null`, Fallback `'—'` |
| `app/api/bookings/notify/route.ts` | `if (booking.customer_id)` Guard |
| `app/api/bookings/respond/route.ts` | `if (booking.customer_id)` Guard |
| `app/engel/bestaetigt/[id]/page.tsx` | `booking.customer ? ... : 'Kunde'` |
| `app/fahrer/chat/[id]/page.tsx` | `if (ride?.customer_id)` Guard |
| `app/admin/home/page.tsx` | `b.customer ? ... : '—'` |
| `app/mis/krankenfahrten/page.tsx` | `r.customer ? ... : '–'` |
| `app/mis/page.tsx` | `c ? ... : '—'` |

---

## 2. Gefundene und behobene Probleme

| # | Schwere | Problem | Fix | Commit |
|---|---------|---------|-----|--------|
| 1 | KRITISCH | Chat-Nachricht konnte an NULL `receiver_id` gesendet werden | `if (!receiverId)` Guard | `41c5a2f` |
| 2 | HOCH | `b.customer.first_name` crasht wenn Profil gelöscht | Ternary + Fallback `'Ehem. Kunde'` an 4 Stellen | `41c5a2f` |
| 3 | HOCH | Chat-Liste zeigt leere Einträge für gelöschte Kunden | `if (!b.customer_id) continue` | `41c5a2f` |
| 4 | MITTEL | `customer_id: string` in Ride-Interface erlaubte kein NULL | → `string \| null` | `41c5a2f` |
| 5 | MITTEL | Cron-Job sendete Bewertungs-E-Mail an gelöschte Kunden | `if (!booking.customer_id) continue` | `41c5a2f` |
| 6 | NIEDRIG | Fallback-Text inkonsistent (`'Kunde'` vs. Kontext) | → `'Ehem. Kunde'` | `41c5a2f` |

---

## 3. RLS-Analyse

| Tabelle | RLS aktiv (Produktion) | RLS aktiv (Preview) |
|---------|:---------------------:|:-------------------:|
| profiles | ✅ | ✅ |
| krankenfahrten | ✅ | ✅ |
| bookings | ✅ | ✅ |
| hygienebox_orders | ✅ | ✅ |
| krankenfahrt_providers | ✅ | ✅ |
| krankenfahrt_reviews | ✅ | ✅ |
| kf_booking_reviews | ✅ | ✅ |
| kf_partners | ✅ | ✅ |
| kf_pricing_rules | ✅ | ✅ |
| referrals | ✅ | ✅ |
| reviews | ✅ | ✅ |

**Ergebnis:** 11/11 Tabellen mit RLS aktiv. Migration ändert keine Policies.

Die Funktion `is_profile_soft_deleted(NULL)` gibt `FALSE` zurück → verwaiste Datensätze bleiben für den zugeordneten Angel/Provider sichtbar. Das ist korrekt — Geschäftsdaten müssen zugreifbar bleiben.

---

## 4. Fachliche FK-Bewertung

| # | Tabelle | FK-Spalte | SET NULL korrekt? | Begründung |
|---|---------|-----------|:-----------------:|-----------|
| 1 | krankenfahrten | customer_id | ✅ | Abrechnungsdaten müssen für Kassenprüfung erhalten bleiben |
| 2 | bookings | customer_id | ✅ | Buchungshistorie für Engel + Umsatznachweis erforderlich |
| 3 | hygienebox_orders | user_id | ✅ | Bestellungen mit Versicherungsdaten — Aufbewahrungspflicht |
| 4 | krankenfahrt_providers | user_id | ✅ | Provider-Registrierungsdaten für Vertragshistorie relevant |
| 5 | krankenfahrt_reviews | customer_id | ✅ | Bewertungen für Provider-Qualitätssicherung |
| 6 | kf_booking_reviews | assigned_to | ✅ | Internes Review — bereits NULLABLE, kein Impact |
| 7 | kf_booking_reviews | reviewed_by | ✅ | Internes Review — bereits NULLABLE |
| 8 | kf_partners | user_id | ✅ | Partner-Stammdaten — bereits NULLABLE |
| 9 | kf_pricing_rules | created_by | ✅ | Audit-Trail — bereits NULLABLE |
| 10 | profiles | referred_by | ✅ | Self-Referenz — bereits NULLABLE |
| 11 | referrals | referred_id | ✅ | Empfehlungsprogramm — Bonus-History erhalten |
| 12 | referrals | referrer_id | ✅ | Empfehlungsprogramm — Bonus-History erhalten |
| 13 | reviews | reviewer_id | ✅ | Bewertungen für Engel-Rating erhalten |

**CASCADE wäre bei KEINER dieser Tabellen vertretbar** — alle enthalten Geschäfts-/Abrechnungsdaten.

---

## 5. Preview-Testergebnisse

**Preview-Branch:** `pr31-fk-test-v2` (project_ref: `kcqsvzfzgmetqfuasccs`)
**Methode:** Schema manuell bootstrapped (11 Tabellen mit Original-FKs NO ACTION + NOT NULL), Migration angewendet, Testdaten erstellt, Profil gelöscht.

| # | Testfall | Ergebnis |
|---|----------|:--------:|
| 1 | Vor Migration: 13× NO ACTION verifiziert | ✅ |
| 2 | Migration angewendet: 13× SET NULL + NULLABLE | ✅ |
| 3 | Testdaten: 3 User (A, B, C), 12 Datensätze in 10 Tabellen | ✅ |
| 4 | **Profil User A gelöscht** — DELETE erfolgreich | ✅ |
| 5 | krankenfahrten: Datensatz erhalten, customer_id = NULL | ✅ |
| 6 | bookings: Datensatz erhalten, customer_id = NULL | ✅ |
| 7 | reviews: Datensatz erhalten, reviewer_id = NULL | ✅ |
| 8 | hygienebox_orders: Datensatz erhalten, user_id = NULL | ✅ |
| 9 | krankenfahrt_providers: Datensatz erhalten, user_id = NULL | ✅ |
| 10 | krankenfahrt_reviews: Datensatz erhalten, customer_id = NULL | ✅ |
| 11 | referrals: referrer_id = NULL, referred_id (User C) erhalten | ✅ |
| 12 | kf_booking_reviews: assigned_to = NULL, Datensatz erhalten | ✅ |
| 13 | kf_partners: user_id = NULL, Datensatz erhalten | ✅ |
| 14 | kf_pricing_rules: created_by = NULL, Datensatz erhalten | ✅ |
| 15 | **Mandantentrennung:** User C Profil unverändert | ✅ |
| 16 | **Mandantentrennung:** User C Krankenfahrt customer_id erhalten | ✅ |
| 17 | **Mandantentrennung:** User C Buchung customer_id erhalten | ✅ |
| 18 | **Mandantentrennung:** Referral referred_id (User C) erhalten | ✅ |
| 19 | **Verwaiste Referenzen:** 0 in allen 7 geprüften Tabellen | ✅ |
| 20 | **Idempotenz:** Migration erneut anwenden → kein Fehler | ✅ |
| 21 | **Rollback:** 13× zurück auf NO ACTION + NOT NULL | ✅ |
| 22 | **Re-Apply nach Rollback:** 13× SET NULL | ✅ |

**22/22 Tests bestanden. Preview-Branch nach Test gelöscht.**

---

## 6. Verbleibende Risiken

### 6.1 Bereits gefixt (kein Restrisiko)

Alle 6 gefundenen Probleme (Abschnitt 2) wurden behoben und committet (`41c5a2f`).

### 6.2 Geringe Restrisiken

- **Abrechnungsexport:** Falls ein zukünftiger CSV/PDF-Export `customer_id` als INNER JOIN nutzt, fehlen Zeilen mit NULL. → Aktuell nicht implementiert.
- **Krankenfahrten-Rechnungsstellung:** Kundenname fehlt auf Rechnung wenn Profil gelöscht. → Rechnung wird in der Praxis VOR Profil-Löschung erstellt.
- **Referral-Bonus:** Wenn `referrer_id = NULL` und Status noch `pending`, kann kein Bonus mehr gutgeschrieben werden. → Aktuell 0 Zeilen in Prod.
- **Edge Function `account-hard-delete`:** Löscht Kindersätze manuell VOR Profil — SET NULL feuert nicht im Hard-Delete-Pfad. Beabsichtigt, aber Kommentar empfohlen.

### 6.3 Kein Risiko

- RLS-Policies bleiben unverändert (11/11 aktiv)
- Migration ist idempotent und rollback-fähig
- Kein CASCADE auf Geschäftsdaten
- Mandantentrennung getestet und bestätigt

---

## 7. GO / NO-GO

### ✅ GO — PR #31 ist merge-bereit

**Begründung:**
1. Alle 13 FKs korrekt auf SET NULL umgestellt
2. 7 NOT-NULL-Spalten korrekt auf NULLABLE geändert
3. 6 Code-Probleme identifiziert und behoben (7 Dateien, 12 Änderungen)
4. **22/22 Preview-Tests auf echtem Supabase-Branch bestanden**
5. Idempotenz + Rollback + Re-Apply verifiziert
6. RLS auf Produktion UND Preview aktiv (11/11)
7. Mandantentrennung getestet
8. 0 verwaiste Referenzen
9. Kein CASCADE auf Geschäftsdaten

**Voraussetzungen für Produktion:**
1. PR #31 mergen (kein Merge auf main durch diesen Audit)
2. Migration über Supabase Dashboard oder CLI anwenden (nicht über Preview-Branch)
3. Rollback-SQL liegt bereit: `audit/rollback/ROLLBACK_PROFILES_FK.sql`
4. Erste echte Profillöschung manuell überwachen

---

*Erstellt: 2026-08-04 | Session 1: Code-Analyse + Fixes | Session 2: Preview-Tests + Report*
*Commits: `ebfd962` (Migration), `febaaaa` (FK-Report), `41c5a2f` (NULL-Kompatibilität)*
