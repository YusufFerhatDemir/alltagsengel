/**
 * Tests für Schlüsselverzeichnis und Datenannahmestellen-Routing.
 *
 * Zwei Fehlerklassen sind hier teuer:
 *   1. eine IK mit falscher Prüfziffer im Katalog — die Lieferung wird
 *      abgewiesen, ohne dass die Ursache in den erzeugten Daten steht;
 *   2. eine unbekannte Kasse, die still an eine falsche Annahmestelle
 *      geroutet wird — Sozialdaten landen beim falschen Empfänger.
 *
 * Läuft mit: npm run test:unit (node:test).
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DATENANNAHMESTELLEN,
  KASSENART_LABEL,
  LEISTUNGSART_SCHLUESSEL,
  ART_DER_LEISTUNG,
  VERGUETUNGSART,
  QUALIFIKATION,
  TARIFBEREICH_JE_BUNDESLAND,
  TARIFKENNZEICHEN_HESSEN,
  ABRECHNUNGSCODE_ALLTAGSENGEL,
  ERSATZ_BESCHAEFTIGTENNUMMER,
  erkenneKassenSchluessel,
  findeDatenannahmestelle,
  tarifkennzeichenFuerBundesland,
} from '../schluesselverzeichnis'
import { validateIK } from '../edifact-validator'

// ── Katalog-Integrität ──────────────────────────────────────────

test('jede IK im Datenannahmestellen-Katalog hat eine gültige Prüfziffer', () => {
  for (const [schluessel, stelle] of Object.entries(DATENANNAHMESTELLEN)) {
    assert.equal(
      validateIK(stelle.ik), true,
      `Datenannahmestelle "${schluessel}" hat die ungültige IK ${stelle.ik} — `
      + 'die Lieferung würde abgewiesen',
    )
  }
})

test('jede Datenannahmestelle hat eine bekannte Kassenart', () => {
  for (const [schluessel, stelle] of Object.entries(DATENANNAHMESTELLEN)) {
    assert.ok(
      KASSENART_LABEL[stelle.kassenart],
      `Unbekannte Kassenart "${stelle.kassenart}" bei ${schluessel}`,
    )
  }
})

test('jeder Leistungsschlüssel verweist nur auf Werte des Schlüsselverzeichnisses', () => {
  for (const [name, s] of Object.entries(LEISTUNGSART_SCHLUESSEL)) {
    assert.ok(ART_DER_LEISTUNG[s.art], `${name}: Art "${s.art}" nicht in TA3 2.4`)
    assert.ok(VERGUETUNGSART[s.verguetungsart], `${name}: Vergütungsart "${s.verguetungsart}" nicht in TA3 2.5`)
    assert.ok(QUALIFIKATION[s.qualifikation], `${name}: Qualifikation "${s.qualifikation}" nicht in TA3 2.6`)
    assert.match(s.leistung, /^\d{2}$/, `${name}: Leistungsschlüssel "${s.leistung}" nicht zweistellig`)
  }
})

test('zeitbasierte Leistungen haben die Vergütungsart 02', () => {
  // Nur bei Vergütungsart 02 ist die ELS-Zusatzinfo die Dauer in Minuten.
  // Ein zeitbasierter Schlüssel mit anderer Vergütungsart würde die Minuten
  // in ein Feld schreiben, das die Kasse anders liest.
  for (const [name, s] of Object.entries(LEISTUNGSART_SCHLUESSEL)) {
    if (s.zeitbasiert) {
      assert.equal(s.verguetungsart, '02', `${name} ist zeitbasiert, aber Vergütungsart ${s.verguetungsart}`)
    }
  }
})

test('§ 45b-Entlastung läuft über Leistungsart 10, nicht über die Sachleistung', () => {
  // Leistungsart 01 wäre Pflegesachleistung § 36 — das ist ein anderes
  // Budget als der Entlastungsbetrag von 131 €/Monat.
  assert.equal(LEISTUNGSART_SCHLUESSEL.entlastung_45b.art, '10')
  assert.equal(LEISTUNGSART_SCHLUESSEL.alltagsbegleitung_45a.art, '10')
})

test('Verhinderungspflege § 39 hat die eigene Leistungsart 07', () => {
  assert.equal(LEISTUNGSART_SCHLUESSEL.verhinderungspflege_39.art, '07')
})

test('Ersatz-Beschäftigtennummern sind neunstellig numerisch', () => {
  for (const [name, wert] of Object.entries(ERSATZ_BESCHAEFTIGTENNUMMER)) {
    assert.match(wert, /^\d{9}$/, `Ersatzwert ${name} = "${wert}" ist nicht 9-stellig numerisch`)
  }
})

// ── Kassenerkennung ─────────────────────────────────────────────

test('erkenneKassenSchluessel ordnet die gängigen Kassennamen zu', () => {
  const faelle: Array<[string, string]> = [
    ['Techniker Krankenkasse', 'tk'],
    ['TK', 'tk'],
    ['BARMER Pflegekasse', 'barmer'],
    ['DAK-Gesundheit', 'dak'],
    ['HEK - Hanseatische Krankenkasse', 'hek'],
    ['KKH Kaufmännische Krankenkasse', 'kkh'],
    ['hkk Handelskrankenkasse', 'hkk'],
    ['KNAPPSCHAFT', 'knappschaft'],
    ['IKK classic', 'ikk'],
    ['BKK VBU', 'bkk'],
    ['AOK Hessen', 'aok_hessen'],
    ['AOK Bayern', 'aok_hessen'],
  ]
  for (const [name, erwartet] of faelle) {
    assert.equal(erkenneKassenSchluessel(name), erwartet, `"${name}" falsch zugeordnet`)
  }
})

test('"IKK classic" wird nicht als TK gelesen', () => {
  // Die TK-Kurzform darf nur als eigenständiges Wort greifen, sonst würde
  // jedes "tk" im Namen die Datei zur falschen Annahmestelle schicken.
  assert.equal(erkenneKassenSchluessel('IKK classic'), 'ikk')
  assert.equal(erkenneKassenSchluessel('BKK Mobil Oil'), 'bkk')
})

test('BKK wird vor AOK erkannt', () => {
  assert.equal(erkenneKassenSchluessel('BKK der AOK-Mitarbeiter'), 'bkk')
})

test('unbekannte Kasse ergibt null — kein stilles Routing zur AOK', () => {
  for (const unbekannt of ['SBK', 'Continentale', 'Beihilfestelle Land Hessen', 'Privatkunde', '', '   ']) {
    assert.equal(
      erkenneKassenSchluessel(unbekannt), null,
      `"${unbekannt}" darf keiner Annahmestelle zugeordnet werden`,
    )
  }
})

test('findeDatenannahmestelle liefert für Unbekannte null, auch mit Bundesland', () => {
  assert.equal(findeDatenannahmestelle('SBK', 'hessen'), null)
  assert.equal(findeDatenannahmestelle('', 'hessen'), null)
  assert.equal(findeDatenannahmestelle('Irgendeine Kasse'), null)
})

test('findeDatenannahmestelle routet AOK bundesweit zu ITSCare', () => {
  const hessen = findeDatenannahmestelle('AOK Hessen', 'hessen')
  const bayern = findeDatenannahmestelle('AOK Bayern', 'bayern')
  assert.equal(hessen?.ik, '105810615')
  assert.equal(hessen?.kassenart, 'AO')
  assert.deepEqual(bayern, hessen, 'Die AOK-Annahmestelle hängt an der Kassenart, nicht am Bundesland')
})

test('findeDatenannahmestelle liefert je Kassenart die richtige Kassenart-Kennung', () => {
  assert.equal(findeDatenannahmestelle('Techniker Krankenkasse')?.kassenart, 'EK')
  assert.equal(findeDatenannahmestelle('BKK VBU')?.kassenart, 'BK')
  assert.equal(findeDatenannahmestelle('IKK classic')?.kassenart, 'IK')
  assert.equal(findeDatenannahmestelle('KNAPPSCHAFT')?.kassenart, 'BN')
})

// ── Tarifkennzeichen ────────────────────────────────────────────

test('tarifkennzeichenFuerBundesland baut fünf Stellen aus Bereich und Sondertarif', () => {
  assert.equal(tarifkennzeichenFuerBundesland('hessen'), '06000')
  assert.equal(tarifkennzeichenFuerBundesland('hessen'), TARIFKENNZEICHEN_HESSEN)
  assert.equal(tarifkennzeichenFuerBundesland('bayern'), '02000')
  assert.equal(tarifkennzeichenFuerBundesland('berlin'), '23000')
  assert.equal(tarifkennzeichenFuerBundesland('hessen', '123'), '06123')
})

test('jedes hinterlegte Bundesland ergibt ein fünfstelliges Tarifkennzeichen', () => {
  for (const land of Object.keys(TARIFBEREICH_JE_BUNDESLAND)) {
    assert.match(tarifkennzeichenFuerBundesland(land), /^\d{5}$/, `${land} ergibt kein 5-stelliges Kennzeichen`)
  }
})

test('unbekanntes Bundesland bricht ab, statt Hessen zu unterstellen', () => {
  assert.throws(() => tarifkennzeichenFuerBundesland('nordfriesland'), /Kein Tarifbereich/)
  assert.throws(() => tarifkennzeichenFuerBundesland(''), /Kein Tarifbereich/)
})

test('nicht dreistelliger Sondertarif wird abgelehnt', () => {
  assert.throws(() => tarifkennzeichenFuerBundesland('hessen', '12'), /dreistellig/)
  assert.throws(() => tarifkennzeichenFuerBundesland('hessen', 'abc'), /dreistellig/)
})

test('Abrechnungscode von Alltagsengel ist zweistellig', () => {
  assert.match(ABRECHNUNGSCODE_ALLTAGSENGEL, /^\d{2}$/)
})
