// ═══════════════════════════════════════════════════════════════
// Tests: Pflegedoku-Audit — logPflegeAktivitaet/listPflegeAuditLog
// Ausführen: npm run test:unit
// ═══════════════════════════════════════════════════════════════

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { listPflegeAuditLog, logPflegeAktivitaet } from '../audit-log'

function auditClient() {
  const inserts: Array<{ tabelle: string; payload: Record<string, unknown> }> = []
  const supabase = {
    from(tabelle: string) {
      return {
        insert(payload: Record<string, unknown>) {
          inserts.push({ tabelle, payload })
          return { select: () => ({ single: async () => ({ data: { id: 'log-1', ...payload }, error: null }) }) }
        },
        select: () => {
          const kette: any = {
            eq: () => kette,
            order: () => kette,
            limit: () => kette,
            range: () => kette,
            then: (resolve: (v: unknown) => void) => resolve({ data: [], error: null }),
          }
          return kette
        },
      }
    },
  }
  return { supabase: supabase as never, inserts }
}

test('logPflegeAktivitaet schreibt in pflege_audit_log mit allen Feldern', async () => {
  const { supabase, inserts } = auditClient()

  await logPflegeAktivitaet(supabase, {
    organizationId: 'org-1',
    entitaetTyp: 'risiko',
    entitaetId: 'r-1',
    aktion: 'erstellt',
    vorher: null,
    nachher: { bezeichnung: 'Sturzrisiko' },
    akteurId: 'user-1',
  })

  assert.equal(inserts.length, 1)
  assert.equal(inserts[0].tabelle, 'pflege_audit_log')
  assert.deepEqual(inserts[0].payload, {
    organization_id: 'org-1',
    entitaet_typ: 'risiko',
    entitaet_id: 'r-1',
    aktion: 'erstellt',
    vorher: null,
    nachher: { bezeichnung: 'Sturzrisiko' },
    akteur_id: 'user-1',
    ip_adresse: null,
  })
})

test('logPflegeAktivitaet setzt vorher/nachher/akteurId standardmäßig auf null, wenn nicht übergeben', async () => {
  const { supabase, inserts } = auditClient()

  await logPflegeAktivitaet(supabase, {
    organizationId: 'org-1',
    entitaetTyp: 'verlauf',
    entitaetId: 'v-1',
    aktion: 'aktualisiert',
  })

  assert.equal(inserts[0].payload.vorher, null)
  assert.equal(inserts[0].payload.nachher, null)
  assert.equal(inserts[0].payload.akteur_id, null)
  assert.equal(inserts[0].payload.ip_adresse, null)
})

test('logPflegeAktivitaet wirft mit lesbarer Meldung, wenn der Insert fehlschlägt', async () => {
  const supabase = {
    from: () => ({
      insert: () => ({ select: () => ({ single: async () => ({ data: null, error: { message: 'db down' } }) }) }),
    }),
  }

  await assert.rejects(
    () => logPflegeAktivitaet(supabase as never, {
      organizationId: 'org-1', entitaetTyp: 'aufnahme', entitaetId: 'a-1', aktion: 'erstellt',
    }),
    /Pflegedoku-Aktivität konnte nicht protokolliert werden: db down/
  )
})

test('listPflegeAuditLog filtert nach Entität und Akteur', async () => {
  const aufrufe: Array<{ methode: string; args: unknown[] }> = []
  const supabase = {
    from: () => {
      const kette: any = {
        select: () => kette,
        eq: (...args: unknown[]) => { aufrufe.push({ methode: 'eq', args }); return kette },
        order: () => kette,
        limit: (...args: unknown[]) => { aufrufe.push({ methode: 'limit', args }); return kette },
        then: (resolve: (v: unknown) => void) => resolve({ data: [{ id: 'log-1' }], error: null }),
      }
      return kette
    },
  }

  const ergebnis = await listPflegeAuditLog(supabase as never, {
    organizationId: 'org-1', entitaetTyp: 'diagnose', entitaetId: 'd-1', akteurId: 'user-1', limit: 10,
  })

  assert.equal(ergebnis.length, 1)
  const eqFelder = aufrufe.filter(a => a.methode === 'eq').map(a => a.args[0])
  assert.deepEqual(eqFelder, ['organization_id', 'entitaet_typ', 'entitaet_id', 'akteur_id'])
})
