import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assertErlaubt, SCHULUNGSART_WERTE, VERTRAGSSTATUS_WERTE, DIENSTPLAN_STATUS_WERTE, DIENSTPLAN_TYP_WERTE, ARBEITSZEIT_QUELLE_WERTE, ARBEITSZEIT_STATUS_WERTE, ABWESENHEIT_STATUS_WERTE, ABWESENHEIT_TYP_WERTE } from '../types'

// ── assertErlaubt ───────────────────────────────────────────────

test('assertErlaubt lässt null/undefined durch', () => {
  assert.doesNotThrow(() => assertErlaubt(null, VERTRAGSSTATUS_WERTE, 'test'))
  assert.doesNotThrow(() => assertErlaubt(undefined, VERTRAGSSTATUS_WERTE, 'test'))
})

test('assertErlaubt lässt gültige Werte durch', () => {
  assert.doesNotThrow(() => assertErlaubt('aktiv', VERTRAGSSTATUS_WERTE, 'vertragsstatus'))
  assert.doesNotThrow(() => assertErlaubt('gekuendigt', VERTRAGSSTATUS_WERTE, 'vertragsstatus'))
  assert.doesNotThrow(() => assertErlaubt('pflichtschulung', SCHULUNGSART_WERTE, 'schulungsart'))
})

test('assertErlaubt wirft bei ungültigen Werten', () => {
  assert.throws(() => assertErlaubt('ungueltig' as any, VERTRAGSSTATUS_WERTE, 'vertragsstatus'), /Ungültiger Wert/)
  assert.throws(() => assertErlaubt('falsch' as any, DIENSTPLAN_STATUS_WERTE, 'status'), /Ungültiger Wert/)
})

// ── Enum-Vollständigkeit ────────────────────────────────────────

test('DIENSTPLAN_STATUS_WERTE enthält alle Status', () => {
  const expected = ['geplant', 'bestaetigt', 'in_bearbeitung', 'abgeschlossen', 'ausgefallen', 'vertretung']
  assert.deepEqual(DIENSTPLAN_STATUS_WERTE, expected)
})

test('DIENSTPLAN_TYP_WERTE enthält alle Typen', () => {
  const expected = ['regulaer', 'vertretung', 'ueberstunden', 'bereitschaft', 'notdienst']
  assert.deepEqual(DIENSTPLAN_TYP_WERTE, expected)
})

test('ARBEITSZEIT_QUELLE_WERTE enthält alle Quellen', () => {
  assert.equal(ARBEITSZEIT_QUELLE_WERTE.length, 4)
  assert.ok(ARBEITSZEIT_QUELLE_WERTE.includes('manuell'))
  assert.ok(ARBEITSZEIT_QUELLE_WERTE.includes('app'))
})

test('ARBEITSZEIT_STATUS_WERTE enthält alle Status', () => {
  assert.equal(ARBEITSZEIT_STATUS_WERTE.length, 4)
  assert.ok(ARBEITSZEIT_STATUS_WERTE.includes('gesperrt'))
})

test('ABWESENHEIT_TYP_WERTE enthält erweiterte Typen', () => {
  assert.ok(ABWESENHEIT_TYP_WERTE.includes('fortbildung'))
  assert.ok(ABWESENHEIT_TYP_WERTE.includes('mutterschutz'))
  assert.ok(ABWESENHEIT_TYP_WERTE.includes('elternzeit'))
  assert.ok(ABWESENHEIT_TYP_WERTE.includes('sonderurlaub'))
  assert.ok(ABWESENHEIT_TYP_WERTE.includes('unbezahlt'))
})

test('ABWESENHEIT_STATUS_WERTE enthält Genehmigungsworkflow-Status', () => {
  const expected = ['beantragt', 'genehmigt', 'abgelehnt', 'storniert']
  assert.deepEqual(ABWESENHEIT_STATUS_WERTE, expected)
})
