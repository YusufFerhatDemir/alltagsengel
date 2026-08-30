# Phase 16 — Deployment Identity (V3)

**Gemessen am 30.08.2026 — Vercel CLI + GitHub API + Vercel API**

## Zugangswege

| Weg | Status |
|-----|--------|
| `vercel whoami` | ✅ `yusufferhatdemir` — CLI eingeloggt |
| `gh auth status` | ✅ `YusufFerhatDemir` (repo, workflow scopes) |
| `.vercel/project.json` | ✅ in beiden Repos vorhanden |
| `VERCEL_TOKEN` env | nicht gesetzt (CLI-Token in auth.json) |
| `eas whoami` | ✅ `yusufferhatdemir` — EAS CLI eingeloggt |

---

## Alltagsengel — DEPLOY MATCH ✅

| Metrik | Wert | Quelle |
|--------|------|--------|
| Lokaler HEAD | `a36f475541b10eff71f0aa30db3f4bea5467d4d1` | `git rev-parse HEAD` |
| origin/main | `a36f475541b10eff71f0aa30db3f4bea5467d4d1` | `git ls-remote` |
| Vercel Deployment ID | `dpl_HfqwPobDsdHWUtFCzQ4HnZxvZWqx` | `vercel inspect` |
| Deployment Status | ● Ready | `vercel inspect` |
| **SHA lt. GitHub API** | `a36f475541b10eff71f0aa30db3f4bea5467d4d1` | `gh api repos/.../deployments` |
| **SHA lt. Vercel API** | `a36f475541b10eff71f0aa30db3f4bea5467d4d1` | `GET /v13/deployments/dpl_...` |
| Alias | alltagsengel.care, www.alltagsengel.care | `vercel inspect` |
| Erstellt | 2026-08-30T05:57:23Z | Vercel |

**Ergebnis:** Lokaler HEAD = origin/main = GitHub Deployment SHA = Vercel Deployment SHA = **`a36f4755`**
**Doppelt verifiziert** über zwei unabhängige Quellen (GitHub Deployments API + Vercel API).

### CI-Hinweis

Frische CI lief auf `5f72cf52` (Vorgänger-Commit). Deployed ist `a36f4755` (V2-Proof-Commit). Der Diff enthält ausschließlich Dokumentationsdateien unter `docs/proof/` — kein Quellcode, keine Tests, keine Konfiguration betroffen. CI-Ergebnis ist identisch gültig.

---

## ChairMatch — DEPLOY MATCH ✅

| Metrik | Wert | Quelle |
|--------|------|--------|
| Lokaler HEAD | `5227751d5d44bb9ddd8d741d23405b6805057572` | `git rev-parse HEAD` |
| origin/main | `5227751d5d44bb9ddd8d741d23405b6805057572` | `git ls-remote` |
| Vercel Deployment ID | `dpl_6D7RTFrxcnxV8aDt1uJMt7ifDNu4` | `vercel inspect` |
| Deployment Status | ● Ready | `vercel inspect` |
| **SHA lt. GitHub API** | `5227751d5d44bb9ddd8d741d23405b6805057572` | `gh api repos/.../deployments` |
| **SHA lt. Vercel API** | `5227751d5d44bb9ddd8d741d23405b6805057572` | `GET /v13/deployments/dpl_...` |
| Alias | www.chairmatch.de, chairmatch.de | `vercel inspect` |
| Erstellt | 2026-08-29T20:27:52Z | Vercel |

**Ergebnis:** Lokaler HEAD = origin/main = GitHub Deployment SHA = Vercel Deployment SHA = **`5227751d`**
**Doppelt verifiziert.**

CI lief exakt auf dem deployed Commit `5227751d`. Kein Versatz.

---

## efy care — KEIN DEPLOYED BUILD

| Metrik | Wert | Quelle |
|--------|------|--------|
| Lokaler HEAD | `129144a001d54285411d33a8a59a017af233d9b2` | `git rev-parse HEAD` |
| origin/main | `129144a001d54285411d33a8a59a017af233d9b2` | `git ls-remote` |
| EAS Builds gesamt | **1** (einziger Build jemals) | `eas build:list` |
| Build ID | `17ae4871-8c40-4034-811b-bb676499241d` | EAS API |
| Build-Commit | `c855bf7ee0da492b84fd7c87f054dfcdb710b075` | EAS Build-Metadaten |
| Build-Datum | 2026-07-05T17:41:16Z | EAS |
| Platform | iOS **Simulator** (`isForIosSimulator: true`) | EAS |
| Profile / Distribution | `preview` / `INTERNAL` | EAS |
| Build-Status | FINISHED (aber **abgelaufen** seit 2026-07-19) | EAS |
| Commits hinter main | **71** | `git rev-list --count` |
| OTA-Updates | **0** (keine Branches, keine Channels) | `eas branch:list` |
| Store-Einreichung | **Keine** (Simulator-Build nicht einreichbar) | Logik |

**Ergebnis:** Es existiert **kein ausgelieferter Production-Build** der efy care App.

Der einzige jemals erstellte Build ist ein interner iOS-Simulator-Preview-Build vom 5. Juli 2026, 71 Commits hinter aktuellem main, seit 6 Wochen abgelaufen. Kein Store-Submit, kein OTA-Channel, kein Production-Build.

Die gesamte seit Juli entwickelte Funktionalität (inkl. Security-Migrationen, Timezone-Fix, Einladungsweg) existiert **ausschließlich im Repository und in der Production-DB**, nicht in einem ausgelieferten App-Binary.

**App Store Connect:** ascAppId `6787737319` ist konfiguriert (Team J6H5J2XVL7), aber kein Build wurde eingereicht.

---

## Beweis-Zusammenfassung

| Produkt | Lokaler HEAD | origin/main | Deployed SHA | Match | Methode |
|---------|-------------|-------------|-------------|-------|---------|
| Alltagsengel | `a36f4755` | `a36f4755` | `a36f4755` | **✅ JA** | Vercel API + GitHub API |
| ChairMatch | `5227751d` | `5227751d` | `5227751d` | **✅ JA** | Vercel API + GitHub API |
| efy care | `129144a0` | `129144a0` | KEINER | **❌ KEIN BUILD** | EAS CLI |

---

*V3 — 30.08.2026 — Rohe CLI-Ausgaben als Beweis, keine Annahmen.*
