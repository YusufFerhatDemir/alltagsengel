import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'

// RSS-Feed für den Ratgeber-Blog — statisch zur Build-Zeit generiert
// (liest wie app/sitemap.ts die Blog-Verzeichnisse aus dem Dateisystem).
export const dynamic = 'force-static'

const BASE_URL = 'https://alltagsengel.care'

interface FeedItem {
  slug: string
  title: string
  description: string
  datePublished: string
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function extractField(src: string, field: string): string | null {
  // matcht z. B.  title: 'Text'  bzw.  description: "Text"  (einzeilig)
  const m = src.match(new RegExp(`${field}:\\s*'((?:[^'\\\\]|\\\\.)*)'`)) ||
    src.match(new RegExp(`${field}:\\s*"((?:[^"\\\\]|\\\\.)*)"`))
  return m ? m[1].replace(/\\'/g, "'").replace(/\\"/g, '"') : null
}

function collectItems(): FeedItem[] {
  const dir = join(process.cwd(), 'app', 'blog')
  const items: FeedItem[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'feed.xml') continue
    try {
      const src = readFileSync(join(dir, entry.name, 'page.tsx'), 'utf-8')
      const title = extractField(src, 'title')
      const description = extractField(src, 'description')
      const datePublished = extractField(src, 'datePublished')
      if (title && description) {
        items.push({
          slug: entry.name,
          title,
          description,
          datePublished: datePublished ?? '2026-01-01',
        })
      }
    } catch {
      // Verzeichnis ohne page.tsx → überspringen
    }
  }
  return items.sort((a, b) => b.datePublished.localeCompare(a.datePublished))
}

export function GET() {
  const items = collectItems()
  const lastBuildDate = items.length
    ? new Date(items[0].datePublished).toUTCString()
    : new Date().toUTCString()

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Alltagsengel Ratgeber — Pflege &amp; Entlastung</title>
    <link>${BASE_URL}/blog</link>
    <description>Kostenlose Ratgeber-Artikel zu Pflegegrad, Entlastungsbetrag (§45b SGB XI), Pflegehilfsmitteln (§40 SGB XI) und Krankenfahrten — von Alltagsengel, Frankfurt / Rhein-Main.</description>
    <language>de-DE</language>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
    <atom:link href="${BASE_URL}/blog/feed.xml" rel="self" type="application/rss+xml"/>
${items
  .map(
    (i) => `    <item>
      <title>${escapeXml(i.title)}</title>
      <link>${BASE_URL}/blog/${i.slug}</link>
      <guid isPermaLink="true">${BASE_URL}/blog/${i.slug}</guid>
      <description>${escapeXml(i.description)}</description>
      <pubDate>${new Date(i.datePublished).toUTCString()}</pubDate>
    </item>`
  )
  .join('\n')}
  </channel>
</rss>`

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
