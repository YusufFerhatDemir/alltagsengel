# PR #33 — Staging E2E Abnahme-Report

**Branch:** `feature/middleware-route-protection`  
**Datum:** 2026-08-06  
**Preview-URL:** `alltagsengel-ks35fpwfj-yusufferhatdemirs-projects.vercel.app`  
**Staging-DB:** Supabase Branch `rpkdwwurewpmgmemhdje`  
**Produktion:** NICHT berührt.

---

## 1. Scope

| Teil | Beschreibung | Status |
|------|-------------|--------|
| C | Cookie-Key dynamisch aus `NEXT_PUBLIC_SUPABASE_URL` ableiten, FAIL-CLOSED | ✅ Done |
| A | Vercel Preview-Env auf Staging-Branch umstellen | ✅ Done |
| E2E | Auth-Middleware End-to-End auf Staging testen | ✅ Done |

---

## 2. Teil C — Dynamischer Cookie-Key + FAIL-CLOSED

### Änderungen

- **`lib/supabase/storage-key.ts`** (neu): `extractProjectRef()` + `getSupabaseStorageKey()` + `getStorageKeyFromEnv()`. Extrahiert Projekt-Ref aus Supabase-URL, gibt `sb-{ref}-auth-token` zurück. Bei ungültiger/fehlender URL → `null` (FAIL-CLOSED).
- **`proxy.ts`**: `STORAGE_KEY` via `getStorageKeyFromEnv()` statt Hardcoding. Guard in Zeile 117: `if (!STORAGE_KEY)` → alle geschützten Routen blockiert.
- **`lib/supabase/client.ts`**: `STORAGE_KEY` via `getStorageKeyFromEnv()`, Fallback auf `'sb-INVALID-auth-token'` (garantiert kein Match → FAIL-CLOSED).

### Unit-Tests

17 Tests in `__tests__/storage-key.test.ts`, alle bestanden:

- Produktions-Ref korrekt extrahiert
- Staging-Ref korrekt extrahiert
- `null` bei: undefined, null, leer, Whitespace, ungültige URL, Nicht-Supabase-Domain, URL ohne Subdomain
- Whitespace-Toleranz
- FAIL-CLOSED für alle Fehlerfälle

---

## 3. Teil A — Vercel Preview-Env

### Konfiguration (Preview-Scope)

| Variable | Preview-Wert |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Staging-Branch-URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Staging-Branch Anon-Key |
| `SUPABASE_SERVICE_ROLE_KEY` | Dummy-Key (nur für Build) |

**Production-Variablen:** NICHT verändert.

### Build

- Deployment `UcjBCqQnt` erfolgreich (4m 2s, Status: Ready)
- Staging-Verbindung verifiziert: alle API-Requests gehen an `rpkdwwurewpmgmemhdje.supabase.co`

---

## 4. E2E Auth-Tests

### 4.1 Testkonten (Staging)

4 Testkonten erstellt und nach Tests gelöscht:

| E-Mail | Rolle (app_metadata) | UUID |
|--------|---------------------|------|
| `admin-test@staging.local` | admin | `aaaaaaaa-0001-4000-a000-000000000001` |
| `kunde-test@staging.local` | kunde | `aaaaaaaa-0002-4000-a000-000000000002` |
| `engel-test@staging.local` | engel | `aaaaaaaa-0003-4000-a000-000000000003` |
| `fahrer-test@staging.local` | fahrer | `aaaaaaaa-0004-4000-a000-000000000004` |

### 4.2 Rollen-Zugangsmatrix

Getestet: Jede Rolle gegen 5 geschützte Bereiche.

| Route | admin | kunde | engel | fahrer |
|-------|-------|-------|-------|--------|
| `/admin/home` | ✅ ACCESS | ↩️ → /kunde/home | ↩️ → /engel/home | ↩️ → /fahrer/home |
| `/kunde/home` | ✅ ACCESS | ✅ ACCESS | ↩️ → /engel/home | ↩️ → /fahrer/home |
| `/engel/home` | ✅ ACCESS | ↩️ → /kunde/home | ✅ ACCESS | ↩️ → /fahrer/home |
| `/fahrer/home` | ✅ ACCESS | ↩️ → /kunde/home | ↩️ → /engel/home | ✅ ACCESS |
| `/mis/home` | ✅ ACCESS (404)* | ↩️ → /kunde/home | ↩️ → /engel/home | ↩️ → /fahrer/home |

*\* `/mis/home` hat keine Seite (404), aber Middleware ließ admin durch — korrekt.*

**Ergebnis: 20/20 Tests bestanden.**

### 4.3 Redirect-Ziele verifiziert

- Falsche Rolle → Redirect zur **eigenen** Startseite (nicht Login) ✅
- Kein Login → Redirect zu `/auth/login?next=...&error=auth_required` ✅

### 4.4 Sicherheitstests

| Test | Ergebnis |
|------|----------|
| Kein Cookie → geschützte Route | 🔒 Redirect zu `/auth/login` ✅ |
| Garbage-Cookie (`not-a-session`) | 🔒 Redirect zu `/auth/login` ✅ |
| Ungültiger JWT im Cookie | 🔒 Redirect zu `/auth/login` ✅ |
| Public Exception `/fahrer/register` | ✅ Zugänglich ohne Auth |
| Root `/` (nicht geschützt) | ✅ Zugänglich ohne Auth |
| 5× Rapid Requests als admin | ✅ Alle 200 (Session stabil) |

### 4.5 FAIL-CLOSED

- `STORAGE_KEY = null` → alle 5 geschützten Präfixe blockiert (verifiziert via Unit-Tests + Middleware-Logik)
- Ungültige Session → kein Flash-of-Content, sofortiger Redirect

### 4.6 Cookie-Format-Kompatibilität

- Browser-Client speichert: `base64-` + `btoa(sessionJSON)`
- Middleware dekodiert: `Buffer.from(value.substring(7), 'base64')` → JSON
- `@supabase/ssr` `createServerClient` erhält dekodierte Session → `getUser()` validiert JWT serverseitig
- **Verifiziert:** Cookie gesetzt → `/admin/home` Status 200

---

## 5. Nicht getestet / Out of Scope

| Thema | Grund |
|-------|-------|
| Echte Login-UI (React-Form) | Cookie-Banner blockiert Interaktion; API-basierter Test deckt Middleware-Logik vollständig ab |
| Mobile Viewport | Middleware ist viewport-unabhängig |
| `SUPABASE_SERVICE_ROLE_KEY`-abhängige API-Routes | Preview hat Dummy-Key; diese Routes funktionieren nur mit echtem Key (Produktion) |
| Open-Redirect via `?next=` | Client-seitige Verantwortung (nicht Middleware); Login-Seite muss `next`-Parameter validieren |

---

## 6. Bereinigung

- ✅ 4 Testkonten aus Staging-DB gelöscht (verified: 0 remaining)
- ✅ Keine Testdaten in Produktions-DB erstellt
- ✅ Keine Produktions-Env-Variablen verändert

---

## 7. Fazit

**GO für PR #33 Middleware-Route-Protection.**

Die Middleware implementiert korrekte rollenbasierte Zugriffskontrolle mit FAIL-CLOSED-Verhalten. Alle Sicherheitstests bestanden. Der dynamische Cookie-Key funktioniert sowohl für Produktion als auch für Staging/Preview-Umgebungen.
