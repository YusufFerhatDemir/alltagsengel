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
| Hosting | Vercel (Web), App Store + Play Store (Native) |
| Tracking | GTM + Consent Mode v2 (DSGVO-konform) |

Domain: **alltagsengel.care** · Bundle-ID: `care.alltagsengel.app`
Supabase-Projekt: `nnwyktkqibdjxgimjyuq`

---

## Projektstruktur

```
alltagsengel/
├── app/                 # Next.js App Router (Web + Admin + MIS + API)
│   ├── (Public-Routes)  # Landing, blog, faq, kontakt, impressum, agb, datenschutz
│   ├── kunde/           # Kunden-Flow (Senioren/Pflegebedürftige)
│   ├── engel/           # Engel-Flow (Alltagsbegleiter)
│   ├── fahrer/          # Krankenfahrt-Fahrer
│   ├── admin/           # Superadmin-Panel
│   ├── mis/             # Management-Informationssystem
│   └── api/             # 22 Backend API-Routes
├── components/          # Shared UI Components
├── lib/                 # Business-Logic, Supabase-Client, Utils
├── hooks/               # React Hooks (useTrackVisit, useUserLocation, …)
├── constants/           # Theme & Konstanten
├── types/               # TypeScript Type-Definitionen
├── public/              # Statische Assets (Web)
├── supabase/            # DB-Migrations + initial-setup.sql
├── android/             # Capacitor Android-Projekt
├── ios/                 # Capacitor iOS-Projekt
├── scripts/             # Build/Setup-Scripts (GTM, Company-Overview)
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
├── memory/              # Cowork-Memory (glossary, projects, people, context)
├── CLAUDE.md            # Projekt-Anweisungen für Claude
├── TASKS.md             # Aktive Aufgabenliste
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

## Status (Stand 14.04.2026)

| Plattform | Status |
|---|---|
| iOS App Store | LIVE — v1.0.0 Build 4 (18 Downloads, 20.9 % Conversion) |
| Google Play | Identity verified 08.04.2026, 25 $ Dev-Fee bezahlt — Live-Status zu bestätigen |
| Web (Vercel) | Live unter alltagsengel.care |

**Tabellen (Supabase):** `profiles` (29), `angels` (7), `bookings` (6), `krankenfahrten` (9), `care_recipients` (neu seit 13.04.2026) u.a.

---

## Nächste Schritte (offen aus Audit/Glossary)

1. **Security:** GitGuardian-Alert + Service-Role-Key-Rotation (siehe `docs/security/SECURITY_ROTATION_14042026.md`)
2. **DSGVO:** VisitorTracker-Fix (`consent === null` → nur `'accepted'`)
3. **RLS:** Public-Read-Policy auf `profiles` schließen
4. **Angehörigen-Modus:** End-to-End-Test mit `care_recipients`
5. **Play Store:** Live-Release bestätigen

---

## Konventionen

- **Sprache UI:** Deutsch
- **Sprache Doku/Commits:** Deutsch oder Türkisch
- **Routen:** Next.js Route-Groups in Klammern (z. B. `(auth)`) werden in `tsconfig` excluded
- **Branches:** `main` ist live; Feature-Branches sind willkommen
- **Was nicht in Git gehört:** alles in `.gitignore` (PII, Builds, Secrets, große Videos)
