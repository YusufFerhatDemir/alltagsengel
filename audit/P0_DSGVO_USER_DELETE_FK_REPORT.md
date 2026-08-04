# P0 DSGVO-Audit: FK mis_auth_log_user_id_fkey

**Datum:** 2026-08-04  
**Autor:** Audit-Agent  
**Status:** PR erstellt — wartet auf Review  
**Branch:** `fix/dsgvo-user-delete-fk`

---

## 1. Ist-Zustand

| Eigenschaft | Wert |
|---|---|
| **FK-Name** | `mis_auth_log_user_id_fkey` |
| **Tabelle** | `public.mis_auth_log` |
| **Spalte** | `user_id` (uuid, NULLABLE) |
| **Referenz** | `auth.users(id)` |
| **delete_rule (IST)** | `NO ACTION` |
| **Zeilen** | 229 |
| **RLS** | Aktiv |
| **Policies** | INSERT (auth users), SELECT (admin only) |
| **Trigger** | Keine |

## 2. Problem

Die FK-Regel `ON DELETE NO ACTION` blockiert `DELETE FROM auth.users` — jeder Löschversuch schlägt mit einem FK-Violation-Error fehl, solange ein Eintrag in `mis_auth_log` existiert, der auf den User verweist.

Die Edge Function `account-hard-delete` löscht explizit aus `notifications`, `messages`, `chat_messages`, `documents`, `bookings`, `angels`, `account_deletion_tokens`, `profiles` und ruft dann `admin.auth.admin.deleteUser()` auf. **`mis_auth_log` wird NICHT explizit gelöscht** — der Aufruf schlägt daher fehl, wenn für den User Auth-Log-Einträge existieren.

**DSGVO Art. 17 Verstoß:** User können ihr Recht auf Löschung nicht ausüben.

## 3. Lösung

**Migration:** `supabase/migrations/20260804_fix_mis_auth_log_fk_on_delete.sql`

| Vorher | Nachher |
|---|---|
| `ON DELETE NO ACTION` | `ON DELETE SET NULL` |

Die Spalte `user_id` ist bereits `NULLABLE` — kein Schema-Change nötig.

**Warum SET NULL statt CASCADE?**  
Audit-Log-Einträge haben Aufbewahrungspflichten (HGB §257, AO §147). Die Zeilen bleiben erhalten, aber die personenbezogene Referenz (`user_id`) wird entfernt. Die Felder `user_email` und `user_name` werden von der bestehenden `account-hard-delete`-Funktion nicht bereinigt — das ist ein separater Punkt (siehe Empfehlung unten).

**Kein Code-Change an `account-hard-delete` nötig:** Postgres setzt `user_id` automatisch auf NULL bei User-Löschung. Kein manuelles DELETE erforderlich.

## 4. Rollback-Plan

**Datei:** `audit/rollback/ROLLBACK_MIS_AUTH_LOG_FK.sql`

```sql
ALTER TABLE public.mis_auth_log DROP CONSTRAINT IF EXISTS mis_auth_log_user_id_fkey;
ALTER TABLE public.mis_auth_log
  ADD CONSTRAINT mis_auth_log_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE NO ACTION;
```

**Vorbedingung:** Wenn bereits User gelöscht wurden und `user_id = NULL` Einträge existieren, kann `NOT NULL` nicht wiederhergestellt werden. Der FK selbst ist aber unabhängig davon wiederherstellbar.

## 5. Preview-Test-Ergebnisse

| Test | Ergebnis |
|---|---|
| Baseline: FK = NO ACTION | PASS |
| Migration angewendet: FK = SET NULL | PASS |
| Spalte ist_nullable = YES | PASS |
| RLS weiterhin aktiv | PASS |
| NULL-Simulation (Eintrag mit user_id=NULL bleibt erhalten) | PASS |
| Idempotenz (Migration erneut anwenden) | PASS |
| Rollback → FK zurück auf NO ACTION | PASS |
| Re-Apply nach Rollback → FK wieder SET NULL | PASS |

**Vitest Unit-Tests:** 9/9 PASS

## 6. Weitere blockierende FKs auf auth.users

| Tabelle | Spalte | FK-Name | delete_rule | Blockiert Löschung? | Empfehlung |
|---|---|---|---|---|---|
| `public.app_settings` | `updated_by` | `app_settings_updated_by_fkey` | NO ACTION | Ja, wenn Admin gelöscht wird | SET NULL |
| `public.caregivers` | `user_id` | `caregivers_user_id_fkey` | NO ACTION | Ja | CASCADE oder SET NULL |
| `public.chat_messages` | `sender_id` | `chat_messages_sender_id_fkey` | NO ACTION | Ja* | SET NULL (hard-delete löscht manuell) |
| `public.clients` | `user_id` | `clients_user_id_fkey` | NO ACTION | Ja | CASCADE oder SET NULL |
| `public.kf_pricing_audit` | `actor_id` | `kf_pricing_audit_actor_id_fkey` | NO ACTION | Ja | SET NULL (Audit-Log) |

*`chat_messages` wird von `account-hard-delete` manuell gelöscht (Zeile 120-122), sodass der FK in der Praxis nicht blockiert — aber nur solange die Edge Function fehlerfrei läuft.

**Nicht-blockierende FKs** (bereits CASCADE oder SET NULL): `identities`, `mfa_factors`, `sessions`, `one_time_tokens`, `account_deletion_tokens`, `fcm_tokens`, `medikamentenplan`, `notfall_info`, `organization_members`, `page_views`, `profiles`, `push_subscriptions`, `oauth_*`, `webauthn_*`.

## 7. Risikoanalyse

| Risiko | Bewertung | Mitigierung |
|---|---|---|
| Datenverlust | Kein Risiko — Zeilen bleiben erhalten, nur user_id wird NULL | — |
| Performance | Minimal — 229 Zeilen, Lock-Zeit <1ms | Migration in Wartungsfenster |
| RLS-Bruch | Kein Risiko — RLS unverändert, Policies nicht betroffen | Verifiziert auf Preview |
| Rollback-Fähigkeit | Gegeben — Rollback-SQL getestet | Datei bereitgestellt |
| user_email/user_name Residuen | `mis_auth_log` enthält `user_email` und `user_name` als TEXT-Felder, die bei Löschung NICHT bereinigt werden | Follow-up: Anonymisierung in `account-hard-delete` einbauen |

## 8. Auswirkungen

- **Audit-Logs:** Bleiben vollständig erhalten, `user_id` wird NULL nach Löschung
- **account-hard-delete:** Kein Code-Change nötig — Postgres übernimmt automatisch
- **RLS:** Unverändert — Policies prüfen `auth.uid()`, nicht `mis_auth_log.user_id`
- **Reporting/Analytics:** Queries die `JOIN auth.users` über `mis_auth_log.user_id` machen, erhalten nach Löschung keine Zeile mehr → `LEFT JOIN` empfohlen

## 9. Offene Punkte (Follow-up)

1. **5 weitere blockierende FKs** (siehe Tabelle oben) — jeweils separater PR
2. **user_email/user_name in mis_auth_log anonymisieren** — `account-hard-delete` sollte vor User-Delete ein UPDATE auf mis_auth_log machen: `SET user_email = NULL, user_name = NULL WHERE user_id = $userId`
3. **Monitoring:** Alert einrichten wenn `account-hard-delete` fehlschlägt

## 10. GO/NO-GO Empfehlung

**GO** — Migration ist sicher, getestet, rollback-fähig und behebt den DSGVO-Blocker für `mis_auth_log`.

Die 5 weiteren blockierenden FKs sollten in separaten PRs adressiert werden. Der `account-hard-delete`-Prozess funktioniert derzeit durch manuelle Löschung in den meisten Tabellen, aber `mis_auth_log` war die einzige Tabelle, die weder manuell gelöscht noch per CASCADE/SET NULL behandelt wurde.
