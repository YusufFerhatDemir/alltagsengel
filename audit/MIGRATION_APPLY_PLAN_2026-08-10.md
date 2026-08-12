# Migration-Apply-Plan — 2026-08-10

Branch: `staging/expansion-abnahme`
Supabase-Projekt: `nnwyktkqibdjxgimjyuq`
Stamm-Org: `00000000-0000-4000-8000-000460629986`

---

## Voraussetzungen

- Supabase-MCP oder SQL-Editor-Zugang erforderlich
- Backup der Production-DB vor Beginn
- Maintenance-Window (empfohlen: 30 Min.)

---

## Phase 1: Security-Hardening (ZUERST — vor Modul-Rollout)

Diese Migrationen schliessen bekannte Sicherheitsluecken und muessen VOR
neuen Modul-Tabellen angewendet werden.

| # | Migration | Beschreibung | Abhaengigkeiten | Rollback |
|---|-----------|-------------|-----------------|----------|
| 1 | `20260817010000_sql_exec_rpc_absichern.sql` | _run_sql RPC fuer anon schliessen | Keine | `…010001_rollback…` |
| 2 | `20260817030000_secdef_rpc_haertung.sql` | 6 wf_*/billing RPCs: REVOKE anon | wf_*-Funktionen muessen existieren (20260813010000) | `…030001_rollback…` |
| 3 | `20260817030002_zusaetzliche_secdef_haertung.sql` | kassenabrechnung_erlaubt + bundesland_fuer_plz | Expansion-Funktionen (20260808100000) | Im SQL-Kommentar |
| 4 | `20260817040000_bookings_policy_rekursion.sql` | bookings 42P17-Fix | profiles + bookings Tabellen | `…040001_rollback…` |
| 5 | `20260822010000_mis_audit_log_org_id.sql` | org_id Spalte + Policy + Backfill | mis_audit_log + organization_members | `…010001_rollback…` |
| 6 | `20260822020000_billing_policies_is_admin.sql` | 6 Billing-Policies: profiles→is_admin() | is_admin() Funktion, Billing-Tabellen | `…020001_rollback…` |
| 7 | **`20260823010000_secdef_trigger_revoke.sql`** | **NEU: 19 SECDEF REVOKE (Trigger+Non-Trigger)** | Alle SECDEF-Funktionen muessen existieren | `…010001_rollback…` |
| 8 | **`20260823020000_profiles_subquery_to_is_admin.sql`** | **NEU: 44 Policies profiles→is_admin()** | Alle Modul-Tabellen muessen existieren | `…020001_rollback…` |

### Anwende-Reihenfolge Phase 1

```
1. 20260817010000  (sql_exec absichern)
2. 20260817030000  (wf_* REVOKE)
3. 20260817030002  (kassenabrechnung REVOKE)
4. 20260817040000  (bookings Rekursion)
5. 20260822010000  (mis_audit_log org_id)
6. 20260822020000  (billing policies)
7. 20260823010000  (trigger REVOKE)     ← NACH Modul-Tabellen!
8. 20260823020000  (profiles→is_admin)  ← NACH Modul-Tabellen!
```

**WICHTIG**: Migrationen 7+8 referenzieren Tabellen aus Phase 2 (wf_*, pflege_*, ops_*, personal_*). Sie muessen NACH den Modul-Migrationen angewendet werden, werden aber hier als Security-Phase gelistet.

---

## Phase 2: Modul-Migrationen (nach Security-Basis)

Alle ausstehenden Feature-Migrationen in chronologischer Reihenfolge.

| # | Migration | Neue Tabellen | Abhaengigkeiten |
|---|-----------|--------------|-----------------|
| 1 | `20260808100000_expansion_deutschland.sql` | state_settings, plz_bundesland_mapping, state_approval_documents | organizations |
| 2 | `20260808110000_tarifschichten_bundesland.sql` | — (erweitert billing_tariffs) | state_settings |
| 3 | `20260808120000_expansion_review_fixes.sql` | — (Fixes) | state_settings |
| 4 | `20260808120001_plz_bundesland_seed.sql` | — (Seed-Daten) | plz_bundesland_mapping |
| 5 | `20260808120002_invoice_bundesland_klient.sql` | — (Spalten) | invoices |
| 6 | `20260808130000_expansion_phase2.sql` | — (Erweiterungen) | state_settings |
| 7 | `20260808140000_katalog_rls.sql` | — (RLS fuer Katalog) | Billing-Kataloge |
| 8 | `20260808150000_view_invoker_und_haertung.sql` | — (Views) | Diverse |
| 9 | `20260808160000_profiles_agb_spalten.sql` | — (Spalten) | profiles |
| 10 | `20260808170000_role_guard_insert_fix.sql` | — (Trigger) | profiles |
| 11 | `20260808180000_fk_indizes_operativer_kern.sql` | — (Indizes) | Diverse |
| 12 | `20260808190000_fehlende_policies.sql` | — (Policies) | Diverse |
| 13 | `20260808200000_einsatzplanung_leistungsnachweise.sql` | assignments, leistungsnachweise, leistungspositionen | clients, caregivers |
| 14 | `20260808210000_zahlungen_forderungen_monatsabschluss.sql` | — (Billing-Erweiterungen) | payments |
| 15 | `20260808220000_kassenabrechnung_dta_dakota.sql` | abrechnungslaeufe, dta_dateien, dakota_* | Billing-Core |
| 16 | `20260809010000_dokumentenmanagement_akten.sql` | akten, akten_dokumente | clients, caregivers |
| 17 | `20260809120000_tourenplanung.sql` | tours, tour_stops | assignments |
| 18 | `20260810010000_pflegedokumentation.sql` | pflege_aufnahmen, pflege_anamnesen, pflege_diagnosen, pflege_risiken, pflege_massnahmenplaene, pflege_massnahmen, pflege_verlauf, pflege_doku_perioden | clients |
| 19 | `20260811010000_personalmanagement.sql` | personal_schulungen, dienstplan_schichten, dienstplan_eintraege, personal_urlaubskonto, personal_arbeitszeiten, personal_zeitkorrekturen, personal_audit_log | caregivers |
| 20 | `20260812010000_aufgaben_kommunikation.sql` | ops_aufgaben, ops_checklisten, ops_kommentare, ops_anhaenge, ops_wiedervorlagen, ops_eskalationsregeln, ops_eskalationshistorie, ops_nachrichten, ops_empfaenger, ops_benachrichtigungen, ops_praeferenzen, ops_ereignis_regeln, ops_aktivitaetslog | organizations |
| 21 | `20260813010000_workflow_engine.sql` | wf_events, wf_regeln, wf_aktionen, wf_ausfuehrungen, wf_warteschlange, wf_dead_letter, wf_audit_log | organizations |
| 22 | `20260814010000_leistungsnachweis_haertung.sql` | — (Haertung) | leistungsnachweise |
| 23 | `20260815010000_profiles_rls_rekursion_und_anon_leck.sql` | — (RLS-Fix) | profiles |
| 24 | `20260816010000_ereignis_typ_konsistenz.sql` | — (Constraint) | ops_ereignis_regeln |
| 25 | `20260817020000_audit_probe_zeile_dokumentieren.sql` | — (Doku) | — |
| 26 | `20260818010000_sis_strukturierte_informationssammlung.sql` | sis_erhebungen, sis_themenfelder, sis_risikomatrix | clients |
| 27 | `20260818010000_vitalwerte.sql` | vitalwerte | clients, caregivers |
| 28 | `20260818030000_wunddokumentation.sql` | wunden, wund_verlauf | clients |
| 29 | `20260819010000_pflegecoach_dipa_modul.sql` | coach_sessions, coach_messages, coach_favorites | profiles |
| 30 | `20260819020000_billing_org_fence_haertung.sql` | — (Policy-Fix) | Billing |
| 31 | `20260820010000_medikamentenmanagement.sql` | medikamente, medikament_eingaben | clients |
| 32 | `20260821010000_angehoerigenzugang.sql` | angehoerige_zugang | clients |
| 33 | `20260821020000_digitale_signaturen.sql` | signaturen | — |

---

## Phase 3: Security-Abschluss

NACH allen Modul-Tabellen anwenden (Phasen-Reihenfolge: 2 → 1.7 → 1.8):

```
34. 20260823010000_secdef_trigger_revoke.sql
35. 20260823020000_profiles_subquery_to_is_admin.sql
```

---

## Verifikation nach Apply

### 1. SECDEF-Funktionen pruefen

```sql
SELECT p.proname,
       has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth,
       has_function_privilege('service_role',  p.oid, 'EXECUTE') AS svc
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prosecdef;
```

Erwartet: Trigger-Funktionen → anon=false, auth=false, svc=true

### 2. Keine profiles-Subquery in Policies

```sql
SELECT schemaname, tablename, policyname, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND qual LIKE '%profiles%'
  AND qual NOT LIKE '%is_admin%'
  AND qual NOT LIKE '%is_internal_staff%';
```

Erwartet: 0 Zeilen (ausser bewusste Ausnahmen wie bookings_select)

### 3. RLS-Abdeckung

```sql
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename NOT IN (SELECT tablename FROM pg_policies WHERE schemaname = 'public')
  AND tablename NOT LIKE 'pg_%';
```

Erwartet: Nur system-/temp-Tabellen ohne Policy

### 4. Schema-Vergleich

```sql
SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;
```

Vergleich mit `ls supabase/migrations/*.sql | grep -v rollback | wc -l` → Anzahl muss uebereinstimmen.

---

## Rollback-Strategie

Jede Migration hat eine Rollback-Datei (`…0001_rollback_…`). Bei Problemen:

1. Betroffene Rollback-Migration anwenden
2. Fehler dokumentieren
3. Fix erstellen und im Shadow-DB testen
4. Erneut anwenden

**NIEMALS** `git reset --hard` oder DB-Restore ohne Abstimmung.

---

## Test-Ergebnisse (vor Apply)

| Pruefung | Ergebnis |
|----------|----------|
| Vitest | **1462 PASS, 0 FAIL** |
| Shadow-DB | **109/0** |
| Neue Security-Tests | 181 PASS |
| TypeScript | Via Vercel-Build geprueft |

---

## Offene Punkte

1. **Supabase-MCP** — weiterhin nicht verfuegbar; Apply muss ueber SQL-Editor erfolgen
2. **Schema-Vergleich** — Live vs. Repo noch nicht moeglich (braucht DB-Zugang)
3. **is_internal_staff profiles-Subquery** — Funktion selbst hat profiles-Query, aber SECURITY DEFINER umgeht RLS → kein 42P17-Risiko. Cleanup als separates Projekt empfohlen.
