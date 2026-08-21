import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ═══════════════════════════════════════════════════════════
// Track 6 / Bereich 3 der Lückenanalyse
// ═══════════════════════════════════════════════════════════
// Befund: „Die Prüfung existiert nur in lib/touren/server.ts und greift nur
// über POST /api/tours. Über /api/einsatzplanung lässt sich einem Engel im
// genehmigten Urlaub ein Einsatz zuweisen."
//
// Der echte Pfad ist ohne Datenbank nicht ausführbar (Supabase-Admin-Client,
// getActiveOrgId aus Cookies). Dieser Test hält deshalb die VERDRAHTUNG fest:
// verschwindet der Aufruf wieder aus der Route, wird er rot. Die Logik selbst
// ist über die Tourenplanung abgedeckt, sie ist hier dieselbe Funktion.
// ═══════════════════════════════════════════════════════════

const ROUTE = join(process.cwd(), 'app/api/einsatzplanung/route.ts')
const quelle = readFileSync(ROUTE, 'utf-8')

/** Grobe Zerlegung der Datei in ihre Handler-Abschnitte. */
function abschnitt(name: 'POST' | 'PATCH'): string {
  const start = quelle.indexOf(`export async function ${name}(`)
  expect(start, `${name}-Handler nicht gefunden`).toBeGreaterThan(-1)
  const rest = quelle.slice(start + 1)
  const next = rest.indexOf('\nexport async function ')
  return next === -1 ? rest : rest.slice(0, next)
}

describe('/api/einsatzplanung: Abwesenheits- und Verfügbarkeitsprüfung', () => {
  it('benutzt die vorhandene Prüffunktion aus der Tourenplanung', () => {
    // Bewusst KEINE zweite Implementierung — dieselbe Funktion, die
    // POST /api/tours schon nutzt.
    expect(quelle).toContain("import { pruefeCaregiverVerfuegbarkeit } from '@/lib/touren/server'")
  })

  it('prüft beim Anlegen eines Einsatzes (POST)', () => {
    const post = abschnitt('POST')
    expect(post).toContain('pruefeCaregiverVerfuegbarkeit(')
  })

  it('prüft beim Ändern eines Einsatzes (PATCH)', () => {
    const patch = abschnitt('PATCH')
    expect(patch).toContain('pruefeCaregiverVerfuegbarkeit(')
  })

  it('blockiert Abwesenheit mit 422 und lässt sie nur per force_override zu', () => {
    // Gleiche Semantik wie POST /api/tours: Abwesenheit blockiert hart,
    // force_override übersteuert und wird als Warnung protokolliert.
    const post = abschnitt('POST')
    const block = post.slice(post.indexOf('verfuegbarkeit.abwesend'))
    expect(block).toContain('!body.force_override')
    expect(block).toContain('status: 422')
  })

  it('warnt beim Zeitfenster, blockiert dort aber nicht', () => {
    // angel_availability ist ein gepflegter Wunsch, keine harte Sperre —
    // ein Einsatz außerhalb des Fensters darf angelegt werden.
    const post = abschnitt('POST')
    const idx = post.indexOf('verfuegbarkeit.ausserhalbZeitfenster')
    expect(idx).toBeGreaterThan(-1)
    const nachher = post.slice(idx, idx + 300)
    expect(nachher).toContain('warnungen.push')
    expect(nachher).not.toContain('status: 422')
  })

  it('sagt es, wenn ohne Einsatzdatum nicht geprüft werden konnte', () => {
    // Eine Serie (weekday + recurrence_rule) hat kein einzelnes Datum.
    // Stillschweigend nicht zu prüfen sähe aus wie „geprüft und in Ordnung".
    const post = abschnitt('POST')
    expect(post).toMatch(/Ohne Einsatzdatum wurde keine Abwesenheits- und Verfügbarkeitsprüfung/)
  })

  it('zieht im PATCH die nicht geänderten Werte aus dem Bestand', () => {
    // Sonst würde ein reiner Datumswechsel gegen den ALTEN Tag geprüft.
    const patch = abschnitt('PATCH')
    expect(patch).toContain("updates.assignment_date ?? bestand?.assignment_date")
    expect(patch).toContain("updates.caregiver_id ?? bestand?.caregiver_id")
  })

  it('gibt die Warnungen aus dem PATCH auch zurück', () => {
    const patch = abschnitt('PATCH')
    expect(patch).toContain('patchWarnungen')
    expect(patch).toMatch(/warnungen: patchWarnungen\.length > 0/)
  })
})
