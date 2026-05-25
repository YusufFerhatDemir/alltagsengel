# MASTERPLAN — Analytics, SEO, GEO (Web + iOS-App + Android)

> **Stand:** 2026-05-25
> **Autor:** Lead Fullstack / SEO-GEO-Architekt / Analytics-Engineer
> **Geltungsbereich:** Web (alltagsengel.care, Next.js 16) **und** native Apps (iOS + Android via Capacitor 8)
> **Status:** Analyse + Implementierungsplan — noch keine Umsetzung

---

## 0 — Wichtige Architektur-Klarstellung

Die "AlltagsEngel-App" im App Store ist **kein** separater Quellcode in einem anderen Repo, sondern ein **Capacitor-Wrapper** um die Live-Web-App. Konfiguration in `capacitor.config.json`:

```json
{
  "appId": "care.alltagsengel.app",
  "server": { "url": "https://alltagsengel.care", "iosScheme": "https" }
}
```

**Konsequenzen für den Plan:**

1. Der iOS-Bundle lädt zur Laufzeit `https://alltagsengel.care` in einen `WKWebView`. Es gibt kein natives Swift-UI.
2. **Alles, was im Web läuft, läuft auch in der App** — Vorteil: ein Codebase, eine Wahrheit. Nachteil: ein Bug = überall, und alle Apple-/Google-Reviews betreffen die Web-Codebase.
3. **Tracking ist heute in der App vollständig deaktiviert** (`VisitorTracker.tsx` checkt `Capacitor.isNativePlatform()` und bricht ab; `MetaPixel.tsx`/`TikTokPixel.tsx` gleichermaßen). Das hat zwei Probleme:
   - **Wir wissen 0 % darüber, was App-Nutzer tun.** Buchungen, Engel-Aufrufe, Krankenfahrten-Conversions aus der App sind invisible.
   - GTM/gtag wird zwar geladen (damit Google Tag Assistant beim Server-Crawl den Tag findet), feuert aber im Native-WebView keine Conversions.
4. **iOS App Store Connect verlangt ein ATT-Dialog**, sobald wir IDFA o.ä. lesen — heute lesen wir nichts, also brauchen wir den Dialog formal nicht. Sobald wir Firebase Analytics oder Facebook SDK nativ einbauen, wird ATT verpflichtend.

Der Plan macht aus dieser "Web im WebView"-Realität eine **strategische Stärke** (siehe Welle 2), statt nativen App-Code parallel zu pflegen.

---

## 1 — IST-Analyse (Was existiert? Was fehlt?)

Legende: **OK** = vorhanden und funktional · **TEILS** = vorhanden, lückenhaft · **FEHLT** = nicht vorhanden

### 1.1 Web-Tracking-Pixel

| Bereich | Status | Detail / Befund |
|---|---|---|
| **Google Tag Manager (GTM)** | **OK** | Container `GTM-NPNL3D3Q` hardcoded in `components/GoogleTagManager.tsx:6`. Wird via `<Script strategy="afterInteractive">` geladen. Noscript-Fallback vorhanden. |
| **Google Ads Conversion** | **OK** | Account `AW-18061588897` hardcoded. Zwei Conversion-Labels: Registrierung (110 €) + Buchung (50 €). Enhanced Conversions aktiv (Email/Phone hashed). Direkter `gtag()`-Call, kein Umweg über GTM-Tag. |
| **GA4 (Google Analytics 4)** | **FEHLT** | Es gibt **keinen** `gtag('config', 'G-XXX')` Aufruf, keine Measurement-ID im Code, keine `NEXT_PUBLIC_GA4_ID` in `.env.example`. → **Wir messen User-Verhalten 0 — nur Conversions.** |
| **Meta (Facebook) Pixel** | **OK** | `components/MetaPixel.tsx`. Env-basiert: `NEXT_PUBLIC_META_PIXEL_ID`. Lädt nicht in Capacitor. Lädt nicht ohne Consent. Tracking-Helper `trackMetaEvent()` exportiert. |
| **Meta CAPI (Conversion API)** | **FEHLT** | Server-Side Pixel Backup gibt es nicht. iOS-14-ITP & AdBlocker → Daten-Verlust 30–50 %. |
| **TikTok Pixel** | **OK** | `components/TikTokPixel.tsx` analog Meta. |
| **TikTok Events API** | **FEHLT** | Server-Side gleichermaßen. |
| **Pinterest Tag** | **FEHLT** | (Niedrige Priorität für Senioren-Zielgruppe — vermerken, nicht zwingend.) |
| **Microsoft Clarity / Hotjar** | **FEHLT** | Keine Session-Recordings/Heatmaps. (Sentry Replay läuft mit 0 % Session + 10 % auf Error mit `maskAllText`.) |

### 1.2 Search Engine Optimization (SEO)

| Bereich | Status | Detail / Befund |
|---|---|---|
| **`<title>` / `<meta description>`** | **TEILS** | Root in `app/layout.tsx:31` gesetzt. Title-Template `%s | Alltagsengel.care`. Einige Pages (faq, blog, alltagsbegleitung) haben eigene `metadata` — Stichprobenkontrolle nötig, ob alle 15 Blog-Posts Metadata haben. |
| **Open Graph + Twitter Cards** | **OK** | Layout-Level gesetzt mit `/og-image.png` (1200×630). |
| **Canonical-URLs** | **TEILS** | Layout setzt `alternates.canonical: '/'`. **Subpages haben keine eigenen Canonicals** → bei UTM-Params/Filtern wird die Subpage als Original-URL = `/` ausgewiesen. Bug. |
| **Hreflang** | **FEHLT** | Aktuell DE-only — strategisch ok, aber falls EN/TR später kommt, jetzt schon strukturieren. |
| **Sitemap** | **TEILS** | `app/sitemap.ts` ist **statisch & hardcoded**: alle 15 Blog-Slugs händisch gepflegt. Bei jedem neuen Artikel manuell ergänzen. Es gibt **zusätzlich** ein statisches `public/sitemap.xml` — Konflikt: Next.js generiert `/sitemap.xml` aus `sitemap.ts`, das File in `/public` wird überschrieben. Prüfen, was tatsächlich ausgeliefert wird. |
| **Robots** | **OK** | `app/robots.ts` + zusätzlich `public/robots.txt` (Doppelung!). Beide blocken `/admin`, `/api`, `/kunde`, `/engel`, `/fahrer`. Sitemap-Referenz korrekt. **AI-Crawler nicht explizit erlaubt/verboten** (siehe GEO-Kapitel). |
| **JSON-LD Strukturierte Daten** | **TEILS** | Layout: `LocalBusiness` mit `@id`, Adresse, Geo, Service-Liste, sameAs (IG/FB/TikTok). FAQ-Seite: `FAQPage`. `/alltagsbegleitung`: `Service`. **Blog-Posts: KEIN `Article`/`BlogPosting` Schema.** Kein `BreadcrumbList`. Kein `Person`/`Author` für Autoren-E-A-T. Kein `Review`/`AggregateRating`. Kein `Speakable` für Voice-Search. |
| **Image-Alt / Bildoptimierung** | **TEILS** | `sharp` ist Dependency, `next/image` vermutlich genutzt — Audit ausstehend. |
| **URL-Struktur** | **OK** | Sprechende deutsche URLs (`/alltagsbegleitung`, `/krankenfahrten`, `/blog/entlastungsbetrag-45b`). Keine `?id=123`. |
| **Internal Linking** | **UNBEKANNT** | Audit ausstehend — Blog ⇄ Service ⇄ FAQ Verlinkung. |
| **Pagination** | **n/a** | Blog hat 15 Posts — Pagination noch nicht nötig. |
| **Google Search Console** | **TEILS** | Verify-File `public/googlef0812a4982d52ce4.html` existiert → also schon einmal verifiziert. Aber: **keine GSC-Daten-Anbindung im Admin-Dashboard.** |
| **Bing Webmaster Tools** | **FEHLT** | Bing.de hat in DE Senioren-Zielgruppe ~10 % Anteil — relevant. |

### 1.3 Generative Engine Optimization (GEO / LLM-SEO)

Brandneues Feld (2024/2025) — wie taucht eine Marke in ChatGPT-, Perplexity-, Gemini-Antworten auf?

| Bereich | Status | Detail / Befund |
|---|---|---|
| **robots.txt AI-Crawler-Erlaubnis** | **FEHLT** | `GPTBot`, `ClaudeBot`, `PerplexityBot`, `Google-Extended` nicht explizit adressiert → defaultet auf `User-agent: *` → erlaubt → ok, aber **kontrolliert sollte das geschehen**. |
| **`llms.txt`** | **FEHLT** | Neuer Quasi-Standard (analog `robots.txt`) als kuratierte Übersicht für LLMs. |
| **`llms-full.txt`** | **FEHLT** | Volltext-Variante. |
| **Structured Content for LLMs** | **TEILS** | Blog-Texte sind in HTML, kein klares "Schema → Frage → Antwort"-Muster (LLMs lieben FAQ-Listen, Definitionen, Vergleichstabellen). |
| **Entity-Disambiguation** | **TEILS** | `LocalBusiness` Schema gibt `@id` (`https://alltagsengel.care/#organization`) — gut. Kein `sameAs` zu Wikidata/Wikipedia/Branchenbuch — könnte LLMs helfen, die Entität zu erkennen. |
| **Brand-Mentions im Web** | **EXTERN** | Erfordert PR-Strategie, nicht Code. (Backlinks von Pflege.de, Wer-zu-wem.de, Senioren-Foren → siehe Welle 5.) |

### 1.4 Performance / Core Web Vitals

| Bereich | Status | Detail / Befund |
|---|---|---|
| **Real-User Web Vitals Reporting** | **FEHLT** | Kein `web-vitals` Package installiert. Keine `reportWebVitals()` Funktion. **Wir kennen unseren INP/LCP-Wert nicht.** |
| **CrUX / PageSpeed Insights** | **EXTERN** | Daten in Search Console verfügbar, nicht im Admin. |
| **Lighthouse CI** | **FEHLT** | Kein automatisierter Performance-Regression-Schutz. |
| **Sentry Performance** | **OK** | `tracesSampleRate: 0.1` in Prod. Transaktionen werden erfasst. |
| **Bundle-Analyzer** | **OK** | `@next/bundle-analyzer` via `ANALYZE=true npm run build`. |
| **Image-Optimization** | **OK** | `sharp` + Next-Image automatisch. |
| **Caching-Strategy** | **OK** | Static Pages cached durch Vercel + Service-Worker (`public/sw.js`). |

### 1.5 Eigenes Tracking (Supabase-DB)

| Bereich | Status | Detail / Befund |
|---|---|---|
| **`visitors` Tabelle** | **OK** | Pro PageView eine Row mit IP, Geo (Vercel-Header + ip-api.com Enrichment: PLZ, ISP, Stadtteil, Lat/Lng, Timezone), User-Agent, Referrer, UTMs, gclid/fbclid. **Inkl. Server-Side IP-Geo-Cache** (1h TTL, max 500 Einträge). |
| **`visitor_locations` Tabelle** | **OK** | Pro PageView eine Row mit Portal-Klassifikation (kunde/engel/fahrer/landing/admin), Source ('ip-api'/'vercel'/'ip'). |
| **`page_views` Tabelle** | **OK** | Authentifizierte User-Sessions: User-ID, Path, Label, Viewport-Width, Timestamp. |
| **Watched-Cities-Alert** | **OK** | `/api/visitor-alert` triggert bei PLZ 60318/60320/60322/35260/36304/35037 oder Cities `stadtallendorf/alsfeld/marburg/nordend`. (Hartcodierte Liste — sollte konfigurierbar werden.) |
| **Conversion-Backup** | **OK** | `/api/track-conversion` speichert Google-Ads-Conversions server-seitig (gclid + SHA256-Email/Phone) → für Offline-Conversion-Upload. |
| **Rate-Limiting** | **OK** | In-Memory pro IP (10 Visits/Min, 30 Conv/Min). In serverless ungenau (jede Lambda-Instance separat), aber 80%-Lösung. |
| **DSGVO-Konformität** | **TEILS** | Visitor-Tracking läuft **nur** nach Consent (`consent !== 'accepted' → return`). UTM/gclid wird **vor** Consent persistiert — als "funktionale Conversion-Parameter" begründet (`Art. 6 Abs. 1 lit. f`). **Aber:** IP wird in DB gespeichert — IP ist personenbezogen → muss in Datenschutzerklärung explizit gelistet sein, und Cookie-Banner ist heute binär (Accept/Reject) statt granular (Notwendig / Statistik / Marketing). Risiko bei DSGVO-Beschwerde. |
| **Bewertung** | **BEHALTEN** | **Empfehlung:** Behalten + parallelisieren, **nicht** ersetzen. Das eigene Tracking liefert Daten, die GA4 nie liefert (IP, ISP, PLZ, Stadtteil — Geld wert für lokale Pflege-Akquise). GA4 für Verhaltens-/Funnel-Analyse zusätzlich. Doppelter Datensatz, eine Quelle der Wahrheit pro Frage. |

### 1.6 Admin-Dashboard (`/admin/analytics`)

| Bereich | Status | Detail / Befund |
|---|---|---|
| **Tabs** | **OK** | `visitors`, `live`, `pages`, `users` — Basics da. |
| **Date-Filter** | **OK** | today/7d/30d/all. |
| **Conversion-Funnel** | **FEHLT** | Wie viele Visitors → Registrierungen → Buchungen? |
| **Channel-Attribution** | **FEHLT** | Welche UTM-Kampagne hat geliefert? gclid → Buchung Verbindung sichtbar? |
| **GA4-Integration** | **FEHLT** | GA4-Data-API → eingebettet im Admin. |
| **GSC-Integration** | **FEHLT** | GSC-API (Top-Queries, CTR, Position) → Admin. |
| **Google Ads-Performance** | **FEHLT** | Google Ads API → CAC/ROAS im Admin. |
| **Heatmap / Session-Replay** | **FEHLT** | (Bewusst zurückgestellt — Pflege-Daten = sensibel.) |

### 1.7 App-spezifisch (iOS/Android via Capacitor)

| Bereich | Status | Detail / Befund |
|---|---|---|
| **Universal Links (iOS)** | **TEILS** | `public/.well-known/apple-app-site-association` existiert. **Aber:** `appID` enthält Platzhalter `TEAMID.care.alltagsengel.app` → **muss durch echten Apple Developer Team-ID ersetzt werden, sonst funktionieren Deep Links NICHT.** |
| **App Links (Android)** | **TEILS** | `public/.well-known/assetlinks.json` existiert. **SHA256 Cert-Fingerprint ist `TODO:REPLACE_WITH_ACTUAL_SHA256_FINGERPRINT`** → Deep Links broken auf Android. |
| **iOS ATT (App Tracking Transparency)** | **n/a / FEHLT** | `Info.plist` hat **keine** `NSUserTrackingUsageDescription`. Wir lesen heute auch keinen IDFA, also formal nicht nötig. Sobald wir Firebase Analytics oder Facebook SDK nativ einbauen → **Pflicht**, sonst App-Reject. |
| **Firebase / GA4-for-Apps** | **FEHLT** | Web-GA4 zählt App-Sessions als Web-Traffic. Saubere Lösung: Firebase SDK + Capacitor-Bridge → echtes App-Stream. |
| **App-Store-Connect Analytics** | **EXTERN** | Vorhanden (Apple), nicht im Admin sichtbar. |
| **Google Play Console Analytics** | **EXTERN** | Vorhanden, nicht im Admin sichtbar. |
| **Push Notification Tracking** | **TEILS** | `NativePushProvider` + `PushProvider` existieren. Open-Rate / CTR werden aktuell nicht in DB geschrieben. |
| **In-App-Conversion-Tracking** | **FEHLT** | Wenn ein App-Nutzer im WebView eine Buchung macht, feuert `trackBooking()` zwar in der WebView, aber gtag ist im Native-Kontext zwar geladen, dataLayer-Events kommen nicht bei GA4/Google-Ads an (CORS/Cookie-Verhalten im WKWebView). Erkenntnis: **Conversions aus App fließen heute nicht in Google Ads.** |

### 1.8 Zusammenfassung Ist-Analyse

**Stark:**
- Eigenes Server-Side-Tracking mit IP-Geo + UTM/gclid + Conversion-Backup.
- Consent Mode v2 korrekt implementiert.
- Pixel-Setup (Google Ads, Meta, TikTok) sauber, DSGVO-bewusst.
- Sentry Error- + Performance-Tracking.

**Mittelstark:**
- SEO-Grundlagen (Sitemap, Robots, JSON-LD für LocalBusiness + FAQ).
- Admin-Dashboard zeigt Roh-Visits.

**Schwach / blockierend:**
- **GA4 fehlt komplett.** Keine Verhaltens-/Funnel-/Cohort-Analyse.
- **App-Tracking 0.** Wir sind blind auf iOS-/Android-Nutzer.
- **Universal Links broken** (TEAMID / SHA256 Platzhalter).
- Sitemap statisch & hardcoded → SEO-Risiko bei neuen Inhalten.
- Kein Article-Schema auf Blog → SEO verschenkt.
- Kein GEO / LLM-Optimization → ChatGPT/Perplexity verweisen nicht auf uns.
- Kein Web-Vitals Reporting → Performance-Regressionen unsichtbar.

---

## 2 — Prioritäten-Matrix

```
                  HIGH IMPACT
                       │
         (Q1) │     (FOUNDATION)
              │   • GA4 Setup (Web + App)
              │   • Universal Links Fix
              │   • Sitemap dynamic + Article Schema
              │   • Web-Vitals Reporting
   LOW EFFORT │── ─ ─ ─ ─ ─ ─ ─ ─ ─ HIGH EFFORT
              │     (SCALE)
              │   • Meta/TikTok CAPI
              │   • GA4 + GSC + Ads im Admin
              │   • Firebase + ATT iOS
              │   • llms.txt + AI-Crawler-Policy
              │   • Lighthouse CI
                       │
                   LOW IMPACT
```

**Foundation Layer (Wellen 1–3)**: Was wir SOFORT brauchen, damit wir nicht weiter blind sind.

**Scale Layer (Wellen 4–7)**: Was uns vom "haben Tracking" zum "nutzen Tracking strategisch" bringt.

---

## 3 — Architekturplan (Web ↔ App abgestimmt)

### 3.1 Datenflussdiagramm

```
┌──────────────────────────────────────────────────────────────────┐
│                    USER (Web Browser / iOS App / Android App)    │
└────────────┬───────────────────────┬─────────────────────────────┘
             │                       │
             │ alltagsengel.care     │ care.alltagsengel.app
             │ (HTTPS direkt)        │ (Capacitor WebView → HTTPS)
             ▼                       ▼
┌──────────────────────────────────────────────────────────────────┐
│              NEXT.JS APP (Vercel Edge)                           │
│  ┌──────────────────┐  ┌─────────────────────────────────────┐   │
│  │ React Components │  │ Detection: isNativePlatform()       │   │
│  │  + GTM/gtag      │  │   → Stream-ID: web / ios / android  │   │
│  └────────┬─────────┘  └──────────────┬──────────────────────┘   │
└───────────┼─────────────────────────  ┼──────────────────────────┘
            │                           │
            │ Client-Side Events        │ Stream-Aware
            ▼                           ▼
┌────────────────────┐  ┌────────────────────────────────────────┐
│ DataLayer / gtag   │  │ /api/track  (Server-Side, AdBlock-safe)│
│  → GTM             │  │ /api/track-conversion                  │
│  → GA4 (G-XXX)     │  │ /api/ga4-mp  (Measurement Protocol)    │
│  → Google Ads      │  │ /api/meta-capi (Conversion API)        │
│  → Meta Pixel      │  │ /api/tiktok-events                     │
│  → TikTok Pixel    │  └─────────────┬──────────────────────────┘
└──────┬─────────────┘                │
       │                              │
       ▼                              ▼
┌───────────────────┐    ┌────────────────────────────────────────┐
│ EXTERNAL          │    │ SUPABASE                               │
│ • GA4 (3 Streams) │    │ • visitors / visitor_locations         │
│ • Google Ads      │    │ • page_views                           │
│ • Meta Ads        │    │ • conversions (server-mirror)          │
│ • TikTok Ads      │    │ • app_events (neu, App-spezifisch)     │
│ • Sentry          │    │ • web_vitals (neu)                     │
└─────┬─────────────┘    └────────────────┬───────────────────────┘
      │                                   │
      │ Server-to-Server                  │ Supabase Client
      ▼                                   ▼
┌──────────────────────────────────────────────────────────────────┐
│         ADMIN-DASHBOARD (/admin/analytics)                       │
│  • Eigenes Tracking (Live, Realtime, IP-Geo, Watched-Areas)      │
│  • GA4 Data API (Funnel, Cohorts, Retention)                     │
│  • GSC Search Analytics API (Queries, CTR, Position)             │
│  • Google Ads API (CAC, ROAS, Conv-Rate per Kampagne)            │
│  • Meta/TikTok Insights API (CPM, CTR, ROAS)                     │
│  • Web-Vitals (CrUX + RUM)                                       │
└──────────────────────────────────────────────────────────────────┘
```

### 3.2 GA4-Property-Struktur (modular, ein Account)

**Eine GA4-Property** `Alltagsengel` mit **drei Streams**:

| Stream | Plattform | Measurement-ID | Datenquelle |
|---|---|---|---|
| Web | alltagsengel.care | `G-WEBXXXXXX` | gtag.js |
| iOS App | care.alltagsengel.app | Firebase App-ID `1:xxx:ios:xxx` | Firebase SDK (Capacitor-Plugin `@capacitor-community/firebase-analytics`) |
| Android App | care.alltagsengel.app | Firebase App-ID `1:xxx:android:xxx` | Firebase SDK |

**Vorteil:** Eine User-ID kann über Streams hinweg gemerged werden (User-ID-Feature) → "User registriert sich Web → bucht App" wird als **ein** User gezählt.

### 3.3 Einheitliche Event-Namensgebung (Schema)

Pflicht, damit GA4-Reports konsistent über Streams hinweg funktionieren:

| Event | Auslöser | Standard-Parameter (Web + App identisch) |
|---|---|---|
| `page_view` | automatisch (Web) / manuell (App) | `page_path`, `page_title`, `portal` (kunde/engel/fahrer/landing) |
| `sign_up` | Registrierung abgeschlossen | `method`, `user_role` (kunde/engel/fahrer) |
| `login` | erfolgreicher Login | `method` |
| `view_engel` | Engel-Profil aufgerufen | `engel_id`, `radius_km` |
| `select_service` | Service ausgewählt im Buchungsflow | `service_type`, `duration_hours` |
| `begin_checkout` | Buchungs-Wizard Schritt 1 | `service_type`, `value` |
| `purchase` | Buchung bestätigt | `transaction_id`, `value`, `currency`, `items[]` |
| `contact` | Kontaktformular abgesendet | `source` (lp/footer/kontakt-page) |
| `phone_click` | Telefon-Link geklickt | `source` |
| `whatsapp_click` | WhatsApp-Button geklickt | `source` |
| `app_install_prompt_shown` | Install-Banner gezeigt | (Web only) |
| `app_install_prompt_accepted` | Banner-Klick | (Web only) |
| `push_notification_received` | (nur App) Push empfangen | `campaign_id` |
| `push_notification_opened` | Push geöffnet | `campaign_id` |

GA4 hat einige Events als Standard (`page_view`, `sign_up`, `login`, `purchase`) — diese geben uns automatisch Reports. Custom-Events (`view_engel`, `select_service`) müssen wir in GA4 als Custom Dimension registrieren.

### 3.4 Modulare Code-Struktur

```
lib/analytics/
├── index.ts                 # Single Entry: track(event, params)
├── platform.ts              # detectPlatform(): 'web' | 'ios' | 'android'
├── adapters/
│   ├── ga4.ts               # gtag wrapper (web) + Firebase (app)
│   ├── google-ads.ts        # Conversion calls
│   ├── meta.ts              # fbq + CAPI fetch
│   ├── tiktok.ts            # ttq + Events API
│   └── supabase.ts          # /api/track endpoint
├── events.ts                # Typed Event-Catalog (oben Tabelle)
├── consent.ts               # getConsent / onConsentChange
└── attribution.ts           # gclid/fbclid/utm Persistierung
```

Komponenten rufen nur `import { track } from '@/lib/analytics'` — Adapters entscheiden plattformspezifisch, wohin das Event geht.

---

## 4 — Datenbankstruktur (neue Tabellen)

### 4.1 Behalten / Erweitern (existierend)

```sql
-- visitors (BEHALTEN, ergänzen um device_type, app_version)
ALTER TABLE public.visitors ADD COLUMN IF NOT EXISTS device_type text;       -- 'web' | 'ios' | 'android'
ALTER TABLE public.visitors ADD COLUMN IF NOT EXISTS app_version text;       -- z.B. '1.4.2'
ALTER TABLE public.visitors ADD COLUMN IF NOT EXISTS session_id text;        -- für Funnel-Tracking
```

### 4.2 Neu

```sql
-- conversions (Server-Mirror aller Conversion-Events)
CREATE TABLE IF NOT EXISTS public.conversions (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  event_name      text NOT NULL,             -- 'sign_up' | 'purchase' | ...
  event_value     numeric(10,2),
  currency        text DEFAULT 'EUR',
  platform        text NOT NULL,             -- 'web' | 'ios' | 'android'
  gclid           text,
  fbclid          text,
  utm_source      text,
  utm_medium      text,
  utm_campaign    text,
  email_hashed    text,                      -- SHA256 (lowercase)
  phone_hashed    text,
  client_id       text,                      -- GA4 client_id / Firebase install_id
  session_id      text,
  ip              inet,
  user_agent      text,
  ga4_sent        boolean DEFAULT false,     -- erfolgreich an GA4 Measurement Protocol geschickt
  meta_sent       boolean DEFAULT false,     -- erfolgreich an Meta CAPI
  tiktok_sent     boolean DEFAULT false,
  ads_sent        boolean DEFAULT false,     -- Google Ads Offline-Conv (für Backfill)
  created_at      timestamptz DEFAULT now(),
  metadata        jsonb DEFAULT '{}'
);
CREATE INDEX idx_conversions_created  ON public.conversions(created_at DESC);
CREATE INDEX idx_conversions_event    ON public.conversions(event_name);
CREATE INDEX idx_conversions_platform ON public.conversions(platform);
CREATE INDEX idx_conversions_gclid    ON public.conversions(gclid) WHERE gclid IS NOT NULL;

-- web_vitals (Real-User-Monitoring)
CREATE TABLE IF NOT EXISTS public.web_vitals (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id  text NOT NULL,
  page_path   text NOT NULL,
  metric      text NOT NULL,            -- 'LCP' | 'INP' | 'CLS' | 'FCP' | 'TTFB'
  value       numeric NOT NULL,
  rating      text,                     -- 'good' | 'needs-improvement' | 'poor'
  navigation_type text,                  -- 'navigate' | 'reload' | 'back_forward'
  device_type text,                     -- 'web' | 'ios' | 'android' | 'mobile' | 'desktop'
  user_agent  text,
  created_at  timestamptz DEFAULT now()
);
CREATE INDEX idx_web_vitals_created ON public.web_vitals(created_at DESC);
CREATE INDEX idx_web_vitals_metric  ON public.web_vitals(metric, page_path);

-- app_events (App-spezifisch: Push, Open-Rate, Universal-Link-Hits)
CREATE TABLE IF NOT EXISTS public.app_events (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  event_name      text NOT NULL,        -- 'push_received' | 'push_opened' | 'app_open' | 'universal_link_open'
  platform        text NOT NULL,        -- 'ios' | 'android'
  app_version     text,
  os_version      text,
  device_model    text,
  campaign_id     text,                 -- bei push_*
  link_path       text,                 -- bei universal_link_open
  metadata        jsonb DEFAULT '{}',
  created_at      timestamptz DEFAULT now()
);
CREATE INDEX idx_app_events_created ON public.app_events(created_at DESC);
CREATE INDEX idx_app_events_user    ON public.app_events(user_id);
CREATE INDEX idx_app_events_event   ON public.app_events(event_name);

-- watched_areas (hartcodierte PLZ/Cities aus /api/track auslagern)
CREATE TABLE IF NOT EXISTS public.watched_areas (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  type        text NOT NULL CHECK (type IN ('postal_code', 'city', 'district')),
  value       text NOT NULL,
  label       text,                       -- 'Frankfurt Nordend', 'Stadtallendorf', ...
  notify_emails text[] DEFAULT '{}',      -- wer wird benachrichtigt
  active      boolean DEFAULT true,
  created_at  timestamptz DEFAULT now()
);

-- RLS (alle: anon kann inserten via service_role, admin liest)
ALTER TABLE public.conversions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.web_vitals    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_events    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watched_areas ENABLE ROW LEVEL SECURITY;
-- (Policies analog zu visitors: insert public, select admin-only)
```

---

## 5 — API-Struktur (neue Endpoints)

| Endpoint | Methode | Zweck | Auth |
|---|---|---|---|
| `/api/track` (existiert) | POST | PageView in `visitors` | anon (Rate-Limited) |
| `/api/track-conversion` (existiert) | POST | Conversion-Backup | anon (Rate-Limited) |
| `/api/analytics/ga4-mp` (NEU) | POST | Measurement Protocol Proxy → schickt Event server-seitig an GA4 | anon (Rate-Limited) |
| `/api/analytics/meta-capi` (NEU) | POST | Meta Conversion API Proxy | anon |
| `/api/analytics/tiktok-events` (NEU) | POST | TikTok Events API Proxy | anon |
| `/api/analytics/web-vitals` (NEU) | POST | RUM-Daten in `web_vitals` | anon |
| `/api/analytics/app-event` (NEU) | POST | App-Events (Push, Universal-Link) | bearer (Capacitor) |
| `/api/admin/analytics/ga4` (NEU) | GET | GA4 Data API Proxy (Dashboard) | admin-only |
| `/api/admin/analytics/gsc` (NEU) | GET | GSC Search Analytics API Proxy | admin-only |
| `/api/admin/analytics/google-ads` (NEU) | GET | Google Ads API Proxy | admin-only |
| `/api/admin/analytics/funnel` (NEU) | GET | Aggregierter Funnel aus `conversions` | admin-only |
| `/api/llms.txt` (NEU) | GET | Statisches llms.txt File (oder via `app/llms.txt/route.ts`) | public |

### 5.1 OAuth / Service-Account-Tokens

- **GA4 Data API**: Google Service Account JSON → `GA4_SERVICE_ACCOUNT_KEY` (Base64) + Property-ID `GA4_PROPERTY_ID`. Property muss in GA4-Admin freigegeben werden.
- **GSC API**: Gleicher Service Account → in GSC-Admin als "Restricted User" hinzufügen.
- **Google Ads API**: OAuth2 Refresh-Token + Developer-Token + Login-Customer-ID. Komplex (Antrags-Prozess für Developer-Token, ~1–3 Tage).
- **Meta CAPI**: System User Access Token aus Business Manager + Pixel-ID.
- **TikTok Events API**: Access Token aus TikTok Ads Manager + Pixel-ID.

`google-auth-library` ist bereits installiert (`package.json`) → keine neue Dep nötig für GA4/GSC.

---

## 6 — Wellen-Plan (Schritt-für-Schritt-Umsetzung)

Jede Welle ist als eigene Branch + PR planbar. Geschätzter Aufwand pro Welle in Klammern.

### Welle 1 — Foundation: GA4 + Hygiene (2–3 Tage)

**Ziel:** Wir messen User-Verhalten, nicht nur Conversions. Sitemap robust. Schema komplett.

1. **GA4-Property anlegen** (extern, Yusuf)
   - GA4-Property `Alltagsengel` erstellen.
   - Web-Stream → Measurement-ID `G-XXXXXXX`.
   - In `.env.example` + Vercel-Env: `NEXT_PUBLIC_GA4_ID=G-XXXXXXX`.
2. **GA4 Web-Integration** (`components/GoogleTagManager.tsx` erweitern)
   - Zweites `gtag('config', GA4_ID, { send_page_view: false })` — wir feuern `page_view` manuell aus dem App-Router (sonst doppelte Counts bei Next-Navigation).
   - `components/PageTracker.tsx` (existiert!) erweitern: bei jedem `pathname`-Change `gtag('event', 'page_view', { page_path, page_title, portal })`.
3. **Sitemap dynamisch** (`app/sitemap.ts`)
   - Statische Liste durch DB-Query ersetzen: alle Blog-Slugs aus File-System glob (`fs.readdirSync('app/blog')`) statt hardcoded.
   - `public/sitemap.xml` löschen (Konflikt mit Next-generiertem `/sitemap.xml`).
4. **Article-Schema auf Blog**
   - `app/blog/layout.tsx` oder pro Post: `BlogPosting` + `Person` Author-Schema.
5. **BreadcrumbList global**
   - `components/Breadcrumb.tsx` (existiert? prüfen) + JSON-LD im Layout der jeweiligen Sub-Route.
6. **Canonical-Fix**
   - In jeder Sub-Page-`metadata`: `alternates: { canonical: '<absolute-url>' }`.

**Verifikation:** Google Tag Assistant zeigt GA4-Hit; Rich-Results-Test zeigt Article+Breadcrumb; `/sitemap.xml` enthält alle Blog-Posts dynamisch.

**Externes Setup:** GA4-Property, Measurement-ID in Vercel-Env.

---

### Welle 2 — App-Tracking (3–4 Tage)

**Ziel:** Wir wissen, was App-User tun. Universal Links funktionieren wirklich.

1. **Universal Links Fix** (kritisch, Deep Links sind heute kaputt)
   - Apple Developer Team-ID besorgen → in `public/.well-known/apple-app-site-association` `TEAMID` ersetzen.
   - Android Signing Cert SHA256 Fingerprint extrahieren (`./gradlew signingReport` oder Play Console → App-Integrität) → in `public/.well-known/assetlinks.json` einsetzen.
   - Apple-Validator + Google-Validator durchlaufen lassen.
2. **App-Tracking re-aktivieren**
   - `components/VisitorTracker.tsx`: Native-Branch entfernen, statt dessen `device_type: 'ios'|'android'` mitsenden.
   - `lib/tracking.ts`: gtag-Calls funktionieren im WKWebView **mit** dem Trick, dass GA4 Measurement Protocol vom Server gefeuert wird (siehe Punkt 4).
3. **Capacitor-Plugin für native Events**
   - `@capacitor-community/firebase-analytics` installieren (oder eigenes Plugin als Native-Bridge).
   - In App-Capacitor-Plugin-Config: Firebase iOS-App + Android-App registrieren (Firebase-Console).
   - Events doppelt feuern: Web-gtag (für GTM/Meta) + Firebase (für GA4-App-Stream).
4. **`/api/analytics/ga4-mp` (Measurement Protocol)**
   - Server-Side: nimmt Event aus App, schickt an `https://www.google-analytics.com/mp/collect?api_secret=XXX&measurement_id=G-XXX`.
   - Vorteil: kommt durch jeden AdBlocker & WKWebView-CORS-Quirk.
   - Speichert parallel in `conversions`-Tabelle (siehe oben).
5. **App-Event-Endpoint `/api/analytics/app-event`**
   - Push-Open, Universal-Link-Open, App-Start → `app_events` Tabelle.
6. **ATT-Vorbereitung iOS**
   - `Info.plist`: `NSUserTrackingUsageDescription = "AlltagsEngel nutzt anonyme Nutzungsdaten, um die App zu verbessern."`.
   - `@capacitor-community/app-tracking-transparency` Plugin → vor Firebase-Init `requestTrackingAuthorization()`.
   - Nur bei `granted` → IDFA an Meta SDK weitergeben. Bei `denied` → trotzdem GA4-Stream (ohne IDFA).

**Verifikation:** Universal-Link `https://alltagsengel.care/kunde/buchung/123` öffnet App direkt (statt Safari). GA4-Echtzeit zeigt App-Stream-Events. Push-Open landet in `app_events`.

**Externes Setup:** Apple Team-ID, Android SHA256, Firebase-Projekt + iOS-/Android-Apps registrieren, ATT-Plugin in Xcode-Build.

---

### Welle 3 — Performance + Web-Vitals (1–2 Tage)

**Ziel:** Wir kennen LCP/INP/CLS realer User. Performance-Regressionen werden sichtbar.

1. `npm i web-vitals`
2. `components/WebVitalsReporter.tsx`: hört auf `onCLS, onINP, onLCP, onFCP, onTTFB` → `fetch('/api/analytics/web-vitals', ...)`.
3. `/api/analytics/web-vitals` → schreibt in `web_vitals` Tabelle.
4. Optional: parallel an GA4 als `event: 'web_vitals'` (für Vergleich GA4 vs. RUM).
5. Lighthouse CI in GitHub Actions: PR-Check, blockt Regressionen >10 %.
6. Admin-Dashboard: neuer Tab "Performance" — p75 LCP/INP/CLS pro Seite, letzte 7 Tage.

**Verifikation:** `web_vitals`-Tabelle füllt sich nach 1 h mit ~hundert Rows. Admin zeigt p75 pro Page.

---

### Welle 4 — Server-Side Conversion Tracking (Meta CAPI + TikTok Events) (2 Tage)

**Ziel:** Conversion-Daten kommen auch bei iOS-Safari + AdBlock + WebView durch.

1. **`/api/analytics/meta-capi`**
   - Bei jeder Conversion zusätzlich Server-to-Server Call an Graph API `/PIXEL_ID/events`.
   - `event_id` mitsenden, damit Meta Browser- + Server-Event dedupliziert.
2. **`/api/analytics/tiktok-events`** analog.
3. **`lib/tracking.ts` erweitern**: nach `fbq('track', ...)` zusätzlich `fetch('/api/analytics/meta-capi', ...)`.
4. **Match-Quality erhöhen**: Email-/Phone-Hash (SHA256) bei jedem Conversion-Call mitschicken.

**Verifikation:** Meta Events Manager → "Event Match Quality" >7. Test-Conversions zeigen "Browser + Server" beide grün.

**Externes Setup:** Meta System User Token, TikTok Events API Token.

---

### Welle 5 — GEO / LLM-SEO (2 Tage)

**Ziel:** Wir tauchen in ChatGPT/Perplexity/Gemini-Antworten als Quelle auf.

1. **`/llms.txt`** (Route Handler `app/llms.txt/route.ts`)
   - Kuratierte Übersicht: 1) was sind wir, 2) Kernleistungen mit Links, 3) FAQs (Top 10), 4) Kontakt/Adresse, 5) Pflegekassenleistungen-Glossar.
2. **`/llms-full.txt`**: Volltext-Konkatenation aller Blog-Posts in stark strukturierter MD-Form (H2 = Frage, Absatz = Antwort).
3. **robots.txt erweitern** (kontrollierte AI-Crawler-Policy)
   ```
   User-agent: GPTBot
   Allow: /
   Disallow: /admin /api /kunde /engel /fahrer

   User-agent: ClaudeBot
   Allow: /
   ...

   User-agent: PerplexityBot
   Allow: /

   User-agent: Google-Extended
   Allow: /

   User-agent: CCBot
   Disallow: /   # Common Crawl explizit blocken (zu viele Scraper-Forks)
   ```
4. **Content-Struktur in Blog-Posts**: Jeder Post bekommt am Anfang eine TL;DR-Antwort-Box (Speakable-Schema!), Q&A-Headlines (H2 = Frage), Vergleichstabellen wo sinnvoll. LLMs zitieren strukturierten Content 4× häufiger.
5. **Entity-Stärkung**: `LocalBusiness`-JSON-LD um `sameAs` für Wikidata (falls Eintrag), Branchenbücher (Gelbe Seiten, Wer-zu-wem) erweitern.
6. **Speakable-Schema** auf FAQ-Seite + Blog-TL;DRs.

**Verifikation:** Perplexity-Suche "Was ist der Entlastungsbetrag?" → unsere Seite in den Quellen. ChatGPT (mit Web-Suche) zitiert uns bei "Alltagsbegleiter Frankfurt".

---

### Welle 6 — Admin-Dashboard 2.0 (3–5 Tage)

**Ziel:** Yusuf öffnet `/admin/analytics` und sieht **alles** in einem Dashboard, ohne 8 Tabs in 5 Tools wechseln zu müssen.

1. **GA4 Data API Proxy** (`/api/admin/analytics/ga4`) — Service Account → letzte 30 Tage Sessions, Top-Events, Funnel.
2. **GSC API Proxy** — Top-Queries, Klick-Position, CTR pro URL.
3. **Google Ads API Proxy** — CAC, ROAS, Conv-Rate pro Kampagne (Antrag Developer-Token nicht vergessen, dauert).
4. **Meta + TikTok Insights API** — CPM, CTR, ROAS.
5. **Eigene Funnel-View** aus `conversions`-Tabelle: Visitor → SignUp → Booking pro UTM-Source.
6. **Live-Karte** der watched_areas + Live-Visits (existiert in Ansätzen → erweitern).
7. **Alert-Regeln-UI** für `watched_areas` (heutige Hardcode-Liste konfigurierbar machen).

**Verifikation:** Admin-Page lädt unter 2 s, zeigt heutige Conversions + Top-Query + Live-Visitors auf einer Übersicht.

**Externes Setup:** Service Accounts wie oben.

---

### Welle 7 — DSGVO / ATT-Härtung + Cookie-Banner 2.0 (1–2 Tage)

**Ziel:** Rechtssicher. Wenn morgen ein Anwalt schreibt, haben wir alle Antworten.

1. **Cookie-Banner granular** (heute binär)
   - 3 Kategorien: Notwendig (immer) / Statistik (GA4 + eigenes Tracking) / Marketing (Meta + TikTok + Google Ads).
   - Schalter speichern in `ae_cookie_consent_v2` (JSON), alten Key migrieren.
2. **Consent Mode v2 Update-Calls** je Kategorie:
   - `analytics_storage = granted` bei Statistik-Opt-In.
   - `ad_storage / ad_user_data / ad_personalization = granted` bei Marketing-Opt-In.
3. **Datenschutzerklärung** (`app/datenschutz/page.tsx`): explizit GA4, Meta Pixel + CAPI, TikTok, eigene IP/Geo-Erfassung, App-Tracking via Firebase, ATT auf iOS.
4. **iOS ATT**: NSUserTrackingUsageDescription + In-App-Erklärung **vor** dem System-Dialog (Apple-Best-Practice — höhere Opt-In-Rate).
5. **Right-to-Erasure (Art. 17)**: `/api/user/delete-tracking-data` → löscht User aus `visitors`, `conversions`, `app_events` per `user_id` oder email_hash.

**Verifikation:** Cookie-Banner zeigt 3 Schalter. Bei Reject-All wird **kein** Pixel geladen (Network-Tab). ATT-Dialog erscheint beim ersten App-Start nach Update.

---

## 7 — Pakete / Bibliotheken (konkret)

**Neu zu installieren:**

```jsonc
{
  "dependencies": {
    "web-vitals": "^4.x",                                  // RUM
    "@capacitor-community/firebase-analytics": "^7.x",     // GA4 for Apps via Firebase
    "@capacitor-community/app-tracking-transparency": "^7.x", // iOS ATT
    "@google-analytics/data": "^4.x"                       // GA4 Data API (Server)
  },
  "devDependencies": {
    "@lhci/cli": "^0.14.x"                                 // Lighthouse CI
  }
}
```

**Schon vorhanden, nutzbar:**
- `google-auth-library` (für GA4/GSC Service Account OAuth)
- `@sentry/nextjs` (Performance + Error)
- `@supabase/ssr` (Server-Reads in Admin)

**Bewusst NICHT:**
- ❌ Hotjar / Microsoft Clarity — Session-Recordings bei Pflege-Daten = Risiko.
- ❌ Plausible / Fathom — überlappen mit GA4 + eigenem Tracking, kein Mehrwert.
- ❌ Firebase Auth — wir nutzen Supabase Auth.

---

## 8 — Externe Services & Kostenschätzung (ehrlich)

| Service | Plan | Kosten / Monat |
|---|---|---|
| **GA4** | Standard | 0 € (Limit 10 Mio Events/Monat — bei uns weit darunter) |
| **GSC** | Free | 0 € |
| **Google Ads API** | Free Tier (15.000 Operations/Tag) | 0 € |
| **Firebase** (für App-GA4) | Spark (Free) | 0 € (bis 50 k MAU) |
| **Meta CAPI** | Free | 0 € |
| **TikTok Events API** | Free | 0 € |
| **Vercel** | Pro (vermutlich schon) | $20 (bestehend) |
| **Supabase** | Pro (vermutlich schon) | $25 (bestehend) |
| **ip-api.com** | Free Tier (45 req/min) | 0 € — bei Skalierung Pro-Plan $13/Monat |
| **Sentry** | Team (vermutlich schon) | $26 (bestehend) |
| **Lighthouse CI** | OSS (eigener Runner via GH Actions) | 0 € |
| **Apple Developer** | Pflicht für App | 99 $ / Jahr (existiert) |
| **Google Play Developer** | Pflicht für App | 25 $ einmalig (existiert) |
| **Hreflang / SEO-Tools** (optional) | Ahrefs/Semrush Lite | 100–200 €/Monat (skip) |

**Neue laufende Kosten: 0 €** — alle Tracking-Services im Free-Tier.

**Aufwand für Yusuf (extern):** ~4 h für GA4-Setup, Firebase-Setup, OAuth-Tokens.

---

## 9 — Was Yusuf besorgen muss (Checkliste)

**Apple / iOS:**
- [ ] **Apple Developer Team-ID** (10-Zeichen, aus developer.apple.com → Membership) → `apple-app-site-association` Patch.
- [ ] **Firebase iOS App** registrieren mit Bundle-ID `care.alltagsengel.app` → `GoogleService-Info.plist` herunterladen → in `ios/App/App/` ablegen.
- [ ] **App Store Connect Privacy-Nutrition-Labels** updaten, sobald Welle 2 live: "Identifiers, Usage Data, Diagnostics" → "Linked to You" + Tracking.

**Android:**
- [ ] **App Signing SHA256 Fingerprint** aus Play Console → App-Integrität → App-Signing-Schlüssel → SHA-256 (oder `keytool -list -v -keystore ~/.android/debug.keystore` für Dev-Build) → `assetlinks.json` Patch.
- [ ] **Firebase Android App** registrieren mit Package `care.alltagsengel.app` → `google-services.json` → in `android/app/` ablegen.

**Google:**
- [ ] **GA4-Property** "Alltagsengel" erstellen → Web-Stream + iOS-Stream + Android-Stream → 3 Measurement-IDs notieren.
- [ ] **GA4 Measurement Protocol API Secret** (für Server-Side Events) → GA4-Admin → Datenstreams → Measurement Protocol API Secrets.
- [ ] **GA4 + GSC Service Account** in GCP Console → JSON-Key → Base64 → in Vercel-Env `GA4_SERVICE_ACCOUNT_KEY` und `GSC_SERVICE_ACCOUNT_KEY` (oder denselben für beides).
- [ ] **GA4-Property → Admin → Account Access Management** → Service-Account-Email als "Viewer" hinzufügen.
- [ ] **GSC-Property → Settings → Users and permissions** → Service-Account-Email als "Restricted" hinzufügen.
- [ ] **Google Ads Developer Token** beantragen (1–3 Tage Bearbeitung) → MCC-Account → API-Center → Apply.
- [ ] **Google Ads OAuth2 Refresh-Token** generieren (via oauth2-playground oder eigenes Script).

**Meta:**
- [ ] **Meta System User Access Token** aus Business Manager → Geschäftsintegrationen → System-User → Token mit `ads_management`+`business_management` Permissions → speichern als `META_CAPI_ACCESS_TOKEN`.
- [ ] **Meta Pixel-ID** schon vorhanden (env `NEXT_PUBLIC_META_PIXEL_ID`).

**TikTok:**
- [ ] **TikTok Events API Access Token** aus Ads Manager → Events Manager → API Access.

**Bing:**
- [ ] **Bing Webmaster Tools** → Site verifizieren (TXT-Record oder XML-File im `/public`).

---

## 10 — Die 5 Workstreams (parallel ausführbar nach Welle 1)

Jeder Workstream kann nach Foundation-Welle 1 von eigener Person/Sprint betreut werden.

### Workstream A — SEO (Welle 1, 3, 5)
**Owner:** Content + Frontend
**KPIs:** GSC Impressions, CTR, Avg-Position, Top-10-Rankings für "Alltagsbegleiter Frankfurt", "Entlastungsbetrag 131 Euro", "Krankenfahrt §60 SGB V".
**Tasks:** Article-Schema, dynamische Sitemap, Internal Linking, Blog-Frequenz (2 Posts/Monat), Image-Alt-Audit.

### Workstream B — GEO / AI-Search (Welle 5)
**Owner:** Content + LLM-Spezialist (kann Yusuf selbst)
**KPIs:** Erwähnungen in ChatGPT/Perplexity (manuelle Stichproben pro Quartal), Branded Search Volume (GSC).
**Tasks:** llms.txt, llms-full.txt, Q&A-Content-Pattern, Entity-Linking, Speakable.

### Workstream C — Analytics (Welle 1, 2, 3, 6)
**Owner:** Fullstack
**KPIs:** Datenqualität (90 % gclid-Erfassung, 95 % Event-Coverage), Funnel-Dropoff transparent.
**Tasks:** GA4-Setup, Event-Catalog konsistent, Admin-Dashboard, Web-Vitals.

### Workstream D — Meta/Google/TikTok-Ads (Welle 4)
**Owner:** Marketing + Fullstack
**KPIs:** CAC < 30 € pro Buchung, ROAS > 3, Match-Quality > 7.
**Tasks:** CAPI, Events API, Enhanced Conversions, Offline-Conv-Backfill für gclid-Buchungen.

### Workstream E — Performance / Reliability (Welle 3)
**Owner:** Fullstack
**KPIs:** p75 LCP < 2.5 s, p75 INP < 200 ms, Lighthouse Perf > 90.
**Tasks:** Web-Vitals, Lighthouse CI, Bundle-Audit, Image-Lazy-Loading-Audit.

---

## 11 — DSGVO-Kapitel (Consent Mode v2 + iOS ATT)

### 11.1 Aktuelle Rechtslage (DE, Stand 2026-05)

- **TTDSG § 25** (frühere Cookie-Richtlinie): Pflicht zur Einwilligung **vor** dem Setzen jedes nicht-essenziellen Cookies/LocalStorage-Items, **inkl.** Pixel-Loading.
- **DSGVO Art. 6 Abs. 1 lit. a** (Einwilligung) und **lit. f** (berechtigtes Interesse) — nur f bei rein funktional-technischen Daten.
- **DSGVO Art. 7**: jederzeit widerruflich, kein Nachteil bei Widerruf, granular wenn mehrere Zwecke.
- **DSA Art. 26**: bei Werbeprofilen → kein Tracking Minderjähriger.

### 11.2 Konkrete Maßnahmen

| Maßnahme | Status | Plan |
|---|---|---|
| Consent **vor** Pixel-Load | OK (Web, mit Bug: `setInterval` Polling-Bug, der den `clearInterval` nur bei `accepted` macht — `rejected` lässt das Interval laufen) | Welle 7: Bug fixen, Subscriber-Pattern statt Polling. |
| Granulare Kategorien | Nur Accept/Reject | Welle 7: 3 Kategorien wie oben. |
| Datenschutz-Text aktuell | TEILS | Welle 7: GA4, CAPI, Firebase, ATT aufnehmen. |
| Auftragsverarbeitungsverträge (AVV) | UNBEKANNT | Yusuf: AVV mit Google (GA4), Meta (Business), TikTok, Supabase, Vercel, Sentry checken. |
| IP-Anonymisierung GA4 | automatisch (GA4 vs. UA) | nichts zu tun |
| US-Datentransfer (Schrems II) | OFFEN | Argumentation: Google EU-Server (DCC), Meta/TikTok Standard Contractual Clauses. Datenschutzerklärung erklärt es. |
| Widerruf-Mechanismus | TEILS | "Cookie-Einstellungen ändern" Link im Footer fehlt? Welle 7: Footer-Link hinzu. |
| Logging & Beweis | FEHLT | `consent_log` Tabelle: timestamp, ip_hash, decision → beweist im Streitfall, wann user opted-in. |

### 11.3 iOS ATT (App Tracking Transparency)

- **Apple-Vorgabe seit iOS 14.5**: Vor jedem Zugriff auf IDFA oder Cross-App/Cross-Site-Tracking muss ATT-Dialog erscheinen.
- **Heute:** wir nutzen IDFA nicht → kein Dialog nötig.
- **Nach Welle 2:** Firebase Analytics nutzt App-Instance-ID (NICHT IDFA) → Default OK. Wenn aber `setUserId(<email-hash>)` benutzt wird, plus Meta-SDK für iOS-Conversions → ATT-Pflicht.
- **Best Practice:** Custom-Pre-Permission-Screen (eigener Modal vor System-Dialog), erklärt **warum** wir den Zugriff brauchen → erhöht Opt-In-Rate von ~20 % auf 60 %.

### 11.4 Consent Mode v2 Mapping

```typescript
// Bei Accept All:
gtag('consent', 'update', {
  ad_storage: 'granted',
  ad_user_data: 'granted',
  ad_personalization: 'granted',
  analytics_storage: 'granted',
});

// Bei nur "Statistik":
gtag('consent', 'update', {
  ad_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied',
  analytics_storage: 'granted',
});

// Bei nur "Marketing":
gtag('consent', 'update', {
  ad_storage: 'granted',
  ad_user_data: 'granted',
  ad_personalization: 'granted',
  analytics_storage: 'denied',
});

// Bei Reject All: bleibt Default 'denied' (bereits in <head> gesetzt).
```

---

## 12 — Risiko-Register

| Risiko | Wahrsch. | Impact | Mitigation |
|---|---|---|---|
| App-Store-Reject wegen fehlender ATT-Erklärung nach Welle 2 | Mittel | Hoch | Vor Welle-2-Release: NSUserTrackingUsageDescription korrekt + Privacy-Nutrition-Labels updaten. |
| Bestehendes hartcodiertes `GTM-NPNL3D3Q` / `AW-18061588897` | Hoch (Wartbarkeit) | Niedrig | Welle 1: in `.env` migrieren. |
| `public/sitemap.xml` vs. `app/sitemap.ts` Konflikt | Hoch | Niedrig (SEO) | Welle 1: `public/sitemap.xml` löschen. |
| In-Memory Rate-Limit serverless-untauglich | Mittel | Niedrig (heute) | Welle 6: Upstash-Redis-Rate-Limit, wenn Traffic wächst. |
| `ip-api.com` Free-Tier Drosselung bei Traffic-Spike | Niedrig | Mittel (Geo-Daten fehlen) | Pro-Plan $13/Mo oder eigener MaxMind GeoLite2 DB-Download. |
| Google Ads Developer-Token-Antrag dauert | Hoch | Niedrig (Welle 6 verzögert sich) | Antrag in Welle 1 stellen, parallel zu Welle 2–5. |
| Cookie-Banner Bug (Polling läuft bei reject ewig) | Hoch | Niedrig (Memory-Leak) | Welle 7: Subscriber-Pattern. |
| DSGVO-Beschwerde wegen IP-Speicherung ohne Granularität | Niedrig | Mittel (Bußgeld) | Welle 7: Granulares Banner + Datenschutz-Update. |

---

## 13 — Definition of Done pro Welle

Welle gilt als abgeschlossen, wenn:

1. Code in `main` gemerged.
2. Vercel-Preview & Production Deploy grün.
3. Verifikations-Schritt aus der Welle erfüllt (siehe jeweils unten).
4. Doku-Eintrag in `docs/releases/YYYY-MM-DD-welle-N.md`.
5. Eintrag in `MEMORY.md` (Top-10) wenn neue Service-Accounts/Keys gesetzt.
6. Bei DB-Migration: SQL-File in `supabase/migrations/`, RLS-Matrix grün (`npm run rls:matrix:check`).

---

## 14 — Maintenance-Routinen (nach Go-Live)

| Routine | Frequenz | Owner |
|---|---|---|
| GSC-Coverage-Report prüfen | wöchentlich | SEO |
| GA4-Anomalien-Alert review | täglich (auto) | Marketing |
| Web-Vitals p75 Trend | wöchentlich | Frontend |
| Lighthouse-CI-Regression-Check | pro PR | Reviewer |
| Service-Account-Token-Rotation | jährlich | Yusuf |
| Universal-Link-Validator (Apple + Google) | nach jedem App-Release | DevOps |
| Datenschutzerklärung Review | vierteljährlich | Yusuf + DSGVO-Berater |

---

## 15 — Erfolgs-KPIs nach 90 Tagen

- **GA4 Events/Tag:** > 5.000 (heute: 0 — nur Google Ads Conversion-Counts)
- **App-Streams Events/Tag:** > 500 (heute: 0)
- **GSC Klicks/Tag:** Baseline +30 % (durch Article-Schema, Breadcrumb, dynamic Sitemap)
- **CAC Reduction:** -15 % (durch saubere Attribution & Server-Side-Conversions)
- **p75 LCP:** < 2.5 s (heute: unbekannt)
- **AI-Search Visibility:** mindestens 5 LLM-Antworten/Monat zitieren uns (Stichprobe Perplexity)
- **App Universal-Link Open-Rate:** > 60 % der Referral-Klicks öffnen App statt Browser

---

## Anhang A — Codebase-Quickref (für nachfolgende Implementierungs-PRs)

```
app/
├── layout.tsx               ← Consent Mode v2 default + JSON-LD + Pixel-Container
├── sitemap.ts               ← STATISCH (Welle 1: dynamisch)
├── robots.ts                ← (Welle 5: AI-Crawler-Policy erweitern)
├── llms.txt/route.ts        ← (Welle 5: NEU)
├── api/
│   ├── track/route.ts                   ← /api/track (existiert, gut)
│   ├── track-conversion/route.ts        ← (existiert, gut)
│   ├── visitor-alert/route.ts           ← (existiert, gut)
│   └── analytics/                       ← (Welle 2/3/4/6: NEU)
│       ├── ga4-mp/route.ts
│       ├── meta-capi/route.ts
│       ├── tiktok-events/route.ts
│       ├── web-vitals/route.ts
│       └── app-event/route.ts
└── admin/analytics/page.tsx ← (Welle 6: erweitern)

components/
├── GoogleTagManager.tsx     ← gtag + GTM (Welle 1: + GA4 config)
├── MetaPixel.tsx            ← (Welle 4: trackMeta sendet auch CAPI)
├── TikTokPixel.tsx
├── VisitorTracker.tsx       ← (Welle 2: native-skip entfernen)
├── PageTracker.tsx          ← (Welle 1: GA4 page_view feuern)
├── CookieConsent.tsx        ← (Welle 7: 3 Kategorien)
└── WebVitalsReporter.tsx    ← (Welle 3: NEU)

lib/
├── tracking.ts              ← (Welle 1: GA4 helpers; Welle 4: CAPI fan-out)
└── analytics/               ← (Welle 1: NEU, modular)
    ├── index.ts
    ├── platform.ts
    ├── events.ts
    ├── consent.ts
    └── adapters/

supabase/migrations/
└── 2026XXXX_analytics_v2.sql  ← (Welle 1+: neue Tabellen oben)

ios/App/App/Info.plist        ← (Welle 2: NSUserTrackingUsageDescription)
public/.well-known/
├── apple-app-site-association ← (Welle 2: TEAMID ersetzen)
└── assetlinks.json            ← (Welle 2: SHA256 ersetzen)

capacitor.config.json         ← (Welle 2: Plugin-Config Firebase + ATT)
```

---

**Ende des Masterplans.**

Implementierung folgt in einzelnen PRs pro Welle, jede gegen `main` gemerged, jede mit verifikationsfähigem Acceptance-Test.
