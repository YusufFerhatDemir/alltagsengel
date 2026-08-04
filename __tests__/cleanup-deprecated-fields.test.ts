/**
 * Tests für Cleanup A1: pflegegrad + completed_at Bereinigung
 * Stellt sicher, dass veraltete Feld-Referenzen entfernt/korrigiert wurden.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const ROOT = path.resolve(__dirname, '..')

function readFile(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf-8')
}

describe('A1: profiles.pflegegrad Referenzen entfernt', () => {
  it('register/page.tsx schreibt nicht mehr in profiles.pflegegrad', () => {
    const src = readFile('app/auth/register/page.tsx')
    // Darf kein .from('profiles').update({pflegegrad: ...}) mehr enthalten
    expect(src).not.toMatch(/from\(['"]profiles['"]\)\.update\(\{[\s\S]*?pflegegrad/)
    // Soll stattdessen care_recipients verwenden
    expect(src).toContain("from('care_recipients').insert")
  })

  it('OnboardingFlow.tsx liest pflegegrad aus care_recipients statt profiles', () => {
    const src = readFile('components/OnboardingFlow.tsx')
    // Select auf profiles darf kein pflegegrad mehr enthalten
    const profileSelect = src.match(/from\(['"]profiles['"]\)\s*\.select\(['"]([^'"]+)['"]\)/)
    expect(profileSelect).toBeTruthy()
    expect(profileSelect![1]).not.toContain('pflegegrad')
    // Stattdessen Abfrage auf care_recipients
    expect(src).toContain("from('care_recipients')")
  })

  it('OnboardingFlow.tsx schreibt pflegegrad in care_recipients statt profiles', () => {
    const src = readFile('components/OnboardingFlow.tsx')
    // profiles.update darf kein pflegegrad mehr setzen
    const profileUpdates = src.match(/from\(['"]profiles['"]\)\.update\(([^)]+)\)/g) || []
    for (const u of profileUpdates) {
      expect(u).not.toContain('pflegegrad')
    }
  })
})

describe('A1: bookings.completed_at Referenz korrigiert', () => {
  it('review-request cron verwendet date statt completed_at', () => {
    const src = readFile('app/api/cron/review-request/route.ts')
    expect(src).not.toContain("'completed_at'")
    expect(src).not.toContain('"completed_at"')
    // Muss .gte('date', ...) oder ähnliches verwenden
    expect(src).toMatch(/\.gte\(['"]date['"]/)
    expect(src).toMatch(/\.lte\(['"]date['"]/)
  })
})

describe('A1: Tote pflegegrad-Abfragen entfernt', () => {
  it('engel/buchungen selektiert pflegegrad nicht mehr (ungenutzt)', () => {
    const src = readFile('app/engel/buchungen/page.tsx')
    // care_recipients join darf kein pflegegrad mehr enthalten
    const crSelect = src.match(/care_recipients:care_recipient_id\(([^)]+)\)/)
    expect(crSelect).toBeTruthy()
    expect(crSelect![1]).not.toContain('pflegegrad')
  })
})
