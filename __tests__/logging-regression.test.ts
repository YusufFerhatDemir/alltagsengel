// ═══════════════════════════════════════════════════════════════════════
// Regression: kein rohes console.* im Produktivcode
// ═══════════════════════════════════════════════════════════════════════
//
// Ein `console.error(err)` verliert alles, was eine Meldung im Betrieb
// brauchbar macht: kein Zeitstempel, kein Modul, keine Schwere, keine
// organization_id — und in Production kein JSON, sondern eine Zeile, die
// keine Auswertung greifen kann. `lib/logger.ts` liefert genau das, und
// zwar in Production als JSON-Zeile und in Development lesbar.
//
// Stand dieses Tests: der Produktivcode ist sauber. Genau deshalb steht er
// hier — eine Regel, die erst nach dem naechsten Wildwuchs geschrieben
// wird, kostet den Wildwuchs. Der Test faellt beim ERSTEN neuen rohen
// console-Aufruf, nicht beim fuenfzigsten.
//
// Erlaubt bleibt genau eine Datei: lib/logger.ts. Dort MUSS console
// aufgerufen werden — das ist die Ausgabe selbst.
// ═══════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const WURZEL = path.join(__dirname, '..')
const VERZEICHNISSE = ['app', 'lib', 'components', 'hooks']

/**
 * Die einzige Datei, die console direkt benutzen darf: der Logger selbst.
 *
 * Diese Liste ist bewusst kurz zu halten. Jeder weitere Eintrag ist eine
 * Stelle, deren Meldungen im Betrieb nicht auswertbar sind.
 */
const ERLAUBT = [path.join('lib', 'logger.ts')]

function quelldateien(verzeichnis: string, treffer: string[] = []): string[] {
  if (!fs.existsSync(verzeichnis)) return treffer
  for (const eintrag of fs.readdirSync(verzeichnis, { withFileTypes: true })) {
    if (eintrag.name.startsWith('.') || eintrag.name === 'node_modules') continue
    if (eintrag.name === '__tests__') continue
    const voll = path.join(verzeichnis, eintrag.name)
    if (eintrag.isDirectory()) {
      quelldateien(voll, treffer)
    } else if (/\.tsx?$/.test(eintrag.name) && !/\.test\.tsx?$/.test(eintrag.name)) {
      treffer.push(voll)
    }
  }
  return treffer
}

/**
 * Entfernt Kommentare, bevor gesucht wird.
 *
 * Ohne das schlaegt der Test auf Saetzen an, die einen frueheren Fehler
 * BESCHREIBEN („ein stiller console.error sah aus wie …") — und dann
 * loescht jemand die Erklaerung, um den Test gruen zu bekommen. Das waere
 * der teuerste denkbare Ausgang.
 */
function ohneKommentare(inhalt: string): string {
  return inhalt
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

const RUF = /\bconsole\s*\.\s*(log|info|warn|error|debug|trace|dir|table)\s*\(/

describe('Strukturiertes Logging', () => {
  const dateien = VERZEICHNISSE.flatMap(v => quelldateien(path.join(WURZEL, v)))

  it('findet ueberhaupt Quelldateien — sonst prueft der Test nichts', () => {
    // Eine leere Dateiliste macht jede Zusicherung unten trivial wahr.
    expect(dateien.length).toBeGreaterThan(500)
  })

  it('kein Produktivmodul ausser lib/logger.ts ruft console direkt auf', () => {
    const verstoesse: string[] = []

    for (const datei of dateien) {
      const relativ = path.relative(WURZEL, datei)
      if (ERLAUBT.includes(relativ)) continue

      const zeilen = ohneKommentare(fs.readFileSync(datei, 'utf-8')).split('\n')
      zeilen.forEach((zeile, i) => {
        if (RUF.test(zeile)) verstoesse.push(`${relativ}:${i + 1} — ${zeile.trim()}`)
      })
    }

    expect(verstoesse,
      `Rohe console-Aufrufe gefunden. Stattdessen den strukturierten Logger `
      + `nutzen: import { logger } from '@/lib/logger'; const log = `
      + `logger.child('<modul>').\n${verstoesse.join('\n')}`,
    ).toEqual([])
  })

  it('lib/logger.ts ruft console tatsaechlich auf — die Ausnahme ist keine tote Regel', () => {
    // Gegenprobe: waere die Ausnahme unbegruendet, koennte die Regel oben
    // gruen sein, ohne dass sie irgendetwas absichert.
    const inhalt = fs.readFileSync(path.join(WURZEL, 'lib', 'logger.ts'), 'utf-8')
    expect(RUF.test(ohneKommentare(inhalt))).toBe(true)
  })

  it('der Suchausdruck erkennt die ueblichen Schreibweisen', () => {
    // Gegenprobe fuer den Ausdruck selbst — ein Regex, der nichts findet,
    // macht jeden Scan-Test wertlos.
    for (const beispiel of [
      'console.log("x")',
      'console.error(err)',
      '  console.warn( a, b )',
      'console . debug(x)',
      'if (a) console.info(b)',
    ]) {
      expect(RUF.test(beispiel), beispiel).toBe(true)
    }
    for (const gegenbeispiel of [
      'log.error("x")',
      'const console2 = 1',
      'myconsole.log(1)',
      'consoleLog(1)',
    ]) {
      expect(RUF.test(gegenbeispiel), gegenbeispiel).toBe(false)
    }
  })
})
