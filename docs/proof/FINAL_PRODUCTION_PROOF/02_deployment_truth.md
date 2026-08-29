# Phase 2 — Deployment-Wahrheit

**Gemessen am 30.08.2026 via HTTP-Requests**

## Alltagsengel

| Metrik | Wert |
|--------|------|
| URL | `https://alltagsengel.care/` |
| HTTP Status | **200** |
| Commit auf main | `e3122bf3` |
| Vercel Auto-Deploy | Aktiv (jeder Push auf main) |

## ChairMatch

| Metrik | Wert |
|--------|------|
| URL | `https://chairmatch.de/` |
| HTTP Status | **308 → 200** (Redirect auf www) |
| Commit auf main | `5227751` |
| Vercel Auto-Deploy | Aktiv |

## efy care

| Metrik | Wert |
|--------|------|
| Typ | Expo/React Native App + Website |
| Website-Deploy | Vercel (vercel.json vorhanden, buildCommand: website/build.js) |
| Custom Domain | Nicht bestätigt (efy.care DNS timeout) |
| Commit auf main | `129144a` |

## Commit-Match (Vercel Dashboard)

Vercel Dashboard ist kein API-Zugang — die exakte Commit-Übereinstimmung zwischen deploytem Build und Git HEAD ist **UNVERIFIED** (benötigt manuellen Vercel-Dashboard-Check).

## Bewertung

| Produkt | Status |
|---------|--------|
| Alltagsengel | **PRODUCTION VERIFIED** (HTTP 200) |
| ChairMatch | **PRODUCTION VERIFIED** (HTTP 200) |
| efy care | **UNVERIFIED** (kein bestätigter Production-URL) |
