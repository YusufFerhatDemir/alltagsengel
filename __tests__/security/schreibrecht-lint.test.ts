/**
 * Prüft die Regel, die verhindert, dass ein Schreib-Handler auf
 * LESERECHT autorisiert (Block 43, 14.09.2026).
 *
 * Warum es diese Regel gibt: zehn Wächter-Helfer nehmen die verlangte
 * Berechtigung als Parameter MIT Vorgabewert, und der ist ein
 * `.lesen`-Recht. `requirePflegeAdmin()` in einem POST sieht bewacht aus
 * und prüft doch nur Lesen. Kein bestehendes Gate sah diese Form: das
 * Berechtigungs-Literal steht im Helfer, nicht am Aufrufort.
 *
 * Die Tests hier prüfen die REGEL an erfundenem Quelltext. Dass sie im
 * echten Baum auch greift, prüft der Lauf selbst (`npm run lint:schreibrecht`).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
import {
  helferMitLeseVorgabe,
  handlerAbschnitte,
  importierteNamen,
  pruefeDatei,
  ausnahmeGiltNoch,
} from '../../scripts/lint-schreibrecht'
import { NUR_ADMINISTRATION } from '../../lib/auth/rollen'

const HELFER = new Map([['requirePflegeAdmin', 'pflege.lesen']])
const ohneModule = () => null

describe('helferMitLeseVorgabe — liest die Vorgabewerte aus dem Quelltext', () => {
  it('erkennt einen Helfer mit Lese-Vorgabewert', () => {
    const quelle = `
export async function requireFooAdmin(
  berechtigung: Berechtigung = 'pflege.lesen'
): Promise<X> {}
`
    const datei = '/tmp/lint-schreibrecht-probe-a.ts'
    writeFileSync(datei, quelle)
    expect(helferMitLeseVorgabe([datei]).get('requireFooAdmin')).toBe('pflege.lesen')
  })

  it('meldet einen Helfer mit SCHREIB-Vorgabewert nicht', () => {
    const quelle = `
export async function requireBarAdmin(
  berechtigung: Berechtigung = 'pflege.schreiben'
): Promise<X> {}
`
    const datei = '/tmp/lint-schreibrecht-probe-b.ts'
    writeFileSync(datei, quelle)
    expect(helferMitLeseVorgabe([datei]).has('requireBarAdmin')).toBe(false)
  })

  it('findet die echten Helfer im Baum — die Falle ist nicht theoretisch', () => {
    const gefunden = helferMitLeseVorgabe([
      'lib/pflege/api-auth.ts', 'lib/qm/api-auth.ts', 'lib/abrechnung/require-admin.ts',
    ])
    expect(gefunden.get('requirePflegeAdmin')).toBe('pflege.lesen')
    expect(gefunden.get('requireQmAdmin')).toBe('qm.lesen')
    expect(gefunden.get('requireAdmin')).toBe('abrechnung.lesen')
  })
})

describe('handlerAbschnitte — jeder Handler wird für sich betrachtet', () => {
  it('trennt GET und POST, statt die Datei als Fenster zu lesen', () => {
    const src = `
export const GET = withTracking(async function GET() {
  const auth = await requirePflegeAdmin('pflege.lesen')
})
export const POST = withTracking(async function POST() {
  const auth = await requirePflegeAdmin('pflege.schreiben')
})
`
    const ab = handlerAbschnitte(src)
    expect(ab.map(a => a.name)).toEqual(['GET', 'POST'])
    expect(ab[0].text).toContain('pflege.lesen')
    expect(ab[0].text).not.toContain('pflege.schreiben')
  })

  it('ein korrektes GET neben einem korrekten POST ist kein Verstoss', () => {
    const src = `
import { requirePflegeAdmin } from '@/lib/pflege/api-auth'
export const GET = withTracking(async function GET() {
  const auth = await requirePflegeAdmin()
})
export const POST = withTracking(async function POST() {
  const auth = await requirePflegeAdmin('pflege.schreiben')
})
`
    expect(pruefeDatei('x/route.ts', src, HELFER, ohneModule)).toEqual([])
  })
})

describe('importierteNamen — eine gleichnamige lokale Funktion ist ein anderer Riegel', () => {
  it('zählt nur importierte Bezeichner', () => {
    const src = `import { requirePflegeAdmin, foo as bar } from '@/lib/pflege/api-auth'`
    const namen = importierteNamen(src)
    expect(namen.has('requirePflegeAdmin')).toBe(true)
    expect(namen.has('foo')).toBe(true)
  })

  it('meldet ein lokal definiertes requireAdmin NICHT', () => {
    // app/api/email/send/route.ts definiert ein eigenes requireAdmin, das
    // quellenSindAdministration prüft — strenger, nicht schwächer.
    const src = `
async function requirePflegeAdmin() { /* eigener, strengerer Riegel */ }
export const POST = withTracking(async function POST() {
  const auth = await requirePflegeAdmin()
  await db.from('t').insert({})
})
`
    expect(pruefeDatei('x/route.ts', src, HELFER, ohneModule)).toEqual([])
  })
})

describe('R1 — Schreiben auf Lese-Vorgabewert', () => {
  const kopf = `import { requirePflegeAdmin } from '@/lib/pflege/api-auth'\n`

  it('meldet einen POST, der den Helfer ohne Argument ruft', () => {
    const v = pruefeDatei('x/route.ts', kopf + `
export const POST = withTracking(async function POST() {
  const auth = await requirePflegeAdmin()
  await db.from('pflege_verlauf').insert({})
})
`, HELFER, ohneModule)
    expect(v.some(x => x.regel === 'R1' && x.handler === 'POST')).toBe(true)
  })

  it('meldet einen PATCH, der ausdrücklich ein Leserecht übergibt', () => {
    const v = pruefeDatei('x/route.ts', kopf + `
export const PATCH = withTracking(async function PATCH() {
  const auth = await requirePflegeAdmin('pflege.lesen')
})
`, HELFER, ohneModule)
    expect(v.some(x => x.regel === 'R1')).toBe(true)
  })

  it('meldet einen DELETE ebenso — nicht nur POST', () => {
    const v = pruefeDatei('x/route.ts', kopf + `
export const DELETE = withTracking(async function DELETE() {
  const auth = await requirePflegeAdmin()
})
`, HELFER, ohneModule)
    expect(v.some(x => x.regel === 'R1' && x.handler === 'DELETE')).toBe(true)
  })

  it('lässt das Tür-und-Zweig-Muster durch (qm/befunde PATCH)', () => {
    // Richtig: die weite Berechtigung als Tür, das enge Recht im Zweig,
    // BEVOR geschrieben wird.
    const v = pruefeDatei('x/route.ts', kopf + `
export const PATCH = withTracking(async function PATCH() {
  const zutritt = await requirePflegeAdmin('pflege.lesen')
  if (body.aktion === 'a') {
    const auth = await requirePflegeAdmin('pflege.schreiben')
  }
})
`, HELFER, ohneModule)
    expect(v).toEqual([])
  })
})

describe('R2 — Leserecht als einzige Schreibautorisierung', () => {
  it('meldet ein Leserecht, das keine Vorbehaltsberechtigung ist', () => {
    const v = pruefeDatei('x/route.ts', `
export const POST = withTracking(async function POST() {
  const auth = await requireBerechtigung('stammdaten.lesen')
  await db.from('clients').insert({})
})
`, new Map(), ohneModule)
    expect(v.some(x => x.regel === 'R2' && x.text.includes('stammdaten.lesen'))).toBe(true)
  })

  it('lässt ein Leserecht unter Vorbehalt der Administration durch', () => {
    // 'sicherheit.lesen' halten nur admin/superadmin. Die Watchlist
    // schaltet darüber die Kontoüberwachung — heute kein Fund.
    expect(NUR_ADMINISTRATION).toContain('sicherheit.lesen')
    const v = pruefeDatei('x/route.ts', `
export const POST = withTracking(async function POST() {
  const auth = await requireBerechtigung('sicherheit.lesen')
  await db.from('watchlist').insert({})
})
`, new Map(), ohneModule)
    expect(v).toEqual([])
  })

  it('schlägt an, sobald sicherheit.lesen den Vorbehalt verliert', () => {
    // Der eigentliche Zweck der Regel: nimmt jemand das Recht später in
    // die Matrix einer Fachrolle auf, bekäme diese Rolle stillschweigend
    // das Recht, die Kontoüberwachung ABZUSCHALTEN.
    const ohneVorbehalt = NUR_ADMINISTRATION.filter(b => b !== 'sicherheit.lesen')
    expect(ohneVorbehalt).not.toContain('sicherheit.lesen')
    const v = pruefeDatei('x/route.ts', `
export const POST = withTracking(async function POST() {
  const auth = await requireBerechtigung('irgendwas.lesen')
  await db.from('watchlist').insert({})
})
`, new Map(), ohneModule)
    expect(v.some(x => x.regel === 'R2')).toBe(true)
  })

  it('lässt einen GET in Ruhe', () => {
    const v = pruefeDatei('x/route.ts', `
export const GET = withTracking(async function GET() {
  const auth = await requireBerechtigung('stammdaten.lesen')
})
`, new Map(), ohneModule)
    expect(v).toEqual([])
  })
})

describe('ausnahmeGiltNoch — der Trockenlauf muss ein Trockenlauf bleiben', () => {
  const src = `import { camtPilotLauf } from '@/lib/pilot/camt-pilot'`

  it('gilt, solange der Handler selbst nicht schreibt', () => {
    expect(ausnahmeGiltNoch(`const b = await camtPilotLauf(x)`, src, () => `
export async function camtPilotLauf() { const { data } = await db.from('t').select('id') }
`)).toBe(true)
  })

  it('erlischt, sobald der Handler selbst schreibt', () => {
    expect(ausnahmeGiltNoch(`await db.from('t').insert({})`, src, () => '')).toBe(false)
  })

  it('erlischt, sobald die aufgerufene Modulfunktion schreibt', () => {
    expect(ausnahmeGiltNoch(`const b = await camtPilotLauf(x)`, src, () => `
export async function camtPilotLauf() { await db.from('t').insert({}) }
`)).toBe(false)
  })

  it('erlischt, wenn das Modul NICHT gelesen werden kann', () => {
    // Nicht nachsehen können ist kein Beleg. Der umgekehrte Default
    // hiesse: ein verschobenes Modul macht die Ausnahme unbefristet gültig.
    expect(ausnahmeGiltNoch(`const b = await camtPilotLauf(x)`, src, () => null)).toBe(false)
  })

  it('schaut an einer Funktion vorbei, die der Handler gar nicht ruft', () => {
    expect(ausnahmeGiltNoch(`const b = await camtPilotLauf(x)`, src, () => `
export async function camtPilotLauf() { await db.from('t').select('id') }
export async function ganzAndereFunktion() { await db.from('t').insert({}) }
`)).toBe(true)
  })
})

describe('der Prüfer selbst', () => {
  it('ist als Gate verdrahtet, nicht nur vorhanden', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
    expect(pkg.scripts['lint:schreibrecht']).toBe('tsx scripts/lint-schreibrecht.ts')
    expect(readFileSync('.github/workflows/ci.yml', 'utf8')).toContain('npm run lint:schreibrecht')
  })
})
