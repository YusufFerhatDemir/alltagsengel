// ═══════════════════════════════════════════════════════════════
// Tests: Kundenaufnahme — Statusmaschine + Validierung vor DB-Zugriff
// Ausführen: npm run test:unit
// ═══════════════════════════════════════════════════════════════

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createAufnahme, updateAufnahme, validateAufnahmeUebergang } from '../aufnahmen'
import type { AufnahmeStatus } from '../types'

test('validateAufnahmeUebergang lässt die vorgesehenen Wege zu', () => {
  const erlaubt: Array<[AufnahmeStatus, AufnahmeStatus]> = [
    ['entwurf', 'in_bearbeitung'],
    ['entwurf', 'abgeschlossen'],
    ['entwurf', 'storniert'],
    ['in_bearbeitung', 'abgeschlossen'],
    ['in_bearbeitung', 'entwurf'],
    ['in_bearbeitung', 'storniert'],
  ]
  for (const [von, nach] of erlaubt) {
    assert.doesNotThrow(() => validateAufnahmeUebergang(von, nach), `${von} → ${nach} sollte erlaubt sein`)
  }
})

test('validateAufnahmeUebergang blockt Rückwege aus Endzuständen', () => {
  const verboten: Array<[AufnahmeStatus, AufnahmeStatus]> = [
    ['abgeschlossen', 'entwurf'],
    ['abgeschlossen', 'in_bearbeitung'],
    ['abgeschlossen', 'storniert'],
    ['storniert', 'entwurf'],
    ['storniert', 'abgeschlossen'],
  ]
  for (const [von, nach] of verboten) {
    assert.throws(
      () => validateAufnahmeUebergang(von, nach),
      /ist nicht erlaubt/,
      `${von} → ${nach} sollte blockiert sein`
    )
  }
})

test('validateAufnahmeUebergang akzeptiert den Nicht-Wechsel auf sich selbst', () => {
  for (const s of ['entwurf', 'in_bearbeitung', 'abgeschlossen', 'storniert'] as AufnahmeStatus[]) {
    assert.doesNotThrow(() => validateAufnahmeUebergang(s, s))
  }
})

test('createAufnahme lehnt ungültige Werte ab, bevor die DB angefragt wird', async () => {
  let dbAufgerufen = false
  const supabase = { from() { dbAufgerufen = true; return {} as never } }
  const basis = { organizationId: 'org-1', clientId: 'client-1', aufgenommenVon: 'user-1', erstelltVon: 'user-1' }

  await assert.rejects(
    () => createAufnahme(supabase as never, { ...basis, aufnahmeOrt: 'garten' as never }),
    /Ungültiger Wert "garten" für aufnahme_ort/
  )
  await assert.rejects(
    () => createAufnahme(supabase as never, { ...basis, dringlichkeit: 'sofort' as never }),
    /Ungültiger Wert "sofort" für dringlichkeit/
  )
  await assert.rejects(
    () => createAufnahme(supabase as never, { ...basis, pflegegradBeiAufnahme: 7 }),
    /Pflegegrad muss zwischen 0 und 5 liegen/
  )
  assert.equal(dbAufgerufen, false, 'Bei Validierungsfehlern darf kein DB-Zugriff erfolgen')
})

test('createAufnahme setzt die Vorgabewerte für Ort und Dringlichkeit und protokolliert die Erstellung', async () => {
  const inserts: Array<{ tabelle: string; payload: Record<string, unknown> }> = []
  const supabase = {
    from: (tabelle: string) => ({
      // select(): seit Track 10 prueft createAufnahme die Urheberschaft
      // (aufgenommen_von) ueber assertBenutzerInOrg — organization_members,
      // caregivers, clients, je .eq().eq().limit(1).maybeSingle().
      // 'user-1' gehoert hier zur Organisation.
      select() {
        const kette: any = {
          eq: () => kette,
          limit: () => kette,
          maybeSingle: async () => ({ data: { user_id: 'user-1' }, error: null }),
        }
        return kette
      },
      insert(payload: Record<string, unknown>) {
        inserts.push({ tabelle, payload })
        return { select: () => ({ single: async () => ({ data: { id: 'a-1', organization_id: 'org-1', ...payload }, error: null }) }) }
      },
    }),
  }

  await createAufnahme(supabase as never, {
    organizationId: 'org-1', clientId: 'client-1', aufgenommenVon: 'user-1', erstelltVon: 'user-1',
  })

  const aufnahmeInserts = inserts.filter(i => i.tabelle === 'pflege_aufnahmen')
  assert.equal(aufnahmeInserts.length, 1)
  assert.equal(aufnahmeInserts[0].payload.aufnahme_ort, 'wohnung')
  assert.equal(aufnahmeInserts[0].payload.dringlichkeit, 'normal')
  assert.equal(aufnahmeInserts[0].payload.organization_id, 'org-1')

  const logInserts = inserts.filter(i => i.tabelle === 'pflege_audit_log')
  assert.equal(logInserts.length, 1, 'Audit-Log-Eintrag muss geschrieben werden')
  assert.equal(logInserts[0].payload.entitaet_typ, 'aufnahme')
  assert.equal(logInserts[0].payload.aktion, 'erstellt')
  assert.equal(logInserts[0].payload.akteur_id, 'user-1')
})

test('updateAufnahme verweigert Änderungen an abgeschlossenen Aufnahmen', async () => {
  const supabase = {
    from: () => ({
      select: () => ({
        eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'a-1', status: 'abgeschlossen' }, error: null }) }) }),
      }),
    }),
  }

  await assert.rejects(
    () => updateAufnahme(supabase as never, 'a-1', 'org-1', { grundDerAnfrage: 'neu' }, 'user-1'),
    /Aufnahme im Status "abgeschlossen" kann nicht mehr bearbeitet werden/
  )
})

test('updateAufnahme protokolliert den Abschluss, spiegelt die Stammdaten und schreibt einen Audit-Log-Eintrag', async () => {
  const updates: Array<{ tabelle: string; payload: Record<string, unknown> }> = []
  const inserts: Array<{ tabelle: string; payload: Record<string, unknown> }> = []
  const aufnahme = {
    id: 'a-1', status: 'in_bearbeitung', client_id: 'client-1',
    aufnahmedatum: '2026-08-01', aufgenommen_von: 'user-9', betreuungsbedarf: 'Begleitung im Alltag',
  }

  const supabase = {
    from(tabelle: string) {
      return {
        select: () => ({
          eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: aufnahme, error: null }) }) }),
        }),
        update(payload: Record<string, unknown>) {
          updates.push({ tabelle, payload })
          const kette: any = {
            eq: () => kette,
            select: () => ({ single: async () => ({ data: { ...aufnahme, ...payload }, error: null }) }),
            then: (resolve: (v: unknown) => void) => resolve({ error: null }),
          }
          return kette
        },
        insert(payload: Record<string, unknown>) {
          inserts.push({ tabelle, payload })
          return { select: () => ({ single: async () => ({ data: { id: 'log-1', ...payload }, error: null }) }) }
        },
      }
    },
  }

  await updateAufnahme(supabase as never, 'a-1', 'org-1', { status: 'abgeschlossen' }, 'user-1')

  const aufnahmeUpdate = updates.find(u => u.tabelle === 'pflege_aufnahmen')
  assert.ok(aufnahmeUpdate, 'Aufnahme muss aktualisiert werden')
  assert.equal(aufnahmeUpdate!.payload.status, 'abgeschlossen')
  assert.equal(aufnahmeUpdate!.payload.abgeschlossen_von, 'user-1')
  assert.ok(aufnahmeUpdate!.payload.abgeschlossen_am, 'Abschlusszeitpunkt muss gesetzt sein')

  const clientUpdate = updates.find(u => u.tabelle === 'clients')
  assert.ok(clientUpdate, 'Stammdaten müssen gespiegelt werden')
  assert.equal(clientUpdate!.payload.aufnahmestatus, 'vollstaendig')
  assert.equal(clientUpdate!.payload.aufnahmedatum, '2026-08-01')
  assert.equal(clientUpdate!.payload.betreuungsbedarf_beschreibung, 'Begleitung im Alltag')

  const logInsert = inserts.find(i => i.tabelle === 'pflege_audit_log')
  assert.ok(logInsert, 'Audit-Log-Eintrag muss geschrieben werden')
  assert.equal(logInsert!.payload.entitaet_typ, 'aufnahme')
  assert.equal(logInsert!.payload.entitaet_id, 'a-1')
  assert.equal(logInsert!.payload.aktion, 'aktualisiert')
  assert.equal(logInsert!.payload.akteur_id, 'user-1')
  assert.deepEqual(logInsert!.payload.vorher, aufnahme)
})
