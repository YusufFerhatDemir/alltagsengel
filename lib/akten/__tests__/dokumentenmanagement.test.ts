// ═══════════════════════════════════════════════════════════════
// Tests: Dokumentenmanagement — node:test (analog lib/hessen-plz.test.ts)
// Ausführen: npm run test:unit
//
// Getestet werden die reinen Funktionen (SHA-256, Bucket-Auswahl) und
// die Validierung, die VOR jedem DB-Zugriff greift (Zuordnungs-Regel:
// nie Kunde UND Mitarbeiter gleichzeitig). DB-CRUD selbst ist über
// die RLS-/Trigger-Regeln in der Migration abgesichert und wird hier
// nicht gegen eine echte Postgres-Instanz getestet.
// ═══════════════════════════════════════════════════════════════

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeSha256Hex, createDokument, updateDokument } from '../dokumente'
import { bucketForZuordnung } from '../types'
import { erstelleFakeSupabase, type FakeAufruf } from '@/__tests__/helpers/supabase-fake'

test('computeSha256Hex liefert den korrekten SHA-256-Hex-Digest', async () => {
  // sha256("hallo") — via `python3 -c "import hashlib;print(hashlib.sha256(b'hallo').hexdigest())"` verifiziert
  const data = new TextEncoder().encode('hallo').buffer
  const hash = await computeSha256Hex(data)
  assert.equal(hash, 'd3751d33f9cd5049c4af2b462735457e4d3baf130bcbb87f389e349fbaeb20b9')
})

test('computeSha256Hex liefert für leeren Input den bekannten Leer-Hash', async () => {
  const hash = await computeSha256Hex(new ArrayBuffer(0))
  assert.equal(hash, 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
})

test('bucketForZuordnung: Kunde → kunden-dokumente', () => {
  assert.equal(bucketForZuordnung('client-1', null), 'kunden-dokumente')
})

test('bucketForZuordnung: Mitarbeiter → mitarbeiter-dokumente', () => {
  assert.equal(bucketForZuordnung(null, 'caregiver-1'), 'mitarbeiter-dokumente')
})

test('bucketForZuordnung: weder Kunde noch Mitarbeiter → documents (Org-Dokument)', () => {
  assert.equal(bucketForZuordnung(null, null), 'documents')
})

test('createDokument lehnt gleichzeitige Kunde+Mitarbeiter-Zuordnung ab, ohne die DB anzufassen', async () => {
  const dbWasCalled = { value: false }
  const stubSupabase = {
    from() { dbWasCalled.value = true; throw new Error('DB darf hier nicht erreicht werden') },
  } as any

  await assert.rejects(
    () => createDokument(stubSupabase, {
      organizationId: 'org-1',
      clientId: 'client-1',
      caregiverId: 'caregiver-1',
      titel: 'Test',
      dokumentTyp: 'sonstiges',
      datei: { bucket: 'documents', dateipfad: 'x', dateiname: 'x.pdf', dateigroesseBytes: 1, mimeType: 'application/pdf', sha256Hash: 'abc' },
      erstelltVon: 'user-1',
    }),
    /nicht gleichzeitig Kunde und Mitarbeiter/
  )
  assert.equal(dbWasCalled.value, false)
})

test('createDokument weist einen unbekannten dokumentTyp zurück, ohne die DB anzufassen', async () => {
  const dbWasCalled = { value: false }
  const stubSupabase = {
    from() { dbWasCalled.value = true; throw new Error('DB darf hier nicht erreicht werden') },
  } as any

  await assert.rejects(
    () => createDokument(stubSupabase, {
      organizationId: 'org-1',
      titel: 'Test',
      dokumentTyp: 'nicht_existent' as any,
      datei: { bucket: 'documents', dateipfad: 'x', dateiname: 'x.pdf', dateigroesseBytes: 1, mimeType: 'application/pdf', sha256Hash: 'abc' },
      erstelltVon: 'user-1',
    }),
    /Ungültiger Wert für dokumentTyp/
  )
  assert.equal(dbWasCalled.value, false)
})

test('createDokument weist eine unbekannte kategorie zurück, ohne die DB anzufassen', async () => {
  const dbWasCalled = { value: false }
  const stubSupabase = {
    from() { dbWasCalled.value = true; throw new Error('DB darf hier nicht erreicht werden') },
  } as any

  await assert.rejects(
    () => createDokument(stubSupabase, {
      organizationId: 'org-1',
      titel: 'Test',
      dokumentTyp: 'sonstiges',
      kategorie: 'erfunden' as any,
      datei: { bucket: 'documents', dateipfad: 'x', dateiname: 'x.pdf', dateigroesseBytes: 1, mimeType: 'application/pdf', sha256Hash: 'abc' },
      erstelltVon: 'user-1',
    }),
    /Ungültiger Wert für kategorie/
  )
  assert.equal(dbWasCalled.value, false)
})

test('updateDokument weist einen unbekannten status zurück, ohne ihn zu schreiben', async () => {
  const bestehend = {
    id: 'dok-1', organization_id: 'org-1', gesperrt: false,
    dokument_typ: 'sonstiges', kategorie: 'allgemein', status: 'entwurf', sichtbarkeit: 'intern',
  }
  const f = erstelleFakeSupabase((a: FakeAufruf) => {
    if (a.tabelle === 'akten_dokumente' && a.operation === 'select') return { data: bestehend }
    return { data: null }
  })

  await assert.rejects(
    () => updateDokument(f.client, 'dok-1', 'org-1', { status: 'erfunden' as any }, 'user-1'),
    /Ungültiger Wert für status/
  )
  assert.equal(f.auf('akten_dokumente').filter(a => a.operation === 'update').length, 0, 'update() darf bei ungültigem Wert nie aufgerufen werden')
})
