# Velora App — Agent-Hinweise

Native App (Expo SDK 57 / React Native / TypeScript / Expo Router).

## Wichtig
- **Expo hat sich geändert.** Vor Code-Änderungen die versionierten Docs prüfen:
  https://docs.expo.dev/versions/v57.0.0/
- **Deploy:** Es gelten die Projekt-Regeln aus `/Users/work/alltagsengel/CLAUDE.md`
  (Autonomie, `./deploy.sh "…"`). Nicht direkt `git commit`/`git push`.

## Konventionen
- **Nur semantische Theme-Tokens** verwenden (`useTheme()`), keine rohen Hex-Werte
  oder Magic Numbers in Screens/Komponenten.
- **UI-Texte auf Deutsch** (siehe Projekt-CLAUDE.md).
- Neue Routen unter `src/app/` (Expo Router, dateibasiert). Wiederverwendbare UI in
  `src/components/` und über das Barrel `@/components` exportieren.
- Import-Alias: `@/*` → `src/*`.

## Verifikation
- `npm run typecheck` (tsc --noEmit)
- `npx expo export --platform web` bündelt alle Routen über Metro und deckt
  Import-/Config-Fehler auf, die ein reiner Typecheck nicht sieht.

## Backend
- Auth/DB folgen als **Supabase**-Anbindung. Der `AuthProvider` kapselt die Auth-
  Logik hinter einer stabilen API (`TODO(Supabase)`-Marker) — Screens bleiben
  unangetastet, wenn das Backend eingesetzt wird.
