/**
 * Tests für die Auftragsdatei (Begleitzettel zur Nutzdatendatei).
 *
 * Der Auftragssatz ist ein Satz FESTER Länge von 348 Bytes. Jede
 * Verschiebung um ein Byte macht die komplette Lieferung unlesbar, ohne
 * dass es beim Erzeugen auffällt — deshalb prüfen diese Tests nicht nur
 * die Gesamtlänge, sondern jedes Feld an seiner vorgeschriebenen Stelle.
 *
 * Läuft mit: npm run test:unit (node:test).
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  generateAuftragsdatei,
  auftragsdateiName,
  parseAuftragsdatei,
  patcheAuftragsdatei,
  leseAuftragsdateiFeld,
  AUFTRAGSDATEI_FELDER,
  AUFTRAGSDATEI_LAENGE,
  VERSCHLUESSELUNGSART,
} from '../auftragsdatei'

// IK 460629986 ist die echte IK von Alltagsengel, 105810615 die der
// AOK-Datenannahmestelle ITSCare — beide mit gültiger Prüfziffer.
const BASIS = {
  absender_ik: '460629986',
  datenannahmestelle_ik: '105810615',
  dateiname: 'PL0860 01SAO'.replace(' ', ''), // 11 Stellen
  dateigroesse_nutzdaten: 4096,
  erstellt_am: new Date('2026-08-19T10:30:45Z'),
}

// ── Feldtabelle selbst ──────────────────────────────────────────

test('Feldtabelle deckt die 348 Bytes lückenlos und überschneidungsfrei ab', () => {
  const felder = Object.entries(AUFTRAGSDATEI_FELDER)
    .map(([name, [offset, laenge]]) => ({ name, offset, laenge }))
    .sort((a, b) => a.offset - b.offset)

  let erwartetesOffset = 0
  for (const feld of felder) {
    assert.equal(
      feld.offset, erwartetesOffset,
      `Feld ${feld.name} beginnt bei ${feld.offset}, erwartet ${erwartetesOffset} — Lücke oder Überlappung`,
    )
    erwartetesOffset += feld.laenge
  }
  assert.equal(erwartetesOffset, AUFTRAGSDATEI_LAENGE)
})

// ── Erzeugung ───────────────────────────────────────────────────

test('generateAuftragsdatei erzeugt exakt 348 Bytes', () => {
  const satz = generateAuftragsdatei(BASIS)
  assert.equal(satz.length, AUFTRAGSDATEI_LAENGE)
})

test('generateAuftragsdatei setzt jedes Feld an die vorgeschriebene Stelle', () => {
  const satz = generateAuftragsdatei(BASIS)

  assert.equal(leseAuftragsdateiFeld(satz, 'IDENTIFIKATOR'), '500000')
  assert.equal(leseAuftragsdateiFeld(satz, 'VERSION'), '01')
  assert.equal(leseAuftragsdateiFeld(satz, 'LAENGE_AUFTRAG'), '00000348')
  assert.equal(leseAuftragsdateiFeld(satz, 'SEQUENZ_NR'), '000')
  assert.equal(leseAuftragsdateiFeld(satz, 'VERFAHREN_KENNUNG'), 'EPFL0')
  assert.equal(leseAuftragsdateiFeld(satz, 'ABSENDER_EIGNER'), '460629986      ')
  assert.equal(leseAuftragsdateiFeld(satz, 'EMPFAENGER_NUTZER'), '105810615      ')
  assert.equal(leseAuftragsdateiFeld(satz, 'DATEINAME'), BASIS.dateiname)
  assert.equal(leseAuftragsdateiFeld(satz, 'DATEIGROESSE_NUTZDATEN'), '000000004096')
  assert.equal(leseAuftragsdateiFeld(satz, 'ZEICHENSATZ'), 'I8')
  assert.equal(leseAuftragsdateiFeld(satz, 'KOMPRIMIERUNG'), '00')
})

test('Erstellungszeitstempel steht 14-stellig als JJJJMMTThhmmss', () => {
  const satz = generateAuftragsdatei(BASIS)
  const stempel = leseAuftragsdateiFeld(satz, 'DATUM_ERSTELLUNG')
  assert.equal(stempel.length, 14)
  assert.match(stempel, /^\d{14}$/)
  // 10:30:45 UTC = 12:30:45 Berliner Sommerzeit
  assert.equal(stempel, '20260819123045')
})

test('Testlieferung setzt die Verfahrenskennung auf TPFL0', () => {
  const echt = generateAuftragsdatei(BASIS)
  const test = generateAuftragsdatei({ ...BASIS, test: true })
  assert.equal(leseAuftragsdateiFeld(echt, 'VERFAHREN_KENNUNG'), 'EPFL0')
  assert.equal(leseAuftragsdateiFeld(test, 'VERFAHREN_KENNUNG'), 'TPFL0')
  assert.equal(test.length, AUFTRAGSDATEI_LAENGE)
})

test('verschluesselt=true setzt Verschlüsselungsart UND elektronische Unterschrift auf 03', () => {
  const satz = generateAuftragsdatei({ ...BASIS, verschluesselt: true })
  assert.equal(leseAuftragsdateiFeld(satz, 'VERSCHLUESSELUNGSART'), VERSCHLUESSELUNGSART.PKCS7)
  assert.equal(leseAuftragsdateiFeld(satz, 'ELEKTRONISCHE_UNTERSCHRIFT'), VERSCHLUESSELUNGSART.PKCS7)
})

test('ohne Verschlüsselung stehen beide Felder auf 00', () => {
  const satz = generateAuftragsdatei(BASIS)
  assert.equal(leseAuftragsdateiFeld(satz, 'VERSCHLUESSELUNGSART'), VERSCHLUESSELUNGSART.KEINE)
  assert.equal(leseAuftragsdateiFeld(satz, 'ELEKTRONISCHE_UNTERSCHRIFT'), VERSCHLUESSELUNGSART.KEINE)
})

test('physikalischer Dateiname landet linksbündig im 44-Byte-Feld', () => {
  const satz = generateAuftragsdatei({ ...BASIS, physikalischer_dateiname: 'EPFL0001' })
  assert.equal(leseAuftragsdateiFeld(satz, 'DATEINAME_PHYSIKALISCH'), 'EPFL0001'.padEnd(44, ' '))
  assert.equal(satz.length, AUFTRAGSDATEI_LAENGE)
})

test('Transfernummer wird dreistellig mit führenden Nullen geschrieben', () => {
  assert.equal(leseAuftragsdateiFeld(generateAuftragsdatei({ ...BASIS, transfer_nummer: 7 }), 'TRANSFER_NUMMER'), '007')
  assert.equal(leseAuftragsdateiFeld(generateAuftragsdatei({ ...BASIS, transfer_nummer: 999 }), 'TRANSFER_NUMMER'), '999')
})

test('getrennte Übertragungsgröße überschreibt nur das zweite Größenfeld', () => {
  const satz = generateAuftragsdatei({ ...BASIS, dateigroesse_uebertragung: 5555 })
  assert.equal(leseAuftragsdateiFeld(satz, 'DATEIGROESSE_NUTZDATEN'), '000000004096')
  assert.equal(leseAuftragsdateiFeld(satz, 'DATEIGROESSE_UEBERTRAGUNG'), '000000005555')
})

test('ohne Angabe ist die Übertragungsgröße gleich der Nutzdatengröße', () => {
  const satz = generateAuftragsdatei(BASIS)
  assert.equal(
    leseAuftragsdateiFeld(satz, 'DATEIGROESSE_UEBERTRAGUNG'),
    leseAuftragsdateiFeld(satz, 'DATEIGROESSE_NUTZDATEN'),
  )
})

test('zu langer Wert bricht ab, statt still abzuschneiden', () => {
  // 13 Stellen in ein 12-stelliges Feld: ein stilles Abschneiden wäre eine
  // falsche Größenangabe an die Annahmestelle.
  assert.throws(
    () => generateAuftragsdatei({ ...BASIS, dateigroesse_nutzdaten: 1234567890123 }),
    /länger als 12 Stellen/,
  )
})

test('Auftragsdateiname ist der physikalische Dateiname mit .AUF', () => {
  assert.equal(auftragsdateiName('EPFL0001'), 'EPFL0001.AUF')
  assert.equal(auftragsdateiName('TPFL0042'), 'TPFL0042.AUF')
})

// ── Parser ──────────────────────────────────────────────────────

test('parseAuftragsdatei liest zurück, was generateAuftragsdatei geschrieben hat', () => {
  const satz = generateAuftragsdatei({
    ...BASIS,
    test: true,
    transfer_nummer: 12,
    verschluesselt: true,
    physikalischer_dateiname: 'TPFL0003',
    leistungsart: '10',
  })
  const felder = parseAuftragsdatei(satz)

  assert.equal(felder.VERFAHREN_KENNUNG, 'TPFL0')
  assert.equal(felder.TRANSFER_NUMMER, '012')
  assert.equal(felder.ABSENDER_EIGNER, '460629986')
  assert.equal(felder.EMPFAENGER_NUTZER, '105810615')
  assert.equal(felder.DATEINAME, BASIS.dateiname)
  assert.equal(felder.VERSCHLUESSELUNGSART, '03')
  assert.equal(felder.DATEINAME_PHYSIKALISCH, 'TPFL0003')
  assert.equal(felder.DATEI_BEZEICHNUNG, '10')
})

test('parseAuftragsdatei weist alles zurück, was nicht 348 Bytes hat', () => {
  assert.throws(() => parseAuftragsdatei('zu kurz'), /statt 348/)
  assert.throws(() => parseAuftragsdatei('x'.repeat(349)), /statt 348/)
})

// ── Nachtrag beim Versand ───────────────────────────────────────

test('patcheAuftragsdatei trägt die Verschlüsselung nach, ohne die Länge zu ändern', () => {
  const satz = generateAuftragsdatei(BASIS)
  const gepatcht = patcheAuftragsdatei(satz, {
    dateigroesse_uebertragung: 6789,
    verschluesselt: true,
  })

  assert.equal(gepatcht.length, AUFTRAGSDATEI_LAENGE)
  const felder = parseAuftragsdatei(gepatcht)
  assert.equal(felder.DATEIGROESSE_UEBERTRAGUNG, '000000006789')
  assert.equal(felder.VERSCHLUESSELUNGSART, '03')
  assert.equal(felder.ELEKTRONISCHE_UNTERSCHRIFT, '03')
  // Nutzdatengröße bleibt die Klartextgröße
  assert.equal(felder.DATEIGROESSE_NUTZDATEN, '000000004096')
})

test('patcheAuftragsdatei lässt jedes nicht genannte Feld unangetastet', () => {
  const satz = generateAuftragsdatei({ ...BASIS, test: true, physikalischer_dateiname: 'TPFL0001' })
  const gepatcht = patcheAuftragsdatei(satz, { dateigroesse_uebertragung: 111 })

  const vorher = parseAuftragsdatei(satz)
  const nachher = parseAuftragsdatei(gepatcht)
  for (const feld of Object.keys(vorher) as (keyof typeof vorher)[]) {
    if (feld === 'DATEIGROESSE_UEBERTRAGUNG') continue
    assert.equal(nachher[feld], vorher[feld], `Feld ${feld} wurde unbeabsichtigt verändert`)
  }
})

test('patcheAuftragsdatei setzt den Sendezeitpunkt', () => {
  const satz = generateAuftragsdatei(BASIS)
  assert.equal(parseAuftragsdatei(satz).DATUM_UEBERTRAGUNG_GESENDET, '00000000000000')

  const gepatcht = patcheAuftragsdatei(satz, { gesendet_am: new Date('2026-08-19T14:05:09Z') })
  // 14:05:09 UTC = 16:05:09 Berliner Sommerzeit
  assert.equal(parseAuftragsdatei(gepatcht).DATUM_UEBERTRAGUNG_GESENDET, '20260819160509')
})

test('patcheAuftragsdatei kann die Verschlüsselung auch wieder zurücknehmen', () => {
  const satz = generateAuftragsdatei({ ...BASIS, verschluesselt: true })
  const gepatcht = patcheAuftragsdatei(satz, { verschluesselt: false })
  assert.equal(parseAuftragsdatei(gepatcht).VERSCHLUESSELUNGSART, '00')
  assert.equal(parseAuftragsdatei(gepatcht).ELEKTRONISCHE_UNTERSCHRIFT, '00')
})

test('patcheAuftragsdatei weist einen Satz falscher Länge ab', () => {
  assert.throws(() => patcheAuftragsdatei('x'.repeat(347), { verschluesselt: true }), /Nachtrag abgelehnt/)
})

test('patcheAuftragsdatei bricht bei zu langem Wert ab, statt zu verschieben', () => {
  const satz = generateAuftragsdatei(BASIS)
  assert.throws(
    () => patcheAuftragsdatei(satz, { physikalischer_dateiname: 'X'.repeat(45) }),
    /länger als 44 Stellen/,
  )
  assert.throws(
    () => patcheAuftragsdatei(satz, { transfer_nummer: 1000 }),
    /länger als 3 Stellen/,
  )
})

test('mehrfaches Nachtragen bleibt längenstabil (Wiederholversuch beim Versand)', () => {
  let satz = generateAuftragsdatei(BASIS)
  for (let versuch = 1; versuch <= 3; versuch++) {
    satz = patcheAuftragsdatei(satz, {
      dateigroesse_uebertragung: 1000 * versuch,
      verschluesselt: true,
      gesendet_am: new Date('2026-08-19T10:00:00Z'),
      transfer_nummer: versuch,
    })
    assert.equal(satz.length, AUFTRAGSDATEI_LAENGE)
  }
  assert.equal(parseAuftragsdatei(satz).TRANSFER_NUMMER, '003')
  assert.equal(parseAuftragsdatei(satz).DATEIGROESSE_UEBERTRAGUNG, '000000003000')
})
