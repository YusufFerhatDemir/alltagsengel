// ═══════════════════════════════════════════════════════════════
// Welle 6 — Multi-Mandant-Konstanten (lib/organizations/types.ts)
// ═══════════════════════════════════════════════════════════════
//
// DEFAULT_ORG_ID ist die Stamm-Organisation, in der jeder Nutzer ohne
// organization_members landet (current_org_id() ist fail-open). Ändert
// sich diese UUID, greifen sämtliche 65 org_fence-Policies ins Leere.
//
// PLAN_FEATURES steuert die Tarifgrenzen — eine fehlende Zeile bedeutet
// „Feature undefined" und damit stillschweigend falsch.
// ═══════════════════════════════════════════════════════════════

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
  DEFAULT_ORG_ID,
  ACTIVE_ORG_COOKIE,
  PLAN_FEATURES,
  PLAN_LABELS,
  BUNDESLAENDER,
  type BillingPlan,
} from '../organizations/types'

const PLAENE: BillingPlan[] = ['intern', 'free', 'starter', 'pro', 'scale']

// ───────────────────────────────────────────────────────────────
describe('DEFAULT_ORG_ID', () => {
  test('ist die feste Stamm-Organisation', () => {
    assert.equal(DEFAULT_ORG_ID, '00000000-0000-4000-8000-000460629986')
  })

  test('ist eine syntaktisch gültige UUID v4-Form', () => {
    assert.match(DEFAULT_ORG_ID, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  test('kodiert das IK 460629986 im letzten Segment', () => {
    assert.ok(DEFAULT_ORG_ID.endsWith('460629986'))
  })
})

describe('ACTIVE_ORG_COOKIE', () => {
  test('ist ein gültiger Cookie-Name ohne Sonderzeichen', () => {
    assert.equal(ACTIVE_ORG_COOKIE, 'ae_active_org')
    assert.match(ACTIVE_ORG_COOKIE, /^[A-Za-z0-9_-]+$/)
  })
})

// ───────────────────────────────────────────────────────────────
describe('PLAN_FEATURES', () => {
  test('kennt genau die fünf Tarife', () => {
    assert.deepEqual(Object.keys(PLAN_FEATURES).sort(), [...PLAENE].sort())
  })

  test('jeder Tarif führt dieselben Feature-Schlüssel', () => {
    const referenz = Object.keys(PLAN_FEATURES.intern).sort()
    for (const plan of PLAENE) {
      assert.deepEqual(Object.keys(PLAN_FEATURES[plan]).sort(), referenz, `Tarif ${plan} weicht ab`)
    }
  })

  test('max_klienten ist entweder null (unbegrenzt) oder eine positive Zahl', () => {
    for (const plan of PLAENE) {
      const wert = PLAN_FEATURES[plan].max_klienten
      assert.ok(
        wert === null || (typeof wert === 'number' && wert > 0),
        `Tarif ${plan}: max_klienten=${String(wert)}`,
      )
    }
  })

  test('die Klientengrenze steigt mit dem Tarif', () => {
    const free = PLAN_FEATURES.free.max_klienten as number
    const starter = PLAN_FEATURES.starter.max_klienten as number
    const pro = PLAN_FEATURES.pro.max_klienten as number
    assert.ok(free < starter && starter < pro)
    assert.equal(PLAN_FEATURES.scale.max_klienten, null, 'scale ist unbegrenzt')
    assert.equal(PLAN_FEATURES.intern.max_klienten, null, 'Eigenbetrieb ist unbegrenzt')
  })

  test('free hat keine kostenpflichtigen Funktionen freigeschaltet', () => {
    for (const feature of ['edifact', 'ki_pruefung', 'elnw', 'api']) {
      assert.equal(PLAN_FEATURES.free[feature], false, `free hat ${feature} offen`)
    }
  })

  test('der Eigenbetrieb hat alles freigeschaltet', () => {
    for (const feature of ['edifact', 'ki_pruefung', 'elnw', 'api']) {
      assert.equal(PLAN_FEATURES.intern[feature], true, `intern fehlt ${feature}`)
    }
  })

  test('Funktionen werden nie wieder entzogen, wenn der Tarif steigt', () => {
    const reihenfolge: BillingPlan[] = ['free', 'starter', 'pro', 'scale']
    const features = ['edifact', 'ki_pruefung', 'elnw', 'api']
    for (const f of features) {
      let hatte = false
      for (const plan of reihenfolge) {
        const an = PLAN_FEATURES[plan][f] === true
        if (hatte) assert.equal(an, true, `${plan} verliert ${f} wieder`)
        hatte = hatte || an
      }
    }
  })
})

describe('PLAN_LABELS', () => {
  test('jeder Tarif hat ein Label', () => {
    assert.deepEqual(Object.keys(PLAN_LABELS).sort(), [...PLAENE].sort())
    for (const plan of PLAENE) {
      assert.ok(PLAN_LABELS[plan].trim().length > 0, `${plan} ohne Label`)
    }
  })

  test('Labels sind eindeutig', () => {
    const werte = Object.values(PLAN_LABELS)
    assert.equal(new Set(werte).size, werte.length)
  })

  test('die drei kostenpflichtigen Tarife nennen einen Monatspreis', () => {
    for (const plan of ['starter', 'pro', 'scale'] as BillingPlan[]) {
      assert.match(PLAN_LABELS[plan], /\d+ €\/Monat/, `${plan}: ${PLAN_LABELS[plan]}`)
    }
  })

  test('free und intern nennen keinen Preis', () => {
    assert.equal(/€/.test(PLAN_LABELS.free), false)
    assert.equal(/€/.test(PLAN_LABELS.intern), false)
  })

  test('die Preise steigen mit dem Tarif', () => {
    const preis = (plan: BillingPlan) => Number(PLAN_LABELS[plan].match(/(\d+) €/)?.[1])
    assert.ok(preis('starter') < preis('pro'))
    assert.ok(preis('pro') < preis('scale'))
  })
})

// ───────────────────────────────────────────────────────────────
describe('BUNDESLAENDER', () => {
  test('sind alle sechzehn', () => {
    assert.equal(BUNDESLAENDER.length, 16)
  })

  test('keine Dubletten', () => {
    assert.equal(new Set(BUNDESLAENDER).size, BUNDESLAENDER.length)
  })

  test('enthält Hessen — das einzige für die Kassenabrechnung freigeschaltete Land', () => {
    assert.ok(BUNDESLAENDER.includes('Hessen'))
  })

  test('Umlaut-Schreibweisen stehen ausgeschrieben, nicht transkribiert', () => {
    assert.ok(BUNDESLAENDER.includes('Baden-Württemberg'))
    assert.ok(BUNDESLAENDER.includes('Thüringen'))
  })

  test('kein Eintrag ist leer oder ungetrimmt', () => {
    for (const b of BUNDESLAENDER) {
      assert.ok(b.length > 0)
      assert.equal(b, b.trim())
    }
  })
})
