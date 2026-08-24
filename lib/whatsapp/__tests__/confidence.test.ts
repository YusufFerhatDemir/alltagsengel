// ═══════════════════════════════════════════════════════════════
// Welle 5f — WhatsApp Bot Confidence-Heuristik + Name-Sanitizer Tests
// ═══════════════════════════════════════════════════════════════
//
// Reine Funktionen: isLowConfidenceReply, sanitizeNames, HOLDING_REPLY.
// Sicherheitsrelevant: Bot darf NIE persönliche Namen an Kunden senden.
// ═══════════════════════════════════════════════════════════════

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { isLowConfidenceReply, sanitizeNames, HOLDING_REPLY } from '../confidence'

// ---------------------------------------------------------------------------
// isLowConfidenceReply — Unsicherheitserkennung
// ---------------------------------------------------------------------------

describe('isLowConfidenceReply — Low-Confidence-Marker', () => {
  test('"ich weiß nicht" → lowConfidence', () => {
    const r = isLowConfidenceReply('Ich weiß nicht genau, wie das geht.')
    assert.equal(r.lowConfidence, true)
    assert.equal(r.marker, 'ich weiß nicht')
  })

  test('"ich weiss nicht" (ohne ß) → lowConfidence', () => {
    assert.equal(isLowConfidenceReply('Ich weiss nicht, ob das stimmt.').lowConfidence, true)
  })

  test('"bin ich mir nicht sicher" → lowConfidence', () => {
    assert.equal(isLowConfidenceReply('Da bin ich mir nicht sicher.').lowConfidence, true)
  })

  test('"leider kann ich" → lowConfidence', () => {
    assert.equal(isLowConfidenceReply('Leider kann ich dazu nichts sagen.').lowConfidence, true)
  })

  test('"lass mich nachfragen" → lowConfidence', () => {
    assert.equal(isLowConfidenceReply('Lass mich nachfragen bei meinem Team.').lowConfidence, true)
  })

  test('"wir klären das" → lowConfidence', () => {
    assert.equal(isLowConfidenceReply('Wir klären das gerne für Sie.').lowConfidence, true)
  })
})

describe('isLowConfidenceReply — Self-Escalation-Marker', () => {
  test('"team meldet sich" → lowConfidence', () => {
    assert.equal(isLowConfidenceReply('Unser Team meldet sich bei Ihnen.').lowConfidence, true)
  })

  test('"wir melden uns persönlich" → lowConfidence', () => {
    assert.equal(isLowConfidenceReply('Wir melden uns persönlich bei Ihnen.').lowConfidence, true)
  })
})

describe('isLowConfidenceReply — Sichere Antworten', () => {
  test('normale Antwort → kein lowConfidence', () => {
    const r = isLowConfidenceReply('Wir bieten Alltagsbegleitung im Raum Frankfurt an.')
    assert.equal(r.lowConfidence, false)
    assert.equal(r.marker, undefined)
  })

  test('leere Antwort → kein lowConfidence', () => {
    assert.equal(isLowConfidenceReply('').lowConfidence, false)
  })

  test('Case-insensitive Matching', () => {
    assert.equal(isLowConfidenceReply('ICH WEIß NICHT').lowConfidence, true)
  })
})

// ---------------------------------------------------------------------------
// sanitizeNames — Personen-Namen aus Bot-Antworten entfernen
// ---------------------------------------------------------------------------

describe('sanitizeNames', () => {
  test('voller Name "Yusuf Ferhat Demir" wird ersetzt', () => {
    const r = sanitizeNames('Yusuf Ferhat Demir meldet sich gleich.')
    assert.equal(r.didReplace, true)
    assert.ok(r.sanitized.includes('das Alltagsengel-Team'))
    assert.ok(!r.sanitized.includes('Yusuf'))
  })

  test('"Yusuf" allein wird ersetzt', () => {
    const r = sanitizeNames('Hallo, Yusuf kümmert sich darum.')
    assert.equal(r.didReplace, true)
    assert.ok(r.sanitized.includes('das Alltagsengel-Team'))
  })

  test('"Cilcioglu" wird ersetzt', () => {
    const r = sanitizeNames('Herr Cilcioglu ist zuständig.')
    assert.equal(r.didReplace, true)
    assert.ok(!r.sanitized.includes('Cilcioglu'))
  })

  test('Doppelung "das das" wird reduziert', () => {
    const r = sanitizeNames('das Yusuf Ferhat Demir ruft Sie an')
    // "das" + "das Alltagsengel-Team" → "das das Alltagsengel-Team" → "das Alltagsengel-Team"
    assert.ok(!r.sanitized.includes('das das'), `Doppelung: "${r.sanitized}"`)
  })

  test('Text ohne Namen bleibt unverändert', () => {
    const original = 'Wir helfen Ihnen gerne weiter.'
    const r = sanitizeNames(original)
    assert.equal(r.didReplace, false)
    assert.equal(r.sanitized, original)
    assert.deepEqual(r.replaced, [])
  })

  test('replaced-Array listet alle gefundenen Namen', () => {
    const r = sanitizeNames('Yusuf Demir und Y. Cilcioglu')
    assert.equal(r.didReplace, true)
    assert.ok(r.replaced.length >= 1)
  })
})

// ---------------------------------------------------------------------------
// HOLDING_REPLY — Konsistenz
// ---------------------------------------------------------------------------

describe('HOLDING_REPLY', () => {
  test('enthält "Alltagsengel"', () => {
    assert.ok(HOLDING_REPLY.includes('Alltagsengel'))
  })

  test('enthält KEINE persönlichen Namen', () => {
    const verboten = ['Yusuf', 'Demir', 'Cilcioglu']
    for (const name of verboten) {
      assert.ok(!HOLDING_REPLY.includes(name), `HOLDING_REPLY enthält "${name}"`)
    }
  })

  test('ist nicht leer', () => {
    assert.ok(HOLDING_REPLY.length > 10)
  })
})
