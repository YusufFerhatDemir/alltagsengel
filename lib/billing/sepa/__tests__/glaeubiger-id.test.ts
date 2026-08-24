// ═══════════════════════════════════════════════════════════════
// Welle 4 — glaeubiger-id.ts Tests
// ═══════════════════════════════════════════════════════════════

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
  pruefeGlaeubigerId,
  normalisiereGlaeubigerId,
  pruefeGlaeubigerIdOderWerfe,
  GlaeubigerIdUngueltigError,
  SEPA_PLATZHALTER_IDS,
} from '../glaeubiger-id'

// ---------------------------------------------------------------------------
// pruefeGlaeubigerId
// ---------------------------------------------------------------------------

describe('pruefeGlaeubigerId', () => {
  test('befund "fehlt" fuer null', () => {
    const result = pruefeGlaeubigerId(null)
    assert.equal(result.befund, 'fehlt')
    assert.equal(result.verwendbar, false)
  })

  test('befund "fehlt" fuer undefined', () => {
    const result = pruefeGlaeubigerId(undefined)
    assert.equal(result.befund, 'fehlt')
    assert.equal(result.verwendbar, false)
  })

  test('befund "fehlt" fuer leeren String', () => {
    const result = pruefeGlaeubigerId('')
    assert.equal(result.befund, 'fehlt')
    assert.equal(result.verwendbar, false)
  })

  test('befund "platzhalter" fuer alle SEPA_PLATZHALTER_IDS', () => {
    for (const id of SEPA_PLATZHALTER_IDS) {
      const result = pruefeGlaeubigerId(id)
      assert.equal(result.befund, 'platzhalter', `Platzhalter nicht erkannt: ${id}`)
      assert.equal(result.verwendbar, false, `verwendbar sollte false sein: ${id}`)
    }
  })

  test('befund "formatfehler" fuer falsches Format', () => {
    const result = pruefeGlaeubigerId('INVALID-FORMAT')
    assert.equal(result.befund, 'formatfehler')
    assert.equal(result.verwendbar, false)
  })

  test('befund "formatfehler" fuer zu kurze ID', () => {
    const result = pruefeGlaeubigerId('DE12ZZZ')
    assert.equal(result.befund, 'formatfehler')
    assert.equal(result.verwendbar, false)
  })

  test('befund "nur_nullen" fuer reine Null-IDs', () => {
    // DE12ZZZ + 11 Nullen — NICHT in der Platzhalter-Liste
    const result = pruefeGlaeubigerId('DE99ZZZ00000000000')
    assert.equal(result.befund, 'nur_nullen')
    assert.equal(result.verwendbar, false)
  })

  test('befund "ok" fuer gueltige ID', () => {
    const result = pruefeGlaeubigerId('DE51ZZZ12345678901')
    assert.equal(result.befund, 'ok')
    assert.equal(result.verwendbar, true)
    assert.equal(result.hinweis, null)
  })
})

// ---------------------------------------------------------------------------
// normalisiereGlaeubigerId
// ---------------------------------------------------------------------------

describe('normalisiereGlaeubigerId', () => {
  test('entfernt Leerzeichen', () => {
    assert.equal(normalisiereGlaeubigerId('DE51 ZZZ 12345678901'), 'DE51ZZZ12345678901')
  })

  test('wandelt in Grossbuchstaben um', () => {
    assert.equal(normalisiereGlaeubigerId('de51zzz12345678901'), 'DE51ZZZ12345678901')
  })

  test('gibt leeren String fuer null', () => {
    assert.equal(normalisiereGlaeubigerId(null), '')
  })

  test('gibt leeren String fuer undefined', () => {
    assert.equal(normalisiereGlaeubigerId(undefined), '')
  })
})

// ---------------------------------------------------------------------------
// pruefeGlaeubigerIdOderWerfe
// ---------------------------------------------------------------------------

describe('pruefeGlaeubigerIdOderWerfe', () => {
  test('wirft GlaeubigerIdUngueltigError fuer Platzhalter', () => {
    assert.throws(
      () => pruefeGlaeubigerIdOderWerfe('DE98ZZZ09999999999'),
      (err: unknown) => {
        assert.ok(err instanceof GlaeubigerIdUngueltigError)
        assert.equal(err.name, 'GlaeubigerIdUngueltigError')
        assert.equal(err.befund, 'platzhalter')
        return true
      },
    )
  })

  test('wirft GlaeubigerIdUngueltigError fuer fehlende ID', () => {
    assert.throws(
      () => pruefeGlaeubigerIdOderWerfe(null),
      (err: unknown) => {
        assert.ok(err instanceof GlaeubigerIdUngueltigError)
        assert.equal((err as GlaeubigerIdUngueltigError).befund, 'fehlt')
        return true
      },
    )
  })

  test('gibt normalisierten String fuer gueltige ID zurueck', () => {
    const result = pruefeGlaeubigerIdOderWerfe('de51zzz12345678901')
    assert.equal(result, 'DE51ZZZ12345678901')
  })
})
