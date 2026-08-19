/**
 * Tests für die EDIFACT-Segmentbausteine (TP6 Pflege, PLGA/PLAA Version 6).
 *
 * Jedes Segment ist eine Zeichenkette mit fester Feldreihenfolge. Ein
 * verrutschtes oder vergessenes Trennzeichen verschiebt alle Folgefelder,
 * ohne dass es beim Erzeugen auffällt — die Kasse liest dann Beträge als
 * Mengen. Deshalb prüfen diese Tests jedes Segment zeichengenau.
 *
 * Läuft mit: npm run test:unit (node:test).
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  esc, betrag, menge, datumJJJJMMTT,
  UNA, UNB, UNZ, UNH, UNT,
  FKT_PLGA, FKT_PLAA, REC, SRD, UST, GES, NAM,
  INV, NAD, MAN, ESK, ELS, IAF,
  SEGMENT_TERMINATOR,
} from '../edifact-segments'

const ALLTAGSENGEL_IK = '460629986'
const ITSCARE_IK = '105810615'

// ── Formatierer ─────────────────────────────────────────────────

test('esc maskiert alle vier EDIFACT-Sonderzeichen', () => {
  assert.equal(esc('Müller+Sohn'), 'Müller?+Sohn')
  assert.equal(esc("O'Brien"), "O?'Brien")
  assert.equal(esc('a:b'), 'a?:b')
  // Freigabezeichen zuerst verdoppeln, sonst maskiert es die eigene Maske
  assert.equal(esc('was?'), 'was??')
  assert.equal(esc("?+:'"), "???+?:?'")
})

test('esc lässt harmlosen Text unverändert', () => {
  assert.equal(esc('Alltagsengel UG'), 'Alltagsengel UG')
  assert.equal(esc(''), '')
})

test('betrag wandelt Cent in das EDIFACT-Komma-Format', () => {
  assert.equal(betrag(0), '0,00')
  assert.equal(betrag(5), '0,05')
  assert.equal(betrag(99), '0,99')
  assert.equal(betrag(100), '1,00')
  assert.equal(betrag(13100), '131,00')   // Entlastungsbetrag § 45b
  assert.equal(betrag(353900), '3539,00') // VP/KZP Jahresbetrag
  assert.equal(betrag(3000), '30,00')     // Preisobergrenze Betreuung PfluV
  assert.equal(betrag(2500), '25,00')     // Preisobergrenze Hauswirtschaft PfluV
})

test('betrag stellt das Minus vor den Betrag (Korrekturrechnung)', () => {
  assert.equal(betrag(-13100), '-131,00')
  assert.equal(betrag(-5), '-0,05')
})

test('menge schreibt immer zwei Nachkommastellen mit Komma', () => {
  assert.equal(menge(1), '1,00')
  assert.equal(menge(1.5), '1,50')
  assert.equal(menge(0.25), '0,25')
  assert.equal(menge(12), '12,00')
})

test('datumJJJJMMTT akzeptiert ISO-String und Date', () => {
  assert.equal(datumJJJJMMTT('2026-08-19'), '20260819')
  assert.equal(datumJJJJMMTT('2026-08-19T13:45:00Z'), '20260819')
  // Date wird in Berliner Zeit ausgewertet: 22:30 UTC = 00:30 des Folgetags
  assert.equal(datumJJJJMMTT(new Date('2026-08-19T22:30:00Z')), '20260820')
})

// ── Service-Segmente ────────────────────────────────────────────

test('UNA definiert genau die Trennzeichen, die alle Segmente verwenden', () => {
  assert.equal(UNA(), "UNA:+.? '")
  assert.equal(UNA().length, 9)
  assert.equal(SEGMENT_TERMINATOR, "'")
})

test('UNB trägt Absender, Empfänger, Referenz und Dateiindikator', () => {
  const unb = UNB(ALLTAGSENGEL_IK, ITSCARE_IK, new Date('2026-08-19T08:05:00Z'), 7, 'PL086001SAO', '2')
  // 08:05 UTC = 10:05 Berliner Sommerzeit
  assert.equal(unb, "UNB+UNOC:3+460629986+105810615+20260819:1005+00007++PL086001SAO+2'")
})

test('UNB füllt die Datenaustauschreferenz fünfstellig auf', () => {
  const unb = UNB(ALLTAGSENGEL_IK, ITSCARE_IK, new Date('2026-08-19T08:05:00Z'), 1, 'PL086001SAO')
  assert.match(unb, /\+00001\+\+/)
})

// Bis 19.08.2026 stand hier die umgekehrte Erwartung: ohne Angabe eine
// Echtdatei. Ein Default, der im Vergessensfall eine Forderung bei der Kasse
// auslöst, ist die teurere Richtung — der Default ist jetzt die Testdatei.
test('UNB ohne Angabe erzeugt eine Testdatei (Indikator 0)', () => {
  const unb = UNB(ALLTAGSENGEL_IK, ITSCARE_IK, new Date('2026-08-19T08:05:00Z'), 1, 'PL086001SAO')
  assert.ok(unb.endsWith("+0'"), 'Der Default muss 0 (Testdatei) sein')
})

test('UNZ spiegelt Nachrichtenzahl und Referenz aus dem UNB', () => {
  assert.equal(UNZ(4, 7), "UNZ+4+00007'")
})

test('UNH/UNT klammern eine Nachricht mit gleicher Referenz', () => {
  assert.equal(UNH(1, 'PLGA'), "UNH+1+PLGA:6'")
  assert.equal(UNH(2, 'PLAA'), "UNH+2+PLAA:6'")
  assert.equal(UNT(8, 2), "UNT+8+2'")
})

test('UNH lässt eine abweichende Nachrichtenversion zu', () => {
  assert.equal(UNH(1, 'PLGA', 5), "UNH+1+PLGA:5'")
})

// ── PLGA ────────────────────────────────────────────────────────

test('FKT_PLGA hat das Sammelrechnungsfeld, FKT_PLAA nicht', () => {
  const plga = FKT_PLGA('01', ALLTAGSENGEL_IK, '182171012', '182171012', ALLTAGSENGEL_IK)
  assert.equal(plga, "FKT+01++460629986+182171012+182171012+460629986'")

  const plaa = FKT_PLAA('01', ALLTAGSENGEL_IK, '182171012', '182171012', ALLTAGSENGEL_IK)
  assert.equal(plaa, "FKT+01+460629986+182171012+182171012+460629986'")

  // Ein Feld Unterschied — genau hier verrutschen sonst alle IKs.
  assert.equal(plga.split('+').length, plaa.split('+').length + 1)
})

test('FKT_PLGA setzt bei Sammelrechnung das J', () => {
  const plga = FKT_PLGA('01', ALLTAGSENGEL_IK, '182171012', '182171012', ALLTAGSENGEL_IK, true)
  assert.equal(plga, "FKT+01+J+460629986+182171012+182171012+460629986'")
})

test('REC trägt die Rechnungsnummer als Gruppe mit Einzelrechnungsnummer', () => {
  assert.equal(REC('AE-202608-01', '0', '2026-08-19'), "REC+AE-202608-01:0+20260819+1+EUR'")
})

test('REC maskiert Sonderzeichen in der Rechnungsnummer', () => {
  assert.equal(REC('AE+1', '0', '2026-08-19'), "REC+AE?+1:0+20260819+1+EUR'")
})

test('SRD verbindet Abrechnungscode und Tarifkennzeichen zur Gruppe', () => {
  // 36 = privat gewerblich, 06000 = Tarifbereich Hessen ohne Sondertarif
  assert.equal(SRD('36', '06000', '01'), "SRD+36:06000+01'")
  assert.equal(SRD('36', '06000', '10'), "SRD+36:06000+10'")
})

test('UST meldet die Umsatzsteuerbefreiung mit Grund', () => {
  assert.equal(UST(true), "UST++J+01'")
  assert.equal(UST(false, 'DE123456789'), "UST+DE123456789'")
})

test('GES lässt leere Kann-Felder leer, statt Nullbeträge zu schreiben', () => {
  // Ohne Zuzahlung/Beihilfe/MwSt: die Felder bleiben leer, nicht "0,00" —
  // ein "0,00" im Zuzahlungsfeld wäre eine Aussage, keine Auslassung.
  assert.equal(GES(13100, 13100), "GES+131,00+++131,00'")
})

test('GES nimmt Zuzahlung, Beihilfe und MwSt auf, wenn vorhanden', () => {
  assert.equal(GES(20000, 15000, 3000, 2000, 1900), "GES+200,00+30,00+20,00+150,00+19,00'")
})

test('NAM kürzt jede Zeile auf 30 Zeichen', () => {
  assert.equal(NAM('Alltagsengel UG'), "NAM+Alltagsengel UG'")
  assert.equal(NAM('A'.repeat(40)), `NAM+${'A'.repeat(30)}'`)
  assert.equal(NAM('Alltagsengel UG', 'Tel. 069 123456'), "NAM+Alltagsengel UG+Tel. 069 123456'")
})

// ── PLAA ────────────────────────────────────────────────────────

test('INV eröffnet den Abrechnungsfall mit KVNR und Belegnummer', () => {
  assert.equal(INV('A123456780', '202608-001'), "INV+A123456780+202608-001'")
})

test('NAD lässt die Anschrift weg, wenn keine übergeben wird', () => {
  assert.equal(NAD('Müller', 'Erika', '1948-03-12'), "NAD+Müller+Erika+19480312'")
})

test('NAD hängt die vollständige Anschrift an (Ersatzverfahren)', () => {
  assert.equal(
    NAD('Müller', 'Erika', '1948-03-12', 'Hauptstraße', '12a', '60311', 'Frankfurt'),
    "NAD+Müller+Erika+19480312+Hauptstraße+12a+60311+Frankfurt'",
  )
})

test('MAN lässt Pflegestufe und Pflegeklasse leer und setzt den Pflegegrad', () => {
  // Zwei leere Felder zwischen Monat und Pflegegrad: nur ambulant relevant.
  assert.equal(MAN('202608', 3), "MAN+202608+++3'")
})

test('ESK schreibt die Uhrzeit nur, wenn es eine gibt', () => {
  assert.equal(ESK('05'), "ESK+05'")
  assert.equal(ESK('05', '0930'), "ESK+05+0930'")
  assert.equal(ESK('99'), "ESK+99'") // Monatspauschale
})

test('ELS baut die vierteilige Leistungsziffer-Gruppe', () => {
  const els = ELS({
    leistungsart: '01', verguetungsart: '02', qualifikation: '8', leistung: '45',
    einzelpreisCent: 3000, zusatzinfo: '0060', anzahl: 1,
    beschaeftigtennummer: '123456789',
  })
  // Gruppe | Einzelpreis | Punktwert | Punktzahl | Zusatzinfo | Anzahl | Beschäftigtennr.
  assert.equal(els, "ELS+01:02:8:45+30,00+++0060+1,00+123456789'")
})

test('ELS lässt leere Kann-Felder am Segmentende weg (TA1 4.2 Abs. 3)', () => {
  const els = ELS({
    leistungsart: '10', verguetungsart: '07', qualifikation: '3', leistung: '30',
    einzelpreisCent: 13100, zusatzinfo: '00', anzahl: 1,
  })
  // Ohne Beschäftigtennummer endet das Segment nach der Anzahl.
  assert.equal(els, "ELS+10:07:3:30+131,00+++00+1,00'")
  assert.ok(!els.includes("++'"))
})

test('ELS behält innere Leerfelder, kürzt nur am Ende', () => {
  const els = ELS({
    leistungsart: '01', verguetungsart: '02', qualifikation: '1', leistung: '43',
    einzelpreisCent: 2500, zusatzinfo: '0090', anzahl: 1.5,
    beschaeftigtennummer: '999999999',
  })
  // Punktwert und Punktzahl bleiben als leere Felder erhalten.
  assert.equal(els, "ELS+01:02:1:43+25,00+++0090+1,50+999999999'")
})

test('ELS nimmt eine zweite Beschäftigtennummer auf', () => {
  const els = ELS({
    leistungsart: '01', verguetungsart: '02', qualifikation: '8', leistung: '45',
    einzelpreisCent: 3000, zusatzinfo: '0060', anzahl: 1,
    beschaeftigtennummer: '123456789', beschaeftigtennummer2: '987654321',
  })
  assert.ok(els.endsWith("+123456789+987654321'"))
})

test('IAF lässt Zuzahlung und Beihilfe leer, wenn es keine gibt', () => {
  assert.equal(IAF(13100, 13100), "IAF+131,00+++131,00'")
})

test('IAF zieht Zuzahlung und Beihilfe vom Rechnungsbetrag ab', () => {
  assert.equal(IAF(20000, 15000, 3000, 2000), "IAF+200,00+30,00+20,00+150,00'")
})

// ── Querschnitt ─────────────────────────────────────────────────

test('jedes Segment endet mit genau einem Segmentterminator', () => {
  const segmente = [
    UNB(ALLTAGSENGEL_IK, ITSCARE_IK, new Date('2026-08-19T08:00:00Z'), 1, 'PL086001SAO'),
    UNZ(2, 1),
    UNH(1, 'PLGA'),
    UNT(6, 1),
    FKT_PLGA('01', ALLTAGSENGEL_IK, '182171012', '182171012', ALLTAGSENGEL_IK),
    FKT_PLAA('01', ALLTAGSENGEL_IK, '182171012', '182171012', ALLTAGSENGEL_IK),
    REC('AE-01', '0', '2026-08-19'),
    SRD('36', '06000', '01'),
    UST(true),
    GES(100, 100),
    NAM('Alltagsengel UG'),
    INV('A123456780', 'B-1'),
    NAD('Müller', 'Erika', '1948-03-12'),
    MAN('202608', 3),
    ESK('05', '0930'),
    ELS({ leistungsart: '01', verguetungsart: '02', qualifikation: '8', leistung: '45', einzelpreisCent: 3000, zusatzinfo: '0060', anzahl: 1 }),
    IAF(3000, 3000),
  ]
  for (const seg of segmente) {
    assert.ok(seg.endsWith(SEGMENT_TERMINATOR), `Segment ohne Terminator: ${seg}`)
    // Kein unmaskierter Terminator im Inneren
    assert.equal(
      seg.slice(0, -1).replace(/\?'/g, '').includes("'"), false,
      `Unmaskierter Terminator im Segment: ${seg}`,
    )
  }
})

test('Segmentkennungen sind exakt dreistellig', () => {
  const kennungen = [
    UNB(ALLTAGSENGEL_IK, ITSCARE_IK, new Date(), 1, 'PL086001SAO'),
    UNH(1, 'PLGA'), UNT(3, 1), UNZ(1, 1),
    FKT_PLGA('01', ALLTAGSENGEL_IK, '182171012', '182171012', ALLTAGSENGEL_IK),
    REC('X', '0', '2026-08-19'), SRD('36', '06000', '01'), UST(true),
    GES(1, 1), NAM('X'), INV('A123456780', 'B'), NAD('A', 'B', '2000-01-01'),
    MAN('202608', 1), ESK('01'), IAF(1, 1),
  ].map(s => s.slice(0, 3))
  for (const k of kennungen) assert.match(k, /^[A-Z]{3}$/)
})
