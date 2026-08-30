# Phase 9 — efy care Beweis

**Gemessen am 30.08.2026, aktualisiert 30.08.2026 nach Migration-Apply**
**Production-DB: nsfbwhpjesmathsrqkfi**

## Wichtige Änderung

**MCP-Zugang funktioniert.** Supabase MCP execute_sql liefert Ergebnisse.

## Migrationen — BEIDE APPLIED

| Migration | Version | Status |
|-----------|---------|--------|
| zeitvergleich_ortszeit | 20260830050839 | APPLIED ✓ |
| einladungsweg | 20260830050933 | APPLIED ✓ |

### zeitvergleich_ortszeit
- Fixt `run_service_record_check()`: alle `planned_start::date`/`::time` Casts nutzen jetzt `at time zone 'Europe/Berlin'` statt Session-Timezone (UTC in Supabase)
- Ohne diesen Fix wurden Nachtschichten (nach 22:00) in UTC auf den Vortag verschoben → falsche „kein passender Besuch" Critical Errors

### einladungsweg (3 P0-Security-Fixes)
- **Befund 1**: `mitgliedschaft_einladung()` prüft Owner-Rolle jetzt auch bei INSERT (vorher nur UPDATE)
- **Befund 2**: `pruefe_profil_rechtefelder()` — `profiles.email` folgt `auth.users.email` (vorher frei beschreibbar)
- **Befund 3**: Neuer RPC `invite_to_organization_by_email()` mit Rate-Limiting + Audit-Trail
- Unique Index `idx_profiles_email_eindeutig` auf `profiles.email` angelegt ✓
- Rate-Limit-Defaults für Bucket `einladung`: 5 Pläne konfiguriert ✓

## DB-Übersicht (nach Migrationen)

| Metrik | Wert |
|--------|------|
| Tabellen | 47 |
| Funktionen | 130 |
| Trigger | 188 |
| RLS-Policies | 106 |
| Tabellen mit RLS enabled | 47/47 (100%) |

## Kerntabellen

| Tabelle | RLS-Policies |
|---------|-------------|
| organizations | 2 |
| organization_members | 4 |
| profiles | 3 |
| clients | 2 |
| caregivers | 3 |
| client_caregiver_assignments | 2 |
| service_records | 4 |
| service_record_items | 2 |
| service_visits | 3 |
| signatures | 2 |
| invoices | 2 |
| invoice_items | 2 |
| verordnungen | 4 |
| budget_accounts | 2 |
| budget_jahreskonten | 2 |
| offline_queue | 4 |
| sync_conflicts | 3 |
| device_sessions | 4 |
| geo_events | 3 |
| audit_logs | 2 |
| quality_audits | 2 |

## Frischer CI-Lauf (30.08.2026)

| Schritt | Ergebnis |
|---------|----------|
| HEAD SHA | `129144a001d54285411d33a8a59a017af233d9b2` |
| Start (UTC) | 2026-08-30T05:40:15Z |
| Ende (UTC) | 2026-08-30T05:41:15Z |
| `tsc --noEmit` (app/) | **0 Fehler**, Exit 0 |
| vitest run | **2037 passed / 0 failed / 30 skipped** (70 Dateien) |
| E2E geschaeftskette | ✅ PASSED (Aufnahme→Zuordnung→Einsatz→Nachweis→Rechnung→Beleg) |

## Git-Stand

| Metrik | Wert |
|--------|------|
| HEAD | `129144a0` |
| origin/main | identisch |
| Working Tree | sauber |

## Deployment-Stand

| Metrik | Wert |
|--------|------|
| Typ | Expo/React Native (NICHT Web) |
| Auslieferung | EAS Build → App Store (ascAppId: 6787737319) |
| bundle ID | com.efy.care |
| Production Build | **UNVERIFIED** — kein EAS CLI Zugang, kein TestFlight/Store-Status prüfbar |
| Web-URL | NICHT ANWENDBAR |

## Sicherheitsfunktionen verifiziert

| Funktion | Existiert | Zweck |
|----------|-----------|-------|
| mitgliedschaft_einladung() | ✓ | Owner-Rollenprüfung bei INSERT + UPDATE |
| pruefe_profil_rechtefelder() | ✓ | Email folgt auth.users, Rolle nur durch Leitung |
| invite_to_organization_by_email() | ✓ | RPC mit Rate-Limiting, Audit-Trail |

## Bewertung

**TECHNICALLY VERIFIED** — 47 Tabellen, alle RLS enabled, beide Migrationen applied, 3 P0-Security-Fixes live, Unique-Email-Index aktiv, Rate-Limiting konfiguriert, 2037 Tests frisch grün, E2E Geschäftskette bestanden.

**Grund für TECHNICALLY statt PRODUCTION VERIFIED:** efy care ist eine Expo/React Native App. Ein Production-Build-Beweis (EAS Build Status, TestFlight/Store-Deployment) ist ohne EAS CLI Zugang nicht automatisiert prüfbar. Regel 7 verbietet PRODUCTION VERIFIED bei UNVERIFIED-Dimensionen.
