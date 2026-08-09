// PflegeCoach Export-Builder — node:test
// Ausführen: npx tsx --test lib/coach/export.test.ts  (oder npm run test:unit)

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildExport, buildVerlaufsbericht, EXPORT_FORMAT, EXPORT_VERSION } from './export'
import type { CoachUser } from './types'

const coachUser: CoachUser = {
  id: 'cu1', user_id: 'auth-user-geheim', rolle: 'pflegebeduerftig', anzeigename: 'Frau Test',
  pflegegrad: 2, geburtsjahr: 1948, a11y_schriftgrad: 'gross', a11y_kontrast: false,
  onboarding_abgeschlossen: true, created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-01T00:00:00Z',
}

const leer = {
  exportiertAm: '2026-08-09T12:00:00Z', coachUser,
  consents: [], assessments: [], goals: [], activities: [], activityLog: [], measurements: [], reports: [],
}

test('buildExport: Format, Version und Nutzerblock', () => {
  const ex = buildExport(leer)
  assert.equal(ex.format, EXPORT_FORMAT)
  assert.equal(ex.version, EXPORT_VERSION)
  assert.equal(ex.exportiert_am, '2026-08-09T12:00:00Z')
  assert.equal(ex.nutzer.rolle, 'pflegebeduerftig')
  assert.equal(ex.nutzer.pflegegrad, 2)
})

test('buildExport: interne IDs (auth user_id, Zeilen-IDs) werden nicht exportiert', () => {
  const json = JSON.stringify(buildExport(leer))
  assert.equal(json.includes('auth-user-geheim'), false)
  assert.equal(json.includes('"user_id"'), false)
})

test('buildExport: deterministisch (reine Funktion)', () => {
  assert.deepEqual(buildExport(leer), buildExport(leer))
})

test('buildVerlaufsbericht: filtert nach Zeitraum und zählt Erledigungen', () => {
  const bericht = buildVerlaufsbericht({
    von: '2026-08-01', bis: '2026-08-31',
    assessments: [
      { erhoben_am: '2026-07-15', assessment_typ: 'erstassessment' },
      { erhoben_am: '2026-08-10', assessment_typ: 'verlaufsassessment' },
    ] as never,
    goals: [{ titel: 'Z', bereich: 'mobilitaet', status: 'aktiv', startwert: 1, zielwert: 3, aktueller_wert: 2 }] as never,
    activityLog: [
      { datum: '2026-08-02', status: 'erledigt' },
      { datum: '2026-08-03', status: 'teilweise' },
      { datum: '2026-08-04', status: 'ausgelassen' },
      { datum: '2026-07-30', status: 'erledigt' }, // außerhalb
    ] as never,
    measurements: [
      { instrument: 'belastung_kurz', messzeitpunkt: 'laufend', summenwert: 5, erhoben_am: '2026-08-05T10:00:00Z' },
      { instrument: 'belastung_kurz', messzeitpunkt: 'laufend', summenwert: 9, erhoben_am: '2026-09-05T10:00:00Z' }, // außerhalb
    ] as never,
  })
  assert.equal(bericht.assessments.length, 1)
  assert.deepEqual(bericht.erledigungen, { gesamt: 3, erledigt: 1, teilweise: 1, ausgelassen: 1 })
  assert.equal(bericht.messungen.length, 1)
  assert.equal(bericht.ziele.length, 1)
})
