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

test('createAufnahme setzt die Vorgabewerte für Ort und Dringlichkeit', async () => {
  const inserts: Array<Record<string, unknown>> = []
  const supabase = {
    from: () => ({
      insert(payload: Record<string, unknown>) {
        inserts.push(payload)
        return { select: () => ({ single: async () => ({ data: { id: 'a-1', ...payload }, error: null }) }) }
      },
    }),
  }

  await createAufnahme(supabase as never, {
    organizationId: 'org-1', clientId: 'client-1', aufgenommenVon: 'user-1', erstelltVon: 'user-1',
  })

  assert.equal(inserts.length, 1)
  assert.equal(inserts[0].aufnahme_ort, 'wohnung')
  assert.equal(inserts[0].dringlichkeit, 'normal')
  assert.equal(inserts[0].organization_id, 'org-1')
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

test('updateAufnahme protokolliert den Abschluss und spiegelt die Stammdaten', async () => {
  const updates: Array<{ tabelle: string; payload: Record<string, unknown> }> = []
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
})
