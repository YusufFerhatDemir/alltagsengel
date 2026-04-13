# AlltagsEngel v1.0.1 — Release Notes

**Stand:** 14.04.2026

## Was ist neu

- **Angehörigen-Modus:** Familienmitglieder können jetzt Pflegebedürftige verwalten und Buchungen für sie durchführen (`care_recipients`)
- **Sicherheit verbessert:** Schärfere Row-Level-Security auf Nutzer-Profilen — private Daten wie E-Mail und Telefon sind nicht mehr öffentlich lesbar
- **Build-Fixes:** Stabilere Auth-Flows und TypeScript-Cleanups

## Versionen

| Plattform | Marketing | Build / Code |
|-----------|-----------|--------------|
| iOS | 1.0.1 | 5 |
| Android | 1.0.1 | versionCode 2 |
| Web | — | Vercel-Deploy bei `main`-Push |

## Build-Befehle

### iOS
```bash
cd /Users/work/alltagsengel
npm run cap:sync              # Next.js-Build → iOS kopieren
npx cap open ios              # Xcode öffnen
# In Xcode:
#   Product → Archive
#   Window → Organizer → Distribute App → App Store Connect
```

### Android
```bash
cd /Users/work/alltagsengel
npm run cap:build:android
# Output: android/app/build/outputs/bundle/release/app-release.aab
# Upload in Play Console
```

## Release-Notes Text (App Store Connect + Play Console, DE)

```
In dieser Version:

• Neu: Angehörigen-Modus — jetzt können Sie für Eltern oder pflegebedürftige Angehörige buchen
• Verbesserter Datenschutz auf Ihren Profildaten
• Stabilere Buchungsflows

Danke für Ihr Feedback!
```

## Pre-Flight-Check

- [ ] `npx tsc --noEmit` sauber
- [ ] `npm run build` sauber
- [ ] Auf echtem Gerät einmal durchgeklickt (Login, Buchung, Angehöriger anlegen)
- [ ] Version hochgebumpt (iOS 5 / Android 2) ✓
- [ ] Commit + Push auf `main`
- [ ] iOS archivieren + nach App Store Connect laden
- [ ] Android AAB bauen + in Play Console hochladen
