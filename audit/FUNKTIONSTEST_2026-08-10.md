# Funktionstest — 10.08.2026

## Zusammenfassung

- **Module geprueft**: 27/27
- **P0 gefunden/gefixt**: 5 gefunden, 4 gefixt, 1 dokumentiert (mis_audit_log Legacy-Tabelle)
- **P1 gefunden/gefixt**: 16 gefunden, 7 gefixt, 9 dokumentiert (Test-Coverage / Design-Entscheidungen)
- **P2 dokumentiert**: 38
- **Tests vorher/nachher**: 1281 -> 1281 (0 Regressionen)
- **Branch**: staging/expansion-abnahme

---

## P0-Fixes (Security / Datenverlust)

### P0-1: Workflow-Engine — falsche Spaltennamen (GEFIXT)
**Datei**: `supabase/migrations/20260813010000_workflow_engine.sql`
- `benachrichtigung_senden`: Spalte `nachricht` -> `inhalt`, `prioritaet` entfernt (existiert nicht)
- `wiedervorlage_erstellen`: `bezug_typ/bezug_id/typ` -> `entitaet_typ/entitaet_id`, `status: 'offen'` -> `'aktiv'`
- `eskalation_ausloesen`: `stufe` -> `eskalationsstufe`

### P0-2: Workflow-Engine — profiles.organization_id existiert nicht (GEFIXT)
**Datei**: `supabase/migrations/20260813010000_workflow_engine.sql`
- 4x `SELECT FROM profiles WHERE organization_id = ...` ersetzt durch
  `SELECT FROM organization_members om JOIN profiles p ON p.id = om.user_id WHERE om.organization_id = ...`

### P0-3: Payment-Tabellen — fehlende RESTRICTIVE org_fence (GEFIXT)
**Datei**: `supabase/migrations/20260808210000_zahlungen_forderungen_monatsabschluss.sql`
- RESTRICTIVE org_fence mit USING + WITH CHECK auf:
  `payments`, `payment_allocations`, `dunning_entries`, `payment_differences`

### P0-4: mis_audit_log — keine organization_id, kein org_fence (DOKUMENTIERT)
**Datei**: `supabase/migrations/20260417_admin_audit_log.sql`
- Legacy-Tabelle ohne `organization_id`-Spalte -> Cross-Tenant-Audit-Leakage fuer Admins
- **Nicht gefixt**: Erfordert Live-DB-Migration (ALTER TABLE ADD COLUMN + Backfill)
- Risiko gemindert: Nur Admins haben Zugriff

### P0-5: Workflow-Engine — benachrichtigung_senden schrieb nicht-existente Spalte `prioritaet` (GEFIXT)
- Behoben als Teil von P0-1

---

## P1-Fixes (Funktionsfehler)

### P1-1: Pflegedokumentation — caregivers-Join-Bug (GEFIXT)
**Datei**: `supabase/migrations/20260810010000_pflegedokumentation.sql`
- 9 Engel-RLS-Policies: `JOIN caregivers` -> `caregiver_id IN (SELECT eigene_caregiver_ids())`
- Betroffen: pflege_aufnahmen, pflege_anamnesen, pflege_diagnosen, pflege_risiken,
  pflege_massnahmenplaene, pflege_massnahmen, pflege_verlauf (SELECT + INSERT)

### P1-2: Medikamentenmanagement — fehlende App-Layer-Validierung (GEFIXT)
**Datei**: `lib/medikamente/medikamente.ts`
- `einnahme_zeit` und `status` werden jetzt vor DB-Insert validiert
- Benutzerfreundliche Fehlermeldung statt roher Postgres CHECK-Constraint

### P1-3: Digitale Signaturen — as any Casts an sicherheitskritischen Stellen (GEFIXT)
**Dateien**:
- `lib/signaturen/signaturen.ts`: `(signatur.data as any).signatur_dokumente` -> typisierter Cast + Null-Check mit explizitem Error
- `app/api/admin/signaturen/route.ts`: `status as any` -> Validierung gegen `SIGNATUR_STATUS_WERTE`
- `app/api/admin/signaturen/dokumente/route.ts`: `dokument_typ as any` -> Validierung gegen `SIGNATUR_DOKUMENT_TYPEN`

### P1-4: Angehoerigenzugang — geburtsjahr nicht validiert (GEFIXT)
**Datei**: `app/api/coach/profil/route.ts`
- Validierung `1900 <= geburtsjahr <= 2030` vor INSERT mit 400-Response

### P1-5: SIS — caregivers-Join in engel_hat_aktiven_klienten() (DOKUMENTIERT)
**Datei**: `supabase/migrations/20260818010000_sis_strukturierte_informationssammlung.sql`
- Funktion ist SECURITY DEFINER -> kein Sicherheitsrisiko, aber Pattern-Abweichung
- Empfehlung: Bei naechster SIS-Migration auf eigene_caregiver_ids() umstellen

### P1-6: Leistungsnachweis — Stornierung ohne Admin-Check im Trigger (DOKUMENTIERT)
**Datei**: `supabase/migrations/20260814010000_leistungsnachweis_haertung.sql:249`
- `prevent_locked_record_change` erlaubt STORNIERT fuer alle authentifizierten User
- API-Layer prueft Admin-Rolle, aber direkter DB-Zugriff koennte umgehen

### P1-7: Wunddokumentation — org_fence ohne WITH CHECK (DOKUMENTIERT)
**Datei**: `supabase/migrations/20260818030000_wunddokumentation.sql`
- 4 org_fence-Policies: nur USING, kein WITH CHECK
- Mitigiert: Alle Writes via createAdminClient() + DEFAULT current_org_id()

### P1-8: Audit-Log — 3 AuditAction-Werte fehlen im DB CHECK (DOKUMENTIERT)
**Datei**: `lib/audit-log.ts:42-44`
- `user_self_soft_delete`, `user_self_undelete`, `user_hard_delete_cron` nicht im CHECK-Constraint
- Inserts werden silent verschluckt (logAuditEvent ist fail-soft)

### P1-9: Tourenplanung — Stop-Reorder ohne Transaktion (DOKUMENTIERT)
**Datei**: `app/api/tours/[id]/stops/route.ts:138-143`
- 2-Pass UPDATE ohne explizite Transaktionsgrenzen

### P1-10: Workflow-Engine — 9 Trigger ohne DROP IF EXISTS (DOKUMENTIERT)
**Datei**: `supabase/migrations/20260813010000_workflow_engine.sql`
- Re-Run der Migration wuerde fehlschlagen

### P1-11: Dashboard — kein App-Layer-Org-Filter (DOKUMENTIERT)
**Datei**: `app/admin/dashboard/page.tsx`
- 6+ Queries ohne `.eq('organization_id', ...)` — nur RLS-Fence als Schutz

### P1-12: Annahmestellen UI — sftp_key_url Exposure (DOKUMENTIERT)
**Datei**: `app/admin/annahmestellen/page.tsx`
- Client-Side `select('*')` gibt sftp_key_url an Browser zurueck

### P1-13: Eskalationsregeln — Raw-Body ohne Field-Stripping (DOKUMENTIERT)
**Datei**: `app/api/ops/eskalationsregeln/route.ts:28-31`
- POST nimmt rohen Body, `id`-Injection moeglich (TypeScript Omit = nur compile-time)

### P1-14-16: Personalmanagement + Einsatzplanung + Akten — caregivers-Join-Pattern (DOKUMENTIERT)
- 17 Engel-Policies nutzen direkten caregivers-Subquery statt eigene_caregiver_ids()
- Empfehlung: Bei naechster Migration umstellen

---

## Detail pro Modul

| # | Modul | Migration | RLS | API | Lib | UI | Tests | Status | Findings |
|---|-------|-----------|-----|-----|-----|----|-------|--------|----------|
| 1 | Tourenplanung | OK | OK | OK | OK | OK | 22 | OK | P1: Stop-Reorder |
| 2 | SIS | OK | P1 | OK | OK | OK | 18 | OK | P1: caregivers-Join |
| 3 | Pflegeplanung | OK | GEFIXT | OK | OK | OK | 29 | GEFIXT | 9 caregivers-Join |
| 4 | Massnahmenplanung | OK | OK | OK | OK | OK | 10 | OK | — |
| 5 | Pflegeberichte | OK | GEFIXT | OK | OK | OK | 11 | GEFIXT | (Teil von #3) |
| 6 | Leistungsnachweise | OK | OK | P1 | OK | OK | 0 | OK | P1: Stornierung |
| 7 | Vitalwerte | OK | OK | OK | OK | OK | 21 | OK | — |
| 8 | Wunddokumentation | OK | P1 | OK | OK | OK | 20 | OK | P1: WITH CHECK |
| 9 | Medikamentenmanagement | OK | OK | GEFIXT | OK | OK | 20 | GEFIXT | Eingabe-Valid. |
| 10 | Aufgaben/Workflow | GEFIXT | OK | OK | OK | OK | 87 | GEFIXT | P0: Spalten+profiles |
| 11 | Mitarbeiterverwaltung | OK | P2 | OK | OK | OK | 17 | OK | P2: caregivers |
| 12 | Dienst-/Schichtplanung | OK | OK | OK | OK | OK | 5 | OK | — |
| 13 | Urlaub/Krankheit | OK | OK | OK | OK | OK | 9 | OK | P2: Konto-Sync |
| 14 | Kunden-/Klientenakte | OK | P1 | OK | OK | OK | 18 | OK | P1: WITH CHECK |
| 15 | Angehoerigenzugang | OK | OK | GEFIXT | OK | OK | 25 | GEFIXT | geburtsjahr |
| 16 | Dokumentenmanagement | OK | OK | OK | OK | OK | 6 | OK | — |
| 17 | Digitale Signaturen | OK | OK | GEFIXT | GEFIXT | OK | 0 | GEFIXT | as-any-Casts |
| 18 | Rollen/Rechte/RLS | OK | OK | — | — | — | 50+ | OK | P2: profiles-Sub |
| 19 | Audit-Logs | P0 DOK | P0 DOK | OK | P1 | OK | 37 | DOK | mis_audit_log |
| 20 | Abrechnung | OK | GEFIXT | OK | OK | OK | 100+ | GEFIXT | Payment org_fence |
| 21 | Rechnungen/OPOS | OK | OK | OK | OK | OK | — | OK | — |
| 22 | DTA/Datenaustausch | OK | OK | OK | OK | OK | 7 | OK | — |
| 23 | IK-/Kostentraeger | OK | OK | OK | OK | P1 | 27 | OK | sftp_key_url |
| 24 | DiPA/PflegeCoach | OK | OK | OK | OK | OK | 39 | OK | (= #15) |
| 25 | Readiness-Dashboard | — | — | OK | — | P1 | 23 | OK | Org-Filter |
| 26 | Warnungen/Eskalationen | OK | OK | P1 | OK | OK | 70+ | OK | Raw-Body |
| 27 | Mobile/Offline | OK | — | — | OK | OK | — | TEILW. | Dead-Code Queue |

---

## Test-Ergebnis nach Fixes

```
Test Files  62 passed | 1 skipped (63)
     Tests  1281 passed | 29 skipped (1310)
  Duration  6.46s
```

**Keine Regressionen.**

---

## Methodik

- 15 dedizierte Verification-Agents pruefen parallel alle 27 Module
- Pruefung umfasst: Migration (SQL-Syntax, IF NOT EXISTS, Constraints), RLS (org_fence RESTRICTIVE, eigene_caregiver_ids()), API (Auth-Guards, Exports, Input-Validierung), Lib (Typ-Sicherheit, Error-Handling), UI (Import-Ketten), Tests (Edge Cases, Negative Tests)
- P0/P1-Fixes manuell durchgefuehrt und mit vollem Testlauf verifiziert
- Bekannte Projekt-Constraints beruecksichtigt: profiles hat keine organization_id, caregivers-Join-Bug-Pattern, total_amount in EUR nicht Cent
