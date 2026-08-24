// ═══════════════════════════════════════════════════════════════
// Welle 5f — File Upload Validation Tests
// ═══════════════════════════════════════════════════════════════
//
// Reine Funktionen: sanitizeFilename, getFileExtension, generateSafeFilename.
// Sicherheitsrelevant: Directory-Traversal + Injection-Schutz.
// validateFileUpload() wird nicht getestet (braucht File-Objekt).
// ═══════════════════════════════════════════════════════════════

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { sanitizeFilename, getFileExtension, generateSafeFilename } from '../file-upload-validation'

// ---------------------------------------------------------------------------
// getFileExtension
// ---------------------------------------------------------------------------

describe('getFileExtension', () => {
  test('normale Datei → Extension', () => {
    assert.equal(getFileExtension('foto.jpg'), 'jpg')
  })

  test('mehrere Punkte → letzter Teil', () => {
    assert.equal(getFileExtension('archiv.tar.gz'), 'gz')
  })

  test('kein Punkt → leerer String', () => {
    assert.equal(getFileExtension('README'), '')
  })

  test('nur Punkt → leerer String', () => {
    assert.equal(getFileExtension('.'), '')
  })

  test('versteckte Datei mit Extension', () => {
    assert.equal(getFileExtension('.gitignore.bak'), 'bak')
  })
})

// ---------------------------------------------------------------------------
// sanitizeFilename — Sicherheit
// ---------------------------------------------------------------------------

describe('sanitizeFilename — Directory Traversal', () => {
  test('../../etc/passwd → entschärft', () => {
    const r = sanitizeFilename('../../etc/passwd')
    assert.ok(!r.includes('..'), `Traversal nicht entfernt: "${r}"`)
    assert.ok(!r.includes('/'), `Slash nicht entfernt: "${r}"`)
  })

  test('..\\..\\windows\\system32 → entschärft', () => {
    const r = sanitizeFilename('..\\..\\windows\\system32')
    assert.ok(!r.includes('..'), `Traversal nicht entfernt: "${r}"`)
    assert.ok(!r.includes('\\'), `Backslash nicht entfernt: "${r}"`)
  })
})

describe('sanitizeFilename — Sonderzeichen', () => {
  test('< > : " | ? * werden entfernt', () => {
    const r = sanitizeFilename('file<name>:test|?.txt')
    assert.ok(!r.includes('<'))
    assert.ok(!r.includes('>'))
    assert.ok(!r.includes(':'))
    assert.ok(!r.includes('|'))
    assert.ok(!r.includes('?'))
  })

  test('Null-Bytes werden entfernt', () => {
    const r = sanitizeFilename('file\x00name.txt')
    assert.ok(!r.includes('\x00'))
  })

  test('führende Punkte werden entfernt', () => {
    const r = sanitizeFilename('...hidden.txt')
    assert.ok(!r.startsWith('.'))
  })

  test('Leerzeichen am Rand werden getrimmt', () => {
    const r = sanitizeFilename('  foto.jpg  ')
    assert.ok(!r.startsWith(' '))
    assert.ok(!r.endsWith(' '))
  })
})

describe('sanitizeFilename — Länge', () => {
  test('langer Name wird auf 255 Zeichen gekürzt', () => {
    const lang = 'a'.repeat(300) + '.pdf'
    const r = sanitizeFilename(lang)
    assert.ok(r.length <= 255, `Zu lang: ${r.length}`)
    assert.ok(r.endsWith('.pdf'), `Extension verloren: "${r}"`)
  })

  test('normaler Name bleibt unverändert', () => {
    assert.equal(sanitizeFilename('foto.jpg'), 'foto.jpg')
  })

  test('leerer String → "file"', () => {
    assert.equal(sanitizeFilename(''), 'file')
  })
})

// ---------------------------------------------------------------------------
// generateSafeFilename
// ---------------------------------------------------------------------------

describe('generateSafeFilename', () => {
  test('enthält Timestamp', () => {
    const r = generateSafeFilename('test.pdf')
    assert.ok(/\d{13,}/.test(r), `Kein Timestamp: "${r}"`)
  })

  test('enthält Random-Teil', () => {
    const a = generateSafeFilename('test.pdf')
    const b = generateSafeFilename('test.pdf')
    // Extrem unwahrscheinlich dass zwei identisch sind
    assert.notEqual(a, b)
  })

  test('behält Extension', () => {
    const r = generateSafeFilename('dokument.pdf')
    assert.ok(r.endsWith('.pdf'), `Extension fehlt: "${r}"`)
  })

  test('sanitisiert Input', () => {
    const r = generateSafeFilename('../../evil.pdf')
    assert.ok(!r.includes('..'))
  })
})
