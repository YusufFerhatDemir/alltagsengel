# Play Store Submission — Stand 14.04.2026

**Analogie:** Die App ist gebacken, die Zutaten sind im Ordner. Jetzt fehlt nur das Schaufenster bei Google.

## Was ist da ✓

| Item | Status |
|------|--------|
| Upload-Keystore | ✅ `android/upload-keystore.jks` vorhanden |
| `key.properties` | ✅ vorhanden |
| Alte AAB v1.0.0 | ✅ `android/app/build/outputs/bundle/release/app-release.aab` (07.04.2026) |
| minSdk 24 / targetSdk 36 | ✅ Play-konform |
| Namespace `care.alltagsengel.app` | ✅ |
| App-Icon 512×512 | ✅ `icon-512x512.jpg` |
| Feature-Grafik 1024×500 | ✅ `feature-graphic-1024x500.jpg` |
| Screenshots (5) | ✅ `app-store-screenshots/screenshot-1...5-*.png` |
| Datenschutz-URL | ✅ https://alltagsengel.care/datenschutz |
| Impressum / AGB | ✅ https://alltagsengel.care/impressum & /agb |
| Listing-Texte DE | ✅ `GOOGLE_PLAY_STORE_METADATA.md` |
| Identity verified | ✅ 08.04.2026 |
| Dev-Fee 25 $ | ✅ bezahlt 06.04.2026 |

## Was noch fehlt (Reihenfolge)

### 1. versionCode + versionName für v1.0.1 erhöhen (Phase 3)
`android/app/build.gradle`:
```groovy
versionCode 2           // vorher 1
versionName "1.0.1"     // vorher "1.0"
```

### 2. Neuen AAB bauen
```bash
cd /Users/work/alltagsengel
npm run cap:build:android
# Output: android/app/build/outputs/bundle/release/app-release.aab
```

### 3. Play Console Schritte (https://play.google.com/console)

**A) App-Eintrag erstellen (falls noch nicht geschehen)**
- App-Name: AlltagsEngel
- Standard-Sprache: Deutsch (de-DE)
- App oder Spiel: App
- Kostenlos oder kostenpflichtig: Kostenlos
- Erklärungen akzeptieren

**B) Store-Eintrag ausfüllen (Copy-Paste aus `GOOGLE_PLAY_STORE_METADATA.md`)**
- Kurzbeschreibung (max 80): *Alltagsbegleitung für Senioren — 131€/Monat über die Pflegekasse*
- Vollständige Beschreibung (4000 Zeichen-Text aus der Metadatei)
- App-Icon 512×512 hochladen
- Feature-Grafik 1024×500 hochladen
- Mindestens 2 Screenshots (wir haben 5)
- Kategorie: **Gesundheit & Fitness**
- Tags: Pflege, Senioren, Alltagsbegleitung

**C) App-Inhalte-Fragebögen (Pflicht)**
- Datenschutzerklärung: `https://alltagsengel.care/datenschutz`
- Werbung: Nein
- Zugriff auf App: unbeschränkt (kein Login-Screenshot für Google nötig → Demo-Account anbieten)
- Altersfreigabe: Fragebogen ausfüllen (Gesundheits-Content, aber keine sensiblen Diagnosen) → voraussichtlich **USK 0 / PEGI 3**
- Zielgruppe und Inhalt: 18+ (Pflegekontext) / bzw. alle Altersgruppen ohne Kinder-spezifisch
- News-App: Nein
- Covid-19-Kontakt-Tracing: Nein
- Daten-Sicherheit-Fragebogen:
  - E-Mail, Name, Telefon, Standort, Foto, Auth-Info → gesammelt
  - Verschlüsselung at rest + in transit: Ja
  - Nutzer können Daten löschen lassen: Ja (siehe Datenschutz § Löschung)
  - Daten werden an Dritte weitergegeben: Ja (Supabase, Resend, Firebase, Vercel) — als "Service Provider"

**D) Testversion → Produktion**
- Zuerst **Internen Test** (nur Team, max 100 Tester per E-Mail)
- Dann **Geschlossener Test** mit Marika/Hasan/Ali + weitere Beta-Tester
- Dann **Offener Test** oder direkt **Produktion**
- Rollout-Prozentsatz: 20 % → 50 % → 100 % (Staged Rollout)

**E) AAB hochladen**
- Produktion → Neue Version erstellen
- `app-release.aab` Drag&Drop
- Release-Notes DE (aus Metadata): Erste Veröffentlichung + care_recipients/Angehörigen-Modus
- Speichern → Überprüfen → Rollout starten

### 4. Typische Review-Dauer
3–7 Tage (bei Erstveröffentlichung oft länger: bis 2 Wochen).

## Häufige Gründe für Rejection (vorher check)

| Problem | Check |
|---------|-------|
| Demo-Account fehlt | In Play Console "Demo-Account" hinterlegen (ein Test-Kunde + ein Test-Engel) |
| Datenschutz nicht erreichbar | `curl -I https://alltagsengel.care/datenschutz` → 200 OK |
| Berechtigungen nicht erklärt | In Description und Datenschutz Kamera/Standort/Push begründen (steht schon drin ✓) |
| Metadaten inkonsistent | App-Name im Play Store ≠ im AndroidManifest → beides `AlltagsEngel` halten |
| Google Sign-In nicht korrekt | Haben wir nicht — nur E-Mail-Login → ok |
| COVID-Claim | Keine COVID-Behauptungen in App/Beschreibung → ok |

## Demo-Account für Google Review

Bei Play Console → App-Inhalte → "App-Zugriff" → Anmeldedaten für Testzwecke hinterlegen:
- Kunden-Demo: z. B. `demo.kunde@alltagsengel.care` + Passwort
- Engel-Demo: z. B. `demo.engel@alltagsengel.care` + Passwort
- Kurze Anleitung wie man reinkommt (Splash → Rollenauswahl → Login)

**→ Diese Demo-Accounts müssen wir ggf. noch in Supabase anlegen.**
