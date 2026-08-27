/**
 * Jede API-Route misst sich selbst
 * ═══════════════════════════════════════════════════════════════════
 *
 * `/api/admin/monitoring` liest einen Ring-Buffer, den ausschliesslich
 * `withTracking` fuellt. Ist eine Route nicht gewrappt, taucht sie dort
 * nie auf — und zwar unauffaellig: das Dashboard zeigt fuer sie keine
 * Fehler, weil es fuer sie nichts gemessen hat. „Keine Fehler" und
 * „nichts gemessen" sehen dort identisch aus.
 *
 * Genau dieser Zustand lag vor: das Tracking existierte, war aber von
 * KEINER Route verdrahtet. Das Dashboard lieferte dauerhaft Nullwerte
 * und sah dabei gesund aus.
 *
 * Der Test liest Quelltext. Er beweist nicht, dass gemessen wird — das
 * tut __tests__/monitoring/tracker.test.ts. Er beweist, dass ueberall
 * gewrappt ist.
 */

import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import {
  HANDLER_NAMEN,
  istRoherHandler as ungewrappt,
  istGemessenerHandler as gewrappt,
} from '../helpers/route-quelle'

const WURZEL = path.resolve(__dirname, '../..')
const HANDLER = HANDLER_NAMEN

/**
 * Routen, die bewusst NICHT gewrappt sind.
 *
 * Bewusst eine Liste und kein Muster: eine Ausnahme einzutragen ist so
 * eine sichtbare Entscheidung im Diff. Leer heisst: es gibt keine.
 */
const AUSNAHMEN: string[] = []

function routenDateien(start: string): string[] {
  const treffer: string[] = []
  const lauf = (verzeichnis: string) => {
    for (const eintrag of readdirSync(verzeichnis)) {
      const voll = path.join(verzeichnis, eintrag)
      if (statSync(voll).isDirectory()) lauf(voll)
      else if (eintrag === 'route.ts') treffer.push(path.relative(WURZEL, voll))
    }
  }
  lauf(path.join(WURZEL, start))
  return treffer.sort()
}

const DATEIEN = routenDateien('app/api').filter(d => !AUSNAHMEN.includes(d))

// ═══════════════════════════════════════════════════════════════════
describe('app/api/** — jede Route ist an das Request-Tracking verdrahtet', () => {
  it('findet ueberhaupt Routen (der Scanner selbst muss funktionieren)', () => {
    // Ohne diese Zusicherung waere eine leere Liste ein gruener Test —
    // dieselbe Falle wie beim Dashboard selbst.
    expect(DATEIEN.length).toBeGreaterThan(300)
  })

  it('kein einziger Handler exportiert sich roh', () => {
    const roh: string[] = []
    for (const datei of DATEIEN) {
      const src = readFileSync(path.join(WURZEL, datei), 'utf-8')
      for (const h of HANDLER) {
        if (ungewrappt(src, h)) roh.push(`${datei}::${h}`)
      }
    }
    expect(
      roh,
      'Diese Handler sind nicht gewrappt und werden nie gemessen. '
      + 'Umstellen auf `export const X = withTracking(async function X(...) { ... })` '
      + '— oder, mit Begruendung, in AUSNAHMEN eintragen. '
      + 'Hilfe: node scripts/withtracking-codemod.mjs <pfad>',
    ).toEqual([])
  })

  it('jede Route exportiert mindestens einen gewrappten Handler', () => {
    const ohne = DATEIEN.filter(datei => {
      const src = readFileSync(path.join(WURZEL, datei), 'utf-8')
      return !HANDLER.some(h => gewrappt(src, h))
    })
    expect(ohne, 'Routen ohne gewrappten Handler').toEqual([])
  })

  it('jede Route importiert withTracking aus der einen Quelle', () => {
    const falsch = DATEIEN.filter(datei => {
      const src = readFileSync(path.join(WURZEL, datei), 'utf-8')
      return !/import\s+\{[^}]*\bwithTracking\b[^}]*\}\s+from\s+'@\/lib\/monitoring\/tracker'/.test(src)
    })
    expect(falsch, 'Routen ohne korrekten withTracking-Import').toEqual([])
  })
})

// ═══════════════════════════════════════════════════════════════════
describe('Der Scanner erkennt eine ungewrappte Route', () => {
  // Gegenprobe: ohne sie koennte der Scanner alles durchwinken.
  //
  // Die Beispiele stehen bewusst OHNE Einrueckung im Template-Literal.
  // Die Muster sind auf den Zeilenanfang verankert (`^`), damit ein
  // Handler-Name in einem Kommentar oder String nicht mitzaehlt —
  // eingerueckte Beispiele wuerden daran vorbeilaufen und die
  // Gegenprobe waere gruen, ohne irgendetwas zu pruefen.
  const ROH = [
    'export async function GET(req: NextRequest) {',
    '  return NextResponse.json({ ok: true })',
    '}',
  ].join('\n')

  const GEWRAPPT = [
    'export const GET = withTracking(async function GET(req: NextRequest) {',
    '  return NextResponse.json({ ok: true })',
    '})',
  ].join('\n')

  it('meldet den rohen Export', () => {
    expect(ungewrappt(ROH, 'GET')).toBe(true)
    expect(gewrappt(ROH, 'GET')).toBe(false)
  })

  it('erkennt den gewrappten Export', () => {
    expect(ungewrappt(GEWRAPPT, 'GET')).toBe(false)
    expect(gewrappt(GEWRAPPT, 'GET')).toBe(true)
  })

  it('zaehlt einen Handler in einem Kommentar oder String nicht mit', () => {
    const nurText = [
      '// export async function GET(req) {}',
      "const s = 'export async function POST('",
      GEWRAPPT,
    ].join('\n')
    expect(ungewrappt(nurText, 'GET')).toBe(false)
    expect(ungewrappt(nurText, 'POST')).toBe(false)
    expect(gewrappt(nurText, 'GET')).toBe(true)
  })
})
