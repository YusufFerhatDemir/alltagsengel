/**
 * Tourenkette — ein zweiter Leistungsnachweis fuer denselben Stop
 * ═══════════════════════════════════════════════════════════════════════
 *
 * BEFUND (Block 60, 14.09.2026)
 *
 * Schliesst ein Stop mit `leistungsnachweis_anlegen` ab, entsteht ein
 * Nachweis, der danach zweimal verknuepft wird:
 *
 *   service_records.assignment_id  -> der Einsatz
 *   tour_stops.service_record_id   -> der Nachweis
 *
 * Beide Schreibvorgaenge verwarfen Fehler UND getroffene Zeilen.
 *
 * Die zweite ist die gefaehrliche: die Wiederholungssperre der Route ist
 * `!stop.service_record_id`. Steht in der Datenbank weiter `null`, legt
 * der naechste Aufruf einen ZWEITEN Nachweis fuer denselben Stop an —
 * eine doppelte Rechnungsposition.
 *
 * `stop.service_record_id = gespeichert.id` setzte ausserdem nur das
 * Objekt im Speicher: die Antwort sah richtig aus, waehrend die Zeile es
 * nicht war.
 *
 * Dazu eine kompensierende Ruecknahme in POST /api/tours: schlaegt der
 * Stops-Insert fehl, wird die Tour geloescht, „damit kein leerer Torso
 * bleibt" — ungeprueft. Schlug sie fehl, blieb genau dieser Torso stehen.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const STOPS = readFileSync('app/api/tours/[id]/stops/route.ts', 'utf8')
const TOUREN = readFileSync('app/api/tours/route.ts', 'utf8')

const VERKNUEPFUNG = (() => {
  const ab = STOPS.indexOf('if (gespeichert.id) {')
  expect(ab, 'Verknuepfungsblock nicht gefunden').toBeGreaterThan(-1)
  return STOPS.slice(ab, ab + 2600)
})()

describe('beide Verknuepfungen werden geprueft', () => {
  it('die Zuordnung zum Einsatz', () => {
    expect(VERKNUEPFUNG).toContain('error: verknuepfFehler')
    expect(VERKNUEPFUNG).toContain('data: verknuepft')
  })

  it('die Zuordnung am Stop', () => {
    expect(VERKNUEPFUNG).toContain('error: stopFehler')
    expect(VERKNUEPFUNG).toContain('data: amStop')
  })

  it('jeweils mit Zeilenzahl — PostgREST meldet null Zeilen nicht', () => {
    expect(VERKNUEPFUNG).toContain("verknuepft?.length ?? 0) === 0")
    expect(VERKNUEPFUNG).toContain("amStop?.length ?? 0) === 0")
  })

  it('kein blindes `await admin` mehr', () => {
    expect(VERKNUEPFUNG).not.toMatch(/\n\s*await admin\s*\n\s*\.from\('(service_records|tour_stops)'\)/)
  })
})

describe('der Doppelnachweis wird benannt', () => {
  it('die Meldung nennt genau diese Folge', () => {
    // Das ist der Grund, warum die Stop-Zuordnung schwerer wiegt als die
    // zum Einsatz.
    expect(VERKNUEPFUNG).toContain('ZWEITEN Nachweis anlegen')
  })

  it('und die Kennung, damit man von Hand nachtragen kann', () => {
    expect(VERKNUEPFUNG).toContain('${gespeichert.id}')
  })

  it('der Nachweis wird NICHT zurueckgenommen', () => {
    // Die erfasste Arbeit ginge sonst verloren.
    expect(VERKNUEPFUNG).not.toMatch(/from\('service_records'\)\s*\n\s*\.delete/)
  })

  it('der Speicher-Wert wird bei Fehlschlag nicht gesetzt', () => {
    // Sonst saehe die Antwort richtig aus, waehrend die Zeile es nicht ist.
    const ab = VERKNUEPFUNG.indexOf('if (stopFehler')
    const zweig = VERKNUEPFUNG.slice(ab, VERKNUEPFUNG.indexOf('} else if', ab))
    expect(zweig).not.toContain('stop.service_record_id = gespeichert.id')
  })

  it('die fehlende Einsatz-Zuordnung wird eigens gemeldet', () => {
    expect(VERKNUEPFUNG).toContain('haengt aber nicht am Einsatz')
    expect(VERKNUEPFUNG).toContain('Storno und Abrechnung finden ihn')
  })
})

describe('POST /api/tours — die Ruecknahme der Tour', () => {
  const BLOCK = (() => {
    const ab = TOUREN.indexOf('if (stopsError)')
    expect(ab).toBeGreaterThan(-1)
    return TOUREN.slice(ab, ab + 1400)
  })()

  it('wird geprueft', () => {
    expect(BLOCK).toContain('error: ruecknahmeFehler')
    expect(BLOCK).toContain("entfernt?.length ?? 0) === 0")
  })

  it('und meldet den Torso, wenn sie scheitert', () => {
    const text = BLOCK.replace(/'\s*\+\s*'/g, '').replace(/\s+/g, ' ')
    expect(text).toContain('OHNE Stops im Dienstplan')
    expect(text).toContain('von Hand entfernt')
  })

  it('nennt die Tour-Kennung', () => {
    expect(BLOCK).toContain('${tour.id}')
  })

  it('der urspruengliche Fehler bleibt in der Meldung', () => {
    // Sonst verschwindet die Ursache hinter der Folge.
    expect(BLOCK).toContain('uebersetzeDbFehler(stopsError)')
  })
})
