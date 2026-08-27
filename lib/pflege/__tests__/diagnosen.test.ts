// ═══════════════════════════════════════════════════════════════
// Tests: Diagnosen — Validierung, Soft-Delete, Audit-Log
// Ausführen: npm run test:unit
// ═══════════════════════════════════════════════════════════════

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createDiagnose, deaktiviereDiagnose, updateDiagnose } from '../diagnosen'

function diagnoseClient() {
  const inserts: Array<{ tabelle: string; payload: Record<string, unknown> }> = []
  const updates: Array<{ tabelle: string; payload: Record<string, unknown> }> = []
  const supabase = {
    from(tabelle: string) {
      return {
        insert(payload: Record<string, unknown>) {
          inserts.push({ tabelle, payload })
          return { select: () => ({ single: async () => ({ data: { id: 'd-1', organization_id: 'org-1', ...payload }, error: null }) }) }
        },
        update(payload: Record<string, unknown>) {
          updates.push({ tabelle, payload })
          const kette: any = {
            eq: () => kette,
            select: () => ({ single: async () => ({ data: { id: 'd-1', ...payload }, error: null }) }),
          }
          return kette
        },
      }
    },
  }
  const nur = (tabelle: string) => inserts.filter(i => i.tabelle === tabelle).map(i => i.payload)
  return { supabase: supabase as never, inserts, updates, nur }
}

const BASIS = { organizationId: 'org-1', clientId: 'client-1', bezeichnung: 'Diabetes mellitus Typ 2', erstelltVon: 'user-1' }

test('createDiagnose verlangt eine Bezeichnung', async () => {
  const { supabase } = diagnoseClient()
  await assert.rejects(
    () => createDiagnose(supabase, { ...BASIS, bezeichnung: '   ' }),
    /Bezeichnung ist ein Pflichtfeld/,
  )
})

test('createDiagnose lehnt ungültigen diagnose_typ und schweregrad ab', async () => {
  const { supabase } = diagnoseClient()
  await assert.rejects(
    () => createDiagnose(supabase, { ...BASIS, diagnoseTyp: 'vermutung' as never }),
    /Ungültiger Wert "vermutung" für diagnose_typ/,
  )
  await assert.rejects(
    () => createDiagnose(supabase, { ...BASIS, schweregrad: 'extrem' as never }),
    /Ungültiger Wert "extrem" für schweregrad/,
  )
})

test('createDiagnose setzt betreuungsrelevant standardmäßig auf true und protokolliert', async () => {
  const { supabase, nur } = diagnoseClient()
  await createDiagnose(supabase, BASIS)
  const insert = nur('pflege_diagnosen')[0]
  assert.equal(insert.betreuungsrelevant, true)
  assert.equal(insert.diagnose_typ, 'diagnose')

  const log = nur('pflege_audit_log')[0]
  assert.ok(log, 'Audit-Log-Eintrag muss geschrieben werden')
  assert.equal(log.entitaet_typ, 'diagnose')
  assert.equal(log.aktion, 'erstellt')
})

test('updateDiagnose lehnt eine leere Bezeichnung und leere Änderungen ab', async () => {
  const { supabase } = diagnoseClient()
  await assert.rejects(
    () => updateDiagnose(supabase, 'd-1', 'org-1', { bezeichnung: '   ' }),
    /Bezeichnung darf nicht leer sein/,
  )
  await assert.rejects(
    () => updateDiagnose(supabase, 'd-1', 'org-1', {}),
    /Keine Änderungen übergeben/,
  )
})

test('updateDiagnose protokolliert "geloescht" bei aktiv=false, sonst "aktualisiert"', async () => {
  const { supabase: sb1, nur: nur1 } = diagnoseClient()
  await updateDiagnose(sb1, 'd-1', 'org-1', { aktiv: false })
  assert.equal(nur1('pflege_audit_log')[0].aktion, 'geloescht')

  const { supabase: sb2, nur: nur2 } = diagnoseClient()
  await updateDiagnose(sb2, 'd-1', 'org-1', { bezeichnung: 'Neue Bezeichnung' })
  assert.equal(nur2('pflege_audit_log')[0].aktion, 'aktualisiert')
})

test('deaktiviereDiagnose setzt aktiv=false (Soft-Delete)', async () => {
  const { supabase, updates } = diagnoseClient()
  const result = await deaktiviereDiagnose(supabase, 'd-1', 'org-1')
  assert.equal(updates[0].payload.aktiv, false)
  assert.equal(result.aktiv, false)
})
