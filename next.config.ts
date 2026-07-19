import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
// P1.4 Bundle-Size-Report: konditional aktiv, nur wenn ANALYZE=true gesetzt ist.
// Normalbetrieb bleibt unveraendert. Nutzung: `ANALYZE=true npm run build`.
// Analogie: Wie ein Roentgen-Bild — nur bei Bedarf einschalten, sonst
// bleibt die Maschine im Normalbetrieb und zeigt nichts an.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const withBundleAnalyzer = require("@next/bundle-analyzer")({
  enabled: process.env.ANALYZE === "true",
  openAnalyzer: false, // CI-safe: kein Browser-Auto-Open
});

const nextConfig: NextConfig = {
  // Hinweis (Apr 2026): `eslint` als next.config-Key ist seit Next 16 entfernt.
  // ESLint laeuft unabhaengig vom Build (siehe `npm run lint`).
  // Typecheck ist seit Jul 2026 clean — Build blockt wieder bei Type-Fehlern.
  // (deploy.sh typechecked zusätzlich warn-only vor jedem Push.)
  // Workspace-Root festnageln: in ~/ liegt ein weiteres package-lock.json —
  // ohne diese Zeile rät Turbopack den falschen Root (Module-Format-Fehler,
  // wenn der Dev-Server nicht direkt aus dem Projektordner gestartet wird).
  turbopack: {
    root: __dirname,
  },
  // Bild-Pipeline (CWV): AVIF zuerst (30–50 % kleiner als WebP), WebP als
  // Fallback. Betrifft nur das Auslieferungsformat via next/image — die
  // Quelldateien (z. B. die goldenen 3D-Icons) bleiben unverändert.
  // minimumCacheTTL: optimierte Varianten 31 Tage cachen — Brand-Assets
  // ändern sich praktisch nie, Re-Optimierung pro Miss ist verschenkt.
  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 2678400,
  },
  async redirects() {
    return [
      // Host-Kanonisierung: www spiegelt sonst die komplette Site als
      // 200-Duplikat (Canonical-Tag allein ist nur ein Hint für Crawler).
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'www.alltagsengel.care' }],
        destination: 'https://alltagsengel.care/:path*',
        permanent: true,
      },
      // /pflegebox ist seit Jul 2026 eine EIGENE Seite (app/pflegebox,
      // self-canonical, in der Sitemap) — der frühere 301 auf /hygienebox
      // würde sie unerreichbar machen. Nur die Stadt-Varianten leiten
      // weiterhin auf /hygienebox/:stadt um (keine /pflegebox/[stadt]-Routen).
      { source: '/pflegebox/:stadt', destination: '/hygienebox/:stadt', permanent: true },
      // /index liefert sonst die Startseite als 200-Duplikat von /.
      { source: '/index', destination: '/', permanent: true },
      // Recruiting-Konsolidierung: /karriere war Near-Duplicate von
      // /engel-werden (gleiche Keywords/FAQ/Formular) — Keyword-Kannibalisierung.
      { source: '/karriere', destination: '/engel-werden', permanent: true },
      // GSC-404-Fix (Jul 2026): Google hatte eine Font-Datei aus einem alten
      // Build gecrawlt (Hash existiert seit dem Re-Deploy nicht mehr, Suffix
      // "~c~egv" war zudem verstümmelt — die URL hat so nie existiert).
      // 301 auf die Startseite: stabiler als ein Redirect auf den aktuellen
      // Font-Hash (der beim nächsten Font-Update wieder brechen würde). GSC
      // stuft die URL damit als "Seite mit Weiterleitung" ein statt als
      // 404-Fehler. Neue Fälle verhindert der X-Robots-Tag-Header unten.
      {
        source: '/_next/static/media/81cef6a21128489e-s.p.0rb1wy2~c~egv.woff2',
        destination: '/',
        permanent: true,
      },
    ]
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://connect.facebook.net https://www.googletagmanager.com https://www.google-analytics.com https://analytics.tiktok.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.openai.com https://api.resend.com https://ipapi.co https://generativelanguage.googleapis.com https://www.facebook.com https://analytics.tiktok.com https://www.google-analytics.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self';",
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(self)',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on',
          },
        ],
      },
      // noindex per Header statt robots.txt-Disallow: Disallow blockt nur das
      // Crawlen — die URL kann trotzdem (URL-only) indexiert werden, und Google
      // sieht dann nie ein noindex. Header wirkt auch bei 'use client'-Pages
      // ohne metadata-Export. Die beiden Routen sind dafür in robots.ts
      // NICHT mehr disallowed, damit der Header überhaupt gelesen wird.
      // Langzeit-Cache für unveränderliche statische Assets (Brand-Icons,
      // OG-Image): public/-Dateien kommen sonst mit max-age=0 — jeder
      // Seitenwechsel re-validiert das Logo. 30 Tage + SWR deckt
      // Repeat-Visits aus dem Browser-Cache ab; bei Asset-Tausch Dateinamen
      // versionieren (z. B. icon-v2.jpg), nicht in-place überschreiben.
      {
        source: '/assets/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=2592000, stale-while-revalidate=86400' }],
      },
      {
        source: '/:file(icon\\-192x192\\.png|icon\\-512x512\\.png|icon\\-180x180\\.png|apple\\-touch\\-icon\\.png|og\\-image\\.png|favicon\\.ico)',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=2592000, stale-while-revalidate=86400' }],
      },
      // GSC-Prävention (Jul 2026): Build-Assets (Fonts/JS/CSS unter
      // /_next/static) sind fingerprinted und sterben mit jedem Deploy —
      // ohne noindex tauchen veraltete Hashes nach Re-Deploys als
      // 404-"Seiten" im GSC-Indexierungsbericht auf. noindex hält die
      // Asset-URLs komplett aus der Index-Pipeline (Crawlen fürs Rendering
      // bleibt erlaubt — noindex blockt nur die Indexierung als Dokument).
      // Verifiziert: Custom-Header greifen auf Vercel auch für /_next/static
      // (X-Frame-Options kommt dort bereits an).
      {
        source: '/_next/static/:path*',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex' }],
      },
      {
        source: '/sentry-example',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
      },
      {
        source: '/choose',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
      },
    ]
  },
};

export default withSentryConfig(withBundleAnalyzer(nextConfig), {
  // Sentry Build-Time-Optionen
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Logs nur in CI ausgeben
  silent: !process.env.CI,

  // Alle Client-Files (inkl. Worker/Service-Worker) einbeziehen
  widenClientFileUpload: true,

  // Source-Maps nach Upload löschen (nicht öffentlich ausliefern)
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },

  // Tunnel-Route umgeht AdBlocker (client events gehen über eigene Domain)
  tunnelRoute: '/monitoring',

  // Bundle-Size-Optimierung (Perf 2026-07): Replay ist in
  // instrumentation-client.ts deaktiviert — diese Flags shaken Replay-Code
  // und Debug-Logging zusätzlich aus allen Sentry-Chunks heraus.
  // Wird Replay je reaktiviert, müssen die excludeReplay*-Flags weg.
  bundleSizeOptimizations: {
    excludeDebugStatements: true,
    // Tracing aus dem Client-Bundle shaken (CWV 2026-07): Client nutzt kein
    // tracesSampleRate mehr (siehe instrumentation-client.ts). Wird Tracing
    // reaktiviert, muss dieses Flag weg.
    excludeTracing: true,
    excludeReplayShadowDom: true,
    excludeReplayIframe: true,
    excludeReplayWorker: true,
  },
});
