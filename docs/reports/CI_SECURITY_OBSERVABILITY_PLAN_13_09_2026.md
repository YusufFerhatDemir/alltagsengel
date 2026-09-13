# CI / Security / Observability — Gesamtplan

**Datum:** 13.09.2026  
**Autor:** Alltagsengel DevOps  
**Scope:** Alltagsengel (AE) · ChairMatch (CM) · efy care (EC)  
**Status:** Phase 9 — MASTER-Fortsetzung

---

## Inhaltsverzeichnis

1. [Projektübersicht](#1-projektübersicht)
2. [A — CI-Pipeline](#a--ci-pipeline)
3. [B — Security Checklist](#b--security-checklist)
4. [C — Observability](#c--observability)
5. [D — Empfehlungen (priorisiert)](#d--empfehlungen-priorisiert)

---

## 1. Projektübersicht

| Eigenschaft | Alltagsengel (AE) | ChairMatch (CM) | efy care (EC) |
|---|---|---|---|
| **Stack** | Next.js App Router, React, TS, Supabase, Tailwind | Next.js App Router, React, TS, Supabase, Tailwind | Next.js / Expo, React, TS, Supabase |
| **Repo** | `YusufFerhatDemir/alltagsengel` | `YusufFerhatDemir/chairmatch` | *(noch kein öffentliches Repo bekannt)* |
| **Sichtbarkeit** | ⚠️ PUBLIC | ⚠️ PUBLIC | privat / unklar |
| **Deploy** | Vercel (auto-deploy) | Vercel + GitHub Pages (legacy) | — |
| **Supabase-ID** | `nnwyktkqibdjxgimjyuq` | `pwdbjqfpgumyfktbfswg` | `nsfbwhpjesmathsrqkfi` |
| **Tests** | ~10.460 vitest + ~2.770 node:test | ~1.987 | ~2.696 |
| **Kritische Issues** | PII-Entfernung läuft (P0) | Fremder Supabase-Key im Code (`vlrviyrgggzhayepfmop`) | — |

---

## A — CI-Pipeline

### A.1 Pre-Commit Hooks

#### AE — Alltagsengel ✅ AKTIV

`precommit-guard.sh` ist produktiv und prüft:

- **Blockiert bei:** `.env`-Dateien (außer `.env.example`), `node_modules/`, Service-Account-Dateien (JSON/PEM/P12/Keystore), APK/AAB/IPA-Builds
- **Secret-Pattern-Scan (12 Muster):** AWS-Keys, Stripe-Live-Keys, OpenAI/Anthropic-Keys, Slack-Tokens, JWTs, GitHub PATs, Supabase-Service-Role-Keys, Resend-Keys
- **Warnung (nicht blockierend):** Schema-Drift
- **Override:** `GUARD_BYPASS=1` (nur mit expliziter User-Zustimmung)

Zusätzlich: `forbidden-strings.json` mit 15 Regeln gegen falsche Rechtsform, veraltete Beträge, tote Dokumenten-IDs, hardcodierte Supabase-Keys in HTML.

**Setup:** `npm run setup:hooks` einmal pro Clone.

#### CM — ChairMatch ❌ FEHLT

Kein Pre-Commit-Hook vorhanden. Empfehlung: `precommit-guard.sh` aus AE portieren und anpassen.

#### EC — efy care ❌ FEHLT

Kein Pre-Commit-Hook vorhanden. Gleiche Empfehlung wie CM.

---

### A.2 GitHub Actions Workflows

#### AE — Alltagsengel ✅ VORHANDEN

5 Workflows aktiv:

| Workflow | Zweck |
|---|---|
| `ci.yml` | Typecheck → Lint → Test → Build |
| `deploy-chairmatch.yml` | CM-spezifisches Deployment |
| `uptime.yml` | Uptime-Checks (Cron) |
| `zustellung-retry.yml` | Domain-spezifisch: Zustellungs-Retry-Logik |
| `workflow-engine.yml` | Automatisierte Workflow-Ausführung |

#### CM — ChairMatch ⚠️ TEILWEISE

Deployment läuft über `deploy-chairmatch.yml` im AE-Repo. Eigenständige CI fehlt.

**Empfehlung:** Eigenen `ci.yml` Workflow im CM-Repo anlegen:

```yaml
# .github/workflows/ci.yml (Vorlage)
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npx tsc --noEmit
      - run: npm run lint
      - run: npm test
      - run: npm run build
```

#### EC — efy care ❌ FEHLT

Kein GitHub Actions Workflow vorhanden. Gleiche Vorlage wie CM nutzen.

---

### A.3 Deployment-Pipeline

| Projekt | Pipeline | Status |
|---|---|---|
| **AE** | `deploy.sh` → 7 Schritte: Stale-Lock-Cleanup → Typecheck (blockierend) → precommit-guard (blockierend) → `git add -A` + commit → push (Worktree-Branches → main) → verify-push (Remote-Wahrheits-Check) → IndexNow-Ping | ✅ Produktiv |
| **CM** | Vercel auto-deploy auf `main`-Push + GitHub Pages (legacy) | ⚠️ Kein Guard |
| **EC** | Manuell / unklar | ❌ Aufzusetzen |

---

### A.4 Branch-Strategie

| Projekt | Strategie |
|---|---|
| **AE** | `main` = Production. `claude/*` und `worktree/*` Branches pushen automatisch nach `main` via `deploy.sh`. Rollback: `./scripts/rollback.sh <N> --push` (git revert, kein reset --hard). |
| **CM** | `main` = Production. Kein formalisiertes Branch-Management. |
| **EC** | Noch zu definieren. Empfehlung: AE-Modell übernehmen. |

---

## B — Security Checklist

### B.1 Repo-Sichtbarkeit

| Projekt | Aktuell | Empfehlung | Priorität |
|---|---|---|---|
| **AE** | ⚠️ PUBLIC | **→ PRIVATE setzen** — PII-Bereinigung läuft, aber Git-History enthält noch sensible Daten. Erst nach `git filter-repo` oder BFG-Bereinigung wieder öffnen (falls gewünscht). | **P0** |
| **CM** | ⚠️ PUBLIC | **→ PRIVATE setzen** — Fremder Supabase-Key im Code. Auch nach Entfernung bleibt er in der History. | **P0** |
| **EC** | vermutlich privat | Status prüfen. Wenn public → PRIVATE. | P1 |

> **Aktion erforderlich:** Yusuf muss die Sichtbarkeit im GitHub UI ändern:  
> `Repo → Settings → General → Danger Zone → Change visibility → Make private`

---

### B.2 Secrets-Management

| Prüfpunkt | AE | CM | EC |
|---|---|---|---|
| `.env.local` in `.gitignore` | ✅ | ⚠️ prüfen | ⚠️ prüfen |
| `.env*` Pattern in `.gitignore` | ✅ (außer `.env.example`) | ⚠️ prüfen | ⚠️ prüfen |
| Vercel Env Vars konfiguriert | ✅ | ✅ | — |
| Secrets im Code (Scan) | ✅ precommit-guard aktiv | ❌ Fremder Key gefunden | ⚠️ prüfen |
| Service-Account-Dateien geschützt | ✅ (.gitignore + Guard) | ⚠️ prüfen | ⚠️ prüfen |

**Regel:** Secrets gehören AUSSCHLIESSLICH in:
1. Vercel Environment Variables (Production/Preview/Development getrennt)
2. `.env.local` (lokal, NIEMALS committet)
3. Supabase Dashboard (Service-Role-Keys)

**NIEMALS:** Secrets in Code, Kommentare, Markdown-Dateien, Commit-Messages oder CI-Logs.

---

### B.3 PII-Schutz

#### AE — Alltagsengel

`.gitignore` schützt bereits:
- Persönliche Dokumente: Führungszeugnis, Personalausweis, Reisepass, Arbeitsvertrag (alle Formate: PDF, JPG, JPEG, PNG, HEIC)
- Kamera-Scans: `IMG_*.HEIC`
- Sensible Ordner: `anerkennung-hessen/`, `docs/genehmigung/`
- Firebase/Service-Account JSON

**Laufende Maßnahme:** PII wird aktiv aus Code und Datenbank entfernt (Phase 9).

#### CM + EC

PII-Schutz in `.gitignore` prüfen und AE-Muster übernehmen.

---

### B.4 Dependency Audit

```bash
# Pro Projekt ausführen:
npm audit
npm audit fix
# Bei Breaking Changes:
npm audit fix --force  # ⚠️ nur nach Review
```

| Projekt | Letzter Audit | Empfehlung |
|---|---|---|
| **AE** | Regelmäßig via CI | `npm audit` in CI-Pipeline als Warning (nicht blockierend) |
| **CM** | Unbekannt | `npm audit` einrichten |
| **EC** | Unbekannt | `npm audit` einrichten |

**GitHub Actions Ergänzung (alle Projekte):**

```yaml
- name: Security Audit
  run: npm audit --audit-level=high
  continue-on-error: true  # Warnung, kein Blocker
```

---

### B.5 OWASP Top 10 — Relevanz pro Projekt

| OWASP Kategorie | AE | CM | EC | Maßnahmen |
|---|---|---|---|---|
| A01 Broken Access Control | 🔴 Hoch | 🟡 Mittel | 🟡 Mittel | Supabase RLS, `darfAlsVerifiziertGelten() = IMMER false` (AE) |
| A02 Cryptographic Failures | 🟡 Mittel | 🟡 Mittel | 🟡 Mittel | HTTPS (Vercel), Supabase-Verschlüsselung |
| A03 Injection | 🟡 Mittel | 🟢 Niedrig | 🟢 Niedrig | Parametrisierte Queries via Supabase SDK |
| A04 Insecure Design | 🟡 Mittel | 🟢 Niedrig | 🟡 Mittel | Code-Reviews, precommit-guard |
| A05 Security Misconfiguration | 🔴 Hoch | 🔴 Hoch | 🟡 Mittel | **PUBLIC Repos!**, Env-Var-Management |
| A06 Vulnerable Components | 🟡 Mittel | 🟡 Mittel | 🟡 Mittel | npm audit, Dependabot |
| A07 Auth Failures | 🟡 Mittel | 🟢 Niedrig | 🟡 Mittel | Supabase Auth |
| A08 Data Integrity Failures | 🟡 Mittel | 🟢 Niedrig | 🟢 Niedrig | Vercel auto-deploy Verifikation |
| A09 Logging Failures | 🟡 Mittel | 🟡 Mittel | 🟡 Mittel | Siehe Abschnitt C |
| A10 SSRF | 🟢 Niedrig | 🟢 Niedrig | 🟢 Niedrig | Kein direkter Server-seitiger Fetch von User-URLs |

---

### B.6 Supabase RLS-Status

| Projekt | Supabase-ID | RLS aktiv? | Audit-Script |
|---|---|---|---|
| **AE** | `nnwyktkqibdjxgimjyuq` | ✅ Ja, `npm run audit:rls` vorhanden | `lint:rls-sicht` prüft Sichtbarkeit |
| **CM** | `pwdbjqfpgumyfktbfswg` | ⚠️ Zu prüfen | Kein Audit-Script |
| **EC** | `nsfbwhpjesmathsrqkfi` | ⚠️ Zu prüfen | Kein Audit-Script |

**Empfehlung für CM + EC:**
- Supabase Dashboard → Authentication → Policies prüfen
- Alle Tabellen mit sensiblen Daten müssen RLS aktiviert haben
- `audit:rls` Script aus AE portieren

---

### B.7 Key Rotation Schedule

| Key-Typ | Rotations-Intervall | Verantwortlich | Notizen |
|---|---|---|---|
| Supabase anon-Key | Bei Kompromittierung | Yusuf | Öffentlich sichtbar im Client — RLS schützt |
| Supabase service-role-Key | 90 Tage empfohlen | Yusuf | **NIE** im Client-Code |
| Vercel Env Vars | Bei Kompromittierung | Yusuf | Nach Rotation: Redeploy |
| Drittanbieter-API-Keys | 90 Tage empfohlen | Yusuf | Stripe, Resend, etc. |
| **CM fremder Key** | **SOFORT entfernen** | Yusuf | `vlrviyrgggzhayepfmop` — bereits 401, trotzdem aus Code + History löschen |

---

### B.8 darfAlsVerifiziertGelten() — AE-Spezifisch

```
darfAlsVerifiziertGelten() = IMMER false
```

Diese Funktion darf **unter keinen Umständen** `true` zurückgeben, solange kein rechtlich verbindliches Verifizierungsverfahren implementiert ist. Jede Änderung an dieser Funktion erfordert:

1. Explizite Genehmigung durch Yusuf
2. Rechtliche Prüfung des Verifizierungsverfahrens
3. Code-Review durch mindestens eine weitere Person

---

## C — Observability

### C.1 Logging-Strategie

#### Was loggen ✅

| Kategorie | Beispiele | Level |
|---|---|---|
| Auth-Events | Login, Logout, fehlgeschlagene Versuche | `info` / `warn` |
| API-Fehler | 4xx/5xx Responses, Timeout | `error` |
| Business-Events | Buchung erstellt, Zustellung abgeschlossen | `info` |
| Performance | Langsame Queries (>1s), große Payloads | `warn` |
| Deployment | Deploy-Start, Deploy-Erfolg, Rollback | `info` |

#### Was NICHT loggen ❌

| Kategorie | Grund |
|---|---|
| PII (Namen, Adressen, Telefonnummern) | DSGVO |
| Passwörter, Tokens, Keys | Security |
| Vollständige Request-Bodies mit Nutzerdaten | DSGVO + Storage |
| Gesundheitsdaten (efy care!) | Besonders schützenswert nach Art. 9 DSGVO |
| Session-Tokens, Cookies | Security |

#### Implementierung

```typescript
// utils/logger.ts — Beispiel
const sanitize = (data: Record<string, unknown>) => {
  const REDACT = ['password', 'token', 'key', 'secret', 'email', 'phone', 'address'];
  return Object.fromEntries(
    Object.entries(data).map(([k, v]) =>
      REDACT.some(r => k.toLowerCase().includes(r)) ? [k, '[REDACTED]'] : [k, v]
    )
  );
};
```

---

### C.2 Error Tracking

#### Empfehlung: Sentry

| Eigenschaft | Detail |
|---|---|
| **Warum Sentry** | Next.js-native Integration, Source-Maps, Session Replay |
| **KOSTEN:** | Free Tier: 5K Errors/Monat, 10K Transactions. **Team: ab 26 $/Monat** |
| **Alternative (kostenlos):** | Vercel Log Drain → eigener Endpoint, oder Supabase Edge Function als Error-Sink |

**Setup (alle drei Projekte gleich):**

```bash
npx @sentry/wizard@latest -i nextjs
```

**Wichtig bei Sentry:**
- `beforeSend`-Hook nutzen, um PII zu filtern
- Source-Maps nur in Sentry hochladen, nicht public deployen
- DSN als Vercel Env Var, nicht im Code

---

### C.3 Health Checks

| Projekt | Endpoint | Prüft |
|---|---|---|
| **AE** | `/api/health` | App läuft, Supabase erreichbar, DB-Connection |
| **CM** | `/api/health` | App läuft, Supabase erreichbar |
| **EC** | `/api/health` | App läuft, Supabase erreichbar |

**Beispiel-Implementation:**

```typescript
// app/api/health/route.ts
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const supabase = await createClient();
    const { error } = await supabase.from('_health').select('id').limit(1);
    
    return NextResponse.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      supabase: error ? 'error' : 'connected',
    }, { status: error ? 503 : 200 });
  } catch {
    return NextResponse.json({ status: 'error' }, { status: 503 });
  }
}
```

---

### C.4 Uptime Monitoring

| Option | Kosten | Features |
|---|---|---|
| **UptimeRobot** | Free: 50 Monitors, 5-Min-Intervall. **KOSTEN: Pro ab 7 $/Monat** | HTTP-Checks, Alerting, Status Page |
| **GitHub Actions Cron** | Kostenlos (in Free Tier) | AE nutzt bereits `uptime.yml` |
| **Better Uptime (betterstack.com)** | Free: 10 Monitors. **KOSTEN: ab 24 $/Monat** | Incident Management, Status Page |
| **Eigenbau via Supabase Edge Function** | Kostenlos | Cron-Trigger, Slack/E-Mail-Alert |

**Empfehlung:** UptimeRobot Free Tier für alle drei Projekte + bestehenden `uptime.yml` Workflow in AE beibehalten.

---

## D — Empfehlungen (priorisiert)

### P0 — SOFORT (diese Woche)

| # | Maßnahme | Projekt | Aufwand | Wer |
|---|---|---|---|---|
| 1 | **Repos auf PRIVATE setzen** | AE, CM | 2 Min | Yusuf (GitHub UI) |
| 2 | **Fremden CM-Key aus Code entfernen** (`vlrviyrgggzhayepfmop`) | CM | 30 Min | Agent + Yusuf |
| 3 | **Git-History bereinigen** (BFG Repo-Cleaner) | AE, CM | 1–2 Std | Agent |
| 4 | **PII-Entfernung abschließen** | AE | Läuft | Agent |

### P1 — BALD (innerhalb 2 Wochen)

| # | Maßnahme | Projekt | Aufwand | Wer |
|---|---|---|---|---|
| 5 | **GitHub Actions CI aufsetzen** (Typecheck + Lint + Test + Build) | CM, EC | 1 Std/Projekt | Agent |
| 6 | **precommit-guard.sh portieren** | CM, EC | 30 Min/Projekt | Agent |
| 7 | **npm audit durchführen und Findings fixen** | Alle | 1–2 Std | Agent |
| 8 | **Supabase RLS-Audit** für CM + EC | CM, EC | 1 Std/Projekt | Agent |
| 9 | **Health-Check-Endpoints implementieren** | CM, EC | 30 Min/Projekt | Agent |
| 10 | **Key Rotation** für alle Supabase-Projekte | Alle | 30 Min | Yusuf |

### P2 — MITTELFRISTIG (innerhalb 1 Monat)

| # | Maßnahme | Projekt | Aufwand | Kosten |
|---|---|---|---|---|
| 11 | **Sentry einrichten** | Alle | 1 Std/Projekt | Free Tier oder **26 $/Monat** (Team) |
| 12 | **UptimeRobot einrichten** | Alle | 30 Min | Free Tier oder **7 $/Monat** (Pro) |
| 13 | **Dependabot aktivieren** | AE, CM | 5 Min/Repo | Kostenlos |
| 14 | **Structured Logging** (Logger-Utility) | Alle | 2 Std | Kostenlos |
| 15 | **Status Page** (öffentlich) | AE | 1 Std | Free via UptimeRobot oder Instatus |

### P3 — NICE-TO-HAVE

| # | Maßnahme | Projekt | Aufwand |
|---|---|---|---|
| 16 | E2E-Tests in CI (Playwright) | AE | 2 Std |
| 17 | Preview-Deployments mit Kommentar im PR | Alle | 1 Std |
| 18 | Security-Headers (CSP, HSTS) in `next.config.ts` | Alle | 1 Std |
| 19 | Rate-Limiting für API-Routes | AE, EC | 2 Std |
| 20 | Automated Penetration Testing (OWASP ZAP in CI) | Alle | 4 Std |

---

## Zusammenfassung

```
┌─────────────────────────────────────────────────────┐
│  AKTUELLER SICHERHEITSSTATUS                        │
├──────────┬──────────┬──────────┬────────────────────┤
│          │    AE    │    CM    │    EC              │
├──────────┼──────────┼──────────┼────────────────────┤
│ CI       │ ✅ Gut   │ ⚠️ Lücken│ ❌ Fehlt           │
│ Security │ ⚠️ PUBLIC│ 🔴 PUBLIC│ 🟡 Prüfen         │
│          │          │ + Fremd- │                    │
│          │          │   Key    │                    │
│ Observe  │ ⚠️ Basis │ ❌ Fehlt │ ❌ Fehlt           │
│ Guards   │ ✅ Stark │ ❌ Fehlt │ ❌ Fehlt           │
└──────────┴──────────┴──────────┴────────────────────┘

Nächster Schritt: P0-Maßnahmen (Repos → PRIVATE, Keys bereinigen)
```

---

*Erstellt am 13.09.2026 — CI/Security/Observability Plan v1.0*
