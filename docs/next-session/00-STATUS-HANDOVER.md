# Status-Handover für neue Session

**Erstellt am:** 2026-04-18
**Zuletzt aktualisiert:** 2026-04-19 (P1-Roadmap abgeschlossen)
**Zweck:** Kontext-Übergabe an die nächste Cowork-Session, damit der neue Assistent ohne langes Einlesen direkt mitarbeiten kann.

> **Stand 2026-04-19:** Alle 4 Punkte der P1-Roadmap sind abgeschlossen und
> auf `main` gepusht. Nächste Session sollte mit dem **Dead-Code-Audit**
> starten — siehe `docs/next-session/02-prompt-deadcode-audit.md`.

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

## 4. P1-Liste — ABGESCHLOSSEN (Stand 2026-04-19)

| # | Thema | Commit | Status |
|---|-------|--------|--------|
| 4.1 | HIBP Password-Leak-Check (k-Anonymity) | `e52f263` | ✅ gepusht |
| 4.2 | Soft-Delete + 60-Tage-Grace + Widerrufs-Mail | `8d4d660` | ✅ gepusht |
| 4.3 | RLS-Policy-Matrix-Skript | `3eb46ea` | ✅ gepusht |
| 4.4 | Bundle-Size-Report + `@next/bundle-analyzer` | `fff88be` | ✅ gepusht |

**Details:**

### 4.1 HIBP Password-Leak-Check — ✅
- `lib/password-validation.ts` → `checkPasswordBreach(password)` (SHA-1 + k-Anonymity gegen `api.pwnedpasswords.com/range/`).
- Integration in `validatePasswordAsync({checkBreach})`.
- Fail-Safe: bei HIBP-Ausfall `console.warn`, User nicht blockiert.

### 4.2 Soft-Delete + 60-Tage-Grace — ✅
- Migration `20260419_soft_delete.sql` deployed (`profiles.deleted_at`, 7 RLS-Policies erweitert).
- `account_deletion_tokens`-Tabelle + Widerrufs-Link via Mail.
- Edge-Function `supabase/functions/account-hard-delete/` für pg_cron (läuft 03:00 UTC täglich, Batch 50, Cascade-Reihenfolge: notifications → messages → chat_messages → care_eligibility → documents → bookings → angels → account_deletion_tokens → profiles → auth.admin.deleteUser).

### 4.3 RLS-Policy-Matrix-Skript — ✅
- Migration `20260419_rls_matrix_rpcs.sql` deployed (Service-Role-only RPCs).
- `scripts/rls-matrix.ts` → `npm run rls:matrix` erzeugt `docs/security/RLS_MATRIX.md` + CSV.
- CI-Modus: `npm run rls:matrix:check` (exit 1 bei Drift).
- Erster Snapshot: 59 Tabellen, 156 Policies, alle RLS-aktiviert.

### 4.4 Bundle-Size-Report — ✅ (mit Follow-up)
- `@next/bundle-analyzer` installiert + konditional in `next.config.ts`.
- `npm run analyze` (Webpack-Opt-in, weil Turbopack-inkompatibel).
- `docs/performance/BUNDLE_REPORT_2026-04.md` mit Server-Bundle-Zahlen + struktureller Client-Analyse.
- **Follow-up offen (Task #9):** Client-Bundle auf Dev-Maschine lokal messen, First-Load-JS-Tabelle in Abschnitt 5.3 nachtragen. (In Sandbox nicht möglich wegen FUSE-Mount-Problem.)

---

## 4b. Nächste Session — Dead-Code-Audit

Nach P1-Abschluss ist der offizielle nächste Schritt laut Roadmap der
**Dead-Code-Audit**. Prompt liegt bereit in:

```
docs/next-session/02-prompt-deadcode-audit.md
```

Das ist eine **eigenständige neue Session** (nicht mit Implementations-Arbeit
mischen). Der Audit läuft über 4 parallele Agent-Teams (Frontend, Backend,
DB via Supabase MCP, Assets + Dependencies) und produziert Reports in
`docs/audit/DEAD_CODE_*.md` — ohne Löschungen. Löschungen folgen in einer
späteren Session nach Yusufs manueller Review.

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
