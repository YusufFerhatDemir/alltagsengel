// ═══════════════════════════════════════════════════════════════
// FHIR-Import — Patient-Bundle → clients (Block 21)
//
// Bewusster Scope-Schnitt: NUR Patient-Ressourcen werden importiert.
// Encounter/Observation/CarePlan-Import wäre deutlich komplexer
// (Fremdschlüssel auf caregiver_id, Statuslogik, Wertebereichs-
// Validierung der Vitalwerte) und ist hier nicht umgesetzt — siehe
// docs/fhir-isip.md.
//
// Zwei-Schritt-Ablauf (keine Blind-Writes):
//   1) parseImportBundle()  — Struktur-/Pflichtfeld-Validierung, pure.
//   2) buildImportPreview() — Abgleich gegen bestehende Klienten
//      (Identifier-Match), liefert je Kandidat 'neu' oder 'bestehend'.
//   Erst nach Bestätigung im Admin-UI (pro Zeile) schreibt die API-Route.
// ═══════════════════════════════════════════════════════════════

import { FHIR_BASE_URL } from './types'

export interface ParsedPatientCandidate {
  /** Position im Bundle (entry-Index) — dient als stabile Referenz für die UI-Auswahl. */
  index: number
  fhirId: string | null
  identifiers: { system?: string; value: string }[]
  firstName: string | null
  lastName: string | null
  birthDate: string | null
  address: string | null
  city: string | null
  zipCode: string | null
  phone: string | null
  email: string | null
  /** Versichertennummer, falls per KVID-10-System oder eigenem Identifier mitgegeben. */
  insuranceNumber: string | null
  errors: string[]
}

export interface ParsedImportBundle {
  errors: string[]
  patients: ParsedPatientCandidate[]
}

function asString(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

/** Validiert die Bundle-Hülle und extrahiert alle enthaltenen Patient-Ressourcen. */
export function parseImportBundle(input: unknown): ParsedImportBundle {
  const errors: string[] = []

  if (!input || typeof input !== 'object') {
    return { errors: ['Kein gültiges JSON-Objekt.'], patients: [] }
  }
  const bundle = input as Record<string, unknown>
  if (bundle.resourceType !== 'Bundle') {
    return { errors: [`resourceType muss "Bundle" sein, war "${String(bundle.resourceType)}".`], patients: [] }
  }
  if (!Array.isArray(bundle.entry)) {
    return { errors: ['Bundle.entry fehlt oder ist kein Array.'], patients: [] }
  }

  const patients: ParsedPatientCandidate[] = []
  bundle.entry.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      errors.push(`entry[${index}]: kein gültiges Objekt.`)
      return
    }
    const resource = (entry as Record<string, unknown>).resource
    if (!resource || typeof resource !== 'object') {
      errors.push(`entry[${index}]: resource fehlt.`)
      return
    }
    const r = resource as Record<string, unknown>
    if (r.resourceType !== 'Patient') return // andere Ressourcentypen werden im Import ignoriert (siehe Scope-Hinweis oben)

    const candidateErrors: string[] = []

    const names = Array.isArray(r.name) ? (r.name as Record<string, unknown>[]) : []
    const primaryName = names[0] ?? {}
    const family = asString(primaryName.family)
    const given = Array.isArray(primaryName.given) ? primaryName.given : []
    const firstName = asString(given[0])
    if (!family) candidateErrors.push('Nachname (name[0].family) fehlt.')
    if (!firstName) candidateErrors.push('Vorname (name[0].given[0]) fehlt.')

    const identifiers = Array.isArray(r.identifier)
      ? (r.identifier as Record<string, unknown>[])
          .map(id => ({ system: asString(id.system) ?? undefined, value: asString(id.value) ?? '' }))
          .filter(id => id.value)
      : []

    const insuranceIdentifier = identifiers.find(id => id.system === 'http://fhir.de/sid/gkv/kvid-10')
      ?? identifiers.find(id => id.system?.includes('kvid'))

    const addresses = Array.isArray(r.address) ? (r.address as Record<string, unknown>[]) : []
    const primaryAddress = addresses[0] ?? {}
    const addressLine = Array.isArray(primaryAddress.line) ? asString(primaryAddress.line[0]) : null

    const telecoms = Array.isArray(r.telecom) ? (r.telecom as Record<string, unknown>[]) : []
    const phone = asString(telecoms.find(t => t.system === 'phone')?.value)
    const email = asString(telecoms.find(t => t.system === 'email')?.value)

    const birthDate = asString(r.birthDate)
    if (birthDate && !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
      candidateErrors.push(`birthDate "${birthDate}" ist kein gültiges Datum (YYYY-MM-DD).`)
    }

    patients.push({
      index,
      fhirId: asString(r.id),
      identifiers,
      firstName,
      lastName: family,
      birthDate,
      address: addressLine,
      city: asString(primaryAddress.city),
      zipCode: asString(primaryAddress.postalCode),
      phone,
      email,
      insuranceNumber: asString(insuranceIdentifier?.value),
      errors: candidateErrors,
    })
  })

  if (patients.length === 0 && errors.length === 0) {
    errors.push('Bundle enthält keine Patient-Ressourcen.')
  }

  return { errors, patients }
}

// ── Abgleich gegen bestehende Klienten ───────────────────────────

export interface ExistingClientLookup {
  id: string
  customer_number: string
  insurance_number: string | null
  versichertennummer: string | null
  first_name: string
  last_name: string
}

export type ImportMatchStatus = 'neu' | 'bestehend'

export interface ImportPreviewItem extends ParsedPatientCandidate {
  match: ImportMatchStatus
  matchedClientId: string | null
  matchReason: string | null
  gueltig: boolean
}

/**
 * Ordnet jeden geparsten Kandidaten einem 'neu' oder 'bestehend' zu.
 * Match-Reihenfolge: eigener customer-number-Identifier → Versichertennummer.
 * Kein Match über Name/Geburtsdatum — zu unsicher (Verwechslungsgefahr).
 */
export function buildImportPreview(
  candidates: ParsedPatientCandidate[],
  existing: ExistingClientLookup[],
): ImportPreviewItem[] {
  const byCustomerNumber = new Map(existing.map(c => [c.customer_number, c]))
  const byInsuranceNumber = new Map(
    existing.filter(c => c.insurance_number || c.versichertennummer)
      .map(c => [(c.insurance_number ?? c.versichertennummer) as string, c]),
  )

  return candidates.map(candidate => {
    const gueltig = candidate.errors.length === 0

    const customerNumberIdentifier = candidate.identifiers.find(
      id => id.system === `${FHIR_BASE_URL}/identifier/customer-number`,
    )
    let matched: ExistingClientLookup | undefined
    let matchReason: string | null = null

    if (customerNumberIdentifier && byCustomerNumber.has(customerNumberIdentifier.value)) {
      matched = byCustomerNumber.get(customerNumberIdentifier.value)
      matchReason = 'Kundennummer'
    } else if (candidate.insuranceNumber && byInsuranceNumber.has(candidate.insuranceNumber)) {
      matched = byInsuranceNumber.get(candidate.insuranceNumber)
      matchReason = 'Versichertennummer'
    }

    return {
      ...candidate,
      gueltig,
      match: matched ? 'bestehend' : 'neu',
      matchedClientId: matched?.id ?? null,
      matchReason,
    }
  })
}

// ── Mapping auf clients-Insert/-Update ───────────────────────────

export interface ClientInsertFields {
  first_name: string
  last_name: string
  date_of_birth: string | null
  address: string | null
  city: string | null
  zip_code: string | null
  phone: string | null
  email: string | null
  versichertennummer: string | null
}

/** Für ein neues clients-Insert — alle übertragenen Felder, auch leere. */
export function candidateToClientInsert(candidate: ParsedPatientCandidate): ClientInsertFields {
  return {
    first_name: candidate.firstName ?? '',
    last_name: candidate.lastName ?? '',
    date_of_birth: candidate.birthDate,
    address: candidate.address,
    city: candidate.city,
    zip_code: candidate.zipCode,
    phone: candidate.phone,
    email: candidate.email,
    versichertennummer: candidate.insuranceNumber,
  }
}

/**
 * Für ein Update eines bestehenden Klienten — NUR Felder, die im
 * eingehenden Bundle tatsächlich gesetzt sind. So überschreibt ein
 * unvollständiges FHIR-Bundle niemals vorhandene Daten mit NULL
 * (Anforderung: kein versehentliches Überschreiben beim Import).
 */
export function candidateToClientUpdate(candidate: ParsedPatientCandidate): Partial<ClientInsertFields> {
  const update: Partial<ClientInsertFields> = {}
  if (candidate.firstName) update.first_name = candidate.firstName
  if (candidate.lastName) update.last_name = candidate.lastName
  if (candidate.birthDate) update.date_of_birth = candidate.birthDate
  if (candidate.address) update.address = candidate.address
  if (candidate.city) update.city = candidate.city
  if (candidate.zipCode) update.zip_code = candidate.zipCode
  if (candidate.phone) update.phone = candidate.phone
  if (candidate.email) update.email = candidate.email
  if (candidate.insuranceNumber) update.versichertennummer = candidate.insuranceNumber
  return update
}
