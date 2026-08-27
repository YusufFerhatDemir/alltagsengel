import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assertZeitraum, createAbwesenheit, genehmigenAbwesenheit, ablehnenAbwesenheit, updateAbwesenheit } from '../abwesenheiten'
import { UserFacingError } from '../../api/user-facing-error'
import { erstelleFakeSupabase } from '@/__tests__/helpers/supabase-fake'

function insertClient() {
  const inserts: Array<Record<string, unknown>> = []
  const supabase = {
    from: () => ({
      insert(payload: Record<string, unknown>) {
        inserts.push(payload)
        return {
          select: () => ({
            single: async () => ({ data: { id: 'ab-1', ...payload }, error: null }),
          }),
        }
      },
    }),
  }
  return { supabase: supabase as never, inserts }
}

function updateClient(existing: Record<string, unknown>) {
  const updates: Array<Record<string, unknown>> = []
  const supabase = {
    from: () => ({
      // genehmigen/ablehnen laden den Datensatz zuerst und pruefen Status
      // sowie Selbstgenehmigung — ohne diesen Lesepfad lief der Mock in
      // "supabase.from(...).select is not a function".
      select() {
        const kette: any = {
          eq: () => kette,
          single: async () => ({ data: existing, error: null }),
          maybeSingle: async () => ({ data: existing, error: null }),
        }
        return kette
      },
      update(payload: Record<string, unknown>) {
        updates.push(payload)
        const kette: any = {
          eq: () => kette,
          select: () => ({
            single: async () => ({ data: { ...existing, ...payload }, error: null }),
          }),
        }
        return kette
      },
    }),
  }
  return { supabase: supabase as never, updates }
}

test('createAbwesenheit: setzt Status automatisch auf beantragt', async () => {
  const { supabase, inserts } = insertClient()
  await createAbwesenheit(supabase, {
    organizationId: 'org-1', caregiverId: 'cg-1',
    absenceType: 'vacation', startDate: '2026-08-15', endDate: '2026-08-20',
    erstelltVon: 'user-1',
  })
  assert.equal(inserts[0].status, 'beantragt')
  assert.equal(inserts[0].halber_tag, false)
})

test('createAbwesenheit: akzeptiert erweiterte Typen', async () => {
  const { supabase, inserts } = insertClient()
  await createAbwesenheit(supabase, {
    organizationId: 'org-1', caregiverId: 'cg-1',
    absenceType: 'fortbildung', startDate: '2026-09-01', endDate: '2026-09-03',
    erstelltVon: 'user-1',
  })
  assert.equal(inserts[0].absence_type, 'fortbildung')
})

test('createAbwesenheit: weist ungültigen Typ ab', async () => {
  const { supabase } = insertClient()
  await assert.rejects(
    () => createAbwesenheit(supabase, {
      organizationId: 'org-1', caregiverId: 'cg-1',
      absenceType: 'ungueltig' as any, startDate: '2026-09-01', endDate: '2026-09-03',
      erstelltVon: 'user-1',
    }),
    /Ungültiger Wert/,
  )
})

test('genehmigenAbwesenheit: setzt genehmigt + genehmigt_von/am', async () => {
  const { supabase, updates } = updateClient({ id: 'ab-1', status: 'beantragt' })
  const result = await genehmigenAbwesenheit(supabase, 'ab-1', 'org-1', 'admin-1')
  assert.equal(updates[0].status, 'genehmigt')
  assert.equal(updates[0].genehmigt_von, 'admin-1')
  assert.ok(updates[0].genehmigt_am)
})

test('ablehnenAbwesenheit: verlangt Ablehnungsgrund', async () => {
  const { supabase } = updateClient({ id: 'ab-1', status: 'beantragt' })
  await assert.rejects(
    () => ablehnenAbwesenheit(supabase, 'ab-1', 'org-1', 'admin-1', ''),
    /Ablehnungsgrund ist ein Pflichtfeld/,
  )
})

test('ablehnenAbwesenheit: setzt abgelehnt + ablehnungsgrund', async () => {
  const { supabase, updates } = updateClient({ id: 'ab-1', status: 'beantragt' })
  await ablehnenAbwesenheit(supabase, 'ab-1', 'org-1', 'admin-1', 'Betrieblicher Bedarf')
  assert.equal(updates[0].status, 'abgelehnt')
  assert.equal(updates[0].ablehnungsgrund, 'Betrieblicher Bedarf')
})

test('updateAbwesenheit: blockt Änderungen an bereits entschiedenen Anträgen', async () => {
  const { supabase } = updateClient({ id: 'ab-1', status: 'genehmigt' })
  await assert.rejects(
    () => updateAbwesenheit(supabase, 'ab-1', 'org-1', { reason: 'neu' }),
    /Nur beantragte Abwesenheiten können bearbeitet werden/,
  )
})

test('updateAbwesenheit: erlaubt Änderungen, solange noch beantragt', async () => {
  const { supabase, updates } = updateClient({ id: 'ab-1', status: 'beantragt' })
  const result = await updateAbwesenheit(supabase, 'ab-1', 'org-1', { reason: 'aktualisiert' })
  assert.equal(result.reason, 'aktualisiert')
  assert.equal(updates[0].reason, 'aktualisiert')
})

// ── genehmigenAbwesenheit: Urlaubskonto-Buchung ─────────────────────────

function vacationSupabase(opts: {
  absence?: Record<string, unknown>
  kontoSequenz: Array<Record<string, unknown> | null>
  casErfolgSequenz?: boolean[]
}) {
  const absence = {
    id: 'ab-1', status: 'beantragt', erstellt_von: 'user-1', absence_type: 'vacation',
    start_date: '2026-08-10', end_date: '2026-08-14', halber_tag: false,
    ...opts.absence,
  }
  let kontoNr = 0
  const casErfolg = opts.casErfolgSequenz ?? [true]

  const { client, aufrufe } = erstelleFakeSupabase(aufruf => {
    if (aufruf.tabelle === 'absences') {
      if (aufruf.operation === 'select') return { data: absence }
      if (aufruf.operation === 'update') return { data: { ...absence, status: 'genehmigt' } }
    }
    if (aufruf.tabelle === 'personal_urlaubskonto') {
      if (aufruf.operation === 'select') {
        const konto = opts.kontoSequenz[Math.min(kontoNr, opts.kontoSequenz.length - 1)]
        kontoNr++
        return { data: konto }
      }
      if (aufruf.operation === 'update') {
        // Die CAS-Bedingung selbst simulieren wir hier, statt sie aus den
        // Filtern nachzurechnen: der wievielte Update-Versuch das ist,
        // bestimmt casErfolgSequenz.
        const updateNr = aufrufe.filter(a => a.tabelle === 'personal_urlaubskonto' && a.operation === 'update').length - 1
        const erfolgreich = casErfolg[Math.min(updateNr, casErfolg.length - 1)]
        return erfolgreich ? { data: { id: 'konto-1' } } : { data: null }
      }
    }
    return {}
  })
  return { supabase: client, aufrufe }
}

test('genehmigenAbwesenheit: bucht die genommenen Tage, wenn genug Resturlaub da ist', async () => {
  const { supabase, aufrufe } = vacationSupabase({
    kontoSequenz: [{ id: 'konto-1', anspruch_tage: 20, uebertrag_vorjahr: 0, genommen_tage: 5, geplant_tage: 0 }],
  })
  await genehmigenAbwesenheit(supabase, 'ab-1', 'org-1', 'admin-1')

  const kontoUpdate = aufrufe.find(a => a.tabelle === 'personal_urlaubskonto' && a.operation === 'update')
  assert.equal((kontoUpdate?.payload as any).genommen_tage, 10) // 5 bisher + 5 Tage (10.–14.8.)
})

test('genehmigenAbwesenheit: lehnt ab, wenn nicht genug Resturlaub verfügbar ist', async () => {
  const { supabase } = vacationSupabase({
    kontoSequenz: [{ id: 'konto-1', anspruch_tage: 5, uebertrag_vorjahr: 0, genommen_tage: 3, geplant_tage: 0 }],
  })
  await assert.rejects(
    () => genehmigenAbwesenheit(supabase, 'ab-1', 'org-1', 'admin-1'),
    /Nicht genug Resturlaub/,
  )
})

test('genehmigenAbwesenheit: lehnt ab, wenn für das Jahr kein Urlaubskonto existiert', async () => {
  const { supabase } = vacationSupabase({ kontoSequenz: [null] })
  await assert.rejects(
    () => genehmigenAbwesenheit(supabase, 'ab-1', 'org-1', 'admin-1'),
    /kein Urlaubskonto/,
  )
})

test('genehmigenAbwesenheit: wiederholt die Buchung, wenn eine parallele Genehmigung dazwischenfunkt (CAS)', async () => {
  const { supabase, aufrufe } = vacationSupabase({
    kontoSequenz: [
      { id: 'konto-1', anspruch_tage: 20, uebertrag_vorjahr: 0, genommen_tage: 5, geplant_tage: 0 },
      { id: 'konto-1', anspruch_tage: 20, uebertrag_vorjahr: 0, genommen_tage: 6, geplant_tage: 0 },
    ],
    casErfolgSequenz: [false, true], // erster Schreibversuch kollidiert, zweiter klappt
  })
  await genehmigenAbwesenheit(supabase, 'ab-1', 'org-1', 'admin-1')

  const kontoUpdates = aufrufe.filter(a => a.tabelle === 'personal_urlaubskonto' && a.operation === 'update')
  assert.equal(kontoUpdates.length, 2)
  assert.equal((kontoUpdates[1].payload as any).genommen_tage, 11) // 6 (frischer Stand) + 5 Tage
})

// ═══════════════════════════════════════════════════════════════
// Zeitraum- und Statusregeln (Härtung 27.08.2026)
// ═══════════════════════════════════════════════════════════════

const ZEITRAUM_BASIS = {
  organizationId: 'org-1',
  caregiverId: 'cg-1',
  absenceType: 'vacation' as const,
  erstelltVon: 'user-1',
}

test('assertZeitraum: weist ein Ende vor dem Start ab', () => {
  assert.throws(
    () => assertZeitraum('2026-09-10', '2026-09-01'),
    (err: unknown) => err instanceof UserFacingError && /Enddatum darf nicht vor dem Startdatum/.test((err as Error).message),
  )
})

test('assertZeitraum: akzeptiert einen eintägigen Zeitraum', () => {
  assert.doesNotThrow(() => assertZeitraum('2026-09-01', '2026-09-01'))
})

test('assertZeitraum: erzwingt ISO-Datumsformat', () => {
  assert.throws(() => assertZeitraum('01.09.2026', '2026-09-02'), /YYYY-MM-DD/)
  assert.throws(() => assertZeitraum('2026-09-01', '2026-9-2'), /YYYY-MM-DD/)
})

test('assertZeitraum: weist ein nicht existierendes Kalenderdatum ab', () => {
  // Passt auf das Muster, gibt es aber nicht — Date() würde still auf den
  // 3. März rollen und der Antrag bekäme einen anderen Zeitraum als erfasst.
  assert.throws(() => assertZeitraum('2026-02-31', '2026-03-05'), /gültiges Kalenderdatum/)
  assert.throws(() => assertZeitraum('2026-09-01', '2026-13-01'), /gültiges Kalenderdatum/)
})

test('createAbwesenheit: weist einen verdrehten Zeitraum ab', async () => {
  const { supabase, inserts } = insertClient()
  await assert.rejects(
    () => createAbwesenheit(supabase, { ...ZEITRAUM_BASIS, startDate: '2026-09-10', endDate: '2026-09-01' }),
    (err: unknown) => err instanceof UserFacingError,
  )
  assert.equal(inserts.length, 0)
})

test('createAbwesenheit: legt IMMER als Antrag an — vorgenehmigt geht nicht', async () => {
  const { supabase, inserts } = insertClient()
  await assert.rejects(
    () => createAbwesenheit(supabase, {
      ...ZEITRAUM_BASIS, startDate: '2026-09-01', endDate: '2026-09-05',
      status: 'genehmigt',
    }),
    (err: unknown) => err instanceof UserFacingError && /immer als Antrag/.test((err as Error).message),
  )
  assert.equal(inserts.length, 0, 'Eine vorgenehmigte Abwesenheit umginge Urlaubskonto und Vier-Augen-Prüfung')
})

test('createAbwesenheit: ein halber Tag gilt nur für einen einzelnen Tag', async () => {
  const { supabase } = insertClient()
  await assert.rejects(
    () => createAbwesenheit(supabase, {
      ...ZEITRAUM_BASIS, startDate: '2026-09-01', endDate: '2026-09-05', halberTag: true,
    }),
    (err: unknown) => err instanceof UserFacingError && /halber Tag/.test((err as Error).message),
  )

  const ok = insertClient()
  await createAbwesenheit(ok.supabase, {
    ...ZEITRAUM_BASIS, startDate: '2026-09-01', endDate: '2026-09-01', halberTag: true,
  })
  assert.equal(ok.inserts[0].halber_tag, true)
})

test('createAbwesenheit: der reguläre Antrag geht unverändert durch', async () => {
  const { supabase, inserts } = insertClient()
  await createAbwesenheit(supabase, { ...ZEITRAUM_BASIS, startDate: '2026-09-01', endDate: '2026-09-05' })
  assert.equal(inserts[0].status, 'beantragt')
  assert.equal(inserts[0].start_date, '2026-09-01')
})
