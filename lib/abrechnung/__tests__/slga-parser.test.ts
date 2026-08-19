/**
 * Tests für den Rückläufer-Parser (SLGA/SLAA-Antworten der Kassen).
 *
 * Der Rückläufer ist die einzige Rückmeldung, die eine Kasse zu einer
 * Abrechnung gibt. Wird er falsch gelesen, gilt eine abgelehnte Rechnung
 * als bezahlt (oder umgekehrt) — beides fällt erst bei der Kontenklärung
 * auf, Monate später. Deshalb prüfen diese Tests vor allem die
 * Typerkennung und die Betragsübernahme.
 *
 * Läuft mit: npm run test:unit (node:test).
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseEdifactAntwort, konvertiereZuImportParams, parseSlgaDatei } from '../slga-parser'

const ORG = '00000000-0000-4000-8000-000460629986'
const ACTOR = '11111111-1111-4111-8111-111111111111'
const ALLTAGSENGEL_IK = '460629986'
const BITMARCK_IK = '104593971'
const KKH_PFLEGEKASSE_IK = '182171012'

/** Antwortdatei der Kasse: Kopf + Nachrichten + Ende. */
function antwortDatei(nachrichten: string[]): string {
  return [
    "UNA:+.? '",
    `UNB+UNOC:3+${BITMARCK_IK}+${ALLTAGSENGEL_IK}+20260825:1030+00042++PL086001SEK+2'`,
    ...nachrichten,
    `UNZ+${nachrichten.filter(n => n.startsWith('UNH')).length}+00042'`,
  ].join('\n')
}

/** SLGA-Antwort auf eine Gesamtaufstellung. */
function slga(opt: {
  vkz?: string
  angefordert?: string
  anerkannt?: string
  fehler?: string[]
} = {}): string[] {
  const inhalt = [
    `FKT+${opt.vkz ?? '10'}++${ALLTAGSENGEL_IK}+${KKH_PFLEGEKASSE_IK}+${KKH_PFLEGEKASSE_IK}+${BITMARCK_IK}'`,
    "REC+AE-202608-01:0+20260819+1+EUR'",
    "SRD+36:06000+10'",
    `GES+${opt.angefordert ?? '131,00'}+++${opt.anerkannt ?? '131,00'}'`,
    ...(opt.fehler ?? []),
  ]
  return ["UNH+1+SLGA:6'", ...inhalt, `UNT+${inhalt.length + 2}+1'`]
}

// ── Kopfdaten ───────────────────────────────────────────────────

test('parseEdifactAntwort liest Absender, Empfänger und Referenz aus dem UNB', () => {
  const antwort = parseEdifactAntwort(antwortDatei(slga()))
  assert.equal(antwort.absenderIk, BITMARCK_IK)
  assert.equal(antwort.empfaengerIk, ALLTAGSENGEL_IK)
  assert.equal(antwort.datenaustauschreferenz, '00042')
  assert.equal(antwort.erstelldatum, '20260825')
  assert.deepEqual(antwort.warnungen, [])
})

test('parseEdifactAntwort übernimmt abweichende Trennzeichen aus dem UNA', () => {
  // Manche Absender liefern mit "*" als Elementtrenner.
  const datei = "UNA:*.? '"
    + `UNB*UNOC:3*${BITMARCK_IK}*${ALLTAGSENGEL_IK}*20260825:1030*00042**PL086001SEK*2'`
    + "UNH*1*SLGA:6'"
    + `FKT*10**${ALLTAGSENGEL_IK}*${KKH_PFLEGEKASSE_IK}*${KKH_PFLEGEKASSE_IK}*${BITMARCK_IK}'`
    + "UNT*3*1'UNZ*1*00042'"
  const antwort = parseEdifactAntwort(datei)
  assert.equal(antwort.serviceAdvice.element, '*')
  assert.equal(antwort.absenderIk, BITMARCK_IK)
  assert.equal(antwort.nachrichten.length, 1)
})

test('fehlendes UNB wird gemeldet, nicht still übergangen', () => {
  const antwort = parseEdifactAntwort("UNH+1+SLGA:6'FKT+10'UNT+3+1'")
  assert.ok(antwort.warnungen.some(w => /UNB-Segment nicht gefunden/.test(w)))
})

test('eine Datei ohne SLGA/SLAA-Nachricht wird als solche gemeldet', () => {
  const antwort = parseEdifactAntwort(antwortDatei([]))
  assert.equal(antwort.nachrichten.length, 0)
  assert.ok(antwort.warnungen.some(w => /Keine SLGA\/SLAA-Nachrichten/.test(w)))
})

test('fehlendes UNT bricht die Verarbeitung nicht ab, wird aber gemeldet', () => {
  const datei = "UNA:+.? '"
    + `UNB+UNOC:3+${BITMARCK_IK}+${ALLTAGSENGEL_IK}+20260825:1030+00042++PL086001SEK+2'`
    + "UNH+1+SLGA:6'"
    + `FKT+10++${ALLTAGSENGEL_IK}+${KKH_PFLEGEKASSE_IK}+${KKH_PFLEGEKASSE_IK}+${BITMARCK_IK}'`
  const antwort = parseEdifactAntwort(datei)
  assert.equal(antwort.nachrichten.length, 1)
  assert.ok(antwort.warnungen.some(w => /UNT-Segment fehlt/.test(w)))
})

// ── IK-Positionen: SLGA und SLAA haben unterschiedliche FKT-Aufbauten ──

test('SLGA liest die IKs aus den Feldern hinter dem Sammelrechnungskennzeichen', () => {
  const n = parseEdifactAntwort(antwortDatei(slga())).nachrichten[0]
  assert.equal(n.typ, 'SLGA')
  assert.equal(n.leistungserbringerIk, ALLTAGSENGEL_IK)
  assert.equal(n.kostentraegerIk, KKH_PFLEGEKASSE_IK)
  assert.equal(n.verarbeitungskennzeichen, '10')
})

test('SLAA liest die IKs ein Feld weiter vorn (kein Sammelrechnungsfeld)', () => {
  const inhalt = [
    `FKT+10+${ALLTAGSENGEL_IK}+${KKH_PFLEGEKASSE_IK}+${KKH_PFLEGEKASSE_IK}+${ALLTAGSENGEL_IK}'`,
    "REC+AE-202608-01:0+20260819+1+EUR'",
    "INV+A123456780+202608-001'",
    "IAF+131,00+++131,00'",
  ]
  const n = parseEdifactAntwort(antwortDatei([
    "UNH+1+SLAA:6'", ...inhalt, `UNT+${inhalt.length + 2}+1'`,
  ])).nachrichten[0]

  assert.equal(n.typ, 'SLAA')
  assert.equal(n.leistungserbringerIk, ALLTAGSENGEL_IK)
  assert.equal(n.kostentraegerIk, KKH_PFLEGEKASSE_IK)
  assert.equal(n.versichertennummer, 'A123456780')
  assert.equal(n.belegnummer, '202608-001')
})

// ── Beträge ─────────────────────────────────────────────────────

test('Beträge aus GES werden in Cent umgerechnet', () => {
  const n = parseEdifactAntwort(antwortDatei(slga({ angefordert: '353,90', anerkannt: '300,00' }))).nachrichten[0]
  assert.equal(n.betragAngefordertCent, 35390)
  assert.equal(n.betragAnerkanntCent, 30000)
})

test('große Beträge bleiben exakt (Rundungsfehler bei Gleitkomma)', () => {
  // 3539,00 € = VP/KZP Jahresbetrag
  const n = parseEdifactAntwort(antwortDatei(slga({ angefordert: '3539,00', anerkannt: '3539,00' }))).nachrichten[0]
  assert.equal(n.betragAngefordertCent, 353900)
  assert.equal(n.betragAnerkanntCent, 353900)
})

test('Ablehnung mit 0,00 € anerkannt wird als Betrag 0 gelesen, nicht als "fehlt"', () => {
  const n = parseEdifactAntwort(antwortDatei(slga({
    angefordert: '131,00', anerkannt: '0,00',
    fehler: ["FHL+4711+Versicherter nicht bei uns versichert+E+INV'"],
  }))).nachrichten[0]
  assert.equal(n.betragAnerkanntCent, 0)
})

// ── Fehlersegmente ──────────────────────────────────────────────

test('FHL-Segmente werden mit Code, Text und Schweregrad übernommen', () => {
  const n = parseEdifactAntwort(antwortDatei(slga({
    fehler: [
      "FHL+4711+Versichertennummer unbekannt+E+INV+3'",
      "FHL+0815+Hinweis zur Folgeabrechnung+I'",
    ],
  }))).nachrichten[0]

  assert.equal(n.fehler.length, 2)
  assert.deepEqual(n.fehler[0], {
    code: '4711', text: 'Versichertennummer unbekannt', schwere: 'E', segment: 'INV', position: 3,
  })
  assert.equal(n.fehler[1].schwere, 'I')
  assert.equal(n.fehler[1].segment, undefined)
})

test('unbekannter Schweregrad wird als Fehler gewertet, nicht als Hinweis', () => {
  // Im Zweifel die strengere Lesart: ein übersehener Fehler kostet Geld.
  const n = parseEdifactAntwort(antwortDatei(slga({
    fehler: ["FHL+4711+Irgendetwas+X'"],
  }))).nachrichten[0]
  assert.equal(n.fehler[0].schwere, 'E')
})

// ── Typerkennung ────────────────────────────────────────────────

test('voll anerkannte Rechnung ohne Fehler ist ein Zahlungsavis', () => {
  const { importe } = parseSlgaDatei(antwortDatei(slga()), ORG, ACTOR)
  assert.equal(importe.length, 1)
  assert.equal(importe[0].ruecklaeuferTyp, 'zahlungsavis')
  assert.equal(importe[0].betragAngefordertCent, 13100)
  assert.equal(importe[0].betragAnerkannt_cent, 13100)
})

test('gekürzte Rechnung ist ein Abrechnungsergebnis, kein Zahlungsavis', () => {
  const { importe } = parseSlgaDatei(
    antwortDatei(slga({ angefordert: '131,00', anerkannt: '100,00' })), ORG, ACTOR,
  )
  assert.equal(importe[0].ruecklaeuferTyp, 'abrechnungsergebnis')
})

test('Verarbeitungskennzeichen 11 ist immer eine Fehlermeldung', () => {
  const { importe } = parseSlgaDatei(antwortDatei(slga({ vkz: '11' })), ORG, ACTOR)
  assert.equal(importe[0].ruecklaeuferTyp, 'fehlermeldung')
})

test('ein Fehler vom Schweregrad E macht die Rückmeldung zur Fehlermeldung', () => {
  const { importe } = parseSlgaDatei(antwortDatei(slga({
    fehler: ["FHL+4711+Versicherter unbekannt+E+INV'"],
  })), ORG, ACTOR)
  assert.equal(importe[0].ruecklaeuferTyp, 'fehlermeldung')
})

test('ein reiner Hinweis macht aus einem Zahlungsavis keine Fehlermeldung', () => {
  const { importe } = parseSlgaDatei(antwortDatei(slga({
    fehler: ["FHL+0815+Bitte künftig Beschäftigtennummer angeben+I'"],
  })), ORG, ACTOR)
  assert.notEqual(importe[0].ruecklaeuferTyp, 'fehlermeldung')
  assert.deepEqual(importe[0].hinweise, ['[0815] Bitte künftig Beschäftigtennummer angeben'])
})

test('Quittung ohne Beträge ist eine Annahmebestätigung', () => {
  const inhalt = [`FKT+10++${ALLTAGSENGEL_IK}+${KKH_PFLEGEKASSE_IK}+${KKH_PFLEGEKASSE_IK}+${BITMARCK_IK}'`]
  const { importe } = parseSlgaDatei(
    antwortDatei(["UNH+1+SLGA:6'", ...inhalt, `UNT+${inhalt.length + 2}+1'`]), ORG, ACTOR,
  )
  assert.equal(importe[0].ruecklaeuferTyp, 'annahmebestaetigung')
})

// ── Technische Fehler ───────────────────────────────────────────

test('Fehler an einem Servicesegment gilt als technisch und bekommt T-Präfix', () => {
  // Das T-Präfix ist die Konvention, an der die Heuristik in
  // ruecklaeufer-fehlercodes.ts technische Fehler wiedererkennt.
  const { importe } = parseSlgaDatei(antwortDatei(slga({
    vkz: '11', fehler: ["FHL+9001+Datei nicht entschlüsselbar+E+UNB'"],
  })), ORG, ACTOR)
  assert.equal(importe[0].fehlerCode, 'T9001')
})

test('fachlicher Fehler behält seinen Code ohne Präfix', () => {
  const { importe } = parseSlgaDatei(antwortDatei(slga({
    vkz: '11', fehler: ["FHL+4711+Versicherter unbekannt+E+INV'"],
  })), ORG, ACTOR)
  assert.equal(importe[0].fehlerCode, '4711')
})

// ── Positionen ──────────────────────────────────────────────────

test('EHK-Segmente werden als gekürzte oder abgelehnte Positionen gelesen', () => {
  const inhalt = [
    `FKT+10+${ALLTAGSENGEL_IK}+${KKH_PFLEGEKASSE_IK}+${KKH_PFLEGEKASSE_IK}+${ALLTAGSENGEL_IK}'`,
    "INV+A123456780+202608-001'",
    "EHK+10:07:3:30+100,00+Betrag über Höchstsatz'",
    "EHK+01:02:8:45+0,00+Leistung nicht genehmigt'",
    "IAF+131,00+++100,00'",
  ]
  const n = parseEdifactAntwort(antwortDatei([
    "UNH+1+SLAA:6'", ...inhalt, `UNT+${inhalt.length + 2}+1'`,
  ])).nachrichten[0]

  assert.equal(n.positionen.length, 2)
  assert.equal(n.positionen[0].status, 'gekuerzt')
  assert.equal(n.positionen[0].betragAnerkanntCent, 10000)
  assert.equal(n.positionen[0].kuerzungsgrund, 'Betrag über Höchstsatz')
  assert.equal(n.positionen[1].status, 'abgelehnt')
  assert.equal(n.positionen[1].betragAnerkanntCent, 0)
})

test('EHK ohne Kürzungsgrund gilt als angenommen', () => {
  const inhalt = [
    `FKT+10+${ALLTAGSENGEL_IK}+${KKH_PFLEGEKASSE_IK}+${KKH_PFLEGEKASSE_IK}+${ALLTAGSENGEL_IK}'`,
    "EHK+10:07:3:30+131,00'",
    "IAF+131,00+++131,00'",
  ]
  const n = parseEdifactAntwort(antwortDatei([
    "UNH+1+SLAA:6'", ...inhalt, `UNT+${inhalt.length + 2}+1'`,
  ])).nachrichten[0]
  assert.equal(n.positionen[0].status, 'angenommen')
})

test('Positionen werden fortlaufend nummeriert in den Import übernommen', () => {
  const inhalt = [
    `FKT+10+${ALLTAGSENGEL_IK}+${KKH_PFLEGEKASSE_IK}+${KKH_PFLEGEKASSE_IK}+${ALLTAGSENGEL_IK}'`,
    "EHK+10:07:3:30+100,00+Gekürzt'",
    "EHK+01:02:8:45+50,00+Gekürzt'",
    "IAF+200,00+++150,00'",
  ]
  const { importe } = parseSlgaDatei(antwortDatei([
    "UNH+1+SLAA:6'", ...inhalt, `UNT+${inhalt.length + 2}+1'`,
  ]), ORG, ACTOR)

  assert.deepEqual(importe[0].positionen?.map(p => p.positionNummer), [1, 2])
  assert.equal(importe[0].positionen?.[0].leistungsart, '10')
})

// ── Mehrere Nachrichten in einer Datei ──────────────────────────

test('mehrere Nachrichten ergeben mehrere Importe', () => {
  const zweite = [
    "UNH+2+SLGA:6'",
    `FKT+11++${ALLTAGSENGEL_IK}+${KKH_PFLEGEKASSE_IK}+${KKH_PFLEGEKASSE_IK}+${BITMARCK_IK}'`,
    "REC+AE-202608-02:0+20260819+1+EUR'",
    "GES+50,00+++0,00'",
    "FHL+4711+Versicherter unbekannt+E+INV'",
    "UNT+6+2'",
  ]
  const { antwort, importe } = parseSlgaDatei(antwortDatei([...slga(), ...zweite]), ORG, ACTOR)

  assert.equal(antwort.nachrichten.length, 2)
  assert.equal(importe.length, 2)
  assert.equal(importe[0].ruecklaeuferTyp, 'zahlungsavis')
  assert.equal(importe[1].ruecklaeuferTyp, 'fehlermeldung')
  assert.deepEqual(importe[1].ablehnungsgruende, ['[4711] Versicherter unbekannt'])
})

// ── Import-Parameter ────────────────────────────────────────────

test('Import trägt Organisation, Akteur und Quelldatei mit', () => {
  const { importe } = parseSlgaDatei(
    antwortDatei(slga()), ORG, ACTOR, 'ANTWORT.EDI', 'dta/org/lauf/ANTWORT.EDI', 'lauf-1',
  )
  assert.equal(importe[0].organizationId, ORG)
  assert.equal(importe[0].actorId, ACTOR)
  assert.equal(importe[0].quelldateiName, 'ANTWORT.EDI')
  assert.equal(importe[0].quelldateiUrl, 'dta/org/lauf/ANTWORT.EDI')
  assert.equal(importe[0].laufId, 'lauf-1')
})

test('Rohtext der Meldung wird unverändert mitgeführt (Nachweis)', () => {
  const datei = antwortDatei(slga())
  const { importe } = parseSlgaDatei(datei, ORG, ACTOR)
  assert.equal(importe[0].originalMeldung, datei)
})

test('ohne Kostenträger-IK in der Nachricht fällt der Import auf den Absender zurück', () => {
  const inhalt = ["FKT+10'", "GES+131,00+++131,00'"]
  const importe = konvertiereZuImportParams(
    parseEdifactAntwort(antwortDatei(["UNH+1+SLGA:6'", ...inhalt, `UNT+${inhalt.length + 2}+1'`])),
    ORG, ACTOR,
  )
  assert.equal(importe[0].kostentraegerIk, BITMARCK_IK)
})

test('maskierte Trennzeichen im Fehlertext bleiben erhalten', () => {
  const n = parseEdifactAntwort(antwortDatei(slga({
    fehler: ["FHL+4711+Betrag ?+ Zuschlag unzulässig+E'"],
  }))).nachrichten[0]
  assert.equal(n.fehler[0].text, 'Betrag + Zuschlag unzulässig')
})

test('maskierter Komponententrenner im Fehlertext trennt kein Feld', () => {
  const n = parseEdifactAntwort(antwortDatei(slga({
    fehler: ["FHL+4711+Pruefung ?: Betrag zu hoch+E'"],
  }))).nachrichten[0]
  assert.equal(n.fehler[0].text, 'Pruefung : Betrag zu hoch')
  assert.equal(n.fehler[0].schwere, 'E')
})

test('maskierter Segmentterminator im Fehlertext beendet kein Segment', () => {
  const n = parseEdifactAntwort(antwortDatei(slga({
    fehler: ["FHL+4711+Pflegekasse O?'Neill unbekannt+E+INV'"],
  }))).nachrichten[0]
  assert.equal(n.fehler[0].text, "Pflegekasse O'Neill unbekannt")
  assert.equal(n.fehler[0].segment, 'INV')
})

test('verdoppeltes Freigabezeichen ergibt ein einzelnes Fragezeichen', () => {
  const n = parseEdifactAntwort(antwortDatei(slga({
    fehler: ["FHL+4711+Betrag korrekt?? Bitte pruefen+W'"],
  }))).nachrichten[0]
  assert.equal(n.fehler[0].text, 'Betrag korrekt? Bitte pruefen')
})

test('ein maskierter Trenner verschiebt die Folgefelder nicht', () => {
  // Der eigentliche Schaden des alten Verhaltens: nicht nur der Text war
  // abgeschnitten — alles dahinter rutschte ein Feld nach vorn, sodass der
  // Schweregrad im Segmentfeld landete.
  const n = parseEdifactAntwort(antwortDatei(slga({
    fehler: ["FHL+4711+Betrag ?+ Zuschlag+E+IAF+7'"],
  }))).nachrichten[0]
  assert.deepEqual(n.fehler[0], {
    code: '4711', text: 'Betrag + Zuschlag', schwere: 'E', segment: 'IAF', position: 7,
  })
})
