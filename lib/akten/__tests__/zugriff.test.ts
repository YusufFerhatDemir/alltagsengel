// ═══════════════════════════════════════════════════════════════
// Tests: Zugriffs-Audit — append-only Vertrag der Modul-API
//
// Die eigentliche Unveränderlichkeit wird durch den DB-Trigger
// `prevent_modify_akten_audit` erzwungen (siehe Migration). Hier wird
// geprüft, dass das Modul selbst niemals update()/delete() aufruft
// und insert() mit der erwarteten Nutzlast füttert.
// ═══════════════════════════════════════════════════════════════

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { logAktenZugriff, listAktenZugriffLog } from '../zugriff-log'

function makeInsertOnlyMock() {
  const calls: Array<{ table: string; payload: unknown }> = []
  const supabase = {
    from(table: string) {
      return {
        insert(payload: unknown) {
          calls.push({ table, payload })
          return Promise.resolve({ error: null })
        },
        // Bewusst KEIN update()/delete() auf diesem Mock — ein Aufruf
        // würde mit "is not a function" fehlschlagen und den Test
        // rot werden lassen, falls das Modul es je versuchen würde.
      }
    },
  }
  return { supabase, calls }
}

test('logAktenZugriff schreibt genau einen insert() in akten_zugriff_log', async () => {
  const { supabase, calls } = makeInsertOnlyMock()

  await logAktenZugriff(supabase as any, {
    organizationId: 'org-1',
    entitaetTyp: 'dokument',
    entitaetId: 'dok-1',
    aktion: 'angesehen',
    benutzerId: 'user-1',
    benutzerRolle: 'admin',
    dokumentId: 'dok-1',
  })

  assert.equal(calls.length, 1)
  assert.equal(calls[0].table, 'akten_zugriff_log')
  assert.deepEqual(calls[0].payload, {
    organization_id: 'org-1',
    dokument_id: 'dok-1',
    vertrag_id: null,
    entitaet_typ: 'dokument',
    entitaet_id: 'dok-1',
    aktion: 'angesehen',
    benutzer_id: 'user-1',
    benutzer_rolle: 'admin',
    details: null,
  })
})

test('logAktenZugriff wirft mit lesbarer Meldung, wenn insert() fehlschlägt', async () => {
  const supabase = {
    from() {
      return { insert: () => Promise.resolve({ error: { message: 'db down' } }) }
    },
  }

  await assert.rejects(
    () => logAktenZugriff(supabase as any, {
      organizationId: 'org-1', entitaetTyp: 'vertrag', entitaetId: 'v-1',
      aktion: 'unterschrieben', benutzerId: 'user-1',
    }),
    /Zugriffs-Log konnte nicht geschrieben werden: db down/
  )
})

test('listAktenZugriffLog filtert nach organizationId und wendet optionale Filter an', async () => {
  const eqCalls: Array<[string, unknown]> = []
  const chain: any = {
    eq(col: string, val: unknown) { eqCalls.push([col, val]); return chain },
    order() { return chain },
    limit() { return chain },
    then(resolve: any) { resolve({ data: [], error: null }) },
  }
  const supabase = { from: () => ({ select: () => chain }) }

  await listAktenZugriffLog(supabase as any, {
    organizationId: 'org-1',
    entitaetTyp: 'dokument',
    entitaetId: 'dok-1',
    benutzerId: 'user-1',
  })

  assert.deepEqual(eqCalls, [
    ['organization_id', 'org-1'],
    ['entitaet_typ', 'dokument'],
    ['entitaet_id', 'dok-1'],
    ['benutzer_id', 'user-1'],
  ])
})
