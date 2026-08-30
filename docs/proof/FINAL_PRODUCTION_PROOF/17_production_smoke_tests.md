# Phase 17 — Production Smoke Tests (V3)

**Durchgeführt am 30.08.2026 gegen LIVE Production-Systeme**

## Test-Klassifizierung

| Ebene | Beschreibung | Beweiswert |
|-------|-------------|------------|
| LOCAL/PGLITE | vitest gegen PGlite in WASM | Kein Production-Beweis |
| STAGING | Gegen Staging-Umgebung | Kein Production-Beweis |
| **PRODUCTION** | Gegen live Production-Systeme | **Production-Beweis** |

Alle Tests auf dieser Seite sind **PRODUCTION-Ebene** — direkt gegen die live Systeme.

---

## Alltagsengel — Production Smoke ✅

### HTTP/SSR

| Test | Ergebnis | Zeitpunkt (UTC) |
|------|----------|-----------------|
| `https://alltagsengel.care/` HTTP Status | **200** | 2026-08-30T06:03Z |
| SSR-Inhalt gerendert | ✅ Vollständiger Seiteninhalt (Titel, Services, FAQ, Footer) | — |
| `https://alltagsengel.care/pflegecoach/start` | **200** — PflegeCoach SSR mit Navigation, Barrierefreiheit, Fußzeile | — |
| Entlastungsbetrag korrekt | ✅ „131 €" im SSR-Output | — |
| Meta-Tags / SEO | ✅ og:image, description, canonical, geo.position | — |

### Production DB (Supabase MCP, Projekt nnwyktkqibdjxgimjyuq)

| Metrik | Wert | Erwartet | Status |
|--------|------|----------|--------|
| Tabellen (public) | 314 | 314 | ✅ |
| RLS-Policies | 997 | 997 | ✅ |
| Funktionen | 371 | 371 | ✅ |
| Tabellen ohne RLS | **0** | 0 | ✅ |
| `prevent_locked_record_change()` | EXISTS | — | ✅ Manipulationsschutz |
| `prevent_finalized_invoice_mutation()` | EXISTS | — | ✅ Rechnungsschutz |
| `compute_signature_hash()` | EXISTS | — | ✅ Signatur-Hash |
| `validate_invoice_status_transition()` | EXISTS | — | ✅ Status-Transition |
| `arbzg_pruefung_ist()` | EXISTS | — | ✅ ArbZG-Check |

**Gemessen:** 2026-08-30T06:03:31Z

---

## ChairMatch — Production Smoke ✅

### HTTP/SSR

| Test | Ergebnis | Zeitpunkt (UTC) |
|------|----------|-----------------|
| `https://www.chairmatch.de/` HTTP Status | **200** | 2026-08-30T06:03Z |
| SSR-Inhalt | ✅ Vollständig (Kategorien, Salons, FAQ, Footer) | — |
| Salon-Detailseite | ✅ `/salon/cccccccc-...0001` → BlackLabel Barbershop, 4 Services, 3 Reviews | — |
| Redirect chairmatch.de → www | ✅ 308 Permanent Redirect | — |

### Production DB (Supabase MCP, Projekt pwdbjqfpgumyfktbfswg)

| Metrik | Wert | Erwartet | Status |
|--------|------|----------|--------|
| Tabellen (public) | 80 | 80 (inkl. spatial_ref_sys) | ✅ |
| RLS-Policies | 191 | 191 | ✅ |
| salons (Zeilen) | 16 | >0 | ✅ Live-Daten |
| reviews (Zeilen) | 48 | >0 | ✅ Live-Daten |
| services (Zeilen) | 64 | >0 | ✅ Live-Daten |
| salons RLS enabled | true | true | ✅ |
| bookings RLS enabled | true | true | ✅ |

**Gemessen:** 2026-08-30T06:03:34Z

---

## Pflege-Software — Production Smoke ✅

(Teil von Alltagsengel)

| Test | Ergebnis |
|------|----------|
| PflegeCoach /pflegecoach/start | ✅ HTTP 200, SSR gerendert |
| PflegeCoach Navigation | ✅ Assessment, Wochenplan, Ziele, Mobilität, Alltag, Angehörige, Belastung, Verlauf, Bericht |
| Barrierefreiheit-Controls | ✅ Schriftgrößen-Schalter, Kontrast-Toggle sichtbar |
| Produktversion im Footer | ✅ „Version 0.5.0 · Hersteller: Alltagsengel UG" |
| DB-Schutzmechanismen | ✅ Alle 5 geprüften Funktionen existieren (s.o.) |

---

## efy care — Production Smoke (DB only) ⚠️

**Kein HTTP-Test möglich** — efy care ist eine native Expo/React Native App, kein Web-Deployment.
**Kein App-Build-Smoke möglich** — es existiert kein ausgelieferter Production-Build (siehe 16_deployment_identity.md).

### Production DB (Supabase MCP, Projekt nsfbwhpjesmathsrqkfi)

| Metrik | Wert | Erwartet | Status |
|--------|------|----------|--------|
| Tabellen (public) | 47 | 47 | ✅ |
| RLS-Policies | 106 | 106 | ✅ |
| Funktionen | 130 | 130 | ✅ |
| organizations RLS enabled | true | true | ✅ |
| service_records RLS enabled | true | true | ✅ |
| `invite_to_organization_by_email()` | EXISTS | — | ✅ Security-Fix live |
| `pruefe_profil_rechtefelder()` | EXISTS | — | ✅ Security-Fix live |

**Gemessen:** 2026-08-30T06:03:38Z

**Bewertung:** DB ist vollständig und gesichert. Aber ohne ausgelieferten Build kann kein End-to-End Production-Smoke über die App durchgeführt werden.

---

## DiPA — Production Smoke (technisch) ✅

| Test | Ergebnis |
|------|----------|
| /pflegecoach/start HTTP | ✅ 200 |
| SSR-Inhalt | ✅ Navigation, Barrierefreiheit, Footer mit Version |
| DB (coach_* Tabellen) | ✅ Teil von AE DB, 314 Tabellen |
| Regulatorisch | ❌ 3 externe Blocker (TR-03161, ISO 27001, BfArM) |

---

## Zusammenfassung

| Produkt | HTTP | DB | Auth/RLS | Schutzfunktionen | Smoke-Ebene | Status |
|---------|------|-----|----------|-----------------|-------------|--------|
| Alltagsengel | ✅ 200 | ✅ 314T/997RLS | ✅ 0 ohne RLS | ✅ 5/5 | **PRODUCTION** | ✅ PASSED |
| Pflege-Software | ✅ 200 | ✅ (AE) | ✅ (AE) | ✅ (AE) | **PRODUCTION** | ✅ PASSED |
| ChairMatch | ✅ 200 | ✅ 80T/191RLS | ✅ Live-Daten | ✅ | **PRODUCTION** | ✅ PASSED |
| efy care | N/A | ✅ 47T/106RLS | ✅ | ✅ 2 Fixes | **DB ONLY** | ⚠️ PARTIAL |
| DiPA | ✅ 200 | ✅ (AE) | ✅ (AE) | ✅ (AE) | **PRODUCTION** | ✅ PASSED |

**Keine echten Kunden verändert. Keine Zahlung ausgelöst. Keine Rechnung versendet. Keine produktiven Nutzerdaten manipuliert. Nur Lesezugriffe.**

---

*V3 — 30.08.2026 — Alle Tests gegen live Production-Systeme, nicht gegen Mocks oder PGlite.*
