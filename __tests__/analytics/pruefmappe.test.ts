import { describe, it, expect } from 'vitest'
import {
  bewerteLeistungsnachweise,
  bewertePflegeverlauf,
  bewerteMassnahmenplan,
  bewerteWunddoku,
  bewerteVitalwerte,
} from '../../lib/analytics/pruefmappe'

describe('Prüfmappe — bewerteLeistungsnachweise', () => {
  it('ist vollständig, wenn alle signiert und keine offenen Fehler', () => {
    const r = bewerteLeistungsnachweise([{ client_signature: 'x' }, { client_signature: 'y' }], 0)
    expect(r.status).toBe('vollstaendig')
    expect(r.anzahl).toBe(2)
  })

  it('ist unvollständig bei fehlender Signatur', () => {
    const r = bewerteLeistungsnachweise([{ client_signature: null }, { client_signature: 'y' }], 0)
    expect(r.status).toBe('unvollstaendig')
  })

  it('ist unvollständig bei offenen Prüfhinweisen trotz Signatur', () => {
    const r = bewerteLeistungsnachweise([{ client_signature: 'x' }], 1)
    expect(r.status).toBe('unvollstaendig')
  })

  it('meldet keine_daten ohne Leistungsnachweise', () => {
    const r = bewerteLeistungsnachweise([], 0)
    expect(r.status).toBe('keine_daten')
  })
})

describe('Prüfmappe — bewertePflegeverlauf', () => {
  it('ist vollständig bei mindestens einem Eintrag', () => {
    expect(bewertePflegeverlauf([{}, {}]).status).toBe('vollstaendig')
  })
  it('meldet keine_daten ohne Einträge', () => {
    expect(bewertePflegeverlauf([]).status).toBe('keine_daten')
  })
})

describe('Prüfmappe — bewerteMassnahmenplan', () => {
  it('meldet keine_daten ohne aktiven Plan', () => {
    const r = bewerteMassnahmenplan([{ status: 'entwurf' }], [])
    expect(r.status).toBe('keine_daten')
  })
  it('ist vollständig bei aktivem Plan', () => {
    const r = bewerteMassnahmenplan([{ status: 'aktiv' }], [{ status: 'aktiv' }, { status: 'abgeschlossen' }])
    expect(r.status).toBe('vollstaendig')
    expect(r.anzahl).toBe(2)
  })
})

describe('Prüfmappe — bewerteWunddoku', () => {
  it('meldet keine_daten ohne Wunden (ggf. nicht zutreffend)', () => {
    expect(bewerteWunddoku([]).status).toBe('keine_daten')
  })
  it('ist vollständig bei vorhandener Dokumentation', () => {
    const r = bewerteWunddoku([{ status: 'aktiv' }, { status: 'abgeheilt' }])
    expect(r.status).toBe('vollstaendig')
  })
})

describe('Prüfmappe — bewerteVitalwerte', () => {
  it('ist vollständig bei mindestens einer Messung', () => {
    expect(bewerteVitalwerte([{}]).status).toBe('vollstaendig')
  })
  it('meldet keine_daten ohne Messungen', () => {
    expect(bewerteVitalwerte([]).status).toBe('keine_daten')
  })
})
