# Release-Baseline-Check nach PR #32

**Datum:** 2026-08-05  
**Prüftyp:** READ-ONLY Produktionsüberprüfung  
**Anlass:** PR #32 (React #418 Hydration Fix) nach main gemergt  
**Ergebnis:** **GO — Produktion stabil**

---

## 1. Git-Status und Deployment

| Feld | Wert |
|------|------|
| main HEAD | `1163418` (audit: PR #32 Produktions-Rollout-Report) |
| PR #32 Merge-Commit | `e1a84e2` ✅ bestätigt |
| Commits nach Merge | 1 (nur Audit-Report, kein Code) |
| Vercel Deploy-ID | `BnjRRD5gwb587YnF4e57sTYsQtLL` |
| Vercel Build-Status | ✅ Erfolgreich |
| CI-Status (GitHub Actions) | ✅ 4/4 Checks grün (laut PR32-Report) |
| TypeScript (lokal) | ✅ `tsc --noEmit` — 0 Fehler |

---

## 2. React #418 / Hydration-Status

| Prüfung | Ergebnis |
|---------|----------|
| Hard Reloads (5× Desktop) | 0 React #418, 0 Hydration-Warnings |
| Console Errors | 0 |
| Console Warnings | 0 |
| Error Overlay | Nicht vorhanden ✅ |
| `colorScheme` (inline auf `<html>`) | `dark` ✅ (nicht `only dark`) |
| `colorScheme` (computed) | `dark only` (Browser-Normalisierung — korrekt) |
| `suppressHydrationWarning` auf `<html>` | ✅ vorhanden |
| `<meta name="color-scheme">` | 1× ✅ (keine Duplikate) |
| `<meta name="theme-color">` | 1× ✅ (keine Duplikate) |

**Fazit:** React #418 vollständig behoben. Keine Hydration-Mismatch-Fehler reproduzierbar.

---

## 3. Routen-Ergebnisse

### Öffentliche Routen

| Route | Status | Ergebnis |
|-------|--------|----------|
| `/` (Startseite) | 200 | ✅ |
| `/kontakt` | 200 | ✅ |
| `/termin` | 200 | ✅ |
| `/krankenfahrten` | 200 | ✅ |
| `/blog` | 200 | ✅ |
| `/impressum` | 200 | ✅ |
| `/datenschutz` | 200 | ✅ |

### Geschützte Routen (ohne Login)

| Route | Erwartung | Ergebnis | Details |
|-------|-----------|----------|---------|
| `/kunde` | 404 oder Redirect | 404 ✅ | Geschützt |
| `/engel` | 404 oder Redirect | 404 ✅ | Geschützt |
| `/admin` | Redirect zu Login | ✅ | → `/auth/login?next=%2Fadmin&error=auth_required` |
| `/mis` | Redirect zu Login | ✅ | → `/auth/login?next=%2Fmis&error=auth_required` |

### Auth-Seiten

| Route | Formular | Submit-Button | Ergebnis |
|-------|----------|---------------|----------|
| `/auth/login` | 1 Form, 2 Inputs (Email + Password) | „ANMELDEN" | ✅ |
| `/auth/register` | 1 Form, 7 Inputs | „REGISTRIEREN" | ✅ |

**Login-Redirect:** `/admin` → `/auth/login?next=/admin` ✅ korrekt

---

## 4. Supabase / Datenbank-Status

| Feld | Wert |
|------|------|
| Projekt-Status | **ACTIVE_HEALTHY** ✅ |
| Region | eu-west-1 |
| Postgres-Version | 17.6.1.063 |
| Tabellen (public) | 108 |
| RLS aktiviert | **108/108** (100%) ✅ |

### FK-Status: auth.users

| Delete-Rule | Anzahl | Tabellen |
|-------------|--------|----------|
| CASCADE | 13 | auth-intern (8), profiles, notfall_info, medikamentenplan, push_subscriptions, fcm_tokens, organization_members, account_deletion_tokens |
| SET NULL | 6 | mis_auth_log, chat_messages, kf_pricing_audit, page_views, app_settings, clients, caregivers |
| NO ACTION | **0** ✅ | — |
| RESTRICT | **0** ✅ | — |

### FK-Status: profiles

| Delete-Rule | Anzahl | Tabellen (Auswahl) |
|-------------|--------|----------|
| CASCADE | 10 | angels, angel_availability, angel_reviews, care_recipients, documents, messages (2×), mis_notifications, mis_training_records, notifications |
| SET NULL | 33 | bookings, krankenfahrten, reviews, mis_documents (2×), mis_tasks (2×), audit_logs, u.v.m. |
| NO ACTION | **0** ✅ | — |
| RESTRICT | **0** ✅ | — |

**Fazit:** 0 blockierende FKs (NO ACTION/RESTRICT) auf auth.users oder profiles. PR #29, #30, #31 erfolgreich angewendet.

---

## 5. Vercel Build-/Runtime-Logs

| Kategorie | Status |
|-----------|--------|
| Build Errors | 0 ✅ |
| Build Warnings | 6 (alle vorbestehende `@sentry/nextjs` authToken-Warnings) |
| Runtime Errors | 0 ✅ |
| Runtime Warnings | 0 ✅ |

Sentry-Warnings (vorbestehend, nicht PR-bezogen):
- „No auth token provided. Will not create release." (3×)
- „No auth token provided. Will not upload source maps." (3×)

---

## 6. Offene Punkte nach Priorität

### CRITICAL — keine

Keine kritischen Blocker identifiziert. Der DSGVO-FK-Blocker (mis_auth_log) wurde in PR #29 behoben.

### HIGH

| # | Problem | Details |
|---|---------|---------|
| H1 | **Kein `middleware.ts`** | Kein serverseitiger Route-Schutz. Auth-Guards nur client-seitig (`requireUser()`, `AdminAuthGuard`). Direkte API-Calls oder kurze Flash-of-Content möglich. |
| H2 | **Org-Fence-Lücken** | `chat_messages`, `messages`, `notifications`, `mis_ai_conversations` haben RLS, aber keine Mandantentrennung. Bei Multi-Mandant-Betrieb kritisch. |

### MEDIUM

| # | Problem | Details |
|---|---------|---------|
| M1 | **Storage-Bucket-Limits fehlen** | `file_size_limit` und `allowed_mime_types` auf allen 5 Buckets NULL. Client-Check existiert, aber serverseitig umgehbar. |
| M2 | **`clients.pflegegrad`/`care_level` Duplikat** | Zwei Spalten für denselben Wert in `clients`-Tabelle. |
| M3 | **79 FK-Spalten ohne Index** | Performance-Risiko bei wachsender Last. |
| M4 | **9 ungemergte Remote-Branches** | Aufräumen empfohlen (u.a. `origin/fix/react-418-hydration`, `origin/cursor/*`). |

### LOW

| # | Problem | Details |
|---|---------|---------|
| L1 | **pg_cron nicht aktiviert** | API-Cron-Routen als Workaround vorhanden. |
| L2 | **Sentry authToken nicht konfiguriert** | Keine Source-Maps, kein Release-Tracking. |
| L3 | **Login-Seite zeigt Admin/MIS-Buttons** | UX-Risiko — Einladung für Angreifer. |
| L4 | **Stale JWTs nach User-Löschung** | Client-Retry fängt 403 ab, aber UX-Problem. |
| L5 | **CASCADE-FKs auf profiles** | 10 Tabellen (angels, notifications, etc.) löschen Daten bei Profil-Löschung. Bewusste Entscheidung, aber für DSGVO-Audit-Trail ggf. auf SET NULL umstellen. |

---

## 7. Nächstes empfohlenes Arbeitspaket

**H1 — Next.js Middleware einführen**

`middleware.ts` im Projektroot erstellen mit serverseitigem Session-Check für `/admin/*`, `/kunde/*`, `/engel/*`, `/fahrer/*`, `/mis/*`. Redirect zu `/auth/login?next=<path>` bei fehlender Session. Dies schließt die größte verbleibende Sicherheitslücke und verhindert Flash-of-Content bei geschützten Routen.

---

## 8. Zusammenfassung

| Bereich | Status |
|---------|--------|
| **Produktion** | **GO** ✅ |
| main HEAD | `1163418` (enthält Merge-Commit `e1a84e2`) |
| React #418 | **Behoben** — 0/5 Reloads |
| Öffentliche Routen (7) | Alle 200 ✅ |
| Geschützte Routen (4) | Alle geschützt ✅ |
| Auth-Seiten (2) | Formulare funktional ✅ |
| Supabase | ACTIVE_HEALTHY, 108 Tabellen, 100% RLS |
| FK-Blocker | **0** (PR #29–#31 erfolgreich) |
| Build Errors | 0 |
| Runtime Errors | 0 |
| Offene CRITICAL | **0** |
| Offene HIGH | 2 (middleware.ts, Org-Fence) |

*Audit durchgeführt am 05.08.2026. Keine Änderungen an Code, Datenbank oder Produktion vorgenommen (außer diesem Report).*
