// PflegeCoach Nutzungsnachweise — node:test
// Ausführen: npx tsx --test lib/coach/nachweise.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  MIN_GRUPPENGROESSE, auswertungswoche, istNutzungsEreignis, werteNutzungAus,
  type NutzungsZeile,
} from './nachweise'

function zeile(p: string, woche: string, extra: Partial<NutzungsZeile> = {}): NutzungsZeile {
  return {
    pseudonym: p,
    ereignis: 'modul_geoeffnet',
    modul_key: 'mobilitaet',
    rolle: 'pflegebeduerftig',
    auswertungswoche: woche,
    anzahl: 1,
    ...extra,
  }
}

test('kleine Gruppen werden unterdrückt', () => {
  const zeilen = Array.from({ length: MIN_GRUPPENGROESSE - 1 }, (_, i) => zeile(`p${i}`, '2026-08-03'))
  const a = werteNutzungAus(zeilen)
  assert.equal(a.unterdrueckt, true)
  assert.equal(a.teilnehmende, MIN_GRUPPENGROESSE - 1)
  assert.equal(a.gesamtEreignisse, 0)
  assert.deepEqual(a.jeEreignis, [])
  assert.equal(a.anteilRegelmaessig, null)
})

test('leere Eingabe wird unterdrückt, ohne zu werfen', () => {
  const a = werteNutzungAus([])
  assert.equal(a.teilnehmende, 0)
  assert.equal(a.unterdrueckt, true)
})

test('ab Mindestgruppengröße werden Kennzahlen ausgewiesen', () => {
  const zeilen = Array.from({ length: MIN_GRUPPENGROESSE }, (_, i) => zeile(`p${i}`, '2026-08-03'))
  const a = werteNutzungAus(zeilen)
  assert.equal(a.unterdrueckt, false)
  assert.equal(a.teilnehmende, MIN_GRUPPENGROESSE)
  assert.equal(a.gesamtEreignisse, MIN_GRUPPENGROESSE)
  assert.equal(a.jeEreignis[0].ereignis, 'modul_geoeffnet')
})

test('anzahl wird aufsummiert, nicht nur gezählt', () => {
  const zeilen = Array.from({ length: MIN_GRUPPENGROESSE }, (_, i) =>
    zeile(`p${i}`, '2026-08-03', { anzahl: 3 })
  )
  assert.equal(werteNutzungAus(zeilen).gesamtEreignisse, MIN_GRUPPENGROESSE * 3)
})

test('Wochenauswertung zählt aktive Nutzer je Woche getrennt', () => {
  const zeilen = [
    ...Array.from({ length: MIN_GRUPPENGROESSE }, (_, i) => zeile(`p${i}`, '2026-08-03')),
    zeile('p0', '2026-08-10'),
    zeile('p1', '2026-08-10'),
  ]
  const a = werteNutzungAus(zeilen)
  assert.equal(a.jeWoche.length, 2)
  assert.equal(a.jeWoche[0].woche, '2026-08-03')
  assert.equal(a.jeWoche[0].aktiveNutzer, MIN_GRUPPENGROESSE)
  assert.equal(a.jeWoche[1].aktiveNutzer, 2)
})

test('Regelmäßigkeit zählt Nutzer mit mindestens vier Wochen', () => {
  const wochen = ['2026-07-06', '2026-07-13', '2026-07-20', '2026-07-27']
  const zeilen: NutzungsZeile[] = []
  // p0 und p1 nutzen vier Wochen, p2–p4 nur eine.
  for (const p of ['p0', 'p1']) for (const w of wochen) zeilen.push(zeile(p, w))
  for (const p of ['p2', 'p3', 'p4']) zeilen.push(zeile(p, wochen[0]))
  const a = werteNutzungAus(zeilen)
  assert.equal(a.teilnehmende, 5)
  assert.equal(a.anteilRegelmaessig, 0.4)
})

test('Auswertung enthält keine Pseudonyme', () => {
  const zeilen = Array.from({ length: MIN_GRUPPENGROESSE }, (_, i) => zeile(`geheim${i}`, '2026-08-03'))
  const json = JSON.stringify(werteNutzungAus(zeilen))
  assert.ok(!json.includes('geheim'))
})

test('auswertungswoche liefert den Montag der Woche', () => {
  assert.equal(auswertungswoche('2026-08-12'), '2026-08-10') // Mittwoch → Montag
  assert.equal(auswertungswoche('2026-08-10'), '2026-08-10') // Montag bleibt
  assert.equal(auswertungswoche('2026-08-16'), '2026-08-10') // Sonntag → Montag davor
})

test('istNutzungsEreignis weist Unbekanntes ab', () => {
  assert.equal(istNutzungsEreignis('modul_geoeffnet'), true)
  assert.equal(istNutzungsEreignis('diagnose_gestellt'), false)
  assert.equal(istNutzungsEreignis(null), false)
})
