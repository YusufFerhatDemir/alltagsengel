// ═══════════════════════════════════════════════════════════════
// FHIR R4 — Mapping interner Tabellen → FHIR-Ressourcen (Block 21)
//
// Reines TypeScript-Mapping, kein FHIR-Server-Framework. Jede
// Funktion ist pure (Zeile rein, Ressource raus) und damit ohne
// Supabase-Mock testbar.
//
// Es werden NUR Felder gemappt, die in den Quelltabellen tatsächlich
// existieren. Fehlende FHIR-Felder werden ausgelassen statt erfunden.
// ═══════════════════════════════════════════════════════════════

import type { VitalSign, VitalTyp } from '@/lib/vitals/types'
import type { PflegeMassnahme, PflegeMassnahmenplan, PlanStatus } from '@/lib/pflege/types'
import {
  FHIR_BASE_URL,
  type ClientFhirRow,
  type FhirBundle,
  type FhirBundleEntry,
  type FhirCarePlan,
  type FhirCarePlanStatus,
  type FhirEncounter,
  type FhirEncounterStatus,
  type FhirObservation,
  type FhirPatient,
  type FhirResource,
  type ServiceRecordFhirRow,
} from './types'

const now = () => new Date().toISOString()

// ── Patient ──────────────────────────────────────────────────────

export function clientToFhirPatient(client: ClientFhirRow): FhirPatient {
  const birthDate = client.date_of_birth ?? client.geburtsdatum ?? undefined
  const pflegegrad = client.care_level ?? client.pflegegrad ?? null

  const identifier: FhirPatient['identifier'] = [
    { system: `${FHIR_BASE_URL}/identifier/customer-number`, value: client.customer_number, use: 'usual' },
  ]
  const versichertennummer = client.insurance_number ?? client.versichertennummer
  if (versichertennummer) {
    // http://fhir.de/sid/gkv/kvid-10 ist die offizielle, öffentlich dokumentierte
    // FHIR-DE-Identifiersystem-URL für die GKV-Versichertennummer — kein
    // erfundener Wert, aber wir behaupten damit keine ISiK-Konformität.
    identifier.push({ system: 'http://fhir.de/sid/gkv/kvid-10', value: versichertennummer, use: 'official' })
  }

  const telecom: FhirPatient['telecom'] = []
  if (client.phone) telecom.push({ system: 'phone', value: client.phone, use: 'home' })
  if (client.email) telecom.push({ system: 'email', value: client.email })

  const address = client.address || client.city || client.zip_code
    ? [{
        use: 'home' as const,
        line: client.address ? [client.address] : undefined,
        city: client.city ?? undefined,
        postalCode: client.zip_code ?? undefined,
        country: 'DE',
      }]
    : undefined

  return {
    resourceType: 'Patient',
    id: client.id,
    meta: { profile: ['http://hl7.org/fhir/StructureDefinition/Patient'], lastUpdated: now() },
    identifier,
    active: client.status === 'active',
    name: [{ use: 'official', family: client.last_name, given: [client.first_name] }],
    ...(telecom.length ? { telecom } : {}),
    ...(birthDate ? { birthDate } : {}),
    ...(address ? { address } : {}),
    // Eigene, klar als solche gekennzeichnete Extension — kein KBV/ISiK-Profil-Constraint.
    ...(pflegegrad != null
      ? { extension: [{ url: `${FHIR_BASE_URL}/StructureDefinition/pflegegrad`, valueInteger: pflegegrad }] }
      : {}),
  }
}

// ── Encounter (aus service_records) ─────────────────────────────

const ENCOUNTER_STATUS_MAP: Record<string, FhirEncounterStatus> = {
  draft: 'planned',
  incomplete: 'in-progress',
  complete: 'finished',
  signed: 'finished',
  invoiced: 'finished',
}

export function serviceRecordToFhirEncounter(record: ServiceRecordFhirRow): FhirEncounter {
  const status = ENCOUNTER_STATUS_MAP[record.status ?? ''] ?? 'unknown'
  const start = `${record.date}T${record.start_time}`
  const end = `${record.date}T${record.end_time}`

  return {
    resourceType: 'Encounter',
    id: record.id,
    meta: { profile: ['http://hl7.org/fhir/StructureDefinition/Encounter'], lastUpdated: now() },
    status,
    // v3-ActCode "HH" = home health — Standard-HL7-Terminologie, kein erfundener Code.
    class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'HH', display: 'home health' },
    serviceType: { text: record.service_type },
    subject: { reference: `Patient/${record.client_id}` },
    // Practitioner-Endpunkt ist in diesem Block nicht implementiert — Referenz ist
    // syntaktisch korrekt, aber serverseitig nicht auflösbar (siehe docs/fhir-isip.md).
    participant: [{ individual: { reference: `Practitioner/${record.caregiver_id}` } }],
    period: { start, end },
    ...(record.duration_minutes != null
      ? { length: { value: record.duration_minutes, unit: 'min', system: 'http://unitsofmeasure.org', code: 'min' } }
      : {}),
  }
}

// ── Observation (aus vital_signs) ────────────────────────────────
// LOINC-Codes sind öffentlich dokumentierte Standardcodes (loinc.org),
// keine erfundenen Werte. Typen ohne gesichert bekannten LOINC-Code
// (trinkmenge, ausscheidung) bekommen bewusst nur `code.text`.

const VITAL_LOINC: Partial<Record<VitalTyp, { code: string; display: string }>> = {
  puls: { code: '8867-4', display: 'Heart rate' },
  temperatur: { code: '8310-5', display: 'Body temperature' },
  blutzucker: { code: '2339-0', display: 'Glucose [Mass/volume] in Blood' },
  spo2: { code: '59408-5', display: 'Oxygen saturation in Arterial blood by Pulse oximetry' },
  gewicht: { code: '29463-7', display: 'Body weight' },
  atemfrequenz: { code: '9279-1', display: 'Respiratory rate' },
  schmerz: { code: '72514-3', display: 'Pain severity - 0-10 verbal numeric rating [Score] - Reported' },
}

const VITAL_UNIT_UCUM: Partial<Record<VitalTyp, string>> = {
  puls: '/min',
  temperatur: 'Cel',
  blutzucker: 'mg/dL',
  spo2: '%',
  gewicht: 'kg',
  atemfrequenz: '/min',
  schmerz: '{score}',
  blutdruck: 'mm[Hg]',
  trinkmenge: 'mL',
  ausscheidung: 'mL',
}

export function vitalSignToFhirObservation(vital: VitalSign): FhirObservation {
  const category = [{
    coding: [{
      system: 'http://terminology.hl7.org/CodeSystem/observation-category',
      code: 'vital-signs', display: 'Vital Signs',
    }],
  }]

  const base: FhirObservation = {
    resourceType: 'Observation',
    id: vital.id,
    meta: { profile: ['http://hl7.org/fhir/StructureDefinition/Observation'], lastUpdated: now() },
    status: 'final',
    category,
    code: { text: vital.type },
    subject: { reference: `Patient/${vital.client_id}` },
    effectiveDateTime: vital.measured_at,
    performer: [{ reference: `Practitioner/${vital.measured_by}`, display: vital.measured_by_name ?? undefined }],
    ...(vital.notes ? { note: [{ text: vital.notes }] } : {}),
  }

  if (vital.type === 'blutdruck') {
    // Blutdruck ist ein Panel aus zwei Standard-LOINC-Komponenten (systolisch/diastolisch).
    base.code = { coding: [{ system: 'http://loinc.org', code: '85354-9', display: 'Blood pressure panel' }] }
    base.component = [
      {
        code: { coding: [{ system: 'http://loinc.org', code: '8480-6', display: 'Systolic blood pressure' }] },
        valueQuantity: { value: Number(vital.value), unit: 'mmHg', system: 'http://unitsofmeasure.org', code: 'mm[Hg]' },
      },
    ]
    if (vital.value_secondary != null) {
      base.component.push({
        code: { coding: [{ system: 'http://loinc.org', code: '8462-4', display: 'Diastolic blood pressure' }] },
        valueQuantity: { value: Number(vital.value_secondary), unit: 'mmHg', system: 'http://unitsofmeasure.org', code: 'mm[Hg]' },
      })
    }
    return base
  }

  const loinc = VITAL_LOINC[vital.type]
  base.code = loinc
    ? { coding: [{ system: 'http://loinc.org', code: loinc.code, display: loinc.display }], text: vital.type }
    : { text: vital.type }

  base.valueQuantity = {
    value: Number(vital.value),
    unit: vital.unit,
    system: 'http://unitsofmeasure.org',
    code: VITAL_UNIT_UCUM[vital.type] ?? vital.unit,
  }

  return base
}

// ── CarePlan (aus pflege_massnahmenplaene + pflege_massnahmen) ──

const CAREPLAN_STATUS_MAP: Record<PlanStatus, FhirCarePlanStatus> = {
  entwurf: 'draft',
  aktiv: 'active',
  abgelaufen: 'completed',
  gesperrt: 'revoked',
  ersetzt: 'revoked',
}

export function massnahmenplanToFhirCarePlan(
  plan: PflegeMassnahmenplan,
  massnahmen: PflegeMassnahme[] = [],
): FhirCarePlan {
  const description = [plan.pflegeziele, plan.betreuungsziele].filter(Boolean).join(' — ') || undefined

  return {
    resourceType: 'CarePlan',
    id: plan.id,
    meta: { profile: ['http://hl7.org/fhir/StructureDefinition/CarePlan'], lastUpdated: now() },
    status: CAREPLAN_STATUS_MAP[plan.status] ?? 'unknown',
    intent: 'plan',
    title: plan.titel,
    ...(description ? { description } : {}),
    subject: { reference: `Patient/${plan.client_id}` },
    period: { start: plan.gueltig_von, end: plan.gueltig_bis },
    ...(massnahmen.length
      ? {
          activity: massnahmen.map(m => ({
            detail: {
              kind: 'ServiceRequest' as const,
              status: m.status,
              description: [m.titel, m.beschreibung].filter(Boolean).join(' — '),
            },
          })),
        }
      : {}),
  }
}

// ── Bundle-Builder ───────────────────────────────────────────────

export function buildSearchsetBundle<T extends FhirResource>(
  resources: T[],
  resourceType: string,
  total: number,
  selfUrl: string,
): FhirBundle<T> {
  const entry: FhirBundleEntry<T>[] = resources.map(r => ({
    fullUrl: `${FHIR_BASE_URL}/${resourceType}/${r.id}`,
    resource: r,
    search: { mode: 'match' },
  }))
  return {
    resourceType: 'Bundle',
    type: 'searchset',
    timestamp: now(),
    total,
    link: [{ relation: 'self', url: selfUrl }],
    entry,
  }
}

export function buildCollectionBundle(resources: FhirResource[]): FhirBundle {
  return {
    resourceType: 'Bundle',
    type: 'collection',
    timestamp: now(),
    entry: resources.map(r => ({
      fullUrl: `${FHIR_BASE_URL}/${r.resourceType}/${r.id}`,
      resource: r,
    })),
  }
}
