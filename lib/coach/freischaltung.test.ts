// PflegeCoach Freischaltcodes — node:test
// Ausführen: npx tsx --test lib/coach/freischaltung.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  codePraefix, erzeugeCode, hashCode, istCodeFormatGueltig,
  istFreigeschaltet, normalisiereCode, pruefeCodeGueltigkeit,
} from './freischaltung'

test('erzeugeCode: Format XXXX-XXXX-XXXX ohne verwechselbare Zeichen', () => {
  for (let i = 0; i < 200; i++) {
    const code = erzeugeCode()
    assert.match(code, /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/)
    assert.ok(!/[01ILO]/.test(code), `verwechselbares Zeichen in ${code}`)
  }
})

test('erzeugeCode: keine Wiederholungen in einer kleinen Stichprobe', () => {
  const codes = new Set(Array.from({ length: 500 }, () => erzeugeCode()))
  assert.equal(codes.size, 500)
})

test('normalisiereCode: Schreibweise und Bindestriche sind egal', () => {
  assert.equal(normalisiereCode('abcd-efgh-jkmn'), 'ABCDEFGHJKMN')
  assert.equal(normalisiereCode('  ABCD EFGH JKMN '), 'ABCDEFGHJKMN')
  assert.equal(normalisiereCode('AbCd-EfGh-JkMn'), 'ABCDEFGHJKMN')
})

test('hashCode: gleicher Code → gleicher Hash, egal wie eingegeben', () => {
  const code = erzeugeCode()
  assert.equal(hashCode(code), hashCode(code.toLowerCase()))
  assert.equal(hashCode(code), hashCode(code.replace(/-/g, ' ')))
})

test('hashCode: unterschiedliche Codes → unterschiedliche Hashes, kein Klartext', () => {
  const a = erzeugeCode()
  const b = erzeugeCode()
  assert.notEqual(hashCode(a), hashCode(b))
  assert.match(hashCode(a), /^[0-9a-f]{64}$/)
  assert.ok(!hashCode(a).includes(normalisiereCode(a)))
})

test('codePraefix: erste vier Zeichen', () => {
  assert.equal(codePraefix('ABCD-EFGH-JKMN'), 'ABCD')
})

test('istCodeFormatGueltig: nur vollständige Codes', () => {
  assert.equal(istCodeFormatGueltig('ABCD-EFGH-JKMN'), true)
  assert.equal(istCodeFormatGueltig('abcdefghjkmn'), true)
  assert.equal(istCodeFormatGueltig('ABCD-EFGH'), false)
  assert.equal(istCodeFormatGueltig(''), false)
  assert.equal(istCodeFormatGueltig('ABCD-EFGH-JK!N'), false)
})

test('pruefeCodeGueltigkeit: eingelöst, storniert und abgelaufen werden abgewiesen', () => {
  const basis = { gueltig_von: '2026-01-01', gueltig_bis: null, heute: '2026-08-12' }
  assert.equal(pruefeCodeGueltigkeit({ ...basis, status: 'eingeloest' }).gueltig, false)
  assert.equal(pruefeCodeGueltigkeit({ ...basis, status: 'storniert' }).gueltig, false)
  assert.equal(pruefeCodeGueltigkeit({ ...basis, status: 'abgelaufen' }).gueltig, false)
  assert.equal(pruefeCodeGueltigkeit({ ...basis, status: 'ausgegeben' }).gueltig, true)
})

test('pruefeCodeGueltigkeit: Zeitfenster wird beidseitig geprüft', () => {
  const basis = { status: 'ausgegeben' as const, heute: '2026-08-12' }
  assert.equal(
    pruefeCodeGueltigkeit({ ...basis, gueltig_von: '2026-09-01', gueltig_bis: null }).gueltig,
    false
  )
  assert.equal(
    pruefeCodeGueltigkeit({ ...basis, gueltig_von: '2026-01-01', gueltig_bis: '2026-08-11' }).gueltig,
    false
  )
  // Randtag zählt noch als gültig.
  assert.equal(
    pruefeCodeGueltigkeit({ ...basis, gueltig_von: '2026-08-12', gueltig_bis: '2026-08-12' }).gueltig,
    true
  )
})

test('istFreigeschaltet: eine aktive, zeitlich gültige Zeile genügt', () => {
  const heute = '2026-08-12'
  assert.equal(istFreigeschaltet([], heute), false)
  assert.equal(
    istFreigeschaltet([{ status: 'widerrufen', gueltig_von: '2026-01-01', gueltig_bis: null }], heute),
    false
  )
  assert.equal(
    istFreigeschaltet([{ status: 'aktiv', gueltig_von: '2026-01-01', gueltig_bis: '2026-08-11' }], heute),
    false
  )
  assert.equal(
    istFreigeschaltet([{ status: 'aktiv', gueltig_von: '2026-09-01', gueltig_bis: null }], heute),
    false
  )
  assert.equal(
    istFreigeschaltet(
      [
        { status: 'abgelaufen', gueltig_von: '2025-01-01', gueltig_bis: '2025-12-31' },
        { status: 'aktiv', gueltig_von: '2026-01-01', gueltig_bis: null },
      ],
      heute
    ),
    true
  )
})
