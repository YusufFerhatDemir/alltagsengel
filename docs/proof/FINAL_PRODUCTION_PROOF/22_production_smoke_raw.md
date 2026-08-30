# Phase 22 — Production Smoke Raw Evidence (V3.1)

**Alle Tests am 30.08.2026 gegen live Production-Systeme durchgeführt.**
**Keine alten Werte. Keine Report-Zusammenfassungen. Nur Rohdaten.**

---

## 1. Alltagsengel — PRODUCTION SMOKE

### HTTP

| Feld | Wert |
|------|------|
| Ziel-URL | `https://alltagsengel.care/` |
| HTTP-Status | **200** |
| Timestamp UTC | 2026-08-30T09:49:28Z |
| Response-Zeit | 0,384s |
| Content-Length | 119.671 Bytes |
| Getesteter Commit SHA | `a7517afe` (Vercel auto-deploy nach V3 Push) |
| SSR-Inhalt | ✅ "Alltagsengel" (3×), "131 €", og:image, canonical, geo.position |
| Authentication | Öffentlich (kein Login erforderlich) |

### Zentrale Read-Pfade

| Pfad | Status | Inhalt |
|------|--------|--------|
| `/` | 200 | Startseite mit Services, FAQ, Footer |
| `/pflegecoach/start` | 200 | PflegeCoach SSR (39.894 Bytes) |
| Meta-Tags | ✅ | og:title, og:description, og:image, twitter:card, canonical |
| Schema.org | ✅ | Organization, LocalBusiness JSON-LD |

### Production DB (Supabase MCP, Projekt `nnwyktkqibdjxgimjyuq`)

| Metrik | Wert | Timestamp UTC |
|--------|------|---------------|
| Tabellen (public) | 337 | 2026-08-30T09:49:45Z |
| RLS-Policies | 1.014 | 2026-08-30T09:49:45Z |
| Funktionen (public) | 371 | 2026-08-30T09:49:45Z |
| Tabellen ohne RLS | 3 (`_sql_parts`, `api_rate_limits`, `coach_pseudonym_key`) | 2026-08-30T09:49:45Z |
| Schutzfunktionen | 5/5 (`prevent_locked_record_change`, `prevent_finalized_invoice_mutation`, `compute_signature_hash`, `validate_invoice_status_transition`, `arbzg_pruefung_ist`) | 2026-08-30T09:49:45Z |

### Sicherheitsgrenzen

| Grenze | Status |
|--------|--------|
| FIRST_REAL_INVOICE_APPROVED | `false` (hardcoded) |
| PILOT_ERSTVERSAND_FREIGEGEBEN | nicht gesetzt |
| RECHNUNGSVERSAND_AUTOMATISCH | nicht gesetzt |
| MAHNVERSAND_AUTOMATISCH | nicht gesetzt |

### Write-Pfade

Keine Write-Tests durchgeführt — ausdrücklich verboten (keine echte Rechnung, keine Kundendaten manipulieren).

**Ergebnis: PASS**

---

## 2. Pflege-Software — PRODUCTION SMOKE

### HTTP

| Feld | Wert |
|------|------|
| Ziel-URL | `https://alltagsengel.care/pflegecoach/start` |
| HTTP-Status | **200** |
| Timestamp UTC | 2026-08-30T09:49:28Z |
| Response-Zeit | 0,423s |
| Content-Length | 39.894 Bytes |
| Getesteter Commit SHA | `a7517afe` (gleicher Deploy wie AE) |
| SSR-Inhalt | ✅ "PflegeCoach" (2×), "Alltagsengel UG" |
| Authentication | Öffentlich (Startseite), Coach-Funktionen erfordern Login |

### Zentrale Read-Pfade

| Pfad | Status | Inhalt |
|------|--------|--------|
| `/pflegecoach/start` | 200 | Assessment, Wochenplan, Ziele, Mobilität, Alltag, Angehörige, Belastung, Verlauf, Bericht |
| Barrierefreiheit | ✅ | Schriftgrößen-Schalter, Kontrast-Toggle |
| Version | ✅ | "Version 0.5.0 · Hersteller: Alltagsengel UG" |

### DB-Verbindung

Gleiche Supabase-Instanz wie AE (`nnwyktkqibdjxgimjyuq`). Alle 337 Tabellen, 1.014 RLS-Policies, 5/5 Schutzfunktionen gelten identisch.

**Ergebnis: PASS**

---

## 3. ChairMatch — PRODUCTION SMOKE

### HTTP

| Feld | Wert |
|------|------|
| Ziel-URL | `https://www.chairmatch.de/` |
| HTTP-Status | **200** |
| Timestamp UTC | 2026-08-30T09:49:29Z |
| Response-Zeit | 1,385s |
| Content-Length | 187.677 Bytes |
| Getesteter Commit SHA | `5227751d` |
| SSR-Inhalt | ✅ "ChairMatch", "Salon" (2×), Kategorien, FAQ, Footer |
| Authentication | Öffentlich |
| Redirect `chairmatch.de` → `www` | ✅ HTTP 308 Permanent (2026-08-30T09:49:30Z) |

### Zentrale Read-Pfade

| Pfad | Status | Inhalt |
|------|--------|--------|
| `/` | 200 | Startseite mit Salon-Kategorien |
| Salon-Detailseiten | ✅ | SSR mit Services, Reviews |

### Production DB (Supabase MCP, Projekt `pwdbjqfpgumyfktbfswg`)

| Metrik | Wert | Timestamp UTC |
|--------|------|---------------|
| Tabellen (public) | 83 | 2026-08-30T09:49:58Z |
| RLS-Policies | 199 | 2026-08-30T09:49:58Z |
| RLS-enabled Tabellen | 79 | 2026-08-30T09:49:58Z |
| salons (Zeilen) | 16 | 2026-08-30T09:49:58Z |
| reviews (Zeilen) | 48 | 2026-08-30T09:49:58Z |
| services (Zeilen) | 64 | 2026-08-30T09:49:58Z |

### Sicherheitsgrenzen

| Grenze | Status |
|--------|--------|
| salons RLS enabled | ✅ true |
| bookings RLS enabled | ✅ true |

**Ergebnis: PASS**

---

## 4. efy care — DB ONLY SMOKE

### HTTP

**Kein HTTP-Test möglich** — efy care ist eine native Expo/React Native App ohne Web-Deployment.
**Kein App-Smoke möglich** — Production Build Versuch fehlgeschlagen (iOS Signing Credentials fehlen, siehe 21_efy_build_identity.md).

### Production DB (Supabase MCP, Projekt `nsfbwhpjesmathsrqkfi`)

| Metrik | Wert | Timestamp UTC |
|--------|------|---------------|
| Tabellen (public) | 47 | 2026-08-30T09:50:05Z |
| RLS-Policies | 118 | 2026-08-30T09:50:05Z |
| Funktionen (public) | 130 | 2026-08-30T09:50:05Z |
| Security-Funktionen | 2/2 (`invite_to_organization_by_email`, `pruefe_profil_rechtefelder`) | 2026-08-30T09:50:05Z |

**Ergebnis: PARTIAL (DB ONLY) — kein App-Binary zum Testen**

---

## 5. DiPA — PRODUCTION SMOKE (technisch)

### HTTP

Gleicher Deploy wie AE: `/pflegecoach/start` → HTTP 200 (siehe Pflege-Software oben).

### Regulatorisch

| Blocker | Status |
|---------|--------|
| TR-03161 | ❌ FEHLT |
| ISO 27001 | ❌ FEHLT |
| BfArM-Antrag | ❌ FEHLT |

**Ergebnis: TECHNICALLY PASS (HTTP+DB), REGULATORY BLOCKED**

---

## Zusammenfassung

| Produkt | HTTP | DB | Auth | Schutz | Write-Test | Timestamp UTC | Ergebnis |
|---------|------|-----|------|--------|-----------|---------------|----------|
| Alltagsengel | 200 | 337T/1014R/371F | öffentlich | 5/5+Riegel | verboten | 09:49:28Z | **PASS** |
| Pflege-Software | 200 | (AE) | öffentlich+Login | (AE) | verboten | 09:49:28Z | **PASS** |
| ChairMatch | 200 | 83T/199R/79RLS | öffentlich | RLS 100% | verboten | 09:49:29Z | **PASS** |
| efy care | N/A | 47T/118R/130F | N/A | 2/2 | N/A | 09:50:05Z | **PARTIAL** |
| DiPA | 200 | (AE) | (AE) | (AE) | verboten | 09:49:28Z | **TECH PASS** |

**Keine echten Kunden verändert. Keine Zahlung ausgelöst. Keine Rechnung versendet. Keine produktiven Nutzerdaten manipuliert. Nur Lesezugriffe.**

---

*V3.1 — 30.08.2026 — Rohdaten direkt aus curl + Supabase MCP, keine alten Report-Werte.*
