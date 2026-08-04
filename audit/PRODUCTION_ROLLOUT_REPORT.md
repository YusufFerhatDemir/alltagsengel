# Produktions-Rollout: Bookings RLS Policy Consolidation

**Datum:** 2026-08-04
**Operator:** Claude (autonom)
**Endgültiger Status:** ✅ **GO — Rollout erfolgreich abgeschlossen**

---

## Backup

| Feld | Wert |
|------|------|
| Backup-ID | `PROD_BACKUP_20260804_1235` |
| Zeitpunkt | 2026-08-04 12:35 UTC |
| Datei | `audit/backup/PROD_BACKUP_20260804_1235.md` |
| Inhalt | Policy-Snapshot (15 Bookings-Policies), Trigger-Snapshot, Funktions-Snapshot |

---

## Angewendete Migrationen

| # | Migration | Zeitpunkt (ca.) | Ergebnis |
|---|-----------|----------------|----------|
| 1 | `reapply_conditional_triggers` | 12:36 UTC | ✅ Erfolg — 6 bedingte Trigger nachgeholt |
| 2 | `cleanup_phantom_ascii_policies` | 12:37 UTC | ✅ Erfolg — ASCII-Phantome nicht vorhanden (No-Op) |
| 3 | `missing_production_triggers` | 12:38 UTC | ✅ Erfolg — Trigger umbenannt + UPDATE-Trigger-Fix |
| 4 | `consolidate_bookings_policies` | 12:39 UTC | ✅ Erfolg — 15→5 Policies konsolidiert |

---

## Gefundener Bug (vor Rollout behoben)

**Migration 3 (`20260804140000_missing_production_triggers.sql`)** hätte den UPDATE-Trigger
`check_role_escalation` gedroppt, ohne einen Ersatz-Trigger `trg_prevent_role_escalation`
zu erstellen. Die Baseline-Migration `20260101000100` (die diesen Trigger definiert) wurde
nie auf Produktion angewendet.

**Fix:** Migration 3 wurde vor der Anwendung um die Erstellung von
`trg_prevent_role_escalation` (BEFORE UPDATE) erweitert. Commit `2567323`.

**Auswirkung ohne Fix:** Role-Escalation-Schutz bei Profil-Updates wäre entfallen.
Ein authentifizierter Nutzer hätte seine eigene Rolle auf `admin` ändern können.

---

## Testergebnisse

### Basis-Tests (A–E)

| Test | Beschreibung | Erwartet | Ergebnis | Status |
|------|-------------|----------|----------|--------|
| A | Bookings Policy-Count | 5 | 5 | ✅ |
| B | Keine unsichere SELECT-Policy | 0 | 0 | ✅ |
| C | Org-Fence RESTRICTIVE | RESTRICTIVE | RESTRICTIVE | ✅ |
| D | Keine Duplikate | 0 Zeilen | 0 Zeilen | ✅ |
| E | Admin-Qual enthält is_admin() | ja | ja | ✅ |

### Erweiterte Tests (F–I)

| Test | Beschreibung | Erwartet | Ergebnis | Status |
|------|-------------|----------|----------|--------|
| F | Trigger vorhanden | 2 | 2 | ✅ |
| G | SECURITY DEFINER (is_admin, is_profile_soft_deleted, current_org_id) | alle true | alle true | ✅ |
| H | RLS auf Kern-Tabellen | 6/6 true | 6/6 true | ✅ |
| I | Kein service_role in Bookings-Policies | 0 | 0 | ✅ |

Test I Hinweis: 2 service_role-Policies auf `fcm_tokens` (Infrastruktur) — beabsichtigt, nicht bookings-relevant.

---

## PR & Deployment

| Feld | Wert |
|------|------|
| PR | #23 (YusufFerhatDemir/alltagsengel) |
| Merge-Commit | `368964b` |
| Merge-Zeitpunkt | 2026-08-04 10:41 UTC |
| Vercel Build | ✅ success |
| Vercel Deploy | ✅ success |
| CI (Typecheck, Lint, Tests, Build) | ✅ success |
| Report-Build-Status | ✅ success |

---

## Smoke-Tests (Live-Site)

| Seite | URL | Status |
|-------|-----|--------|
| Startseite | alltagsengel.care | ✅ Logo, Nav, CTAs sichtbar |
| Login | alltagsengel.care/auth/login | ✅ Formular, Admin-Zugang |
| Alltagsbegleitung | alltagsengel.care/alltagsbegleitung | ✅ Content, Breadcrumbs |

---

## Preview-Branch

| Feld | Wert |
|------|------|
| Branch-ID | `49e81e9c-d669-410b-961d-fa7e1d858402` |
| Project-Ref (Preview) | `uwmjqckhjkgukhzeidyw` |
| Status | ✅ Gelöscht |

---

## Rollback

**Status:** Nicht benötigt.

Rollback-SQL ist dokumentiert in der Migrationsdatei
`supabase/migrations/20260803100000_consolidate_bookings_policies.sql` (Zeilen 153–204)
sowie in der Aufgabenbeschreibung des Rollout-Runbooks.

---

## Zusammenfassung

Die Bookings RLS Policy Consolidation wurde erfolgreich auf die Produktionsdatenbank
angewendet. Die DSGVO-Lücke (Soft-Delete-Bypass durch permissive OR-Verknüpfung) ist
geschlossen. Die Policy-Landschaft wurde von 15 auf 5 klar benannte Policies konsolidiert.

Ein Sicherheitsbug in Migration 3 (fehlender UPDATE-Trigger für Role-Escalation-Schutz)
wurde vor der Anwendung identifiziert und behoben.

Alle 9 Soforttests, alle CI-Checks und alle Smoke-Tests sind grün.
