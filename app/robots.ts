import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/fahrer/register', '/auth/register'],
        // /lp/ entfernt: Seiten haben noindex-Metadaten + 301-Redirect.
        // Disallow verhindert, dass Crawler den noindex-Tag sehen — schlimmer
        // als erlauben. Gleiches Prinzip wie bei /choose und /sentry-example.
        // /fahrer/register + /auth/register: Registrierungsseiten sollen
        // indexiert werden (SEO für "Engel werden" / "Konto erstellen").
        disallow: ['/admin/', '/mis/', '/api/', '/engel/', '/kunde/', '/fahrer/', '/auth/', '/investor/', '/notfall/'],
      },
    ],
    sitemap: 'https://alltagsengel.care/sitemap.xml',
  }
}
