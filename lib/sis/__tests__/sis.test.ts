// ═══════════════════════════════════════════════════════════════
// Tests: SIS — Statusmaschine, Themenfeld-Regeln, Risikomatrix,
// Abschluss-Validierung, Sperr-Guards
// Ausführen: npm run test:unit
// ═══════════════════════════════════════════════════════════════

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  abschliessenAssessment,
  createAssessment,
  sperreAssessment,
  updateAssessment,
  validateSisUebergang,
  wiedereroeffnenAssessment,
} from '../assessments'
import { upsertThemenfeld } from '../themenfelder'
import { upsertRisiko } from '../risikomatrix'
import { relevanteThemenfelder, SIS_RISIKO_WERTE, type SisStatus } from '../types'

/**
 * Minimaler Supabase-Doppelgänger: liefert `kopf` als sis_assessments-Zeile,
 * `kinder` je Tabelle, und sammelt Inserts/Updates/Upserts.
 */
function sisClient(
  kopf: Record<string, unknown> | null,
  kinder: { themenfelder?: unknown[]; risikomatrix?: unknown[] } = {},
) {
  const updates: Array<{ tabelle: string; payload: Record<string, unknown> }> = []
  const inserts: Array<{ tabelle: string; payload: unknown }> = []
  const upserts: Array<{ tabelle: string; payload: Record<string, unknown> }> = []

  const supabase = {
    from(tabelle: string) {
      const daten =
        tabelle === 'sis_themenfelder' ? (kinder.themenfelder ?? [])
        : tabelle === 'sis_risikomatrix' ? (kinder.risikomatrix ?? [])
        : []
      return {
        select() {
          const kette: any = {
            eq: () => kette,
            order: () => kette,
            maybeSingle: async () => ({ data: kopf, error: null }),
            then: (resolve: (v: unknown) => void) => resolve({ data: daten, error: null }),
          }
          return kette
        },
        insert(payload: unknown) {
          inserts.push({ tabelle, payload })
          const zeilen = Array.isArray(payload)
            ? payload.map((p, i) => ({ id: `${tabelle}-${i}`, ...(p as object) }))
            : { id: `${tabelle}-neu`, ...(payload as object) }
          return {
            select: () => ({
              single: async () => ({ data: zeilen, error: null }),
              then: (resolve: (v: unknown) => void) => resolve({ data: zeilen, error: null }),
            }),
          }
        },
        update(payload: Record<string, unknown>) {
          updates.push({ tabelle, payload })
          const kette: any = {
            eq: () => kette,
            select: () => ({ single: async () => ({ data: { ...kopf, ...payload }, error: null }) }),
          }
          return kette
        },
        upsert(payload: Record<string, unknown>) {
          upserts.push({ tabelle, payload })
          return {
            select: () => ({ single: async () => ({ data: { id: 'upsert-1', ...payload }, error: null }) }),
          }
        },
      }
    },
  }

  return { supabase: supabase as never, updates, inserts, upserts }
}

const KOPF_ENTWURF = {
  id: 'sis-1', organization_id: 'org-1', client_id: 'client-1',
  assessment_datum: '2026-08-18', assessment_typ: 'erstgespraech',
  versorgungsform: 'ambulant', status: 'entwurf', gesperrt: false,
}

/** Vollständige Kindzeilen für einen abschlussfähigen Entwurf (ambulant). */
function vollstaendigeKinder() {
  return {
    themenfelder: [1, 2, 3, 4, 5, 6].map(nr => ({
      feld_nr: nr, einschaetzung_pflege: `Einschätzung Feld ${nr}`, sicht_klient: null,
    })),
    risikomatrix: SIS_RISIKO_WERTE.map(risiko => ({ risiko, risiko_vorhanden: 'nein', weitere_einschaetzung: false })),
  }
}

// ── Statusmaschine ───────────────────────────────────────────────

test('validateSisUebergang bildet die vorgesehene Statusmaschine ab', () => {
  const erlaubt: Array<[SisStatus, SisStatus]> = [
    ['entwurf', 'abgeschlossen'], ['entwurf', 'gesperrt'],
    ['abgeschlossen', 'gesperrt'], ['abgeschlossen', 'entwurf'],
  ]
  for (const [von, nach] of erlaubt) {
    assert.doesNotThrow(() => validateSisUebergang(von, nach), `${von} → ${nach}`)
  }

  const verboten: Array<[SisStatus, SisStatus]> = [
    ['gesperrt', 'entwurf'], ['gesperrt', 'abgeschlossen'], ['entwurf', 'entwurf'],
  ]
  for (const [von, nach] of verboten) {
    assert.throws(() => validateSisUebergang(von, nach), /ist nicht erlaubt/, `${von} → ${nach}`)
  }
})

// ── Themenfelder ─────────────────────────────────────────────────

test('relevanteThemenfelder: Feld 6 nur ambulant', () => {
  assert.deepEqual(relevanteThemenfelder('ambulant'), [1, 2, 3, 4, 5, 6])
  assert.deepEqual(relevanteThemenfelder('stationaer'), [1, 2, 3, 4, 5])
  assert.deepEqual(relevanteThemenfelder('tagespflege'), [1, 2, 3, 4, 5])
})

test('upsertThemenfeld weist feld_nr außerhalb 1-6 zurück', async () => {
  const { supabase } = sisClient(KOPF_ENTWURF)
  for (const feldNr of [0, 7, 2.5, NaN]) {
    await assert.rejects(
      () => upsertThemenfeld(supabase, { organizationId: 'org-1', assessmentId: 'sis-1', feldNr }),
      /feld_nr muss zwischen 1 und 6 liegen/,
      `feld_nr=${feldNr}`
    )
  }
})

test('upsertThemenfeld weist Feld 6 bei stationärer Versorgung zurück', async () => {
  const { supabase } = sisClient({ ...KOPF_ENTWURF, versorgungsform: 'stationaer' })
  await assert.rejects(
    () => upsertThemenfeld(supabase, { organizationId: 'org-1', assessmentId: 'sis-1', feldNr: 6 }),
    /nicht vorgesehen/
  )
})

test('upsertThemenfeld weist gesperrte und abgeschlossene SIS zurück', async () => {
  const gesperrt = sisClient({ ...KOPF_ENTWURF, gesperrt: true, status: 'gesperrt' })
  await assert.rejects(
    () => upsertThemenfeld(gesperrt.supabase, { organizationId: 'org-1', assessmentId: 'sis-1', feldNr: 1 }),
    /gesperrt/
  )
  const abgeschlossen = sisClient({ ...KOPF_ENTWURF, status: 'abgeschlossen' })
  await assert.rejects(
    () => upsertThemenfeld(abgeschlossen.supabase, { organizationId: 'org-1', assessmentId: 'sis-1', feldNr: 1 }),
    /nur im Entwurf/
  )
})

test('upsertThemenfeld schreibt per Upsert auf (assessment_id, feld_nr)', async () => {
  const { supabase, upserts } = sisClient(KOPF_ENTWURF)
  await upsertThemenfeld(supabase, {
    organizationId: 'org-1', assessmentId: 'sis-1', feldNr: 2,
    sichtKlient: 'Ich laufe unsicher.', einschaetzungPflege: 'Gangunsicherheit, Rollator empfohlen.', handlungsbedarf: true,
  })
  assert.equal(upserts.length, 1)
  assert.equal(upserts[0].tabelle, 'sis_themenfelder')
  assert.equal(upserts[0].payload.feld_nr, 2)
  assert.equal(upserts[0].payload.handlungsbedarf, true)
})

// ── Risikomatrix ─────────────────────────────────────────────────

test('upsertRisiko weist unbekannte Risiken und Werte zurück', async () => {
  const { supabase } = sisClient(KOPF_ENTWURF)
  await assert.rejects(
    () => upsertRisiko(supabase, { organizationId: 'org-1', assessmentId: 'sis-1', risiko: 'demenz' as never }),
    /Ungültiger Wert für risiko/
  )
  await assert.rejects(
    () => upsertRisiko(supabase, {
      organizationId: 'org-1', assessmentId: 'sis-1', risiko: 'sturz', risikoVorhanden: 'vielleicht' as never,
    }),
    /Ungültiger Wert für risiko_vorhanden/
  )
})

test('upsertRisiko schreibt per Upsert und respektiert die Sperre', async () => {
  const { supabase, upserts } = sisClient(KOPF_ENTWURF)
  await upsertRisiko(supabase, {
    organizationId: 'org-1', assessmentId: 'sis-1', risiko: 'dekubitus',
    risikoVorhanden: 'ja', weitereEinschaetzung: true,
  })
  assert.equal(upserts[0].tabelle, 'sis_risikomatrix')
  assert.equal(upserts[0].payload.risiko_vorhanden, 'ja')
  assert.equal(upserts[0].payload.weitere_einschaetzung, true)

  const gesperrt = sisClient({ ...KOPF_ENTWURF, gesperrt: true, status: 'gesperrt' })
  await assert.rejects(
    () => upsertRisiko(gesperrt.supabase, { organizationId: 'org-1', assessmentId: 'sis-1', risiko: 'sturz' }),
    /gesperrt/
  )
})

// ── Anlage ───────────────────────────────────────────────────────

test('createAssessment initialisiert Themenfelder und Risikomatrix', async () => {
  const { supabase, inserts } = sisClient(KOPF_ENTWURF)
  await createAssessment(supabase, {
    organizationId: 'org-1', clientId: 'client-1', erhobenVon: 'user-1', erstelltVon: 'user-1',
  })
  const tf = inserts.find(i => i.tabelle === 'sis_themenfelder')
  const rm = inserts.find(i => i.tabelle === 'sis_risikomatrix')
  assert.equal((tf?.payload as unknown[]).length, 6, 'ambulant → 6 Themenfelder')
  assert.equal((rm?.payload as unknown[]).length, 5, '5 Risiken')
})

test('createAssessment legt stationär nur 5 Themenfelder an', async () => {
  const { supabase, inserts } = sisClient(KOPF_ENTWURF)
  await createAssessment(supabase, {
    organizationId: 'org-1', clientId: 'client-1', erhobenVon: 'user-1', erstelltVon: 'user-1',
    versorgungsform: 'stationaer',
  })
  const tf = inserts.find(i => i.tabelle === 'sis_themenfelder')
  assert.equal((tf?.payload as unknown[]).length, 5)
})

test('createAssessment weist ungültigen Typ zurück', async () => {
  const { supabase } = sisClient(KOPF_ENTWURF)
  await assert.rejects(
    () => createAssessment(supabase, {
      organizationId: 'org-1', clientId: 'client-1', erhobenVon: 'user-1', erstelltVon: 'user-1',
      assessmentTyp: 'quartalsgespraech' as never,
    }),
    /Ungültiger Wert für assessment_typ/
  )
})

// ── Update ───────────────────────────────────────────────────────

test('updateAssessment nur im Entwurf, nie gesperrt', async () => {
  const abgeschlossen = sisClient({ ...KOPF_ENTWURF, status: 'abgeschlossen' })
  await assert.rejects(
    () => updateAssessment(abgeschlossen.supabase, 'sis-1', 'org-1', { bemerkung: 'x' }),
    /Nur eine SIS im Entwurf/
  )
  const gesperrt = sisClient({ ...KOPF_ENTWURF, status: 'gesperrt', gesperrt: true })
  await assert.rejects(
    () => updateAssessment(gesperrt.supabase, 'sis-1', 'org-1', { bemerkung: 'x' }),
    /gesperrt/i
  )
})

// ── Abschluss ────────────────────────────────────────────────────

test('abschliessenAssessment verlangt Einschätzung in allen relevanten Themenfeldern', async () => {
  const kinder = vollstaendigeKinder()
  kinder.themenfelder[2].einschaetzung_pflege = '   '
  const { supabase } = sisClient(KOPF_ENTWURF, kinder)
  await assert.rejects(
    () => abschliessenAssessment(supabase, 'sis-1', 'org-1', 'user-1'),
    /Themenfeld 3/
  )
})

test('abschliessenAssessment verlangt bewertete Risikomatrix', async () => {
  const kinder = vollstaendigeKinder()
  kinder.risikomatrix[1] = { risiko: 'sturz', risiko_vorhanden: 'unklar', weitere_einschaetzung: false }
  const { supabase } = sisClient(KOPF_ENTWURF, kinder)
  await assert.rejects(
    () => abschliessenAssessment(supabase, 'sis-1', 'org-1', 'user-1'),
    /Risikomatrix unbewertet für sturz/
  )
})

test('abschliessenAssessment setzt Status und Abschluss-Metadaten', async () => {
  const { supabase, updates } = sisClient(KOPF_ENTWURF, vollstaendigeKinder())
  await abschliessenAssessment(supabase, 'sis-1', 'org-1', 'user-1')
  assert.equal(updates.length, 1)
  assert.equal(updates[0].payload.status, 'abgeschlossen')
  assert.equal(updates[0].payload.abgeschlossen_von, 'user-1')
  assert.ok(updates[0].payload.abgeschlossen_am)
})

test('abschliessenAssessment: stationär braucht Feld 6 nicht', async () => {
  const kinder = vollstaendigeKinder()
  kinder.themenfelder = kinder.themenfelder.filter(t => t.feld_nr !== 6)
  const { supabase, updates } = sisClient({ ...KOPF_ENTWURF, versorgungsform: 'stationaer' }, kinder)
  await abschliessenAssessment(supabase, 'sis-1', 'org-1', 'user-1')
  assert.equal(updates[0].payload.status, 'abgeschlossen')
})

// ── Wiedereröffnen / Sperren ─────────────────────────────────────

test('wiedereroeffnenAssessment nur aus abgeschlossen, sperren nie rückwärts', async () => {
  const abgeschlossen = sisClient({ ...KOPF_ENTWURF, status: 'abgeschlossen' })
  const wieder = await wiedereroeffnenAssessment(abgeschlossen.supabase, 'sis-1', 'org-1')
  assert.equal(wieder.status, 'entwurf')
  assert.equal(abgeschlossen.updates[0].payload.abgeschlossen_am, null)

  const gesperrt = sisClient({ ...KOPF_ENTWURF, status: 'gesperrt', gesperrt: true })
  await assert.rejects(
    () => wiedereroeffnenAssessment(gesperrt.supabase, 'sis-1', 'org-1'),
    /ist nicht erlaubt/
  )
  await assert.rejects(
    () => sperreAssessment(gesperrt.supabase, 'sis-1', 'org-1'),
    /ist nicht erlaubt/
  )
})

test('sperreAssessment setzt Status und gesperrt-Flag', async () => {
  const { supabase, updates } = sisClient({ ...KOPF_ENTWURF, status: 'abgeschlossen' })
  await sperreAssessment(supabase, 'sis-1', 'org-1')
  assert.equal(updates[0].payload.status, 'gesperrt')
  assert.equal(updates[0].payload.gesperrt, true)
})
