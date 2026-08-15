// PflegeCoach — Veröffentlichung der Interoperabilitäts-Standards — node:test
// Ausführen: npx tsx --test lib/coach/interop.test.ts  (oder npm run test:unit)
//
// Diese Tests sichern die Anforderung aus Anlage 2 DiPAV, Themenfeld I
// Nr. 4 („die genutzten Standards und Profile sind vollständig
// veröffentlicht"). Der Kern ist die Gegenprobe: Was der Export TATSÄCHLICH
// erzeugt, muss in der veröffentlichten Liste stehen — und umgekehrt.
// Eine Veröffentlichung, die vom Code abweicht, wäre eine falsche Erklärung
// gegenüber dem BfArM, nicht bloß ein Dokumentationsfehler.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  DISKRIMINIERUNGSFREI_ZUSAGE, EIGENSCHEMA, FHIR_BASIS_URL, FHIR_RESSOURCEN,
  INTEROP_STANDARDS, NICHT_ZUTREFFEND,
} from './interop'
import { buildFhirBundle, FHIR_BASIS, FHIR_VERSION } from './fhir'
import type { CoachActivity, CoachAssessment, CoachGoal, CoachMeasurement } from './types'

const assessment: CoachAssessment = {
  id: 'a-1', coach_user_id: 'u-1', assessment_typ: 'erstassessment',
  mobilitaet: 2, selbstversorgung: 1, alltagsgestaltung: null,
  soziale_teilhabe: 0, kognition: null, hilfsmittel: null, wohnsituation: null,
  notizen: null, erhoben_am: '2026-08-01T09:00:00Z', created_at: '2026-08-01T09:00:00Z',
}

const ziel: CoachGoal = {
  id: 'g-1', coach_user_id: 'u-1', titel: 'Täglich 10 Minuten gehen',
  beschreibung: null, bereich: 'mobilitaet', messgroesse: null,
  startwert: null, zielwert: null, aktueller_wert: null,
  start_am: '2026-08-01', ziel_bis: null, status: 'aktiv',
  anpassungs_notiz: null, created_at: '2026-08-01T09:00:00Z', updated_at: '2026-08-01T09:00:00Z',
}

const aktivitaet: CoachActivity = {
  id: 'k-1', coach_user_id: 'u-1', titel: 'Spaziergang', beschreibung: null,
  kategorie: 'mobilitaet', wochentage: [1, 3, 5], uhrzeit: '10:00', dauer_minuten: 20,
  goal_id: 'g-1', aktiv: true, created_at: '2026-08-01T09:00:00Z', updated_at: '2026-08-01T09:00:00Z',
}

const messung: CoachMeasurement = {
  id: 'm-1', coach_user_id: 'u-1', instrument: 'belastung_kurz', messzeitpunkt: 't0',
  antworten: { erschoepfung: 2, schlaf: 3 }, summenwert: 5,
  erhoben_am: '2026-08-02T09:00:00Z', created_at: '2026-08-02T09:00:00Z',
}

/** Ein Bundle, das jeden Erzeugungspfad des Exports mindestens einmal trifft. */
function vollesBundle() {
  return buildFhirBundle({
    erstelltAm: '2026-08-15T10:00:00Z',
    assessments: [assessment],
    measurements: [messung],
    goals: [ziel],
    activities: [aktivitaet],
  })
}

test('die veröffentlichte Ressourcenliste deckt genau das ab, was der Export erzeugt', () => {
  const bundle = vollesBundle()
  const erzeugt = new Set<string>(['Bundle'])
  for (const e of bundle.entry) erzeugt.add(e.resource.resourceType)

  const veroeffentlicht = new Set(FHIR_RESSOURCEN.map(r => r.typ))

  // Richtung 1: nichts wird erzeugt, was nicht veröffentlicht ist.
  for (const typ of erzeugt) {
    assert.ok(
      veroeffentlicht.has(typ),
      `Ressourcentyp ${typ} wird exportiert, steht aber nicht in INTEROP/FHIR_RESSOURCEN`
    )
  }
  // Richtung 2: nichts wird veröffentlicht, was es nicht gibt — sonst wäre
  // die Veröffentlichung ein Versprechen ohne Deckung.
  for (const typ of veroeffentlicht) {
    assert.ok(
      erzeugt.has(typ),
      `Ressourcentyp ${typ} ist veröffentlicht, wird aber von keinem Exportpfad erzeugt`
    )
  }
})

test('die veröffentlichte FHIR-Fassung ist die tatsächlich verwendete', () => {
  const fhir = INTEROP_STANDARDS.find(s => s.name === 'HL7 FHIR')
  assert.ok(fhir, 'HL7 FHIR fehlt in der Veröffentlichung')
  assert.ok(
    fhir.fassung.includes(FHIR_VERSION),
    `veröffentlicht: ${fhir.fassung}, im Export verwendet: ${FHIR_VERSION}`
  )
  assert.equal(FHIR_BASIS_URL, FHIR_BASIS)
})

test('jeder veröffentlichte Standard ist nachprüfbar benannt', () => {
  assert.ok(INTEROP_STANDARDS.length > 0)
  for (const s of INTEROP_STANDARDS) {
    // Ohne Herausgeber und erreichbare Fundstelle kann ein Dritter den
    // Standard nicht implementieren — dann ist die Angabe wertlos.
    assert.ok(s.name.trim().length > 0, 'Standard ohne Namen')
    assert.ok(s.herausgeber.trim().length > 0, `${s.name}: kein Herausgeber`)
    assert.ok(s.url.startsWith('https://'), `${s.name}: keine https-Fundstelle`)
    assert.ok(s.verwendung.trim().length > 0, `${s.name}: keine Verwendungsangabe`)
    assert.ok(s.lizenz.trim().length > 0, `${s.name}: keine Lizenzangabe`)
  }
})

test('das veröffentlichte Eigenschema existiert und trägt die genannte Kennung', () => {
  // Anlage 2 I Nr. 4 verlangt „vollständig veröffentlicht" — ein Verweis auf
  // eine Datei, die es nicht gibt, erfüllt das nicht.
  const roh = readFileSync(EIGENSCHEMA.datei, 'utf-8')
  const schema = JSON.parse(roh) as Record<string, unknown>
  const alsText = JSON.stringify(schema)
  assert.ok(
    alsText.includes(EIGENSCHEMA.kennung),
    `Kennung ${EIGENSCHEMA.kennung} kommt in ${EIGENSCHEMA.datei} nicht vor`
  )
})

test('die Nicht-zutreffend-Begründungen sind die von Anlage 2 zugelassenen', () => {
  // Anlage 2 lässt für I Nr. 3 und I Nr. 5 jeweils GENAU EINE Begründung zu.
  // Weicht unser Text davon ab, ist die Erklärung im Antrag angreifbar.
  const nr3 = NICHT_ZUTREFFEND.find(n => n.punkt.includes('Nr. 3'))
  const nr5 = NICHT_ZUTREFFEND.find(n => n.punkt.includes('Nr. 5'))
  assert.ok(nr3 && nr5, 'beide Nicht-zutreffend-Punkte müssen benannt sein')
  assert.ok(nr3.begruendung.includes('Wearables'))
  assert.equal(nr5.begruendung, 'Der Hersteller hat keine eigenen Profilierungen vorgenommen.')
})

test('die Diskriminierungsfreiheits-Zusage nennt die vier Freiheiten', () => {
  for (const wort of ['Genehmigung', 'Registrierung', 'Entgelt', 'Rückfrage']) {
    assert.ok(
      DISKRIMINIERUNGSFREI_ZUSAGE.includes(wort),
      `Zusage nennt „${wort}" nicht`
    )
  }
})
