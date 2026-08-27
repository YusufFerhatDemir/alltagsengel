import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  createEintrag, updateEintrag, deleteEintrag, listEintraege, listTagesansicht,
  createSchicht, listSchichten, updateSchicht,
} from '../dienstplan'
import { UserFacingError } from '../../api/user-facing-error'

function insertClient() {
  const inserts: Array<Record<string, unknown>> = []
  const supabase = {
    from: () => ({
      insert(payload: Record<string, unknown>) {
        inserts.push(payload)
        return {
          select: () => ({
            single: async () => ({ data: { id: 'e-1', ...payload }, error: null }),
          }),
        }
      },
    }),
  }
  return { supabase: supabase as never, inserts }
}

function failClient(errorMessage: string) {
  return {
    from: () => ({
      insert: () => ({
        select: () => ({
          single: async () => ({ data: null, error: { message: errorMessage } }),
        }),
      }),
    }),
  } as never
}

test('createEintrag: setzt Defaults korrekt', async () => {
  const { supabase, inserts } = insertClient()
  await createEintrag(supabase, {
    organizationId: 'org-1',
    datum: '2026-08-11',
    startZeit: '08:00',
    endZeit: '16:00',
    erstelltVon: 'user-1',
  })
  assert.equal(inserts.length, 1)
  assert.equal(inserts[0].status, 'geplant')
  assert.equal(inserts[0].typ, 'regulaer')
  assert.equal(inserts[0].pause_minuten, 0)
})

test('createEintrag: weist ungültigen Status ab', async () => {
  const { supabase } = insertClient()
  await assert.rejects(
    () => createEintrag(supabase, {
      organizationId: 'org-1', datum: '2026-08-11',
      startZeit: '08:00', endZeit: '16:00',
      status: 'ungueltig' as any, erstelltVon: 'user-1',
    }),
    /Ungültiger Wert/,
  )
})

test('createEintrag: übersetzt Doppelbelegungs-Fehler benutzerfreundlich', async () => {
  const supabase = failClient('Doppelbelegung: Mitarbeiter hat bereits einen Dienst in diesem Zeitraum.')
  await assert.rejects(
    () => createEintrag(supabase, {
      organizationId: 'org-1', datum: '2026-08-11',
      startZeit: '08:00', endZeit: '16:00', erstelltVon: 'user-1',
    }),
    /Doppelbelegung/,
  )
})

test('createEintrag: übersetzt Abwesenheits-Konflikt benutzerfreundlich', async () => {
  const supabase = failClient('Konflikt: Mitarbeiter ist an diesem Tag als abwesend gemeldet.')
  await assert.rejects(
    () => createEintrag(supabase, {
      organizationId: 'org-1', datum: '2026-08-11',
      startZeit: '08:00', endZeit: '16:00', erstelltVon: 'user-1',
    }),
    /Konflikt/,
  )
})

// ── Generischer Query-Mock ───────────────────────────────────────────
// `createEintrag` oben braucht nur `.insert().select().single()` — die
// übrigen Funktionen der Lib (update/list/delete) verketten `.eq()`,
// `.order()`, `.gte()`/`.lte()` in wechselnder Reihenfolge und werden
// teils direkt awaited (kein `.single()`). Bisher testete nur
// `createEintrag`; die Trigger-Fehlerübersetzung, Filterlogik und
// Pflichtfeldprüfungen der übrigen Funktionen liefen ungetestet.
//
// `then()` macht den Mock thenable, damit `await query` (ohne `.single()`)
// funktioniert — dieselbe Technik wie beim echten Supabase-Query-Builder.
function mockQuery(opts: {
  singleResult?: { data: unknown; error: unknown }
  listResult?: { data: unknown; error: unknown }
  /**
   * Bestand, den `updateEintrag`/`deleteEintrag` vor dem Schreiben lesen
   * (Endzustand-Sperre). Default ist ein geplanter Dienst — also ein Eintrag,
   * an dem Änderungen erlaubt sind.
   */
  bestand?: { data: unknown; error: unknown }
}) {
  const calls: Array<{ method: string; args: unknown[] }> = []
  const builder: Record<string, unknown> = {}
  for (const m of ['insert', 'update', 'delete', 'select', 'eq', 'gte', 'lte', 'order']) {
    builder[m] = (...args: unknown[]) => { calls.push({ method: m, args }); return builder }
  }
  builder.maybeSingle = async () => opts.bestand ?? { data: { status: 'geplant' }, error: null }
  builder.single = async () => opts.singleResult ?? { data: null, error: { message: 'kein singleResult konfiguriert' } }
  builder.then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
    Promise.resolve(opts.listResult ?? { data: [], error: null }).then(resolve, reject)
  return { builder, calls }
}

function supabaseWith(builder: unknown) {
  return { from: () => builder } as never
}

test('createSchicht: wirft ohne Bezeichnung', async () => {
  const { builder } = mockQuery({})
  await assert.rejects(
    () => createSchicht(supabaseWith(builder), { organizationId: 'org-1', bezeichnung: '   ', startZeit: '06:00', endZeit: '14:00' }),
    /Bezeichnung/,
  )
})

test('createSchicht: trimmt die Bezeichnung und setzt die Default-Farbe', async () => {
  const { builder, calls } = mockQuery({ singleResult: { data: { id: 's-1' }, error: null } })
  await createSchicht(supabaseWith(builder), { organizationId: 'org-1', bezeichnung: '  Frühdienst  ', startZeit: '06:00', endZeit: '14:00' })
  const insert = calls.find(c => c.method === 'insert')!.args[0] as Record<string, unknown>
  assert.equal(insert.bezeichnung, 'Frühdienst')
  assert.equal(insert.farbe, '#C9963C')
})

test('listSchichten: filtert standardmäßig auf aktive Schichten', async () => {
  const { builder, calls } = mockQuery({ listResult: { data: [{ id: 's-1' }], error: null } })
  const result = await listSchichten(supabaseWith(builder), 'org-1')
  assert.equal(result.length, 1)
  assert.ok(calls.some(c => c.method === 'eq' && c.args[0] === 'aktiv' && c.args[1] === true))
})

test('listSchichten: liefert auch inaktive, wenn nurAktive=false', async () => {
  const { builder, calls } = mockQuery({ listResult: { data: [], error: null } })
  await listSchichten(supabaseWith(builder), 'org-1', false)
  assert.ok(!calls.some(c => c.method === 'eq' && c.args[0] === 'aktiv'))
})

test('listSchichten: wirft bei DB-Fehler', async () => {
  const { builder } = mockQuery({ listResult: { data: null, error: { message: 'db kaputt' } } })
  await assert.rejects(() => listSchichten(supabaseWith(builder), 'org-1'), /db kaputt/)
})

test('updateSchicht: wirft ohne Änderungen', async () => {
  const { builder } = mockQuery({})
  await assert.rejects(() => updateSchicht(supabaseWith(builder), 's-1', 'org-1', {}), /Keine Änderungen/)
})

test('updateSchicht: baut nur die gesetzten Felder ins Update', async () => {
  const { builder, calls } = mockQuery({ singleResult: { data: { id: 's-1', aktiv: false }, error: null } })
  await updateSchicht(supabaseWith(builder), 's-1', 'org-1', { aktiv: false })
  const update = calls.find(c => c.method === 'update')!.args[0]
  assert.deepEqual(update, { aktiv: false })
})

test('updateEintrag: wirft ohne Änderungen', async () => {
  const { builder } = mockQuery({})
  await assert.rejects(() => updateEintrag(supabaseWith(builder), 'e-1', 'org-1', {}), /Keine Änderungen/)
})

test('updateEintrag: weist ungültigen Status ab', async () => {
  const { builder } = mockQuery({})
  await assert.rejects(
    () => updateEintrag(supabaseWith(builder), 'e-1', 'org-1', { status: 'ungueltig' as never }),
    /Ungültiger Wert/,
  )
})

test('updateEintrag: übersetzt Doppelbelegungs-Fehler benutzerfreundlich', async () => {
  const { builder } = mockQuery({ singleResult: { data: null, error: { message: 'Doppelbelegung: Mitarbeiter hat bereits einen Dienst in diesem Zeitraum.' } } })
  await assert.rejects(
    () => updateEintrag(supabaseWith(builder), 'e-1', 'org-1', { status: 'bestaetigt' }),
    /Doppelbelegung/,
  )
})

test('updateEintrag: übersetzt Abwesenheits-Konflikt benutzerfreundlich', async () => {
  const { builder } = mockQuery({ singleResult: { data: null, error: { message: 'Konflikt: Mitarbeiter ist an diesem Tag als abwesend gemeldet.' } } })
  await assert.rejects(
    () => updateEintrag(supabaseWith(builder), 'e-1', 'org-1', { status: 'bestaetigt' }),
    /Konflikt/,
  )
})

test('deleteEintrag: filtert nach id UND organization_id (Mandantengrenze)', async () => {
  const { builder, calls } = mockQuery({ listResult: { data: null, error: null } })
  await deleteEintrag(supabaseWith(builder), 'e-1', 'org-1')
  const eqCalls = calls.filter(c => c.method === 'eq').map(c => c.args)
  // Zweimal dasselbe Paar: einmal beim Lesen des Bestands (Endzustand-Sperre),
  // einmal beim Löschen selbst. Beide Wege bleiben mandantengefiltert.
  assert.deepEqual(eqCalls, [
    ['id', 'e-1'], ['organization_id', 'org-1'],
    ['id', 'e-1'], ['organization_id', 'org-1'],
  ])
})

test('deleteEintrag: löscht einen abgeschlossenen Dienst NICHT', async () => {
  const { builder, calls } = mockQuery({ bestand: { data: { status: 'abgeschlossen' }, error: null } })
  await assert.rejects(
    () => deleteEintrag(supabaseWith(builder), 'e-1', 'org-1'),
    (err: unknown) => err instanceof UserFacingError && /nicht gelöscht/.test((err as Error).message),
  )
  assert.ok(!calls.some(c => c.method === 'delete'), 'Es darf gar kein DELETE abgesetzt werden')
})

test('deleteEintrag: meldet einen unbekannten Eintrag als 404', async () => {
  const { builder } = mockQuery({ bestand: { data: null, error: null } })
  await assert.rejects(
    () => deleteEintrag(supabaseWith(builder), 'e-fremd', 'org-1'),
    (err: unknown) => err instanceof UserFacingError && (err as UserFacingError).status === 404,
  )
})

// ── Endzustand-Sperre beim Ändern ──────────────────────────────

test('updateEintrag: sperrt Kernfelder eines abgeschlossenen Dienstes', async () => {
  for (const status of ['abgeschlossen', 'ausgefallen']) {
    const { builder, calls } = mockQuery({ bestand: { data: { status }, error: null } })
    await assert.rejects(
      () => updateEintrag(supabaseWith(builder), 'e-1', 'org-1', { startZeit: '09:00' }),
      (err: unknown) => err instanceof UserFacingError && (err as UserFacingError).status === 409,
      `Status ${status} muss gesperrt sein`,
    )
    assert.ok(!calls.some(c => c.method === 'update'), 'Kein UPDATE bei gesperrtem Dienst')
  }
})

test('updateEintrag: sperrt auch das Umbesetzen und den Statuswechsel', async () => {
  for (const patch of [{ caregiverId: 'cg-2' }, { clientId: 'cl-2' }, { status: 'geplant' as const }]) {
    const { builder } = mockQuery({ bestand: { data: { status: 'abgeschlossen' }, error: null } })
    await assert.rejects(
      () => updateEintrag(supabaseWith(builder), 'e-1', 'org-1', patch),
      (err: unknown) => err instanceof UserFacingError,
    )
  }
})

test('updateEintrag: lässt Notizen am abgeschlossenen Dienst zu', async () => {
  const { builder, calls } = mockQuery({
    bestand: { data: { status: 'abgeschlossen' }, error: null },
    singleResult: { data: { id: 'e-1', notizen: 'Nachtrag' }, error: null },
  })
  await updateEintrag(supabaseWith(builder), 'e-1', 'org-1', { notizen: 'Nachtrag' })
  assert.deepEqual(calls.find(c => c.method === 'update')!.args[0], { notizen: 'Nachtrag' })
})

test('updateEintrag: geplanter Dienst bleibt frei änderbar', async () => {
  const { builder, calls } = mockQuery({
    bestand: { data: { status: 'geplant' }, error: null },
    singleResult: { data: { id: 'e-1' }, error: null },
  })
  await updateEintrag(supabaseWith(builder), 'e-1', 'org-1', { startZeit: '09:00', caregiverId: 'cg-2' })
  assert.deepEqual(calls.find(c => c.method === 'update')!.args[0], { start_zeit: '09:00', caregiver_id: 'cg-2' })
})

test('deleteEintrag: wirft bei DB-Fehler', async () => {
  const { builder } = mockQuery({ listResult: { data: null, error: { message: 'db kaputt' } } })
  await assert.rejects(() => deleteEintrag(supabaseWith(builder), 'e-1', 'org-1'), /db kaputt/)
})

test('listEintraege: wendet nur die gesetzten Filter an', async () => {
  const { builder, calls } = mockQuery({ listResult: { data: [{ id: 'e-1' }], error: null } })
  const result = await listEintraege(supabaseWith(builder), { organizationId: 'org-1', caregiverId: 'cg-1' })
  assert.equal(result.length, 1)
  assert.ok(calls.some(c => c.method === 'eq' && c.args[0] === 'caregiver_id' && c.args[1] === 'cg-1'))
  assert.ok(!calls.some(c => c.method === 'eq' && c.args[0] === 'client_id'))
})

test('listEintraege: wirft bei DB-Fehler', async () => {
  const { builder } = mockQuery({ listResult: { data: null, error: { message: 'db kaputt' } } })
  await assert.rejects(() => listEintraege(supabaseWith(builder), { organizationId: 'org-1' }), /db kaputt/)
})

test('listTagesansicht: liefert die Tagesliste', async () => {
  const { builder } = mockQuery({ listResult: { data: [{ id: 't-1' }], error: null } })
  const result = await listTagesansicht(supabaseWith(builder), 'org-1', '2026-09-01')
  assert.equal(result.length, 1)
})

test('listTagesansicht: wirft bei DB-Fehler', async () => {
  const { builder } = mockQuery({ listResult: { data: null, error: { message: 'db kaputt' } } })
  await assert.rejects(() => listTagesansicht(supabaseWith(builder), 'org-1', '2026-09-01'), /db kaputt/)
})
