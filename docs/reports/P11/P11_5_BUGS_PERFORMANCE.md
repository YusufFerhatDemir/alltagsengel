# P11.5 Bugs + Performance
**Datum:** 05.09.2026 | **Phase:** P11.5 (P11 Master-Auftrag)

---

## 1. Host Health Check

| Metrik | Wert | Bewertung |
|---|---|---|
| SSD frei | 17 GB (7%) | ⚠️ UNTER 30 GB SCHWELLE |
| RAM (Sandbox) | 3,8 GB total, 3,6 GB verfügbar | ✅ |
| Swap | 0 B | ✅ (kein Swapping) |

**⚠️ WARNUNG:** SSD mit nur 17 GB frei liegt UNTER der 30-GB-Schwelle. Keine Heavy-Parallel-Builds durchführen! Empfehlung: Temporäre Dateien, alte node_modules, Caches bereinigen.

---

## 2. Website-Verfügbarkeit

| Projekt | URL | Status | Antwort |
|---|---|---|---|
| Alltagsengel | alltagsengel.care | ✅ LIVE | 200 OK, vollständige Seite |
| ChairMatch | chairmatch.de | ✅ LIVE | 200 OK, vollständige Seite |
| efy care | — | ✅ ACTIVE_HEALTHY | Expo App (kein Web-Frontend) |

### Inhaltsprüfung

**Alltagsengel:**
- Entlastungsbetrag: ✅ 131€/Monat korrekt (in Meta-Description, H2, FAQ)
- Alle 3 Angebote sichtbar (Alltagsbegleitung, Pflege-Box, Krankenfahrt)
- SEO-Meta vollständig (OG, Twitter, Schema)
- GTM-Tag aktiv (GTM-NPNL3D3Q)
- Footer mit korrekter Adresse (Neue Mainzer Str. 66-68)

**ChairMatch:**
- Alle Kategorien sichtbar (Barber, Friseur, Kosmetik, etc.)
- 15 Salons gelistet mit Bewertungen
- Medical Beauty Premium-Sektion aktiv
- SEO-Meta vollständig
- 0% Provision korrekt kommuniziert

---

## 3. Git-Status

### Letzte Commits

| Projekt | Letzter Commit | Hash | Status |
|---|---|---|---|
| AE | P11.1: Security Hardening Deep Audit | f2b0e69e | ✅ |
| CM | RLS-Migration gehärtet | 5ac29c4 | ✅ |
| efy | fix: ungenutzter Import + async | e67ecca | ✅ |

### Build-Pipeline

| Projekt | Typecheck | Build | Lint | CI/CD |
|---|---|---|---|---|
| AE | `tsc --noEmit` (Turbopack) | `next build --turbopack` | ESLint | Vercel (auto-deploy) |
| CM | `tsc --noEmit` | `next build` | ESLint | Vercel (auto-deploy) |
| efy | TypeScript + Deno | Expo web | ESLint + Vitest | GitHub Actions (14 Steps) |

**Status:** Alle Projekte haben funktionierende Build-Pipelines. deploy.sh erzwingt Typecheck vor jedem Commit.

---

## 4. Datenbank-Gesundheit

### Supabase Projekt-Status (verifiziert via API)

| Projekt | Status | Region | PostgreSQL |
|---|---|---|---|
| AE (nnwyktkq...) | ✅ ACTIVE_HEALTHY | eu-west-1 | 17.6.1.063 |
| CM (pwdbjqfp...) | ✅ ACTIVE_HEALTHY | eu-west-1 | 17.6.1.063 |
| efy (nsfbwhpj...) | ✅ ACTIVE_HEALTHY | eu-west-1 | 17.6.1.141 |

### Audit-Infrastruktur (AE)

20+ Audit-/Log-Tabellen vorhanden: audit_logs, billing_audit_trail, login_rate_limits, notification_delivery_log, ops_aktivitaetslog, etc. ✅ Umfassende Nachverfolgbarkeit.

---

## 5. Bekannte Bugs / Offene Punkte

### Kritische Bugs: 0

### Nicht-blockierende Befunde (aus P11.1–P11.4 übernommen)

| # | Befund | Projekt | Priorität | Quelle |
|---|---|---|---|---|
| 1 | search_path fehlt bei DEFINER-Funktionen | AE, efy | LOW | P11.1 |
| 2 | 14 RLS-Helfer unnötig anon-callable | efy | LOW | P11.1 |
| 3 | Kein DB-Level Rate Limiting für anon INSERTs | CM | MEDIUM | P11.1 |
| 4 | 10 verwaiste Test-Bookings | AE | LOW | P11.2 |
| 5 | PITR nicht aktiviert (Dashboard) | alle | MEDIUM | P11.2 |
| 6 | MFA für Admins empfohlen | alle | MEDIUM | P11.4 |

### Performance-Risiken

| Risiko | Status | Bewertung |
|---|---|---|
| SSD < 30 GB | ⚠️ 17 GB frei | WARNUNG — keine Heavy Builds |
| DB-Größe | Minimal (Pre-Launch) | ✅ Kein Problem |
| Vercel Cold Starts | Standard (Hobby/Pro) | ✅ Akzeptabel |
| Supabase Connection Pool | Standard-Konfiguration | ✅ Ausreichend |

---

## 6. Gesamtergebnis P11.5

| Bereich | AE | CM | efy | Status |
|---|---|---|---|---|
| Website/App live | ✅ | ✅ | ✅ | GRÜN |
| Build-Pipeline | ✅ | ✅ | ✅ | GRÜN |
| Datenbank gesund | ✅ | ✅ | ✅ | GRÜN |
| Kritische Bugs | 0 | 0 | 0 | GRÜN |
| Host SSD | ⚠️ | ⚠️ | ⚠️ | GELB (17 GB) |

### Kritische Blocker: 0
### Warnungen:
1. **SSD-Speicher** — 17 GB frei, unter 30-GB-Schwelle. Keine Heavy-Parallel-Builds bis Bereinigung.

---

*Erstellt: 05.09.2026 | Methode: WebFetch + Git-Log + Supabase API + Host-Check*
