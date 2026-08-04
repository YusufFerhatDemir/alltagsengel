# Bookings Policy Consolidation — Produktions-Runbook

**Migration:** `20260803100000_consolidate_bookings_policies.sql`
**Branch:** `cleanup/bookings-policy-consolidation` (PR #23)
**Supabase-Projekt:** `nnwyktkqibdjxgimjyuq` (eu-west-1)
**Erstellt:** 2026-08-04
**Status:** WARTE AUF FREIGABE

---

## 0. Voraussetzungen

- [ ] PR #23 gemergt auf `main`
- [ ] CI-Pipeline grün auf `main` nach Merge
- [ ] Supabase Dashboard-Zugang (Admin-Rolle)
- [ ] Monitoring-Zugang (Supabase Logs, ggf. Grafana)
- [ ] Rollback-SQL griffbereit (siehe Abschnitt 7)
- [ ] Zeitfenster: **min. 30 Minuten** ohne geplante Kundenaktivität

---

## 1. Pre-Flight: Policy-Stand prüfen

**Zweck:** Sicherstellen, dass der aktuelle Prod-Stand dem erwarteten entspricht.

```sql
-- Im Supabase SQL-Editor ausführen:
SELECT policyname, permissive, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'bookings'
ORDER BY policyname;
```

**Erwarteter Zustand VOR Migration:**

| Policy | Permissive | CMD |
|---|---|---|
| Admin bookingleri yönetebilir | PERMISSIVE | ALL |
| Admins can manage all bookings | PERMISSIVE | ALL |
| Admins can read all bookings | PERMISSIVE | SELECT |
| Angels can update own bookings | PERMISSIVE | UPDATE |
| Customers can insert bookings | PERMISSIVE | INSERT |
| Customers can update own bookings | PERMISSIVE | UPDATE |
| Kullanıcı kendi bookinglerini okuyabilir | PERMISSIVE | SELECT |
| Users can view own bookings | PERMISSIVE | SELECT |
| bookings_insert | PERMISSIVE | INSERT |
| bookings_org_fence | RESTRICTIVE | ALL |
| bookings_select | PERMISSIVE | SELECT |
| bookings_update | PERMISSIVE | UPDATE |
| İlgili kişi bookingi güncelleyebilir | PERMISSIVE | UPDATE |
| Müşteri booking oluşturabilir | PERMISSIVE | INSERT |

*Hinweis: Einige Policies könnten nur über Dashboard oder frühere Ad-hoc-Änderungen existieren. Die Migration dropt sie alle mit `IF EXISTS` — fehlende werden stillschweigend übersprungen.*

**ABBRUCH wenn:** Unbekannte Policies vorhanden, die NICHT in der DROP-Liste stehen. In diesem Fall zuerst die Migration anpassen.

---

## 2. Backup erstellen

### 2a) Policy-Backup (SQL)

```sql
-- Backup aller aktuellen Bookings-Policies als SQL:
SELECT
  'CREATE POLICY "' || policyname || '" ON ' || schemaname || '.' || tablename ||
  CASE WHEN permissive = 'RESTRICTIVE' THEN ' AS RESTRICTIVE' ELSE '' END ||
  ' FOR ' || cmd ||
  CASE WHEN qual IS NOT NULL THEN ' USING (' || qual || ')' ELSE '' END ||
  CASE WHEN with_check IS NOT NULL THEN ' WITH CHECK (' || with_check || ')' ELSE '' END ||
  ';' AS restore_sql
FROM pg_policies
WHERE tablename = 'bookings'
ORDER BY policyname;
```

**Ergebnis in eine Datei sichern** (z.B. `bookings_policies_backup_20260804.sql`).

### 2b) Datenbank-Snapshot

Im Supabase Dashboard → **Database** → **Backups**:
- Manuellen Backup-Punkt erstellen (Point-in-Time Recovery)
- Oder: `pg_dump` der `bookings`-Tabelle:

```bash
pg_dump --table=public.bookings --data-only \
  --dbname="postgresql://postgres:[PASSWORD]@db.nnwyktkqibdjxgimjyuq.supabase.co:5432/postgres" \
  > bookings_data_backup_20260804.sql
```

---

## 3. Erwartete Änderungen

Die Migration führt folgende Änderungen durch:

| Aktion | Anzahl | Detail |
|---|---|---|
| DROP POLICY IF EXISTS | 18 | 15 bekannte + 3 Sicherheitsnetz |
| CREATE POLICY | 5 | Konsolidierte Policies |
| Tabellen-DDL | 0 | Keine Schemaänderung |
| Funktionen | 0 | Keine neuen Funktionen |
| Datenänderung | 0 | Keine Daten werden verändert |

**Neue Policies nach Migration:**

| Policy | Typ | CMD | Prüfung |
|---|---|---|---|
| `bookings_org_fence` | RESTRICTIVE | ALL | `organization_id = current_org_id()` |
| `bookings_admin` | PERMISSIVE | ALL | `is_admin()` |
| `bookings_select_own` | PERMISSIVE | SELECT | `uid = customer/angel AND NOT soft_deleted(both)` |
| `bookings_insert_customer` | PERMISSIVE | INSERT | `uid = customer AND NOT soft_deleted(uid)` |
| `bookings_update_own` | PERMISSIVE | UPDATE | `uid = customer/angel AND NOT soft_deleted(uid)` |

---

## 4. Migration ausführen

### Option A: Supabase SQL-Editor (empfohlen)

1. Supabase Dashboard → SQL-Editor
2. Migration-SQL einfügen (Datei: `supabase/migrations/20260803100000_consolidate_bookings_policies.sql`)
3. **NUR den Block zwischen `BEGIN;` und `COMMIT;` ausführen** (Zeilen 29-147)
4. Auf "Success" prüfen

### Option B: Supabase CLI

```bash
supabase db push --linked
```

### Option C: psql direkt

```bash
psql "postgresql://postgres:[PASSWORD]@db.nnwyktkqibdjxgimjyuq.supabase.co:5432/postgres" \
  -f supabase/migrations/20260803100000_consolidate_bookings_policies.sql
```

---

## 5. Soforttests nach Apply (max. 5 Minuten)

### 5a) Strukturprüfung

```sql
-- Genau 5 Policies vorhanden?
SELECT count(*) AS policy_count
FROM pg_policies
WHERE tablename = 'bookings';
-- Erwartet: 5

-- Org-Fence ist RESTRICTIVE?
SELECT policyname, permissive
FROM pg_policies
WHERE tablename = 'bookings' AND policyname = 'bookings_org_fence';
-- Erwartet: RESTRICTIVE

-- Alle 5 neuen Policies korrekt?
SELECT policyname, permissive, cmd
FROM pg_policies
WHERE tablename = 'bookings'
ORDER BY policyname;
```

**Erwartetes Ergebnis:**

| policyname | permissive | cmd |
|---|---|---|
| bookings_admin | PERMISSIVE | ALL |
| bookings_insert_customer | PERMISSIVE | INSERT |
| bookings_org_fence | RESTRICTIVE | ALL |
| bookings_select_own | PERMISSIVE | SELECT |
| bookings_update_own | PERMISSIVE | UPDATE |

### 5b) Funktionstest (als Admin)

```sql
-- Admin sieht Buchungen? (als eingeloggter Admin im Dashboard)
SELECT count(*) FROM public.bookings;
-- Erwartet: > 0

-- Kein 42P17-Fehler?
SELECT id, customer_id, angel_id, status FROM public.bookings LIMIT 5;
-- Erwartet: Zeilen ohne Fehler
```

### 5c) Funktionstest (als Kunde via App)

1. In der App als Testkunde einloggen
2. Buchungsübersicht öffnen
3. Bestehende Buchungen müssen sichtbar sein
4. Neue Buchung erstellen → muss funktionieren

### 5d) Kein Zugriff für Anon

```sql
-- Als anon-Rolle (PostgREST):
-- curl https://nnwyktkqibdjxgimjyuq.supabase.co/rest/v1/bookings \
--   -H "apikey: [ANON_KEY]"
-- Erwartet: leeres Array [] oder 403
```

**ABBRUCH wenn:** Einer der Tests fehlschlägt → sofort Rollback (Abschnitt 7).

---

## 6. Monitoring (nächste 24 Stunden)

| Was prüfen | Wo | Frequenz |
|---|---|---|
| 42P17-Fehler | Supabase Logs → Filter: `42P17` | Erste Stunde: alle 15 Min |
| RLS permission denied | Supabase Logs → Filter: `permission denied` | Erste Stunde: alle 15 Min |
| API 500er auf `/api/bookings` | Supabase Logs / Vercel Logs | Erste Stunde: alle 15 Min |
| Kundenbeschwerden | Support-Kanal | Laufend 24h |
| Buchungserstellungen | `SELECT count(*) FROM bookings WHERE created_at > now() - interval '1 hour'` | Stündlich |

---

## 7. Rollback

**Nur durchführen wenn:**
- Kunden können keine Buchungen mehr sehen/erstellen
- 42P17-Fehler treten auf
- Massiv 500er auf Buchungs-Endpunkten

**ACHTUNG: Der Rollback stellt die DSGVO-Lücke wieder her.** Nur als temporäre Maßnahme verwenden, dann Root-Cause analysieren.

### Rollback-SQL

```sql
BEGIN;

-- 1) Neue Policies entfernen
DROP POLICY IF EXISTS "bookings_org_fence"        ON public.bookings;
DROP POLICY IF EXISTS "bookings_admin"             ON public.bookings;
DROP POLICY IF EXISTS "bookings_select_own"        ON public.bookings;
DROP POLICY IF EXISTS "bookings_insert_customer"   ON public.bookings;
DROP POLICY IF EXISTS "bookings_update_own"        ON public.bookings;

-- 2) Org-Fence wiederherstellen (20260801)
CREATE POLICY "bookings_org_fence" ON public.bookings
  AS RESTRICTIVE FOR ALL
  USING (organization_id = public.current_org_id())
  WITH CHECK (organization_id = public.current_org_id());

-- 3) Admin-Policy wiederherstellen (20260803000000)
CREATE POLICY "Admins can manage all bookings" ON public.bookings
  FOR ALL USING (public.is_admin());

-- 4) SELECT mit Soft-Delete wiederherstellen (20260419)
CREATE POLICY "Users can view own bookings" ON public.bookings
  FOR SELECT
  USING (((auth.uid() = customer_id) OR (auth.uid() = angel_id))
         AND (NOT is_profile_soft_deleted(auth.uid())));

-- 5) Admin-Read wiederherstellen (20260414)
CREATE POLICY "Admins can read all bookings" ON public.bookings
  FOR SELECT USING (is_admin());

-- 6) INSERT wiederherstellen (20260319)
CREATE POLICY "Customers can insert bookings" ON public.bookings
  FOR INSERT WITH CHECK (auth.uid() = customer_id);

-- 7) UPDATE wiederherstellen (20260414)
CREATE POLICY "Admins can update all bookings" ON public.bookings
  FOR UPDATE USING (is_admin());
CREATE POLICY "Angels can update own bookings" ON public.bookings
  FOR UPDATE USING (auth.uid() = angel_id);
CREATE POLICY "Customers can update own bookings" ON public.bookings
  FOR UPDATE USING (auth.uid() = customer_id);

COMMIT;
```

### Rollback-Verifikation

```sql
SELECT count(*) FROM pg_policies WHERE tablename = 'bookings';
-- Erwartet: 8 (statt 5)

SELECT policyname FROM pg_policies WHERE tablename = 'bookings' ORDER BY policyname;
```

---

## 8. Abbruchkriterien

| Kriterium | Aktion |
|---|---|
| Pre-Flight zeigt unbekannte Policies | STOPP — Migration anpassen |
| Backup fehlgeschlagen | STOPP — kein Apply ohne Backup |
| Migration wirft Fehler | Transaktion rollt automatisch zurück (BEGIN/COMMIT) |
| Soforttest 5a: policy_count ≠ 5 | ROLLBACK |
| Soforttest 5b: 42P17-Fehler | ROLLBACK |
| Soforttest 5c: Kunde sieht keine Buchungen | ROLLBACK |
| Monitoring: > 5 RLS-Fehler in 15 Min | ROLLBACK |
| Monitoring: Buchungserstellungen = 0 für > 30 Min | ROLLBACK untersuchen |

---

## 9. Freigabepunkte

| Punkt | Wer | Wann |
|---|---|---|
| Staging-Abnahme abgeschlossen | Agent + Yusuf | Vor Merge |
| PR #23 Code-Review | Yusuf | Vor Merge |
| Merge auf `main` | Yusuf | Nach Freigabe |
| Prod-Apply Freigabe | Yusuf | Nach Merge + CI grün |
| Rollback-Entscheidung | Yusuf | Bei Problemen nach Apply |

---

## 10. Post-Migration

Nach erfolgreichem Apply und 24h Monitoring ohne Probleme:

- [ ] Staging-Report finalisieren
- [ ] DSGVO-Lücke als geschlossen dokumentieren
- [ ] Monitoring-Frequenz reduzieren (normal)
- [ ] Alte Dashboard-Policies NICHT wiederherstellen (waren Ursache der Lücke)
- [ ] PR #23 als abgeschlossen markieren

---

*Erstellt: 2026-08-04 — Agent: Claude Code*
*Kein Einsatz echter Kundendaten.*
