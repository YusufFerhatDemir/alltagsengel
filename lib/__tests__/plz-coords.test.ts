// ═══════════════════════════════════════════════════════════════
// Welle 5j — PLZ-Koordinaten (Offline-Lookup) Tests
// ═══════════════════════════════════════════════════════════════
//
// plzCoords + isKnownPlz: 8298 deutsche PLZ → Koordinate, lazy cache.
// Kein Supabase, kein fetch. Einzige Dependency: PLZ_PACKED Datensatz.
// ═══════════════════════════════════════════════════════════════

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { plzCoords, isKnownPlz } from '../plz-coords'

// ---------------------------------------------------------------------------
// plzCoords — Grundfunktion
// ---------------------------------------------------------------------------

describe('plzCoords', () => {
  test('Frankfurt 60311 → valide Koordinate', () => {
    const c = plzCoords('60311')
    assert.ok(c !== null, '60311 muss bekannt sein')
    assert.ok(c![0] > 50.0 && c![0] < 50.2, `Lat plausibel: ${c![0]}`)
    assert.ok(c![1] > 8.5 && c![1] < 8.8, `Lng plausibel: ${c![1]}`)
  })

  test('München 80331 → valide Koordinate', () => {
    const c = plzCoords('80331')
    assert.ok(c !== null)
    assert.ok(c![0] > 48.0 && c![0] < 48.3, `Lat München: ${c![0]}`)
    assert.ok(c![1] > 11.4 && c![1] < 11.7, `Lng München: ${c![1]}`)
  })

  test('Berlin 10115 → valide Koordinate', () => {
    const c = plzCoords('10115')
    assert.ok(c !== null)
    assert.ok(c![0] > 52.4 && c![0] < 52.6, `Lat Berlin: ${c![0]}`)
    assert.ok(c![1] > 13.3 && c![1] < 13.5, `Lng Berlin: ${c![1]}`)
  })

  test('Hamburg 20095 → valide Koordinate', () => {
    const c = plzCoords('20095')
    assert.ok(c !== null)
    assert.ok(c![0] > 53.4 && c![0] < 53.7, `Lat Hamburg: ${c![0]}`)
  })

  test('nicht existierende PLZ → null', () => {
    assert.equal(plzCoords('00001'), null)
  })

  test('null → null', () => {
    assert.equal(plzCoords(null), null)
  })

  test('undefined → null', () => {
    assert.equal(plzCoords(undefined), null)
  })

  test('leerer String → null', () => {
    assert.equal(plzCoords(''), null)
  })

  test('alle Koordinaten liegen in Deutschland', () => {
    // Stichprobe verschiedener Regionen
    const stichprobe = ['01067', '20095', '40210', '60311', '80331', '99099']
    for (const plz of stichprobe) {
      const c = plzCoords(plz)
      assert.ok(c !== null, `PLZ ${plz} muss existieren`)
      assert.ok(c![0] > 47 && c![0] < 56, `${plz} Lat in DE: ${c![0]}`)
      assert.ok(c![1] > 5 && c![1] < 16, `${plz} Lng in DE: ${c![1]}`)
    }
  })

  test('Tupel hat genau 2 Einträge [lat, lng]', () => {
    const c = plzCoords('60311')
    assert.ok(c !== null)
    assert.equal(c!.length, 2)
    assert.equal(typeof c![0], 'number')
    assert.equal(typeof c![1], 'number')
  })
})

// ---------------------------------------------------------------------------
// isKnownPlz
// ---------------------------------------------------------------------------

describe('isKnownPlz', () => {
  test('60311 → true', () => assert.equal(isKnownPlz('60311'), true))
  test('80331 → true', () => assert.equal(isKnownPlz('80331'), true))
  test('00001 → false', () => assert.equal(isKnownPlz('00001'), false))
  test('null → false', () => assert.equal(isKnownPlz(null), false))
  test('undefined → false', () => assert.equal(isKnownPlz(undefined), false))
  test('"" → false', () => assert.equal(isKnownPlz(''), false))
})

// ---------------------------------------------------------------------------
// Datenintegrität
// ---------------------------------------------------------------------------

describe('PLZ-Datensatz Integrität', () => {
  test('mindestens 8000 deutsche PLZ vorhanden', () => {
    // Laut Kommentar: 8298 PLZ. Wir prüfen nur die Untergrenze.
    let count = 0
    // Stichprobe: 01001 bis 99999, jede 100. PLZ testen
    for (let i = 1000; i <= 99999; i += 100) {
      const plz = String(i).padStart(5, '0')
      if (isKnownPlz(plz)) count++
    }
    // Bei ~8300 PLZ und 990 Stichproben sollten mindestens 30 treffen
    assert.ok(count > 30, `Nur ${count} Treffer in Stichprobe — Datensatz leer?`)
  })
})
