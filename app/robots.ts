import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // /lp/ = noindex-Werbe-Redirects (Tracking) — nicht crawlen
        disallow: ['/admin/', '/mis/', '/api/', '/engel/', '/kunde/', '/fahrer/', '/auth/', '/investor/', '/notfall/', '/choose', '/sentry-example', '/lp/'],
      },
    ],
    sitemap: 'https://alltagsengel.care/sitemap.xml',
  }
}
