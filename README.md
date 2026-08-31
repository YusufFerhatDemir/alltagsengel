# AlltagsEngel

> Marktplatz-App: zertifizierte Alltagsbegleiter ↔ Senioren/Pflegebedürftige
> Slogan: **„Mit Herz für dich da"**

Eine Codebase, vier Oberflächen: **Web**, **Admin-Panel**, **MIS** (Management-Informationssystem) und **Native App** (iOS + Android via Capacitor).

---

## Tech-Stack

| Schicht | Technologie |
|---|---|
| Frontend | Next.js 16.2 (App Router), React 19, TypeScript |
| Native | Capacitor 8.2 (wrappt die Web-App für iOS + Android) |
| Backend | Supabase (Postgres + Auth + RLS), Next.js API-Routes |
| E-Mail | Resend |
| Push | FCM V1 (Native), VAPID (Web-Push) |
| Desktop | Tauri 2 (macOS/Windows, `npm run tauri:build`) |
| Zahlungen | Stripe (Selbstzahler), SEPA-Lastschrift + DTA/SGB-V (Kassen) |
| Hosting | Vercel (Web), App Store + Play Store (Native) |
| Tracking | GTM + Consent Mode v2 (DSGVO-konform) |

Domain: **alltagsengel.care** · Bundle-ID: `care.alltagsengel.app`
Supabase-Projekt: `nnwyktkqibdjxgimjyuq`

---

## Projektstruktur

```
alltagsengel/
├── app/                 # Next.js App Router — 364 Seiten, 444 API-Routen
│   ├── (Public-Routes)  # Landing, blog, faq, kontakt, impressum, agb, datenschutz,
│   │                    # Stadt-Landingpages (alltagsbegleitung|krankenfahrten|
│   │                    # hygienebox|engel-werden)/[stadt]
│   ├── kunde/           # Kunden-Flow (Senioren/Pflegebedürftige)
│   ├── engel/           # Engel-Flow (Alltagsbegleiter)
│   ├── angehoerige/     # Angehörigenportal (Freigabe über den Code, nicht über RLS)
│   ├── fahrer/          # Krankenfahrt-Fahrer
│   ├── pflegecoach/     # PflegeCoach (Selbstzahler-Produkt, noindex)
│   ├── admin/           # Superadmin-Panel + Pflege-/Abrechnungsmodule
│   ├── mis/             # Management-Informationssystem
│   ├── investor/        # Investor-Bereich (DE + EN, robots-disallow)
│   └── api/             # Backend API-Routen
├── components/          # Shared UI Components (73)
├── lib/                 # Business-Logic, Supabase-Client, Utils (~500 Module)
├── hooks/               # React Hooks (useTrackVisit, useUserLocation, …)
├── constants/           # Theme & Konstanten
├── types/               # TypeScript Type-Definitionen
├── public/              # Statische Assets (Web)
├── supabase/            # DB-Migrations (460) + initial-setup.sql
├── android/             # Capacitor Android-Projekt
├── ios/                 # Capacitor iOS-Projekt
├── src-tauri/           # Tauri-Desktop-Projekt
├── e2e/                 # Playwright-Specs
├── __tests__/           # vitest-Suite (`npm test`)
├── scripts/             # Lint-Gates, Live-Verifikation, Deploy-Werkzeuge
│
├── docs/                # Alle Projekt-Dokumentation
│   ├── store/           # App Store + Play Store Metadaten & Anleitungen
│   ├── security/        # Audits, DSGVO, RLS-Fixes, Key-Rotation
│   ├── growth/          # Growth-Strategien, Ads, Marketing-Texte
│   ├── releases/        # Changelogs, Reports, HTML-Dashboards
│   ├── data-room/       # Investor Data Room (EN)
│   └── data-room-de/    # Investor Data Room (DE)
│
├── marketing/           # Alle Marketing-Assets
│   ├── brochures/       # PDF-Broschüren (Engel/Kunde/Krankenfahrten DE+TR)
│   ├── videos/          # Promo-MP4s + Preview-PNGs (1080×1080 Square)
│   ├── images/          # Logos, Icons, Feature-Graphics, Screenshots
│   ├── scripts/         # Python-Generatoren (v27–v30) + Pitch-Deck-Scripts
│   ├── ads/ kampagne-6tage/ kampanya/ social-media-grafiken/ werbe-videos/
│   └── *.pptx *.docx *.xlsx
│
├── archive/             # Alte/abgelöste Strukturen (siehe archive/README.md)
│   ├── next-old/            # Alter Build-Cache (gitignored)
│   ├── video-generation/    # _clips*/, _preview*/ Zwischenstände (gitignored)
│   └── private/             # PII: Ausweise, Führerscheine, AABs (gitignored)
│
├── native/              # ABGELÖSTE Expo-App. Bleibt bewusst liegen, wird NICHT
│                        # gebaut und NICHT submittet — siehe
│                        # native/WARNUNG-NICHT-SUBMITTEN.md (Vorfall 02.07.2026).
│                        # Aus dem Typecheck ausgeschlossen (tsconfig).
├── memory/              # Cowork-Memory (glossary, projects, people, context)
├── CLAUDE.md            # Projekt-Anweisungen für Claude (Autonomie-Regel, deploy.sh)
├── TASKS.md             # Aufgabenliste — Stand April 2026, nicht mehr gepflegt
└── README.md            # ← du bist hier
```

---

## Quickstart

```bash
# Web
npm install
npm run dev                # http://localhost:3000
npm run build && npm start

# Native (Capacitor)
npm run cap:sync           # iOS
npm run cap:sync:android
npm run cap:open           # Xcode
npm run cap:open:android   # Android Studio
npm run cap:build:android  # AAB für Play Store
```

Erforderlich: `.env.local` mit Supabase-Keys (siehe `.env` als Vorlage; nichts davon committen).

---

## Status

Der technische Zustand steht **nicht hier** — er veraltet in dieser Datei
schneller, als sie gepflegt wird. Führende Quelle ist:

- `docs/reports/MASTER_HANDOFF_LATEST.md` — Gesamtstatus, offene P0/P1, letzter Track
- `docs/reports/STATUS_MATRIX_2026-08-25.md` — Modul-Matrix

| Plattform | Wo der Live-Stand steht |
|---|---|
| Web (Vercel) | alltagsengel.care — zwei Vercel-Projekte pro Commit, siehe `docs/` |
| iOS / Android | Capacitor wrappt die Live-Site; Store-Stand in `docs/store/` |

---

## Prüfen und Ausliefern

```bash
npm run typecheck          # tsc --noEmit
npm test                   # vitest (__tests__/**)
npm run test:unit          # node:test (lib/**/*.test.ts) — eigene Suite, CI fährt beide
npm run lint:forbidden     # Regressions-Pattern aus scripts/forbidden-strings.json
npm run check:schema-drift # Code-Spalten gegen das Live-Schema

./deploy.sh "Beschreibung" # einziger Weg nach main:
                           # typecheck (blockiert) → precommit-guard → commit → push → verify-push
```

`npm run setup:hooks` einmal pro Clone installiert den Pre-Commit-Hook.
Rollback: `./scripts/rollback.sh <N> --push` (revert, kein `reset --hard`).

Die vollständige Liste der Prüf- und Verifikationsläufe steht in `package.json`
unter `scripts` — u. a. `verify:geldweg`, `verify:abrechnung`, `verify:perimeter`,
`audit:rls`, `rls:matrix:check`.

---

## Konventionen

- **Sprache UI:** Deutsch
- **Sprache Doku/Commits:** Deutsch oder Türkisch
- **Routen:** Next.js Route-Groups in Klammern (z. B. `(auth)`) werden in `tsconfig` excluded
- **Branches:** `main` ist live; Feature-Branches sind willkommen
- **Was nicht in Git gehört:** alles in `.gitignore` (PII, Builds, Secrets, große Videos)
