# AlltagsEngel — Apple App Store Anleitung

**Stand:** 23. März 2026
**Ziel:** App Store Einreichung am 25. März 2026

---

## Status-Übersicht: Was ist bereits fertig?

| Bereich | Status |
|---------|--------|
| Capacitor iOS-Projekt | Fertig |
| App-Icon 1024x1024 | Fertig |
| Datenschutzerklärung | Fertig (alltagsengel.care/datenschutz) |
| Impressum | Fertig (alltagsengel.care/impressum) |
| AGB | Fertig (alltagsengel.care/agb) |
| PWA-Manifest | Fertig |
| Service Worker & Offline-Modus | Fertig |
| Push-Benachrichtigungen | Fertig |
| Info.plist (Kamera, Fotos, Standort) | Fertig |
| Verschlüsselungserklärung | Fertig (keine Verschlüsselung) |

---

## Schritt 1: Apple Developer Account erstellen (HEUTE!)

Apple braucht **24–48 Stunden** um den Account zu verifizieren. Deshalb HEUTE anmelden!

### 1.1 Apple-ID erstellen (falls noch keine vorhanden)
1. Gehe zu: **https://appleid.apple.com**
2. Klicke auf **"Apple-ID erstellen"**
3. Verwende deine geschäftliche E-Mail: **info@alltagsengel.de** (oder deine bevorzugte E-Mail)
4. Fülle alle Felder aus (Name, Geburtsdatum, Passwort)
5. E-Mail-Adresse bestätigen

### 1.2 Apple Developer Program beitreten
1. Gehe zu: **https://developer.apple.com/programs/**
2. Klicke auf **"Enroll"** (Registrieren)
3. Melde dich mit deiner Apple-ID an
4. **Wichtig — Kontotyp wählen:**
   - **"Organization"** (Unternehmen) — empfohlen für Alltagsengel UG
   - Dafür brauchst du eine **D-U-N-S-Nummer** (kostenlos, siehe 1.3)
   - ALTERNATIV: **"Individual"** (Einzelperson) — geht sofort, aber im App Store steht dann dein Name statt "Alltagsengel UG"
5. **Kosten:** 99 USD/Jahr (ca. 92 EUR)
6. Bezahlung per Kreditkarte oder PayPal

### 1.3 D-U-N-S-Nummer (nur für "Organization")
- Prüfe ob ihr bereits eine habt: **https://developer.apple.com/enroll/duns-lookup/**
- Firmenname: **Alltagsengel UG (haftungsbeschränkt)**
- Adresse: **Schillerstraße 31, 60313 Frankfurt am Main**
- Falls keine vorhanden: Apple beantragt sie für euch (dauert 5–14 Tage!)
- **TIPP:** Als "Individual" anmelden geht schneller. Später auf "Organization" umstellen.

### 1.4 Schnellster Weg (Empfehlung)
1. **Heute:** Als **Individual** anmelden (99 USD zahlen)
2. Account wird in **24–48 Stunden** aktiviert
3. App sofort einreichen
4. Später auf "Organization" umstellen wenn D-U-N-S da ist

---

## Schritt 2: Xcode vorbereiten (auf deinem Mac)

### 2.1 Xcode installieren
1. Öffne den **Mac App Store**
2. Suche nach **"Xcode"**
3. Installieren (ca. 12 GB — dauert etwas!)
4. Nach Installation: Xcode öffnen und Lizenzbedingungen akzeptieren

### 2.2 Apple Developer Account in Xcode anmelden
1. Öffne **Xcode**
2. Gehe zu **Xcode → Settings → Accounts** (Cmd + ,)
3. Klicke auf **"+"** unten links
4. Wähle **"Apple ID"**
5. Melde dich mit deiner Apple Developer Apple-ID an

---

## Schritt 3: iOS-Build erstellen

### 3.1 Projekt synchronisieren
Öffne das **Terminal** auf deinem Mac und führe aus:

```bash
cd ~/alltagsengel
npm run build
npx cap sync ios
npx cap open ios
```

### 3.2 In Xcode konfigurieren
1. Xcode öffnet sich automatisch mit dem Projekt
2. Klicke links auf **"App"** (das Projekt)
3. Unter **"Signing & Capabilities"**:
   - Haken bei **"Automatically manage signing"**
   - **Team:** Wähle deinen Developer Account
   - **Bundle Identifier:** `care.alltagsengel.app`
4. Unter **"General"**:
   - **Display Name:** `AlltagsEngel`
   - **Version:** `1.0.0`
   - **Build:** `1`
   - **Deployment Target:** `16.0` (empfohlen)

### 3.3 App testen
1. Schließe dein **iPhone per USB** an den Mac an
2. Wähle oben in Xcode dein iPhone als Zielgerät
3. Klicke auf **▶ (Play)** zum Testen
4. Falls "Untrusted Developer" auf dem iPhone erscheint:
   - iPhone → **Einstellungen → Allgemein → VPN & Geräteverwaltung**
   - Dein Entwicklerprofil antippen → **Vertrauen**

### 3.4 Archive erstellen (für App Store)
1. Wähle oben als Zielgerät: **"Any iOS Device (arm64)"**
2. Gehe zu **Product → Archive**
3. Warte bis der Build fertig ist (2–5 Minuten)
4. Das **Organizer-Fenster** öffnet sich automatisch
5. Klicke auf **"Distribute App"**
6. Wähle **"App Store Connect"**
7. Klicke auf **"Upload"**
8. Warte bis der Upload abgeschlossen ist

---

## Schritt 4: App Store Connect einrichten

### 4.1 Neue App anlegen
1. Gehe zu: **https://appstoreconnect.apple.com**
2. Melde dich mit deiner Apple-ID an
3. Klicke auf **"Meine Apps"** → **"+"** → **"Neue App"**
4. Fülle aus:
   - **Plattform:** iOS
   - **Name:** `AlltagsEngel — Alltagsbegleitung`
   - **Primäre Sprache:** Deutsch
   - **Bundle-ID:** `care.alltagsengel.app`
   - **SKU:** `alltagsengel-ios-v1`

### 4.2 App-Informationen ausfüllen

#### Kategorie
- **Primär:** Gesundheit und Fitness
- **Sekundär:** Lifestyle

#### Altersfreigabe
- Keine anstößigen Inhalte → **4+**

#### Datenschutzrichtlinie-URL
```
https://alltagsengel.care/datenschutz
```

#### Support-URL
```
https://alltagsengel.care
```

### 4.3 App-Beschreibung (Deutsch)

**Name (max. 30 Zeichen):**
```
AlltagsEngel
```

**Untertitel (max. 30 Zeichen):**
```
Alltagsbegleitung mit Herz
```

**Beschreibung:**
```
AlltagsEngel vermittelt zertifizierte Alltagsbegleiter für Senioren und Pflegebedürftige — einfach, sicher und 100% über die Pflegekasse abrechenbar.

LEISTUNGEN:
• Alltagsbegleitung ab 32€/Stunde — Spaziergänge, Gesellschaft, Begleitung
• Arztbegleitung — sichere Begleitung zu Arztterminen
• Einkaufsbegleitung — gemeinsam einkaufen gehen
• Haushaltshilfe — Unterstützung im Alltag
• Krankenfahrt — Medizinische Transporte
• Hygienebox — Pflegehilfsmittel für 0€ Eigenanteil

SO FUNKTIONIERT ES:
1. Engel finden — Zertifizierte Begleiter in deiner Nähe
2. Direkt buchen — Termin wählen und bestätigen
3. Über Pflegekasse abrechnen — 131€/Monat über §45b SGB XI

VORTEILE:
• 100% versichert — Jeder Einsatz ist vollständig abgesichert
• §45b integriert — Direkte Abrechnung mit der Pflegekasse
• 24/7 erreichbar — Kundenservice rund um die Uhr
• Geprüfte Begleiter — Alle Engel sind nach §53b qualifiziert

JETZT KOSTENLOS REGISTRIEREN
Keine Registrierungsgebühren. Finde deinen Alltagsengel noch heute.
```

**Keywords (max. 100 Zeichen):**
```
Alltagsbegleitung,Seniorenbetreuung,Pflege,§45b,Entlastungsbetrag,Begleiter,Haushaltshilfe,Senior
```

**Promotional Text (max. 170 Zeichen):**
```
Zertifizierte Alltagsbegleiter für Senioren — 131€/Monat über die Pflegekasse. Jetzt Engel in deiner Nähe finden!
```

### 4.4 Screenshots hochladen

Du brauchst Screenshots für diese Gerätegrößen:

| Gerät | Auflösung | Pflicht? |
|-------|-----------|----------|
| iPhone 16 Pro Max (6,9") | 1320 x 2868 | JA |
| iPhone 16 Pro (6,3") | 1206 x 2622 | Empfohlen |
| iPhone SE / 8 (4,7") | 750 x 1334 | Empfohlen |

**Mindestens 3, maximal 10 Screenshots pro Größe.**

Empfohlene Screenshots:
1. Startseite / Splash Screen
2. Engel finden (Auswahl-Seite)
3. Registrierung
4. Buchungsübersicht / Kunde-Home
5. Hygienebox
6. Krankenfahrt

### 4.5 Demo-Account für Apple Review

**WICHTIG:** Apple testet die App! Du musst einen Demo-Account angeben:

- **Benutzername:** `review@alltagsengel.de`
- **Passwort:** (ein einfaches Passwort erstellen)

**Hinweis:** Wir müssen diesen Account vorher in der App anlegen!

### 4.6 App-Datenschutz (Data Privacy)

Apple fragt welche Daten die App sammelt. Folgendes angeben:

| Datentyp | Zweck |
|----------|-------|
| E-Mail-Adresse | App-Funktionalität, Account |
| Name | App-Funktionalität, Account |
| Standort (ungefähr) | App-Funktionalität |
| Nutzungsdaten | Analyse |

---

## Schritt 5: Einreichung & Review

### 5.1 Build auswählen
1. In App Store Connect → Deine App → **"iOS App"**
2. Unter **"Build"** → Klicke auf **"+"**
3. Wähle den hochgeladenen Build aus

### 5.2 Einreichen
1. Prüfe alle Felder (Beschreibung, Screenshots, etc.)
2. Klicke auf **"Zur Überprüfung einreichen"**

### 5.3 Review-Prozess
- **Dauer:** Normalerweise 24–48 Stunden
- **Status prüfen:** In App Store Connect unter "Meine Apps"
- Falls Apple Fragen hat, bekommst du eine E-Mail

---

## Häufige Ablehnungsgründe & Lösungen

| Problem | Lösung |
|---------|--------|
| Kein Demo-Account | Review-Account anlegen (Schritt 4.5) |
| Datenschutz-URL fehlt | Ist vorhanden: alltagsengel.care/datenschutz |
| App stürzt ab | Vorher auf echtem iPhone testen! |
| "Web App Wrapper" | Wir haben native Plugins (Push, Kamera) — sollte OK sein |
| Screenshots fehlen | Müssen noch erstellt werden |

---

## Checkliste vor Einreichung

- [ ] Apple Developer Account aktiviert
- [ ] Xcode installiert und Account eingerichtet
- [ ] iOS-Build auf echtem iPhone getestet
- [ ] Archive erstellt und zu App Store Connect hochgeladen
- [ ] App-Beschreibung ausgefüllt (Deutsch)
- [ ] Screenshots hochgeladen (min. 3 pro Größe)
- [ ] App-Icon 1024x1024 hochgeladen
- [ ] Datenschutz-URL eingetragen
- [ ] Demo-Account für Apple Review erstellt
- [ ] Datenschutz-Fragebogen ausgefüllt
- [ ] App zur Überprüfung eingereicht

---

## Zeitplan

| Tag | Aufgabe |
|-----|---------|
| **Mo 23.03** (Heute) | Apple Developer Account anmelden + bezahlen |
| **Di 24.03** | Account-Aktivierung abwarten, Xcode vorbereiten |
| **Mi 25.03** | iOS-Build erstellen, Screenshots, Einreichung |
| **Do 26.03 – Fr 27.03** | Apple Review abwarten |

---

## Kontakt bei Problemen

- **Apple Developer Support:** https://developer.apple.com/contact/
- **App Store Connect Hilfe:** https://developer.apple.com/help/app-store-connect/
