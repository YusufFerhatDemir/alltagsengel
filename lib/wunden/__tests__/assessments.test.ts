// ═══════════════════════════════════════════════════════════════
// Tests: Wundassessment — Validierung, PUSH-Berechnung serverseitig,
//        Verlaufsableitung; plus Verbandwechsel-Termine
// Ausführen: npm run test:unit
// ═══════════════════════════════════════════════════════════════

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createAssessment, verlaufAusAssessments } from '../assessments'
import { naechsterVwTermin } from '../behandlungen'
import type { WoundAssessment } from '../types'

function schreibClient() {
  const inserts: Array<Record<string, unknown>> = []
  const supabase = {
    from: () => ({
      insert(payload: Record<string, unknown>) {
        inserts.push(payload)
        return { select: () => ({ single: async () => ({ data: { id: 'a-1', ...payload }, error: null }) }) }
      },
    }),
  }
  return { supabase: supabase as never, inserts }
}

const basis = { organizationId: 'org-1', woundId: 'w-1', wundStatus: 'aktiv' as const, erhobenVon: 'user-1' } as const

test('createAssessment berechnet PUSH serverseitig aus den Rohdaten', async () => {
  const { supabase, inserts } = schreibClient()
  await createAssessment(supabase, {
    ...basis,
    laengeCm: 4, breiteCm: 2, exsudatMenge: 'maessig',
    granulationPct: 60, fibrinPct: 30, nekrosePct: 10, epithelPct: 0,
  })
  assert.equal(inserts[0].push_flaeche_punkte, 7)
  assert.equal(inserts[0].push_exsudat_punkte, 2)
  assert.equal(inserts[0].push_gewebe_punkte, 4)
  assert.equal(inserts[0].push_gesamt, 13)
})

test('createAssessment blockt fachlich unmögliche Werte', async () => {
  const { supabase } = schreibClient()
  await assert.rejects(() => createAssessment(supabase, { ...basis, schmerzNrs: 11 }), /NRS/)
  await assert.rejects(() => createAssessment(supabase, { ...basis, laengeCm: -1 }), /Länge/)
  await assert.rejects(() => createAssessment(supabase, { ...basis, granulationPct: 120 }), /Granulationsanteil/)
  await assert.rejects(
    () => createAssessment(supabase, { ...basis, granulationPct: 60, fibrinPct: 50 }),
    /100 %/,
  )
  await assert.rejects(
    () => createAssessment(supabase, { ...basis, exsudatMenge: 'ueberschwemmung' as never }),
    /Ungültiger Wert/,
  )
})

test('createAssessment blockt neue Einträge bei abgeheilter Wunde', async () => {
  const { supabase } = schreibClient()
  await assert.rejects(
    () => createAssessment(supabase, { ...basis, wundStatus: 'abgeheilt' }),
    /abgeheilt/,
  )
})

test('createAssessment blockt Erhebungszeitpunkt in der Zukunft', async () => {
  const { supabase } = schreibClient()
  const inZukunft = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  await assert.rejects(
    () => createAssessment(supabase, { ...basis, erhobenAm: inZukunft }),
    /Zukunft/,
  )
})

test('createAssessment akzeptiert einen Erhebungszeitpunkt innerhalb der Uhrenabweichungs-Toleranz', async () => {
  const { supabase, inserts } = schreibClient()
  const geradeEben = new Date(Date.now() + 60 * 1000).toISOString()
  await createAssessment(supabase, { ...basis, erhobenAm: geradeEben })
  assert.equal(inserts[0].erhoben_am, geradeEben)
})

test('createAssessment ohne Angaben speichert null-PUSH statt falscher 0', async () => {
  const { supabase, inserts } = schreibClient()
  await createAssessment(supabase, { ...basis })
  assert.equal(inserts[0].push_gesamt, null)
  assert.equal(inserts[0].push_gewebe_punkte, null)
})

function assessment(teil: Partial<WoundAssessment>): WoundAssessment {
  return {
    id: 'a', organization_id: 'org-1', wound_id: 'w-1',
    erhoben_am: '2026-08-01T10:00:00Z', erhoben_von: 'u',
    laenge_cm: null, breite_cm: null, tiefe_cm: null,
    wundgrund_granulation_pct: null, wundgrund_fibrin_pct: null,
    wundgrund_nekrose_pct: null, wundgrund_epithel_pct: null,
    wundrand: null, umgebungshaut: null, exsudat_menge: null, exsudat_art: null,
    geruch: null, schmerz_nrs: null, infektionszeichen: false,
    push_flaeche_punkte: null, push_exsudat_punkte: null, push_gewebe_punkte: null,
    push_gesamt: null, bemerkung: null,
    created_at: '', updated_at: '',
    ...teil,
  }
}

test('verlaufAusAssessments sortiert chronologisch und berechnet die Fläche', () => {
  const verlauf = verlaufAusAssessments([
    assessment({ erhoben_am: '2026-08-08T10:00:00Z', laenge_cm: 2, breite_cm: 1.5, push_gesamt: 9 }),
    assessment({ erhoben_am: '2026-08-01T10:00:00Z', laenge_cm: 3, breite_cm: 2, push_gesamt: 12 }),
  ])
  assert.equal(verlauf[0].erhoben_am, '2026-08-01T10:00:00Z')
  assert.equal(verlauf[0].flaeche_cm2, 6)
  assert.equal(verlauf[1].flaeche_cm2, 3)
  assert.equal(verlauf[1].push_gesamt, 9)
})

test('verlaufAusAssessments: ohne Maße keine Fläche', () => {
  const verlauf = verlaufAusAssessments([assessment({ laenge_cm: 2, breite_cm: null })])
  assert.equal(verlauf[0].flaeche_cm2, null)
})

test('naechsterVwTermin nimmt die Planung des jüngsten Eintrags', () => {
  assert.equal(naechsterVwTermin([]), null)
  assert.equal(naechsterVwTermin([
    { durchgefuehrt_am: '2026-08-05T09:00:00Z', naechster_vw_am: '2026-08-07' },
    { durchgefuehrt_am: '2026-08-08T09:00:00Z', naechster_vw_am: '2026-08-11' },
    { durchgefuehrt_am: '2026-08-09T09:00:00Z', naechster_vw_am: null },
  ]), '2026-08-11')
})
