# Velora — App

> **Für Menschen. Mit Herz.**
> Native App (iOS + Android) für digitale Alltagsbegleitung & ambulante Pflege.

Dies ist das App-Grundgerüst von **Velora**, gebaut mit **Expo (SDK 57)**,
**React Native**, **TypeScript** und **Expo Router** (dateibasiertes Routing).

Konzept, rechtlicher Rahmen und Feature-Roadmap: siehe `../README.md`,
`../konzept-medikamenten-tracking.md`, `../rechtliche-recherche-ambulante-pflege.md`.

## Schnellstart

```bash
cd velora/app
npm install
npm run ios        # iOS-Simulator
npm run android    # Android-Emulator
npm run web        # Browser
```

Weitere Skripte:

```bash
npm run typecheck  # TypeScript prüfen (tsc --noEmit)
npm run lint       # Expo Lint
```

## Projektstruktur

```
app/
├── app.json                 # Expo-Konfiguration (Branding, Icons, Splash)
├── assets/images/           # Velora-Branding (Icon, Adaptive-Icon, Splash, Favicon)
└── src/
    ├── app/                 # Expo-Router-Routen (dateibasiert)
    │   ├── _layout.tsx      # Root: Provider (SafeArea, Theme, Auth) + Stack
    │   ├── index.tsx        # Einstiegs-Weiche (Login vs. Tabs)
    │   ├── (auth)/          # Nicht angemeldet
    │   │   ├── login.tsx
    │   │   └── register.tsx
    │   └── (tabs)/          # Angemeldet – Tab-Navigation
    │       ├── _layout.tsx  # 5 Tabs + Auth-Gate
    │       ├── index.tsx    # Home
    │       ├── suche.tsx
    │       ├── kalender.tsx
    │       ├── nachrichten.tsx
    │       └── profil.tsx   # inkl. Palette-Umschalter
    ├── auth/                # AuthProvider (Session, signIn/signUp/signOut)
    ├── components/          # Wiederverwendbare UI (Button, Card, TextField, …)
    ├── constants/           # Markenkonstanten (Name, Slogan, Kontakt)
    ├── lib/                 # Helfer (Validierung)
    └── theme/               # Design-System
        ├── palettes.ts      # 3 Farbpaletten (A/B/C)
        ├── theme.ts         # Tokens (Spacing, Radius, Typografie) + buildTheme
        └── ThemeProvider.tsx# Context + useTheme/usePalette
```

## Design-System

Alle Screens konsumieren ausschließlich **semantische Tokens** aus dem Theme —
keine rohen Hex-Werte oder Magic Numbers. Das hält Rebranding und einen späteren
Dark-Mode trivial.

### Drei Farbpaletten (Design-Findung)

Die App startet mit **Option A** und lässt sich zur Laufzeit umschalten
(Profil → Design). Die Auswahl wird persistiert.

| Option | Name       | Stimmung           | Primary   |
|--------|------------|--------------------|-----------|
| **A**  | Salbeigrün | Ruhig & natürlich  | `#3d6b4e` |
| **B**  | Teal       | Frisch & modern    | `#1a7a7a` |
| **C**  | Lavendel   | Sanft & würdevoll  | `#5c4a8a` |

Nach der finalen Design-Entscheidung genügt es, `DEFAULT_PALETTE` in
`src/theme/palettes.ts` zu setzen (und den Umschalter optional zu entfernen).

## Architektur-Entscheidungen

- **Expo Router** statt manueller Navigation — dateibasiert, typsichere Routen
  (`experiments.typedRoutes`).
- **Auth-Gating** an zwei Stellen: `index.tsx` (Einstieg) und `(tabs)/_layout.tsx`
  (Schutz der App-Tabs). Der `AuthProvider` ist backend-agnostisch; der Rumpf von
  `signIn`/`signUp` wird später gegen **Supabase Auth** getauscht — die öffentliche
  API bleibt stabil, Screens müssen nicht angefasst werden (siehe `TODO(Supabase)`).
- **Eigenständiges Branding** — das Velora-„V" (zwei Blattklingen) wird prozedural
  aus getönten Views gezeichnet (`components/Logo.tsx`) und passt sich damit
  automatisch der aktiven Palette an. Icons/Splash liegen als generierte PNGs vor.

## Nächste Schritte

- Supabase anbinden (Auth, PostgreSQL, RLS, Edge Functions)
- Begleiter-Matching (Standort / Verfügbarkeit / Qualifikation)
- Echtzeit-Chat (Supabase Realtime)
- Medikamenten-Tracking (Phase 2, siehe Konzept)
- Automatische Abrechnung des Entlastungsbetrags (§45b SGB XI)

---

Betreiber: **Alltagsengel UG (haftungsbeschränkt)** · Neue Mainzer Straße 66-68,
60311 Frankfurt am Main · info@alltagsengel.care
