// ═══════════════════════════════════════════════════════════════
// Tests: Anamnese — Enum-Validierung, Sperr-/Abschluss-Logik
// Ausführen: npm run test:unit
// ═══════════════════════════════════════════════════════════════

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createAnamnese, entsperreAnamnese, sperreAnamnese, updateAnamnese } from '../anamnesen'

/** Minimaler Supabase-Doppelgänger analog massnahmenplaene.test.ts. */
function anamneseClient(anamnese: Record<string, unknown>) {
  const updates: Array<{ tabelle: string; payload: Record<string, unknown> }> = []
  const inserts: Array<{ tabelle: string; payload: unknown }> = []

  const supabase = {
    from(tabelle: string) {
      return {
        select() {
          const kette: any = {
            eq: () => kette,
            order: () => kette,
            limit: () => kette,
            maybeSingle: async () => ({ data: anamnese, error: null }),
            then: (resolve: (v: unknown) => void) => resolve({ data: [anamnese], error: null }),
          }
          return kette
        },
        insert(payload: unknown) {
          inserts.push({ tabelle, payload })
          return {
            select: () => ({
              single: async () => ({ data: { id: 'a-neu', ...(payload as object) }, error: null }),
            }),
          }
        },
        update(payload: Record<string, unknown>) {
          updates.push({ tabelle, payload })
          const kette: any = {
            eq: () => kette,
            select: () => ({ single: async () => ({ data: { ...anamnese, ...payload }, error: null }) }),
          }
          return kette
        },
      }
    },
  }

  return { supabase: supabase as never, updates, inserts }
}

const BASIS = {
  id: 'a-1', organization_id: 'org-1', client_id: 'client-1',
  anamnese_datum: '2026-08-01', anamnese_typ: 'erstanamnese',
  status: 'entwurf', gesperrt: false,
}

// ── createAnamnese ─────────────────────────────────────────────

test('createAnamnese lehnt ungültigen anamnese_typ ab', async () => {
  const { supabase } = anamneseClient(BASIS)
  await assert.rejects(
    () => createAnamnese(supabase, {
      organizationId: 'org-1', clientId: 'client-1', anamneseTyp: 'jaehrlich' as never,
      erhobenVon: 'user-1', erstelltVon: 'user-1',
    }),
    /Ungültiger Wert/,
  )
})

test('createAnamnese lehnt ungültiges sturzrisiko ab', async () => {
  const { supabase } = anamneseClient(BASIS)
  await assert.rejects(
    () => createAnamnese(supabase, {
      organizationId: 'org-1', clientId: 'client-1', erhobenVon: 'user-1', erstelltVon: 'user-1',
      sturzrisiko: 'extrem' as never,
    }),
    /Ungültiger Wert/,
  )
})

test('createAnamnese protokolliert die Erstellung', async () => {
  const { supabase, inserts } = anamneseClient(BASIS)
  await createAnamnese(supabase, {
    organizationId: 'org-1', clientId: 'client-1', erhobenVon: 'user-1', erstelltVon: 'user-2',
  })
  const log = inserts.find(i => i.tabelle === 'pflege_audit_log')
  assert.ok(log, 'Audit-Log-Eintrag muss geschrieben werden')
  assert.equal((log!.payload as Record<string, unknown>).aktion, 'erstellt')
})

// ── updateAnamnese: Sperr-/Abschluss-Logik ────────────────────

test('updateAnamnese blockt gesperrte Anamnesen', async () => {
  const { supabase } = anamneseClient({ ...BASIS, gesperrt: true })
  await assert.rejects(
    () => updateAnamnese(supabase, 'a-1', 'org-1', { zusammenfassung: 'Neu' }),
    /Gesperrte Anamnese kann nicht bearbeitet werden/,
  )
})

test('updateAnamnese blockt Bearbeitung einer bereits abgeschlossenen Anamnese', async () => {
  const { supabase } = anamneseClient({ ...BASIS, status: 'abgeschlossen' })
  await assert.rejects(
    () => updateAnamnese(supabase, 'a-1', 'org-1', { zusammenfassung: 'Nachtrag' }),
    /Nur eine Anamnese im Entwurf kann bearbeitet werden/,
  )
})

test('updateAnamnese erlaubt Bearbeitung im Entwurf', async () => {
  const { supabase, updates } = anamneseClient(BASIS)
  await updateAnamnese(supabase, 'a-1', 'org-1', { zusammenfassung: 'Text' })
  assert.equal(updates[0].payload.zusammenfassung, 'Text')
})

test('updateAnamnese erlaubt den Übergang entwurf → abgeschlossen und setzt abgeschlossen_am', async () => {
  const { supabase, updates } = anamneseClient(BASIS)
  await updateAnamnese(supabase, 'a-1', 'org-1', { status: 'abgeschlossen' })
  assert.equal(updates[0].payload.status, 'abgeschlossen')
  assert.ok(typeof updates[0].payload.abgeschlossen_am === 'string')
})

test('updateAnamnese verweist beim Versuch, direkt auf "gesperrt" zu setzen, auf den Sperren-Endpunkt', async () => {
  const { supabase } = anamneseClient(BASIS)
  await assert.rejects(
    () => updateAnamnese(supabase, 'a-1', 'org-1', { status: 'gesperrt' }),
    /Sperren erfolgt über/,
  )
})

// ── sperreAnamnese / entsperreAnamnese ────────────────────────

test('sperreAnamnese verlangt Status "abgeschlossen"', async () => {
  const { supabase } = anamneseClient({ ...BASIS, status: 'entwurf' })
  await assert.rejects(
    () => sperreAnamnese(supabase, 'a-1', 'org-1'),
    /Nur abgeschlossene Anamnesen können gesperrt werden/,
  )
})

test('sperreAnamnese sperrt eine abgeschlossene Anamnese', async () => {
  const { supabase, updates } = anamneseClient({ ...BASIS, status: 'abgeschlossen' })
  const result = await sperreAnamnese(supabase, 'a-1', 'org-1')
  assert.equal(updates[0].payload.gesperrt, true)
  assert.equal(updates[0].payload.status, 'gesperrt')
  assert.equal(result.gesperrt, true)
})

test('sperreAnamnese lehnt eine bereits gesperrte Anamnese ab', async () => {
  const { supabase } = anamneseClient({ ...BASIS, status: 'gesperrt', gesperrt: true })
  await assert.rejects(
    () => sperreAnamnese(supabase, 'a-1', 'org-1'),
    /bereits gesperrt/,
  )
})

test('entsperreAnamnese setzt auf "abgeschlossen" zurück', async () => {
  const { supabase, updates } = anamneseClient({ ...BASIS, status: 'gesperrt', gesperrt: true })
  const result = await entsperreAnamnese(supabase, 'a-1', 'org-1')
  assert.equal(updates[0].payload.gesperrt, false)
  assert.equal(updates[0].payload.status, 'abgeschlossen')
  assert.equal(result.status, 'abgeschlossen')
})

test('entsperreAnamnese lehnt eine nicht gesperrte Anamnese ab', async () => {
  const { supabase } = anamneseClient({ ...BASIS, status: 'abgeschlossen', gesperrt: false })
  await assert.rejects(
    () => entsperreAnamnese(supabase, 'a-1', 'org-1'),
    /ist nicht gesperrt/,
  )
})
