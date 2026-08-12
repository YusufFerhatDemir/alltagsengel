/**
 * P0: Mandanten-Isolation für Einsatzplanung + Personalverwaltung (lib/personal, lib/pflege).
 *
 * Zwei Regressionen, die bei der Production-Verifizierung am 08.08.2026 gefunden wurden:
 *
 * 1) Die Auth-Guards lasen `organization_id` aus `profiles`. Diese Spalte existiert
 *    in der Production-DB NICHT (Introspektion via PostgREST: profiles hat id, role,
 *    first_name, last_name, email, phone, … aber keine organization_id). PostgREST
 *    antwortet mit 42703 "column profiles.organization_id does not exist", der Select
 *    liefert null → jede /api/personal- und /api/pflege-Route endete in
 *    403 "Nur für Administratoren." Die Organisation haengt am
 *    organization_members-Mapping und wird über getActiveOrgId() aufgelöst.
 *
 * 2) In den Create-Routen stand der `...body`-Spread NACH den vertrauenswürdigen
 *    Feldern (organizationId/erstelltVon aus auth.ctx) — bzw. der Body wurde
 *    ungefiltert durchgereicht. Da die Routen mit createAdminClient() (Service-Role,
 *    BYPASSRLS) arbeiten, greift die RLS-Policy `WITH CHECK (organization_id =
 *    current_org_id())` nicht: ein Admin von Org A konnte per
 *    {"organizationId": "<org-B>"} in einen fremden Mandanten schreiben.
 *
 * Bewusst NICHT abgedeckt: lib/ops/api-auth.ts und lib/akten/api-auth.ts lesen
 * weiterhin profiles.organization_id (andere Blöcke, separat zu fixen).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import path from 'node:path'

const REPO_ROOT = path.resolve(__dirname, '../..')

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

const rel = (f: string) => path.relative(REPO_ROOT, f)

describe('P0-A: Auth-Guards lesen keine nicht-existente profiles.organization_id', () => {
  const guards = ['lib/personal/api-auth.ts', 'lib/pflege/api-auth.ts']

  it.each(guards)('%s selektiert organization_id nicht aus profiles', file => {
    const src = readFileSync(path.join(REPO_ROOT, file), 'utf-8')
    // Alle .from('profiles')-Ketten einsammeln und deren .select(...)-Argument prüfen.
    const offenders: string[] = []
    for (const m of src.matchAll(/from\('profiles'\)[\s\S]{0,200}?\.select\(\s*'([^']*)'/g)) {
      if (/\borganization_id\b/.test(m[1])) offenders.push(m[1])
    }
    expect(offenders, `profiles-Select mit organization_id in ${file}`).toEqual([])
  })

  it.each(guards)('%s löst die Organisation über getActiveOrgId() auf', file => {
    const src = readFileSync(path.join(REPO_ROOT, file), 'utf-8')
    expect(src).toMatch(/getActiveOrgId/)
  })
})

describe('P0-B: kein ...body-Spread darf organizationId überschreiben', () => {
  const routeFiles = [
    ...walk(path.join(REPO_ROOT, 'app/api/personal')),
    ...walk(path.join(REPO_ROOT, 'app/api/pflege')),
  ].filter(f => f.endsWith('route.ts'))

  it('findet überhaupt Routen zum Prüfen', () => {
    expect(routeFiles.length).toBeGreaterThan(0)
  })

  it('jeder ...body-Spread wird von einem expliziten organizationId gefolgt', () => {
    const offenders: Array<{ file: string; line: number }> = []

    for (const file of routeFiles) {
      const src = readFileSync(file, 'utf-8')
      for (const m of src.matchAll(/\.\.\.body\b/g)) {
        const spreadAt = m.index!
        // Ende des umschliessenden Objekt-Literals suchen (Klammer-Balance ab dem Spread).
        let depth = 0
        let end = src.length
        for (let i = spreadAt; i < src.length; i++) {
          const c = src[i]
          if (c === '{' || c === '(' || c === '[') depth++
          else if (c === '}' || c === ')' || c === ']') {
            if (depth === 0) { end = i; break }
            depth--
          }
        }
        const tail = src.slice(spreadAt, end)
        if (!/\borganizationId\s*[,:]/.test(tail)) {
          offenders.push({ file: rel(file), line: src.slice(0, spreadAt).split('\n').length })
        }
      }
    }

    expect(offenders, JSON.stringify(offenders, null, 2)).toEqual([])
  })
})
