// PflegeCoach Export-Builder — node:test
// Ausführen: npx tsx --test lib/coach/export.test.ts  (oder npm run test:unit)

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildExport, buildVerlaufsbericht, EXPORT_FORMAT, EXPORT_VERSION } from './export'
import type { CoachUser } from './types'

// ── Mini-JSON-Schema-Validator (nur das im Export-Schema genutzte Subset:
//    type/required/properties/items/enum/const/minimum/maximum) — bewusst
//    ohne ajv-Dependency. Liefert Pfad-genaue Fehlerliste.
function validiere(schema: Record<string, unknown>, wert: unknown, pfad = '$', fehler: string[] = []): string[] {
  if ('const' in schema && wert !== schema.const) fehler.push(`${pfad}: const ${JSON.stringify(schema.const)} verletzt (ist ${JSON.stringify(wert)})`)
  if (Array.isArray(schema.enum) && !schema.enum.includes(wert)) fehler.push(`${pfad}: nicht im enum (${JSON.stringify(wert)})`)
  const typen = schema.type === undefined ? [] : ([] as string[]).concat(schema.type as string | string[])
  if (typen.length) {
    const ist =
      wert === null ? 'null' :
      Array.isArray(wert) ? 'array' :
      Number.isInteger(wert) ? 'integer' :
      typeof wert
    const passt = typen.some(t => t === ist || (t === 'number' && ist === 'integer'))
    if (!passt) fehler.push(`${pfad}: Typ ${ist} statt ${typen.join('|')}`)
  }
  if (typeof wert === 'number') {
    if (typeof schema.minimum === 'number' && wert < schema.minimum) fehler.push(`${pfad}: < minimum`)
    if (typeof schema.maximum === 'number' && wert > schema.maximum) fehler.push(`${pfad}: > maximum`)
  }
  if (wert && typeof wert === 'object' && !Array.isArray(wert)) {
    const obj = wert as Record<string, unknown>
    for (const req of (schema.required as string[] | undefined) ?? []) {
      if (!(req in obj)) fehler.push(`${pfad}.${req}: Pflichtfeld fehlt`)
    }
    const props = (schema.properties as Record<string, Record<string, unknown>> | undefined) ?? {}
    for (const [k, sub] of Object.entries(props)) {
      if (k in obj) validiere(sub, obj[k], `${pfad}.${k}`, fehler)
    }
  }
  if (Array.isArray(wert) && schema.items && typeof schema.items === 'object') {
    wert.forEach((el, i) => validiere(schema.items as Record<string, unknown>, el, `${pfad}[${i}]`, fehler))
  }
  return fehler
}

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

test('buildExport: konform zum veröffentlichten Schema (export.schema.json)', () => {
  const schema = JSON.parse(readFileSync(join(__dirname, 'export.schema.json'), 'utf8'))

  // leerer Export
  assert.deepEqual(validiere(schema, buildExport(leer)), [])

  // Export mit Daten in jeder Sektion
  const voll = buildExport({
    ...leer,
    consents: [{ id: 'c1', coach_user_id: 'cu1', consent_typ: 'gesundheitsdaten_art9', text_version: '2026-08-v1', erteilt: true, erteilt_am: '2026-08-01T00:00:00Z', widerrufen_am: null }],
    assessments: [{ id: 'a1', coach_user_id: 'cu1', assessment_typ: 'erstassessment', mobilitaet: 2, selbstversorgung: null, alltagsgestaltung: 0, soziale_teilhabe: 4, kognition: 1, hilfsmittel: null, wohnsituation: null, notizen: 'ok', erhoben_am: '2026-08-02', created_at: '' }],
    goals: [{ id: 'g1', coach_user_id: 'cu1', titel: 'Gehen', beschreibung: null, bereich: 'mobilitaet', messgroesse: 'x/Woche', startwert: 1, zielwert: 3, aktueller_wert: 2, start_am: '2026-08-01', ziel_bis: null, status: 'aktiv', anpassungs_notiz: null, created_at: '', updated_at: '' }],
    activities: [{ id: 'ak1', coach_user_id: 'cu1', titel: 'Trinken', beschreibung: null, kategorie: 'erinnerung', wochentage: [1, 7], uhrzeit: '10:00:00', dauer_minuten: 5, goal_id: null, aktiv: true, created_at: '', updated_at: '' }],
    activityLog: [{ id: 'l1', activity_id: 'ak1', coach_user_id: 'cu1', datum: '2026-08-03', status: 'erledigt', notiz: null, created_at: '' }],
    measurements: [{ id: 'm1', coach_user_id: 'cu1', instrument: 'belastung_kurz', messzeitpunkt: 't0', antworten: { erschoepfung: 1 }, summenwert: 7, erhoben_am: '2026-08-04T10:00:00Z', created_at: '' }],
    reports: [{ id: 'r1', coach_user_id: 'cu1', report_typ: 'verlaufsbericht', zeitraum_von: '2026-05-01', zeitraum_bis: '2026-08-01', inhalt: {}, erstellt_am: '2026-08-05T10:00:00Z' }],
  })
  assert.deepEqual(validiere(schema, voll), [])
})

test('Schema-Validator schlägt bei Verstößen wirklich an (Selbsttest)', () => {
  const schema = JSON.parse(readFileSync(join(__dirname, 'export.schema.json'), 'utf8'))
  const kaputt = buildExport(leer) as Record<string, unknown>
  kaputt.format = 'falsches.format'
  delete kaputt.nutzer
  const fehler = validiere(schema, kaputt)
  assert.ok(fehler.some(f => f.includes('const')), 'const-Verstoß erkannt')
  assert.ok(fehler.some(f => f.includes('nutzer')), 'fehlendes Pflichtfeld erkannt')
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
