/**
 * SLGA/SLAA-Parser — Zahlen, Zeichensatz und kaputte Dateien
 *
 * `slga-parser.test.ts` prueft die Fachlogik: Typerkennung, Fehlergrade,
 * Positionen, Maskierung. Diese Suite nimmt sich die Ebene darunter vor —
 * die Stellen, an denen eine Antwortdatei nicht falsch VERSTANDEN, sondern
 * falsch GELESEN wird:
 *
 *   - Betragsformate, die still eine andere Zahl ergeben,
 *   - der Zeichensatz (UNOC:3 = ISO 8859-1) und deutsche Umlaute,
 *   - Dateien, die abgeschnitten, leer oder verdreht ankommen.
 *
 * Der gefaehrlichste Fehler dieser Klasse ist nicht der Absturz, sondern
 * die Zahl, die plausibel aussieht und falsch ist: sie laeuft ohne Warnung
 * bis in den Rueckläufer-Import und die Kontenklaerung.
 *
 * Laeuft mit: npm run test:unit (node:test).
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseEdifactAntwort, parseSlgaDatei } from '../slga-parser'

const ORG = '00000000-0000-4000-8000-000460629986'
const ACTOR = '11111111-1111-4111-8111-111111111111'
const ALLTAGSENGEL_IK = '460629986'
const BITMARCK_IK = '104593971'
const KKH_PFLEGEKASSE_IK = '182171012'

/** Antwortdatei der Kasse: Kopf + Nachrichten + Ende. */
function antwortDatei(nachrichten: string[], una = "UNA:+.? '"): string {
  return [
    una,
    `UNB+UNOC:3+${BITMARCK_IK}+${ALLTAGSENGEL_IK}+20260825:1030+00042++PL086001SEK+2'`,
    ...nachrichten,
    `UNZ+${nachrichten.filter(n => n.startsWith('UNH')).length}+00042'`,
  ].join('\n')
}

function slga(opt: { angefordert?: string; anerkannt?: string; fehler?: string[] } = {}): string[] {
  const inhalt = [
    `FKT+10++${ALLTAGSENGEL_IK}+${KKH_PFLEGEKASSE_IK}+${KKH_PFLEGEKASSE_IK}+${BITMARCK_IK}'`,
    "REC+AE-202608-01:0+20260819+1+EUR'",
    "SRD+36:06000+10'",
    `GES+${opt.angefordert ?? '131,00'}+++${opt.anerkannt ?? '131,00'}'`,
    ...(opt.fehler ?? []),
  ]
  return ["UNH+1+SLGA:6'", ...inhalt, `UNT+${inhalt.length + 2}+1'`]
}

/** Kurzform: nur die Betraege einer Ein-Nachrichten-Datei. */
function betraege(angefordert: string, anerkannt = '0,00') {
  const n = parseEdifactAntwort(antwortDatei(slga({ angefordert, anerkannt }))).nachrichten[0]
  return { brutto: n.betragAngefordertCent, anerkannt: n.betragAnerkanntCent }
}

// ═══════════════════════════════════════════════════════════════
// Betragsformate
// ═══════════════════════════════════════════════════════════════

test('das uebliche Format mit Dezimalkomma wird korrekt in Cent umgerechnet', () => {
  assert.equal(betraege('1234,56').brutto, 123_456)
  assert.equal(betraege('0,01').brutto, 1)
  assert.equal(betraege('0,00').brutto, 0)
})

test('ein Betrag ohne Nachkommastellen gilt als volle Euro', () => {
  assert.equal(
    betraege('12345').brutto, 1_234_500,
    '"12345" sind 12.345 Euro, nicht 123,45 Euro. Die andere Lesart waere '
    + 'ein Faktor 100 auf jeder Rueckmeldung ohne Komma.',
  )
})

test('grosse Betraege bleiben auf den Cent genau', () => {
  assert.equal(betraege('99999999,99').brutto, 9_999_999_999)
  assert.equal(
    betraege('8398,53').brutto, 839_853,
    'Klassischer Gleitkommafall: 8398.53 * 100 ist 839852.9999… — ohne '
    + 'Rundung faellt hier ein Cent weg.',
  )
})

test('ein leeres Betragsfeld ergibt "fehlt", nicht 0', () => {
  const n = parseEdifactAntwort(antwortDatei([
    "UNH+1+SLGA:6'",
    `FKT+10++${ALLTAGSENGEL_IK}+${KKH_PFLEGEKASSE_IK}+${KKH_PFLEGEKASSE_IK}+${BITMARCK_IK}'`,
    "GES+++'",
    "UNT+4+1'",
  ])).nachrichten[0]

  assert.equal(
    n.betragAngefordertCent, undefined,
    'Ein leeres Feld ist keine Null. Als 0 gelesen sieht eine unvollstaendige '
    + 'Meldung wie eine Komplettablehnung aus.',
  )
})

test('unlesbarer Text im Betragsfeld ergibt "fehlt", keine NaN', () => {
  const n = parseEdifactAntwort(antwortDatei([
    "UNH+1+SLGA:6'",
    `FKT+10++${ALLTAGSENGEL_IK}+${KKH_PFLEGEKASSE_IK}+${KKH_PFLEGEKASSE_IK}+${BITMARCK_IK}'`,
    "GES+keine Angabe+++131,00'",
    "UNT+4+1'",
  ])).nachrichten[0]

  assert.equal(n.betragAngefordertCent, undefined)
  assert.equal(n.betragAnerkanntCent, 13_100, 'Das zweite Feld bleibt lesbar.')
})

test('LUECKE: ein Tausenderpunkt macht aus 1.234,56 Euro stille 1,23 Euro', () => {
  // Belegtes Fehlverhalten von parseBetragCent: es wird nur das ERSTE Komma
  // durch einen Punkt ersetzt. Aus "1.234,56" wird "1.234.56", parseFloat
  // liest davon "1.234" und bricht ab — 123 Cent.
  //
  // EDIFACT kennt keinen Tausendertrenner, die Formate der Kassen sind
  // insofern regelkonform. Kritisch ist trotzdem das WIE des Scheiterns:
  // es kommt keine Warnung und kein `undefined`, sondern eine plausible,
  // um Faktor 1000 zu kleine Zahl. Die faellt in keiner Pruefung auf.
  //
  // Wer das reparieren will: alle Trennzeichen ausser dem letzten entfernen
  // und `serviceAdvice.dezimal` beruecksichtigen (siehe naechster Test).
  assert.equal(betraege('1.234,56').brutto, 123)
  assert.notEqual(betraege('1.234,56').brutto, 123_456)
})

test('LUECKE: ein nachgestelltes Minus wird verschluckt — die Rueckforderung wird zur Gutschrift', () => {
  // "123,45-" ist die in kaufmaennischen Formaten uebliche Schreibweise fuer
  // einen negativen Betrag. parseFloat("123.45-") liefert 123.45; das
  // Vorzeichen faellt weg. Eine Ruecknahme wuerde damit als Zahlung gelesen.
  //
  // Das voranstehende Minus wird dagegen korrekt uebernommen — der Parser
  // ist also nicht generell vorzeichenblind, nur bei dieser Schreibweise.
  assert.equal(betraege('123,45-').brutto, 12_345)
  assert.equal(betraege('-123,45').brutto, -12_345)
})

test('das Dezimalzeichen aus dem UNA wird beim Betrag NICHT ausgewertet', () => {
  // parseBetragCent ersetzt fest ein Komma. Dass eine Datei mit
  // `UNA:+.? '` (Dezimalpunkt) trotzdem richtig gelesen wird, liegt daran,
  // dass parseFloat den Punkt ohnehin versteht — nicht daran, dass der
  // Parser das UNA befragt hat.
  const datei = antwortDatei(slga({ angefordert: '1234.56' }), "UNA:+.? '")
  const antwort = parseEdifactAntwort(datei)

  assert.equal(antwort.serviceAdvice.dezimal, '.', 'Das UNA meldet den Punkt …')
  assert.equal(antwort.nachrichten[0].betragAngefordertCent, 123_456, '… und das Ergebnis stimmt zufaellig.')
})

// ═══════════════════════════════════════════════════════════════
// Zeichensatz und Umlaute
// ═══════════════════════════════════════════════════════════════

test('Umlaute und Sonderzeichen im Fehlertext kommen unveraendert an', () => {
  const n = parseEdifactAntwort(antwortDatei(slga({
    fehler: ["FHL+4711+Pflegegrad ungültig — Zuschläge für Groß & Söhne nicht anerkannt+E'"],
  }))).nachrichten[0]

  assert.equal(n.fehler[0].text, 'Pflegegrad ungültig — Zuschläge für Groß & Söhne nicht anerkannt')
})

test('das kaufmaennische Und trennt kein Feld', () => {
  // Kein EDIFACT-Trennzeichen, aber ein haeufiger Kandidat fuer
  // ueberambitionierte Zerlegung.
  const n = parseEdifactAntwort(antwortDatei(slga({
    fehler: ["FHL+4711+Müller & Partner GbR+E'"],
  }))).nachrichten[0]
  assert.equal(n.fehler[0].text, 'Müller & Partner GbR')
})

test('eine ISO-8859-1-kodierte Datei liefert nach korrekter Dekodierung dieselben Umlaute', () => {
  // UNB+UNOC:3 deklariert ISO 8859-1. Beide Aufrufer (der SFTP-Abruf in
  // lib/abrechnung/versand.ts und die Upload-Route) dekodieren mit
  // `new TextDecoder('iso-8859-1')`. Dieser Test haelt fest, dass der
  // Parser dahinter zeichengleich arbeitet — und dass die falsche
  // Dekodierung als UTF-8 den Text hoerbar zerstoert, statt still
  // durchzurutschen.
  const text = antwortDatei(slga({ fehler: ["FHL+4711+Zuschläge für Größe+E'"] }))
  const bytes = Buffer.from(text, 'latin1')

  const richtig = new TextDecoder('iso-8859-1').decode(bytes)
  assert.equal(
    parseEdifactAntwort(richtig).nachrichten[0].fehler[0].text,
    'Zuschläge für Größe',
  )

  const falsch = new TextDecoder('utf-8').decode(bytes)
  assert.notEqual(
    parseEdifactAntwort(falsch).nachrichten[0].fehler[0].text,
    'Zuschläge für Größe',
    'Als UTF-8 gelesen muessen die Umlaute kaputtgehen. Waere das hier gleich, '
    + 'haette der Test keine Aussagekraft ueber die Dekodierung.',
  )
})

test('Zeilenumbrueche zwischen Segmenten aendern nichts am Ergebnis', () => {
  const mitUmbruch = antwortDatei(slga())
  const ohneUmbruch = mitUmbruch.replace(/\n/g, '')
  const einzeilig = parseEdifactAntwort(ohneUmbruch)
  const mehrzeilig = parseEdifactAntwort(mitUmbruch)

  assert.equal(einzeilig.nachrichten.length, mehrzeilig.nachrichten.length)
  assert.equal(
    einzeilig.nachrichten[0].betragAngefordertCent,
    mehrzeilig.nachrichten[0].betragAngefordertCent,
  )
})

test('CRLF-Zeilenenden aus Windows-Uebertragungen werden mitverarbeitet', () => {
  const antwort = parseEdifactAntwort(antwortDatei(slga()).replace(/\n/g, '\r\n'))
  assert.equal(antwort.nachrichten.length, 1)
  assert.equal(antwort.absenderIk, BITMARCK_IK)
})

// ═══════════════════════════════════════════════════════════════
// Kaputte und ungewoehnliche Dateien
// ═══════════════════════════════════════════════════════════════

test('eine leere Datei liefert ein Ergebnis mit zwei Warnungen, keinen Absturz', () => {
  const antwort = parseEdifactAntwort('')

  assert.equal(antwort.nachrichten.length, 0)
  assert.equal(antwort.absenderIk, '')
  assert.equal(antwort.warnungen.length, 2)
  assert.match(antwort.warnungen[0], /UNB-Segment nicht gefunden/)
  assert.match(antwort.warnungen[1], /Keine SLGA\/SLAA-Nachrichten/)
})

test('reiner Datenmuell ergibt keine Nachrichten und keine erfundenen IKs', () => {
  const antwort = parseEdifactAntwort('Dies ist ein Brief, keine EDIFACT-Datei.')
  assert.equal(antwort.nachrichten.length, 0)
  assert.equal(antwort.absenderIk, '')
  assert.equal(antwort.empfaengerIk, '')
})

test('ein UNT ohne vorangehendes UNH erzeugt keine Geisternachricht', () => {
  const antwort = parseEdifactAntwort(antwortDatei(["UNT+4+00001'"]))
  assert.equal(
    antwort.nachrichten.length, 0,
    'Ein Nachrichtenende ohne Anfang darf keine leere Nachricht in den Import '
    + 'schieben — die haette weder Betrag noch Kostentraeger.',
  )
})

test('eine mitten im Segment abgeschnittene Datei wird als unvollstaendig gemeldet', () => {
  const voll = antwortDatei(slga())
  const abgeschnitten = voll.slice(0, voll.indexOf("GES+") + 8)
  const antwort = parseEdifactAntwort(abgeschnitten)

  assert.equal(antwort.nachrichten.length, 1)
  assert.ok(
    antwort.warnungen.some(w => /UNT-Segment fehlt/.test(w)),
    'Der abgeschnittene Rest wird verarbeitet, aber die Luecke muss in den '
    + 'Warnungen stehen — sonst gilt eine halbe Datei als vollstaendig.',
  )
})

test('LUECKE: ein UTF-8-BOM vor dem UNA laesst die Trennzeichen-Vereinbarung verfallen', () => {
  // `parseUNA` prueft mit startsWith('UNA'). Steht ein BOM (oder Leerraum)
  // davor, greift die Vereinbarung nicht und der Parser arbeitet mit den
  // Standardzeichen weiter.
  //
  // Solange die Datei ohnehin die Standardzeichen benutzt — der Normalfall
  // im GKV-Datenaustausch — bleibt das folgenlos. Eine Datei mit
  // ABWEICHENDEN Trennzeichen UND BOM waere dagegen unlesbar.
  const mitBom = '﻿' + antwortDatei(slga())
  const antwort = parseEdifactAntwort(mitBom)

  assert.equal(antwort.serviceAdvice.segment, "'", 'Standardzeichen statt der Vereinbarung aus dem UNA.')
  assert.equal(antwort.nachrichten.length, 1, 'Bei Standardzeichen faellt es nicht auf …')

  const exotisch = '﻿' + antwortDatei(slga(), 'UNA:+.? ~').replace(/'/g, '~')
  assert.equal(
    parseEdifactAntwort(exotisch).nachrichten.length, 0,
    '… mit abweichendem Segmentterminator schon: die Datei wird gar nicht mehr zerlegt.',
  )
})

test('ohne BOM wird derselbe abweichende Segmentterminator korrekt uebernommen', () => {
  // Gegenprobe zum Test darueber: nur das BOM ist das Problem, nicht das
  // exotische Trennzeichen.
  const exotisch = antwortDatei(slga(), 'UNA:+.? ~').replace(/'/g, '~')
  const antwort = parseEdifactAntwort(exotisch)

  assert.equal(antwort.serviceAdvice.segment, '~')
  assert.equal(antwort.nachrichten.length, 1)
  assert.equal(antwort.absenderIk, BITMARCK_IK)
})

test('eine Datei ohne einzige Nachricht erzeugt keine Importe', () => {
  const { antwort, importe } = parseSlgaDatei(antwortDatei([]), ORG, ACTOR)
  assert.equal(importe.length, 0)
  assert.ok(antwort.warnungen.length > 0, 'Null Importe ohne Warnung waere nicht von "alles in Ordnung" zu unterscheiden.')
})

test('Mandantenkennung und Akteur landen auf jedem Import, auch bei mehreren Nachrichten', () => {
  const { importe } = parseSlgaDatei(
    antwortDatei([...slga(), ...slga({ angefordert: '99,00' })]),
    ORG, ACTOR, 'antwort.edi', 'ruecklaeufer/antwort.edi',
  )

  assert.equal(importe.length, 2)
  for (const imp of importe) {
    assert.equal(imp.organizationId, ORG)
    assert.equal(imp.actorId, ACTOR)
    assert.equal(imp.quelldateiName, 'antwort.edi')
    assert.equal(imp.quelldateiUrl, 'ruecklaeufer/antwort.edi')
  }
})
