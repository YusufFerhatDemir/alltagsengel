/**
 * Generiert lib/generated/lastmod.json: page.tsx → letztes Git-Commit-Datum (ISO).
 * Wird von app/sitemap.ts gelesen, damit <lastmod> echte Änderungsdaten trägt
 * statt Datei-mtimes (auf Vercel tragen alle Dateien den Deploy-Zeitstempel,
 * was das lastmod-Signal für Google wertlos macht).
 *
 * Läuft als npm prebuild. BEWUSST plain Node (.mjs), kein tsx: prebuild läuft
 * auch im Vercel-Build und tsx ist keine Dependency. Auf Vercel gibt es kein
 * .git (Build aus Tarball) — dann bleibt die eingecheckte JSON unverändert.
 * Deshalb MUSS die JSON committet sein; sie wird bei jedem lokalen Build
 * komplett neu aufgebaut (kein Merge — gelöschte Seiten fallen raus).
 */
import { execSync } from 'child_process'
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'fs'
import { join, relative } from 'path'

const ROOT = process.cwd()
const OUT_DIR = join(ROOT, 'lib', 'generated')
const OUT_FILE = join(OUT_DIR, 'lastmod.json')

// Nur öffentliche Segmente — private Bereiche stehen nicht in der Sitemap.
const PRIVATE_SEGMENTS = new Set([
  'admin', 'mis', 'api', 'engel', 'kunde', 'fahrer', 'auth',
  'investor', 'notfall', 'lp', 'choose', 'sentry-example',
])

function collectPageFiles(dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      if (entry.name === 'page.tsx') acc.push(join(dir, entry.name))
      continue
    }
    if (dir === join(ROOT, 'app') && PRIVATE_SEGMENTS.has(entry.name)) continue
    collectPageFiles(join(dir, entry.name), acc)
  }
  return acc
}

function gitDate(file) {
  try {
    const out = execSync(`git log -1 --format=%cI -- "${file}"`, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    return out || null
  } catch {
    return null
  }
}

if (!existsSync(join(ROOT, '.git'))) {
  // Vercel-Build (Tarball ohne Git-Historie): eingecheckte Daten behalten.
  console.log('[lastmod] kein .git gefunden — behalte eingecheckte lastmod.json')
  process.exit(0)
}

const files = collectPageFiles(join(ROOT, 'app'))
const map = {}
for (const file of files) {
  const rel = relative(ROOT, file)
  const date = gitDate(rel)
  if (date) map[rel] = date
}

mkdirSync(OUT_DIR, { recursive: true })
writeFileSync(OUT_FILE, JSON.stringify(map, null, 2) + '\n')
console.log(`[lastmod] ${files.length} Seiten → ${relative(ROOT, OUT_FILE)}`)
