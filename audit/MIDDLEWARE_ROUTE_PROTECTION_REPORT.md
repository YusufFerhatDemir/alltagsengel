# Security Audit: Serverseitiger Routenschutz mit proxy.ts

**Datum:** 2026-08-05
**Branch:** `feature/middleware-route-protection`
**Erstellt von:** Security-Arbeitspaket (automatisiert)
**Status:** GO (vorbehaltlich Vercel-Preview-Build)

---

## 1. Analyse der bestehenden Auth-Struktur

### 1.1 Supabase Auth Integration

- **Client-seitig:** `lib/supabase/client.ts` — Singleton-Client mit Triple-Storage (Cookie + localStorage + IndexedDB) für WhatsApp-Level Persistenz.
- **Server-seitig:** `lib/supabase/server.ts` — `createServerClient` aus `@supabase/ssr` v0.8.0, nutzt `cookies()` aus Next.js.
- **Admin-Client:** `lib/supabase/admin.ts` — `createClient` mit `SUPABASE_SERVICE_ROLE_KEY`, nur für serverseitige Admin-Operationen.
- **Session-Check:** `lib/supabase/require-session.ts` — Client-seitiger Retry-Mechanismus (3 Versuche, exponential backoff) für robuste Session-Validierung.

### 1.2 Rollensystem

Rollen werden in der `profiles`-Tabelle gespeichert. Bekannte Rollen:
- `admin` — Vollzugriff auf Admin-Panel und MIS
- `superadmin` — Wie admin, voller Zugriff
- `kunde` — Kunden-Bereich
- `engel` — Alltagsbegleiter-Bereich
- `fahrer` — Fahrer-Bereich (Krankenfahrten)

**Rollenquelle (Autoritätsreihenfolge):**
1. `app_metadata.role` — Nur serverseitig setzbar (Admin-API), tamper-proof
2. `profiles.role` — DB-autoritativ, durch Trigger `prevent_role_escalation` geschützt
3. `user_metadata.role` — Client-seitig editierbar, NICHT für Autorisierung vertrauenswürdig

### 1.3 Bestehende clientseitige Guards (BEIBEHALTEN als Defense-in-Depth)

| Bereich | Guard | Verhalten |
|---------|-------|-----------|
| `/admin` | `AdminAuthGuard` in `app/admin/layout.tsx` | Prüft Session + admin/superadmin Rolle, Redirect zu Login |
| `/kunde` | `requireUser()` in Seiten wie `app/kunde/home/page.tsx` | Session-Check mit Retry, Redirect zu Login |
| `/engel` | `requireUser()` in Seiten wie `app/engel/home/page.tsx` | Session-Check mit Retry, Redirect zu Login |
| `/fahrer` | `requireUser()` in Seiten wie `app/fahrer/home/page.tsx` | Session-Check mit Retry, Redirect zu Login |
| `/mis` | `MISLayoutClient.tsx` | Session-Check, kein expliziter Rollen-Guard (verlässt sich auf Admin-Layout) |

### 1.4 Bestehende proxy.ts (VOR Änderung)

Die bestehende `proxy.ts` hatte bereits:
- FAIL-CLOSED für `/admin`, `/mis` und sensitive Pfade (`/kunde/zahlungsdaten`, `/kunde/dokumente`, `/engel/dokumente`)
- FAIL-SOFT für `/kunde`, `/engel`, `/fahrer` (ließ nicht-authentifizierte Requests durch, Client-Guards übernahmen)
- Admin-Rollen-Check für `/admin` und `/mis`
- CSRF-Schutz
- Referral-Code-Handling
- Cookie-Encoding/Decoding für Base64-Session-Format

**Sicherheitslücken im vorherigen Stand:**
1. `/kunde`, `/engel`, `/fahrer` waren FAIL-SOFT → Flash-of-Content möglich
2. Kein rollenbasierter Zugriff für `/kunde`, `/engel`, `/fahrer` → Ein Engel konnte `/kunde`-Seiten aufrufen
3. `/fahrer` nur teilweise im Matcher (einzelne Pfade statt `/fahrer/:path*`)
4. Exception-Handler war FAIL-OPEN für nicht-Admin-Routen

---

## 2. Geänderte / neue Dateien

| Datei | Änderung |
|-------|----------|
| `proxy.ts` | FAIL-CLOSED für alle geschützten Routen, rollenbasierter Zugriff, vollständiger Matcher |
| `app/auth/login/page.tsx` | Liest jetzt auch `?next=` Parameter, nutzt `redirectTo` nach Login für Rücksprung |
| `__tests__/security/p0-1-admin-auth.test.ts` | Tests angepasst an neues Verhalten (Redirect zur eigenen Startseite statt Login) |
| `.gitignore` | `middleware.ts` ausgeschlossen (Next.js 16 nutzt `proxy.ts`) |

---

## 3. Implementierungsdetails

### 3.1 Next.js 16: proxy.ts statt middleware.ts

Next.js 16 hat `middleware.ts` zu `proxy.ts` umbenannt. Das Projekt verwendet bereits `proxy.ts`. Eine separate `middleware.ts` verursacht einen Build-Fehler:
> "Both middleware file and proxy file are detected. Please use proxy.ts only."

Die gesamte Routenschutz-Logik wurde daher in `proxy.ts` implementiert.

### 3.2 FAIL-CLOSED für alle geschützten Routen

**Vorher:** Nur `/admin`, `/mis` und sensitive Pfade waren FAIL-CLOSED.
**Nachher:** ALLE geschützten Bereiche (`/admin`, `/mis`, `/kunde`, `/engel`, `/fahrer`) sind FAIL-CLOSED.

```
if (!user) {
  → Redirect zu /auth/login?next=<pfad>&error=auth_required
}
```

### 3.3 Rollenbasierter Zugriff

```
ROLE_ACCESS:
  admin/superadmin → /admin, /mis, /kunde, /engel, /fahrer (alles)
  kunde            → /kunde
  engel            → /engel
  fahrer           → /fahrer
```

Bei falschem Bereich: Redirect zur eigenen Startseite (ROLE_HOME), nicht zum Login.

### 3.4 Rollenbestimmung (Sicherheit)

1. `app_metadata.role` — tamper-proof, höchste Priorität
2. `profiles.role` via DB-Query — Fallback
3. `user_metadata.role` wird NICHT verwendet (unsicher, client-seitig editierbar)

### 3.5 Öffentliche Ausnahmen

- `/fahrer/register` — Fahrer-Registrierung, muss ohne Login erreichbar sein

### 3.6 Login-Rücksprung

`app/auth/login/page.tsx` liest jetzt `?next=` zusätzlich zu `?redirectTo=`:
- Nach erfolgreichem Login: Redirect zum Zielpfad aus `next`/`redirectTo`
- Open-Redirect-Schutz: Nur relative Pfade erlaubt (`/...`), keine `//`-Pfade

### 3.7 Exception-Handling

```
catch (err) → FAIL-CLOSED für ALLE geschützten Routen
  → Redirect zu /auth/login?next=<pfad>&error=auth_required
```

### 3.8 Matcher-Konfiguration

```typescript
matcher: [
  '/admin/:path*',
  '/kunde/:path*',
  '/engel/:path*',
  '/fahrer/:path*',
  '/mis/:path*',
  '/api/:path*',
]
```

Öffentliche Seiten (/, /kontakt, /termin, /blog, /impressum, /datenschutz, etc.), Auth-Seiten (/auth/*), und statische Assets (_next/, favicon, images) sind NICHT im Matcher → werden nie blockiert.

---

## 4. Testergebnisse

### 4.1 Unit-Tests (vitest)

```
Test Files: 12 passed | 1 skipped (13)
Tests:      201 passed | 29 skipped (230)
```

Alle bestehenden Tests bestanden. Angepasste Tests in `p0-1-admin-auth.test.ts`:

| Test | Ergebnis |
|------|----------|
| Nicht angemeldeter Benutzer → Redirect von /admin | ✅ PASS |
| Nicht angemeldeter Benutzer → Redirect von /mis | ✅ PASS |
| Nicht angemeldeter Benutzer → Redirect von /kunde/zahlungsdaten | ✅ PASS |
| Kunde → kein Admin-Zugriff, Redirect zu /kunde/home | ✅ PASS |
| Engel → kein Admin-Zugriff, Redirect zu /engel/home | ✅ PASS |
| Admin (app_metadata) → Zugriff erlaubt | ✅ PASS |
| Superadmin → Zugriff erlaubt | ✅ PASS |
| Admin per DB-Fallback → Zugriff erlaubt | ✅ PASS |
| DB-Fallback fehlgeschlagen → Fail-Closed | ✅ PASS |
| CSRF Cross-Origin POST → 403 | ✅ PASS |
| CSRF Same-Origin POST → erlaubt | ✅ PASS |
| CSRF Subdomain-Origin → erlaubt | ✅ PASS |
| Middleware-Exception → Fail-Closed | ✅ PASS |

### 4.2 Typecheck (tsc --noEmit)

```
✅ Keine Fehler
```

### 4.3 Build (next build)

Build konnte in der Sandbox nicht durchgeführt werden (FUSE-Filesystem / Speicherlimitierung). Der Build wird auf Vercel beim Push automatisch durchgeführt und muss dort verifiziert werden.

### 4.4 Erwartete Vercel-Preview-Testergebnisse

| Szenario | Erwartung |
|----------|-----------|
| Anonym → /admin | Redirect zu /auth/login?next=/admin&error=auth_required |
| Anonym → /admin/dashboard | Redirect zu /auth/login?next=/admin/dashboard&error=auth_required |
| Anonym → /kunde/home | Redirect zu /auth/login?next=/kunde/home&error=auth_required |
| Anonym → /engel/home | Redirect zu /auth/login?next=/engel/home&error=auth_required |
| Anonym → /fahrer/home | Redirect zu /auth/login?next=/fahrer/home&error=auth_required |
| Anonym → /mis | Redirect zu /auth/login?next=/mis&error=auth_required |
| Anonym → / | Durchgelassen |
| Anonym → /kontakt | Durchgelassen |
| Anonym → /auth/login | Durchgelassen |
| Anonym → /auth/register | Durchgelassen |
| Anonym → /fahrer/register | Durchgelassen |
| Kunde → /admin | Redirect zu /kunde/home |
| Kunde → /engel/home | Redirect zu /kunde/home |
| Engel → /admin | Redirect zu /engel/home |
| Engel → /kunde/home | Redirect zu /engel/home |
| Fahrer → /admin | Redirect zu /fahrer/home |
| Admin → /admin | Durchgelassen |
| Admin → /mis | Durchgelassen |
| Admin → /kunde/home | Durchgelassen |
| Login + ?next=/kunde/home | Nach Login → Redirect zu /kunde/home |
| Kein Flash-of-Content | Serverseitiger Redirect, kein HTML gerendert |
| Keine Redirect-Loops | Login-Seite nicht im Matcher |

---

## 5. Verbleibende Risiken

### 5.1 FAIL-CLOSED vs. WhatsApp-Level Persistenz (UX-Trade-off)

**Risiko:** Die Triple-Storage-Strategie (Cookie + localStorage + IndexedDB) kann einen validen Refresh-Token haben, der serverseitig nicht sichtbar ist (nur im Cookie). Wenn der Cookie-JWT abgelaufen ist, aber IndexedDB/localStorage noch einen gültigen Refresh-Token hat, wird der User zum Login geschickt, obwohl er eine gültige Session hat.

**Mitigation:** Die bestehenden clientseitigen Guards (requireUser mit Retry) bleiben als Defense-in-Depth erhalten. Supabase SSR refresht den JWT automatisch über den Cookie wenn möglich. Der Refresh-Token im Cookie hat eine lange Lebensdauer (standardmäßig 1 Woche bei Supabase).

**Empfehlung:** Monitoring der Login-Redirects nach Deployment. Falls übermäßig viele Nutzer ungewollt zum Login geschickt werden, kann pro Bereich ein differenziertes FAIL-SOFT/FAIL-CLOSED-Verhalten konfiguriert werden.

### 5.2 Edge Runtime Limitierung

**Risiko:** Die Proxy-Funktion läuft auf der Edge Runtime. Nicht alle Node.js APIs sind verfügbar. Der DB-Query (profiles-Tabelle) ist ein Netzwerk-Aufruf, der die Response-Latenz erhöht.

**Mitigation:** Der DB-Query wird nur als Fallback ausgeführt, wenn `app_metadata.role` nicht gesetzt ist. Bei den meisten Nutzern ist die Rolle in `app_metadata` verfügbar.

### 5.3 Kein Build-Nachweis in der Sandbox

**Risiko:** Der `next build` konnte in der Sandbox nicht durchgeführt werden (FUSE-Filesystem / Speicher).

**Mitigation:** Typecheck und Tests sind clean. Der Build wird auf Vercel beim Push automatisch durchgeführt. Bei Build-Fehler wird das Deployment blockiert.

---

## 6. Zusammenfassung

| Kriterium | Status |
|-----------|--------|
| Typecheck (tsc --noEmit) | ✅ Clean |
| Unit-Tests (vitest) | ✅ 201/201 bestanden |
| Build (next build) | ⚠️ Sandbox-limitiert, Vercel-Build ausstehend |
| FAIL-CLOSED alle geschützten Routen | ✅ Implementiert |
| Rollenbasierter Zugriff | ✅ Implementiert |
| ?next= Rücksprung | ✅ Implementiert |
| Open-Redirect-Schutz | ✅ Implementiert |
| Keine Redirect-Loops | ✅ Login/Auth nicht im Matcher |
| Clientseitige Guards beibehalten | ✅ Nicht berührt |
| Keine DB-Änderung | ✅ |
| Keine service_role für User-Zugriffe | ✅ |
| Keine Secrets exponiert | ✅ |

**Empfehlung:** GO — nach erfolgreichem Vercel-Preview-Build und manueller Verifikation der Redirect-Szenarien auf der Preview-URL.
