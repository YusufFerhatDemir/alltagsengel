# Alltagsengel — Google Bewertungen & Apple Business Strategie

---

## 1. Google Bewertungen — WhatsApp-Vorlagen & In-App-Konzept

### 1.1 Google-Bewertungslink erstellen

**So erhältst du deinen direkten Bewertungslink:**

1. Öffne [Google Business Profile Manager](https://business.google.com/)
2. Wähle den Standort „Alltagsengel" aus
3. Klicke auf **„Bewertungen"** → **„Mehr Bewertungen erhalten"**
4. Kopiere den generierten Kurzlink

**Alternativ:** Suche auf Google Maps nach „Alltagsengel Frankfurt", klicke auf dein Profil → „Bewertung schreiben" und kopiere die URL aus der Adresszeile.

Der Link hat folgendes Format:
```
https://g.page/r/DEINE-ID/review
```

> **Hinweis:** Ersetze `[LINK]` in allen Vorlagen unten durch deinen tatsächlichen Google-Bewertungslink.

---

### 1.2 WhatsApp-Vorlage — Nach Pflegebox-Lieferung

```
Hallo Frau/Herr [Nachname],

vielen Dank, dass Sie sich für die Pflegebox von Alltagsengel entschieden haben! Wir hoffen, dass alles zu Ihrer Zufriedenheit angekommen ist.

Ihre Meinung ist uns sehr wichtig – sie hilft anderen Pflegebedürftigen und Angehörigen, uns zu finden. Wenn Sie zufrieden waren, würden wir uns sehr über eine kurze Google-Bewertung freuen:

👉 [LINK]

Das dauert nur 1–2 Minuten und hilft uns enorm. Vielen Dank!

Herzliche Grüße
Ihr Team von Alltagsengel
```

---

### 1.3 WhatsApp-Vorlage — Nach Alltagsbegleitung

```
Hallo Frau/Herr [Nachname],

wir hoffen, Sie hatten einen schönen Termin mit unserer Alltagsbegleitung. Ihr Wohlbefinden liegt uns am Herzen.

Wenn Sie mit unserem Service zufrieden waren, freuen wir uns über eine kurze Bewertung auf Google. So können auch andere Menschen von Alltagsengel erfahren:

👉 [LINK]

Vielen Dank für Ihr Vertrauen!

Herzliche Grüße
Ihr Team von Alltagsengel
```

---

### 1.4 WhatsApp-Vorlage — Erinnerung (Follow-up nach 5–7 Tagen)

```
Hallo Frau/Herr [Nachname],

vor kurzem haben wir Sie gefragt, ob Sie Alltagsengel auf Google bewerten möchten. Falls Sie noch keine Gelegenheit hatten – hier nochmal der Link:

👉 [LINK]

Jede Bewertung zählt und hilft uns, noch mehr Menschen in Frankfurt zu unterstützen. Danke!

Herzliche Grüße
Alltagsengel
```

---

### 1.5 In-App-Prompt-Konzept

#### Auslöser (Trigger)

Der Bewertungs-Prompt wird automatisch angezeigt, wenn **eine** der folgenden Bedingungen erfüllt ist:

| Trigger | Zeitpunkt |
|---|---|
| Pflegebox-Lieferung bestätigt | 24 Stunden nach Lieferbestätigung |
| Alltagsbegleitung abgeschlossen | 2 Stunden nach dem Termin |
| Kunde hat 3+ Bestellungen | Nach der 3. Bestellung |
| Kunde nutzt App seit 30+ Tagen | Einmalig nach 30 Tagen |

#### Anzeige-Logik

- **Maximal 1x pro 60 Tage** anzeigen
- **Nicht anzeigen**, wenn der Kunde bereits bewertet hat
- **Nicht anzeigen** bei offenen Beschwerden oder Support-Tickets
- **Abbrechen-Option** respektieren: Nach 2x Ablehnung nicht erneut fragen

#### UI-Entwurf — Schritt 1: Zufriedenheitsabfrage

```
┌─────────────────────────────────────────┐
│                                         │
│   Wie zufrieden sind Sie mit            │
│   Alltagsengel?                         │
│                                         │
│   ⭐ ⭐ ⭐ ⭐ ⭐                        │
│   (Sterne zum Antippen)                 │
│                                         │
│   [ Jetzt nicht ]                       │
│                                         │
└─────────────────────────────────────────┘
```

#### Schritt 2a: Bei 4–5 Sternen → Google-Weiterleitung

```
┌─────────────────────────────────────────┐
│                                         │
│   Das freut uns sehr! 🎉               │
│                                         │
│   Würden Sie Ihre positive Erfahrung    │
│   auch auf Google teilen? Das hilft     │
│   anderen Pflegebedürftigen, uns zu     │
│   finden.                               │
│                                         │
│   [ Jetzt bewerten ]  [ Später ]        │
│                                         │
└─────────────────────────────────────────┘
```

→ „Jetzt bewerten" öffnet den Google-Bewertungslink im Browser.

#### Schritt 2b: Bei 1–3 Sternen → Internes Feedback

```
┌─────────────────────────────────────────┐
│                                         │
│   Es tut uns leid, dass Sie nicht       │
│   zufrieden waren.                      │
│                                         │
│   Bitte teilen Sie uns mit, was wir     │
│   verbessern können:                    │
│                                         │
│   ┌─────────────────────────────────┐   │
│   │ (Freitext-Eingabe)              │   │
│   └─────────────────────────────────┘   │
│                                         │
│   [ Feedback senden ]  [ Abbrechen ]    │
│                                         │
└─────────────────────────────────────────┘
```

→ Negatives Feedback geht intern an das Team, **nicht** zu Google.

#### Technische Umsetzung (Empfehlung)

- Zufriedenheitsabfrage als Modal/Bottom-Sheet in der App
- Google-Link als Deep-Link oder externer Browser-Aufruf
- Feedback-Daten in Supabase speichern (Tabelle `customer_feedback`)
- Status-Tracking: `review_prompted`, `review_completed`, `review_declined`

---

## 2. Apple Business — Registrierungsanleitung

### 2.1 Hintergrund

Apple Business Connect wurde im April 2026 in die neue Plattform **Apple Business** integriert. Über Apple Business kannst du:

- Deinen Unternehmensstandort auf **Apple Maps** verwalten (Fotos, Öffnungszeiten, Beschreibung)
- **Standortkarten** mit Showcases und Aktionen erstellen
- **Branded Mail** einrichten (Logo in Apple Mail)
- **Tap to Pay on iPhone** konfigurieren
- Werbung in Apple Karten schalten (ab Sommer 2026)

### 2.2 Voraussetzungen

| Was | Details für Alltagsengel |
|---|---|
| Apple Account | Neuer oder bestehender Apple Account mit info@alltagsengel.care |
| Firmenname | Alltagsengel UG (haftungsbeschränkt) |
| Adresse | Neue Mainzer Straße 66-68, 60311 Frankfurt am Main |
| Telefon | +49 178 3382825 |
| Website | https://alltagsengel.care |
| Verifizierung (2 Methoden nötig) | Siehe Schritt 6 unten |

### 2.3 Schritt-für-Schritt-Anleitung

> **Hinweis:** Die Account-Erstellung muss manuell durchgeführt werden — sie kann nicht automatisiert werden.

#### Schritt 1: Seite öffnen
→ Gehe zu **https://business.apple.com**

#### Schritt 2: Registrierung starten
→ Klicke auf **„Erste Schritte"** oder **„Anmelden"** (oben rechts)
→ Wähle **„Jetzt registrieren"**

#### Schritt 3: Organisationsinformationen eingeben
- **Organisationsname:** Alltagsengel UG (haftungsbeschränkt)
- **Website:** https://alltagsengel.care
- **Land:** Deutschland
- **Adresse:** Neue Mainzer Straße 66-68, 60311 Frankfurt am Main
- **Checkbox „Agentur":** NICHT ankreuzen (Alltagsengel ist kein Drittanbieter)
- Optional: Newsletter-E-Mails aktivieren

#### Schritt 4: Administrator-Konto erstellen
- **Vorname & Nachname:** Echte(r) Name des Verantwortlichen (rechtlich erforderlich — keine Funktionsbezeichnungen wie „IT-Admin")
- **Land:** Deutschland
- **Passwort:** Sicheres Passwort erstellen
- **Telefonnummer:** +49 178 3382825 (für Verifizierungscodes)
- **Verifizierungsmethode:** SMS oder Anruf wählen

#### Schritt 5: Verifizierungscodes bestätigen
- Verifizierungscode per E-Mail bestätigen
- Verifizierungscode per SMS/Anruf bestätigen
- Nutzungsbedingungen (Terms & Conditions) akzeptieren

#### Schritt 6: Organisation verifizieren (innerhalb von 60 Tagen!)

Apple verlangt **zwei** verschiedene Verifizierungsmethoden. Empfohlene Kombination für Alltagsengel:

**Methode 1 — Domain-Validierung:**
- Einen TXT-Record in den DNS-Einstellungen von alltagsengel.care hinzufügen
- Apple gibt den genauen TXT-Wert vor
- Dies bestätigt, dass ihr die Domain besitzt

**Methode 2 — Geschäftsdokument hochladen:**
- Gewerbeanmeldung / Handelsregisterauszug
- Alternativ: Umsatzsteuer-Bescheinigung, Mietvertrag oder Nebenkostenrechnung
- Das Dokument muss den Firmennamen und die Adresse enthalten

**Alternative Methode — D-U-N-S-Nummer:**
- Falls Alltagsengel eine D-U-N-S-Nummer hat, kann diese verwendet werden
- Kostenlos prüfen unter: https://developer.apple.com/help/account/membership/D-U-N-S/
- Falls nicht vorhanden: Beantragung bei Dun & Bradstreet (kostenlos, dauert ca. 5–14 Werktage)

#### Schritt 7: Standort einrichten
Nach erfolgreicher Verifizierung:
- Standort „Alltagsengel" auf Apple Maps hinzufügen
- Fotos, Öffnungszeiten, Beschreibung und Kategorien eintragen
- Showcase mit Aktionen erstellen (z.B. „Pflegebox bestellen", „Alltagsbegleitung anfragen")

### 2.4 Zeitplan

| Schritt | Geschätzte Dauer |
|---|---|
| Registrierung (Schritte 1–5) | 15 Minuten |
| DNS-TXT-Record setzen | 10 Minuten + bis zu 48h Propagation |
| Dokument hochladen | 5 Minuten |
| Apple-Verifizierung | Bis zu 5 Werktage |
| Standort einrichten | 30 Minuten |

### 2.5 Wichtige Links

- Apple Business Portal: https://business.apple.com
- Registrierungsanleitung (Apple Support): https://support.apple.com/guide/business/sign-up-and-verify-your-organization-axm402206497/web
- D-U-N-S-Nummer prüfen: https://developer.apple.com/help/account/membership/D-U-N-S/
- Feature-Verfügbarkeit: https://support.apple.com/guide/business/feature-availability-axmef1c47twq/web

---

*Erstellt am 06.06.2026 — Alltagsengel*
