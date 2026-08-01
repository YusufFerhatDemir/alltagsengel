/**
 * P0-5: keine hartcodierte IK-Nummer mehr im App-Code.
 *
 * Vorher stand '460629986' (Alltagsengels Institutionskennzeichen) wörtlich
 * in vier Dateien (Audit-Befund audit/production-hardening):
 *   - lib/abrechnung/edifact-generator.ts (ALLTAGSENGEL_IK-Konstante)
 *   - lib/abrechnung/leistungsnachweis-pdf.ts (LEISTUNGSERBRINGER.ik)
 *   - app/admin/abrechnung/einstellungen/page.tsx (EIGENE_IK-Konstante)
 *   - app/api/leistungsnachweis/route.ts (Fallback ohne Env-Wert)
 *
 * Fix: lib/config/org-config.ts::getOrgIK() liest die IK aus der
 * organizations-Tabelle bzw. ALLTAGSENGEL_IK (Env) — kein hartcodierter
 * Default mehr. Einzige erlaubte Fundstelle des Literals ist Testcode
 * (Fixtures für SECON-Zertifikatstests, die eine plausible IK brauchen).
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

const REPO_ROOT = path.resolve(__dirname, '../..')
const SCAN_DIRS = ['app', 'lib']
const EXCLUDE_DIR_NAMES = new Set(['node_modules', '.next', '.git'])
const HARDCODED_IK = /['"]460629986['"]/

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (EXCLUDE_DIR_NAMES.has(entry)) continue
    const full = path.join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      walk(full, out)
    } else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith('.test.ts') && !entry.endsWith('.test.tsx')) {
      out.push(full)
    }
  }
  return out
}

let offenders: Array<{ file: string; line: number; text: string }>

beforeAll(() => {
  offenders = []
  for (const dir of SCAN_DIRS) {
    const files = walk(path.join(REPO_ROOT, dir))
    for (const file of files) {
      const lines = readFileSync(file, 'utf-8').split('\n')
      lines.forEach((line, i) => {
        if (HARDCODED_IK.test(line)) {
          offenders.push({ file: path.relative(REPO_ROOT, file), line: i + 1, text: line.trim() })
        }
      })
    }
  }
})

describe('P0-5: keine hartcodierte IK-Nummer (Literal 460629986) im App-/Lib-Code', () => {
  it('kein app/ oder lib/-Quellcode enthält die IK als String-Literal', () => {
    expect(offenders, JSON.stringify(offenders, null, 2)).toEqual([])
  })
})

describe('P0-5: lib/config/org-config.ts existiert und wird genutzt', () => {
  const orgConfigSrc = readFileSync(path.join(REPO_ROOT, 'lib/config/org-config.ts'), 'utf-8')

  it('exportiert getOrgIK()', () => {
    expect(orgConfigSrc).toMatch(/export async function getOrgIK/)
  })

  it('liest primär aus der organizations-Tabelle, dann aus ALLTAGSENGEL_IK (Env), sonst Fehler', () => {
    expect(orgConfigSrc).toMatch(/\.from\('organizations'\)/)
    expect(orgConfigSrc).toMatch(/process\.env\.ALLTAGSENGEL_IK/)
    expect(orgConfigSrc).toMatch(/throw new Error/)
  })

  const consumers = [
    'lib/abrechnung/leistungsnachweis-pdf.ts',
    'app/admin/abrechnung/einstellungen/page.tsx',
    'app/admin/abrechnung/page.tsx',
    'app/api/leistungsnachweis/route.ts',
  ]

  for (const file of consumers) {
    it(`${file} ruft getOrgIK() auf, statt die IK selbst zu kennen`, () => {
      const src = readFileSync(path.join(REPO_ROOT, file), 'utf-8')
      expect(src).toMatch(/getOrgIK/)
    })
  }

  it('edifact-generator.ts exportiert keine ALLTAGSENGEL_IK-Konstante mehr (absender_ik ist jetzt Pflichtparameter)', () => {
    const src = readFileSync(path.join(REPO_ROOT, 'lib/abrechnung/edifact-generator.ts'), 'utf-8')
    expect(src).not.toMatch(/export const ALLTAGSENGEL_IK\s*=/)
    expect(src).toMatch(/absender_ik: string,/)
  })
})
