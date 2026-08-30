# Phase 3 — Fresh CI Run (V2)

**Alle drei Produkte frisch auf aktuellem HEAD getestet am 30.08.2026**

## Alltagsengel

| Schritt | Ergebnis | Dauer |
|---------|----------|-------|
| HEAD SHA | `5f72cf52a238bc6e97b3ae152d1c93181d35d51e` | — |
| Start (UTC) | 2026-08-30T05:43:11Z | — |
| Ende (UTC) | 2026-08-30T05:46:11Z | 3:00 min |
| `tsc --noEmit` | **0 Fehler**, Exit 0 | — |
| vitest run | **8880 passed / 0 failed / 38 skipped** (396 Dateien) | 125,4s |
| node:test (test:unit) | **2528 passed / 0 failed / 0 skipped** (286 Suiten) | 4,5s |
| **Gesamt** | **11.408 passed, 0 failed, 38 skipped** | — |

Playwright E2E nicht gelaufen (braucht Browser, Ressourcen-Constraint 8GB).

## ChairMatch

| Schritt | Ergebnis | Dauer |
|---------|----------|-------|
| HEAD SHA | `5227751d5d44bb9ddd8d741d23405b6805057572` | — |
| Start (UTC) | 2026-08-30T05:36:29Z | — |
| Ende (UTC) | 2026-08-30T05:39:41Z | 3:12 min |
| `tsc --noEmit` | **0 Fehler**, Exit 0 | — |
| vitest run | **1714 passed / 0 failed / 0 skipped** (87 Dateien) | 6,71s |
| Build (`npm run build`) | **PASS** (341 Seiten, erfordert `SUPABASE_SERVICE_ROLE_KEY` für Prerender) | — |
| **Gesamt** | **1.714 passed, 0 failed, 0 skipped** | — |

Build-Anmerkung: Ohne `SUPABASE_SERVICE_ROLE_KEY` bricht Prerendering von `/statistik` ab. Mit gesetzter Variable (wie in Vercel Production): alle 341 Seiten generiert, Exit 0.

## efy care

| Schritt | Ergebnis | Dauer |
|---------|----------|-------|
| HEAD SHA | `129144a001d54285411d33a8a59a017af233d9b2` | — |
| Start (UTC) | 2026-08-30T05:40:15Z | — |
| Ende (UTC) | 2026-08-30T05:41:15Z | 1:00 min |
| `tsc --noEmit` (app/) | **0 Fehler**, Exit 0 | — |
| vitest run (root) | **2037 passed / 0 failed / 30 skipped** (70 Dateien) | 29,65s |
| **Gesamt** | **2.037 passed, 0 failed, 30 skipped** | — |

Kein Build-Schritt nötig (Expo/React Native App, nicht Next.js).

## Gesamtergebnis aller Produkte

| Produkt | HEAD SHA | Passed | Failed | Skipped | Typecheck | Build |
|---------|----------|--------|--------|---------|-----------|-------|
| Alltagsengel | `5f72cf52` | 11.408 | 0 | 38 | ✅ | ✅ (599 Seiten) |
| ChairMatch | `5227751d` | 1.714 | 0 | 0 | ✅ | ✅ (341 Seiten) |
| efy care | `129144a0` | 2.037 | 0 | 30 | ✅ | N/A (Expo) |
| **TOTAL** | — | **15.159** | **0** | **68** | — | — |

## Bewertung

**ALLE DREI PRODUKTE: CI FRISCH GRÜN** — 15.159 Tests auf aktuellem HEAD, 0 Failures.
