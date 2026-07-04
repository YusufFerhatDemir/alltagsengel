# iOS-App Statusbericht — 4. Juli 2026

**Kernbefund: Die native iOS-App ist bereits LIVE im App Store.** Nicht „in Vorbereitung", nicht „im Review" — veröffentlicht und ladbar.

---

## 1. Ground Truth (direkt aus App Store Connect API abgefragt)

| Version | Build | Status | Datum |
|---------|-------|--------|-------|
| **v2.0.0** (nativ, Expo) | 26 | `READY_FOR_SALE`, `downloadable: true` | Release 01.–02.07.2026 |
| v1.0.1 (Capacitor WebView) | 8 | READY_FOR_SALE | 15.04.2026 |
| v1.0 (Capacitor WebView) | 4 | READY_FOR_SALE | 28.03.2026 |

- **App:** Alltagsengel · Bundle `care.alltagsengel.app` · SKU `alltagsengel` · de-DE · ASC-App-ID `6761319222`
- **Release-Typ:** `AFTER_APPROVAL`, kein Phased Release → sofort 100 % ausgerollt.
- **Kein Build im Review offen.** v2.0.0 ist der aktuelle Live-Stand.

> Der ältere `status-bericht-juli-2026.md` sagt „erfolgreich bei Apple **eingereicht**" — das ist überholt. Sie ist **freigegeben und live**.

## 2. Es gibt ZWEI native Codebases (wichtig zu wissen)

1. **`native/` — Expo SDK 57 / React Native** → **das ist die Live-App (v2.0.0).** Echte native App, expo-router, Tabs (Start/Budget/Pflegegrad/Gebiet/Kontakt), Supabase-Auth, Push vorbereitet.
2. **Root `ios/` + `android/` + `capacitor.config.json` — Capacitor WebView** → **Legacy.** War v1.0/v1.0.1. Zeigt nur `https://alltagsengel.care` in einem WebView. Wird durch die Expo-App im selben Store-Eintrag (gleiche Bundle-ID) ersetzt.

Die Frage war nach „EAS/Expo Build-Status" — der lebt korrekt in `native/`, nicht im Root. Root hat keine `eas.json`/`app.json` (nutzt Capacitor).

## 3. EAS-Pipeline-Status — vollständig funktionsfähig

- Eingeloggt als `yusufferhatdemir` (Team `@yusufferhatdemirs-team`), eas-cli 20.5.1.
- `eas.json`: Profile development/preview/production, `appVersionSource: remote`, `autoIncrement`, `credentialsSource: local`.
- **Build-Historie:** Builds 24, 25, 26 alle `finished`/`store`. Build 26 = aktueller Live-Build.
- **Submit-Config komplett:** `ascAppId 6761319222`, API-Key `AuthKey_8H62PAAUWR.p8` (in `~/Downloads`, vorhanden), Issuer-ID + Key-ID gesetzt.
- Signing: Provisioning-Profil „Alltagsengel App Store Push", gültig bis **02.07.2027**, Team `J6H5J2XVL7`.

→ Ein neuer Build + Submit ist jederzeit ohne weiteres Setup möglich.

## 4. Apple Developer Account — Organization-Umstellung

- Aktuell noch **Individual**: Store zeigt Verkäufer „**Yusuf Ferhat Demir**" statt „Alltagsengel UG".
- Umstellung auf Organization **heute beantragt** (D-U-N-S **316856461**, Formular eingereicht, Apple-Antwort ~1 Werktag).
- **Gute Nachricht:** Bei Individual→Organization bleiben Team-ID (`J6H5J2XVL7`), Apps, Zertifikate und Provisioning-Profile erhalten. Kein Neu-Build nötig — nur die Migration in ASC bestätigen, sobald Apple freischaltet.

## 5. ⚠️ Sicherheitsbefund (mittel)

- **`native/dist.p12.backup` ist in Git committet** und enthält den **privaten Schlüssel des Apple-Distributionszertifikats** (verifiziert). Passwort `expo123` steht in `native/credentials.json` (die ist gitignored — die Backup-Datei aber **nicht**).
  - Key ist AES-256/PBKDF2-verschlüsselt, Passwort schwach. Empfehlung: aus Git entfernen (`git rm --cached`), History-Purge erwägen, ggf. Zertifikat rotieren.
- Korrekt gitignored (nicht committet): `dist.p12`, `profile.mobileprovision`, `.env`, `credentials.json` ✅
- Nebenbefund (nur lokal, nicht committet): In der lokalen `git remote`-URL steckt ein GitHub-PAT im Klartext → bei Gelegenheit auf Credential-Helper/SSH umstellen.

---

## Was als Nächstes konkret passieren muss

**Blockierend / zeitkritisch — keins.** Die App ist live. Alles Folgende ist Verbesserung/Aufräumen:

1. **Org-Migration abschließen** (wartet auf Apple, ~1 Werktag): Sobald die Freigabe-Mail kommt → Migration in App Store Connect bestätigen. Danach steht „Alltagsengel UG" als Anbieter im Store.
2. **Screenshots prüfen/erneuern:** Laut altem Bericht zeigten 2 von 3 Store-Screenshots zeitweise 404-Seiten. v2.0.0 ist zwar durch den Review → aktuell unkritisch, aber für Conversion neue, saubere Screenshots hochladen.
3. **Security: `dist.p12.backup` aus Git entfernen** (siehe §5). Autonom umsetzbar.
4. **Capacitor-Legacy entscheiden:** Root `ios/`/`android/`/`capacitor.config.json` sind seit v2.0.0 tot. Entweder als „nur Android-WebView bis Android-nativ steht" markieren oder entfernen, um Verwirrung zu vermeiden.
5. **Android-Weg klären:** `native/app.json` hat Android-Config (`care.alltagsengel.app`), aber im Play Store ist noch nichts. Offene Entscheidung: Expo-Android-Build + Play-Store-Eintrag.
6. **Push scharfschalten:** expo-notifications ist verdrahtet, Token → `user_metadata.expo_push_token`. Ende-zu-Ende-Versand noch verifizieren.

**Fazit:** Das eigentliche Ziel („native iOS-App im App Store") ist **erreicht**. Es bleibt Feinschliff (Org-Anbietername, Screenshots, Aufräumen), kein Kern-Blocker.
