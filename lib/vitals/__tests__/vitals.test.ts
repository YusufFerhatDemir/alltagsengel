// ═══════════════════════════════════════════════════════════════
// Tests: Vitalwerte — Alarm-Bewertung, Plausibilität, Grenzwerte
// Ausführen: npm run test:unit
// ═══════════════════════════════════════════════════════════════

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  berechneAktuelleAlarme,
  bewerteMesswert,
  createVital,
  validiereGrenzwerte,
  validierePlausibilitaet,
} from '../vitals'
import { VITAL_TYPEN, VITAL_TYP_WERTE, assertVitalTyp, type VitalSign } from '../types'
import { VITALS_ALARM_ENV, grenzwertAlarmeAktiv } from '../config'

// ── Typ-Konfiguration ────────────────────────────────────────────

test('alle 10 Vitaltypen sind konfiguriert und konsistent', () => {
  assert.equal(VITAL_TYP_WERTE.length, 10)
  for (const typ of VITAL_TYP_WERTE) {
    const cfg = VITAL_TYPEN[typ]
    assert.ok(cfg.label.length > 0)
    assert.ok(cfg.einheit.length > 0)
    assert.ok(cfg.plausibelMin < cfg.plausibelMax)
    // Standard-Grenzwerte müssen selbst konsistent sein
    if (cfg.standard) validiereGrenzwerte(typ, cfg.standard)
  }
})

test('assertVitalTyp wirft bei unbekanntem Typ', () => {
  assert.throws(() => assertVitalTyp('cholesterin'), /Unbekannter Vitaltyp/)
  assert.doesNotThrow(() => assertVitalTyp('blutdruck'))
})

// ── Plausibilität ────────────────────────────────────────────────

test('validierePlausibilitaet akzeptiert normale Werte', () => {
  assert.doesNotThrow(() => validierePlausibilitaet('puls', 72))
  assert.doesNotThrow(() => validierePlausibilitaet('blutdruck', 120, 80))
  assert.doesNotThrow(() => validierePlausibilitaet('schmerz', 0))
})

test('validierePlausibilitaet wirft bei Tippfehler-Werten', () => {
  assert.throws(() => validierePlausibilitaet('temperatur', 367), /plausiblen Bereichs/)
  assert.throws(() => validierePlausibilitaet('puls', 0), /plausiblen Bereichs/)
  assert.throws(() => validierePlausibilitaet('schmerz', 11), /plausiblen Bereichs/)
})

test('Blutdruck: diastolisch ist Pflicht und muss unter systolisch liegen', () => {
  assert.throws(() => validierePlausibilitaet('blutdruck', 120), /Pflichtfeld/)
  assert.throws(() => validierePlausibilitaet('blutdruck', 120, 130), /unter systolisch/)
})

test('Zweitwert ist nur beim Blutdruck erlaubt', () => {
  assert.throws(() => validierePlausibilitaet('puls', 72, 60), /nur beim Blutdruck/)
})

// ── Grenzwert-Validierung ────────────────────────────────────────

test('validiereGrenzwerte wirft bei min ≥ max', () => {
  assert.throws(() => validiereGrenzwerte('puls', {
    min_warn: 100, max_warn: 50, min_critical: null, max_critical: null,
  }), /unter der oberen/)
})

test('validiereGrenzwerte wirft, wenn kritisch innerhalb der Warnzone liegt', () => {
  assert.throws(() => validiereGrenzwerte('puls', {
    min_warn: 50, max_warn: 100, min_critical: 60, max_critical: null,
  }), /darf nicht über der Warngrenze/)
  assert.throws(() => validiereGrenzwerte('puls', {
    min_warn: 50, max_warn: 100, min_critical: null, max_critical: 90,
  }), /darf nicht unter der Warngrenze/)
})

test('validiereGrenzwerte: Sekundär-Grenzen nur beim Blutdruck', () => {
  assert.throws(() => validiereGrenzwerte('puls', {
    min_warn: null, max_warn: null, min_critical: null, max_critical: null,
    min_warn_secondary: 60,
  }), /nur beim Blutdruck/)
  assert.doesNotThrow(() => validiereGrenzwerte('blutdruck', {
    min_warn: 100, max_warn: 140, min_critical: 90, max_critical: 180,
    min_warn_secondary: 60, max_warn_secondary: 90,
    min_critical_secondary: 50, max_critical_secondary: 110,
  }))
})

// ── Alarm-Bewertung ──────────────────────────────────────────────

test('bewerteMesswert: Wert im Normbereich → ok', () => {
  const b = bewerteMesswert('puls', 72, null, null)
  assert.equal(b.stufe, 'ok')
  assert.equal(b.quelle, 'standard')
  assert.deepEqual(b.meldungen, [])
})

test('bewerteMesswert: Standard-Grenzwerte greifen ohne Klienten-Satz', () => {
  assert.equal(bewerteMesswert('puls', 110, null, null).stufe, 'warnung')
  assert.equal(bewerteMesswert('puls', 130, null, null).stufe, 'kritisch')
  assert.equal(bewerteMesswert('puls', 45, null, null).stufe, 'warnung')
  assert.equal(bewerteMesswert('puls', 35, null, null).stufe, 'kritisch')
})

test('bewerteMesswert: klientenspezifische Grenzen übersteuern den Standard', () => {
  // Klient mit tolerierter Tachykardie: erst ab 130 warnen
  const grenzen = { min_warn: 45, max_warn: 130, min_critical: 35, max_critical: 150 }
  const b = bewerteMesswert('puls', 110, null, grenzen)
  assert.equal(b.stufe, 'ok')
  assert.equal(b.quelle, 'klient')
  assert.equal(bewerteMesswert('puls', 140, null, grenzen).stufe, 'warnung')
})

test('bewerteMesswert: deaktivierter Klienten-Satz fällt auf Standard zurück', () => {
  const grenzen = { min_warn: 45, max_warn: 130, min_critical: 35, max_critical: 150, enabled: false }
  const b = bewerteMesswert('puls', 110, null, grenzen)
  assert.equal(b.stufe, 'warnung')
  assert.equal(b.quelle, 'standard')
})

test('bewerteMesswert: Blutdruck bewertet beide Werte, schlechtester gewinnt', () => {
  // Systolisch ok (120), diastolisch kritisch hoch (115 > 110)
  const b = bewerteMesswert('blutdruck', 120, 115, null)
  assert.equal(b.stufe, 'kritisch')
  assert.equal(b.meldungen.length, 1)
  assert.match(b.meldungen[0], /Diastolisch 115/)
})

test('bewerteMesswert: SpO2 hat nur Untergrenzen', () => {
  assert.equal(bewerteMesswert('spo2', 98, null, null).stufe, 'ok')
  assert.equal(bewerteMesswert('spo2', 90, null, null).stufe, 'warnung')
  assert.equal(bewerteMesswert('spo2', 85, null, null).stufe, 'kritisch')
})

test('bewerteMesswert: Schmerz hat nur Obergrenzen', () => {
  assert.equal(bewerteMesswert('schmerz', 0, null, null).stufe, 'ok')
  assert.equal(bewerteMesswert('schmerz', 5, null, null).stufe, 'warnung')
  assert.equal(bewerteMesswert('schmerz', 8, null, null).stufe, 'kritisch')
})

test('bewerteMesswert: Typen ohne Standard-Grenzen sind ohne Konfiguration immer ok', () => {
  const b = bewerteMesswert('gewicht', 45, null, null)
  assert.equal(b.stufe, 'ok')
  assert.equal(b.quelle, 'keine')
  assert.equal(bewerteMesswert('trinkmenge', 50, null, null).stufe, 'ok')
})

test('bewerteMesswert: Grenzfall — Wert exakt AUF der Grenze ist kein Alarm', () => {
  assert.equal(bewerteMesswert('puls', 100, null, null).stufe, 'ok')
  assert.equal(bewerteMesswert('puls', 50, null, null).stufe, 'ok')
})

// ── Alarm-Übersicht ──────────────────────────────────────────────

function messung(teil: Partial<VitalSign>): VitalSign {
  return {
    id: 'm-1', organization_id: 'org-1', client_id: 'k-1',
    type: 'puls', value: 72, value_secondary: null, unit: 'bpm',
    measured_at: '2026-08-09T10:00:00Z', measured_by: 'u-1',
    measured_by_name: 'Test', measured_by_role: 'admin', notes: null,
    created_at: '2026-08-09T10:00:00Z', updated_at: '2026-08-09T10:00:00Z',
    ...teil,
  }
}

test('berechneAktuelleAlarme: nur die jüngste Messung je (Klient, Typ) zählt', () => {
  // measured_at-absteigend, wie listVitals liefert: erst 130 (jüngste), dann 72
  const alarme = berechneAktuelleAlarme([
    messung({ id: 'm-2', value: 130, measured_at: '2026-08-09T12:00:00Z' }),
    messung({ id: 'm-1', value: 72, measured_at: '2026-08-09T10:00:00Z' }),
  ], [])
  assert.equal(alarme.length, 1)
  assert.equal(alarme[0].messung.id, 'm-2')
  assert.equal(alarme[0].bewertung.stufe, 'kritisch')
})

test('berechneAktuelleAlarme: normalisierte jüngste Messung löscht den Alarm', () => {
  const alarme = berechneAktuelleAlarme([
    messung({ id: 'm-2', value: 72, measured_at: '2026-08-09T12:00:00Z' }),
    messung({ id: 'm-1', value: 130, measured_at: '2026-08-09T10:00:00Z' }),
  ], [])
  assert.equal(alarme.length, 0)
})

test('berechneAktuelleAlarme: kritische Alarme stehen vor Warnungen', () => {
  const alarme = berechneAktuelleAlarme([
    messung({ id: 'm-1', client_id: 'k-1', value: 110 }),               // warnung
    messung({ id: 'm-2', client_id: 'k-2', value: 130 }),               // kritisch
  ], [])
  assert.equal(alarme.length, 2)
  assert.equal(alarme[0].bewertung.stufe, 'kritisch')
  assert.equal(alarme[1].bewertung.stufe, 'warnung')
})

// ── MDR-Kill-Switch: grenzwertAlarmeAktiv ────────────────────────

test('grenzwertAlarmeAktiv ist fail-closed: unset → false', () => {
  const vorher = process.env[VITALS_ALARM_ENV]
  try {
    delete process.env[VITALS_ALARM_ENV]
    assert.equal(grenzwertAlarmeAktiv(), false)
  } finally {
    if (vorher === undefined) delete process.env[VITALS_ALARM_ENV]
    else process.env[VITALS_ALARM_ENV] = vorher
  }
})

test('grenzwertAlarmeAktiv nur bei exakt "true" aktiv', () => {
  const vorher = process.env[VITALS_ALARM_ENV]
  try {
    for (const wert of ['false', '1', 'yes', 'TRUE', 'on', '']) {
      process.env[VITALS_ALARM_ENV] = wert
      assert.equal(grenzwertAlarmeAktiv(), false, `"${wert}" darf nicht aktivieren`)
    }
    process.env[VITALS_ALARM_ENV] = 'true'
    assert.equal(grenzwertAlarmeAktiv(), true)
  } finally {
    if (vorher === undefined) delete process.env[VITALS_ALARM_ENV]
    else process.env[VITALS_ALARM_ENV] = vorher
  }
})

// ── createVital (Insert-Payload) ─────────────────────────────────

function insertClient() {
  const inserts: Array<Record<string, unknown>> = []
  const supabase = {
    from: () => ({
      insert(payload: Record<string, unknown>) {
        inserts.push(payload)
        return { select: () => ({ single: async () => ({ data: { id: 'v-1', ...payload }, error: null }) }) }
      },
    }),
  }
  return { supabase: supabase as never, inserts }
}

test('createVital setzt Einheit aus der Typ-Konfiguration und trimmt Notizen', async () => {
  const { supabase, inserts } = insertClient()
  await createVital(supabase, {
    organizationId: 'org-1', clientId: 'k-1', typ: 'temperatur', wert: 37.2,
    gemessenVon: 'u-1', gemessenVonName: 'Test', gemessenVonRolle: 'admin',
    notizen: '  nach dem Aufstehen  ',
  })
  assert.equal(inserts.length, 1)
  assert.equal(inserts[0].unit, '°C')
  assert.equal(inserts[0].notes, 'nach dem Aufstehen')
  assert.equal(inserts[0].value_secondary, null)
  assert.equal(inserts[0].organization_id, 'org-1')
})

test('createVital ohne organizationId überlässt die Organisation dem Spalten-Default (RLS-Pfad)', async () => {
  const { supabase, inserts } = insertClient()
  await createVital(supabase, {
    clientId: 'k-1', typ: 'puls', wert: 72,
    gemessenVon: 'u-1', gemessenVonName: 'Engel', gemessenVonRolle: 'engel',
  })
  assert.ok(!('organization_id' in inserts[0]))
})

test('createVital lehnt unplausible Werte ab, bevor etwas geschrieben wird', async () => {
  const { supabase, inserts } = insertClient()
  await assert.rejects(
    createVital(supabase, {
      clientId: 'k-1', typ: 'blutdruck', wert: 120, wertSekundaer: null,
      gemessenVon: 'u-1', gemessenVonName: 'Test', gemessenVonRolle: 'admin',
    }),
    /Pflichtfeld/,
  )
  assert.equal(inserts.length, 0)
})
