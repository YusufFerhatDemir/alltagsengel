#!/usr/bin/env node
/**
 * Interner Link-Checker: extrahiert alle statischen internen hrefs aus den
 * öffentlichen Seiten (app/** ohne Portal-/Admin-Bereiche) und validiert sie
 * gegen das Routen-Inventar (Filesystem-Routen + [stadt]-Slugs + Redirects
 * aus next.config.ts + public/-Assets).
 *
 * Nutzung:  node scripts/check-internal-links.mjs
 * Exit 1 bei broken Links (CI-tauglich).
 */
import { readdirSync, readFileSync, existsSync, statSync } from 'fs'
import { join, relative } from 'path'

const ROOT = process.cwd()

// Portal-/App-Bereiche: nicht öffentlich indexierbar, Links dorthin sind aber
// gültig (App-Einstiege wie /auth/register, /choose, /kunde/...).
const SCAN_EXCLUDE = /^app\/(admin|mis|investor)\//

// ── 1. Routen-Inventar aus dem Filesystem ──────────────────────────────
function collectRoutes(dir, urlSegments = []) {
  const routes = new Set()
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      if (/^page\.(tsx|ts|jsx|js)$/.test(entry.name)) {
        routes.add('/' + urlSegments.join('/'))
      }
      continue
    }
    if (entry.name === 'api') continue
    // Route-Groups (segmentlos) gibt es hier nicht; Dynamik wird unten expandiert
    for (const r of collectRoutes(join(dir, entry.name), [...urlSegments, entry.name])) {
      routes.add(r)
    }
  }
  return routes
}

// Städte-Slugs direkt aus dem Template lesen — bleibt bei neuen Städten aktuell.
const stadtTemplate = readFileSync(
  join(ROOT, 'app', 'alltagsbegleitung', '[stadt]', 'page.tsx'),
  'utf8'
)
const CITY_SLUGS = [...new Set([...stadtTemplate.matchAll(/slug: '([a-z-]+)'/g)].map((m) => m[1]))]

const routes = new Set(['/'])
for (const r of collectRoutes(join(ROOT, 'app'))) {
  if (r.includes('[stadt]')) {
    for (const slug of CITY_SLUGS) routes.add(r.replace('[stadt]', slug))
  } else if (r.includes('[')) {
    // andere dynamische Segmente (IDs): Prefix als gültig markieren
    routes.add(r) // exakter Treffer unwahrscheinlich, Prefix-Check unten
  } else {
    routes.add(r)
  }
}

// Redirect-Quellen aus next.config.ts gelten als erreichbar (301 → Ziel)
const nextConfig = readFileSync(join(ROOT, 'next.config.ts'), 'utf8')
for (const m of nextConfig.matchAll(/source:\s*'([^']+)'/g)) {
  const src = m[1]
  if (src.includes(':')) {
    if (src.startsWith('/pflegebox/')) {
      for (const slug of CITY_SLUGS) routes.add(`/pflegebox/${slug}`)
    }
    continue
  }
  routes.add(src)
}

// Statische Assets (public/) — /og-image.png, /icons etc.
function collectPublicFiles(dir, prefix = '') {
  const files = new Set()
  if (!existsSync(dir)) return files
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = `${prefix}/${entry.name}`
    if (entry.isDirectory()) {
      for (const f of collectPublicFiles(join(dir, entry.name), p)) files.add(f)
    } else {
      files.add(p)
    }
  }
  return files
}
const publicFiles = collectPublicFiles(join(ROOT, 'public'))

// Generierte Routen ohne page.tsx
routes.add('/sitemap.xml')
routes.add('/robots.txt')
routes.add('/blog/feed.xml')

// ── 2. hrefs aus den Quelldateien extrahieren ──────────────────────────
function collectSources(dir) {
  const files = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...collectSources(p))
    } else if (/\.(tsx|ts|jsx|js)$/.test(entry.name)) {
      files.push(p)
    }
  }
  return files
}

const sourceFiles = [
  ...collectSources(join(ROOT, 'app')),
  ...collectSources(join(ROOT, 'components')),
].filter((f) => {
  const rel = relative(ROOT, f)
  return !SCAN_EXCLUDE.test(rel) && !/^components\/(admin|mis)\//.test(rel)
})

// href="/..." | href={'/...'} | href={"/..."} | href={`/...`} (nur ohne ${})
const HREF_RE = /href=(?:"(\/[^"#?]*)|'(\/[^'#?]*)|\{\s*(?:"(\/[^"#?]*)"|'(\/[^'#?]*)'|`(\/[^`$#?]*)`)\s*\})/g

const broken = []
let totalLinks = 0
for (const file of sourceFiles) {
  const src = readFileSync(file, 'utf8')
  for (const m of src.matchAll(HREF_RE)) {
    const raw = (m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[5] ?? '').replace(/\/$/, '') || '/'
    if (raw.includes('${')) continue // dynamisch (Template-String in JS-Literal) — nicht statisch prüfbar
    totalLinks++
    if (routes.has(raw) || publicFiles.has(raw)) continue
    // dynamische Segmente: /kunde/buchen/[id] → Prefix-Match erlauben
    const dynMatch = [...routes].some(
      (r) => r.includes('[') && raw.startsWith(r.slice(0, r.indexOf('[')))
    )
    if (dynMatch) continue
    broken.push({ file: relative(ROOT, file), href: raw })
  }
}

console.log(`Geprüft: ${sourceFiles.length} Dateien, ${totalLinks} interne Links, ${routes.size} bekannte Routen`)
if (broken.length) {
  console.error(`\n✗ ${broken.length} broken interne Links:`)
  for (const b of broken) console.error(`  ${b.file}  →  ${b.href}`)
  process.exit(1)
}
console.log('✓ Keine broken internen Links gefunden')
