import { describe, it, expect } from 'vitest'
import { SgbVSpecFehltError, erzeugeSgbVDatei, exportImplementiert } from '../sgb-v/generator'

describe('§ 302 SGB V Generator', () => {
  it('exportImplementiert() gibt false zurück (TA1 fehlt)', () => {
    expect(exportImplementiert('edifact_slga_slla')).toBe(false)
  })

  it('erzeugeSgbVDatei() wirft SgbVSpecFehltError (fail-closed)', () => {
    expect(() => erzeugeSgbVDatei({
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
    })).toThrow(SgbVSpecFehltError)
  })

  it('SgbVSpecFehltError enthält code und format', () => {
    const err = new SgbVSpecFehltError('edifact_slga_slla', '1.0')
    expect(err.code).toBe('SGB_V_SPEC_FEHLT')
    expect(err.format).toBe('edifact_slga_slla')
    expect(err.taVersion).toBe('1.0')
    expect(err.message).toContain('gesperrt')
  })
})
