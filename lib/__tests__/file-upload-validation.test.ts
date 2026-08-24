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

import { sanitizeFilename, sanitizeStorageName, getFileExtension, generateSafeFilename } from '../file-upload-validation'

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

// ---------------------------------------------------------------------------
// sanitizeFilename — Umlaut-Konvertierung (neu)
// ---------------------------------------------------------------------------

describe('sanitizeFilename — Umlaute', () => {
  test('ä → ae', () => {
    // Ä → ae (lowercase, da Umlaut-Konvertierung kein Case-Mapping hat)
    assert.ok(sanitizeFilename('Ärztlicher_Bericht.pdf').startsWith('aerztlicher'))
  })

  test('ö → oe', () => {
    assert.ok(sanitizeFilename('Köln.pdf').includes('Koeln'))
  })

  test('ü → ue', () => {
    assert.ok(sanitizeFilename('Führungszeugnis.pdf').includes('Fuehrungszeugnis'))
  })

  test('ß → ss', () => {
    assert.ok(sanitizeFilename('Straße.pdf').includes('Strasse'))
  })

  test('Großbuchstaben: Ä Ö Ü', () => {
    const r = sanitizeFilename('ÄÖÜ.txt')
    assert.ok(r.includes('ae'))
    assert.ok(r.includes('oe'))
    assert.ok(r.includes('ue'))
  })
})

describe('sanitizeFilename — Fallback-Parameter', () => {
  test('default-Fallback ist "file"', () => {
    assert.equal(sanitizeFilename(''), 'file')
  })

  test('benutzerdefinierter Fallback', () => {
    assert.equal(sanitizeFilename('', 'anhang'), 'anhang')
  })
})

// ---------------------------------------------------------------------------
// sanitizeStorageName — strikte Storage-Variante (konsolidiert 6 Kopien)
// ---------------------------------------------------------------------------

describe('sanitizeStorageName', () => {
  test('normale Datei bleibt erhalten', () => {
    assert.equal(sanitizeStorageName('foto.jpg'), 'foto.jpg')
  })

  test('Umlaute → ASCII', () => {
    // Ä → ae (lowercase), Rest bleibt
    assert.equal(sanitizeStorageName('Ärztlicher-Bericht.pdf'), 'aerztlicher-Bericht.pdf')
  })

  test('Sonderzeichen → Unterstrich', () => {
    // + Quantifier: aufeinanderfolgende Sonderzeichen → ein _
    assert.equal(sanitizeStorageName('mein bericht (1).pdf'), 'mein_bericht_1_.pdf')
  })

  test('Leerzeichen → Unterstrich', () => {
    assert.ok(!sanitizeStorageName('Mein Dokument.pdf').includes(' '))
  })

  test('führende Punkte entfernt', () => {
    const r = sanitizeStorageName('..hidden')
    assert.ok(!r.startsWith('.'))
  })

  test('Längenbegrenzung (Standard: 120)', () => {
    const lang = 'a'.repeat(200) + '.pdf'
    assert.ok(sanitizeStorageName(lang).length <= 120)
  })

  test('Längenbegrenzung (benutzerdefiniert)', () => {
    const lang = 'a'.repeat(200)
    assert.ok(sanitizeStorageName(lang, { maxLen: 50 }).length <= 50)
  })

  test('leerer Name → Fallback "file"', () => {
    assert.equal(sanitizeStorageName(''), 'file')
  })

  test('leerer Name → benutzerdefinierter Fallback', () => {
    assert.equal(sanitizeStorageName('', { fallback: 'foto' }), 'foto')
  })

  test('nur Sonderzeichen → Unterstrich (nicht leer)', () => {
    // '!!!' → '_' (+ Quantifier), '_' ist im erlaubten Set → kein Fallback
    assert.equal(sanitizeStorageName('!!!', { fallback: 'anhang' }), '_')
  })

  test('ß in Dateinamen', () => {
    assert.equal(sanitizeStorageName('Straße.pdf'), 'Strasse.pdf')
  })

  test('erlaubte Zeichen bleiben: a-z A-Z 0-9 . _ -', () => {
    assert.equal(sanitizeStorageName('Test-123_v2.pdf'), 'Test-123_v2.pdf')
  })
})
