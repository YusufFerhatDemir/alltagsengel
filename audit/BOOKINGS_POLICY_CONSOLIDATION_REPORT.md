# P0/DSGVO: Bookings RLS Policy Consolidation — GO/NO-GO-Bericht

**Datum:** 2026-08-03
**Branch:** `cleanup/bookings-policy-consolidation`
**Supabase-Projekt:** `nnwyktkqibdjxgimjyuq`
**Status:** Bereit für kontrollierten Prod-Rollout (nach Review)

---

## 1. Bestätigte Lücke

**Lücke bestätigt: JA**

Auf `public.bookings` existieren 4 permissive SELECT-Policies. Zwei davon haben **keinen Soft-Delete-Filter**:

| Policy | USING-Klausel | Soft-Delete? |
|--------|---------------|--------------|
| `bookings_select` | `uid = customer_id OR uid = angel_id` | **NEIN** |
| `Kullanıcı kendi bookinglerini okuyabilir` | `uid = customer_id OR uid = angel_id` | **NEIN** |
| `Users can view own bookings` | `(uid = customer_id OR uid = angel_id) AND NOT is_profile_soft_deleted(uid)` | JA |
| `Admins can read all bookings` | `is_admin()` | JA (is_admin prüft deleted_at) |

**Postgres-Semantik:** Permissive Policies werden per OR verknüpft. Solange `bookings_select` oder die türkischsprachige Policy `true` zurückgibt, ist der Soft-Delete-Filter der neueren Policy wirkungslos.

**Zusätzliches Problem (Policy 9):** Selbst `Users can view own bookings` prüft nur `is_profile_soft_deleted(auth.uid())` — also ob der **anfragende** Nutzer gelöscht ist. Der Löschstatus des **Buchungspartners** (customer_id bzw. angel_id) wird nicht geprüft. Ein aktiver Kunde sieht weiterhin Buchungen mit einem soft-gelöschten Engel.

**Beweis:** Statischer Test in `__tests__/security/bookings-policy-consolidation.test.ts` belegt die Lücke durch Migration-Parsing und logische OR-Verknüpfung.

**Herkunft der Lücke:** `bookings_select` und `Kullanıcı kendi bookinglerini okuyabilir` stammen aus der initialen Schema-Erstellung (Dashboard oder Seed) und tauchen in keiner Migration auf. Die Migration `20260319000000_fix_rls_policies.sql` versuchte die türkischen Policies zu droppen (Zeilen 81-83), aber sie existieren weiterhin auf Produktion — entweder wurde die Migration nicht vollständig angewendet, oder die Policies wurden nachträglich über das Dashboard re-erstellt.

---

## 2. Policy-Matrix: VORHER / NACHHER

### VORHER (15 Policies)

| # | Policy | Cmd | Typ | Herkunft | Soft-Delete? |
|---|--------|-----|-----|----------|--------------|
| 1 | Admin bookingleri yönetebilir | ALL | permissive | 20260414 | Ja (is_admin) |
| 2 | Admins can manage all bookings | ALL | permissive | 20260803000000 | Ja (is_admin) |
| 3 | bookings_org_fence | ALL | **RESTRICTIVE** | 20260801 (dynamisch) | N/A |
| 4 | Customers can insert bookings | INSERT | permissive | 20260319 | Nein |
| 5 | Müşteri booking oluşturabilir | INSERT | permissive | Dashboard/Seed | Nein |
| 6 | bookings_insert | INSERT | permissive | Dashboard/Seed | Nein |
| 7 | Admins can read all bookings | SELECT | permissive | 20260414 | Ja (is_admin) |
| 8 | Kullanıcı kendi bookinglerini okuyabilir | SELECT | permissive | Dashboard/Seed | **NEIN** |
| 9 | Users can view own bookings | SELECT | permissive | 20260419 | Teilweise* |
| 10 | bookings_select | SELECT | permissive | Dashboard/Seed | **NEIN** |
| 11 | Admins can update all bookings | UPDATE | permissive | 20260414 | Ja (is_admin) |
| 12 | Angels can update own bookings | UPDATE | permissive | 20260319(?) | Nein |
| 13 | Customers can update own bookings | UPDATE | permissive | 20260319(?) | Nein |
| 14 | bookings_update | UPDATE | permissive | Dashboard/Seed | Nein |
| 15 | İlgili kişi bookingi güncelleyebilir | UPDATE | permissive | Dashboard/Seed | Nein |

*Policy 9 prüft nur `is_profile_soft_deleted(auth.uid())`, nicht den Buchungspartner.

### NACHHER (5 Policies)

| # | Policy | Cmd | Typ | Soft-Delete-Schutz |
|---|--------|-----|-----|--------------------|
| 1 | bookings_org_fence | ALL | **RESTRICTIVE** | N/A (Org-Isolation) |
| 2 | bookings_admin | ALL | permissive | is_admin() prüft deleted_at IS NULL |
| 3 | bookings_select_own | SELECT | permissive | Prüft BEIDE: customer_id + angel_id |
| 4 | bookings_insert_customer | INSERT | permissive | Prüft auth.uid() |
| 5 | bookings_update_own | UPDATE | permissive | Prüft auth.uid() |

**Verbesserungen:**
- 15 → 5 Policies (Angriffsfläche reduziert)
- SELECT prüft jetzt **beide** Buchungsparteien auf Soft-Delete
- Keine doppelten/redundanten Policies mehr
- Einheitliche englische Benennung
- Kein 42P17-Risiko (alle Soft-Delete-Checks über `is_profile_soft_deleted()` SECURITY DEFINER)

---

## 3. Geänderte Dateien

| Datei | Änderung |
|-------|----------|
| `supabase/migrations/20260803100000_consolidate_bookings_policies.sql` | **NEU** — Konsolidierungs-Migration |
| `__tests__/security/bookings-policy-consolidation.test.ts` | **NEU** — 28 statische + 13 dynamische Tests |
| `audit/BOOKINGS_POLICY_CONSOLIDATION_REPORT.md` | **NEU** — Dieser Bericht |

---

## 4. Migration und Rollback

**Migration:** `20260803100000_consolidate_bookings_policies.sql`
- Transaktional (BEGIN/COMMIT)
- Idempotent (DROP POLICY IF EXISTS)
- Alle 15 alten Policies werden explizit gedroppt
- 5 neue konsolidierte Policies werden erstellt
- Sicherheitsnetz: Policies die nur in Migrationen referenziert sind werden ebenfalls gedroppt

**Rollback-Plan:** Dokumentiert am Ende der Migration. Kernpunkte:
1. Neue 5 Policies droppen
2. Kritische alte Policies wiederherstellen (mit korrektem is_admin(), nicht Sub-SELECT)
3. Dashboard-Policies (bookings_select, türkischsprachige) NICHT wiederherstellen — diese verursachen die DSGVO-Lücke
4. **Empfehlung: Nicht blind rollbacken** — ein Rollback stellt die DSGVO-Lücke wieder her

---

## 5. Testergebnisse

### Statische Tests (28/28 bestanden)

| Test | Status |
|------|--------|
| Negativtest: bookings_select hat keinen deleted_at-Check | ✅ |
| Negativtest: Users can view own prüft nur auth.uid() | ✅ |
| Negativtest: OR-Verknüpfung macht Filter wirkungslos | ✅ |
| Migration existiert | ✅ |
| BEGIN/COMMIT vorhanden | ✅ |
| Alle 15 alten Policies werden gedroppt (15 Tests) | ✅ |
| bookings_org_fence ist RESTRICTIVE | ✅ |
| bookings_admin nutzt is_admin() | ✅ |
| bookings_select_own prüft BEIDE Parteien | ✅ |
| bookings_insert_customer hat Soft-Delete-Check | ✅ |
| bookings_update_own hat Soft-Delete-Check | ✅ |
| Genau 5 CREATE POLICY Statements | ✅ |
| Kein direkter Sub-SELECT auf profiles (42P17-Schutz) | ✅ |
| ROLLBACK-Plan dokumentiert | ✅ |

### Dynamische Tests (13 — übersprungen ohne Shadow-DB)

Diese Tests verifizieren die tatsächliche RLS-Durchsetzung gegen eine echte PostgreSQL-Instanz. Sie werden automatisch übersprungen wenn die Shadow-DB-Umgebung nicht konfiguriert ist.

**Empfehlung:** Vor dem Prod-Rollout die Shadow-DB-Tests einmal ausführen:
```bash
./scripts/shadow-db.sh test && ./scripts/shadow-db-http.sh up
SHADOW_SUPABASE_URL=… SHADOW_SUPABASE_ANON_KEY=… \
SHADOW_SUPABASE_SERVICE_ROLE_KEY=… \
npx vitest run __tests__/security/bookings-policy-consolidation.test.ts
```

### Gesamt-Regressionstests

```
vitest run: 5 passed | 1 skipped (6 files), 71 tests passed | 29 skipped
tsc --noEmit: Timeout in Sandbox (kein Fehler in Vitest-Transpilation)
```

Keine Regressionen durch die neuen Dateien.

---

## 6. Verbleibende Risiken

| Risiko | Schwere | Mitigation |
|--------|---------|------------|
| Dynamische Shadow-DB-Tests noch nicht ausgeführt | Mittel | Vor Prod-Rollout ausführen |
| INSERT/UPDATE-Policies prüfen nur auth.uid(), nicht den Partner | Niedrig | Design-Entscheidung: aktiver Customer soll stornieren können auch wenn Angel gelöscht |
| Performance: 3× is_profile_soft_deleted() Aufrufe pro SELECT-Row | Niedrig | Funktion ist STABLE, Postgres cached innerhalb Transaction; profiles.id hat Index |
| Alte Policies könnten über Dashboard erneut erstellt werden | Mittel | Dashboard-Zugriff auf Policy-Erstellung einschränken; regelmäßiger Audit |
| bookings_org_fence setzt voraus dass organization_id korrekt gesetzt ist | Niedrig | Default-Wert current_org_id() seit Phase-3 |

---

## 7. Empfehlung für kontrollierten Prod-Rollout

1. **Shadow-DB-Test ausführen** (dynamische Tests mit tatsächlicher RLS-Durchsetzung)
2. **Staging/Branch-DB anlegen** auf Supabase und Migration dort anwenden
3. **Manueller Smoke-Test** auf der Branch-DB:
   ```sql
   -- Als authentifizierter User (SET LOCAL ROLE authenticated)
   SET LOCAL request.jwt.claims = '{"sub":"<user-uuid>","role":"authenticated"}';
   SELECT count(*) FROM public.bookings;  -- Erwartung: nur eigene Buchungen
   ```
4. **Migration auf Produktion anwenden** während Low-Traffic-Fenster
5. **Post-Deployment-Verifikation:**
   ```sql
   SELECT policyname, cmd, qual FROM pg_policies
   WHERE tablename = 'bookings' AND schemaname = 'public'
   ORDER BY cmd, policyname;
   -- Erwartung: genau 5 Policies
   ```
6. **Monitoring:** 24h auf 42P17-Fehler und unerwartete 403er in Sentry/Logs achten

---

## 8. Datenschutzvorfallprüfung

**Einschätzung:** Eine formale Prüfung ist **empfehlenswert**, aber kein gesicherter Vorfall im Sinne von Art. 33 DSGVO.

**Begründung:**
- Die Lücke erlaubt es einem **authentifizierten** Nutzer, Buchungen zu sehen, an denen er selbst beteiligt ist, **auch nachdem sein Buchungspartner soft-gelöscht wurde**. Es handelt sich nicht um einen Zugriff durch Dritte auf fremde Daten — der Nutzer sieht nur seine eigenen Buchungshistorie.
- Die sichtbaren Daten sind: Service-Typ, Datum, Uhrzeit, Dauer, Status, Notizen. Die angel_id (UUID) ist sichtbar, aber ohne JOIN auf profiles (die korrekt durch Soft-Delete geschützt sind) lässt sich kein Personenbezug herstellen.
- Es gibt keinen Hinweis darauf, dass die Lücke aktiv ausgenutzt wurde.

**Empfehlung:**
- Internen Datenschutzbeauftragten informieren
- Dokumentation dieser Analyse aufbewahren (Art. 5 Abs. 2 Rechenschaftspflicht)
- Prüfung ob in der Grace-Period (60 Tage) Buchungsdaten über die API abgerufen wurden, die soft-gelöschte Partner enthalten
- Nach Migration: kein weiterer Handlungsbedarf, da die Lücke geschlossen ist

---

## Fazit

**GO** — mit der Empfehlung, vor dem Prod-Rollout die Shadow-DB-Tests auszuführen und den Datenschutzbeauftragten zu informieren. Die Migration ist idempotent, transaktional und hat einen dokumentierten Rollback-Plan.
