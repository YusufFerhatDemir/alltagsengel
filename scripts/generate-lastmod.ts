/**
 * Generiert lib/generated/lastmod.json: page.tsx → letztes Git-Commit-Datum (ISO).
 * Wird von app/sitemap.ts gelesen, damit <lastmod> echte Änderungsdaten trägt
 * statt Datei-mtimes (auf Vercel tragen alle Dateien den Deploy-Zeitstempel,
 * was das lastmod-Signal für Google wertlos macht).
 *
 * Läuft als npm prebuild. Auf Vercel gibt es kein .git (Build aus Tarball) —
 * dann bleibt die eingecheckte JSON unverändert (Merge-Strategie: nur
 * überschreiben, wenn Git ein Datum liefert). Deshalb MUSS die JSON
 * committet sein; sie aktualisiert sich bei jedem lokalen Build.
 */
import { execSync } from 'child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join, relative } from 'path'
import { readdirSync } from 'fs'

const ROOT = process.cwd()
const OUT_DIR = join(ROOT, 'lib', 'generated')
const OUT_FILE = join(OUT_DIR, 'lastmod.json')

// Nur öffentliche Segmente — private Bereiche stehen nicht in der Sitemap.
const PRIVATE_SEGMENTS = new Set([
  'admin', 'mis', 'api', 'engel', 'kunde', 'fahrer', 'auth',
  'investor', 'notfall', 'lp', 'choose', 'sentry-example',
])

function collectPageFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      if (entry.name === 'page.tsx') acc.push(join(dir, entry.name))
      continue
    }
    const seg = entry.name
    if (dir === join(ROOT, 'app') && PRIVATE_SEGMENTS.has(seg)) continue
    collectPageFiles(join(dir, seg), acc)
  }
  return acc
}

function gitDate(file: string): string | null {
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

function main() {
  let existing: Record<string, string> = {}
  if (existsSync(OUT_FILE)) {
    try {
      existing = JSON.parse(readFileSync(OUT_FILE, 'utf8'))
    } catch {
      existing = {}
    }
  }

  if (!existsSync(join(ROOT, '.git'))) {
    // Vercel-Build (Tarball ohne Git-Historie): eingecheckte Daten behalten.
    console.log('[lastmod] kein .git gefunden — behalte eingecheckte lastmod.json')
    return
  }

  const files = collectPageFiles(join(ROOT, 'app'))
  const map: Record<string, string> = { ...existing }
  let updated = 0
  for (const file of files) {
    const rel = relative(ROOT, file)
    const date = gitDate(rel)
    if (date && map[rel] !== date) {
      map[rel] = date
      updated++
    } else if (date) {
      map[rel] = date
    }
  }

  mkdirSync(OUT_DIR, { recursive: true })
  writeFileSync(OUT_FILE, JSON.stringify(map, null, 2) + '\n')
  console.log(`[lastmod] ${files.length} Seiten, ${updated} Daten aktualisiert → ${relative(ROOT, OUT_FILE)}`)
}

main()
