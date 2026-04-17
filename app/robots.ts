import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin/', '/mis/', '/api/', '/engel/', '/kunde/', '/fahrer/', '/auth/', '/sentry-example'],
      },
    ],
    sitemap: 'https://alltagsengel.care/sitemap.xml',
  }
}
