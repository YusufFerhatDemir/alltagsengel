// ═══════════════════════════════════════════════════════════════
// Welle 5b — § 302 SGB V Prüf-Export Tests
// ═══════════════════════════════════════════════════════════════
//
// Reine Funktionen: erzeugePruefExport, pruefExportAlsJson,
// pruefExportAlsCsv. Keine Supabase-Abhängigkeit.
// ═══════════════════════════════════════════════════════════════

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
  erzeugePruefExport,
  pruefExportAlsJson,
  pruefExportAlsCsv,
  PRUEF_EXPORT_HINWEIS,
  type PruefExport,
} from '../export-generator'

import type { HkpAufbereitung, HkpFall, HkpPosition, HkpAbgelehntePosition } from '../positionen'

// ---------------------------------------------------------------------------
// Testdaten
// ---------------------------------------------------------------------------

function position(overrides: Partial<HkpPosition> = {}): HkpPosition {
  return {
    leistung_id: 'l-1',
    client_id: 'k-1',
    klient_name: 'Max Mustermann',
    versichertennummer: 'A123456789',
    verordnung_id: 'v-1',
    verordnung_nummer: 'HKP-2026-001',
    aktenzeichen: 'AZ-123',
    kostentraeger_ik: '104593971',
    kostentraeger_name: 'AOK',
    datum: '2026-06-15',
    dauer_minuten: 60,
    leistungsart: 'behandlungspflege',
    betrag_cent: 3000,
    ...overrides,
  }
}

function fall(overrides: Partial<HkpFall> = {}): HkpFall {
  return {
    kostentraeger_ik: '104593971',
    kostentraeger_name: 'AOK',
    client_id: 'k-1',
    klient_name: 'Max Mustermann',
    versichertennummer: 'A123456789',
    positionen: [position()],
    betrag_cent: 3000,
    ...overrides,
  }
}

function aufbereitung(overrides: Partial<HkpAufbereitung> = {}): HkpAufbereitung {
  return {
    faelle: [fall()],
    abgelehnt: [],
    summe_cent: 3000,
    anzahl_positionen: 1,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// erzeugePruefExport
// ---------------------------------------------------------------------------

describe('erzeugePruefExport', () => {
  test('setzt Pflichtfelder korrekt', () => {
    const exp = erzeugePruefExport('lauf-1', '2026-08', aufbereitung(), '2026-08-24T12:00:00Z')
    assert.equal(exp.laufId, 'lauf-1')
    assert.equal(exp.abrechnungsmonat, '2026-08')
    assert.equal(exp.erzeugtAm, '2026-08-24T12:00:00Z')
    assert.equal(exp.hinweis, PRUEF_EXPORT_HINWEIS)
  })

  test('zaehlt Faelle und Positionen korrekt', () => {
    const zweiPositionen = fall({ positionen: [position({ leistung_id: 'l-1' }), position({ leistung_id: 'l-2' })] })
    const a = aufbereitung({ faelle: [zweiPositionen], anzahl_positionen: 2, summe_cent: 6000 })
    const exp = erzeugePruefExport('lauf-1', '2026-08', a, '2026-08-24T12:00:00Z')
    assert.equal(exp.anzahlFaelle, 1)
    assert.equal(exp.anzahlPositionen, 2)
    assert.equal(exp.gesamtbetragCent, 6000)
  })

  test('enthaelt abgelehnte Positionen', () => {
    const abg: HkpAbgelehntePosition = {
      leistung_id: 'l-99',
      client_id: 'k-1',
      klient_name: 'Anna',
      datum: '2026-06-15',
      problem: 'kein_betrag',
      hinweis: 'Betrag fehlt',
    }
    const a = aufbereitung({ abgelehnt: [abg] })
    const exp = erzeugePruefExport('lauf-1', '2026-08', a, '2026-08-24T12:00:00Z')
    assert.equal(exp.abgelehnt.length, 1)
    assert.equal(exp.abgelehnt[0].problem, 'kein_betrag')
  })

  test('leere Aufbereitung ergibt leeren Export', () => {
    const leer = aufbereitung({ faelle: [], abgelehnt: [], summe_cent: 0, anzahl_positionen: 0 })
    const exp = erzeugePruefExport('lauf-1', '2026-08', leer, '2026-08-24T12:00:00Z')
    assert.equal(exp.anzahlFaelle, 0)
    assert.equal(exp.anzahlPositionen, 0)
    assert.equal(exp.gesamtbetragCent, 0)
  })
})

// ---------------------------------------------------------------------------
// pruefExportAlsJson
// ---------------------------------------------------------------------------

describe('pruefExportAlsJson', () => {
  test('erzeugt gueltiges JSON', () => {
    const exp = erzeugePruefExport('lauf-1', '2026-08', aufbereitung(), '2026-08-24T12:00:00Z')
    const json = pruefExportAlsJson(exp)
    const parsed = JSON.parse(json) as PruefExport
    assert.equal(parsed.laufId, 'lauf-1')
    assert.ok(parsed.hinweis.includes('KEIN AMTLICHER'))
  })

  test('enthaelt Hinweistext im JSON', () => {
    const exp = erzeugePruefExport('lauf-1', '2026-08', aufbereitung(), '2026-08-24T12:00:00Z')
    const json = pruefExportAlsJson(exp)
    assert.ok(json.includes('KEIN AMTLICHER'))
  })
})

// ---------------------------------------------------------------------------
// pruefExportAlsCsv
// ---------------------------------------------------------------------------

describe('pruefExportAlsCsv', () => {
  test('erste Zeile enthaelt Hinweis', () => {
    const exp = erzeugePruefExport('lauf-1', '2026-08', aufbereitung(), '2026-08-24T12:00:00Z')
    const csv = pruefExportAlsCsv(exp)
    const zeilen = csv.split('\n')
    assert.ok(zeilen[0].includes('KEIN AMTLICHER'), 'Hinweis in der ersten Zeile')
  })

  test('zweite Zeile ist der Header', () => {
    const exp = erzeugePruefExport('lauf-1', '2026-08', aufbereitung(), '2026-08-24T12:00:00Z')
    const csv = pruefExportAlsCsv(exp)
    const zeilen = csv.split('\n')
    assert.ok(zeilen[1].includes('kostentraeger_ik'))
    assert.ok(zeilen[1].includes('klient_name'))
    assert.ok(zeilen[1].includes('betrag_cent'))
  })

  test('enthaelt eine Datenzeile pro Position', () => {
    const exp = erzeugePruefExport('lauf-1', '2026-08', aufbereitung(), '2026-08-24T12:00:00Z')
    const csv = pruefExportAlsCsv(exp)
    const zeilen = csv.split('\n')
    // Zeile 0: Hinweis, Zeile 1: Header, Zeile 2: Daten
    assert.equal(zeilen.length, 3)
    assert.ok(zeilen[2].includes('104593971'))
    assert.ok(zeilen[2].includes('3000'))
  })

  test('CSV-Injection-Schutz: Name mit = wird entschaerft', () => {
    const boeser = fall({
      klient_name: '=HYPERLINK("http://evil.com")',
      positionen: [position({ klient_name: '=HYPERLINK("http://evil.com")' })],
    })
    const a = aufbereitung({ faelle: [boeser] })
    const exp = erzeugePruefExport('lauf-1', '2026-08', a, '2026-08-24T12:00:00Z')
    const csv = pruefExportAlsCsv(exp)
    // csvZelle prefixed dangerous content with '
    assert.ok(!csv.includes('"=HYPERLINK'), 'Rohe Formel darf NICHT in der CSV stehen')
    assert.ok(csv.includes("'=HYPERLINK"), 'Entschärftes Prefix muss vorhanden sein')
  })

  test('Semikolon im Namen zerstoert keine Spalten', () => {
    const mitSemikolon = fall({
      klient_name: 'Müller; geb. Schmidt',
      positionen: [position({ klient_name: 'Müller; geb. Schmidt' })],
    })
    const a = aufbereitung({ faelle: [mitSemikolon] })
    const exp = erzeugePruefExport('lauf-1', '2026-08', a, '2026-08-24T12:00:00Z')
    const csv = pruefExportAlsCsv(exp)
    const datenzeile = csv.split('\n')[2]
    // csvZelle wraps in quotes, so the semicolon is inside quotes
    assert.ok(datenzeile.includes('"Müller; geb. Schmidt"'), 'Semikolon im Namen muss in Quotes stehen')
  })
})

// ---------------------------------------------------------------------------
// PRUEF_EXPORT_HINWEIS — Konsistenz
// ---------------------------------------------------------------------------

describe('PRUEF_EXPORT_HINWEIS', () => {
  test('enthaelt zentrale Warnbegriffe', () => {
    assert.ok(PRUEF_EXPORT_HINWEIS.includes('KEIN AMTLICHER'))
    assert.ok(PRUEF_EXPORT_HINWEIS.includes('302'))
    assert.ok(PRUEF_EXPORT_HINWEIS.includes('Prüf-Export'))
  })
})
