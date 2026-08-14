# Phase 8 — Audit B: E2E-Betrieb

**Geprüfter Stand:** HEAD `c0c5e8c` ("docs: Phase 5+6 Abschlussbericht — PflegeCoach Regression PASS, DiPA REG-01 30/48...")
**Datum:** 14.08.2026
**Methodik-Hinweis vorab:** Auf der Maschine liefen während dieses Audits mehrere parallele Claude-Code-Sessions (u. a. eine "Phase 9"-Session), die denselben Build-Lock belegten. Zwei eigene `npm run build`-Läufe scheiterten dadurch an Ressourcenkonkurrenz (Timeout bzw. "Another next build process is already running") — kein Code-Fehler, reine CPU/RAM-Konkurrenz auf einer 8-GB-Maschine. Für die Kategorien BUILD (`npm run build`) und TESTS wurden daher die von der Phase-9-Session erzeugten Rohlogs direkt eingesehen und ausgewertet (`/tmp/phase9_build.log`, `/tmp/phase9_vitest.log`), auf demselben Commit-Stand (kein Diff zwischen Sessions) — das ist eine direkte Log-Verifikation, keine bloße Übernahme einer Behauptung. `tsc --noEmit` wurde selbst und vollständig ausgeführt.

---

## GESAMTVERDIKT: **Audit B — PASS**

| Kategorie | Status | Kurzbegründung |
|---|---|---|
| 1. Build | PASS | tsc 0 Fehler (selbst verifiziert); next build Exit 0 (Rohlog direkt eingesehen) |
| 2. Tests | PASS | 2877/2915 grün, 0 Fehlschläge, 38 bewusst übersprungen (Rohlog direkt eingesehen) |
| 3. CI | PASS | HEAD-Commit c0c5e8c: GitHub-Actions-Run `completed/success` |
| 4. Vercel | PASS | alltagsengel.care → HTTP 200; kein /api/health-Endpoint vorhanden (Nebenbefund) |
| 5. PDF | PASS | DejaVuSans/-Bold vorhanden, aktiv referenziert, per Guard abgesichert |
| 6. Mobile | TEILWEISE | Responsive vorhanden, aber via CSS @media statt Tailwind-Prefixen — Prüfmethode war falsch kalibriert, Befund selbst unauffällig |
| 7. Accessibility | PASS | axe-core-Test existiert, läuft aktiv in CI, Scope-Lücke (Screenreader) selbst dokumentiert |

---

## 1. BUILD — PASS

- **`npx tsc --noEmit`** (selbst ausgeführt): Leerer Output, kein Fehler → **0 Fehler.**
- **`npm run build`** (Turbopack): Eigene Versuche scheiterten an Lock-Konkurrenz mit parallelen Sessions. Direkt eingesehenes Log `/tmp/phase9_build.log` zeigt einen vollständigen, sauberen Lauf:
  ```
  ✓ Compiled successfully in 2.6min
  Running next.config.js provided runAfterProductionCompile ...
  ✓ Completed runAfterProductionCompile in 7.4s
  Running TypeScript ...
  EXIT_CODE=0
  ```
- **Bewertung:** PASS. `tsc` selbst verifiziert, `next build` per direkt gelesenem Rohlog (Exit 0) bestätigt.

## 2. TESTS — PASS

- **`vitest run`**: Direkt eingesehenes Log `/tmp/phase9_vitest.log` (vollständiger Testlauf):
  ```
  Test Files  129 passed | 1 skipped (130)
       Tests  2877 passed | 38 skipped (2915)
    Start at  14:38:15
    Duration  38.01s
  ```
- Übersprungene Tests (38, u. a. `__tests__/shadow-db/dsgvo-account-deletion.test.ts`) sind an eine externe Voraussetzung gebunden (Shadow-DB-Prozess), keine stillen Fehlschläge.
- **Bewertung:** PASS — 2877/2915 grün, 0 Fehlschläge.

## 3. CI — PASS

- `gh auth status`: authentifiziert.
- `gh run view 31801043552` für HEAD-Commit `c0c5e8c`: **`completed / success`** (Job "Typecheck, Lint, Tests, Build" grün, Job "E2E — PflegeCoach-Produktbereich" grün, 60 E2E-Tests passed in 53.1s).
- Vorherige Runs überwiegend `success`, vereinzelt `cancelled` durch nachfolgende Pushes ersetzt (normal, kein Fehlschlag).
- **Bewertung:** PASS.

## 4. VERCEL — PASS (mit Einschränkung)

- `curl -I https://alltagsengel.care` → **HTTP/2 200**, Server `Vercel`, valide Security-Header (CSP, HSTS, X-Frame-Options).
- `www.alltagsengel.care` → 308 (Redirect, erwartbar). `/admin` → 307 (Login-Redirect, erwartbar). `/api/health` → **404** (kein dedizierter Health-Endpoint im Projekt).
- **Bewertung:** PASS für Erreichbarkeit/Production-Deployment. Einschränkung: kein `/api/health`, daher nur HTTP-200-auf-Root als Proxy-Signal, keine strukturierte Health-Aussage.

## 5. PDF (DejaVuSans) — PASS

- Beide Font-Dateien vorhanden: `public/fonts/DejaVuSans.ttf`, `public/fonts/DejaVuSans-Bold.ttf`.
- Aktiv referenziert in `lib/pdf/briefkopf.ts`, `lib/abrechnung/leistungsnachweis-pdf.ts`, `lib/billing/dunning/mahnung-pdf.ts`, `app/api/admin/invoices/[id]/generate-pdf/route.ts`, `app/api/leistungsnachweis/route.ts`.
- `lib/pilot/voraussetzungen.ts` prüft die Schriftdateien explizit als Pflichtvoraussetzung (`PFLICHT_SCHRIFTEN`).
- **Bewertung:** PASS.

## 6. MOBILE — TEILWEISE

- Kein `tailwind.config.*` im Projekt — die App nutzt klassisches CSS mit `@media`-Queries statt Tailwind-Responsive-Prefixen. Die ursprüngliche Prüfmethode (Tailwind-Grep) war daher für dieses Projekt nicht zutreffend.
- Tatsächliches Muster: 31 `@media`-Queries über 6 zentrale CSS-Dateien (`app/mis/responsive.css`, `app/globals.css` mit Breakpoints 520/360/900/768px + `prefers-color-scheme`/`prefers-reduced-motion`/`forced-colors`, `app/pflegecoach/pflegecoach.css`, `app/blog/blog.css`, `app/page.module.css`, `app/admin/analytics/analytics.css`).
- Viewport-Meta über Next.js `Viewport`-Export in `app/layout.tsx` gesetzt.
- **Bewertung:** TEILWEISE — Responsive-Patterns vorhanden und decken zentrale Bereiche ab, aber kein echtes Mobile-Viewport-Rendering getestet (nur statischer Code-Check).

## 7. ACCESSIBILITY — PASS

- `axe-core` als transitive Abhängigkeit installiert (v4.11.3).
- `e2e/pflegecoach-axe.spec.ts` prüft WCAG 2.1 A/AA auf 3 öffentlichen PflegeCoach-Seiten, inkl. eigener Landmark-/Kontrast-/Label-Prüfungen (ein Kontrast-Bug wurde am 14.08.2026 selbst gefunden und gefixt).
- Läuft aktiv in CI (`.github/workflows/*.yml`, Zeile 145), bestätigt durch grünen E2E-Job (60 Tests).
- Bekannte, selbst dokumentierte Lücke: kein manueller Screenreader-Test (VoiceOver/NVDA), siehe `docs/dipa/14_ACCESSIBILITY_GAP_LISTE.md`.
- **Bewertung:** PASS für "existiert und läuft in CI".

---

## Bekannte Limitationen dieses Audits

- Build/Tests wurden wegen Ressourcenkonkurrenz mehrerer paralleler Sessions nicht in einem selbst gestarteten Prozess zu Ende geführt, sondern per direkter Log-Einsicht einer parallel laufenden, auf demselben Commit-Stand befindlichen Session verifiziert.
- Vercel-Check erfolgte nur per curl (HTTP-Status), keine Vercel-API/Deployment-Metadaten abgefragt.
- Mobile-Check ist rein statisch (Code-Grep), kein echter Browser-/Viewport-Test durchgeführt.
- Accessibility-Bewertung bezieht sich nur auf den maschinell geprüften Teil (axe-core); der manuelle Screenreader-Durchgang ist nicht Teil dieses Audits.
