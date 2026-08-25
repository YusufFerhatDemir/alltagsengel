// ═══════════════════════════════════════════════════════════════
// Welle 6 — WhatsApp-System-Prompt (lib/whatsapp/system-prompt.ts)
// ═══════════════════════════════════════════════════════════════
//
// Das Modul exportiert vier Konstanten ohne jede Abhängigkeit. Sie sind
// trotzdem prüfenswert: die Keyword-Listen entscheiden, ob eine Nachricht
// eskaliert wird, und der Prompt trägt die Firmenfakten und die
// Namens-Policy. Beides bricht still, wenn es jemand verändert.
//
// Geprüft wird die INTEGRITÄT der Daten, nicht der Wortlaut.
// ═══════════════════════════════════════════════════════════════

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
  ALLTAGSENGEL_SYSTEM_PROMPT,
  MEDICAL_KEYWORDS,
  ESCALATION_KEYWORDS,
  OFF_TOPIC_KEYWORDS,
} from '../whatsapp/system-prompt'

const LISTEN: Record<string, string[]> = {
  MEDICAL_KEYWORDS: [...MEDICAL_KEYWORDS],
  ESCALATION_KEYWORDS: [...ESCALATION_KEYWORDS],
  OFF_TOPIC_KEYWORDS: [...OFF_TOPIC_KEYWORDS],
}

// ───────────────────────────────────────────────────────────────
describe('Keyword-Listen — Grundform', () => {
  for (const [name, liste] of Object.entries(LISTEN)) {
    test(`${name}: nicht leer`, () => {
      assert.ok(liste.length > 0)
    })

    test(`${name}: keine Dubletten`, () => {
      const dubletten = liste.filter((k, i) => liste.indexOf(k) !== i)
      assert.deepEqual(dubletten, [], `Doppelte Einträge: ${dubletten.join(', ')}`)
    })

    test(`${name}: durchgehend kleingeschrieben`, () => {
      // Der Abgleich läuft gegen eine kleingeschriebene Nachricht;
      // ein großgeschriebenes Keyword würde nie greifen.
      const gross = liste.filter((k) => k !== k.toLowerCase())
      assert.deepEqual(gross, [], `Nicht kleingeschrieben: ${gross.join(', ')}`)
    })

    test(`${name}: keine führenden/abschließenden Leerzeichen`, () => {
      const schmutz = liste.filter((k) => k !== k.trim())
      assert.deepEqual(schmutz, [])
    })

    test(`${name}: kein leerer Eintrag`, () => {
      assert.equal(liste.filter((k) => k === '').length, 0)
    })
  }
})

describe('Keyword-Listen — Abgrenzung', () => {
  const schnitt = (a: string[], b: string[]) => a.filter((x) => b.includes(x))

  test('medizinisch und Eskalation überschneiden sich nicht', () => {
    assert.deepEqual(schnitt(MEDICAL_KEYWORDS, ESCALATION_KEYWORDS), [])
  })

  test('medizinisch und Off-Topic überschneiden sich nicht', () => {
    assert.deepEqual(schnitt(MEDICAL_KEYWORDS, OFF_TOPIC_KEYWORDS), [])
  })

  test('Eskalation und Off-Topic überschneiden sich nicht', () => {
    assert.deepEqual(schnitt(ESCALATION_KEYWORDS, OFF_TOPIC_KEYWORDS), [])
  })
})

describe('Keyword-Listen — fachlicher Kern', () => {
  test('Notruf-Nummern stehen in den medizinischen Keywords', () => {
    assert.ok(MEDICAL_KEYWORDS.includes('112'))
    assert.ok(MEDICAL_KEYWORDS.includes('116 117'))
  })

  test('Sturz und Atemnot lösen die medizinische Eskalation aus', () => {
    for (const k of ['sturz', 'atemnot', 'blutung', 'medikament', 'dosierung']) {
      assert.ok(MEDICAL_KEYWORDS.includes(k), `${k} fehlt`)
    }
  })

  test('juristische Reizwörter gehen ans Team, nicht an den Bot', () => {
    for (const k of ['anwalt', 'klage', 'kündigung', 'beschwerde', 'rückerstattung']) {
      assert.ok(ESCALATION_KEYWORDS.includes(k), `${k} fehlt`)
    }
  })

  test('Engel-Vermittlung liegt außerhalb des Bot-Scopes', () => {
    // Der Bot deckt nur Pflege-Boxen und Krankenfahrten ab.
    for (const k of ['engel buchen', 'alltagsbegleitung', 'haushaltshilfe']) {
      assert.ok(ESCALATION_KEYWORDS.includes(k), `${k} fehlt`)
    }
  })

  test('Finanz- und Politikthemen sind Off-Topic, keine Eskalation', () => {
    for (const k of ['politik', 'krypto', 'aktien']) {
      assert.ok(OFF_TOPIC_KEYWORDS.includes(k), `${k} fehlt`)
    }
  })
})

// ───────────────────────────────────────────────────────────────
describe('System-Prompt — Identität und Namens-Policy', () => {
  test('ist ein substanzieller Text', () => {
    assert.ok(ALLTAGSENGEL_SYSTEM_PROMPT.length > 5000)
  })

  test('legt die Wir-Form als unumstößlich fest', () => {
    assert.ok(ALLTAGSENGEL_SYSTEM_PROMPT.includes('DEINE IDENTITÄT — UNUMSTÖSSLICH'))
    assert.ok(ALLTAGSENGEL_SYSTEM_PROMPT.includes('Alltagsengel-Team'))
  })

  test('verbietet persönliche Namen ausdrücklich', () => {
    assert.ok(ALLTAGSENGEL_SYSTEM_PROMPT.includes('NIEMALS einen persönlichen Namen'))
  })

  test('gibt eine ehrliche Antwort auf die Bot-Frage vor', () => {
    assert.ok(ALLTAGSENGEL_SYSTEM_PROMPT.includes('Bist du ein Bot?'))
    assert.ok(ALLTAGSENGEL_SYSTEM_PROMPT.includes('digitale Assistent'))
  })
})

describe('System-Prompt — Firmenfakten', () => {
  test('nennt die richtige Rechtsform', () => {
    assert.ok(ALLTAGSENGEL_SYSTEM_PROMPT.includes('Alltagsengel UG (haftungsbeschränkt)'))
  })

  test('nennt NIRGENDS „GmbH"', () => {
    assert.equal(/GmbH/i.test(ALLTAGSENGEL_SYSTEM_PROMPT), false)
  })

  test('nennt Handelsregister, Anschrift und Kontakt aus dem Impressum', () => {
    assert.ok(ALLTAGSENGEL_SYSTEM_PROMPT.includes('HRB 140351'))
    assert.ok(ALLTAGSENGEL_SYSTEM_PROMPT.includes('60311 Frankfurt am Main'))
    assert.ok(ALLTAGSENGEL_SYSTEM_PROMPT.includes('info@alltagsengel.care'))
  })

  test('führt keinen veralteten Entlastungsbetrag von 125 €', () => {
    assert.equal(/125\s*€|€\s*125/.test(ALLTAGSENGEL_SYSTEM_PROMPT), false)
  })
})

describe('System-Prompt — Scope-Grenzen', () => {
  test('nennt beide Produkte mit ihrer Rechtsgrundlage', () => {
    assert.ok(ALLTAGSENGEL_SYSTEM_PROMPT.includes('§40 SGB XI'))
    assert.ok(ALLTAGSENGEL_SYSTEM_PROMPT.includes('§60 SGB V'))
  })

  test('benutzt dieselben Bereichsnamen wie die App', () => {
    assert.ok(ALLTAGSENGEL_SYSTEM_PROMPT.includes('Pflege-Boxen'))
    assert.ok(ALLTAGSENGEL_SYSTEM_PROMPT.includes('Krankenfahrten'))
  })

  test('verweist bei medizinischen Fragen auf 116 117 und 112', () => {
    assert.ok(ALLTAGSENGEL_SYSTEM_PROMPT.includes('116 117'))
    assert.ok(ALLTAGSENGEL_SYSTEM_PROMPT.includes('112'))
  })

  test('nennt den §40-Höchstbetrag von 42 €/Monat', () => {
    assert.ok(ALLTAGSENGEL_SYSTEM_PROMPT.includes('42 €/Monat'))
  })
})
