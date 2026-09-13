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
        // /angehoerige/ ergaenzt 13.09.2026: dasselbe wie /kunde/ und /engel/ —
        // ein angemeldeter Bereich, der unangemeldet mit 307 auf den Login
        // umleitet. Er stand als einziges Portal nicht in dieser Liste.
        // Hier ist Disallow richtig und nicht schlechter als noindex: es gibt
        // keinen Inhalt, den ein Crawler sehen koennte, also auch kein
        // noindex, das ihm entgehen wuerde.
        disallow: ['/admin/', '/mis/', '/api/', '/engel/', '/kunde/', '/fahrer/', '/auth/', '/investor/', '/notfall/', '/angehoerige/'],
      },
    ],
    sitemap: 'https://alltagsengel.care/sitemap.xml',
  }
}
