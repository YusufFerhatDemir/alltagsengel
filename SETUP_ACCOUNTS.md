# SETUP_ACCOUNTS — Einmalige Account-Anlagen

Welle-1-Code ist deployed; jetzt müssen die externen Accounts angelegt und die zurückgegebenen IDs in die ENV-Variablen kopiert werden. Reihenfolge ist nach Wirkung sortiert — von oben nach unten abarbeiten. Pro Punkt ~2 Min.

ENVs werden in **Vercel → Project → Settings → Environment Variables** (Production + Preview) gesetzt. Lokal: `.env.local`.

---

## 1. Google Analytics 4 (höchste Priorität)

**Ziel**: GA4-Web-Stream + später iOS-/Android-Stream im selben Property.

1. Öffne https://analytics.google.com → **Property erstellen** → `alltagsengel.care`.
2. Land: Deutschland · Währung: EUR · Branche: Gesundheit.
3. **Daten-Streams** anlegen:
   - **Web** → URL `https://alltagsengel.care` → Stream-Name `Web`.
     - Kopiere die **Measurement-ID** (`G-XXXXXXXXXX`) → ENV `NEXT_PUBLIC_GA4_MEASUREMENT_ID`.
   - **iOS** → Bundle-ID `care.alltagsengel.app` → Stream-Name `iOS App` (für Welle 2).
   - **Android** → Package-Name `care.alltagsengel.app` → Stream-Name `Android App` (für Welle 2).
4. Property → **Admin → Datenerfassung & Modifizierung → Erweiterte Messung** → an lassen.
5. Property → **Admin → Eigene Definitionen** → die Custom-Dimensionen anlegen, die `lib/analytics.ts` schickt: `user_role`, `topic`, `distance_km`.

→ Direkt-Link Measurement-ID: GA4 Admin → Datenstream Web → oben rechts.

---

## 2. Google Search Console + Bing Webmaster

**Ziel**: Indexierung & Sitemap-Submission.

1. https://search.google.com/search-console → **Property hinzufügen** → URL `https://alltagsengel.care`.
2. Verifizierung: DNS-TXT-Record (vorzugsweise) ODER HTML-Datei in `public/`.
3. Nach Verifikation: **Sitemaps** → `https://alltagsengel.care/sitemap.xml` einreichen.
4. https://www.bing.com/webmasters → **Site importieren aus Google Search Console** (Ein-Klick-Import).
5. Optional: Bing-HTML-Meta-Tag in `NEXT_PUBLIC_BING_SITE_VERIFICATION` ablegen.

---

## 3. Meta (Facebook/Instagram) — Pixel + CAPI

**Ziel**: Pixel + Conversions API für serverseitige Events.

1. https://business.facebook.com → **Events Manager → Datenquellen → Pixel verbinden** → Name `Alltagsengel`.
2. **Pixel-ID** kopieren → ENV `NEXT_PUBLIC_META_PIXEL_ID` UND `META_PIXEL_ID`.
3. Im Pixel-Detail → **Einstellungen → Conversions API → Zugriffstoken generieren**.
4. **Access-Token** kopieren → ENV `META_CAPI_ACCESS_TOKEN` (server-only, NICHT public).

---

## 4. TikTok — Pixel + Events-API

1. https://ads.tiktok.com → **Assets → Events → Web-Events → Pixel erstellen**.
2. Pixel-Setup-Methode: **Manuell** → Name `Alltagsengel`.
3. **Pixel-ID** kopieren → ENV `NEXT_PUBLIC_TIKTOK_PIXEL_ID` UND `TIKTOK_PIXEL_ID`.
4. Im Pixel → **Events API → Access-Token generieren** → kopieren → ENV `TIKTOK_CAPI_ACCESS_TOKEN`.

---

## 5. Apple Developer (für Welle 2 — App-Tracking)

**Ziel**: Team-ID für Firebase iOS Stream + Push-Notifications.

1. https://developer.apple.com → **Account → Membership** → Team-ID notieren (10-stellig, z. B. `ABCDE12345`).
2. **Certificates, IDs & Profiles → Identifiers → App-ID** für `care.alltagsengel.app` muss existieren (Push-Notifications fähig).
3. Bei Welle 2: GoogleService-Info.plist von Firebase ins `ios/App/App/` einfügen.

---

## 6. Android Signing-SHA-256 (für Welle 2)

**Ziel**: SHA-256 des Release-Keystores für Firebase Android Stream + Play Integrity.

1. Lokal: `cd android && ./gradlew signingReport` → SHA-256-Zeile suchen (`SHA-256: AB:CD:...`).
2. Notieren — bei Firebase-Android-App-Anlage einfügen.
3. Bei Welle 2: `google-services.json` von Firebase ins `android/app/` einfügen.

---

## 7. Firebase (Welle 2 — App-Analytics)

**Ziel**: App-Tracking (iOS + Android), Web parallel zu GA4.

1. https://console.firebase.google.com → **Projekt hinzufügen** → Name `alltagsengel`.
2. **In bestehendes GA4-Property einfügen** (das aus Schritt 1).
3. Apps hinzufügen:
   - iOS — Bundle-ID `care.alltagsengel.app`, Team-ID aus Schritt 5.
   - Android — Package `care.alltagsengel.app`, SHA-256 aus Schritt 6.
   - Web — Domain `alltagsengel.care`.
4. Config-Werte → ENV:
   - `NEXT_PUBLIC_FIREBASE_API_KEY`
   - `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
   - `NEXT_PUBLIC_FIREBASE_APP_ID_IOS` / `_ANDROID`
   - `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID_WEB`

---

## Nach Anlage — Verifikation

1. ENVs in Vercel gesetzt → Redeploy auslösen.
2. Im Browser: `https://alltagsengel.care/` öffnen, Cookies akzeptieren, in DevTools Network nach `google-analytics.com/g/collect` schauen → muss feuern.
3. GA4 → **Echtzeit** → eigener Besuch muss auftauchen (~10 s Lag).
4. Meta Events Manager → **Test-Events** → `fbclid` an URL hängen → muss in Echtzeit ankommen.
5. Web-Vitals: Supabase → `analytics_events` Tabelle → Rows mit `event_name = 'web_vital'` müssen erscheinen (Migration `supabase/migrations/20260525_analytics_events.sql` vorher im SQL-Editor ausführen).

---

## ENV-Checkliste (Status nach Welle 1)

| ENV | Stand | Setzt wer |
|---|---|---|
| `NEXT_PUBLIC_GA4_MEASUREMENT_ID` | leer (Code wartet) | Schritt 1 |
| `NEXT_PUBLIC_META_PIXEL_ID` | leer | Schritt 3 |
| `META_PIXEL_ID` | leer | Schritt 3 |
| `META_CAPI_ACCESS_TOKEN` | leer | Schritt 3 |
| `NEXT_PUBLIC_TIKTOK_PIXEL_ID` | leer | Schritt 4 |
| `TIKTOK_PIXEL_ID` | leer | Schritt 4 |
| `TIKTOK_CAPI_ACCESS_TOKEN` | leer | Schritt 4 |
| `NEXT_PUBLIC_BING_SITE_VERIFICATION` | leer (optional) | Schritt 2 |
| `NEXT_PUBLIC_FIREBASE_*` | leer (Welle 2) | Schritt 7 |

Solange ein ENV leer ist: **kein Crash, kein Render**. Die jeweiligen Komponenten geben `null` zurück.

---

## Supabase Migration ausführen

Datei: `supabase/migrations/20260525_analytics_events.sql`

1. Supabase-Dashboard → **SQL Editor → New Query**.
2. Datei-Inhalt einfügen → **Run**.
3. **Table Editor → analytics_events** muss erscheinen, RLS aktiv.

Erst danach speichert `/api/analytics/vitals` echte Daten.
