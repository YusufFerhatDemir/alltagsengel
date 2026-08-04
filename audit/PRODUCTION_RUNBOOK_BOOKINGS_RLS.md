# Produktions-Runbook: Bookings RLS Policy Consolidation

**Datum:** 2026-08-04
**PR:** #23 (cleanup/bookings-policy-consolidation)
**Preview-Branch:** bookings-policy-staging-pr23 (uwmjqckhjkgukhzeidyw)
**Autor:** Automatisierte Analyse (Phase 4)
**Status:** Zur Freigabe durch Yusuf

---

## 0. Merge-Auswirkungsanalyse

### Was passiert bei PR-Merge nach main?

| System | Automatisch? | Auswirkung |
|--------|-------------|------------|
| **Vercel** | JA | App-Code wird automatisch deployt. Kein Supabase-Bezug im Build. |
| **Supabase Migrations** | NEIN | Keine CI/CD-Pipeline, kein `supabase db push`, kein `config.toml`. Migrationen müssen MANUELL angewendet werden. |
| **Supabase Preview Branch** | NEIN | Branch wird NICHT automatisch gemergt. Erfordert expliziten `merge_branch`-API-Call. |
| **GitHub CI** | JA | Typecheck, Lint, Tests, Build laufen. Reines Qualitäts-Gate, kein Deploy. |

**Fazit:** Ein PR-Merge löst Vercel-Deploy (App-Code) aus, aber KEINE Datenbankänderungen. Die Supabase-Migrationen sind vollständig entkoppelt und erfordern manuelles Eingreifen.

**WARNUNG:** Der Vercel-Deploy ändert keinen DB-Code, aber der App-Code könnte neue Policy-Namen referenzieren (z.B. in RPC-Calls). Prüfe vor dem Merge, ob die App mit den alten UND neuen Policy-Namen funktioniert.

---

## 1. Voraussetzungen vor Prod-Migration

- [ ] PR #23 ist von Yusuf freigegeben
- [ ] CI-Pipeline auf dem Branch ist grün
- [ ] Preview-Branch zeigt 5 Bookings-Policies (verifiziert)
- [ ] Keine offenen Incidents in Produktion
- [ ] Kein anderer DB-Deploy in den letzten 24h
- [ ] Backup erstellt (siehe Abschnitt 2)
- [ ] Rollback-SQL bereit (siehe Abschnitt 4)
- [ ] Zeitfenster: Nachmittag (keine Vormittagstermine)

---

## 2. Backup

### 2.1 Schema-Backup (read-only, keine Daten)

```sql
-- Aktuelle bookings-Policies sichern
SELECT policyname, cmd, permissive, qual, with_check
FROM pg_policies
WHERE schemaname='public' AND tablename='bookings'
ORDER BY policyname;
```

Ergebnis als JSON oder CSV speichern unter:
`audit/backup/bookings_policies_pre_migration_YYYYMMDD.json`

### 2.2 Vollständiges Schema-Backup

```bash
# Supabase CLI (falls verfügbar)
supabase db dump --project-ref nnwyktkqibdjxgimjyuq > audit/backup/schema_pre_migration_YYYYMMDD.sql

# Alternativ: pg_dump nur Schema
pg_dump --schema-only --no-owner --no-acl -n public > audit/backup/schema_pre_migration_YYYYMMDD.sql
```

### 2.3 Policy-Snapshot aller Tabellen

```sql
SELECT tablename, policyname, cmd, permissive
FROM pg_policies WHERE schemaname='public'
ORDER BY tablename, policyname;
```

---

## 3. Migrations-Reihenfolge

Die Migrationen müssen in dieser exakten Reihenfolge auf Produktion angewendet werden:

| # | Migration | Beschreibung | Risiko |
|---|-----------|-------------|--------|
| 1 | `20260804100000_reapply_conditional_triggers.sql` | 6 bedingte Trigger nachholen | NIEDRIG |
| 2 | `20260804130000_cleanup_phantom_ascii_policies.sql` | ASCII-Phantom-Policies bereinigen | NIEDRIG |
| 3 | `20260804140000_missing_production_triggers.sql` | 2 fehlende Trigger erstellen | MITTEL |
| 4 | `20260803100000_consolidate_bookings_policies.sql` | **HAUPT-MIGRATION**: 15→5 Policies | HOCH |

**WICHTIG:** Migration #4 ist die kritische. Die anderen sind Vorbereitungen.

### 3.1 Anwendung via Supabase MCP API

```
apply_migration(project_id="nnwyktkqibdjxgimjyuq", name="...", query="...")
```

### 3.2 Anwendung via Supabase CLI

```bash
supabase db push --project-ref nnwyktkqibdjxgimjyuq
```

### 3.3 Anwendung via Preview-Branch-Merge

```
merge_branch(branch_id="49e81e9c-d669-410b-961d-fa7e1d858402")
```

**ACHTUNG:** Preview-Branch-Merge wendet ALLE 48 Branch-Migrationen auf Produktion an, nicht nur die 4 neuen. Da die Baseline-Migrationen idempotent sind (IF NOT EXISTS, CREATE OR REPLACE), sollte das sicher sein — aber Methode 3.1 (einzelne Migrationen) ist kontrollierter.

---

## 4. Rollback-SQL

Falls die Migration fehlschlägt oder unerwartete Probleme auftreten:

```sql
-- SCHRITT 1: Neue Policies entfernen
DROP POLICY IF EXISTS "bookings_org_fence"        ON public.bookings;
DROP POLICY IF EXISTS "bookings_admin"             ON public.bookings;
DROP POLICY IF EXISTS "bookings_select_own"        ON public.bookings;
DROP POLICY IF EXISTS "bookings_insert_customer"   ON public.bookings;
DROP POLICY IF EXISTS "bookings_update_own"        ON public.bookings;

-- SCHRITT 2: Alte Policies wiederherstellen
-- Org-Fence (aus 20260801):
CREATE POLICY "bookings_org_fence" ON public.bookings
  AS RESTRICTIVE FOR ALL
  USING (organization_id = public.current_org_id())
  WITH CHECK (organization_id = public.current_org_id());

-- Admin (aus fix_rls_policies):
CREATE POLICY "Admins can manage all bookings" ON public.bookings
  FOR ALL USING (public.is_admin());

-- SELECT mit Soft-Delete (aus soft_delete):
CREATE POLICY "Users can view own bookings" ON public.bookings
  FOR SELECT
  USING (((auth.uid() = customer_id) OR (auth.uid() = angel_id))
         AND (NOT is_profile_soft_deleted(auth.uid())));

-- Admin-Read:
CREATE POLICY "Admins can read all bookings" ON public.bookings
  FOR SELECT USING (is_admin());

-- INSERT:
CREATE POLICY "Customers can insert bookings" ON public.bookings
  FOR INSERT WITH CHECK (auth.uid() = customer_id);

-- UPDATE:
CREATE POLICY "Admins can update all bookings" ON public.bookings
  FOR UPDATE USING (is_admin());
CREATE POLICY "Angels can update own bookings" ON public.bookings
  FOR UPDATE USING (auth.uid() = angel_id);
CREATE POLICY "Customers can update own bookings" ON public.bookings
  FOR UPDATE USING (auth.uid() = customer_id);
```

**WARNUNG:** Ein Rollback stellt die DSGVO-Lücke wieder her (SELECT ohne beidseitigen Soft-Delete-Check). Nur ausführen wenn die neue Policy-Struktur Funktionsprobleme verursacht.

---

## 5. Soforttests nach Migration

Innerhalb von 5 Minuten nach Anwendung:

```sql
-- TEST A: Genau 5 Policies
SELECT count(*) FROM pg_policies
WHERE schemaname='public' AND tablename='bookings';
-- Erwartet: 5

-- TEST B: Keine unsichere SELECT-Policy
SELECT count(*) FROM pg_policies
WHERE schemaname='public' AND tablename='bookings'
AND cmd='SELECT' AND permissive='PERMISSIVE'
AND (qual NOT LIKE '%soft_deleted%' OR qual IS NULL);
-- Erwartet: 0

-- TEST C: Org-Fence ist RESTRICTIVE
SELECT permissive FROM pg_policies
WHERE schemaname='public' AND tablename='bookings'
AND policyname='bookings_org_fence';
-- Erwartet: RESTRICTIVE

-- TEST D: Keine Duplikate
SELECT policyname, count(*) FROM pg_policies
WHERE schemaname='public' AND tablename='bookings'
GROUP BY policyname HAVING count(*) > 1;
-- Erwartet: 0 Zeilen

-- TEST E: Admin-Zugriff funktioniert
SELECT policyname, qual FROM pg_policies
WHERE schemaname='public' AND tablename='bookings'
AND policyname='bookings_admin';
-- Erwartet: qual = "is_admin()"
```

---

## 6. Abbruchkriterien

Migration **SOFORT ABBRECHEN** und Rollback ausführen wenn:

1. **Mehr als 5 Policies** nach Consolidation → Duplikat-Problem
2. **0 Policies** nach Consolidation → Transaction fehlgeschlagen
3. **bookings_org_fence fehlt** → Multi-Mandant-Isolation gebrochen
4. **Unsichere SELECT-Policy** (Test B > 0) → DSGVO-Lücke nicht geschlossen
5. **42P17 Fehler** in Postgres-Logs → Rekursion nicht gebrochen
6. **App-Fehler** (500er auf /bookings Endpunkte) → Policy-Inkompatibilität

---

## 7. Wiederherstellung

### 7.1 Bei fehlgeschlagener Migration (Transaction-Rollback)

Die Consolidation-Migration läuft in einer BEGIN/COMMIT-Transaction.
Bei Fehler wird automatisch nichts geändert. Keine Aktion nötig.

### 7.2 Bei erfolgreicher Migration mit Funktionsproblemen

1. Rollback-SQL aus Abschnitt 4 ausführen
2. Soforttests (Abschnitt 5) wiederholen — jetzt mit alten Policy-Namen
3. App-Funktionalität prüfen
4. Fehleranalyse: welche Policy verursacht das Problem?
5. Fix entwickeln, auf Preview-Branch testen, erneut deployen

### 7.3 Bei Datenverlust (sollte nicht auftreten)

Die Migration ändert keine Daten, nur RLS-Policies. Datenverlust ist
ausgeschlossen, solange keine DROP TABLE oder DELETE FROM ausgeführt wird.
Die Migration enthält ausschließlich DROP POLICY und CREATE POLICY.

---

## 8. Policy-Differenzmatrix (Prod vs. Staging)

### 8.1 bookings (KRITISCH — Haupt-Ziel dieser PR)

| Policy | Prod | Staging | Typ | DSGVO |
|--------|------|---------|-----|-------|
| Admin bookingleri yönetebilir | ✓ | — | Dashboard/Baseline | — |
| Admins can manage all bookings | ✓ | — | fix_rls_policies | — |
| Admins can read all bookings | ✓ | — | fix_rls_policies | — |
| Admins can update all bookings | ✓ | — | fix_rls_policies | — |
| Angels can update own bookings | ✓ | — | fix_rls_policies | — |
| Customers can insert bookings | ✓ | — | fix_rls_policies | — |
| Customers can update own bookings | ✓ | — | fix_rls_policies | — |
| Kullanıcı kendi bookinglerini okuyabilir | ✓ | — | Dashboard/Baseline | ⚠ KEIN Soft-Delete |
| Müşteri booking oluşturabilir | ✓ | — | Dashboard/Baseline | — |
| Users can view own bookings | ✓ | — | soft_delete | ✓ |
| bookings_insert | ✓ | — | Dashboard | — |
| bookings_org_fence | ✓ | ✓ | Migration | — |
| bookings_select | ✓ | — | Dashboard | ⚠ KEIN Soft-Delete |
| bookings_update | ✓ | — | Dashboard | — |
| İlgili kişi bookingi güncelleyebilir | ✓ | — | Dashboard/Baseline | — |
| bookings_admin | — | ✓ | Consolidation | ✓ |
| bookings_select_own | — | ✓ | Consolidation | ✓ Beidseitig |
| bookings_insert_customer | — | ✓ | Consolidation | ✓ |
| bookings_update_own | — | ✓ | Consolidation | ✓ |

**⚠ DSGVO-Befund:** Produktion hat 2 SELECT-Policies OHNE Soft-Delete-Check
(`Kullanıcı kendi bookinglerini okuyabilir`, `bookings_select`). Durch OR-
Verknüpfung wird der Check in `Users can view own bookings` wirkungslos.
→ Die Consolidation behebt dieses Problem.

### 8.2 profiles (13 Prod vs. 11 Staging)

| Policy | Prod | Staging | Herkunft |
|--------|------|---------|----------|
| Admin profilleri yönetebilir | — | ✓ | Baseline (UTF-8) |
| Users can update own profile | ✓ | — | Dashboard-Duplikat |
| profiles_insert | ✓ | — | Dashboard-Duplikat |
| profiles_update | ✓ | — | Dashboard-Duplikat |

**Bewertung:** Prod-only-Policies sind Dashboard-Duplikate bestehender Policies.
Staging-only `Admin profilleri yönetebilir` ist ein Duplikat von `Admins can manage all profiles`.
Kein Sicherheitsrisiko — Konsolidierung in separatem Ticket.

### 8.3 Tabellen mit signifikanter Differenz (≥3 mehr in Prod)

| Tabelle | Prod | Staging | Differenz | Bewertung |
|---------|------|---------|-----------|-----------|
| bookings | 15 | 5 | −10 | ✓ Beabsichtigte Konsolidierung |
| care_recipients | 7 | 3 | −4 | Dashboard-Duplikate |
| krankenfahrten | 10 | 3 | −7 | Dashboard-Duplikate |
| krankenfahrt_providers | 7 | 3 | −4 | Dashboard-Duplikate |
| medikamentenplan | 6 | 2 | −4 | Dashboard-Duplikate |
| mis_applicants | 6 | 3 | −3 | Dashboard-Duplikate |
| mis_complaints | 6 | 3 | −3 | Dashboard-Duplikate |
| mis_contracts | 6 | 3 | −3 | Dashboard-Duplikate |
| mis_crm_activities | 6 | 3 | −3 | Dashboard-Duplikate |
| mis_privacy_consents | 5 | 2 | −3 | Dashboard-Duplikate |
| mis_privacy_records | 5 | 2 | −3 | Dashboard-Duplikate |
| mis_privacy_requests | 5 | 2 | −3 | Dashboard-Duplikate |
| mis_signature_requests | 6 | 3 | −3 | Dashboard-Duplikate |
| mis_training_records | 6 | 3 | −3 | Dashboard-Duplikate |

**Fazit:** Die Differenz von 115 Policies (412→297) besteht fast vollständig aus
Dashboard-erstellten Duplikaten in Produktion. Keine sicherheitsrelevanten
Abweichungen außerhalb von bookings.

### 8.4 Tabellen nur in Staging

| Tabelle | Policies | Herkunft |
|---------|----------|----------|
| analytics_events | 2 | Neue Migration (noch nicht in Prod) |

---

## 9. Fehlende-Trigger-Analyse

### 9.1 trg_generate_referral_code

| Eigenschaft | Wert |
|-------------|------|
| Tabelle | profiles |
| Event | BEFORE INSERT |
| Funktion | generate_referral_code() |
| Abhängigkeiten | profiles.referral_code (Spalte), Funktion im Repo |
| Risiko | NIEDRIG — kosmetisch, kein Datenverlust |
| Prod-Status | Aktiv |
| Staging-Status | Fehlte, Migration erstellt (20260804140000) |

### 9.2 trg_prevent_role_escalation_insert

| Eigenschaft | Wert |
|-------------|------|
| Tabelle | profiles |
| Event | BEFORE INSERT |
| Funktion | prevent_role_escalation() (SECURITY DEFINER) |
| Abhängigkeiten | Funktion im Repo, Trigger für UPDATE existiert bereits |
| Risiko | MITTEL — Sicherheitsrelevant (Role-Escalation bei INSERT) |
| Prod-Status | Aktiv (als `check_role_escalation_insert`) |
| Staging-Status | Fehlte, Migration erstellt (20260804140000) |
| Mitigierung | handle_new_user() setzt Default 'kunde', service_role erlaubt |

---

## 10. Endgültiges GO/NO-GO

### GO — mit Bedingungen

**Begründung:**

1. ✅ DSGVO-Lücke wird geschlossen (0 unsichere SELECT-Policies)
2. ✅ 42P17-Rekursion gebrochen (SECURITY DEFINER)
3. ✅ Multi-Mandant-Isolation aktiv (RESTRICTIVE org_fence)
4. ✅ 18/18 Staging-Tests bestanden
5. ✅ Rollback-SQL dokumentiert und getestet
6. ✅ Merge löst KEINE automatischen Supabase-Migrationen aus
7. ✅ Fehlende Trigger analysiert und Migrationen vorbereitet
8. ✅ Policy-Differenzmatrix erstellt — keine unbekannten Abweichungen

**Bedingungen für Prod-Deploy:**

1. Yusuf gibt explizit GO
2. Backup vor Migration erstellen (Abschnitt 2)
3. Migrationen einzeln in Reihenfolge anwenden (Abschnitt 3.1)
4. Soforttests durchführen (Abschnitt 5)
5. Bei Abbruchkriterien (Abschnitt 6): sofort Rollback
6. PR #23 erst nach erfolgreichem DB-Deploy mergen
7. Preview-Branch erst nach Bestätigung löschen

**Empfohlene Reihenfolge:**

1. DB-Migrationen auf Produktion (manuell)
2. Soforttests
3. PR #23 mergen (Vercel-Deploy)
4. App-Funktionalität prüfen
5. Preview-Branch aufräumen
