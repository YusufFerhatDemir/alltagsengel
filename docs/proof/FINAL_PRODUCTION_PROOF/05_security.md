# Phase 5 — Sicherheits-Beweis

**Gemessen am 30.08.2026**

## 1. Anon-Isolation

| Test | Ergebnis |
|------|----------|
| `SELECT current_org_id()` als anon | **permission denied** (PASS) |
| Alle public Tables haben RLS enabled | AE: 314/314, CM: 79/79, efy: 47/47 |

## 2. RESTRICTIVE org_fence Policies

| Produkt | Anzahl RESTRICTIVE org_fence |
|---------|------------------------------|
| Alltagsengel | 126 |
| ChairMatch | (über salons.user_id scoped) |
| efy care | (über organization_id scoped) |

## 3. SECURITY DEFINER Absicherung

Folgende Funktionen sind SECURITY DEFINER und in Production live:

| Funktion | SECDEF |
|----------|--------|
| compute_signature_hash | ✓ |
| log_arbeitszeit_korrektur | ✓ |
| prevent_locked_record_change | ✓ |
| prevent_zeitkorrektur_edit | ✓ |

REVOKE-Block in Migration vorhanden, Apply benötigt Owner-Rechte (SQL-Editor).

## 4. Precommit-Guard

`scripts/precommit-guard.sh` blockiert:

- `.env`-Dateien (außer `.env.example`)
- `node_modules/`
- Service-Account-JSON, `*.pem`, `*.p12`, `*.keystore`
- APK/AAB/IPA Build-Outputs
- Secret-Patterns im Diff: `AKIA…`, `sk_live_…`, `sk-proj-…`, `re_…` (Resend), `sb_secret_…` (Supabase), Bearer-Tokens

## 5. Committed Files Audit

| Repo | `.env` committed? | Nur `.env.example`? |
|------|-------------------|---------------------|
| Alltagsengel | NEIN | JA |
| ChairMatch | NEIN | JA |
| efy care | NEIN | JA (app/.env.example) |

## Bewertung

| Aspekt | Status |
|--------|--------|
| Anon-Isolation | **PRODUCTION VERIFIED** |
| RLS überall aktiv | **PRODUCTION VERIFIED** |
| org_fence RESTRICTIVE | **PRODUCTION VERIFIED** (AE) |
| Precommit-Guard | **TECHNICALLY VERIFIED** |
| Keine Secrets committed | **PRODUCTION VERIFIED** |
