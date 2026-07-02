# Alltagsengel — Native iOS App (Expo / React Native)

Native Neuimplementierung der Alltagsengel-App (bisher Capacitor-WebView).
Gleiche Supabase-Instanz und gleiche API-Routes wie die Web-App (`alltagsengel.care`).

## Stack

- **Expo SDK 57** + React Native, TypeScript
- **expo-router** (Tabs: Start · Budget · Pflegegrad · Gebiet · Kontakt, Auth als Modals)
- **Supabase Auth** (`@supabase/supabase-js` + AsyncStorage-Session)
- **expo-notifications** (Push vorbereitet — Token wird nach Login in `user_metadata.expo_push_token` gespeichert)
- Branding: Gold `#C9963C` auf Coal `#1A1612`, Fonts Jost + Cormorant Garamond

## Struktur

```
src/
  app/            expo-router Screens
    (tabs)/       Home, Budgetrechner, Pflegegrad-Check, Einzugsgebiet, Kontakt
    auth/         Login, Registrierung (Supabase Auth)
  components/     LeadForm + UI-Primitives (Card, GoldButton, Chip, Input …)
  constants/      theme.ts (Farben/Fonts), config.ts (Supabase, API, Kontaktdaten)
  lib/            supabase.ts, api.ts, plz.ts, notifications.ts, auth-context.tsx
```

## Entwicklung

```bash
cd native
npm install
cp .env.example .env    # Supabase-Werte eintragen (identisch mit NEXT_PUBLIC_* der Web-App)
npx expo start          # QR-Code für Expo Go / Dev-Client
npx expo run:ios        # nativer iOS-Build (Xcode nötig)
```

## iOS-Build & App Store (EAS)

Setup-Stand (geprüft): `eas-cli` global installiert, `eas.json` (Profile development/preview/production,
`appVersionSource: remote`, `autoIncrement`), `app.json` (bundleIdentifier, version, buildNumber),
`.env` mit Supabase-Werten identisch zur Web-App, `npx expo export --platform ios` läuft lokal durch.

Einmalig nötig (interaktiv, Expo- + Apple-Login):

```bash
cd native
npx eas login                            # Expo-Account
npx eas init                             # legt Projekt an, trägt projectId in app.json ein (nötig auch für Push-Tokens)
npx eas env:push production --path .env  # Supabase-Variablen hochladen (.env wird nicht committet/hochgeladen)
npx eas env:push preview --path .env
npx eas build --platform ios --profile production   # fragt beim ersten Mal nach dem Apple-Developer-Login
npx eas submit --platform ios
```

Bundle-ID ist `care.alltagsengel.app` — identisch mit der bestehenden Capacitor-App,
d. h. der Build ersetzt die WebView-App im selben App-Store-Eintrag.
In `eas.json` unter `submit.production.ios` noch `ascAppId` (App Store Connect App-ID)
und `appleTeamId` eintragen.

## Fachliche Konstanten

- Entlastungsbetrag: **131 €/Monat** (§45b SGB XI) — zentral in `src/constants/config.ts`
- PLZ-Einzugsgebiet: `src/lib/plz.ts` (identisch mit Web `components/EinzugsgebietLeaflet.tsx`)
- Pflegegrad-Check: NBA-Gewichtung identisch mit Web `components/PflegegradCheck.tsx`

Bei Änderungen an diesen Werten: **Web und Native gemeinsam aktualisieren.**
