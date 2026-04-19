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
  // @ts-expect-error – eslint key valid at runtime, missing from types in Next 16
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
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
            key: 'X-XSS-Protection',
            value: '1; mode=block',
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

  // Sentry-SDK-Logger aus Production-Bundle entfernen (kleiner, weniger Noise)
  disableLogger: true,

  // Vercel-Cron-Monitoring automatisch aktivieren
  automaticVercelMonitors: true,

  // Tunnel-Route umgeht AdBlocker (client events gehen über eigene Domain)
  tunnelRoute: '/monitoring',
});
