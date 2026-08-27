// ═══════════════════════════════════════════════════════════════
// GET /api/fhir/Patient/[id] — FHIR R4 Patient (Block 21)
// ═══════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { clientToFhirPatient } from '@/lib/fhir/mappers'
import { exceptionOutcome, notFoundOutcome, toFhirErrorResponse } from '@/lib/fhir/operation-outcome'
import type { ClientFhirRow } from '@/lib/fhir/types'
import { withTracking } from '@/lib/monitoring/tracker'

const FHIR_CONTENT_TYPE = 'application/fhir+json; charset=utf-8'

export const GET = withTracking(async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await requireOpsAdmin('system.verwalten')
  if (!auth.ok) return toFhirErrorResponse(auth.response)

  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('clients')
      .select('id, organization_id, customer_number, first_name, last_name, date_of_birth, geburtsdatum, address, city, zip_code, phone, email, insurance_number, versichertennummer, care_level, pflegegrad, status')
      .eq('id', id)
      .eq('organization_id', auth.ctx.organizationId)
      .maybeSingle()

    if (error) return exceptionOutcome(error.message)
    if (!data) return notFoundOutcome('Patient', id)

    const patient = clientToFhirPatient(data as ClientFhirRow)
    return new NextResponse(JSON.stringify(patient), { status: 200, headers: { 'Content-Type': FHIR_CONTENT_TYPE } })
  } catch (err) {
    return safeApiError(err, _request)
  }
})
