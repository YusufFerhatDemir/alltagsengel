// ═══════════════════════════════════════════════════════════════════════
// Security-Audit 2026-08-19 — MITTEL-3 + NIEDRIG-3
//
// MITTEL-3: Pflegenotizen entstanden per Direkt-INSERT aus dem Browser und
//           damit vollstaendig ohne Audit-Eintrag.
// NIEDRIG-3: page_views wurde aus dem Browser befuellt; die dafuer noetige
//           Policy war `WITH CHECK (true)` fuer `public`.
//
// Diese Suite haelt fest, dass beide Pfade jetzt ueber den Server laufen —
// und scannt zusaetzlich alle 'use client'-Dateien, damit kein neuer
// Direktschreibpfad unbemerkt dazukommt.
// ═══════════════════════════════════════════════════════════════════════
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const WURZEL = process.cwd()

function lesen(pfad: string): string {
  return readFileSync(join(WURZEL, pfad), 'utf8')
}

// ── MITTEL-3: care_notes ──────────────────────────────────────────────
describe('MITTEL-3: Pflegenotizen laufen ueber eine Server Action mit Audit', () => {
  const panel = lesen('components/admin/CareNotesPanel.tsx')
  const action = lesen('app/admin/notizen/actions.ts')

  it('CareNotesPanel schreibt nicht mehr direkt nach care_notes', () => {
    expect(panel).not.toMatch(/from\(['"]care_notes['"]\)\s*\.\s*insert/)
  })

  it('CareNotesPanel ruft die Server Action', () => {
    expect(panel).toContain('createCareNoteAction')
  })

  it('die Server Action ist als Server-Code markiert', () => {
    expect(action.trimStart().startsWith("'use server'")).toBe(true)
  })

  it('die Server Action prueft die Admin-Rolle serverseitig', () => {
    expect(action).toContain("['admin', 'superadmin'].includes(profile.role)")
  })

  it('die Server Action ist fail-closed ohne Organisation', () => {
    expect(action).toMatch(/if\s*\(!organizationId\)\s*throw/)
  })

  it('author_id kommt aus der Session, nicht aus der Eingabe', () => {
    expect(action).toContain('author_id: userId')
    expect(action).not.toMatch(/author_id:\s*eingabe\./)
    expect(action).not.toMatch(/author_name:\s*eingabe\./)
  })

  it('jeder Insert erzeugt einen Audit-Eintrag auf care_notes', () => {
    expect(action).toContain('logAuditEvent')
    expect(action).toContain("entityType: 'care_notes'")
    expect(action).toContain("action: 'create'")
  })

  it('author_role und category werden gegen die erlaubten Werte gefiltert', () => {
    expect(action).toContain('AUTOR_ROLLEN.includes')
    expect(action).toContain('KATEGORIEN.includes')
  })
})

// ── NIEDRIG-3: page_views ─────────────────────────────────────────────
describe('NIEDRIG-3: Seitenaufrufe laufen ueber eine ratenbegrenzte Route', () => {
  const tracker = lesen('components/PageTracker.tsx')
  const route = lesen('app/api/track/page-view/route.ts')

  it('PageTracker schreibt nicht mehr direkt nach page_views', () => {
    expect(tracker).not.toMatch(/from\(['"]page_views['"]\)/)
    expect(tracker).not.toContain('@/lib/supabase/client')
  })

  it('PageTracker ruft /api/track/page-view', () => {
    expect(tracker).toContain('/api/track/page-view')
  })

  it('die Route ist ratenbegrenzt — und zwar instanzuebergreifend', () => {
    // Track 13 B2: an die neue Regel gezogen, NICHT gelockert. Die alte
    // Fassung verlangte `rateLimit(` und war damit auch dann gruen, wenn
    // der Zaehler eine Map im Modul-Scope war — also je Serverless-Instanz,
    // und auf Vercel keine Grenze. Genau das war der Zustand, den sie
    // bestaetigt hat: der Dateikopf dieser Route nennt das Limit als eine
    // der drei Schranken, die den frueheren Direktschreibpfad aus dem
    // Browser ersetzen, und diese Schranke war instanzlokal.
    expect(route).toContain('rateLimitPersistent(')
    expect(/(?<![A-Za-z])rateLimit\s*\(/.test(route)).toBe(false)
  })

  it('die Route setzt user_id aus der Session, nicht aus dem Body', () => {
    expect(route).toContain('user_id: user?.id ?? null')
    expect(route).not.toMatch(/user_id:\s*body/)
  })

  it('die Route setzt organization_id serverseitig', () => {
    expect(route).toContain('organization_id: organizationId')
  })

  it('die Migration entfernt die offenen INSERT-Policies', () => {
    const migration = lesen('supabase/migrations/20260922010000_analytics_org_scope.sql')
    expect(migration).toContain('DROP POLICY IF EXISTS "Anyone can insert page_views"')
    expect(migration).toContain('DROP POLICY IF EXISTS "Anyone can insert visitors"')
    expect(migration).toContain('DROP POLICY IF EXISTS "Anyone can insert visitor_locations"')
  })
})

// ── Vollscan: keine neuen Direktschreibpfade aus dem Browser ──────────
describe('Vollscan der Client-Komponenten', () => {
  // Bewusst verbliebene, im Audit als NIEDRIG eingestufte Pfade.
  // RLS traegt in beiden Faellen (auth.uid()-Bindung, feste Feldliste).
  const ERLAUBT = new Set([
    'components/OnboardingFlow.tsx',    // UPDATE profiles / care_recipients, auth.uid()-gebunden
    'components/NotificationBell.tsx',  // UPDATE notifications.is_read, eigene Zeilen
  ])

  function sammle(verzeichnis: string, treffer: string[] = []): string[] {
    for (const eintrag of readdirSync(join(WURZEL, verzeichnis))) {
      if (eintrag === 'node_modules' || eintrag.startsWith('.')) continue
      const rel = `${verzeichnis}/${eintrag}`
      if (statSync(join(WURZEL, rel)).isDirectory()) sammle(rel, treffer)
      else if (/\.(tsx|ts)$/.test(eintrag)) treffer.push(rel)
    }
    return treffer
  }

  it('keine unbekannte Client-Komponente schreibt direkt in die Datenbank', () => {
    const dateien = [...sammle('components'), ...sammle('app')]
    const gefunden: string[] = []

    for (const datei of dateien) {
      if (datei.includes('/__tests__/') || datei.endsWith('.test.ts') || datei.endsWith('.test.tsx')) continue
      const src = readFileSync(join(WURZEL, datei), 'utf8')
      if (!/^\s*['"]use client['"]/m.test(src)) continue
      // .from('tabelle').insert|update|upsert|delete auf dem Supabase-Client
      if (!/\.from\(\s*['"][a-z_]+['"]\s*\)\s*(\r?\n\s*)?\.(insert|update|upsert|delete)\s*\(/.test(src)) continue
      if (ERLAUBT.has(datei)) continue
      gefunden.push(datei)
    }

    expect(gefunden, `Neue Client-Side-Writes gefunden:\n${gefunden.join('\n')}`).toEqual([])
  })
})
