/**
 * Tests für den EDIFACT-Generator (§ 105 Abs. 2 SGB XI, PLGA/PLAA 6).
 *
 * Kernaussage der Suite: was der Generator erzeugt, muss der Validator
 * annehmen. Diese Kopplung ist der eigentliche Schutz — sie fängt jede
 * Änderung, die eine Seite ohne die andere anfasst.
 *
 * Läuft mit: npm run test:unit (node:test).
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  generateEDIFACT,
  generateAlleDateien,
  gruppiereNachKostentraeger,
  logischerDateiname,
  physikalischerDateiname,
  ALLTAGSENGEL_NAME,
  type AbrechnungsFall,
} from '../edifact-generator'
import { validateEDIFACT, parseSegmente } from '../edifact-validator'

const ALLTAGSENGEL_IK = '460629986'
// Kostentraeger-/Pflegekassen-IKs in dieser Suite sind erfunden, tragen aber
// eine gueltige Pruefziffer — sonst scheitert der Validator an der IK statt
// an dem, was der jeweilige Test eigentlich pruefen will.
const RECHNUNGSDATUM = new Date('2026-08-19T08:00:00Z')

/** Ein Fall mit § 45b-Entlastungsleistung (131 €/Monat) bei der KKH. */
function fall(ueberschreibung: Partial<AbrechnungsFall> = {}): AbrechnungsFall {
  return {
    verordnung_id: 'v-1',
    client: {
      versichertennummer: 'A123456780',
      geburtsdatum: '1948-03-12',
      nachname: 'Müller',
      vorname: 'Erika',
      pflegegrad: 3,
      strasse: 'Hauptstraße',
      hausnummer: '12',
      plz: '60311',
      ort: 'Frankfurt',
    },
    kostentraeger: {
      ik_nummer: '182171012',
      pflegekasse_ik: '182171012',
      name: 'KKH Kaufmännische Krankenkasse',
    },
    leistungen: [{
      datum: '2026-08-05',
      leistungsart: 'entlastung_45b',
      menge: 1,
      einzelpreis_cent: 13100, // Entlastungsbetrag 131 €
      pflegekraft_name: 'A. Engel',
      beschaeftigtennummer: '123456789',
    }],
    abrechnungsmonat: '202608',
    ...ueberschreibung,
  }
}

const OPTIONEN = {
  bundesland: 'hessen',
  rechnungsdatum: RECHNUNGSDATUM,
  dateiindikator: '2' as const,
}

// ── Dateinamen ──────────────────────────────────────────────────

test('logischerDateiname folgt Anhang 3 Abschnitt 2.2.1', () => {
  // PL | Monat 08 | Jahresendziffer 6 | Lieferungsart 0 | lfd. 01 | S | AO
  assert.equal(logischerDateiname('202608', 'AO'), 'PL086001SAO')
  assert.equal(logischerDateiname('202608', 'AO').length, 11)
})

test('logischerDateiname trennt Kassenarten und Korrekturlieferungen', () => {
  assert.equal(logischerDateiname('202608', 'EK', 1), 'PL086001SEK')
  assert.equal(logischerDateiname('202608', 'EK', 2), 'PL086002SEK')
  assert.equal(logischerDateiname('202608', 'EK', 1, 1), 'PL086101SEK')
  assert.equal(logischerDateiname('202612', 'BK', 12), 'PL126012SBK')
})

test('physikalischerDateiname unterscheidet Echt- und Testlieferung', () => {
  assert.equal(physikalischerDateiname(1), 'EPFL0001')
  assert.equal(physikalischerDateiname(1, true), 'TPFL0001')
  assert.equal(physikalischerDateiname(42), 'EPFL0042')
  assert.equal(physikalischerDateiname(1).length, 8)
})

// ── Gruppierung ─────────────────────────────────────────────────

test('gruppiereNachKostentraeger fasst Fälle je IK zusammen', () => {
  const gruppen = gruppiereNachKostentraeger([
    fall(),
    fall({ verordnung_id: 'v-2' }),
    fall({
      verordnung_id: 'v-3',
      kostentraeger: { ik_nummer: '109989162', pflegekasse_ik: '182280003', name: 'Techniker Krankenkasse' },
    }),
  ])
  assert.equal(gruppen.size, 2)
  assert.equal(gruppen.get('182171012')!.length, 2)
  assert.equal(gruppen.get('109989162')!.length, 1)
})

// ── Erzeugung ───────────────────────────────────────────────────

test('erzeugte Datei besteht die eigene Validierung', () => {
  const datei = generateEDIFACT([fall()], ALLTAGSENGEL_IK, OPTIONEN)
  const ergebnis = validateEDIFACT(datei.inhalt)
  assert.equal(ergebnis.ok, true, ergebnis.fehler.map(f => f.meldung).join(' | '))
})

test('erzeugte Datei ist auch mit mehreren Fällen und Leistungen gültig', () => {
  const datei = generateEDIFACT([
    fall(),
    fall({
      verordnung_id: 'v-2',
      client: { ...fall().client, versichertennummer: 'B234567891', nachname: 'Meier', vorname: 'Hans', pflegegrad: 2 },
      leistungen: [
        // Preisobergrenzen PfluV: 30 €/Std Betreuung, 25 €/Std Hauswirtschaft
        { datum: '2026-08-07', leistungsart: 'betreuung', menge: 1.5, einzelpreis_cent: 3000, uhrzeit: '09:00', dauer_minuten: 90, pflegekraft_name: 'A. Engel', beschaeftigtennummer: '123456789' },
        { datum: '2026-08-03', leistungsart: 'hauswirtschaft', menge: 2, einzelpreis_cent: 2500, uhrzeit: '14:00', dauer_minuten: 120, pflegekraft_name: 'A. Engel', beschaeftigtennummer: '123456789' },
      ],
    }),
  ], ALLTAGSENGEL_IK, OPTIONEN)

  const ergebnis = validateEDIFACT(datei.inhalt)
  assert.equal(ergebnis.ok, true, ergebnis.fehler.map(f => f.meldung).join(' | '))
})

test('Datei beginnt mit UNA/UNB und endet mit UNZ', () => {
  const datei = generateEDIFACT([fall()], ALLTAGSENGEL_IK, OPTIONEN)
  const zeilen = datei.inhalt.split('\n')
  assert.equal(zeilen[0], "UNA:+.? '")
  assert.ok(zeilen[1].startsWith('UNB+UNOC:3+460629986+'))
  assert.ok(zeilen[zeilen.length - 1].startsWith('UNZ+'))
})

test('je Kostenträger entsteht genau ein PLGA/PLAA-Paar', () => {
  const datei = generateEDIFACT([
    fall(),
    fall({
      verordnung_id: 'v-3',
      kostentraeger: { ik_nummer: '182280003', pflegekasse_ik: '182280003', name: 'KKH Pflegekasse Zweitvertrag' },
    }),
  ], ALLTAGSENGEL_IK, OPTIONEN)

  const segmente = parseSegmente(datei.inhalt)
  const typen = segmente.filter(s => s[0] === 'UNH').map(s => s[2].split(':')[0])
  assert.deepEqual(typen, ['PLGA', 'PLAA', 'PLGA', 'PLAA'])
  assert.equal(datei.anzahl_nachrichten, 4)
  assert.equal(datei.rechnungen.length, 2)
})

test('Gesamtbetrag der Datei ist die Summe aller Fälle', () => {
  const datei = generateEDIFACT([
    fall(),
    fall({ verordnung_id: 'v-2', client: { ...fall().client, versichertennummer: 'B234567891' } }),
  ], ALLTAGSENGEL_IK, OPTIONEN)
  assert.equal(datei.gesamtbetrag_cent, 26200) // 2 × 131,00 €
  assert.equal(datei.rechnungen[0].gesamtbetrag_cent, 26200)
  assert.equal(datei.rechnungen[0].faelle.reduce((s, f) => s + f.brutto_cent, 0), 26200)
})

test('Belegnummern sind innerhalb der Nachricht eindeutig', () => {
  const faelle = Array.from({ length: 5 }, (_, i) => fall({
    verordnung_id: `v-${i}`,
    client: { ...fall().client, versichertennummer: `A12345678${i}` },
  }))
  const datei = generateEDIFACT(faelle, ALLTAGSENGEL_IK, OPTIONEN)
  const belege = datei.rechnungen[0].faelle.map(f => f.belegnummer)
  assert.equal(new Set(belege).size, belege.length)
  assert.deepEqual(belege, ['202608-001', '202608-002', '202608-003', '202608-004', '202608-005'])
})

test('Einsätze werden chronologisch sortiert ausgegeben (TA1-Pflicht)', () => {
  const datei = generateEDIFACT([fall({
    leistungen: [
      { datum: '2026-08-20', leistungsart: 'betreuung', menge: 1, einzelpreis_cent: 3000, uhrzeit: '10:00', dauer_minuten: 60, pflegekraft_name: 'X', beschaeftigtennummer: '123456789' },
      { datum: '2026-08-03', leistungsart: 'betreuung', menge: 1, einzelpreis_cent: 3000, uhrzeit: '10:00', dauer_minuten: 60, pflegekraft_name: 'X', beschaeftigtennummer: '123456789' },
      { datum: '2026-08-12', leistungsart: 'betreuung', menge: 1, einzelpreis_cent: 3000, uhrzeit: '08:00', dauer_minuten: 60, pflegekraft_name: 'X', beschaeftigtennummer: '123456789' },
    ],
  })], ALLTAGSENGEL_IK, OPTIONEN)

  const tage = parseSegmente(datei.inhalt).filter(s => s[0] === 'ESK').map(s => s[1])
  assert.deepEqual(tage, ['03', '12', '20'])
})

test('bei Zeitvergütung steht die Dauer in Minuten in der ELS-Zusatzinfo', () => {
  const datei = generateEDIFACT([fall({
    leistungen: [{
      datum: '2026-08-05', leistungsart: 'betreuung', menge: 1.5, einzelpreis_cent: 3000,
      uhrzeit: '09:00', dauer_minuten: 90, pflegekraft_name: 'X', beschaeftigtennummer: '123456789',
    }],
  })], ALLTAGSENGEL_IK, OPTIONEN)

  const els = parseSegmente(datei.inhalt).find(s => s[0] === 'ELS')!
  assert.equal(els[5], '0090')
  assert.equal(els[6], '1,50')
})

test('ohne dauer_minuten wird die Dauer aus der Menge abgeleitet', () => {
  const datei = generateEDIFACT([fall({
    leistungen: [{
      datum: '2026-08-05', leistungsart: 'betreuung', menge: 2, einzelpreis_cent: 3000,
      uhrzeit: '09:00', pflegekraft_name: 'X', beschaeftigtennummer: '123456789',
    }],
  })], ALLTAGSENGEL_IK, OPTIONEN)
  assert.equal(parseSegmente(datei.inhalt).find(s => s[0] === 'ELS')![5], '0120')
})

test('nicht zeitbasierte Leistungen tragen die Zusatzinfo 00', () => {
  const datei = generateEDIFACT([fall()], ALLTAGSENGEL_IK, OPTIONEN)
  assert.equal(parseSegmente(datei.inhalt).find(s => s[0] === 'ELS')![5], '00')
})

// ── Fail-closed: der Default ist die Testdatei ─────────────────
// Der einzige Produktivaufrufer (kassenabrechnung-engine.ts) holt den
// Indikator aus dem Betriebsmodus und setzt ihn immer. Der Default greift
// also nur, wenn jemand den Aufruf vergisst — und dann darf keine Echtdatei
// entstehen. Vorher stand hier '2': ein vergessener Parameter hätte eine
// Forderung bei der Kasse ausgelöst.
test('ohne Dateiindikator entsteht eine Testdatei, keine Echtdatei', () => {
  const { dateiindikator: _weg, ...ohneIndikator } = OPTIONEN
  const datei = generateEDIFACT([fall()], ALLTAGSENGEL_IK, ohneIndikator)
  const unb = datei.inhalt.split('\n').find(z => z.startsWith('UNB+'))!
  assert.ok(unb.endsWith("+0'"), `UNB muss Dateiindikator 0 tragen, ist: ${unb}`)
  assert.ok(
    datei.physikalischer_dateiname.startsWith('T'),
    'Der physikalische Dateiname muss der Testlieferung entsprechen (T…)',
  )
})

test('Dateiindikator und physikalischer Name gehören zusammen', () => {
  const test0 = generateEDIFACT([fall()], ALLTAGSENGEL_IK, { ...OPTIONEN, dateiindikator: '0' })
  assert.ok(test0.physikalischer_dateiname.startsWith('T'), 'Indikator 0 muss einen T-Dateinamen ergeben')
  assert.ok(test0.inhalt.includes("+PL086001SEK+0'"))

  const echt = generateEDIFACT([fall()], ALLTAGSENGEL_IK, { ...OPTIONEN, dateiindikator: '2' })
  assert.ok(echt.physikalischer_dateiname.startsWith('E'))
  assert.ok(echt.inhalt.includes("+PL086001SEK+2'"))
})

test('Absender-IK landet in UNB und in beiden FKT-Segmenten', () => {
  const datei = generateEDIFACT([fall()], ALLTAGSENGEL_IK, OPTIONEN)
  const segmente = parseSegmente(datei.inhalt)
  assert.equal(segmente.find(s => s[0] === 'UNB')![2], ALLTAGSENGEL_IK)
  for (const fkt of segmente.filter(s => s[0] === 'FKT')) {
    assert.ok(fkt.includes(ALLTAGSENGEL_IK), `FKT ohne Absender-IK: ${fkt.join('+')}`)
  }
})

test('Empfänger im UNB ist die Datenannahmestelle, nicht der Kostenträger', () => {
  const datei = generateEDIFACT([fall()], ALLTAGSENGEL_IK, OPTIONEN)
  // KKH → BITMARCK Essen (104593971), Kostenträger-IK ist 182171012
  assert.equal(datei.datenannahmestelle.ik, '104593971')
  assert.equal(parseSegmente(datei.inhalt).find(s => s[0] === 'UNB')![3], '104593971')
})

test('Firmenname steht im NAM-Segment', () => {
  const standard = generateEDIFACT([fall()], ALLTAGSENGEL_IK, OPTIONEN)
  assert.ok(standard.inhalt.includes(`NAM+${ALLTAGSENGEL_NAME}'`))

  const eigener = generateEDIFACT([fall()], ALLTAGSENGEL_IK, { ...OPTIONEN, absender_name: 'Alltagsengel Pflege UG' })
  assert.ok(eigener.inhalt.includes("NAM+Alltagsengel Pflege UG'"))
})

test('Tarifkennzeichen kommt aus dem Bundesland', () => {
  const hessen = generateEDIFACT([fall()], ALLTAGSENGEL_IK, OPTIONEN)
  assert.ok(hessen.inhalt.includes('SRD+36:06000+'))

  const bayern = generateEDIFACT([fall()], ALLTAGSENGEL_IK, { ...OPTIONEN, bundesland: 'bayern' })
  assert.ok(bayern.inhalt.includes('SRD+36:02000+'))
})

// ── Fail-closed ─────────────────────────────────────────────────

test('ohne Fälle wird nichts erzeugt', () => {
  assert.throws(() => generateEDIFACT([], ALLTAGSENGEL_IK, OPTIONEN), /Keine Abrechnungsfälle/)
})

test('ohne Bundesland und ohne Tarifkennzeichen bricht die Erzeugung ab', () => {
  // Ein stiller Hessen-Default würde jede Abrechnung außerhalb Hessens mit
  // dem falschen Tarifbereich versehen.
  assert.throws(
    () => generateEDIFACT([fall()], ALLTAGSENGEL_IK, { rechnungsdatum: RECHNUNGSDATUM }),
    /Tarifkennzeichen fehlt/,
  )
})

test('explizites Tarifkennzeichen macht das Bundesland entbehrlich', () => {
  const datei = generateEDIFACT([fall()], ALLTAGSENGEL_IK, {
    rechnungsdatum: RECHNUNGSDATUM, tarifkennzeichen: '06000',
  })
  assert.ok(datei.inhalt.includes('SRD+36:06000+'))
})

test('unbekannte Kasse bricht ab, statt an die AOK zu liefern', () => {
  const unbekannt = fall({
    kostentraeger: { ik_nummer: '182171012', pflegekasse_ik: '182171012', name: 'SBK Siemens-Betriebskrankenkasse XY' },
  })
  // "Betriebskrankenkasse" wird erkannt — deshalb ein Name ohne jede Kennung:
  const wirklichUnbekannt = fall({
    kostentraeger: { ik_nummer: '182171012', pflegekasse_ik: '182171012', name: 'Continentale' },
  })
  assert.equal(erkanntAlsBKK(unbekannt), true)
  assert.throws(
    () => generateEDIFACT([wirklichUnbekannt], ALLTAGSENGEL_IK, OPTIONEN),
    /Keine Datenannahmestelle/,
  )
})

function erkanntAlsBKK(f: AbrechnungsFall): boolean {
  const datei = generateEDIFACT([f], ALLTAGSENGEL_IK, OPTIONEN)
  return datei.datenannahmestelle.kassenart === 'BK'
}

// ── Warnungen ───────────────────────────────────────────────────

test('Pflegekassen-IK ohne "18" wird gewarnt', () => {
  const datei = generateEDIFACT([fall({
    kostentraeger: { ik_nummer: '104593971', pflegekasse_ik: '104593971', name: 'KKH Kaufmännische Krankenkasse' },
  })], ALLTAGSENGEL_IK, OPTIONEN)
  assert.ok(datei.warnungen.some(w => /beginnt nicht mit "18"/.test(w)))
})

test('unbekannte Leistungsart wird gewarnt und die Leistung übersprungen', () => {
  const datei = generateEDIFACT([fall({
    leistungen: [
      { datum: '2026-08-05', leistungsart: 'entlastung_45b', menge: 1, einzelpreis_cent: 13100, pflegekraft_name: 'X', beschaeftigtennummer: '123456789' },
      { datum: '2026-08-06', leistungsart: 'gibt_es_nicht', menge: 1, einzelpreis_cent: 9900, pflegekraft_name: 'X', beschaeftigtennummer: '123456789' },
    ],
  })], ALLTAGSENGEL_IK, OPTIONEN)

  assert.ok(datei.warnungen.some(w => /unbekannte Leistungsart/.test(w)))
  // Die übersprungene Leistung darf den Betrag nicht erhöhen — und die
  // Datei muss trotzdem in sich stimmig bleiben.
  assert.equal(datei.gesamtbetrag_cent, 13100)
  assert.equal(validateEDIFACT(datei.inhalt).ok, true)
})

test('fehlende Uhrzeit bei Zeitvergütung wird gewarnt', () => {
  const datei = generateEDIFACT([fall({
    leistungen: [{
      datum: '2026-08-05', leistungsart: 'betreuung', menge: 1, einzelpreis_cent: 3000,
      dauer_minuten: 60, pflegekraft_name: 'X', beschaeftigtennummer: '123456789',
    }],
  })], ALLTAGSENGEL_IK, OPTIONEN)
  assert.ok(datei.warnungen.some(w => /Uhrzeit fehlt/.test(w)))
})

test('mehrere Leistungsarten in einer Nachricht werden gewarnt', () => {
  const datei = generateEDIFACT([fall({
    leistungen: [
      { datum: '2026-08-05', leistungsart: 'entlastung_45b', menge: 1, einzelpreis_cent: 13100, pflegekraft_name: 'X', beschaeftigtennummer: '123456789' },
      { datum: '2026-08-06', leistungsart: 'betreuung', menge: 1, einzelpreis_cent: 3000, uhrzeit: '09:00', dauer_minuten: 60, pflegekraft_name: 'X', beschaeftigtennummer: '123456789' },
    ],
  })], ALLTAGSENGEL_IK, OPTIONEN)
  assert.ok(datei.warnungen.some(w => /mehrere Leistungsarten/.test(w)))
})

// ── Kompletter Lauf über mehrere Annahmestellen ─────────────────

test('generateAlleDateien trennt nach Datenannahmestelle', () => {
  const dateien = generateAlleDateien([
    fall(), // KKH → BITMARCK
    fall({
      verordnung_id: 'v-2',
      kostentraeger: { ik_nummer: '182280003', pflegekasse_ik: '182280003', name: 'AOK Hessen' },
    }),
    fall({
      verordnung_id: 'v-3',
      kostentraeger: { ik_nummer: '182290005', pflegekasse_ik: '182290005', name: 'Techniker Krankenkasse' },
    }),
  ], ALLTAGSENGEL_IK, OPTIONEN)

  assert.equal(dateien.length, 3)
  assert.deepEqual(
    dateien.map(d => d.datenannahmestelle.ik).sort(),
    ['104593971', '105810615', '109989162'],
  )
  for (const datei of dateien) {
    assert.equal(validateEDIFACT(datei.inhalt).ok, true, `${datei.logischer_dateiname}: ungültig`)
  }
})

test('jede Datei eines Laufs bekommt eine eigene Datenaustauschreferenz', () => {
  // Zwei Dateien mit derselben Referenz an denselben Empfänger sind ein
  // Abweisungsgrund — die Referenz muss je Lieferung fortlaufen.
  const dateien = generateAlleDateien([
    fall({ kostentraeger: { ik_nummer: '182171012', pflegekasse_ik: '182171012', name: 'BKK VBU' } }),
    fall({ verordnung_id: 'v-2', kostentraeger: { ik_nummer: '182172013', pflegekasse_ik: '182172013', name: 'IKK classic' } }),
  ], ALLTAGSENGEL_IK, OPTIONEN)

  const referenzen = dateien.map(d => parseSegmente(d.inhalt).find(s => s[0] === 'UNB')![5])
  assert.equal(new Set(referenzen).size, dateien.length, `Referenzen doppelt: ${referenzen.join(', ')}`)
})

test('jede Datei eines Laufs bekommt einen eigenen physikalischen Dateinamen', () => {
  const dateien = generateAlleDateien([
    fall(),
    fall({ verordnung_id: 'v-2', kostentraeger: { ik_nummer: '182280003', pflegekasse_ik: '182280003', name: 'AOK Hessen' } }),
  ], ALLTAGSENGEL_IK, OPTIONEN)

  const namen = dateien.map(d => d.physikalischer_dateiname)
  assert.equal(new Set(namen).size, namen.length, `Dateinamen doppelt: ${namen.join(', ')}`)
})

test('generateAlleDateien bricht bei unbekannter Kasse ab', () => {
  assert.throws(
    () => generateAlleDateien([
      fall(),
      fall({ verordnung_id: 'v-2', kostentraeger: { ik_nummer: '182280003', pflegekasse_ik: '182280003', name: 'Continentale' } }),
    ], ALLTAGSENGEL_IK, OPTIONEN),
    /Keine Datenannahmestelle/,
  )
})
