# Phase 2 — Deployment-Wahrheit

**Gemessen am 30.08.2026 via HTTP-Requests, aktualisiert für V2**

## Alltagsengel

| Metrik | Wert |
|--------|------|
| URL | `https://alltagsengel.care/` |
| HTTP Status | **200** |
| Server | Vercel |
| Git HEAD | `5f72cf52` |
| origin/main | `5f72cf52` (identisch) |
| Deployed Commit | **UNVERIFIED** — Vercel-Header enthalten keine Commit-SHA, kein API-Zugang |
| Vercel Auto-Deploy | Aktiv (jeder Push auf main) |

## ChairMatch

| Metrik | Wert |
|--------|------|
| URL | `https://www.chairmatch.de/` |
| HTTP Status | **200** (chairmatch.de → 308 → www) |
| Server | Vercel |
| Git HEAD | `5227751d` |
| origin/main | `5227751d` (identisch) |
| Deployed Commit | **UNVERIFIED** — kein Vercel-API-Zugang |
| Vercel Auto-Deploy | Aktiv |

## efy care

| Metrik | Wert |
|--------|------|
| Typ | **Expo/React Native** (NICHT Web) |
| Auslieferung | EAS Build → App Store (ascAppId: 6787737319) / Internal Distribution |
| bundle IDs | iOS: `com.efy.care`, Android: `com.efy.care` |
| Git HEAD | `129144a0` |
| origin/main | `129144a0` (identisch) |
| Production Build | **UNVERIFIED** — kein EAS CLI Zugang, kein TestFlight/Store-Status prüfbar |
| Web-URL | **NICHT ANWENDBAR** — Native App, kein Web-Deployment |
| HTTP Test | **NICHT ANWENDBAR** |

## Commit-Match Beweis

| Produkt | Git HEAD = origin/main | Deployed Commit = HEAD | Methode |
|---------|----------------------|----------------------|---------|
| Alltagsengel | ✅ `5f72cf52` | **UNVERIFIED** | Vercel-Header ohne Commit-SHA |
| ChairMatch | ✅ `5227751d` | **UNVERIFIED** | Vercel-Header ohne Commit-SHA |
| efy care | ✅ `129144a0` | **NICHT ANWENDBAR** | Native App (kein Web-Deployment) |

**Erklärung:** Vercel Auto-Deploy ist für AE + CM aktiv (jeder Push auf main triggert Build). Aber HTTP 200 allein ist kein Commit-Beweis. Die exakte Übereinstimmung deployed Build = Git HEAD erfordert Vercel Dashboard oder API-Zugang, der nicht automatisiert verfügbar ist.

## Bewertung

| Produkt | HTTP | Commit-Match | Deploy-Status |
|---------|------|-------------|---------------|
| Alltagsengel | ✅ 200 | UNVERIFIED | **TEILWEISE** — HTTP bestätigt, Commit nicht |
| ChairMatch | ✅ 200 | UNVERIFIED | **TEILWEISE** — HTTP bestätigt, Commit nicht |
| efy care | N/A | N/A | **UNVERIFIED** — Native App, kein Deploy-Beweis |
