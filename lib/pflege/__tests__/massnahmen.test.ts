// ═══════════════════════════════════════════════════════════════
// Tests: Einzelmaßnahmen — Validierung, geerbte Plan-Sperre, Audit-Log
// Ausführen: npm run test:unit
// ═══════════════════════════════════════════════════════════════

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createMassnahme, updateMassnahme } from '../massnahmen'

/** `plan` steuert assertPlanOffen, `massnahme` die getMassnahme-Antwort in updateMassnahme. */
function massnahmenClient(
  plan: { id: string; gesperrt: boolean } | null,
  massnahme: Record<string, unknown> | null = null,
) {
  const inserts: Array<{ tabelle: string; payload: Record<string, unknown> }> = []
  const updates: Array<{ tabelle: string; payload: Record<string, unknown> }> = []
  const supabase = {
    from(tabelle: string) {
      return {
        select() {
          const kette: any = {
            eq: () => kette,
            maybeSingle: async () => ({
              data: tabelle === 'pflege_massnahmenplaene' ? plan : massnahme,
              error: null,
            }),
          }
          return kette
        },
        insert(payload: Record<string, unknown>) {
          inserts.push({ tabelle, payload })
          return { select: () => ({ single: async () => ({ data: { id: 'm-1', ...payload }, error: null }) }) }
        },
        update(payload: Record<string, unknown>) {
          updates.push({ tabelle, payload })
          const kette: any = {
            eq: () => kette,
            select: () => ({ single: async () => ({ data: { id: 'm-1', ...massnahme, ...payload }, error: null }) }),
          }
          return kette
        },
      }
    },
  }
  const nur = (tabelle: string) => inserts.filter(i => i.tabelle === tabelle).map(i => i.payload)
  return { supabase: supabase as never, inserts, updates, nur }
}

const BASIS = { organizationId: 'org-1', planId: 'plan-1', kategorie: 'mobilitaet' as const, titel: 'Spaziergang', erstelltVon: 'user-1' }

test('createMassnahme verlangt einen Titel', async () => {
  const { supabase } = massnahmenClient({ id: 'plan-1', gesperrt: false })
  await assert.rejects(
    () => createMassnahme(supabase, { ...BASIS, titel: '  ' }),
    /Titel ist ein Pflichtfeld/,
  )
})

test('createMassnahme lehnt ungültige Kategorie/Priorität ab', async () => {
  const { supabase } = massnahmenClient({ id: 'plan-1', gesperrt: false })
  await assert.rejects(
    () => createMassnahme(supabase, { ...BASIS, kategorie: 'freizeit' as never }),
    /Ungültiger Wert "freizeit" für kategorie/,
  )
  await assert.rejects(
    () => createMassnahme(supabase, { ...BASIS, prioritaet: 'extrem' as never }),
    /Ungültiger Wert "extrem" für prioritaet/,
  )
})

test('createMassnahme lehnt ein Enddatum vor dem Beginn ab', async () => {
  const { supabase } = massnahmenClient({ id: 'plan-1', gesperrt: false })
  await assert.rejects(
    () => createMassnahme(supabase, { ...BASIS, beginnDatum: '2026-09-01', endeDatum: '2026-08-01' }),
    /Enddatum darf nicht vor dem Beginn liegen/,
  )
})

test('createMassnahme erbt die Sperre des Plans', async () => {
  const { supabase } = massnahmenClient({ id: 'plan-1', gesperrt: true })
  await assert.rejects(
    () => createMassnahme(supabase, BASIS),
    /Gesperrter Maßnahmenplan — Maßnahmen können nicht geändert werden/,
  )
})

test('createMassnahme lehnt einen unbekannten Plan ab', async () => {
  const { supabase } = massnahmenClient(null)
  await assert.rejects(
    () => createMassnahme(supabase, BASIS),
    /Maßnahmenplan nicht gefunden/,
  )
})

test('createMassnahme legt an offenem Plan an und protokolliert', async () => {
  const { supabase, nur } = massnahmenClient({ id: 'plan-1', gesperrt: false })
  const massnahme = await createMassnahme(supabase, BASIS)
  assert.equal(massnahme.plan_id, 'plan-1')
  const insert = nur('pflege_massnahmen')[0]
  assert.equal(insert.prioritaet, 'normal')
  assert.equal(insert.status, undefined) // Status kommt aus dem DB-Default, nicht aus dem Insert-Payload

  const log = nur('pflege_audit_log')[0]
  assert.ok(log, 'Audit-Log-Eintrag muss geschrieben werden')
  assert.equal(log.entitaet_typ, 'massnahme')
  assert.equal(log.aktion, 'erstellt')
})

test('updateMassnahme wirft, wenn die Maßnahme nicht gefunden wird', async () => {
  const { supabase } = massnahmenClient({ id: 'plan-1', gesperrt: false }, null)
  await assert.rejects(
    () => updateMassnahme(supabase, 'm-1', 'org-1', { titel: 'Neu' }),
    /Maßnahme nicht gefunden/,
  )
})

test('updateMassnahme blockt Änderungen, wenn der übergeordnete Plan gesperrt ist', async () => {
  const { supabase } = massnahmenClient(
    { id: 'plan-1', gesperrt: true },
    { id: 'm-1', plan_id: 'plan-1', titel: 'alt', beginn_datum: null, ende_datum: null },
  )
  await assert.rejects(
    () => updateMassnahme(supabase, 'm-1', 'org-1', { titel: 'Neu' }),
    /Gesperrter Maßnahmenplan — Maßnahmen können nicht geändert werden/,
  )
})

test('updateMassnahme lehnt eine leere Titeländerung und leere Patches ab', async () => {
  const { supabase } = massnahmenClient(
    { id: 'plan-1', gesperrt: false },
    { id: 'm-1', plan_id: 'plan-1', titel: 'alt', beginn_datum: null, ende_datum: null },
  )
  await assert.rejects(
    () => updateMassnahme(supabase, 'm-1', 'org-1', { titel: '   ' }),
    /Titel darf nicht leer sein/,
  )
  await assert.rejects(
    () => updateMassnahme(supabase, 'm-1', 'org-1', {}),
    /Keine Änderungen übergeben/,
  )
})

test('updateMassnahme prüft Enddatum gegen das BESTEHENDE Beginndatum bei Teil-Update', async () => {
  const { supabase } = massnahmenClient(
    { id: 'plan-1', gesperrt: false },
    { id: 'm-1', plan_id: 'plan-1', titel: 'alt', beginn_datum: '2026-09-01', ende_datum: null },
  )
  await assert.rejects(
    () => updateMassnahme(supabase, 'm-1', 'org-1', { endeDatum: '2026-08-01' }),
    /Enddatum darf nicht vor dem Beginn liegen/,
  )
})

test('updateMassnahme setzt nur übergebene Felder und protokolliert "aktualisiert"', async () => {
  const { supabase, updates, nur } = massnahmenClient(
    { id: 'plan-1', gesperrt: false },
    { id: 'm-1', plan_id: 'plan-1', titel: 'alt', beginn_datum: null, ende_datum: null },
  )
  await updateMassnahme(supabase, 'm-1', 'org-1', { status: 'abgeschlossen', ergebnis: 'Ziel erreicht' })
  assert.deepEqual(updates[0].payload, { status: 'abgeschlossen', ergebnis: 'Ziel erreicht' })
  assert.equal(nur('pflege_audit_log')[0].aktion, 'aktualisiert')
})
