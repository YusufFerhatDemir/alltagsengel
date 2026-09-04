# Alltagsengel.care — E2E Live-Test Report

**Datum:** 04.09.2026, 13:00 Uhr  
**URL:** https://alltagsengel.care  
**Tester:** Claude (automatisiert)

---

## Zusammenfassung

| Kategorie | Ergebnis |
|-----------|----------|
| Bestanden | 10 / 12 |
| Warnung   | 2 / 12  |
| Fehlgeschlagen | 0 / 12 |

---

## 1. Startseite ✅

- **SSL:** HTTPS aktiv, Zertifikat gültig
- **Titel:** „Alltagsbegleitung, Pflegebox & Krankenfahrten Frankfurt"
- **Logo:** Alltagsengel-Logo (goldener Engel) korrekt angezeigt
- **Navigation:** „Alltagsengel", „Beratung", „Termin buchen" sichtbar
- **Inhalt:** Alle drei Leistungsbereiche (Alltagsbegleitung, Pflege-Box, Krankenfahrt) prominent dargestellt
- **Sticky-Elemente:** Rückruf-Button, WhatsApp-Button, „Fragen zur Pflege?"-Chat-Widget vorhanden
- **Ladezeit:** TTFB 0.12s, Gesamt 0.14s — **sehr schnell**
- **Seitengröße:** ~120 KB

## 2. Registrierung ✅

- **URL:** /auth/register erreichbar (HTTP 200)
- **Überschrift:** „Konto erstellen — Als Kunde registrieren"
- **Felder vorhanden:**
  - Vorname, Nachname
  - E-Mail-Adresse
  - Passwort (min. 8 Zeichen)
  - PLZ, Stadt
  - Unterstützungsart (Für mich selbst / Für einen Angehörigen)
  - Pflegegrad (Kein, 1–5)
  - Pflege zu Hause? (Toggle)
  - AGB + Datenschutz Checkbox
  - Vermittlungsklausel-Checkbox (§6/§7 AGB)
- **Link zu Login:** „Bereits ein Konto? Anmelden" vorhanden

## 3. Login ✅

- **URL:** /auth/login erreichbar (HTTP 200)
- **Überschrift:** „Willkommen zurück — Melden Sie sich an"
- **Felder:** E-Mail-Adresse, Passwort (mit Anzeigen-Toggle)
- **Passwort vergessen:** Link vorhanden
- **Registrierung-Link:** „Noch kein Konto? Registrieren" vorhanden
- **Admin-Zugang:** Separate Links für ADMIN und MIS PORTAL sichtbar

## 4. Admin-Bereich ✅

- **URL:** /admin ohne Login → Redirect auf /auth/login?next=%2Fadmin&error=auth_required
- **Ergebnis:** Korrekte Auth-Guard-Umleitung, kein unautorisierter Zugang möglich

## 5. API-Health ✅

- **GET /api/health → HTTP 200**
  - Status: „healthy"
  - Version: 926486c
  - Dauer: 1067ms
  - Checks alle „pass":
    - App erreichbar
    - Database (462ms)
    - Table: profiles (128ms)
    - Table: bookings (130ms)
    - Table: organizations (347ms)

- **GET /api/pilot/snapshot → HTTP 401**
  - Response: `{"error":"Nicht autorisiert."}`
  - ✅ Korrekt geschützt

## 6. Cron-Schutz ✅

- **GET /api/cron/drip → HTTP 401**
  - Response: `{"error":"Unauthorized"}`
  - ✅ Korrekt geschützt, kein unautorisierter Zugriff

## 7. Cookie-Consent ⚠️

- **Cookie-Einstellungen-Button:** Im Footer vorhanden und funktional
- **Initiales Cookie-Banner:** Kein automatisches Cookie-Consent-Popup beim ersten Seitenbesuch sichtbar
- **Bewertung:** Potenzielles DSGVO-Problem — nach EU-Recht muss vor dem Setzen nicht-essentieller Cookies ein Banner erscheinen und aktive Einwilligung eingeholt werden. Der Footer-Button allein reicht nicht aus.

## 8. Mobile Responsiveness ✅

- **Design:** Mobile-First — die gesamte Seite ist in einem Smartphone-Frame gerendert
- **375px Viewport:** Layout identisch, keine Breakage
- **Touch-Elemente:** Buttons ausreichend groß
- **Bewertung:** Seite ist von Grund auf für mobile Nutzung konzipiert

## 9. SEO ✅

- **robots.txt:** HTTP 200, korrekt konfiguriert
  - Allow: /, /fahrer/register, /auth/register
  - Disallow: /admin/, /mis/, /api/, /engel/, /kunde/, /fahrer/, /auth/, /investor/, /notfall/
  - Sitemap-Verweis vorhanden
- **sitemap.xml:** HTTP 200, 70+ URLs indexiert
  - Hauptseiten, Blog-Artikel, Stadtseiten (Alltagsbegleitung, Krankenfahrten, Hygienebox pro Stadt)
  - lastmod-Daten aktuell (Juli 2026)
  - Prioritäten sinnvoll gestuft (1.0 für Startseite, 0.85 für Stadtseiten)

## 10. Fehlerseiten ✅

- **404-Seite:** Eigene, professionelle „Seite nicht gefunden"-Seite
  - Hilfreiche Links: Alltagsbegleitung, Pflegebox, Krankenfahrten, Budgetrechner, Pflegegrad-Check, FAQ
  - „Zur Startseite"-Button
  - Telefonnummer für Rückfragen
  - HTTP-Statuscode korrekt: 404

## 11. Performance ✅

- **TTFB (Time to First Byte):** 0.12s — exzellent
- **Gesamtladezeit:** 0.14s — exzellent
- **Seitengröße:** ~120 KB (komprimiert)
- **Health-Endpoint:** 1.07s (inkl. DB-Checks) — akzeptabel

## 12. Resend-Webhook ⚠️

- **POST /api/marketing/resend-webhook ohne Body → HTTP 503**
  - Response: `{"error":"Webhook nicht konfiguriert."}`
  - **Erwartet:** 400 oder 503 (nicht 500) → ✅ Kein Server-Crash
  - **Hinweis:** 503 statt 400 deutet darauf hin, dass der Webhook-Service nicht konfiguriert/verbunden ist. Funktional korrekt (kein 500), aber semantisch wäre 400 (Bad Request) oder 501 (Not Implemented) passender.

---

## Gesamtbewertung

Die Website alltagsengel.care ist **produktionsreif und stabil**. Alle kritischen Sicherheitsmechanismen (Auth-Guards, API-Schutz, Cron-Schutz) funktionieren korrekt. Die Performance ist exzellent, SEO ist gut aufgestellt, und die Fehlerbehandlung ist professionell.

### Handlungsbedarf

1. **🔴 Cookie-Consent-Banner:** Ein initiales DSGVO-konformes Cookie-Banner sollte beim ersten Besuch angezeigt werden (nicht nur ein Button im Footer).

2. **🟡 Resend-Webhook Status-Code:** Semantisch wäre HTTP 400 oder 501 passender als 503 für „nicht konfiguriert".

### Screenshots

Folgende Screenshots wurden gespeichert:
- Startseite (Desktop)
- Registrierungsformular
- Login-Seite
- 404-Fehlerseite
- Footer mit Cookie-Einstellungen
- Startseite (Mobile Viewport)
