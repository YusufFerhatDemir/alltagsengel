import type { MetadataRoute } from 'next'
import { readdirSync, statSync } from 'fs'
import { join } from 'path'

export const dynamic = 'force-static'
export const revalidate = 3600

const BASE_URL = 'https://alltagsengel.care'

interface RouteEntry {
  url: string
  lastModified: string
  changeFrequency:
    | 'always'
    | 'hourly'
    | 'daily'
    | 'weekly'
    | 'monthly'
    | 'yearly'
    | 'never'
  priority: number
}

const STATIC_ROUTES: Omit<RouteEntry, 'lastModified'>[] = [
  { url: '/', changeFrequency: 'weekly', priority: 1.0 },
  { url: '/hygienebox', changeFrequency: 'weekly', priority: 0.9 },
  { url: '/krankenfahrten', changeFrequency: 'weekly', priority: 0.9 },
  { url: '/alltagsbegleitung', changeFrequency: 'weekly', priority: 0.9 },
  { url: '/engel-werden', changeFrequency: 'weekly', priority: 0.9 },
  { url: '/blog', changeFrequency: 'daily', priority: 0.9 },
  { url: '/budgetrechner', changeFrequency: 'weekly', priority: 0.9 },
  { url: '/pflegegrad-check', changeFrequency: 'weekly', priority: 0.9 },
  { url: '/einzugsgebiet', changeFrequency: 'weekly', priority: 0.9 },
  { url: '/bewertungen', changeFrequency: 'weekly', priority: 0.8 },
  { url: '/termin', changeFrequency: 'weekly', priority: 0.9 },
  { url: '/faq', changeFrequency: 'monthly', priority: 0.8 },
  { url: '/kontakt', changeFrequency: 'monthly', priority: 0.7 },
  // City-Landingpages (Rhein-Main)
  { url: '/alltagsbegleitung/frankfurt', changeFrequency: 'weekly', priority: 0.9 },
  { url: '/alltagsbegleitung/offenbach', changeFrequency: 'weekly', priority: 0.85 },
  { url: '/alltagsbegleitung/wiesbaden', changeFrequency: 'weekly', priority: 0.85 },
  { url: '/alltagsbegleitung/darmstadt', changeFrequency: 'weekly', priority: 0.85 },
  { url: '/alltagsbegleitung/hanau', changeFrequency: 'weekly', priority: 0.85 },
  { url: '/alltagsbegleitung/bad-homburg', changeFrequency: 'weekly', priority: 0.85 },
  { url: '/alltagsbegleitung/mainz', changeFrequency: 'weekly', priority: 0.85 },
  { url: '/alltagsbegleitung/aschaffenburg', changeFrequency: 'weekly', priority: 0.85 },
  { url: '/alltagsbegleitung/frankfurt-hoechst', changeFrequency: 'weekly', priority: 0.85 },
  { url: '/alltagsbegleitung/neu-isenburg', changeFrequency: 'weekly', priority: 0.85 },
  { url: '/alltagsbegleitung/friedberg-wetterau', changeFrequency: 'weekly', priority: 0.85 },
  { url: '/alltagsbegleitung/rodgau', changeFrequency: 'weekly', priority: 0.85 },
  // City-Landingpages Krankenfahrten
  { url: '/krankenfahrten/frankfurt', changeFrequency: 'weekly', priority: 0.9 },
  { url: '/krankenfahrten/offenbach', changeFrequency: 'weekly', priority: 0.85 },
  { url: '/krankenfahrten/wiesbaden', changeFrequency: 'weekly', priority: 0.85 },
  { url: '/krankenfahrten/darmstadt', changeFrequency: 'weekly', priority: 0.85 },
  { url: '/krankenfahrten/hanau', changeFrequency: 'weekly', priority: 0.85 },
  { url: '/krankenfahrten/bad-homburg', changeFrequency: 'weekly', priority: 0.85 },
  { url: '/krankenfahrten/mainz', changeFrequency: 'weekly', priority: 0.85 },
  { url: '/krankenfahrten/aschaffenburg', changeFrequency: 'weekly', priority: 0.85 },
  { url: '/krankenfahrten/frankfurt-hoechst', changeFrequency: 'weekly', priority: 0.85 },
  { url: '/krankenfahrten/neu-isenburg', changeFrequency: 'weekly', priority: 0.85 },
  { url: '/krankenfahrten/friedberg-wetterau', changeFrequency: 'weekly', priority: 0.85 },
  // City-Landingpages Pflegebox
  { url: '/hygienebox/frankfurt', changeFrequency: 'weekly', priority: 0.9 },
  { url: '/hygienebox/offenbach', changeFrequency: 'weekly', priority: 0.85 },
  { url: '/hygienebox/wiesbaden', changeFrequency: 'weekly', priority: 0.85 },
  { url: '/hygienebox/darmstadt', changeFrequency: 'weekly', priority: 0.85 },
  { url: '/hygienebox/hanau', changeFrequency: 'weekly', priority: 0.85 },
  { url: '/hygienebox/bad-homburg', changeFrequency: 'weekly', priority: 0.85 },
  { url: '/hygienebox/mainz', changeFrequency: 'weekly', priority: 0.85 },
  { url: '/hygienebox/aschaffenburg', changeFrequency: 'weekly', priority: 0.85 },
  { url: '/hygienebox/neu-isenburg', changeFrequency: 'weekly', priority: 0.85 },
  { url: '/hygienebox/friedberg-wetterau', changeFrequency: 'weekly', priority: 0.85 },
  { url: '/hygienebox/rodgau', changeFrequency: 'weekly', priority: 0.85 },
  // /lp/* sind noindex-Redirects (Werbe-Tracking) — gehören NICHT in die Sitemap.
  { url: '/karriere', changeFrequency: 'weekly', priority: 0.8 },
  { url: '/ueber-uns', changeFrequency: 'monthly', priority: 0.8 },
  { url: '/impressum', changeFrequency: 'yearly', priority: 0.3 },
  { url: '/datenschutz', changeFrequency: 'yearly', priority: 0.3 },
  { url: '/agb', changeFrequency: 'yearly', priority: 0.3 },
]

function listBlogSlugs(): { slug: string; lastModified: string }[] {
  try {
    const dir = join(process.cwd(), 'app', 'blog')
    const entries = readdirSync(dir, { withFileTypes: true })
    return entries
      .filter((e) => e.isDirectory() && e.name !== 'feed.xml')
      .map((e) => {
        const pagePath = join(dir, e.name, 'page.tsx')
        let lastModified = new Date().toISOString()
        try {
          lastModified = statSync(pagePath).mtime.toISOString()
        } catch {
          // page.tsx fehlt → trotzdem listen, mit "jetzt"
        }
        return { slug: e.name, lastModified }
      })
  } catch {
    return []
  }
}

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date().toISOString()

  const staticEntries: RouteEntry[] = STATIC_ROUTES.map((r) => ({
    ...r,
    lastModified: now,
  }))

  const blogEntries: RouteEntry[] = listBlogSlugs().map(({ slug, lastModified }) => ({
    url: `/blog/${slug}`,
    lastModified,
    changeFrequency: 'monthly',
    priority: 0.8,
  }))

  return [...staticEntries, ...blogEntries].map((e) => ({
    url: `${BASE_URL}${e.url}`,
    lastModified: e.lastModified,
    changeFrequency: e.changeFrequency,
    priority: e.priority,
  }))
}
