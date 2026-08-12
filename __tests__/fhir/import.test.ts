import { describe, it, expect } from 'vitest'
import {
  buildImportPreview,
  candidateToClientInsert,
  candidateToClientUpdate,
  parseImportBundle,
  type ExistingClientLookup,
} from '@/lib/fhir/import'

function bundleMitPatient(patient: Record<string, unknown>) {
  return { resourceType: 'Bundle', type: 'collection', entry: [{ resource: { resourceType: 'Patient', ...patient } }] }
}

describe('parseImportBundle — Struktur-Validierung', () => {
  it('lehnt ein Objekt ohne resourceType "Bundle" ab', () => {
    const result = parseImportBundle({ resourceType: 'Patient' })
    expect(result.errors[0]).toMatch(/resourceType muss "Bundle" sein/)
    expect(result.patients).toHaveLength(0)
  })

  it('lehnt ein Bundle ohne entry-Array ab', () => {
    const result = parseImportBundle({ resourceType: 'Bundle' })
    expect(result.errors[0]).toMatch(/entry fehlt/)
  })

  it('meldet, wenn kein Patient im Bundle enthalten ist', () => {
    const result = parseImportBundle({ resourceType: 'Bundle', entry: [{ resource: { resourceType: 'Encounter' } }] })
    expect(result.errors[0]).toMatch(/keine Patient-Ressourcen/)
  })

  it('ignoriert Nicht-Patient-Ressourcen, ohne einen Fehler zu werfen, wenn zusätzlich ein Patient da ist', () => {
    const bundle = {
      resourceType: 'Bundle',
      entry: [
        { resource: { resourceType: 'Encounter' } },
        { resource: { resourceType: 'Patient', name: [{ family: 'Muster', given: ['Anna'] }] } },
      ],
    }
    const result = parseImportBundle(bundle)
    expect(result.patients).toHaveLength(1)
  })
})

describe('parseImportBundle — Patient-Felder', () => {
  it('extrahiert Name, Geburtsdatum, Adresse, Telecom und Identifier', () => {
    const bundle = bundleMitPatient({
      id: 'ext-1',
      name: [{ family: 'Muster', given: ['Anna'] }],
      birthDate: '1950-05-04',
      address: [{ line: ['Musterstraße 1'], city: 'Frankfurt', postalCode: '60306' }],
      telecom: [{ system: 'phone', value: '069123456' }, { system: 'email', value: 'anna@example.de' }],
      identifier: [{ system: 'http://fhir.de/sid/gkv/kvid-10', value: 'A123456789' }],
    })
    const { patients, errors } = parseImportBundle(bundle)
    expect(errors).toHaveLength(0)
    expect(patients[0]).toMatchObject({
      firstName: 'Anna', lastName: 'Muster', birthDate: '1950-05-04',
      address: 'Musterstraße 1', city: 'Frankfurt', zipCode: '60306',
      phone: '069123456', email: 'anna@example.de', insuranceNumber: 'A123456789',
    })
  })

  it('markiert fehlenden Nachnamen als Kandidaten-Fehler statt das ganze Bundle abzulehnen', () => {
    const bundle = bundleMitPatient({ name: [{ given: ['Anna'] }] })
    const { patients } = parseImportBundle(bundle)
    expect(patients[0].errors).toContain('Nachname (name[0].family) fehlt.')
  })

  it('markiert fehlenden Vornamen als Kandidaten-Fehler', () => {
    const bundle = bundleMitPatient({ name: [{ family: 'Muster' }] })
    const { patients } = parseImportBundle(bundle)
    expect(patients[0].errors).toContain('Vorname (name[0].given[0]) fehlt.')
  })

  it('lehnt ein unplausibles birthDate-Format ab', () => {
    const bundle = bundleMitPatient({ name: [{ family: 'Muster', given: ['Anna'] }], birthDate: '04.05.1950' })
    const { patients } = parseImportBundle(bundle)
    expect(patients[0].errors.some(e => e.includes('kein gültiges Datum'))).toBe(true)
  })
})

describe('buildImportPreview — Abgleich gegen bestehende Klienten', () => {
  const existing: ExistingClientLookup[] = [
    { id: 'client-1', customer_number: 'KD-2608-1234', insurance_number: null, versichertennummer: 'A123456789', first_name: 'Anna', last_name: 'Muster' },
  ]

  it('erkennt einen bestehenden Klienten über die Versichertennummer', () => {
    const bundle = bundleMitPatient({
      name: [{ family: 'Muster', given: ['Anna'] }],
      identifier: [{ system: 'http://fhir.de/sid/gkv/kvid-10', value: 'A123456789' }],
    })
    const { patients } = parseImportBundle(bundle)
    const preview = buildImportPreview(patients, existing)
    expect(preview[0].match).toBe('bestehend')
    expect(preview[0].matchedClientId).toBe('client-1')
    expect(preview[0].matchReason).toBe('Versichertennummer')
  })

  it('erkennt einen bestehenden Klienten über den eigenen Kundennummer-Identifier', () => {
    const bundle = bundleMitPatient({
      name: [{ family: 'Muster', given: ['Anna'] }],
      identifier: [{ system: 'https://alltagsengel.care/fhir/identifier/customer-number', value: 'KD-2608-1234' }],
    })
    const { patients } = parseImportBundle(bundle)
    const preview = buildImportPreview(patients, existing)
    expect(preview[0].match).toBe('bestehend')
    expect(preview[0].matchReason).toBe('Kundennummer')
  })

  it('markiert einen Kandidaten ohne bekannten Identifier als neu', () => {
    const bundle = bundleMitPatient({ name: [{ family: 'Fremd', given: ['Peter'] }] })
    const { patients } = parseImportBundle(bundle)
    const preview = buildImportPreview(patients, existing)
    expect(preview[0].match).toBe('neu')
    expect(preview[0].matchedClientId).toBeNull()
  })

  it('markiert einen Kandidaten mit Feldfehlern als ungültig, aber matched trotzdem korrekt', () => {
    const bundle = bundleMitPatient({ name: [{ given: ['Anna'] }] }) // kein family
    const { patients } = parseImportBundle(bundle)
    const preview = buildImportPreview(patients, [])
    expect(preview[0].gueltig).toBe(false)
    expect(preview[0].match).toBe('neu')
  })
})

describe('candidateToClientInsert / candidateToClientUpdate', () => {
  const bundle = bundleMitPatient({
    name: [{ family: 'Muster', given: ['Anna'] }],
    birthDate: '1950-05-04',
    telecom: [{ system: 'phone', value: '069123456' }],
  })
  const candidate = parseImportBundle(bundle).patients[0]

  it('candidateToClientInsert übernimmt alle geparsten Felder, auch leere', () => {
    const insert = candidateToClientInsert(candidate)
    expect(insert).toMatchObject({ first_name: 'Anna', last_name: 'Muster', date_of_birth: '1950-05-04', phone: '069123456', email: null })
  })

  it('candidateToClientUpdate enthält NUR gesetzte Felder — keine null-Überschreibung bestehender Daten', () => {
    const update = candidateToClientUpdate(candidate)
    expect(update).toEqual({ first_name: 'Anna', last_name: 'Muster', date_of_birth: '1950-05-04', phone: '069123456' })
    expect('email' in update).toBe(false)
    expect('address' in update).toBe(false)
  })

  it('candidateToClientUpdate ist leer, wenn der Kandidat keine Felder trägt', () => {
    const leer = parseImportBundle(bundleMitPatient({})).patients[0]
    expect(candidateToClientUpdate(leer)).toEqual({})
  })
})
