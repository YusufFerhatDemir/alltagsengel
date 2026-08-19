/**
 * Tests für den EDIFACT-Validator (Prüfstufen 1–3 des Fehlerverfahrens).
 *
 * Der Validator ist die letzte Instanz vor dem Versand. Ein Fehler, den er
 * durchlässt, wird zur Ablehnung durch die Datenannahmestelle — mit
 * Rückläufer, Korrekturlauf und verzögerter Zahlung. Ein Fehler, den er zu
 * Unrecht meldet, blockiert eine korrekte Abrechnung. Beide Richtungen
 * werden hier geprüft.
 *
 * Läuft mit: npm run test:unit (node:test).
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateIK, validateVersichertennummer, parseSegmente, validateEDIFACT } from '../edifact-validator'
import {
  UNA, UNB, UNZ, UNH, UNT, FKT_PLGA, FKT_PLAA, REC, SRD, UST, GES, NAM,
  INV, NAD, MAN, ESK, ELS, IAF,
} from '../edifact-segments'

const ALLTAGSENGEL_IK = '460629986'
const ITSCARE_IK = '105810615'
const KKH_PFLEGEKASSE_IK = '182171012'

// ── IK-Prüfziffer ───────────────────────────────────────────────

test('validateIK akzeptiert die echte IK von Alltagsengel', () => {
  assert.equal(validateIK('460629986'), true)
})

test('validateIK akzeptiert alle IKs, die im Versand tatsächlich vorkommen', () => {
  for (const ik of [
    '105810615', // ITSCare (AOK)
    '104027544', // BITMARCK (BKK)
    '109900019', // BITMARCK (IKK)
    '109905003', // Knappschaft
    '109989162', // T-Systems (TK)
    '660510336', // DDG (BARMER)
    '661430035', // DAVASO (DAK/HEK)
    '104593971', // BITMARCK (KKH)
    '107436557', // ARZ Emmendingen (hkk)
    '182171012', // KKH-Pflegekasse
  ]) {
    assert.equal(validateIK(ik), true, `IK ${ik} sollte gültig sein`)
  }
})

test('validateIK erkennt jede einzelne falsche Prüfziffer', () => {
  // Genau eine der zehn möglichen Endziffern darf passen.
  const treffer: string[] = []
  for (let z = 0; z <= 9; z++) {
    const kandidat = `46062998${z}`
    if (validateIK(kandidat)) treffer.push(kandidat)
  }
  assert.deepEqual(treffer, ['460629986'])
})

test('validateIK erkennt Ziffernvertauschungen im prüfziffernrelevanten Teil', () => {
  // 460629986 → Stellen 3-8 vertauscht: 460269986
  assert.equal(validateIK('460269986'), false)
})

test('validateIK weist alles zurück, was keine 9 Ziffern ist', () => {
  for (const falsch of ['', '46062998', '4606299866', '46062998X', '460 629 986', 'abcdefghi']) {
    assert.equal(validateIK(falsch), false, `"${falsch}" darf nicht als IK durchgehen`)
  }
})

// ── Krankenversichertennummer ───────────────────────────────────

test('validateVersichertennummer verlangt Buchstabe + 9 Ziffern', () => {
  for (const falsch of ['', '1234567890', 'AB12345678', 'a123456789', 'A12345678']) {
    assert.equal(validateVersichertennummer(falsch), false, `"${falsch}" darf nicht durchgehen`)
  }
})

test('validateVersichertennummer prüft die Prüfziffer an Stelle 10', () => {
  // Zu einem festen Stamm darf genau eine Endziffer passen.
  const treffer: string[] = []
  for (let z = 0; z <= 9; z++) {
    const kandidat = `A12345678${z}`
    if (validateVersichertennummer(kandidat)) treffer.push(kandidat)
  }
  assert.equal(treffer.length, 1, `genau eine gültige Prüfziffer erwartet, gefunden: ${treffer.join(', ')}`)
})

// ── Segment-Parser ──────────────────────────────────────────────

test('parseSegmente überspringt das UNA-Segment', () => {
  const segmente = parseSegmente(`${UNA()}${UNZ(1, 1)}`)
  assert.equal(segmente.length, 1)
  assert.equal(segmente[0][0], 'UNZ')
})

test('parseSegmente behandelt maskierte Trennzeichen als Text', () => {
  const segmente = parseSegmente("NAM+Meier?+Sohn+Zweite Zeile'")
  assert.deepEqual(segmente[0], ['NAM', 'Meier+Sohn', 'Zweite Zeile'])
})

test('parseSegmente behandelt einen maskierten Terminator als Text', () => {
  const segmente = parseSegmente("NAD+O?'Brien+Erika+19480312'")
  assert.equal(segmente.length, 1)
  assert.equal(segmente[0][1], "O'Brien")
})

test('parseSegmente ignoriert Zeilenumbrüche zwischen Segmenten', () => {
  const mitUmbruch = parseSegmente("UNH+1+PLGA:6'\nUNT+2+1'")
  const ohneUmbruch = parseSegmente("UNH+1+PLGA:6'UNT+2+1'")
  assert.deepEqual(mitUmbruch, ohneUmbruch)
  assert.equal(mitUmbruch.length, 2)
})

// ── Vollständige, gültige Datei ─────────────────────────────────

/** Baut eine minimale, in sich stimmige PLGA/PLAA-Datei. */
function gueltigeDatei(opt: {
  dateiindikator?: '0' | '1' | '2'
  einzelpreisCent?: number
  anzahl?: number
} = {}): string {
  const preis = opt.einzelpreisCent ?? 13100
  const anzahl = opt.anzahl ?? 1
  const brutto = Math.round(preis * anzahl)
  const datum = new Date('2026-08-19T08:00:00Z')

  const plga = [
    FKT_PLGA('01', ALLTAGSENGEL_IK, KKH_PFLEGEKASSE_IK, KKH_PFLEGEKASSE_IK, ALLTAGSENGEL_IK),
    REC('AE-202608-01', '0', datum, '1'),
    SRD('36', '06000', '10'),
    UST(true),
    GES(brutto, brutto),
    NAM('Alltagsengel UG'),
  ]
  const plaa = [
    FKT_PLAA('01', ALLTAGSENGEL_IK, KKH_PFLEGEKASSE_IK, KKH_PFLEGEKASSE_IK, ALLTAGSENGEL_IK),
    REC('AE-202608-01', '0', datum, '1'),
    INV('A123456780', '202608-001'),
    NAD('Müller', 'Erika', '1948-03-12'),
    MAN('202608', 3),
    ESK('05', '0930'),
    ELS({
      leistungsart: '10', verguetungsart: '07', qualifikation: '3', leistung: '30',
      einzelpreisCent: preis, zusatzinfo: '00', anzahl,
      beschaeftigtennummer: '999999999',
    }),
    IAF(brutto, brutto),
  ]

  return [
    UNA(),
    UNB(ALLTAGSENGEL_IK, ITSCARE_IK, datum, 1, 'PL086001SEK', opt.dateiindikator ?? '2'),
    UNH(1, 'PLGA'), ...plga, UNT(plga.length + 2, 1),
    UNH(2, 'PLAA'), ...plaa, UNT(plaa.length + 2, 2),
    UNZ(2, 1),
  ].join('\n')
}

test('eine korrekt gebaute Datei geht ohne Fehler und ohne Warnung durch', () => {
  const ergebnis = validateEDIFACT(gueltigeDatei())
  assert.equal(ergebnis.ok, true, `Fehler: ${ergebnis.fehler.map(f => f.meldung).join(' | ')}`)
  assert.deepEqual(ergebnis.warnungen.map(w => w.meldung), [])
})

test('leere Eingabe wird abgewiesen, statt als leere Lieferung durchzugehen', () => {
  const ergebnis = validateEDIFACT('')
  assert.equal(ergebnis.ok, false)
  assert.match(ergebnis.fehler[0].meldung, /leer|nicht parsebar/)
})

// ── Prüfstufe 1: Dateistruktur ──────────────────────────────────

test('Testdatei-Indikator 0 ist zulässig, aber wird als Warnung gemeldet', () => {
  const ergebnis = validateEDIFACT(gueltigeDatei({ dateiindikator: '0' }))
  assert.equal(ergebnis.ok, true)
  assert.ok(
    ergebnis.warnungen.some(w => /TESTDATEI/.test(w.meldung)),
    'Eine Testdatei muss als solche gemeldet werden, sonst wird sie versehentlich als Echtlieferung verschickt',
  )
})

test('falsche Nachrichtenzahl im UNZ wird erkannt', () => {
  const kaputt = gueltigeDatei().replace("UNZ+2+00001'", "UNZ+3+00001'")
  const ergebnis = validateEDIFACT(kaputt)
  assert.equal(ergebnis.ok, false)
  assert.ok(ergebnis.fehler.some(f => f.segment === 'UNZ' && /Anzahl Nachrichten/.test(f.meldung)))
})

test('abweichende Datenaustauschreferenz zwischen UNB und UNZ wird erkannt', () => {
  const kaputt = gueltigeDatei().replace("UNZ+2+00001'", "UNZ+2+00002'")
  const ergebnis = validateEDIFACT(kaputt)
  assert.equal(ergebnis.ok, false)
  assert.ok(ergebnis.fehler.some(f => /Datenaustauschreferenz/.test(f.meldung)))
})

test('falscher Segmentzähler im UNT wird erkannt', () => {
  const kaputt = gueltigeDatei().replace("UNT+8+1'", "UNT+9+1'")
  const ergebnis = validateEDIFACT(kaputt)
  assert.equal(ergebnis.ok, false)
  assert.ok(ergebnis.fehler.some(f => f.segment === 'UNT' && /Segmentanzahl/.test(f.meldung)))
})

test('ungültige Absender-IK im UNB wird erkannt', () => {
  const kaputt = gueltigeDatei().replace('+460629986+105810615+', '+460629980+105810615+')
  const ergebnis = validateEDIFACT(kaputt)
  assert.equal(ergebnis.ok, false)
  assert.ok(ergebnis.fehler.some(f => f.segment === 'UNB' && /Absender-IK/.test(f.meldung)))
})

test('Anwendungsreferenz muss 11 Stellen haben', () => {
  const kaputt = gueltigeDatei().replace('+PL086001SEK+', '+PL08600+')
  const ergebnis = validateEDIFACT(kaputt)
  assert.equal(ergebnis.ok, false)
  assert.ok(ergebnis.fehler.some(f => /Anwendungsreferenz/.test(f.meldung)))
})

// ── Prüfstufe 2: Nachrichtenaufbau ──────────────────────────────

test('eine PLGA ohne folgende PLAA wird abgelehnt', () => {
  const datei = gueltigeDatei()
  const zeilen = datei.split('\n')
  const plaaStart = zeilen.findIndex(z => z.startsWith('UNH+2'))
  const nurPlga = [...zeilen.slice(0, plaaStart), "UNZ+1+00001'"].join('\n')
  const ergebnis = validateEDIFACT(nurPlga)
  assert.equal(ergebnis.ok, false)
  assert.ok(ergebnis.fehler.some(f => /muss eine PLAA-Nachricht folgen/.test(f.meldung)))
})

test('fehlendes Pflichtsegment der PLGA wird gemeldet', () => {
  const kaputt = gueltigeDatei()
    .replace("NAM+Alltagsengel UG'\n", '')
    .replace("UNT+8+1'", "UNT+7+1'")
  const ergebnis = validateEDIFACT(kaputt)
  assert.equal(ergebnis.ok, false)
  assert.ok(ergebnis.fehler.some(f => f.segment === 'NAM' && /Pflichtsegment/.test(f.meldung)))
})

test('unbekannter Nachrichtentyp wird abgelehnt', () => {
  const kaputt = gueltigeDatei().replace("UNH+1+PLGA:6'", "UNH+1+SLGA:6'")
  const ergebnis = validateEDIFACT(kaputt)
  assert.equal(ergebnis.ok, false)
  assert.ok(ergebnis.fehler.some(f => /Unbekannter Nachrichtentyp/.test(f.meldung)))
})

// ── Prüfstufe 3: Inhalte und Summen ─────────────────────────────

test('Summenabweichung zwischen ELS und IAF wird erkannt', () => {
  // IAF behauptet 200,00 €, die Einzelleistung ergibt 131,00 €.
  const kaputt = gueltigeDatei().replace("IAF+131,00+++131,00'", "IAF+200,00+++200,00'")
  const ergebnis = validateEDIFACT(kaputt)
  assert.equal(ergebnis.ok, false)
  assert.ok(ergebnis.fehler.some(f => f.segment === 'IAF' && /Summe der Einzelleistungen/.test(f.meldung)))
})

test('Summenabweichung zwischen GES und IAF wird erkannt', () => {
  const kaputt = gueltigeDatei().replace("GES+131,00+++131,00'", "GES+131,00+++150,00'")
  const ergebnis = validateEDIFACT(kaputt)
  assert.equal(ergebnis.ok, false)
  assert.ok(ergebnis.fehler.some(f => /Summenabgleich/.test(f.meldung)))
})

test('Mengen mit Nachkommastellen gehen sauber durch die Summenprüfung', () => {
  // 1,5 Stunden Betreuung à 30,00 € = 45,00 € (Preisobergrenze PfluV)
  const ergebnis = validateEDIFACT(gueltigeDatei({ einzelpreisCent: 3000, anzahl: 1.5 }))
  assert.equal(ergebnis.ok, true, ergebnis.fehler.map(f => f.meldung).join(' | '))
})

test('doppelte Belegnummer im selben Abrechnungslauf wird erkannt', () => {
  const datei = gueltigeDatei()
  const zeilen = datei.split('\n')
  const iafIndex = zeilen.findIndex(z => z.startsWith('IAF'))
  // Zweiter Fall mit derselben Belegnummer
  const zweiterFall = [
    "INV+A123456780+202608-001'",
    "NAD+Meier+Hans+19500101'",
    "MAN+202608+++2'",
    "ESK+06+1000'",
    "ELS+10:07:3:30+131,00+++00+1,00+999999999'",
    "IAF+131,00+++131,00'",
  ]
  const kaputt = [
    ...zeilen.slice(0, iafIndex + 1), ...zweiterFall, ...zeilen.slice(iafIndex + 1),
  ].join('\n')
  const ergebnis = validateEDIFACT(kaputt)
  assert.ok(ergebnis.fehler.some(f => /Belegnummer .* doppelt/.test(f.meldung)))
})

test('Abrechnungsfall ohne IAF-Abschluss wird erkannt', () => {
  const kaputt = gueltigeDatei().replace("IAF+131,00+++131,00'\n", '')
  const ergebnis = validateEDIFACT(kaputt)
  assert.equal(ergebnis.ok, false)
  assert.ok(ergebnis.fehler.some(f => /ohne IAF-Endesegment/.test(f.meldung)))
})

test('unbekannte Leistungsart im ELS wird abgelehnt', () => {
  const kaputt = gueltigeDatei().replace('ELS+10:07:3:30', 'ELS+77:07:3:30')
  const ergebnis = validateEDIFACT(kaputt)
  assert.equal(ergebnis.ok, false)
  assert.ok(ergebnis.fehler.some(f => f.segment === 'ELS' && /Art der Leistung/.test(f.meldung)))
})

test('unplausibler Pflegegrad wird abgelehnt', () => {
  const kaputt = gueltigeDatei().replace("MAN+202608+++3'", "MAN+202608+++6'")
  const ergebnis = validateEDIFACT(kaputt)
  assert.equal(ergebnis.ok, false)
  assert.ok(ergebnis.fehler.some(f => f.segment === 'MAN' && /Pflegegrad/.test(f.meldung)))
})

test('ungültiger Kalendertag im ESK wird abgelehnt, "99" aber akzeptiert', () => {
  const kaputt = gueltigeDatei().replace("ESK+05+0930'", "ESK+32+0930'")
  assert.equal(validateEDIFACT(kaputt).ok, false)

  const pauschale = gueltigeDatei().replace("ESK+05+0930'", "ESK+99'")
  assert.equal(validateEDIFACT(pauschale).ok, true)
})

test('nicht 9-stellige Beschäftigtennummer wird abgelehnt', () => {
  const kaputt = gueltigeDatei().replace('+999999999\'', '+9999\'')
  const ergebnis = validateEDIFACT(kaputt)
  assert.equal(ergebnis.ok, false)
  assert.ok(ergebnis.fehler.some(f => /Beschäftigtennummer/.test(f.meldung)))
})

test('fehlende Beschäftigtennummer ist nur eine Warnung, kein Fehler', () => {
  const ohne = gueltigeDatei().replace("+00+1,00+999999999'", "+00+1,00'")
  const ergebnis = validateEDIFACT(ohne)
  assert.equal(ergebnis.ok, true)
  assert.ok(ergebnis.warnungen.some(w => /Beschäftigtennummer/.test(w.meldung)))
})

test('Pflegekassen-IK ohne "18" am Anfang wird gewarnt, nicht blockiert', () => {
  // 460629986 ist eine gültige IK, aber keine Pflegekasse.
  const kaputt = gueltigeDatei()
    .replaceAll('+182171012+182171012+', '+460629986+460629986+')
  const ergebnis = validateEDIFACT(kaputt)
  assert.ok(ergebnis.warnungen.some(w => /beginnt nicht mit "18"/.test(w.meldung)))
})

test('Währung ungleich EUR wird abgelehnt', () => {
  const kaputt = gueltigeDatei().replaceAll('+1+EUR\'', '+1+CHF\'')
  const ergebnis = validateEDIFACT(kaputt)
  assert.equal(ergebnis.ok, false)
  assert.ok(ergebnis.fehler.some(f => /Währung/.test(f.meldung)))
})
