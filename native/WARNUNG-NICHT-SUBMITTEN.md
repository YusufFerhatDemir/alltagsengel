# ⛔️ WARNUNG: Aus diesem Ordner NIEMALS in den App Store submitten

**Vorfall vom 02.07.2026 (verifiziert am 08.07.2026 per Binary-Forensik):**

Der EAS-Cloud-Build `3a78bc6e` (Commit `fdb9ea7`) aus diesem Expo-Projekt wurde als
**v2.0.0 / Build 26** in den App-Store-Eintrag der Alltagsengel-App
(`care.alltagsengel.app`, App-ID 6761319222) submitted und ging am 04.07. live.

**Ergebnis: Die App crashte bei 100 % der Nutzer sofort beim Antippen.**

Ursache: Die damalige Repo-Root-`.easignore` enthielt un-verankerte Patterns
(`app`, `lib`, `components`, `constants`), die auch `native/src/app`,
`native/src/lib`, `native/src/constants` aus dem EAS-Upload strippten.
Das ausgelieferte Hermes-Bundle enthielt dadurch **null Routen und null
App-Code** → expo-router: „No routes found" → deterministischer Launch-Crash
auf jedem Gerät (iPhone 13 Pro und iPhone 17 Pro identisch betroffen).

## Regeln

1. **Der produktive iOS-Build ist die Capacitor-Shell in `ios/App`** —
   gebaut mit `npx cap sync ios` + `xcodebuild`. NICHT dieses Expo-Projekt.
2. Falls dieses Expo-Projekt je wieder gebaut wird: **niemals** unter der
   Bundle-ID `care.alltagsengel.app` submitten.
3. Vor jedem EAS-Build: den Upload-Inhalt prüfen
   (`eas build:inspect` bzw. das Bundle auf Routen greppen) — die
   `.easignore`-Falle ist subtil und im Dev/Simulator unsichtbar.
