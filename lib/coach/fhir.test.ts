// PflegeCoach — FHIR-Abbildung — node:test
// Ausführen: npx tsx --test lib/coach/fhir.test.ts  (oder npm run test:unit)

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildFhirBundle, FHIR_BASIS, QUESTIONNAIRE_BELASTUNG, QUESTIONNAIRE_SELBSTEINSCHAETZUNG,
  questionnaireSelbsteinschaetzung, wochentageAlsFhir, zielAlsGoal,
} from './fhir'
import type { CoachActivity, CoachAssessment, CoachGoal, CoachMeasurement } from './types'

const assessment = (werte: Partial<CoachAssessment> = {}): CoachAssessment => ({
  id: 'a-1', coach_user_id: 'u-1', assessment_typ: 'erstassessment',
  mobilitaet: 2, selbstversorgung: 1, alltagsgestaltung: null,
  soziale_teilhabe: 0, kognition: null, hilfsmittel: null, wohnsituation: null,
  notizen: null, erhoben_am: '2026-08-01T09:00:00Z', created_at: '2026-08-01T09:00:00Z',
  ...werte,
})

const ziel = (werte: Partial<CoachGoal> = {}): CoachGoal => ({
  id: 'g-1', coach_user_id: 'u-1', titel: 'Täglich 10 Minuten gehen',
  beschreibung: null, bereich: 'mobilitaet', messgroesse: null,
  startwert: null, zielwert: null, aktueller_wert: null,
  start_am: '2026-08-01', ziel_bis: null, status: 'aktiv',
  anpassungs_notiz: null, created_at: '2026-08-01T09:00:00Z', updated_at: '2026-08-01T09:00:00Z',
  ...werte,
})

const aktivitaet = (werte: Partial<CoachActivity> = {}): CoachActivity => ({
  id: 'k-1', coach_user_id: 'u-1', titel: 'Spaziergang', beschreibung: null,
  kategorie: 'mobilitaet', wochentage: [1, 3, 5], uhrzeit: '10:00', dauer_minuten: 20,
  goal_id: 'g-1', aktiv: true, created_at: '2026-08-01T09:00:00Z', updated_at: '2026-08-01T09:00:00Z',
  ...werte,
})

const messung = (werte: Partial<CoachMeasurement> = {}): CoachMeasurement => ({
  id: 'm-1', coach_user_id: 'u-1', instrument: 'belastung_kurz', messzeitpunkt: 't0',
  antworten: { erschoepfung: 2, schlaf: 3 }, summenwert: 5,
  erhoben_am: '2026-08-02T09:00:00Z', created_at: '2026-08-02T09:00:00Z',
  ...werte,
})

const leer = { erstelltAm: '2026-08-14T12:00:00Z', assessments: [], measurements: [], goals: [], activities: [] }

test('leerer Bestand ergibt ein gültiges, leeres Bundle', () => {
  const bundle = buildFhirBundle(leer)
  assert.equal(bundle.resourceType, 'Bundle')
  assert.equal(bundle.type, 'collection')
  assert.equal(bundle.entry.length, 0)
})

test('Assessment wird zur QuestionnaireResponse, unbeantwortete Bereiche fehlen', () => {
  const bundle = buildFhirBundle({ ...leer, assessments: [assessment()] })
  const antwort = bundle.entry.find(e => e.resource.resourceType === 'QuestionnaireResponse')!
  const items = antwort.resource.item as Array<{ linkId: string }>
  assert.equal(items.length, 3) // mobilitaet, selbstversorgung, soziale_teilhabe
  assert.equal(items.some(i => i.linkId === 'kognition'), false)
  assert.equal(antwort.resource.questionnaire, QUESTIONNAIRE_SELBSTEINSCHAETZUNG)
  assert.equal(antwort.resource.status, 'completed')
})

test('der Fragebogen liegt dem Bundle bei — sonst sind die Antworten nicht deutbar', () => {
  const bundle = buildFhirBundle({ ...leer, assessments: [assessment()] })
  const fragebogen = bundle.entry.filter(e => e.resource.resourceType === 'Questionnaire')
  assert.equal(fragebogen.length, 1)
  assert.equal(fragebogen[0].resource.url, QUESTIONNAIRE_SELBSTEINSCHAETZUNG)
})

test('Belastungs-Fragebogen kommt nur mit, wenn eine solche Messung vorliegt', () => {
  const ohne = buildFhirBundle({ ...leer, assessments: [assessment()] })
  assert.equal(ohne.entry.some(e => e.resource.url === QUESTIONNAIRE_BELASTUNG), false)
  const mit = buildFhirBundle({ ...leer, measurements: [messung()] })
  assert.equal(mit.entry.some(e => e.resource.url === QUESTIONNAIRE_BELASTUNG), true)
})

test('lizenzpflichtige Instrumente übertragen nur den Summenwert, keine Fragetexte', () => {
  // QI-02: FES-I ist lizenzpflichtig. Stünden die Items im Bundle, wäre das
  // eine Weiterverbreitung des geschützten Instruments.
  const bundle = buildFhirBundle({ ...leer, measurements: [messung({ instrument: 'fes_i_k', summenwert: 17, antworten: { i1: 2 } })] })
  const antwort = bundle.entry.find(e => e.resource.resourceType === 'QuestionnaireResponse')!
  const items = antwort.resource.item as Array<{ linkId: string; answer: Array<{ valueInteger: number }> }>
  assert.equal(items.length, 1)
  assert.equal(items[0].linkId, 'instrument/fes_i_k')
  assert.equal(items[0].answer[0].valueInteger, 17)
  assert.equal(antwort.resource.questionnaire, undefined)
})

test('erreichtes Ziel bekommt zusätzlich den Erreichungsstatus', () => {
  const offen = zielAlsGoal(ziel(), 'ziel-1')
  assert.equal(offen.lifecycleStatus, 'active')
  assert.equal(offen.achievementStatus, undefined)

  const fertig = zielAlsGoal(ziel({ status: 'erreicht' }), 'ziel-1')
  assert.equal(fertig.lifecycleStatus, 'completed')
  assert.ok(fertig.achievementStatus)
})

test('Ziel ohne Messgröße bekommt kein target', () => {
  assert.equal(zielAlsGoal(ziel(), 'ziel-1').target, undefined)
  const mitMass = zielAlsGoal(ziel({ messgroesse: 'Minuten pro Tag', zielwert: 10, ziel_bis: '2026-09-01' }), 'ziel-1')
  const target = mitMass.target as Array<{ dueDate: string; detailQuantity: { value: number } }>
  assert.equal(target[0].detailQuantity.value, 10)
  assert.equal(target[0].dueDate, '2026-09-01')
})

test('Wochentage werden auf FHIR-Codes abgebildet, unbekannte fallen weg', () => {
  assert.deepEqual(wochentageAlsFhir([1, 3, 7]), ['mon', 'wed', 'sun'])
  assert.deepEqual(wochentageAlsFhir([0, 8, 99]), [])
  assert.deepEqual(wochentageAlsFhir(null), [])
})

test('CarePlan verweist auf die Ziel-Ressource der Aktivität', () => {
  const bundle = buildFhirBundle({ ...leer, goals: [ziel()], activities: [aktivitaet()] })
  const plan = bundle.entry.find(e => e.resource.resourceType === 'CarePlan')!
  assert.deepEqual(plan.resource.goal, [{ reference: 'Goal/ziel-1' }])
  const aktivitaeten = plan.resource.activity as Array<{ detail: { scheduledTiming: { repeat: Record<string, unknown> } } }>
  assert.deepEqual(aktivitaeten[0].detail.scheduledTiming.repeat.dayOfWeek, ['mon', 'wed', 'fri'])
  assert.equal(aktivitaeten[0].detail.scheduledTiming.repeat.duration, 20)
})

test('Aktivität ohne bekanntes Ziel erzeugt keinen ins Leere zeigenden Verweis', () => {
  const bundle = buildFhirBundle({ ...leer, activities: [aktivitaet({ goal_id: 'unbekannt' })] })
  const plan = bundle.entry.find(e => e.resource.resourceType === 'CarePlan')!
  assert.deepEqual(plan.resource.goal, [])
})

test('keine internen Datenbank-IDs und keine Patient-Ressource im Bundle', () => {
  const bundle = buildFhirBundle({
    ...leer, assessments: [assessment()], goals: [ziel()],
    activities: [aktivitaet()], measurements: [messung()],
  })
  const text = JSON.stringify(bundle)
  for (const interneId of ['a-1', 'g-1', 'k-1', 'm-1', 'u-1']) {
    assert.equal(text.includes(`"${interneId}"`), false, `interne ID ${interneId} ist im Bundle gelandet`)
  }
  assert.equal(text.includes('"Patient"') && text.includes('"resourceType":"Patient"'), false)
  assert.equal(text.includes('"subject"'), false)
})

test('keine Profil-Behauptung und keine fremden Terminologien', () => {
  // Ein meta.profile oder ein LOINC-Code wäre eine Konformitätsaussage,
  // die niemand geprüft hat (siehe Kopf von lib/coach/fhir.ts).
  const text = JSON.stringify(buildFhirBundle({
    ...leer, assessments: [assessment()], goals: [ziel({ status: 'erreicht' })],
    activities: [aktivitaet()], measurements: [messung()],
  }))
  assert.equal(text.includes('"profile"'), false)
  assert.equal(text.includes('loinc.org'), false)
  assert.equal(text.includes('snomed'), false)
  assert.equal(text.includes('mio.kbv.de'), false)
})

test('der Fragebogen weist ausdrücklich aus, dass er nicht validiert ist', () => {
  const purpose = String(questionnaireSelbsteinschaetzung().purpose)
  assert.ok(purpose.includes('Kein validiertes'))
  assert.ok(questionnaireSelbsteinschaetzung().url === `${FHIR_BASIS}/Questionnaire/pflegecoach-selbsteinschaetzung`)
})
