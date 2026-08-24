// ═══════════════════════════════════════════════════════════════
// Welle 5h — Rate-Limiter + escapeHtml Tests
// ═══════════════════════════════════════════════════════════════
//
// rateLimit(): Sliding-Window In-Memory-Limiter (deterministisch testbar).
// escapeHtml(): XSS-Schutz für User-Input in E-Mail-HTML.
// ═══════════════════════════════════════════════════════════════

import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import { rateLimit, escapeHtml } from '../rate-limit'

// ---------------------------------------------------------------------------
// escapeHtml — XSS-Schutz
// ---------------------------------------------------------------------------

describe('escapeHtml', () => {
  test('< und > werden escaped', () => {
    assert.equal(escapeHtml('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;')
  })

  test('& wird escaped', () => {
    assert.equal(escapeHtml('A & B'), 'A &amp; B')
  })

  test('Anführungszeichen werden escaped', () => {
    assert.equal(escapeHtml('"hello"'), '&quot;hello&quot;')
  })

  test("Apostrophe werden escaped", () => {
    assert.equal(escapeHtml("it's"), "it&#39;s")
  })

  test('normaler Text bleibt unverändert', () => {
    assert.equal(escapeHtml('Hallo Welt'), 'Hallo Welt')
  })

  test('leerer String bleibt leer', () => {
    assert.equal(escapeHtml(''), '')
  })

  test('alle gefährlichen Zeichen gleichzeitig', () => {
    const r = escapeHtml('<a href="x" onclick=\'y\'>&')
    assert.ok(!r.includes('<'))
    assert.ok(!r.includes('>'))
    assert.ok(!r.includes('"'))
    assert.ok(r.includes('&amp;'))
  })
})

// ---------------------------------------------------------------------------
// rateLimit — Sliding Window
// ---------------------------------------------------------------------------

describe('rateLimit', () => {
  test('erste Requests werden erlaubt', () => {
    const key = `test-${Date.now()}-first`
    assert.equal(rateLimit(key, 3, 60000), true)
    assert.equal(rateLimit(key, 3, 60000), true)
    assert.equal(rateLimit(key, 3, 60000), true)
  })

  test('Limit wird durchgesetzt', () => {
    const key = `test-${Date.now()}-limit`
    rateLimit(key, 2, 60000)
    rateLimit(key, 2, 60000)
    assert.equal(rateLimit(key, 2, 60000), false)
  })

  test('verschiedene Keys sind unabhängig', () => {
    const ts = Date.now()
    const keyA = `test-${ts}-a`
    const keyB = `test-${ts}-b`
    rateLimit(keyA, 1, 60000)
    rateLimit(keyA, 1, 60000) // A ist jetzt voll
    assert.equal(rateLimit(keyA, 1, 60000), false)
    assert.equal(rateLimit(keyB, 1, 60000), true) // B ist frei
  })

  test('abgelaufene Hits fallen aus dem Fenster', () => {
    const key = `test-${Date.now()}-expire`
    // windowMs=1 → Hits verfallen praktisch sofort
    rateLimit(key, 1, 1)
    // Kurze Pause damit die ms vergehen
    const start = Date.now()
    while (Date.now() - start < 5) { /* spin */ }
    assert.equal(rateLimit(key, 1, 1), true)
  })

  test('limit=0 → sofort blockiert', () => {
    const key = `test-${Date.now()}-zero`
    assert.equal(rateLimit(key, 0, 60000), false)
  })
})
