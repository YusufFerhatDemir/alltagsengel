import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // /lp/ = noindex-Werbe-Redirects (Tracking) — nicht crawlen.
        // /choose + /sentry-example bewusst NICHT disallowed: sie tragen
        // X-Robots-Tag noindex (next.config.ts) — Disallow würde verhindern,
        // dass Crawler das noindex überhaupt sehen.
        disallow: ['/admin/', '/mis/', '/api/', '/engel/', '/kunde/', '/fahrer/', '/auth/', '/investor/', '/notfall/', '/lp/'],
      },
    ],
    sitemap: 'https://alltagsengel.care/sitemap.xml',
  }
}
