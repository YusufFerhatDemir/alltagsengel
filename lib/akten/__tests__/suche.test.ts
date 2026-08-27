// ═══════════════════════════════════════════════════════════════
// Tests: Globale Dokumentensuche (lib/akten/suche.ts)
//
// Der Freitext-Suchbegriff landet ungeprüft in einem PostgREST
// `.or(...)`-Filterstring. Ohne Quotierung kann ein Suchbegriff mit Komma
// oder Klammern zusätzliche OR-Bedingungen einschleusen (z. B. eine
// zweite Bedingung, die alle Organisationen statt nur die eigene trifft).
// `postgrestWert()` (aus dokumente.ts, siehe dessen Kommentar zu genau
// diesem Bug) kapselt den Wert in Anführungszeichen — dieser Test prüft,
// dass suche.ts diese Kapselung tatsächlich benutzt, statt eigenständig
// nur Komma/Prozent zu entfernen.
//
// Läuft mit: npm run test:unit (node:test).
// ═══════════════════════════════════════════════════════════════

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sucheDokumente } from '../suche'
import { erstelleFakeSupabase, hatFilter, hatOrgFence, type FakeAufruf } from '@/__tests__/helpers/supabase-fake'

const ORG = '00000000-0000-4000-8000-000460629986'

function fakeMitZeilen(zeilen: unknown[] = []) {
  return erstelleFakeSupabase((a: FakeAufruf) => {
    if (a.tabelle === 'akten_dokumente') return { data: zeilen }
    return { data: null }
  })
}

test('sucheDokumente fenct auf organization_id und blendet gelöschte Dokumente aus', async () => {
  const f = fakeMitZeilen()
  await sucheDokumente(f.client, { organizationId: ORG })

  const aufruf = f.ersterAuf('akten_dokumente')
  assert.ok(hatOrgFence(aufruf, ORG))
  assert.ok(hatFilter(aufruf, 'is', 'deleted_at', null))
})

test('sucheDokumente quotiert den Suchbegriff wie postgrestWert (kein rohes Komma/Klammer-Escaping)', async () => {
  const f = fakeMitZeilen()
  await sucheDokumente(f.client, { organizationId: ORG, suchtext: 'Müller, Test) or (1=1' })

  const aufruf = f.ersterAuf('akten_dokumente')
  const orFilter = aufruf!.filter.find(x => x.methode === 'or')
  assert.ok(orFilter, '.or()-Filter muss gesetzt sein')
  // postgrestWert() kapselt den GESAMTEN maskierten Wert in Anführungszeichen —
  // das Komma und die Klammern bleiben Teil EINES gequoteten Werts, statt als
  // PostgREST-Syntax (weitere OR-Klauseln) interpretiert zu werden.
  assert.equal(
    orFilter!.spalte,
    'titel.ilike."%Müller, Test) or (1=1%",dateiname.ilike."%Müller, Test) or (1=1%",interne_bemerkung.ilike."%Müller, Test) or (1=1%"'
  )
})

test('sucheDokumente maskiert Anführungszeichen und Backslashes im Suchbegriff', async () => {
  const f = fakeMitZeilen()
  await sucheDokumente(f.client, { organizationId: ORG, suchtext: 'a"b\\c' })

  const aufruf = f.ersterAuf('akten_dokumente')
  const orFilter = aufruf!.filter.find(x => x.methode === 'or')
  assert.equal(orFilter!.spalte, 'titel.ilike."%a\\"b\\\\c%",dateiname.ilike."%a\\"b\\\\c%",interne_bemerkung.ilike."%a\\"b\\\\c%"')
})

test('sucheDokumente wendet clientId/caregiverId/dokumentTyp/kategorie/status als eq-Filter an', async () => {
  const f = fakeMitZeilen()
  await sucheDokumente(f.client, {
    organizationId: ORG,
    clientId: 'client-1',
    caregiverId: 'caregiver-1',
    dokumentTyp: 'vertrag',
    kategorie: 'pflege',
    status: 'aktiv',
  })

  const aufruf = f.ersterAuf('akten_dokumente')
  assert.ok(hatFilter(aufruf, 'eq', 'client_id', 'client-1'))
  assert.ok(hatFilter(aufruf, 'eq', 'caregiver_id', 'caregiver-1'))
  assert.ok(hatFilter(aufruf, 'eq', 'dokument_typ', 'vertrag'))
  assert.ok(hatFilter(aufruf, 'eq', 'kategorie', 'pflege'))
  assert.ok(hatFilter(aufruf, 'eq', 'status', 'aktiv'))
})

test('sucheDokumente löst client_name/caregiver_name aus den eingebetteten Ressourcen auf', async () => {
  const f = fakeMitZeilen([
    {
      id: 'd-1', clients: { first_name: 'Anna', last_name: 'Muster' }, caregivers: null,
    },
    {
      id: 'd-2', clients: null, caregivers: { first_name: 'Ben', last_name: 'Engel' },
    },
  ])

  const treffer = await sucheDokumente(f.client, { organizationId: ORG })

  assert.equal(treffer[0].client_name, 'Anna Muster')
  assert.equal(treffer[0].caregiver_name, null)
  assert.equal(treffer[1].client_name, null)
  assert.equal(treffer[1].caregiver_name, 'Ben Engel')
})

test('sucheDokumente wirft bei einem Datenbankfehler', async () => {
  const f = erstelleFakeSupabase(() => ({ data: null, error: { message: 'Verbindung fehlgeschlagen' } }))
  await assert.rejects(
    () => sucheDokumente(f.client, { organizationId: ORG }),
    /Suche fehlgeschlagen: Verbindung fehlgeschlagen/
  )
})
