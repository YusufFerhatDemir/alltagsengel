// PflegeCoach Empfehlungs-Engine — node:test
// Ausführen: npx tsx --test lib/coach/empfehlungen.test.ts  (oder npm run test:unit)

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { berechneEmpfehlungen, geplanteVorkommen14Tage, type EmpfehlungInput } from './empfehlungen'
import type { CoachActivity, CoachActivityLog, CoachAssessment, CoachGoal, CoachMeasurement } from './types'

// 2026-08-09 ist ein Sonntag (ISO-Tag 7) — fester Anker für deterministische Tests.
const HEUTE = '2026-08-09'

function leererInput(): EmpfehlungInput {
  return { heute: HEUTE, goals: [], activities: [], activityLog: [], assessments: [], belastungMessungen: [], sturzEreignisse: [] }
}

function goal(teil: Partial<CoachGoal>): CoachGoal {
  return {
    id: 'g1', coach_user_id: 'cu1', titel: 'Testziel', beschreibung: null, bereich: 'mobilitaet',
    messgroesse: null, startwert: null, zielwert: null, aktueller_wert: null,
    start_am: '2026-07-01', ziel_bis: null, status: 'aktiv', anpassungs_notiz: null,
    created_at: '', updated_at: '', ...teil,
  }
}

function activity(teil: Partial<CoachActivity>): CoachActivity {
  return {
    id: 'a1', coach_user_id: 'cu1', titel: 'Gehen', beschreibung: null, kategorie: 'mobilitaet',
    wochentage: [1, 2, 3, 4, 5, 6, 7], uhrzeit: null, dauer_minuten: null, goal_id: null,
    aktiv: true, created_at: '', updated_at: '', ...teil,
  }
}

function assessment(teil: Partial<CoachAssessment>): CoachAssessment {
  return {
    id: 'as1', coach_user_id: 'cu1', assessment_typ: 'erstassessment',
    mobilitaet: 1, selbstversorgung: 1, alltagsgestaltung: 1, soziale_teilhabe: 1, kognition: 1,
    hilfsmittel: null, wohnsituation: null, notizen: null,
    erhoben_am: '2026-08-01', created_at: '', ...teil,
  }
}

function messung(teil: Partial<CoachMeasurement>): CoachMeasurement {
  return {
    id: 'm1', coach_user_id: 'cu1', instrument: 'belastung_kurz', messzeitpunkt: 'laufend',
    antworten: {}, summenwert: 0, erhoben_am: '2026-08-08T10:00:00Z', created_at: '', ...teil,
  }
}

test('geplanteVorkommen14Tage: tägliche Aktivität = 14, wöchentliche = 2', () => {
  assert.equal(geplanteVorkommen14Tage(activity({}), HEUTE), 14)
  assert.equal(geplanteVorkommen14Tage(activity({ wochentage: [3] }), HEUTE), 2)
  assert.equal(geplanteVorkommen14Tage(activity({ wochentage: [] }), HEUTE), 0)
})

test('leerer Input → keine Empfehlungen', () => {
  assert.deepEqual(berechneEmpfehlungen(leererInput()), [])
})

test('überfälliges aktives Ziel → ziel_ueberfaellig; erreichte Ziele nicht', () => {
  const input = leererInput()
  input.goals = [
    goal({ id: 'g1', ziel_bis: '2026-08-01', status: 'aktiv' }),
    goal({ id: 'g2', ziel_bis: '2026-08-01', status: 'erreicht' }),
    goal({ id: 'g3', ziel_bis: '2026-09-01', status: 'aktiv' }),
  ]
  const emp = berechneEmpfehlungen(input)
  assert.deepEqual(emp.map(e => e.typ), ['ziel_ueberfaellig'])
  assert.equal(emp[0].bezugId, 'g1')
})

test('niedrige Erledigungsquote → aktivitaet_anpassen; gute Quote nicht', () => {
  const input = leererInput()
  input.activities = [activity({ id: 'a1' })] // täglich → 14 geplant
  // 3 von 14 erledigt (< 50 %)
  input.activityLog = [1, 2, 3].map(i => ({
    id: `l${i}`, activity_id: 'a1', coach_user_id: 'cu1',
    datum: `2026-08-0${i}`, status: 'erledigt', notiz: null, created_at: '',
  } satisfies CoachActivityLog))
  assert.deepEqual(berechneEmpfehlungen(input).map(e => e.typ), ['aktivitaet_anpassen'])

  // 10 von 14 → keine Empfehlung
  input.activityLog = Array.from({ length: 10 }, (_, i) => ({
    id: `l${i}`, activity_id: 'a1', coach_user_id: 'cu1',
    datum: `2026-07-${27 + (i % 3)}`, status: 'erledigt', notiz: null, created_at: '',
  } satisfies CoachActivityLog))
  assert.deepEqual(berechneEmpfehlungen(input), [])
})

test('zu wenig geplante Vorkommen (< 4) → keine Adhärenz-Aussage', () => {
  const input = leererInput()
  input.activities = [activity({ id: 'a1', wochentage: [3] })] // 2 Vorkommen in 14 Tagen
  assert.deepEqual(berechneEmpfehlungen(input), [])
})

test('Verschlechterung um >= 2 in einem Bereich → ziel_bereich_pruefen (Prio 1)', () => {
  const input = leererInput()
  input.assessments = [
    assessment({ id: 'as1', erhoben_am: '2026-07-20' }),
    assessment({ id: 'as2', erhoben_am: '2026-08-05', assessment_typ: 'verlaufsassessment', mobilitaet: 3 }),
  ]
  const emp = berechneEmpfehlungen(input)
  assert.deepEqual(emp.map(e => e.typ), ['ziel_bereich_pruefen'])
  assert.equal(emp[0].prioritaet, 1)
  assert.match(emp[0].titel, /Mobilität/)
})

test('letztes Assessment älter als 8 Wochen → verlaufsassessment_faellig', () => {
  const input = leererInput()
  input.assessments = [assessment({ erhoben_am: '2026-06-01' })]
  assert.deepEqual(berechneEmpfehlungen(input).map(e => e.typ), ['verlaufsassessment_faellig'])
})

test('hohe Belastung → entlastung_hinweis', () => {
  const input = leererInput()
  input.belastungMessungen = [messung({ summenwert: 15 })]
  assert.deepEqual(berechneEmpfehlungen(input).map(e => e.typ), ['entlastung_hinweis'])
})

test('Belastungs-Anstieg um >= 4 → entlastung_hinweis, stabil niedrig → nichts', () => {
  const input = leererInput()
  input.belastungMessungen = [
    messung({ id: 'm1', summenwert: 4, erhoben_am: '2026-07-01T10:00:00Z' }),
    messung({ id: 'm2', summenwert: 9, erhoben_am: '2026-08-08T10:00:00Z' }),
  ]
  assert.deepEqual(berechneEmpfehlungen(input).map(e => e.typ), ['entlastung_hinweis'])

  input.belastungMessungen = [
    messung({ id: 'm1', summenwert: 4, erhoben_am: '2026-07-01T10:00:00Z' }),
    messung({ id: 'm2', summenwert: 6, erhoben_am: '2026-08-08T10:00:00Z' }),
  ]
  assert.deepEqual(berechneEmpfehlungen(input), [])
})

test('Sturz innerhalb 4 Wochen → sturz_besprechen; älterer Sturz nicht', () => {
  const input = leererInput()
  input.sturzEreignisse = [messung({ instrument: 'sturzereignis', summenwert: null, erhoben_am: '2026-08-01T09:00:00Z' })]
  assert.deepEqual(berechneEmpfehlungen(input).map(e => e.typ), ['sturz_besprechen'])

  input.sturzEreignisse = [messung({ instrument: 'sturzereignis', summenwert: null, erhoben_am: '2026-06-01T09:00:00Z' })]
  assert.deepEqual(berechneEmpfehlungen(input), [])
})

test('Sortierung nach Priorität (1 zuerst)', () => {
  const input = leererInput()
  input.goals = [goal({ ziel_bis: '2026-08-01' })] // Prio 2
  input.belastungMessungen = [messung({ summenwert: 20 })] // Prio 1
  const emp = berechneEmpfehlungen(input)
  assert.equal(emp[0].typ, 'entlastung_hinweis')
  assert.equal(emp[1].typ, 'ziel_ueberfaellig')
})
