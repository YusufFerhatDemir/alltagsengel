#!/usr/bin/env tsx
/**
 * lint-forbidden.ts
 * -----------------
 * Prevention-Control gegen Regressionen bei kritischen Strings
 * (z. B. falsche Rechtsform "AlltagsEngel GmbH" statt "Alltagsengel UG (haftungsbeschränkt)").
 *
 * Zwei Betriebsmodi:
 *
 *   1) Voll-Scan (CI): `tsx scripts/lint-forbidden.ts`
 *      → Durchsucht das gesamte Repo (mit Ausschlussliste) und bricht mit
 *        Exit-Code 1 ab, sobald ein verbotenes Muster auftaucht.
 *
 *   2) Staged-Scan (pre-commit): `tsx scripts/lint-forbidden.ts --staged`
 *      → Prüft ausschließlich die aktuell gestageten Dateien.
 *        Bricht den Commit mit Exit-Code 1 ab, wenn ein Muster passt.
 *
 * Konfiguration: scripts/forbidden-strings.json
 *
 * Analogie: Kein Feuermelder, sondern ein Türsteher mit schwarzer Liste.
 * Namen auf der Liste kommen nicht mehr rein — weder beim Commit, noch in die Release-Pipeline.
 */

import { execSync } from 'node:child_process'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

// ---- Config ---------------------------------------------------------------

interface ForbiddenRule {
  id: string
  pattern: string
  reason: string
  caseSensitive?: boolean
  allowedReplacements?: string[]
}

interface ForbiddenConfig {
  version: number
  rules: ForbiddenRule[]
  excludeGlobs: string[]
}

const REPO_ROOT = process.cwd()
const CONFIG_PATH = join(REPO_ROOT, 'scripts', 'forbidden-strings.json')

function loadConfig(): ForbiddenConfig {
  try {
    const raw = readFileSync(CONFIG_PATH, 'utf8')
    const cfg = JSON.parse(raw) as ForbiddenConfig
    if (!Array.isArray(cfg.rules)) throw new Error('rules[] fehlt')
    return cfg
  } catch (err) {
    console.error(`❌ Konfiguration konnte nicht geladen werden: ${CONFIG_PATH}`)
    console.error(err)
    process.exit(2)
  }
}

// ---- Exclude-Matching -----------------------------------------------------

function globToRegex(glob: string): RegExp {
  // Sehr schlanker Glob → Regex Translator für Exclude-Patterns.
  // Unterstützt **, * und ? — mehr brauchen wir hier nicht.
  let re = '^'
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]
    if (c === '*') {
      if (glob[i + 1] === '*') {
        re += '.*'
        i++
      } else {
        re += '[^/]*'
      }
    } else if (c === '?') {
      re += '[^/]'
    } else if ('.+^$(){}|[]\\'.includes(c)) {
      re += '\\' + c
    } else if (c === '/') {
      re += '/'
    } else {
      re += c
    }
  }
  re += '$'
  return new RegExp(re)
}

function isExcluded(relPath: string, excludeGlobs: string[]): boolean {
  const norm = relPath.split(sep).join('/')
  for (const g of excludeGlobs) {
    const re = globToRegex(g)
    if (re.test(norm)) return true
    // Match auch Sub-Paths unter Directory-Globs (z. B. node_modules/**)
    if (g.endsWith('/**') && norm.startsWith(g.slice(0, -3))) return true
  }
  return false
}

// ---- Datei-Sammler --------------------------------------------------------

const TEXT_EXT_WHITELIST = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.json', '.md', '.mdx', '.txt', '.html', '.htm',
  '.css', '.scss', '.yml', '.yaml', '.env', '.example',
  '.sql', '.sh', '.toml', '.xml',
])

function hasTextExt(name: string): boolean {
  const lower = name.toLowerCase()
  if (!lower.includes('.')) return false
  const ext = lower.slice(lower.lastIndexOf('.'))
  return TEXT_EXT_WHITELIST.has(ext)
}

function walk(dir: string, excludeGlobs: string[], acc: string[]): void {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const entry of entries) {
    const abs = join(dir, entry)
    const rel = relative(REPO_ROOT, abs)
    if (isExcluded(rel, excludeGlobs)) continue
    let s
    try {
      s = statSync(abs)
    } catch {
      continue
    }
    if (s.isDirectory()) {
      walk(abs, excludeGlobs, acc)
    } else if (s.isFile() && hasTextExt(entry)) {
      acc.push(rel)
    }
  }
}

function getStagedFiles(): string[] {
  try {
    const out = execSync('git diff --cached --name-only --diff-filter=ACM', {
      encoding: 'utf8',
      cwd: REPO_ROOT,
    })
    return out
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .filter((l) => hasTextExt(l))
  } catch (err) {
    console.error('⚠️  Konnte git staged files nicht ermitteln — breche Pre-Commit aus Vorsicht ab.')
    console.error(err)
    process.exit(2)
  }
}

// ---- Scanner --------------------------------------------------------------

interface Hit {
  file: string
  line: number
  col: number
  ruleId: string
  pattern: string
  reason: string
  preview: string
  allowedReplacements?: string[]
}

function scanFile(relPath: string, rules: ForbiddenRule[]): Hit[] {
  const abs = join(REPO_ROOT, relPath)
  let content: string
  try {
    content = readFileSync(abs, 'utf8')
  } catch {
    return []
  }
  const hits: Hit[] = []
  const lines = content.split('\n')

  for (const rule of rules) {
    const flags = rule.caseSensitive === true ? 'g' : 'gi'
    // Escape regex specials im Pattern — wir matchen Literal-Strings.
    const escaped = rule.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(escaped, flags)
    for (let i = 0; i < lines.length; i++) {
      re.lastIndex = 0
      let m: RegExpExecArray | null
      while ((m = re.exec(lines[i])) !== null) {
        hits.push({
          file: relPath,
          line: i + 1,
          col: m.index + 1,
          ruleId: rule.id,
          pattern: rule.pattern,
          reason: rule.reason,
          preview: lines[i].trim().slice(0, 160),
          allowedReplacements: rule.allowedReplacements,
        })
        if (m[0].length === 0) re.lastIndex++ // Safety gegen zero-width Matches
      }
    }
  }
  return hits
}

// ---- Hauptlauf ------------------------------------------------------------

function main(): void {
  const cfg = loadConfig()
  const stagedOnly = process.argv.includes('--staged')

  let files: string[]
  if (stagedOnly) {
    files = getStagedFiles().filter((f) => !isExcluded(f, cfg.excludeGlobs))
  } else {
    const acc: string[] = []
    walk(REPO_ROOT, cfg.excludeGlobs, acc)
    files = acc
  }

  const allHits: Hit[] = []
  for (const f of files) {
    const hits = scanFile(f, cfg.rules)
    if (hits.length > 0) allHits.push(...hits)
  }

  const mode = stagedOnly ? 'STAGED' : 'FULL'
  const scanned = files.length

  if (allHits.length === 0) {
    console.log(`✅ lint-forbidden OK — ${scanned} Dateien gescannt (${mode}), 0 verbotene Strings.`)
    process.exit(0)
  }

  console.error(`\n❌ lint-forbidden hat ${allHits.length} Treffer in ${new Set(allHits.map((h) => h.file)).size} Datei(en) gefunden (${mode}).\n`)
  for (const h of allHits) {
    console.error(`  ${h.file}:${h.line}:${h.col}  [${h.ruleId}]`)
    console.error(`    Verbotenes Muster : "${h.pattern}"`)
    console.error(`    Grund             : ${h.reason}`)
    if (h.allowedReplacements && h.allowedReplacements.length > 0) {
      console.error(`    Erlaubter Ersatz  : ${h.allowedReplacements.map((r) => `"${r}"`).join(' | ')}`)
    }
    console.error(`    Zeile             : ${h.preview}`)
    console.error('')
  }

  console.error('Commit/CI wurde blockiert. Bitte die Treffer durch den erlaubten Ersatz ersetzen und erneut versuchen.')
  console.error('Konfig bearbeiten: scripts/forbidden-strings.json\n')
  process.exit(1)
}

main()
