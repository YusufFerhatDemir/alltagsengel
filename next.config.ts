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
      // Gesuchte URL /pflegebox → bestehende Pflegebox-Seite (/hygienebox).
      // 301 (permanent), damit kein Duplicate Content entsteht und externe
      // Links auf die kanonische Seite weitergereicht werden.
      { source: '/pflegebox', destination: '/hygienebox', permanent: true },
      { source: '/pflegebox/:stadt', destination: '/hygienebox/:stadt', permanent: true },
      // /index liefert sonst die Startseite als 200-Duplikat von /.
      { source: '/index', destination: '/', permanent: true },
      // Recruiting-Konsolidierung: /karriere war Near-Duplicate von
      // /engel-werden (gleiche Keywords/FAQ/Formular) — Keyword-Kannibalisierung.
      { source: '/karriere', destination: '/engel-werden', permanent: true },
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
    excludeReplayShadowDom: true,
    excludeReplayIframe: true,
    excludeReplayWorker: true,
  },
});
