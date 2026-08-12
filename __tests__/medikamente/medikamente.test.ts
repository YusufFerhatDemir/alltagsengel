import { describe, it, expect } from 'vitest'
import {
  validiereMedikament,
  validiereKategorie,
  validiereStatus,
  einnahmeZeiten,
  istAbgelaufen,
} from '@/lib/medikamente/medikamente'
import type { Medikament } from '@/lib/medikamente/types'

describe('validiereMedikament', () => {
  const basis = {
    client_id: '00000000-0000-0000-0000-000000000001',
    medikament_name: 'Metoprolol',
    dosierung: '50',
    einheit: 'mg',
    einnahme_morgens: true,
  }

  it('akzeptiert vollständige Eingabe', () => {
    expect(() => validiereMedikament(basis)).not.toThrow()
  })

  it('wirft bei fehlendem Namen', () => {
    expect(() => validiereMedikament({ ...basis, medikament_name: '' })).toThrow('Pflichtfeld')
  })

  it('wirft bei fehlender Dosierung', () => {
    expect(() => validiereMedikament({ ...basis, dosierung: '' })).toThrow('Pflichtfeld')
  })

  it('wirft bei fehlender client_id', () => {
    expect(() => validiereMedikament({ ...basis, client_id: '' })).toThrow('Klient')
  })

  it('wirft bei keiner Einnahmezeit', () => {
    expect(() => validiereMedikament({ ...basis, einnahme_morgens: false })).toThrow('Einnahmezeit')
  })

  it('akzeptiert gültige PZN', () => {
    expect(() => validiereMedikament({ ...basis, pzn: '1234567' })).not.toThrow()
    expect(() => validiereMedikament({ ...basis, pzn: '12345678' })).not.toThrow()
  })

  it('wirft bei ungültiger PZN', () => {
    expect(() => validiereMedikament({ ...basis, pzn: '123' })).toThrow('PZN')
    expect(() => validiereMedikament({ ...basis, pzn: 'ABCDEFG' })).toThrow('PZN')
  })

  it('wirft bei Enddatum vor Beginndatum', () => {
    expect(() => validiereMedikament({
      ...basis, beginn_datum: '2026-09-01', end_datum: '2026-08-01',
    })).toThrow('Enddatum')
  })

  it('akzeptiert konsistente Datumsangaben', () => {
    expect(() => validiereMedikament({
      ...basis, beginn_datum: '2026-08-01', end_datum: '2026-09-01',
    })).not.toThrow()
  })
})

describe('validiereKategorie', () => {
  it('akzeptiert gültige Kategorien', () => {
    expect(() => validiereKategorie('herz_kreislauf')).not.toThrow()
    expect(() => validiereKategorie('sonstige')).not.toThrow()
  })

  it('wirft bei ungültiger Kategorie', () => {
    expect(() => validiereKategorie('xyz')).toThrow('Ungültige Kategorie')
  })
})

describe('validiereStatus', () => {
  it('akzeptiert gültige Status', () => {
    expect(() => validiereStatus('aktiv')).not.toThrow()
    expect(() => validiereStatus('pausiert')).not.toThrow()
    expect(() => validiereStatus('abgesetzt')).not.toThrow()
  })

  it('wirft bei ungültigem Status', () => {
    expect(() => validiereStatus('geloescht')).toThrow('Ungültiger Status')
  })
})

describe('einnahmeZeiten', () => {
  it('gibt korrekte Zeiten zurück', () => {
    const m = {
      einnahme_morgens: true, einnahme_mittags: false,
      einnahme_abends: true, einnahme_nachts: false,
    } as Medikament
    expect(einnahmeZeiten(m)).toEqual(['morgens', 'abends'])
  })

  it('gibt alle Zeiten zurück', () => {
    const m = {
      einnahme_morgens: true, einnahme_mittags: true,
      einnahme_abends: true, einnahme_nachts: true,
    } as Medikament
    expect(einnahmeZeiten(m)).toEqual(['morgens', 'mittags', 'abends', 'nachts'])
  })

  it('gibt leeres Array bei keiner Zeit', () => {
    const m = {
      einnahme_morgens: false, einnahme_mittags: false,
      einnahme_abends: false, einnahme_nachts: false,
    } as Medikament
    expect(einnahmeZeiten(m)).toEqual([])
  })
})

describe('istAbgelaufen', () => {
  it('gibt false für Dauermedikation', () => {
    expect(istAbgelaufen({ dauermedikation: true, end_datum: '2020-01-01' } as Medikament)).toBe(false)
  })

  it('gibt false ohne Enddatum', () => {
    expect(istAbgelaufen({ dauermedikation: false, end_datum: null } as Medikament)).toBe(false)
  })

  it('gibt true bei abgelaufenem Enddatum', () => {
    expect(istAbgelaufen({ dauermedikation: false, end_datum: '2020-01-01' } as Medikament)).toBe(true)
  })

  it('gibt false bei zukünftigem Enddatum', () => {
    expect(istAbgelaufen({ dauermedikation: false, end_datum: '2030-12-31' } as Medikament)).toBe(false)
  })
})
