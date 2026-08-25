// ═══════════════════════════════════════════════════════════════
// Welle 6 — PflegeCoach-Rechtstexte (lib/coach/rechtstexte.ts)
// ═══════════════════════════════════════════════════════════════
//
// Widerrufsbelehrung, Muster-Widerrufsformular und AGB liegen als Daten
// vor, nicht als JSX. Genau deshalb sind sie prüfbar — und sie MÜSSEN
// geprüft werden: ein versehentlich gelöschter Absatz in der
// Widerrufsbelehrung ist ein Abmahngrund, kein Rendering-Fehler.
//
// Geprüft werden Struktur, Vollständigkeit und die Selbstverpflichtungen,
// nicht der juristische Wortlaut Zeichen für Zeichen.
// ═══════════════════════════════════════════════════════════════

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
  WIDERRUFSBELEHRUNG_VERSION,
  AGB_VERSION,
  RECHTSTEXTE_STAND,
  WIDERRUF_ANSCHRIFT,
  WIDERRUFSBELEHRUNG,
  MUSTER_WIDERRUFSFORMULAR,
  AGB,
} from '../coach/rechtstexte'
import { COACH_SUPPORT_EMAIL } from '../coach/version'

// ───────────────────────────────────────────────────────────────
describe('Fassungen und Stand', () => {
  test('Versionen sind SemVer-artige Zahlenfolgen', () => {
    assert.match(WIDERRUFSBELEHRUNG_VERSION, /^\d+\.\d+$/)
    assert.match(AGB_VERSION, /^\d+\.\d+$/)
  })

  test('Stand ist ein ISO-Datum', () => {
    assert.match(RECHTSTEXTE_STAND, /^\d{4}-\d{2}-\d{2}$/)
    assert.ok(!Number.isNaN(Date.parse(RECHTSTEXTE_STAND)))
  })
})

// ───────────────────────────────────────────────────────────────
describe('WIDERRUF_ANSCHRIFT', () => {
  test('trägt die Rechtsform UG, nie GmbH', () => {
    assert.equal(WIDERRUF_ANSCHRIFT.name, 'Alltagsengel UG (haftungsbeschränkt)')
    assert.equal(/GmbH/i.test(WIDERRUF_ANSCHRIFT.name), false)
  })

  test('alle Felder sind gefüllt', () => {
    for (const [feld, wert] of Object.entries(WIDERRUF_ANSCHRIFT)) {
      assert.ok(typeof wert === 'string' && wert.trim().length > 0, `${feld} ist leer`)
    }
  })

  test('E-Mail ist die zentrale Support-Adresse, keine private', () => {
    assert.equal(WIDERRUF_ANSCHRIFT.email, COACH_SUPPORT_EMAIL)
    assert.ok(WIDERRUF_ANSCHRIFT.email.endsWith('@alltagsengel.care'))
  })

  test('Ort trägt eine fünfstellige PLZ', () => {
    assert.match(WIDERRUF_ANSCHRIFT.ort, /^\d{5} /)
  })
})

// ───────────────────────────────────────────────────────────────
describe('WIDERRUFSBELEHRUNG', () => {
  test('besteht aus den zwei gesetzlich vorgesehenen Teilen', () => {
    assert.equal(WIDERRUFSBELEHRUNG.length, 2)
    assert.equal(WIDERRUFSBELEHRUNG[0].titel, 'Widerrufsrecht')
    assert.equal(WIDERRUFSBELEHRUNG[1].titel, 'Folgen des Widerrufs')
  })

  test('jeder Teil hat Titel und mindestens einen Absatz', () => {
    for (const teil of WIDERRUFSBELEHRUNG) {
      assert.ok(teil.titel.trim().length > 0)
      assert.ok(teil.absaetze.length > 0, `${teil.titel} hat keine Absätze`)
      for (const a of teil.absaetze) assert.ok(a.trim().length > 0)
    }
  })

  test('nennt die Vierzehn-Tage-Frist im Widerrufsrecht', () => {
    const text = WIDERRUFSBELEHRUNG[0].absaetze.join(' ')
    assert.ok(text.includes('vierzehn Tagen'))
    assert.ok(text.includes('ohne Angabe von Gründen'))
  })

  test('nennt die Vierzehn-Tage-Frist auch für die Rückzahlung', () => {
    const text = WIDERRUFSBELEHRUNG[1].absaetze.join(' ')
    assert.ok(text.includes('vierzehn Tagen'))
    assert.ok(text.includes('zurückzuzahlen'))
  })

  test('trägt die vollständige Anschrift für die Widerrufserklärung', () => {
    const text = WIDERRUFSBELEHRUNG[0].absaetze.join(' ')
    assert.ok(text.includes(WIDERRUF_ANSCHRIFT.name))
    assert.ok(text.includes(WIDERRUF_ANSCHRIFT.strasse))
    assert.ok(text.includes(WIDERRUF_ANSCHRIFT.ort))
    assert.ok(text.includes(WIDERRUF_ANSCHRIFT.email))
  })

  test('weist auf den Widerruf im Konto hin — der wirkt sofort', () => {
    const text = WIDERRUFSBELEHRUNG[0].absaetze.join(' ')
    assert.ok(text.includes('Konto und Nutzung beenden'))
  })

  test('Selbstverpflichtung: KEIN Wertersatz', () => {
    // § 357 Abs. 8 BGB würde Wertersatz erlauben — der Verzicht ist eine
    // bewusste Zusage. Verschwindet dieser Satz, ändert sich die Zusage.
    const text = WIDERRUFSBELEHRUNG[1].absaetze.join(' ')
    assert.ok(text.includes('keinen Wertersatz'))
    assert.ok(text.includes('vollständig zurück'))
  })

  test('Selbstverpflichtung: keine Entgelte für die Rückzahlung', () => {
    const text = WIDERRUFSBELEHRUNG[1].absaetze.join(' ')
    assert.ok(text.includes('in keinem Fall werden Ihnen wegen dieser Rückzahlung Entgelte berechnet'))
  })

  test('enthält keinen unaufgelösten Platzhalter', () => {
    const alles = WIDERRUFSBELEHRUNG.flatMap((t) => t.absaetze).join(' ')
    assert.equal(/\{[a-zA-Z_]+\}/.test(alles), false)
    assert.equal(alles.includes('undefined'), false)
  })
})

// ───────────────────────────────────────────────────────────────
describe('MUSTER_WIDERRUFSFORMULAR', () => {
  test('ist ein mehrzeiliger Text', () => {
    assert.ok(MUSTER_WIDERRUFSFORMULAR.split('\n').length > 5)
  })

  test('adressiert dieselbe Anschrift wie die Belehrung', () => {
    assert.ok(MUSTER_WIDERRUFSFORMULAR.includes(WIDERRUF_ANSCHRIFT.name))
    assert.ok(MUSTER_WIDERRUFSFORMULAR.includes(WIDERRUF_ANSCHRIFT.email))
  })

  test('enthält die Pflichtfelder aus Anlage 2 zu Art. 246a EGBGB', () => {
    for (const feld of ['Bestellt am', 'Name des/der Verbraucher', 'Anschrift des/der Verbraucher', 'Datum']) {
      assert.ok(MUSTER_WIDERRUFSFORMULAR.includes(feld), `${feld} fehlt`)
    }
  })

  test('nennt den Vertragsgegenstand', () => {
    assert.ok(MUSTER_WIDERRUFSFORMULAR.includes('Digitalen PflegeCoach'))
  })

  test('enthält den Streichungshinweis', () => {
    assert.ok(MUSTER_WIDERRUFSFORMULAR.includes('(*) Unzutreffendes streichen.'))
  })

  test('enthält keinen unaufgelösten Platzhalter', () => {
    assert.equal(/\{[a-zA-Z_]+\}/.test(MUSTER_WIDERRUFSFORMULAR), false)
    assert.equal(MUSTER_WIDERRUFSFORMULAR.includes('undefined'), false)
  })
})

// ───────────────────────────────────────────────────────────────
describe('AGB', () => {
  test('hat Abschnitte', () => {
    assert.ok(AGB.length > 0)
  })

  test('jeder Abschnitt hat Nummer, Titel und Absätze', () => {
    for (const a of AGB) {
      assert.match(a.nummer, /^§ \d+$/, `Nummer "${a.nummer}" hat nicht die Form "§ n"`)
      assert.ok(a.titel.trim().length > 0, `${a.nummer} hat keinen Titel`)
      assert.ok(a.absaetze.length > 0, `${a.nummer} hat keine Absätze`)
      for (const p of a.absaetze) assert.ok(p.trim().length > 0, `${a.nummer} hat einen leeren Absatz`)
    }
  })

  test('Paragrafen sind lückenlos ab § 1 durchnummeriert', () => {
    const nummern = AGB.map((a) => Number(a.nummer.replace('§ ', '')))
    assert.deepEqual(nummern, nummern.map((_, i) => i + 1))
  })

  test('§ 1 nennt Anbieterin und Handelsregister', () => {
    const ersterAbschnitt = AGB[0].absaetze.join(' ')
    assert.ok(AGB[0].titel.includes('Geltungsbereich'))
    assert.ok(ersterAbschnitt.includes(WIDERRUF_ANSCHRIFT.name))
    assert.ok(ersterAbschnitt.includes('HRB 140351'))
  })

  test('richtet sich ausdrücklich an Verbraucher', () => {
    assert.ok(AGB[0].absaetze.join(' ').includes('Verbraucher'))
  })

  test('nennt nirgends „GmbH"', () => {
    const alles = AGB.flatMap((a) => a.absaetze).join(' ')
    assert.equal(/GmbH/i.test(alles), false)
  })

  test('enthält keinen unaufgelösten Platzhalter', () => {
    const alles = AGB.flatMap((a) => [a.titel, ...a.absaetze]).join(' ')
    assert.equal(/\{[a-zA-Z_]+\}/.test(alles), false)
    assert.equal(alles.includes('undefined'), false)
  })

  test('Titel sind eindeutig', () => {
    const titel = AGB.map((a) => a.titel)
    assert.equal(new Set(titel).size, titel.length)
  })
})
