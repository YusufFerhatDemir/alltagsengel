// ═══════════════════════════════════════════════════════════════
// GET /api/fhir/Encounter?patient=<clientId> — FHIR R4 Encounter-Suche
// Quelle: service_records (tatsächlich erbrachte/geplante Einsätze).
// ═══════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { buildSearchsetBundle, serviceRecordToFhirEncounter } from '@/lib/fhir/mappers'
import { exceptionOutcome, invalidOutcome, toFhirErrorResponse } from '@/lib/fhir/operation-outcome'
import type { ServiceRecordFhirRow } from '@/lib/fhir/types'

const FHIR_CONTENT_TYPE = 'application/fhir+json; charset=utf-8'
const RECORD_COLUMNS = 'id, organization_id, client_id, caregiver_id, date, start_time, end_time, duration_minutes, service_type, status'

export async function GET(request: Request) {
  const auth = await requireOpsAdmin('system.verwalten')
  if (!auth.ok) return toFhirErrorResponse(auth.response)

  try {
    const url = new URL(request.url)
    const patient = url.searchParams.get('patient')
    if (!patient) return invalidOutcome('Parameter "patient" ist erforderlich, z. B. ?patient=<Klienten-ID>.')

    const count = Math.min(Math.max(parseInt(url.searchParams.get('_count') ?? '50', 10) || 50, 1), 200)
    const offset = Math.max(parseInt(url.searchParams.get('_offset') ?? '0', 10) || 0, 0)

    const admin = createAdminClient()
    const { data, error, count: total } = await admin
      .from('service_records')
      .select(RECORD_COLUMNS, { count: 'exact' })
      .eq('organization_id', auth.ctx.organizationId)
      .eq('client_id', patient)
      .order('date', { ascending: false })
      .range(offset, offset + count - 1)

    if (error) return exceptionOutcome(error.message)

    const encounters = (data as ServiceRecordFhirRow[] ?? []).map(serviceRecordToFhirEncounter)
    const bundle = buildSearchsetBundle(encounters, 'Encounter', total ?? encounters.length, request.url)

    return new NextResponse(JSON.stringify(bundle), { status: 200, headers: { 'Content-Type': FHIR_CONTENT_TYPE } })
  } catch (err) {
    return safeApiError(err, request)
  }
}
