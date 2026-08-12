import { describe, it, expect } from 'vitest'
import {
  buildCollectionBundle,
  buildSearchsetBundle,
  clientToFhirPatient,
  massnahmenplanToFhirCarePlan,
  serviceRecordToFhirEncounter,
  vitalSignToFhirObservation,
} from '@/lib/fhir/mappers'
import type { ClientFhirRow, ServiceRecordFhirRow } from '@/lib/fhir/types'
import type { VitalSign } from '@/lib/vitals/types'
import type { PflegeMassnahme, PflegeMassnahmenplan } from '@/lib/pflege/types'

const client: ClientFhirRow = {
  id: 'client-1',
  organization_id: 'org-1',
  customer_number: 'KD-2608-1234',
  first_name: 'Anna',
  last_name: 'Muster',
  date_of_birth: '1950-05-04',
  geburtsdatum: null,
  address: 'Musterstraße 1',
  city: 'Frankfurt',
  zip_code: '60306',
  phone: '069123456',
  email: 'anna@example.de',
  insurance_number: 'A123456789',
  versichertennummer: null,
  care_level: 3,
  pflegegrad: null,
  status: 'active',
}

describe('clientToFhirPatient', () => {
  it('mappt Kern-Felder korrekt', () => {
    const p = clientToFhirPatient(client)
    expect(p.resourceType).toBe('Patient')
    expect(p.id).toBe('client-1')
    expect(p.name[0]).toEqual({ use: 'official', family: 'Muster', given: ['Anna'] })
    expect(p.birthDate).toBe('1950-05-04')
    expect(p.active).toBe(true)
  })

  it('trägt die Kundennummer als eigenen Identifier und die Versichertennummer mit KVID-10-System', () => {
    const p = clientToFhirPatient(client)
    expect(p.identifier).toContainEqual(
      expect.objectContaining({ system: 'https://alltagsengel.care/fhir/identifier/customer-number', value: 'KD-2608-1234' }),
    )
    expect(p.identifier).toContainEqual(
      expect.objectContaining({ system: 'http://fhir.de/sid/gkv/kvid-10', value: 'A123456789' }),
    )
  })

  it('fällt für birthDate auf geburtsdatum zurück, wenn date_of_birth fehlt', () => {
    const p = clientToFhirPatient({ ...client, date_of_birth: null, geburtsdatum: '1948-01-01' })
    expect(p.birthDate).toBe('1948-01-01')
  })

  it('setzt active auf false bei nicht-aktivem Status', () => {
    const p = clientToFhirPatient({ ...client, status: 'inactive' })
    expect(p.active).toBe(false)
  })

  it('mappt Telefon und E-Mail als telecom', () => {
    const p = clientToFhirPatient(client)
    expect(p.telecom).toContainEqual({ system: 'phone', value: '069123456', use: 'home' })
    expect(p.telecom).toContainEqual({ system: 'email', value: 'anna@example.de' })
  })

  it('lässt telecom weg, wenn weder Telefon noch E-Mail vorhanden sind', () => {
    const p = clientToFhirPatient({ ...client, phone: null, email: null })
    expect(p.telecom).toBeUndefined()
  })

  it('trägt den Pflegegrad als eigene, klar benannte Extension (kein KBV/ISiK-Profil)', () => {
    const p = clientToFhirPatient(client)
    expect(p.extension).toContainEqual({ url: 'https://alltagsengel.care/fhir/StructureDefinition/pflegegrad', valueInteger: 3 })
  })

  it('lässt die Extension weg, wenn weder care_level noch pflegegrad gesetzt sind', () => {
    const p = clientToFhirPatient({ ...client, care_level: null, pflegegrad: null })
    expect(p.extension).toBeUndefined()
  })

  it('referenziert die Basis-R4-StructureDefinition, kein Landesprofil', () => {
    const p = clientToFhirPatient(client)
    expect(p.meta.profile).toEqual(['http://hl7.org/fhir/StructureDefinition/Patient'])
  })
})

const record: ServiceRecordFhirRow = {
  id: 'rec-1',
  organization_id: 'org-1',
  client_id: 'client-1',
  caregiver_id: 'care-1',
  date: '2026-08-10',
  start_time: '09:00:00',
  end_time: '10:00:00',
  duration_minutes: 60,
  service_type: 'Grundpflege',
  status: 'complete',
}

describe('serviceRecordToFhirEncounter', () => {
  it('mappt Kernfelder und Zeitraum', () => {
    const e = serviceRecordToFhirEncounter(record)
    expect(e.resourceType).toBe('Encounter')
    expect(e.subject).toEqual({ reference: 'Patient/client-1' })
    expect(e.period).toEqual({ start: '2026-08-10T09:00:00', end: '2026-08-10T10:00:00' })
    expect(e.length).toEqual({ value: 60, unit: 'min', system: 'http://unitsofmeasure.org', code: 'min' })
  })

  it('nutzt den Standard-v3-ActCode "HH" (home health) als Klasse', () => {
    const e = serviceRecordToFhirEncounter(record)
    expect(e.class).toEqual({ system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'HH', display: 'home health' })
  })

  it.each([
    ['draft', 'planned'],
    ['incomplete', 'in-progress'],
    ['complete', 'finished'],
    ['signed', 'finished'],
    ['invoiced', 'finished'],
    ['irgendwas-unbekanntes', 'unknown'],
  ] as const)('mappt status "%s" auf FHIR-Status "%s"', (dbStatus, fhirStatus) => {
    const e = serviceRecordToFhirEncounter({ ...record, status: dbStatus })
    expect(e.status).toBe(fhirStatus)
  })
})

const vitalBase: VitalSign = {
  id: 'vital-1',
  organization_id: 'org-1',
  client_id: 'client-1',
  type: 'puls',
  value: 72,
  value_secondary: null,
  unit: 'bpm',
  measured_at: '2026-08-10T09:15:00Z',
  measured_by: 'engel-1',
  measured_by_name: 'Erika Engel',
  measured_by_role: 'engel',
  notes: null,
  created_at: '2026-08-10T09:15:00Z',
  updated_at: '2026-08-10T09:15:00Z',
}

describe('vitalSignToFhirObservation', () => {
  it('nutzt den LOINC-Code für Puls', () => {
    const o = vitalSignToFhirObservation(vitalBase)
    expect(o.code.coding?.[0]).toEqual({ system: 'http://loinc.org', code: '8867-4', display: 'Heart rate' })
    expect(o.valueQuantity).toEqual({ value: 72, unit: 'bpm', system: 'http://unitsofmeasure.org', code: '/min' })
  })

  it('bildet Blutdruck als Panel mit zwei Komponenten (systolisch/diastolisch) ab', () => {
    const o = vitalSignToFhirObservation({ ...vitalBase, type: 'blutdruck', value: 120, value_secondary: 80, unit: 'mmHg' })
    expect(o.code.coding?.[0].code).toBe('85354-9')
    expect(o.component).toHaveLength(2)
    expect(o.component?.[0]).toEqual(expect.objectContaining({ valueQuantity: { value: 120, unit: 'mmHg', system: 'http://unitsofmeasure.org', code: 'mm[Hg]' } }))
    expect(o.component?.[1]).toEqual(expect.objectContaining({ valueQuantity: { value: 80, unit: 'mmHg', system: 'http://unitsofmeasure.org', code: 'mm[Hg]' } }))
  })

  it('lässt component weg, wenn kein Diastolisch-Wert vorhanden ist', () => {
    const o = vitalSignToFhirObservation({ ...vitalBase, type: 'blutdruck', value: 120, value_secondary: null })
    expect(o.component).toHaveLength(1)
  })

  it('nutzt für trinkmenge/ausscheidung NUR code.text — kein erfundener LOINC-Code', () => {
    const o = vitalSignToFhirObservation({ ...vitalBase, type: 'trinkmenge', value: 250, unit: 'ml' })
    expect(o.code.coding).toBeUndefined()
    expect(o.code.text).toBe('trinkmenge')
  })

  it('trägt die category vital-signs (Standard-CodeSystem)', () => {
    const o = vitalSignToFhirObservation(vitalBase)
    expect(o.category[0].coding?.[0]).toEqual({
      system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'vital-signs', display: 'Vital Signs',
    })
  })

  it('übernimmt Notizen nur, wenn vorhanden', () => {
    expect(vitalSignToFhirObservation(vitalBase).note).toBeUndefined()
    expect(vitalSignToFhirObservation({ ...vitalBase, notes: 'Nach Belastung gemessen' }).note).toEqual([{ text: 'Nach Belastung gemessen' }])
  })
})

const plan: PflegeMassnahmenplan = {
  id: 'plan-1',
  organization_id: 'org-1',
  client_id: 'client-1',
  titel: 'Versorgungsplan 2026',
  plan_typ: 'versorgungsplan',
  gueltig_von: '2026-01-01',
  gueltig_bis: null,
  version: 1,
  status: 'aktiv',
  betreuungsziele: 'Selbstständigkeit erhalten',
  pflegeziele: 'Mobilität fördern',
  freigegeben_von: 'admin-1',
  freigegeben_am: '2026-01-02T00:00:00Z',
  gesperrt: false,
  vorgaenger_id: null,
  erstellt_von: 'admin-1',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

const massnahme: PflegeMassnahme = {
  id: 'massnahme-1',
  organization_id: 'org-1',
  plan_id: 'plan-1',
  kategorie: 'mobilitaet',
  titel: 'Gehtraining',
  beschreibung: '2x täglich 10 Minuten',
  ziel: 'Sturzrisiko senken',
  haeufigkeit: 'täglich',
  verantwortlich: 'Engel',
  prioritaet: 'normal',
  status: 'aktiv',
  beginn_datum: '2026-01-01',
  ende_datum: null,
  ergebnis: null,
  sortierung: 1,
  erstellt_von: 'admin-1',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

describe('massnahmenplanToFhirCarePlan', () => {
  it('mappt Status, Titel und Zeitraum', () => {
    const cp = massnahmenplanToFhirCarePlan(plan, [])
    expect(cp.status).toBe('active')
    expect(cp.title).toBe('Versorgungsplan 2026')
    expect(cp.period).toEqual({ start: '2026-01-01', end: null })
    expect(cp.intent).toBe('plan')
  })

  it.each([
    ['entwurf', 'draft'],
    ['aktiv', 'active'],
    ['abgelaufen', 'completed'],
    ['gesperrt', 'revoked'],
    ['ersetzt', 'revoked'],
  ] as const)('mappt Planstatus "%s" auf FHIR-CarePlan-Status "%s"', (planStatus, fhirStatus) => {
    const cp = massnahmenplanToFhirCarePlan({ ...plan, status: planStatus })
    expect(cp.status).toBe(fhirStatus)
  })

  it('bildet Maßnahmen als activity-Einträge ab', () => {
    const cp = massnahmenplanToFhirCarePlan(plan, [massnahme])
    expect(cp.activity).toHaveLength(1)
    expect(cp.activity?.[0].detail.description).toBe('Gehtraining — 2x täglich 10 Minuten')
    expect(cp.activity?.[0].detail.status).toBe('aktiv')
  })

  it('lässt activity weg, wenn keine Maßnahmen vorhanden sind', () => {
    const cp = massnahmenplanToFhirCarePlan(plan, [])
    expect(cp.activity).toBeUndefined()
  })
})

describe('Bundle-Builder', () => {
  it('buildSearchsetBundle liefert type searchset mit total und Einträgen', () => {
    const p = clientToFhirPatient(client)
    const bundle = buildSearchsetBundle([p], 'Patient', 1, 'https://alltagsengel.care/api/fhir/Patient')
    expect(bundle.resourceType).toBe('Bundle')
    expect(bundle.type).toBe('searchset')
    expect(bundle.total).toBe(1)
    expect(bundle.entry).toHaveLength(1)
    expect(bundle.entry[0].fullUrl).toBe('https://alltagsengel.care/fhir/Patient/client-1')
    expect(bundle.entry[0].search).toEqual({ mode: 'match' })
  })

  it('buildCollectionBundle liefert type collection ohne search-Feld', () => {
    const p = clientToFhirPatient(client)
    const e = serviceRecordToFhirEncounter(record)
    const bundle = buildCollectionBundle([p, e])
    expect(bundle.type).toBe('collection')
    expect(bundle.entry).toHaveLength(2)
    expect(bundle.entry[0].search).toBeUndefined()
  })
})
