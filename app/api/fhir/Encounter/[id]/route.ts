// ═══════════════════════════════════════════════════════════════
// GET /api/fhir/Encounter/[id] — FHIR R4 Encounter (Block 21)
// ═══════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { serviceRecordToFhirEncounter } from '@/lib/fhir/mappers'
import { exceptionOutcome, notFoundOutcome, toFhirErrorResponse } from '@/lib/fhir/operation-outcome'
import type { ServiceRecordFhirRow } from '@/lib/fhir/types'

const FHIR_CONTENT_TYPE = 'application/fhir+json; charset=utf-8'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await requireOpsAdmin()
  if (!auth.ok) return toFhirErrorResponse(auth.response)

  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('service_records')
      .select('id, organization_id, client_id, caregiver_id, date, start_time, end_time, duration_minutes, service_type, status')
      .eq('id', id)
      .eq('organization_id', auth.ctx.organizationId)
      .maybeSingle()

    if (error) return exceptionOutcome(error.message)
    if (!data) return notFoundOutcome('Encounter', id)

    const encounter = serviceRecordToFhirEncounter(data as ServiceRecordFhirRow)
    return new NextResponse(JSON.stringify(encounter), { status: 200, headers: { 'Content-Type': FHIR_CONTENT_TYPE } })
  } catch (err) {
    return exceptionOutcome((err as Error).message)
  }
}
