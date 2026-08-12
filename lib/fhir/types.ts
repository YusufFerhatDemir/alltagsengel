// ═══════════════════════════════════════════════════════════════
// FHIR R4 — Basis-Ressourcen-Typen (Block 21)
//
// Bewusst NUR Basis-FHIR-R4 (http://hl7.org/fhir/R4/), KEIN
// länderspezifisches Profil (kein ISiK/KBV-Constraint). Jede Ressource
// trägt meta.profile mit der offiziellen Basis-StructureDefinition-URL
// — das behauptet keine Konformität zu einem deutschen Profil.
//
// Nur die Felder, die dieses Modul tatsächlich befüllt, sind hier
// typisiert (kein Vollnachbau der R4-Spec).
// ═══════════════════════════════════════════════════════════════

export const FHIR_BASE_URL = 'https://alltagsengel.care/fhir'

// ── Gemeinsame Bausteine ─────────────────────────────────────────

export interface FhirMeta {
  profile?: string[]
  lastUpdated?: string
}

export interface FhirIdentifier {
  system?: string
  value: string
  use?: 'official' | 'usual' | 'secondary'
}

export interface FhirHumanName {
  use?: 'official' | 'usual'
  family?: string
  given?: string[]
  text?: string
}

export interface FhirAddress {
  use?: 'home'
  line?: string[]
  city?: string
  postalCode?: string
  country?: string
}

export interface FhirContactPoint {
  system: 'phone' | 'email'
  value: string
  use?: 'home' | 'work' | 'mobile'
}

export interface FhirCoding {
  system?: string
  code?: string
  display?: string
}

export interface FhirCodeableConcept {
  coding?: FhirCoding[]
  text?: string
}

export interface FhirReference {
  reference?: string
  display?: string
}

export interface FhirPeriod {
  start?: string
  end?: string | null
}

export interface FhirQuantity {
  value: number
  unit?: string
  system?: string
  code?: string
}

export interface FhirExtension {
  url: string
  valueInteger?: number
  valueString?: string
  valueBoolean?: boolean
}

// ── Patient ──────────────────────────────────────────────────────

export interface FhirPatient {
  resourceType: 'Patient'
  id: string
  meta: FhirMeta
  identifier: FhirIdentifier[]
  active: boolean
  name: FhirHumanName[]
  telecom?: FhirContactPoint[]
  birthDate?: string
  address?: FhirAddress[]
  extension?: FhirExtension[]
}

// ── Encounter ────────────────────────────────────────────────────

export type FhirEncounterStatus =
  | 'planned' | 'arrived' | 'triaged' | 'in-progress'
  | 'onleave' | 'finished' | 'cancelled' | 'entered-in-error' | 'unknown'

export interface FhirEncounter {
  resourceType: 'Encounter'
  id: string
  meta: FhirMeta
  status: FhirEncounterStatus
  class: FhirCoding
  serviceType?: FhirCodeableConcept
  subject: FhirReference
  participant?: { individual: FhirReference }[]
  period: FhirPeriod
  length?: FhirQuantity
}

// ── Observation ──────────────────────────────────────────────────

export type FhirObservationStatus = 'final' | 'amended' | 'unknown'

export interface FhirObservationComponent {
  code: FhirCodeableConcept
  valueQuantity?: FhirQuantity
}

export interface FhirObservation {
  resourceType: 'Observation'
  id: string
  meta: FhirMeta
  status: FhirObservationStatus
  category: FhirCodeableConcept[]
  code: FhirCodeableConcept
  subject: FhirReference
  effectiveDateTime: string
  valueQuantity?: FhirQuantity
  component?: FhirObservationComponent[]
  performer?: FhirReference[]
  note?: { text: string }[]
}

// ── CarePlan ─────────────────────────────────────────────────────

export type FhirCarePlanStatus =
  | 'draft' | 'active' | 'on-hold' | 'revoked' | 'completed' | 'unknown'

export interface FhirCarePlanActivity {
  detail: {
    kind: 'ServiceRequest'
    status: string
    description: string
  }
}

export interface FhirCarePlan {
  resourceType: 'CarePlan'
  id: string
  meta: FhirMeta
  status: FhirCarePlanStatus
  intent: 'plan'
  title: string
  description?: string
  subject: FhirReference
  period: FhirPeriod
  activity?: FhirCarePlanActivity[]
}

export type FhirResource = FhirPatient | FhirEncounter | FhirObservation | FhirCarePlan

// ── Bundle ───────────────────────────────────────────────────────

export interface FhirBundleEntry<T = FhirResource> {
  fullUrl: string
  resource: T
  search?: { mode: 'match' }
}

export interface FhirBundle<T = FhirResource> {
  resourceType: 'Bundle'
  type: 'searchset' | 'collection'
  timestamp: string
  total?: number
  link?: { relation: 'self' | 'next'; url: string }[]
  entry: FhirBundleEntry<T>[]
}

// ── OperationOutcome ─────────────────────────────────────────────

export type FhirIssueSeverity = 'fatal' | 'error' | 'warning' | 'information'
export type FhirIssueCode =
  | 'not-found' | 'forbidden' | 'invalid' | 'required'
  | 'processing' | 'security' | 'exception'

export interface FhirOperationOutcomeIssue {
  severity: FhirIssueSeverity
  code: FhirIssueCode
  diagnostics: string
}

export interface FhirOperationOutcome {
  resourceType: 'OperationOutcome'
  issue: FhirOperationOutcomeIssue[]
}

// ── DB-Zeilen (Ausschnitt) — Quelle: clients-Tabelle ─────────────
// Nur die Spalten, die tatsächlich gemappt werden. Siehe
// supabase/migrations/20260101000000_baseline_live_only_tables.sql.

export interface ClientFhirRow {
  id: string
  organization_id: string
  customer_number: string
  first_name: string
  last_name: string
  date_of_birth: string | null
  geburtsdatum: string | null
  address: string | null
  city: string | null
  zip_code: string | null
  phone: string | null
  email: string | null
  insurance_number: string | null
  versichertennummer: string | null
  care_level: number | null
  pflegegrad: number | null
  status: string | null
}

export interface ServiceRecordFhirRow {
  id: string
  organization_id: string
  client_id: string
  caregiver_id: string
  date: string
  start_time: string
  end_time: string
  duration_minutes: number | null
  service_type: string
  status: string | null
}
