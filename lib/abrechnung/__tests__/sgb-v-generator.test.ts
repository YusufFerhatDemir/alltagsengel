import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SgbVSpecFehltError, erzeugeSgbVDatei, exportImplementiert } from '../sgb-v/generator'

test('exportImplementiert() gibt false zurück (TA1 fehlt)', () => {
  assert.equal(exportImplementiert('edifact_slga_slla'), false)
})

test('erzeugeSgbVDatei() wirft SgbVSpecFehltError (fail-closed)', () => {
  assert.throws(() => erzeugeSgbVDatei({
    aufbereitung: { faelle: [], gesamtbetragCent: 0, anzahlPositionen: 0, warnungen: [] } as any,
    version: {
      id: 'v-1',
      format: 'edifact_slga_slla',
      ta_version: '1.0',
      bezeichnung: 'Test',
      gueltig_ab: '2026-01-01',
      gueltig_bis: null,
      spec_bestaetigt: false,
      spec_quelle: null,
      organization_id: null,
      erstellt_am: '2026-01-01',
    },
    absenderIk: '460629986',
    datenannahmestelleIk: '960111234',
    abrechnungsmonat: '202608',
    dateiindikator: '0',
  }), SgbVSpecFehltError)
})

test('SgbVSpecFehltError enthält code und format', () => {
  const err = new SgbVSpecFehltError('edifact_slga_slla', '1.0')
  assert.equal(err.code, 'SGB_V_SPEC_FEHLT')
  assert.equal(err.format, 'edifact_slga_slla')
  assert.equal(err.taVersion, '1.0')
  assert.ok(err.message.includes('gesperrt'))
})
