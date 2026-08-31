// ═══════════════════════════════════════════════════════════════
// Welle 5f — PLZ→Bundesland Zuordnung Tests
// ═══════════════════════════════════════════════════════════════
//
// Reine Funktionen: normalizePlz, resolvePlz, bundeslandFuerPlz,
// eindeutigesBundeslandFuerPlz, normalizeBundesland, isHessenPlz.
// Compliance-kritisch: Kassenabrechnung darf nur bei sicher=true aktiviert werden.
// ═══════════════════════════════════════════════════════════════

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
  normalizePlz,
  resolvePlz,
  bundeslandFuerPlz,
  
  eindeutigesBundeslandFuerPlz,
  normalizeBundesland,
  isHessenPlz,
  AUSNAHMEN_5,
  PRAEFIX_3,
  PRAEFIX_2,
} from '../plz-bundesland'

// ---------------------------------------------------------------------------
// normalizePlz
// ---------------------------------------------------------------------------

describe('normalizePlz', () => {
  test('5-stellige PLZ → unverändert', () => {
    assert.equal(normalizePlz('60311'), '60311')
  })

  test('PLZ aus Freitext extrahiert', () => {
    assert.equal(normalizePlz('65933 Frankfurt am Main'), '65933')
  })

  test('PLZ mit Leerzeichen vor/nach', () => {
    assert.equal(normalizePlz('  60311  '), '60311')
  })

  test('null → null', () => {
    assert.equal(normalizePlz(null), null)
  })

  test('undefined → null', () => {
    assert.equal(normalizePlz(undefined), null)
  })

  test('zu kurz → null', () => {
    assert.equal(normalizePlz('1234'), null)
  })

  test('Buchstaben → null', () => {
    assert.equal(normalizePlz('ABCDE'), null)
  })
})

// ---------------------------------------------------------------------------
// resolvePlz
// ---------------------------------------------------------------------------

describe('resolvePlz', () => {
  test('postalCode hat Vorrang', () => {
    assert.equal(resolvePlz('60311', 'München 80331'), '60311')
  })

  test('Fallback auf location', () => {
    assert.equal(resolvePlz(null, '60311 Frankfurt'), '60311')
  })

  test('beides null → null', () => {
    assert.equal(resolvePlz(null, null), null)
  })
})

// ---------------------------------------------------------------------------
// bundeslandFuerPlz — Ausnahmen (5-stellig)
// ---------------------------------------------------------------------------

describe('bundeslandFuerPlz — Ausnahmen', () => {
  test('55246 Mainz-Kostheim → Hessen (nicht RP)', () => {
    const t = bundeslandFuerPlz('55246')
    assert.equal(t.code, 'hessen')
    assert.equal(t.sicher, true)
    assert.equal(t.quelle, 'ausnahme')
  })

  test('34346 Hann. Münden → Niedersachsen (nicht Hessen)', () => {
    const t = bundeslandFuerPlz('34346')
    assert.equal(t.code, 'niedersachsen')
    assert.equal(t.sicher, true)
    assert.equal(t.quelle, 'ausnahme')
  })

  test('65582 Diez → Rheinland-Pfalz (nicht Hessen)', () => {
    const t = bundeslandFuerPlz('65582')
    assert.equal(t.code, 'rheinland_pfalz')
  })
})

// ---------------------------------------------------------------------------
// bundeslandFuerPlz — Präfix-3
// ---------------------------------------------------------------------------

describe('bundeslandFuerPlz — Praefix3', () => {
  test('140xx Berlin (nicht Brandenburg)', () => {
    const t = bundeslandFuerPlz('14089')
    assert.equal(t.code, 'berlin')
    assert.equal(t.sicher, true)
    assert.equal(t.quelle, 'praefix3')
  })

  test('144xx Potsdam → Brandenburg', () => {
    assert.equal(bundeslandFuerPlz('14467').code, 'brandenburg')
  })

  test('637xx Aschaffenburg → Bayern', () => {
    const t = bundeslandFuerPlz('63739')
    assert.equal(t.code, 'bayern')
    assert.equal(t.sicher, true)
  })

  test('046xx unsicher (TH↔SN Grenze)', () => {
    const t = bundeslandFuerPlz('04600')
    assert.equal(t.sicher, false)
  })
})

// ---------------------------------------------------------------------------
// bundeslandFuerPlz — Präfix-2
// ---------------------------------------------------------------------------

describe('bundeslandFuerPlz — Praefix2', () => {
  test('60xxx → Hessen (Frankfurt)', () => {
    const t = bundeslandFuerPlz('60311')
    assert.equal(t.code, 'hessen')
    assert.equal(t.sicher, true)
    assert.equal(t.quelle, 'praefix2')
  })

  test('80xxx → Bayern (München)', () => {
    assert.equal(bundeslandFuerPlz('80331').code, 'bayern')
  })

  test('10xxx → Berlin', () => {
    assert.equal(bundeslandFuerPlz('10115').code, 'berlin')
  })

  test('20xxx → Hamburg', () => {
    assert.equal(bundeslandFuerPlz('20095').code, 'hamburg')
  })
})

// ---------------------------------------------------------------------------
// bundeslandFuerPlz — Unbekannt
// ---------------------------------------------------------------------------

describe('bundeslandFuerPlz — Unbekannt', () => {
  test('null → nicht zuordenbar', () => {
    const t = bundeslandFuerPlz(null)
    assert.equal(t.code, null)
    assert.equal(t.sicher, false)
    assert.equal(t.quelle, 'unbekannt')
  })

  test('05xxx (nicht vergeben) → nicht zuordenbar', () => {
    const t = bundeslandFuerPlz('05000')
    assert.equal(t.code, null)
  })
})

// ---------------------------------------------------------------------------
// eindeutigesBundeslandFuerPlz — Kassenabrechnung
// ---------------------------------------------------------------------------

describe('eindeutigesBundeslandFuerPlz', () => {
  test('Frankfurt 60311 → hessen (sicher)', () => {
    assert.equal(eindeutigesBundeslandFuerPlz('60311'), 'hessen')
  })

  test('unsichere Grenzregion → null (Compliance)', () => {
    // 046xx ist unsicher (Thüringen/Sachsen Grenze)
    assert.equal(eindeutigesBundeslandFuerPlz('04600'), null)
  })

  test('null → null', () => {
    assert.equal(eindeutigesBundeslandFuerPlz(null), null)
  })
})

// ---------------------------------------------------------------------------
// normalizeBundesland
// ---------------------------------------------------------------------------

describe('normalizeBundesland', () => {
  test('Code durchgereicht', () => {
    assert.equal(normalizeBundesland('hessen'), 'hessen')
  })

  test('ISO-Code DE-HE → hessen', () => {
    assert.equal(normalizeBundesland('DE-HE'), 'hessen')
  })

  test('Kurzform HE → hessen', () => {
    assert.equal(normalizeBundesland('HE'), 'hessen')
  })

  test('Klartext "Nordrhein-Westfalen" → nordrhein_westfalen', () => {
    assert.equal(normalizeBundesland('Nordrhein-Westfalen'), 'nordrhein_westfalen')
  })

  test('Klartext "Baden-Württemberg" mit Umlaut → baden_wuerttemberg', () => {
    assert.equal(normalizeBundesland('Baden-Württemberg'), 'baden_wuerttemberg')
  })

  test('Klartext "Thüringen" → thueringen', () => {
    assert.equal(normalizeBundesland('Thüringen'), 'thueringen')
  })

  test('null → null', () => {
    assert.equal(normalizeBundesland(null), null)
  })

  test('leerer String → null', () => {
    assert.equal(normalizeBundesland(''), null)
  })

  test('Unsinn → null', () => {
    assert.equal(normalizeBundesland('Atlantis'), null)
  })
})

// ---------------------------------------------------------------------------
// isHessenPlz (deprecated, Abwärtskompatibilität)
// ---------------------------------------------------------------------------

describe('isHessenPlz', () => {
  test('60311 Frankfurt → true', () => {
    assert.equal(isHessenPlz('60311'), true)
  })

  test('80331 München → false', () => {
    assert.equal(isHessenPlz('80331'), false)
  })

  test('55246 Mainz-Kostheim (Ausnahme) → true', () => {
    assert.equal(isHessenPlz('55246'), true)
  })

  test('65582 Diez (Ausnahme, RP) → false', () => {
    assert.equal(isHessenPlz('65582'), false)
  })
})

// ---------------------------------------------------------------------------
// Datenintegrität — keine Überschneidungen
// ---------------------------------------------------------------------------

describe('Datenintegrität', () => {
  test('AUSNAHMEN_5 enthält nur 5-stellige PLZ', () => {
    for (const plz of Object.keys(AUSNAHMEN_5)) {
      assert.ok(/^\d{5}$/.test(plz), `Ungültige PLZ in AUSNAHMEN_5: ${plz}`)
    }
  })

  test('PRAEFIX_3 enthält nur 3-stellige Codes', () => {
    for (const p of Object.keys(PRAEFIX_3)) {
      assert.ok(/^\d{3}$/.test(p), `Ungültiger Präfix in PRAEFIX_3: ${p}`)
    }
  })

  test('PRAEFIX_2 enthält nur 2-stellige Codes', () => {
    for (const p of Object.keys(PRAEFIX_2)) {
      assert.ok(/^\d{2}$/.test(p), `Ungültiger Präfix in PRAEFIX_2: ${p}`)
    }
  })

  test('alle 16 Bundesländer kommen in PRAEFIX_2 vor', () => {
    const vorhandene = new Set(Object.values(PRAEFIX_2).map(r => r.bl))
    assert.equal(vorhandene.size, 16, `Nur ${vorhandene.size} Bundesländer in PRAEFIX_2`)
  })
})
