// PflegeCoach Assessment-Logik — node:test (Konvention wie lib/password-validation.test.ts)
// Ausführen: npx tsx --test lib/coach/assessment.test.ts  (oder npm run test:unit)

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  assessmentBeantwortet, assessmentSumme, vergleicheAssessments, verschlechterteBereiche,
} from './assessment'

const voll = { mobilitaet: 1, selbstversorgung: 2, alltagsgestaltung: 0, soziale_teilhabe: 3, kognition: 4 }

test('assessmentSumme addiert alle Bereiche', () => {
  assert.equal(assessmentSumme(voll), 10)
})

test('assessmentSumme ignoriert unbeantwortete Bereiche (null)', () => {
  assert.equal(assessmentSumme({ ...voll, kognition: null }), 6)
})

test('assessmentBeantwortet zählt nur Zahlen', () => {
  assert.equal(assessmentBeantwortet(voll), 5)
  assert.equal(assessmentBeantwortet({ ...voll, mobilitaet: null, kognition: null }), 3)
})

test('vergleicheAssessments liefert Deltas je Bereich', () => {
  const deltas = vergleicheAssessments(voll, { ...voll, mobilitaet: 3, kognition: 2 })
  const mob = deltas.find(d => d.bereich === 'mobilitaet')!
  const kog = deltas.find(d => d.bereich === 'kognition')!
  assert.equal(mob.delta, 2)   // 1 → 3: mehr Unterstützungsbedarf
  assert.equal(kog.delta, -2)  // 4 → 2: selbständiger
})

test('vergleicheAssessments: Delta nur wenn beide Werte vorhanden', () => {
  const deltas = vergleicheAssessments({ ...voll, mobilitaet: null }, voll)
  assert.equal(deltas.find(d => d.bereich === 'mobilitaet')!.delta, null)
})

test('verschlechterteBereiche filtert nach Schwelle', () => {
  const deltas = vergleicheAssessments(voll, { ...voll, mobilitaet: 2, selbstversorgung: 4 })
  const ab2 = verschlechterteBereiche(deltas, 2)
  assert.deepEqual(ab2.map(d => d.bereich), ['selbstversorgung'])
  const ab1 = verschlechterteBereiche(deltas, 1)
  assert.deepEqual(ab1.map(d => d.bereich).sort(), ['mobilitaet', 'selbstversorgung'])
})
