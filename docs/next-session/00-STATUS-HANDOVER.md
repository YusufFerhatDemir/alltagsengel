# Status-Handover für neue Session

**Erstellt am:** 2026-04-18
**Zweck:** Kontext-Übergabe an die nächste Cowork-Session, damit der neue Assistent ohne langes Einlesen direkt mitarbeiten kann.

---

## 1. Projekt-Kontext

**App:** AlltagsEngel.care — Plattform für Alltagsbegleitung älterer Menschen in Deutschland, abgerechnet über §45b SGB XI (Entlastungsbetrag 131 €/Monat).

**Stack:** Next.js 14 App Router, Supabase (Auth + DB + Storage), Capacitor für iOS/Android, TailwindCSS, Sentry, GTM/Meta-Pixel/TikTok-Pixel, Playwright für E2E.

**Zielgruppe:** Ältere Menschen (Kunden) + Alltags-Engel (Helfer) + Admin/Superadmin. Bedeutet: extrem niedrige Technik-Hürde, lange Sessions (Nutzer sollen angemeldet bleiben), kein MFA, einfachste Sprache.

---

## 2. Projekt-Regeln (aus `CLAUDE.md`)

- **Git:** Nach jeder Änderung automatisch committen + pushen. Nicht um Bestätigung fragen.
- **Commit-Messages:** Türkisch oder Deutsch, aussagekräftig.
- **Chat-Sprache:** Türkisch mit dem Nutzer.
- **UI-Texte:** Deutsch (nicht übersetzen!).
- **User-Preference:** Lernt am besten mit Analogien.
- **Prevention-Controls:** Vor größeren Umbenennungen `npm run lint:forbidden` laufen lassen.

---

## 3. Was bereits erledigt ist

### Auth-Hardening (AUTH_AUDIT.md)
| ID | Thema | Status |
|---|---|---|
| AUTH-001 | Klartext-Passwort in E-Mails entfernt | ✅ |
| AUTH-002 | Sanitized Error-Logs | ✅ |
| AUTH-003 | Re-Auth vor Konto-Löschung + Kaskade | ✅ |
| AUTH-004 | Admin-Reset sendet Recovery-Link statt Passwort | ✅ |
| AUTH-005 | Email-Enumeration-Prävention | ✅ |
| AUTH-012 | Admin-Audit-Log (Postgres-Trigger, append-only) | ✅ |

### DSGVO
- Cookie-Consent-Banner mit expliziter IP/Standort/Drittanbieter-Nennung ✅
- VisitorTracker respektiert `consent !== 'accepted'` ✅
- Google Consent Mode v2 mit `denied`-Default ✅

### SEO / Growth
- JSON-LD LocalBusiness-Schema ✅
- OpenGraph + Twitter-Card ✅
- Sitemap + robots.txt ✅
- Sticky CTA mit 131€/Monat-Hook ✅
- `/engel/info` + `EngelInfoBanner` (Prozess-Erklärung) ✅

### Monitoring
- Sentry SDK installiert, PII-Filtering aktiv ✅
- Error-Boundary app-wide ✅

---

## 4. Was noch offen ist — P1-Liste

Reihenfolge = meine Empfehlung für die Bearbeitung:

### 4.1 HIBP Password-Leak-Check (k-Anonymity)
- **Datei:** `lib/password-validation.ts`
- **Funktion:** Neue Funktion `checkPasswordBreach(password)` — SHA-1-Hash bilden, erste 5 Hex-Zeichen an `https://api.pwnedpasswords.com/range/` senden, Response-Liste prüfen, ob voller Hash dabei ist.
- **Integration:** Optional-Parameter in `validatePasswordAsync()` hinzufügen (`checkBreach: boolean`), default `true` bei Register, optional bei Login.
- **Fail-Safe:** Wenn HIBP nicht erreichbar → nur `console.warn`, Nutzer nicht blockieren (sonst sperrt ein Drittanbieter-Ausfall die ganze App).
- **Effort:** ca. 2-3 Stunden inkl. Tests.

### 4.2 AUTH-003 Rest — Soft-Delete + 30-Tage-Grace-Period
- **Dateien:** `/app/api/user/delete/route.ts`, neue Supabase-Migration, `middleware.ts`, alle RLS-Policies.
- **Was:** Statt sofortiger Kaskade nur `profiles.deleted_at = now()` setzen. Alle RLS-Policies um `deleted_at IS NULL` erweitern. Cron-Job (Supabase Edge Function + pg_cron) für finale Löschung nach 30 Tagen.
- **Zusätzlich:** Bestätigungs-Mail mit Widerrufs-Link (Token in neue `account_deletion_tokens`-Tabelle).
- **Effort:** ca. 1-2 Tage inkl. Migration und Tests.

### 4.3 RLS-Policy-Matrix-Skript
- **Datei:** neues Skript `scripts/rls-matrix.ts` (oder Python).
- **Was:** Liest via Supabase Management API (oder `pg_policies` system table) alle Policies aller Tabellen aus, erzeugt Markdown-Tabelle `docs/security/RLS_MATRIX.md` mit Spalten: Tabelle | RLS aktiv | Policy-Name | Rolle | CMD | USING | WITH CHECK.
- **Nutzen:** Sofort-Check auf vergessene oder zu offene Policies.
- **Effort:** ca. 3-4 Stunden.

### 4.4 Bundle-Size-Report
- **Befehl:** `npm run build` mit `ANALYZE=true` (oder `next build --profile`).
- **Schon vorbereitet?** `PERF_REPORT.md` im Root existiert — prüfen, ob bereits eine Messung drin ist.
- **Zielwerte:** Landing < 150 KB, App-Routen < 200 KB First-Load-JS.
- **Bei Überschreitung:** Lazy-Load für `SocialProof`, `AppMockup`, evtl. dynamischer Import für schwere Bibliotheken (recharts, mammoth, etc.).
- **Effort:** Messung 30 Min + Optimierung 2-4 Stunden.

---

## 5. User-Action-Items (kann Claude NICHT machen)

Diese Punkte musst du (Yusuf) selbst erledigen:

- [ ] **Supabase Dashboard → JWT Expiry auf 604800s (7 Tage) setzen.** Standard ist 1 Stunde — das ist für die Zielgruppe Senioren viel zu kurz. Pfad: Supabase Dashboard → Project Settings → Auth → JWT Expiry.
- [ ] **Sentry DSN in Vercel setzen.** Ohne DSN kein Monitoring. Anleitung in `SENTRY_SETUP.md`.
- [ ] **Playwright lokal installieren + laufen lassen** (Sandbox konnte Chromium nicht ziehen): `npm run test:e2e:install && npm run test:e2e`
- [ ] **`/impressum` + `/agb` rechtlich prüfen lassen** (~300-600 € Anwaltskosten).

---

## 6. Explizit NICHT machen (vom Nutzer abgelehnt)

- ❌ MFA / 2FA — „das ist eine Alltagsbegleitungs-App, nicht ein Bankschließfach. Ältere Menschen können sich keine Authenticator-App merken."
- ❌ Session-Lock / Auto-Logout — Nutzer sollen angemeldet bleiben. Session-Lifetime soll lang sein.
- ❌ WhatsApp-Integration — „zu teuer für nichts".
- ❌ Externer Pentest (5-15 k€).
- ❌ E2E-Chat-Verschlüsselung.
- ❌ Cyber-Versicherung.

---

## 7. Wichtige Datei-Referenzen

**Audit-Dokumente (vorne lesen!):**
- `APP_AUDIT_360.md` — 360°-Übersicht mit P0/P1/P2-Priorisierung
- `AUTH_AUDIT.md` — alle Auth-Findings (AUTH-001..012)
- `HARDENING_ROADMAP.md` — 5-Phasen-Plan, Gesamt-Overview
- `RLS_AUDIT.md` — Existierende RLS-Policy-Inventur
- `PERF_REPORT.md` — vorherige Performance-Messungen
- `SENTRY_SETUP.md` — Sentry-DSN-Einrichtungsanleitung
- `docs/security/DSGVO_TODO.md` — DSGVO-Fortschritt

**Code-Dateien (kontextrelevant für P1):**
- `lib/password-validation.ts` — für HIBP-Integration
- `lib/supabase/client.ts` — Triple-Storage Session (bereits max. optimiert)
- `middleware.ts` — FAIL-SOFT/FAIL-CLOSED Pattern
- `components/CookieConsent.tsx` — aktueller DSGVO-Banner
- `components/VisitorTracker.tsx` — Consent-gated Tracking

---

## 8. Einstieg-Befehl für die neue Session

Als erste Nachricht in der neuen Session (kopieren + einfügen):

```
Lies zuerst:
1. docs/next-session/00-STATUS-HANDOVER.md (Kontext)
2. APP_AUDIT_360.md (aktueller Audit-Stand)
3. CLAUDE.md (Projekt-Regeln)

Dann arbeite nach docs/next-session/01-prompt-p1-roadmap.md. 
Fang mit HIBP an.
```
