// ═══════════════════════════════════════════════════════════════
// Tests: Verlaufsdokumentation — Sichtbarkeit, Sperre, Gruppierung
// Ausführen: npm run test:unit
// ═══════════════════════════════════════════════════════════════

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  createVerlauf, erlaubteSichtbarkeiten, gruppiereNachTag, updateVerlauf, validateSichtbarkeit,
} from '../verlauf'
import type { PflegeVerlaufEintrag } from '../types'

function insertClient() {
  const inserts: Array<Record<string, unknown>> = []
  const supabase = {
    from: () => ({
      insert(payload: Record<string, unknown>) {
        inserts.push(payload)
        return { select: () => ({ single: async () => ({ data: { id: 'v-1', ...payload }, error: null }) }) }
      },
    }),
  }
  return { supabase: supabase as never, inserts }
}

function leseClient(eintrag: Record<string, unknown>) {
  const updates: Array<Record<string, unknown>> = []
  const supabase = {
    from: () => ({
      select: () => ({
        eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: eintrag, error: null }) }) }),
      }),
      update(payload: Record<string, unknown>) {
        updates.push(payload)
        const kette: any = {
          eq: () => kette,
          select: () => ({ single: async () => ({ data: { ...eintrag, ...payload }, error: null }) }),
        }
        return kette
      },
    }),
  }
  return { supabase: supabase as never, updates }
}

test('erlaubteSichtbarkeiten gibt Admins alle, Engeln nur die internen Stufen', () => {
  assert.deepEqual(erlaubteSichtbarkeiten('admin'), ['intern', 'engel', 'kunde', 'alle'])
  assert.deepEqual(erlaubteSichtbarkeiten('superadmin'), ['intern', 'engel', 'kunde', 'alle'])
  assert.deepEqual(erlaubteSichtbarkeiten('engel'), ['intern', 'engel'])
})

test('validateSichtbarkeit lässt Engel nicht direkt an den Kunden freigeben', () => {
  assert.doesNotThrow(() => validateSichtbarkeit('engel', 'engel'))
  assert.doesNotThrow(() => validateSichtbarkeit('intern', 'engel'))
  assert.throws(() => validateSichtbarkeit('kunde', 'engel'), /darf mit der Rolle "engel" nicht gesetzt werden/)
  assert.throws(() => validateSichtbarkeit('alle', 'engel'), /darf mit der Rolle "engel" nicht gesetzt werden/)
  assert.doesNotThrow(() => validateSichtbarkeit('kunde', 'admin'))
})

test('validateSichtbarkeit weist unbekannte Stufen ab', () => {
  assert.throws(
    () => validateSichtbarkeit('oeffentlich' as never, 'admin'),
    /Ungültiger Wert "oeffentlich" für sichtbarkeit/
  )
})

test('createVerlauf erzwingt Dringlichkeit bei Sturz und Notfall', async () => {
  for (const typ of ['sturz', 'notfall'] as const) {
    const { supabase, inserts } = insertClient()
    await createVerlauf(supabase, {
      organizationId: 'org-1', clientId: 'client-1', inhalt: 'Ereignis dokumentiert',
      eintragTyp: typ, istDringend: false,
      autorId: 'user-1', autorName: 'Alltagsengel', autorRolle: 'engel',
    })
    assert.equal(inserts[0].ist_dringend, true, `${typ} muss als dringend gespeichert werden`)
  }
})

test('createVerlauf übernimmt das Dringlichkeitsflag bei normalen Einträgen unverändert', async () => {
  const { supabase, inserts } = insertClient()
  await createVerlauf(supabase, {
    organizationId: 'org-1', clientId: 'client-1', inhalt: 'Alles ruhig',
    eintragTyp: 'beobachtung', istDringend: false,
    autorId: 'user-1', autorName: 'Alltagsengel', autorRolle: 'engel',
  })
  assert.equal(inserts[0].ist_dringend, false)
  assert.equal(inserts[0].sichtbarkeit, 'intern')
})

test('createVerlauf lässt organization_id weg, wenn keine übergeben wird', async () => {
  const { supabase, inserts } = insertClient()
  await createVerlauf(supabase, {
    clientId: 'client-1', inhalt: 'Über den user-scoped Client geschrieben',
    autorId: 'user-1', autorName: 'Alltagsengel', autorRolle: 'engel',
  })
  // Ohne Spalte greift der DB-Default current_org_id().
  assert.equal('organization_id' in inserts[0], false)
})

test('createVerlauf verlangt Inhalt und prüft die Aufzählungen vor dem DB-Zugriff', async () => {
  let dbAufgerufen = false
  const supabase = { from() { dbAufgerufen = true; return {} as never } }
  const basis = {
    organizationId: 'org-1', clientId: 'client-1',
    autorId: 'user-1', autorName: 'Alltagsengel', autorRolle: 'admin',
  }

  await assert.rejects(
    () => createVerlauf(supabase as never, { ...basis, inhalt: '   ' }),
    /Inhalt ist ein Pflichtfeld/
  )
  await assert.rejects(
    () => createVerlauf(supabase as never, { ...basis, inhalt: 'Text', eintragTyp: 'plausch' as never }),
    /Ungültiger Wert "plausch" für eintrag_typ/
  )
  await assert.rejects(
    () => createVerlauf(supabase as never, { ...basis, inhalt: 'Text', kategorie: 'wetter' as never }),
    /Ungültiger Wert "wetter" für kategorie/
  )
  assert.equal(dbAufgerufen, false)
})

test('updateVerlauf blockt gesperrte Einträge mit Hinweis auf die Periode', async () => {
  const { supabase } = leseClient({ id: 'v-1', gesperrt: true, inhalt: 'alt' })
  await assert.rejects(
    () => updateVerlauf(supabase, 'v-1', 'org-1', { inhalt: 'neu' }, 'admin'),
    /Erst Dokumentationsperiode wiedereröffnen/
  )
})

test('updateVerlauf setzt nur die übergebenen Felder', async () => {
  const { supabase, updates } = leseClient({ id: 'v-1', gesperrt: false, inhalt: 'alt' })
  await updateVerlauf(supabase, 'v-1', 'org-1', { inhalt: '  neuer Text  ' }, 'admin')
  assert.deepEqual(updates[0], { inhalt: 'neuer Text' })
})

test('updateVerlauf lehnt eine leere Änderung ab', async () => {
  const { supabase } = leseClient({ id: 'v-1', gesperrt: false, inhalt: 'alt' })
  await assert.rejects(
    () => updateVerlauf(supabase, 'v-1', 'org-1', {}, 'admin'),
    /Keine Änderungen übergeben/
  )
})

test('gruppiereNachTag bündelt je Kalendertag und sortiert absteigend', () => {
  const eintraege = [
    { id: '1', eintrag_datum: '2026-08-07T09:00:00.000Z' },
    { id: '2', eintrag_datum: '2026-08-07T17:30:00.000Z' },
    { id: '3', eintrag_datum: '2026-08-05T08:00:00.000Z' },
  ] as PflegeVerlaufEintrag[]

  const gruppen = gruppiereNachTag(eintraege)
  assert.deepEqual(gruppen.map(g => g.tag), ['2026-08-07', '2026-08-05'])
  assert.equal(gruppen[0].eintraege.length, 2)
  assert.equal(gruppen[1].eintraege.length, 1)
})
