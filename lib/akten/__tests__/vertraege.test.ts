// ═══════════════════════════════════════════════════════════════
// Tests: Vertrags-Statusmaschine + Unterschrift-Sperre — node:test
// ═══════════════════════════════════════════════════════════════

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createVertrag, validateVertragsUebergang } from '../vertraege'
import type { VertragsStatus } from '../types'

test('erlaubte Übergänge werfen nicht', () => {
  const erlaubt: Array<[VertragsStatus, VertragsStatus]> = [
    ['entwurf', 'versendet'],
    ['entwurf', 'storniert'],
    ['versendet', 'unterschrieben'],
    ['versendet', 'entwurf'],
    ['unterschrieben', 'aktiv'],
    ['unterschrieben', 'gekuendigt'],
    ['aktiv', 'gekuendigt'],
    ['aktiv', 'beendet'],
    ['gekuendigt', 'beendet'],
  ]
  for (const [von, nach] of erlaubt) {
    assert.doesNotThrow(() => validateVertragsUebergang(von, nach), `${von} → ${nach} sollte erlaubt sein`)
  }
})

test('gleicher Status → Status (No-Op) ist immer erlaubt', () => {
  const alle: VertragsStatus[] = ['entwurf', 'versendet', 'unterschrieben', 'aktiv', 'gekuendigt', 'beendet', 'storniert']
  for (const s of alle) assert.doesNotThrow(() => validateVertragsUebergang(s, s))
})

test('unerlaubte Übergänge werfen', () => {
  const verboten: Array<[VertragsStatus, VertragsStatus]> = [
    ['entwurf', 'aktiv'],
    ['entwurf', 'unterschrieben'],
    ['beendet', 'aktiv'],
    ['storniert', 'entwurf'],
    ['aktiv', 'entwurf'],
    ['gekuendigt', 'aktiv'],
  ]
  for (const [von, nach] of verboten) {
    assert.throws(() => validateVertragsUebergang(von, nach), /nicht erlaubt/, `${von} → ${nach} sollte verboten sein`)
  }
})

test('Terminal-Status (beendet, storniert) haben keine Folge-Übergänge', () => {
  assert.deepEqual(
    ['beendet', 'storniert'].every(s => {
      try { validateVertragsUebergang(s as VertragsStatus, 'aktiv'); return false } catch { return true }
    }),
    true
  )
})

test('createVertrag lehnt gleichzeitige Kunde+Mitarbeiter-Zuordnung ab, ohne die DB anzufassen', async () => {
  const dbWasCalled = { value: false }
  const stubSupabase = {
    from() { dbWasCalled.value = true; throw new Error('DB darf hier nicht erreicht werden') },
  } as any

  await assert.rejects(
    () => createVertrag(stubSupabase, {
      organizationId: 'org-1',
      clientId: 'client-1',
      caregiverId: 'caregiver-1',
      titel: 'Test-Vertrag',
      vertragstyp: 'dienstleistungsvertrag',
      erstelltVon: 'user-1',
    }),
    /nicht gleichzeitig Kunde und Mitarbeiter/
  )
  assert.equal(dbWasCalled.value, false)
})
