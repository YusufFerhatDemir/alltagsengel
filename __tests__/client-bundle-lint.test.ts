/**
 * Tests fuer die Prevention-Control „Browser-Bundle".
 * @see scripts/lint-client-bundle.ts
 *
 * Die Regel meldet heute 0 Treffer — ihr Wert liegt also nicht im Finden,
 * sondern im Halten. Eine Regel, die nichts findet, ist aber genau die,
 * die unbemerkt kaputtgeht. Deshalb wird hier an gebauten Graphen
 * geprueft, dass sie beide Richtungen kann: anschlagen und schweigen.
 */
import { describe, it, expect } from 'vitest'
import { clientGraph, pruefeGraph, SCHWERE_SERVERMODULE, type Graph } from '../scripts/lint-client-bundle'

function graph(spez: {
  imports: Record<string, string[]>
  useClient?: string[]
  useServer?: string[]
  serverOnly?: string[]
}): Graph {
  return {
    imports: new Map(Object.entries(spez.imports)),
    useClient: new Set(spez.useClient ?? []),
    useServer: new Set(spez.useServer ?? []),
    serverOnly: new Set(spez.serverOnly ?? []),
  }
}

describe('Erreichbarkeit ab Client-Komponenten', () => {
  it('folgt der Importkette ueber mehrere Stufen', () => {
    const g = graph({
      imports: { 'a.tsx': ['b.ts'], 'b.ts': ['c.ts'], 'c.ts': [] },
      useClient: ['a.tsx'],
    })
    const erreicht = clientGraph(g)
    expect([...erreicht.keys()].sort()).toEqual(['a.tsx', 'b.ts', 'c.ts'])
    expect(erreicht.get('c.ts')).toEqual(['a.tsx', 'b.ts', 'c.ts'])
  })

  it('haelt an einer Server-Action an', () => {
    // Der Rumpf einer 'use server'-Datei wandert nicht ins Bundle. Ohne
    // diese Grenze meldete eine erste Fassung fuenf Lecks, die alle ueber
    // app/**/actions.ts liefen und keine waren.
    const g = graph({
      imports: { 'seite.tsx': ['actions.ts'], 'actions.ts': ['geheim.ts'], 'geheim.ts': [] },
      useClient: ['seite.tsx'],
      useServer: ['actions.ts'],
    })
    const erreicht = clientGraph(g)
    expect(erreicht.has('actions.ts')).toBe(true)   // die Referenz schon
    expect(erreicht.has('geheim.ts')).toBe(false)   // ihr Inhalt nicht
  })

  it('erreicht nichts, wenn es keine Client-Komponente gibt', () => {
    const g = graph({ imports: { 'a.ts': ['b.ts'], 'b.ts': [] } })
    expect(clientGraph(g).size).toBe(0)
  })

  it('kommt mit einem Import-Kreis zurecht', () => {
    const g = graph({
      imports: { 'a.tsx': ['b.ts'], 'b.ts': ['a.tsx', 'c.ts'], 'c.ts': ['b.ts'] },
      useClient: ['a.tsx'],
    })
    expect(clientGraph(g).size).toBe(3)
  })
})

describe('R1 — server-only bleibt am Server', () => {
  it('meldet ein server-only-Modul, das ueber eine Client-Komponente haengt', () => {
    const g = graph({
      imports: { 'seite.tsx': ['helfer.ts'], 'helfer.ts': ['lib/supabase/admin.ts'], 'lib/supabase/admin.ts': [] },
      useClient: ['seite.tsx'],
      serverOnly: ['lib/supabase/admin.ts'],
    })
    const b = pruefeGraph(g)
    expect(b).toHaveLength(1)
    expect(b[0].regel).toBe('server-only')
    // Der Weg gehoert in die Meldung — ohne ihn ist ein Treffer nicht behebbar.
    expect(b[0].weg).toEqual(['seite.tsx', 'helfer.ts', 'lib/supabase/admin.ts'])
  })

  it('schweigt, wenn dasselbe Modul nur hinter einer Server-Action haengt', () => {
    const g = graph({
      imports: { 'seite.tsx': ['actions.ts'], 'actions.ts': ['lib/supabase/admin.ts'], 'lib/supabase/admin.ts': [] },
      useClient: ['seite.tsx'],
      useServer: ['actions.ts'],
      serverOnly: ['lib/supabase/admin.ts'],
    })
    expect(pruefeGraph(g)).toEqual([])
  })

  it('schweigt bei einem server-only-Modul ohne jeden Client-Bezug', () => {
    const g = graph({
      imports: { 'route.ts': ['lib/supabase/admin.ts'], 'lib/supabase/admin.ts': [] },
      serverOnly: ['lib/supabase/admin.ts'],
    })
    expect(pruefeGraph(g)).toEqual([])
  })
})

describe('R2 — schwere Tabellen bleiben am Server', () => {
  const SCHWER = SCHWERE_SERVERMODULE[0].pfad

  it('nennt mindestens die PLZ-Tabelle', () => {
    expect(SCHWER).toBe('lib/plz-coords.data.ts')
  })

  it('meldet die Tabelle, sobald eine Client-Komponente sie erreicht', () => {
    const g = graph({
      imports: { 'karte.tsx': ['lib/plz-match.ts'], 'lib/plz-match.ts': [SCHWER], [SCHWER]: [] },
      useClient: ['karte.tsx'],
    })
    const b = pruefeGraph(g)
    expect(b).toHaveLength(1)
    expect(b[0].regel).toBe('schwer')
    expect(b[0].grund).toContain('176 KB')
  })

  it('schweigt, solange sie nur serverseitig haengt', () => {
    const g = graph({
      imports: { 'app/api/x/route.ts': [SCHWER], [SCHWER]: [] },
      useClient: ['egal.tsx'],
    })
    expect(pruefeGraph(g)).toEqual([])
  })
})

describe('Die Regel laeuft ueber das echte Repo', () => {
  it('meldet den Baum als sauber', async () => {
    // Der eigentliche Beweis: die geprueften Muster geben auf dem echten
    // Baum dieselbe Antwort. Ohne diesen Fall pruefte die Suite nur
    // Kunstgraphen.
    const { execFileSync } = await import('node:child_process')
    const aus = execFileSync('npx', ['tsx', 'scripts/lint-client-bundle.ts'], {
      encoding: 'utf-8', cwd: process.cwd(),
    })
    expect(aus).toContain('lint-client-bundle OK')
    // Und dass die Server-Action-Grenze im echten Lauf ueberhaupt greift —
    // sonst waere die Regel nur zufaellig gruen.
    expect(aus).toMatch(/[1-9]\d* Server-Actions \(Grenze\)/)
  }, 180_000)
})
