# STAGING APPLY ANLEITUNG — Finale Migration

Stand: 2026-08-10 | Branch: `staging/expansion-abnahme` | Projekt: `nnwyktkqibdjxgimjyuq`

## Zusammenfassung

**Eine Datei, 20 Migrationen, 4 Phasen.**
Alle Migrationen sind idempotent — bei Fehler kann die Datei erneut ausgefuehrt werden.

Datei: `supabase/STAGING_COMPLETE_MIGRATION.sql`

## Voraussetzungen

- [x] Branch `staging/expansion-abnahme` ist aktuell (git pull)
- [x] Alle Code-Commits deployed (Vercel-Build gruen)
- [ ] Supabase Dashboard geoeffnet fuer Projekt `nnwyktkqibdjxgimjyuq`

## Schritt-fuer-Schritt

### 1. Supabase SQL Editor oeffnen

1. Gehe zu: https://supabase.com/dashboard/project/nnwyktkqibdjxgimjyuq/sql/new
2. Alternativ: Dashboard → SQL Editor → New Query

### 2. Baseline pruefen (VOR dem Apply)

Fuehre dieses SQL zuerst aus, um den Ist-Zustand zu dokumentieren:

```sql
SELECT 'BASELINE' AS check_typ,
  (SELECT count(*) FROM pg_tables WHERE schemaname = 'public') AS public_tables,
  (SELECT count(*) FROM pg_policies WHERE schemaname = 'public') AS policies,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.prosecdef) AS secdef_functions;
```

Notiere die Zahlen.

### 3. Migration ausfuehren

**Option A: Alles auf einmal** (empfohlen wenn < 10 Minuten Timeout)

1. Oeffne `supabase/STAGING_COMPLETE_MIGRATION.sql` im Editor
2. Kopiere den gesamten Inhalt
3. Fuege ihn im SQL Editor ein
4. Klicke "Run" (oder Ctrl+Enter / Cmd+Enter)
5. Warte auf "Success" — es koennen NOTICE-Meldungen erscheinen, das ist normal

**Option B: Phasenweise** (bei Timeout-Problemen)

Die Datei ist in 4 Phasen gegliedert. Kopiere und fuehre jede Phase einzeln aus:

1. **Phase 1 — Security** (Migrationen 1-5): Suche `PHASE 1` im File
2. **Phase 2 — Module** (Migrationen 6-13): Suche `PHASE 2` im File
3. **Phase 3 — Security-Haertung** (Migrationen 14-17): Suche `PHASE 3` im File
4. **Phase 4 — P0/P1 Fixes** (Migrationen 18-20): Suche `PHASE 4` im File

Nach jeder Phase: Auf Fehler pruefen. Bei Fehler: Screenshot machen, NICHT weitermachen.

### 4. Verifikation (NACH dem Apply)

Am Ende der Datei stehen 7 Verifikations-Queries. Fuehre sie aus:

```sql
-- 1. Neue Tabellen: Erwartet 29
SELECT count(*) FROM pg_tables WHERE schemaname = 'public'
  AND tablename IN ('sis_assessments','sis_themenfelder','sis_risikomatrix',
    'vital_signs','vital_sign_thresholds','wounds','wound_assessments',
    'wound_treatments','wound_photos','coach_users','coach_consents',
    'coach_shares','coach_assessments','coach_goals','coach_activities',
    'coach_activity_log','coach_measurements','coach_reports','coach_audit_log',
    'medikamente','medikament_eingaben','angehoerigen_zugaenge',
    'angehoerigen_nachrichten','angehoerigen_audit_log',
    'angehoerigen_benachrichtigungen','signatur_dokumente','signaturen',
    'signatur_audit_log','qes_hooks');

-- 2. SECDEF RPCs gesperrt fuer anon: Alle false
SELECT p.proname,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('wf_emit_event','wf_process_event',
    'wf_execute_queue_item','wf_process_pending',
    'wf_check_fristen','next_billing_number');

-- 3. idempotency_key vorhanden
SELECT column_name FROM information_schema.columns
WHERE table_name = 'abrechnungslaeufe' AND column_name = 'idempotency_key';
```

### 5. Erwartete Ergebnisse

| Check | Erwarteter Wert |
|-------|----------------|
| Neue Tabellen | 29 |
| SECDEF RPCs anon_exec | false (alle 6) |
| idempotency_key | 1 Zeile |
| mis_audit_log.organization_id | vorhanden |
| RLS auf allen neuen Tabellen | true |

### 6. Bei Fehler

- **Constraint-Fehler (23505)**: Duplikat-Eintrag. Migration ist idempotent — ignorierbar, erneut ausfuehren.
- **Relation does not exist (42P01)**: Reihenfolge falsch. Sicherstellen, dass Phasen in Reihenfolge laufen.
- **Permission denied (42501)**: Nicht als Owner/Superuser eingeloggt. Im SQL Editor sollte das nicht passieren.
- **42P17 Infinite Recursion**: Eine Policy referenziert profiles. Sollte nach Phase 3 behoben sein.
- **Timeout**: Option B verwenden (phasenweise).

### 7. Rollback (Notfall)

Rollback-Migrationen existieren im `supabase/migrations/`-Verzeichnis mit `_rollback_` im Namen.
Rollback in umgekehrter Reihenfolge ausfuehren (Phase 4 → 3 → 2 → 1).

---

## Checkliste nach Apply

- [ ] Verifikations-Queries ausgefuehrt, alle Werte stimmen
- [ ] Supabase Dashboard: Tabellen sichtbar unter Table Editor
- [ ] App-Funktionstest: Login + Admin-Dashboard erreichbar
- [ ] Kein 42P17-Fehler mehr beim Profil-Zugriff
- [ ] Buchungen weiterhin sichtbar (bookings-Policy funktional)
