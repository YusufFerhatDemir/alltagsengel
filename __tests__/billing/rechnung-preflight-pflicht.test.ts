/**
 * Der Preflight darf im Produktivcode nicht übersprungen werden
 * ═══════════════════════════════════════════════════════════════════════
 *
 * `versendeRechnungPerEmail()` verlangt eine ausdrückliche Entscheidung über
 * die Strenge des Preflights — es gibt keinen Standardwert, den jemand
 * unbemerkt erbt. Der Fluchtweg heißt `preflight: 'uebersprungen'` und ist
 * für Tests da, die die Versandlogik selbst prüfen.
 *
 * Genau dieser Fluchtweg ist die Stelle, an der die Absicherung in einem
 * halben Jahr wieder verschwindet: jemand bekommt einen Preflight-Blocker
 * beim Debuggen, schreibt 'uebersprungen' hin, und es fällt nie wieder auf.
 * Dieser Test scannt deshalb app/ und lib/ und schlägt fehl, sobald der Wert
 * dort auftaucht.
 *
 * Dasselbe Muster wie bei den ungeprüften Resend-Aufrufern und bei
 * logAuditEventOrWarn: eine Regel, die nur im Kommentar steht, ist keine.
 */

import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const WURZEL = path.resolve(__dirname, '..', '..')
const QUELLEN = ['app', 'lib']

function sammleDateien(start: string): string[] {
  const treffer: string[] = []
  const stapel = [start]
  while (stapel.length > 0) {
    const aktuell = stapel.pop()!
    let eintraege: fs.Dirent[]
    try {
      eintraege = fs.readdirSync(aktuell, { withFileTypes: true })
    } catch {
      continue
    }
    for (const e of eintraege) {
      const voll = path.join(aktuell, e.name)
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name === '.next' || e.name === '__tests__') continue
        stapel.push(voll)
      } else if (e.name.endsWith('.ts') || e.name.endsWith('.tsx')) {
        if (e.name.endsWith('.test.ts') || e.name.endsWith('.test.tsx')) continue
        treffer.push(voll)
      }
    }
  }
  return treffer
}

/** Kommentare entfernen — sonst schlägt der Test an den eigenen Erklärtexten an. */
function ohneKommentare(quelle: string): string {
  return quelle
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

const DATEIEN = QUELLEN.flatMap(q => sammleDateien(path.join(WURZEL, q)))

describe('Preflight-Pflicht im Versandweg', () => {
  it('findet den Laufzeit-Code überhaupt (Gegenprobe)', () => {
    // Ohne diese Probe wäre der Test still immer grün, sobald der Scan
    // ins Leere greift.
    expect(DATEIEN.length).toBeGreaterThan(500)
    const mitAufruf = DATEIEN.filter(d =>
      ohneKommentare(fs.readFileSync(d, 'utf-8')).includes('versendeRechnungPerEmail('))
    expect(mitAufruf.length).toBeGreaterThanOrEqual(3)
  })

  it("kein Aufruf in app/ oder lib/ setzt preflight auf 'uebersprungen'", () => {
    const verstoesse: string[] = []
    for (const datei of DATEIEN) {
      const quelle = ohneKommentare(fs.readFileSync(datei, 'utf-8'))
      // Die Definition des Typs selbst darf den Wert nennen.
      if (datei.endsWith(path.join('versand', 'rechnung-versand.ts'))) continue
      if (/preflight\s*:\s*['"]uebersprungen['"]/.test(quelle)) {
        verstoesse.push(path.relative(WURZEL, datei))
      }
    }
    expect(
      verstoesse,
      'Diese Dateien umgehen den Versand-Preflight:\n' + verstoesse.join('\n'),
    ).toEqual([])
  })

  it('jeder Aufruf im Produktivcode entscheidet die Strenge ausdrücklich', () => {
    const ohneEntscheidung: string[] = []
    for (const datei of DATEIEN) {
      const quelle = ohneKommentare(fs.readFileSync(datei, 'utf-8'))
      if (!quelle.includes('versendeRechnungPerEmail(')) continue
      // Nur die Aufrufstellen zählen, nicht Import oder Definition.
      const aufrufe = [...quelle.matchAll(/versendeRechnungPerEmail\(/g)]
      const istDefinition = /export async function versendeRechnungPerEmail/.test(quelle)
      if (istDefinition && aufrufe.length <= 1) continue
      if (!/preflight\s*:\s*['"](automatisch|manuell)['"]/.test(quelle)) {
        ohneEntscheidung.push(path.relative(WURZEL, datei))
      }
    }
    expect(
      ohneEntscheidung,
      'Diese Aufrufer legen die Preflight-Strenge nicht fest:\n' + ohneEntscheidung.join('\n'),
    ).toEqual([])
  })

  // Der automatische Weg ist der gefährliche: dort steht niemand davor.
  it('die automatischen Wege sind als automatisch gekennzeichnet', () => {
    const automatisch = [
      'lib/billing/core/invoice-engine.ts',
      'lib/notifications/vorgaenge/rechnung.ts',
    ]
    for (const rel of automatisch) {
      const quelle = fs.readFileSync(path.join(WURZEL, rel), 'utf-8')
      expect(quelle, `${rel} muss preflight: 'automatisch' setzen`)
        .toMatch(/preflight\s*:\s*'automatisch'/)
    }
  })

  it('der Weg mit Mensch davor ist als manuell gekennzeichnet', () => {
    const quelle = fs.readFileSync(
      path.join(WURZEL, 'app/api/billing/invoices/[id]/versenden/route.ts'), 'utf-8')
    expect(quelle).toMatch(/preflight\s*:\s*'manuell'/)
  })
})
