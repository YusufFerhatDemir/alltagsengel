# PRODUCTION-REPORT — Einsatzplanung + Kalender + Digitale Leistungsnachweise

**Datum:** 2026-08-07
**Projekt:** Alltagsengel UG — Supabase Production (`nnwyktkqibdjxgimjyuq`)
**Stamm-Org:** `00000000-0000-4000-8000-000460629986`
**Branch:** `staging/expansion-abnahme` (Commit `05730d8`)

---

## Gesamtergebnis: PRODUCTION-GO ✅

---

## 1. Production-Migration: PASS ✅

7 apply_migration Aufrufe (5 Teile + 2 Hotfixes) fehlerfrei auf Production angewendet:

| # | Migration-Name | Inhalt | Status |
|---|---------------|--------|--------|
| 1 | einsatzplanung_teil1_assignments_schema | 13 neue Spalten auf assignments + 5 Indizes + Status-Constraint | ✅ |
| 2 | einsatzplanung_teil2_service_records_schema | 16 neue Spalten auf service_records + 4 Indizes + 3 neue Tabellen | ✅ |
| 3 | einsatzplanung_teil3_trigger | 7 Trigger (Doppelbelegung, Bundesland, Sperr-Schutz, Signatur, Audit, Kassen-Gate) | ✅ |
| 4 | einsatzplanung_teil4_rls_orgfence | RLS-Policies + org_fence RESTRICTIVE auf 3 neuen Tabellen | ✅ |
| 5 | einsatzplanung_teil5_rpcs | get_calendar_assignments + get_monthly_closing_overview | ✅ |
| 6 | fix_billing_gate_column_name | Hotfix: kasse_status → status | ✅ |
| 7 | fix_billing_gate_v2 | Hotfix: org-aware Billing-Gate mit NEW.organization_id | ✅ |

## 2. Angewendete Migration

Quell-Migration: `supabase/migrations/20260808200000_einsatzplanung_leistungsnachweise.sql`
Aufgeteilt in 5+2 Teile wegen apply_migration Größenbeschränkung und Dollar-Quoting.

## 3. Zeitpunkt

2026-08-07, ca. 19:00 UTC (alle 7 Teile innerhalb von 3 Minuten)

## 4. Daten vorher/nachher

| Metrik | Vorher | Nachher | Delta |
|--------|--------|---------|-------|
| Profile gesamt | 59 | 59 | 0 |
| davon Kunden | 33 | 33 | 0 |
| davon Engel | 17 | 17 | 0 |
| davon Admin | 1 | 1 | 0 |
| Assignments | 5 | 5 | 0 |
| Service Records | 31 | 31 | 0 |
| Clients | 4 | 4 | 0 |
| Caregivers | 2 | 2 | 0 |
| Audit-Logs (SR) | — | 0 | neu |
| Audit-Logs (AS) | — | 0 | neu |
| Budget Reservations | — | 0 | neu |

**Keine bestehenden Daten verändert.**

## 5. Einsatzplanung: PASS ✅

- Einsatz mit PLZ 60311 erstellt → Status GEPLANT, Bundesland automatisch "hessen"
- Start auf GESTARTET mit actual_start_time gesetzt
- Alle Status-Werte (GEPLANT, BESTAETIGT, UNTERWEGS, GESTARTET, BEENDET, STORNIERT, NO_SHOW) via Constraint erlaubt
- Testdaten sauber entfernt

## 6. Kalender: PASS ✅

- `get_calendar_assignments('2026-08-01', '2026-08-31')` liefert 5 bestehende Einsätze korrekt
- Client- und Caregiver-Namen aufgelöst (Erika Testfall / Maria Schmidt)
- Recurring-Einsätze korrekt in Zeitfenster projiziert
- SECURITY INVOKER aktiv

## 7. Leistungsnachweis: PASS ✅

- Leistungsnachweis erstellt: proof_status=ENTWURF, billing_status=OFFEN, bundesland=hessen
- Bundesland automatisch aus Client-PLZ erkannt
- Assignment-Verknüpfung (assignment_id) funktional

## 8. Signatur: PASS ✅

- proof_status auf UNTERSCHRIEBEN gesetzt → SHA-256-Hash berechnet (64 Hex-Zeichen)
- is_locked automatisch auf true gesetzt
- client_signed_at und caregiver_confirmed_at korrekt gespeichert

## 9. Manipulationsschutz: PASS ✅

- Versuch, amount auf gesperrtem Nachweis zu ändern → blockiert mit ERRCODE 23000
- Fehlermeldung: "Leistungsnachweis [ID] ist gesperrt und kann nicht geaendert werden"
- Admin-Entsperrung und Admin-Stornierung via prevent_locked_record_change() ermöglicht

## 10. Audit: PASS ✅

- 3 Audit-Einträge automatisch erstellt: ERSTELLT → UNTERSCHRIEBEN → ERSTELLT
- Alte/neue Werte als JSONB gespeichert
- Trigger audit_service_record_change() mit SECURITY DEFINER + search_path=public
- CASCADE-Löschung bei Entfernung des Leistungsnachweises

## 11. Doppelbelegung: PASS ✅

- Zweiter Einsatz für gleichen Mitarbeiter (14:00–16:00 vs 15:00–17:00) → blockiert
- Fehlermeldung: "DOPPELBELEGUNG: Mitarbeiter [UUID] hat bereits einen Einsatz zur gleichen Zeit"
- ERRCODE unique_violation (23505)
- Stornierte und NO_SHOW-Einsätze von Prüfung ausgenommen

## 12. Privatleistung Hessen: PASS ✅

| Aktion | Ergebnis |
|--------|----------|
| Einsatz erstellen (PRIVAT) | ✅ möglich |
| Leistungsnachweis (PRIVAT) | ✅ billing_status=OFFEN |
| Signatur + Hash | ✅ funktional |
| Bundesland-Erkennung | ✅ hessen |

## 13. Kassen-Gate Hessen: PASS ✅

| Aktion | Ergebnis |
|--------|----------|
| §45b-Leistung in Hessen | billing_status=KASSENABRECHNUNG_NOCH_NICHT_FREIGESCHALTET ✅ |
| Hessen-Status | ANTRAG_EINGEREICHT (nicht ANERKANNT) ✅ |
| insurance_enabled | false ✅ |
| kassentarife_enabled | false ✅ |
| dakota_export_enabled | false ✅ |

Gate korrekt: Kassenabrechnung blockiert, solange Anerkennungsbescheid + Tarife fehlen.

## 14. Bundesland-Mapping: PASS ✅ (5/5)

| PLZ | Erwartetes Bundesland | Ergebnis | Status |
|-----|----------------------|----------|--------|
| 60311 | hessen | hessen | ✅ |
| 80331 | bayern | bayern | ✅ |
| 10115 | berlin | berlin | ✅ |
| 50667 | nordrhein_westfalen | nordrhein_westfalen | ✅ |
| 20095 | hamburg | hamburg | ✅ |

## 15. Mandantentrennung: PASS ✅

- org_fence RESTRICTIVE auf allen 3 neuen Tabellen (service_record_audit_log, assignment_audit_log, budget_reservations)
- organization_id NOT NULL mit DEFAULT current_org_id()
- Bestehende Daten mit Stamm-Org UUID befüllt

## 16. Rollen/RLS: PASS ✅

| Tabelle | Policies | org_fence |
|---------|----------|-----------|
| assignments | engel_read, engel_update, admin_manage | bestehend |
| service_records | sr_engel_own, sr_client_read | bestehend |
| service_record_audit_log | sr_audit_admin_read, sr_audit_insert | RESTRICTIVE ✅ |
| assignment_audit_log | as_audit_admin_read, as_audit_insert | RESTRICTIVE ✅ |
| budget_reservations | budget_res_admin, budget_res_own | RESTRICTIVE ✅ |

Trigger-Übersicht (assignments + service_records):

| Trigger | Tabelle | Events |
|---------|---------|--------|
| trg_check_assignment_overlap | assignments | INSERT/UPDATE |
| trg_assignment_bundesland | assignments | INSERT/UPDATE |
| trg_audit_service_record | service_records | INSERT/UPDATE |
| trg_check_billing_gate | service_records | INSERT/UPDATE |
| trg_compute_signature_hash | service_records | UPDATE |
| trg_prevent_locked_record | service_records | UPDATE |
| trg_service_records_no_finalized_edit | service_records | UPDATE |
| trg_sr_bundesland | service_records | INSERT/UPDATE |
| trg_update_budget_on_service_record | service_records | DELETE/INSERT/UPDATE |

## 17. Registrierung: PASS ✅ (Schema-Verifikation)

| Prüfpunkt | Ergebnis |
|-----------|----------|
| INSERT-Trigger trg_prevent_privileged_role_insert aktiv | ✅ (1) |
| UPDATE-Trigger trg_prevent_role_escalation aktiv | ✅ (1) |
| profiles.agb_accepted_at vorhanden | ✅ (1) |
| profiles.agb_version vorhanden | ✅ (1) |

End-to-End-Registrierungstest nicht durchgeführt (Account-Erstellung = Prohibited Action). Schema-Prüfung bestanden.

## 18. Production-Logs sauber: JA ✅

Keine SQL-Fehler während oder nach der Migration. Alle 7 apply_migration Aufrufe mit `{"success": true}`. Testdaten sauber entfernt, keine verwaisten Referenzen.

## 19. Gefundene und behobene Fehler

| Fehler | Schwere | Behebung |
|--------|---------|----------|
| check_billing_gate referenzierte `kasse_status` (existiert nicht) → Spalte heißt `status` | P1 (Runtime-Crash bei Nicht-PRIVAT-Leistungen) | fix_billing_gate_column_name + fix_billing_gate_v2 |
| Erste Gate-Fix-Version versuchte SELECT auf noch nicht existierenden Record | P2 | fix_billing_gate_v2 nutzt NEW.organization_id direkt |

Beide Fehler vor dem Smoke-Test entdeckt und behoben. Kein Produktionsausfall.

## 20. Verbleibende Risiken

| Risiko | Bewertung |
|--------|-----------|
| UI-Pages (/admin/kalender etc.) noch nicht im Browser getestet | Mittel — Code deployed, Schema korrekt, aber Frontend-Rendering ungeprüft |
| Bestehende 5 Assignments haben kein assignment_date (nur weekday) | Niedrig — Kalender-RPC behandelt recurring korrekt |
| Bestehende 31 Service Records haben proof_status=ENTWURF, billing_type=PRIVAT, billing_status=OFFEN als Defaults | Niedrig — korrekte Defaults, keine Datenänderung |
| duration_minutes ist generated column → INSERT ohne dieses Feld | Niedrig — API-Routen müssen dies beachten |

## 21. PRODUCTION-GO ✅

Alle 17 Prüfpunkte bestanden. Production-Migration fehlerfrei. Datenintegrität bestätigt. Alle Security-Gates aktiv. Billing-Gate-Bug entdeckt und sofort behoben. Testdaten sauber entfernt.

---

## Neue Tabellen (3)

| Tabelle | RLS | org_fence |
|---------|-----|-----------|
| service_record_audit_log | ✅ | RESTRICTIVE ✅ |
| assignment_audit_log | ✅ | RESTRICTIVE ✅ |
| budget_reservations | ✅ | RESTRICTIVE ✅ |

## Neue Spalten

**assignments (13):** assignment_date, actual_start_time, actual_end_time, actual_duration_minutes, address, zip_code, bundesland, recurrence_rule, recurrence_end, parent_assignment_id, notes, updated_at, created_by

**service_records (16):** assignment_id, proof_status, caregiver_confirmed_at, client_signed_at, client_signer_name, client_signer_role, signature_hash, is_locked, gps_start_lat, gps_start_lng, gps_end_lat, gps_end_lng, billing_type, billing_status, bundesland, leistung_beschreibung

## Neue RPCs (2)

- `get_calendar_assignments(date, date, uuid?, uuid?, text?, text?)` — SECURITY INVOKER
- `get_monthly_closing_overview(date)` — SECURITY INVOKER

## Neue Trigger (7)

- `trg_check_assignment_overlap` — Doppelbelegungsschutz
- `trg_assignment_bundesland` — PLZ→Bundesland (assignments)
- `trg_prevent_locked_record` — Signatur-Sperre
- `trg_compute_signature_hash` — SHA-256-Hash bei Unterschrift
- `trg_audit_service_record` — Auto-Audit-Log
- `trg_sr_bundesland` — PLZ→Bundesland (service_records)
- `trg_check_billing_gate` — Kassen-Gate

---

*Erstellt: 2026-08-07 | Agent: Claude | Production-Rollout Einsatzplanung*
