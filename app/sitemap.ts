import type { MetadataRoute } from 'next'
import { readdirSync } from 'fs'
import { join } from 'path'
// Echte Git-Commit-Daten pro Seite (scripts/generate-lastmod.ts, npm prebuild).
// Datei-mtime wäre auf Vercel immer der Deploy-Zeitpunkt — 82× dasselbe Datum
// trainiert Google, unser lastmod komplett zu ignorieren.
import lastmodMap from '@/lib/generated/lastmod.json'

export const dynamic = 'force-static'
export const revalidate = 3600

const BASE_URL = 'https://alltagsengel.care'

interface RouteEntry {
  url: string
  lastModified?: string
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
  // HINWEIS: /{service}/frankfurt fehlt hier BEWUSST — die Frankfurt-City-Seiten
  // kanonisieren auf die Root-Service-Seiten (Keyword-Kannibalisierung auf
  // "… Frankfurt"; die Root-Seiten targeten bereits Frankfurt).
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
  // City-Landingpages Krankenfahrten (frankfurt: siehe Hinweis oben)
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
  // City-Landingpages Pflegebox (frankfurt: siehe Hinweis oben)
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
  // /karriere ist 301 → /engel-werden (Recruiting-Konsolidierung, next.config.ts).
  { url: '/jobs', changeFrequency: 'weekly', priority: 0.9 },
  { url: '/finanzierung', changeFrequency: 'monthly', priority: 0.9 },
  { url: '/team', changeFrequency: 'monthly', priority: 0.7 },
  { url: '/ueber-uns', changeFrequency: 'monthly', priority: 0.8 },
  { url: '/impressum', changeFrequency: 'yearly', priority: 0.3 },
  { url: '/datenschutz', changeFrequency: 'yearly', priority: 0.3 },
  { url: '/agb', changeFrequency: 'yearly', priority: 0.3 },
]

// Dynamische Stadt-Segmente teilen sich eine Template-Datei — deren mtime
// gilt für alle Städte darunter (inhaltlich korrekt, da gleiche Vorlage).
const DYNAMIC_SECTIONS = ['alltagsbegleitung', 'krankenfahrten', 'hygienebox']

function resolvePagePath(url: string): string {
  if (url === '/') return join('app', 'page.tsx')
  const segments = url.split('/').filter(Boolean)
  if (segments.length === 2 && DYNAMIC_SECTIONS.includes(segments[0])) {
    return join('app', segments[0], '[stadt]', 'page.tsx')
  }
  return join('app', ...segments, 'page.tsx')
}

// Echtes Git-Datum oder undefined — lieber KEIN lastmod als 82× dasselbe.
function lastModifiedFor(url: string): string | undefined {
  return (lastmodMap as Record<string, string>)[resolvePagePath(url)]
}

function listBlogSlugs(): { slug: string; lastModified?: string }[] {
  try {
    const dir = join(process.cwd(), 'app', 'blog')
    const entries = readdirSync(dir, { withFileTypes: true })
    return entries
      .filter((e) => e.isDirectory() && e.name !== 'feed.xml')
      .map((e) => ({
        slug: e.name,
        lastModified: (lastmodMap as Record<string, string>)[
          join('app', 'blog', e.name, 'page.tsx')
        ],
      }))
  } catch {
    return []
  }
}

export default function sitemap(): MetadataRoute.Sitemap {
  const staticEntries: RouteEntry[] = STATIC_ROUTES.map((r) => ({
    ...r,
    lastModified: lastModifiedFor(r.url),
  }))

  const blogEntries: RouteEntry[] = listBlogSlugs().map(({ slug, lastModified }) => ({
    url: `/blog/${slug}`,
    lastModified,
    changeFrequency: 'monthly',
    priority: 0.8,
  }))

  return [...staticEntries, ...blogEntries].map((e) => ({
    url: `${BASE_URL}${e.url}`,
    ...(e.lastModified ? { lastModified: e.lastModified } : {}),
    changeFrequency: e.changeFrequency,
    priority: e.priority,
  }))
}
