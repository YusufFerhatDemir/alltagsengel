# Abnahme-Report: Bookings RLS Policy Consolidation (A-3, P0/DSGVO)

**Branch:** `cleanup/bookings-policy-consolidation`
**Commit:** `2ecb225` — *P0/DSGVO: Bookings RLS Policy Consolidation — Soft-Delete-Bypass geschlossen*
**Datum:** 2026-08-03
**Prüfer:** Claude (automatisierte Abnahme)

---

## 1. Datenschutzvorfall

**Ergebnis: Kein Vorfall nachgewiesen — es existieren keine soft-gelöschten Profile in Produktion.**

| Prüfung | Ergebnis |
|---|---|
| Soft-gelöschte Profile (`profiles WHERE deleted_at IS NOT NULL`) | 0 Zeilen |
| Buchungen mit soft-gelöschten Parteien | 0 Zeilen |
| Audit-Log-Einträge für Soft-Delete-Aktionen | 0 Zeilen |
| Notifications für soft-gelöschte User | 0 Zeilen |

Die DSGVO-Lücke existiert strukturell (bestätigt durch Live-Policy-Abfrage: 15 Policies, davon 2 SELECT-Policies ohne `deleted_at`-Check), wurde aber bisher nicht durch reale Daten ausgelöst.

---

## 2. is_profile_soft_deleted() — Sicherheitsbewertung

**Ergebnis: Funktion ist sicher und korrekt implementiert.**

```sql
CREATE OR REPLACE FUNCTION public.is_profile_soft_deleted(uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = uid AND deleted_at IS NOT NULL
  );
$function$
```

| Kriterium | Bewertung |
|---|---|
| SECURITY DEFINER | ✅ Ja — umgeht RLS auf `profiles`, verhindert 42P17-Zyklus |
| search_path | ✅ Fest auf `public` gesetzt — kein Schema-Hijacking möglich |
| Owner | `postgres` — korrekt |
| SQL-Injection | ✅ Kein Risiko — Parameter ist `uuid`, kein `text` |
| NULL-Input | ⚠️ Akzeptabel — `WHERE id = NULL` → EXISTS false → Profil gilt als aktiv. Bei `NULL`-FK in bookings wäre die Buchung sichtbar. Da `customer_id`/`angel_id` NOT NULL sind, kein praktisches Risiko. |
| Nicht-existierendes Profil | ⚠️ Akzeptabel — EXISTS false → Profil gilt als aktiv. Verwaiste FK-Referenzen wären sichtbar. Kein praktisches Risiko bei FK-Constraints. |
| 42P17-Rekursion | ✅ Kein Risiko — SECURITY DEFINER umgeht RLS |
| Privilege Escalation | ✅ Kein Risiko — Funktion gibt nur `boolean` zurück |
| EXECUTE-Berechtigungen | postgres, anon, authenticated, service_role — `anon` könnte theoretisch UUIDs auf Soft-Delete proben (Information Disclosure), aber Rückgabe ist nur boolean und aktuell existieren 0 soft-gelöschte Profile. Niedriges Restrisiko. |

---

## 3. Shadow-DB / Dynamische Tests

**Ergebnis: 13 dynamische Tests NICHT ausgeführt — Shadow-DB nicht verfügbar.**

- **Grund:** PostgreSQL 16 (`psql`) ist in der CI-Sandbox nicht installiert.
- **Shadow-DB-Scripts:** `scripts/shadow-db.sh` und `scripts/shadow-db-http.sh` existieren und sind korrekt aufgebaut.
- **Statische Tests:** 28 von 41 Tests im Bookings-Policy-Consolidation-Testfile bestanden (statische Analyse der Migration). 13 Tests korrekt als `skipped` markiert (benötigen `SHADOW_SUPABASE_*` Env-Variablen).

**Kompensation:** Die DSGVO-Lücke wurde direkt auf der Produktions-DB verifiziert via `pg_policies`-Abfrage. Die 15 aktiven Policies bestätigen exakt das im Report beschriebene Problem:

- `bookings_select` (PERMISSIVE SELECT): `(auth.uid() = customer_id) OR (auth.uid() = angel_id)` — **KEIN** `deleted_at`-Check
- `Kullanıcı kendi bookinglerini okuyabilir` (PERMISSIVE SELECT): identisch — **KEIN** Check
- `Users can view own bookings` (PERMISSIVE SELECT): prüft `NOT is_profile_soft_deleted(auth.uid())` — aber OR-Verknüpfung mit obigen Policies macht den Check wirkungslos

---

## 4. Migration + Rollback

**Ergebnis: Statische Analyse bestanden. Migration ist korrekt, transaktional und hat dokumentierten Rollback.**

### Migration (20260803100000_consolidate_bookings_policies.sql)

| Kriterium | Bewertung |
|---|---|
| Transaktional (BEGIN/COMMIT) | ✅ |
| DROP IF EXISTS für alle 15 alten Policies | ✅ (+ 3 Sicherheitsnetz-Policies) |
| 5 neue konsolidierte Policies | ✅ |
| SELECT mit beidseitigem Soft-Delete-Check | ✅ `is_profile_soft_deleted(customer_id)` AND `is_profile_soft_deleted(angel_id)` |
| INSERT mit Soft-Delete-Check | ✅ `is_profile_soft_deleted(auth.uid())` |
| UPDATE mit Soft-Delete-Check | ✅ `is_profile_soft_deleted(auth.uid())` |
| RESTRICTIVE Org-Fence | ✅ `bookings_org_fence` mit `current_org_id()` |
| Kein direkter Sub-SELECT auf profiles | ✅ Alle Checks über `is_profile_soft_deleted()` |
| Rollback-Plan dokumentiert | ✅ Im SQL-Kommentar, mit Warnung vor DSGVO-Wiederherstellung |

### Idempotenz

⚠️ **Einschränkung:** Die Migration ist im Supabase-Kontext korrekt (läuft exakt einmal, bei Fehler: Transaction-Rollback). Für den `shadow-db.sh idempotency`-Modus (zweiter Durchlauf aller Migrationen) sind die neuen Policies `bookings_admin`, `bookings_select_own`, `bookings_insert_customer`, `bookings_update_own` **nicht** in der DROP-Liste — ein zweiter Lauf würde bei `CREATE POLICY` scheitern. Dies ist kein Produktionsrisiko, da Supabase Migrationen als angewendet trackt.

**Empfehlung:** Für volle Shadow-DB-Idempotenz die 4 neuen Policy-Namen ebenfalls in die DROP-Liste aufnehmen (`DROP POLICY IF EXISTS "bookings_admin"` etc.).

---

## 5. CI

| Kommando | Exit-Code | Ergebnis |
|---|---|---|
| `npx vitest run` | 0 | **5 Testfiles passed**, 1 skipped. **71 Tests passed**, 29 skipped. |
| `npx tsc --noEmit --skipLibCheck` | 0 | Keine Type-Errors. |

### Vitest-Aufschlüsselung

| Testfile | Tests | Ergebnis |
|---|---|---|
| bookings-policy-consolidation.test.ts | 41 (28 passed, 13 skipped) | ✅ |
| p0-auto-invoice-cross-client.test.ts | 7 passed | ✅ |
| p0-5-no-hardcoded-ik.test.ts | 8 passed | ✅ |
| p0-1-admin-auth.test.ts | 13 passed | ✅ |
| dsgvo-account-deletion.test.ts | 11 skipped | ⏭️ (Shadow-DB) |

Die 13 übersprungenen Tests im Bookings-File sind die dynamischen Shadow-DB-Tests (korrekt per `describe.skipIf` deaktiviert). Die 11 übersprungenen in `dsgvo-account-deletion` sind ebenfalls Shadow-DB-abhängig.

---

## 6. PR-Status

| Feld | Wert |
|---|---|
| Branch | `cleanup/bookings-policy-consolidation` |
| Commit | `2ecb225` |
| Message | *P0/DSGVO: Bookings RLS Policy Consolidation — Soft-Delete-Bypass geschlossen* |
| Dateien | 4 geändert, 1340 Insertions |

### Geänderte Dateien

| Datei | Zeilen | Zweck |
|---|---|---|
| `supabase/migrations/20260803100000_consolidate_bookings_policies.sql` | 195 | Konsolidierungs-Migration |
| `__tests__/security/bookings-policy-consolidation.test.ts` | 487 | 28 statische + 13 dynamische Tests |
| `audit/BOOKINGS_POLICY_CONSOLIDATION_REPORT.md` | 200 | Audit-Bericht |
| `phase-4-arbeitsplan.md` | 458 | Arbeitsplan Phase 4 |

---

## 7. Empfehlung

### 🟢 GO für Staging

Die Bookings-Policy-Konsolidierung ist bereit für das Staging-Deployment. Begründung:

1. **Kein aktiver Datenschutzvorfall** — keine soft-gelöschten Profile in Produktion
2. **Lücke strukturell bestätigt** — Live-Policy-Abfrage zeigt 15 Policies mit der dokumentierten OR-Bypass-Schwäche
3. **Migration korrekt** — transaktional, alle alten Policies gedroppt, 5 neue mit vollständigem Soft-Delete-Schutz
4. **Hilfsfunktion sicher** — SECURITY DEFINER, search_path gesetzt, kein Injection/Escalation-Risiko
5. **CI grün** — alle ausführbaren Tests bestanden, TypeScript fehlerfrei
6. **Rollback dokumentiert** — mit Warnung, dass Rollback die DSGVO-Lücke wiederherstellt

### Offene Punkte vor Produktions-Deployment

| # | Priorität | Punkt |
|---|---|---|
| 1 | **P1** | 13 dynamische Shadow-DB-Tests auf einer Umgebung mit PostgreSQL 16 ausführen |
| 2 | **P2** | Idempotenz-Fix: 4 neue Policy-Namen in die DROP-Liste aufnehmen |
| 3 | **P3** | `anon`-EXECUTE-Berechtigung auf `is_profile_soft_deleted()` entfernen (minor Info-Disclosure) |

---

*Report generiert am 2026-08-03. Keine personenbezogenen Daten enthalten. Kein Merge, keine Produktionsmigration, kein Deployment durchgeführt.*
