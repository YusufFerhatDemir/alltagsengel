// ═══════════════════════════════════════════════════════════════
// Tests: Maßnahmenplan — Statusmaschine, Freigabe, Sperre, Versionierung
// Ausführen: npm run test:unit
// ═══════════════════════════════════════════════════════════════

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPlan, freigebenPlan, neueVersion, updatePlan, validatePlanUebergang } from '../massnahmenplaene'
import type { PlanStatus } from '../types'

/** Minimaler Supabase-Doppelgänger: liefert `plan` für Lesezugriffe, sammelt Updates. */
function planClient(plan: Record<string, unknown>, optionen: { massnahmenCount?: number; massnahmen?: unknown[] } = {}) {
  const updates: Array<{ tabelle: string; payload: Record<string, unknown> }> = []
  const inserts: Array<{ tabelle: string; payload: unknown }> = []

  const supabase = {
    from(tabelle: string) {
      return {
        select(_spalten?: string, opts?: { count?: string; head?: boolean }) {
          if (tabelle === 'pflege_massnahmen' && opts?.head) {
            const kette: any = {
              eq: () => kette,
              then: (resolve: (v: unknown) => void) =>
                resolve({ count: optionen.massnahmenCount ?? 0, error: null }),
            }
            return kette
          }
          const kette: any = {
            eq: () => kette,
            order: () => kette,
            limit: () => kette,
            maybeSingle: async () => ({ data: plan, error: null }),
            then: (resolve: (v: unknown) => void) =>
              resolve({ data: optionen.massnahmen ?? [], error: null }),
          }
          return kette
        },
        insert(payload: unknown) {
          inserts.push({ tabelle, payload })
          const kette: any = {
            select: () => ({
              single: async () => ({ data: { id: 'neu-1', ...(payload as object) }, error: null }),
            }),
            then: (resolve: (v: unknown) => void) => resolve({ error: null }),
          }
          return kette
        },
        update(payload: Record<string, unknown>) {
          updates.push({ tabelle, payload })
          const kette: any = {
            eq: () => kette,
            neq: () => kette,
            select: () => ({ single: async () => ({ data: { ...plan, ...payload }, error: null }) }),
            then: (resolve: (v: unknown) => void) => resolve({ error: null }),
          }
          return kette
        },
      }
    },
  }

  return { supabase: supabase as never, updates, inserts }
}

const BASIS_PLAN = {
  id: 'plan-1', client_id: 'client-1', titel: 'Versorgungsplan', plan_typ: 'versorgungsplan',
  status: 'entwurf', version: 1, gueltig_von: '2026-08-01', gueltig_bis: null,
  betreuungsziele: 'Selbstständigkeit erhalten', pflegeziele: null, gesperrt: false,
}

test('validatePlanUebergang bildet die vorgesehene Statusmaschine ab', () => {
  const erlaubt: Array<[PlanStatus, PlanStatus]> = [
    ['entwurf', 'aktiv'], ['entwurf', 'gesperrt'],
    ['aktiv', 'abgelaufen'], ['aktiv', 'ersetzt'], ['aktiv', 'gesperrt'],
    ['abgelaufen', 'ersetzt'], ['abgelaufen', 'gesperrt'],
  ]
  for (const [von, nach] of erlaubt) {
    assert.doesNotThrow(() => validatePlanUebergang(von, nach), `${von} → ${nach}`)
  }

  const verboten: Array<[PlanStatus, PlanStatus]> = [
    ['aktiv', 'entwurf'], ['ersetzt', 'aktiv'], ['gesperrt', 'aktiv'],
    ['gesperrt', 'entwurf'], ['abgelaufen', 'aktiv'],
  ]
  for (const [von, nach] of verboten) {
    assert.throws(() => validatePlanUebergang(von, nach), /ist nicht erlaubt/, `${von} → ${nach}`)
  }
})

test('createPlan weist ein Gültigkeitsende vor dem Beginn zurück', async () => {
  const { supabase } = planClient(BASIS_PLAN)
  await assert.rejects(
    () => createPlan(supabase, {
      organizationId: 'org-1', clientId: 'client-1', titel: 'Plan',
      gueltigVon: '2026-09-01', gueltigBis: '2026-08-01', erstelltVon: 'user-1',
    }),
    /"Gültig bis" darf nicht vor "Gültig von" liegen/
  )
})

test('createPlan verlangt einen Titel', async () => {
  const { supabase } = planClient(BASIS_PLAN)
  await assert.rejects(
    () => createPlan(supabase, { organizationId: 'org-1', clientId: 'client-1', titel: '   ', erstelltVon: 'user-1' }),
    /Titel ist ein Pflichtfeld/
  )
})

test('updatePlan blockt Änderungen an gesperrten Plänen', async () => {
  const { supabase } = planClient({ ...BASIS_PLAN, gesperrt: true })
  await assert.rejects(
    () => updatePlan(supabase, 'plan-1', 'org-1', { titel: 'Neu' }),
    /Gesperrter Maßnahmenplan kann nicht bearbeitet werden/
  )
})

test('freigebenPlan verweigert die Freigabe ohne Maßnahmen', async () => {
  const { supabase } = planClient(BASIS_PLAN, { massnahmenCount: 0 })
  await assert.rejects(
    () => freigebenPlan(supabase, 'plan-1', 'org-1', 'user-1'),
    /Ein Plan ohne Maßnahmen kann nicht freigegeben werden/
  )
})

test('freigebenPlan setzt den Plan aktiv und löst den Vorgänger ab', async () => {
  const { supabase, updates } = planClient(BASIS_PLAN, { massnahmenCount: 3 })
  const plan = await freigebenPlan(supabase, 'plan-1', 'org-1', 'user-7')

  // Erstes Update löst den bisher aktiven Plan ab, zweites gibt diesen frei.
  assert.equal(updates.length, 2)
  assert.deepEqual(updates[0].payload, { status: 'ersetzt' })
  assert.equal(updates[1].payload.status, 'aktiv')
  assert.equal(updates[1].payload.freigegeben_von, 'user-7')
  assert.ok(updates[1].payload.freigegeben_am)
  assert.equal(plan.status, 'aktiv')
})

test('freigebenPlan blockt gesperrte Pläne', async () => {
  const { supabase } = planClient({ ...BASIS_PLAN, gesperrt: true }, { massnahmenCount: 2 })
  await assert.rejects(
    () => freigebenPlan(supabase, 'plan-1', 'org-1', 'user-1'),
    /Gesperrter Maßnahmenplan kann nicht freigegeben werden/
  )
})

test('neueVersion erhöht die Version, verkettet den Vorgänger und kopiert die Maßnahmen', async () => {
  const massnahmen = [
    { id: 'm-1', kategorie: 'mobilitaet', titel: 'Spaziergang', beschreibung: null, ziel: null, haeufigkeit: '2× wöchentlich', verantwortlich: null, prioritaet: 'normal', status: 'aktiv', beginn_datum: null, ende_datum: null, sortierung: 1 },
    { id: 'm-2', kategorie: 'ernaehrung', titel: 'Mahlzeiten', beschreibung: null, ziel: null, haeufigkeit: 'täglich', verantwortlich: null, prioritaet: 'hoch', status: 'abgeschlossen', beginn_datum: null, ende_datum: null, sortierung: 2 },
  ]
  const { supabase, inserts } = planClient({ ...BASIS_PLAN, status: 'aktiv', version: 2 }, { massnahmen })

  const neu = await neueVersion(supabase, 'plan-1', 'org-1', 'user-1')

  assert.equal(neu.version, 3)
  assert.equal(neu.vorgaenger_id, 'plan-1')

  const kopien = inserts.find(i => i.tabelle === 'pflege_massnahmen')
  assert.ok(kopien, 'Maßnahmen müssen mitkopiert werden')
  const kopierte = kopien!.payload as Array<Record<string, unknown>>
  assert.equal(kopierte.length, 2)
  assert.equal(kopierte[0].plan_id, 'neu-1')
  // Kopien starten unabhängig vom Vorgängerstatus wieder als "geplant".
  assert.deepEqual(kopierte.map(m => m.status), ['geplant', 'geplant'])
  assert.deepEqual(kopierte.map(m => m.titel), ['Spaziergang', 'Mahlzeiten'])
})

test('neueVersion lehnt bereits ersetzte Pläne ab', async () => {
  const { supabase } = planClient({ ...BASIS_PLAN, status: 'ersetzt' })
  await assert.rejects(
    () => neueVersion(supabase, 'plan-1', 'org-1', 'user-1'),
    /bereits ersetzter Plan kann nicht erneut versioniert werden/
  )
})
