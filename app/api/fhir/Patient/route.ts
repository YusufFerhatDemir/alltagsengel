// ═══════════════════════════════════════════════════════════════
// GET /api/fhir/Patient — FHIR R4 Patient-Suche (Bundle vom Typ searchset)
//
// Unterstützte Parameter: _count (max. 100, Default 20), _offset,
// name (Teilstring auf Vor-/Nachname). Org-gefenced über requireOpsAdmin().
// ═══════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { buildSearchsetBundle, clientToFhirPatient } from '@/lib/fhir/mappers'
import { exceptionOutcome, toFhirErrorResponse } from '@/lib/fhir/operation-outcome'
import type { ClientFhirRow } from '@/lib/fhir/types'
import { withTracking } from '@/lib/monitoring/tracker'

const FHIR_CONTENT_TYPE = 'application/fhir+json; charset=utf-8'
const CLIENT_COLUMNS = 'id, organization_id, customer_number, first_name, last_name, date_of_birth, geburtsdatum, address, city, zip_code, phone, email, insurance_number, versichertennummer, care_level, pflegegrad, status'

export const GET = withTracking(async function GET(request: Request) {
  const auth = await requireOpsAdmin('system.verwalten')
  if (!auth.ok) return toFhirErrorResponse(auth.response)

  try {
    const url = new URL(request.url)
    const count = Math.min(Math.max(parseInt(url.searchParams.get('_count') ?? '20', 10) || 20, 1), 100)
    const offset = Math.max(parseInt(url.searchParams.get('_offset') ?? '0', 10) || 0, 0)
    const name = url.searchParams.get('name')?.trim()

    const admin = createAdminClient()
    let query = admin
      .from('clients')
      .select(CLIENT_COLUMNS, { count: 'exact' })
      .eq('organization_id', auth.ctx.organizationId)
      .order('last_name', { ascending: true })
      .range(offset, offset + count - 1)

    if (name) {
      const safeName = name.replace(/[,.()"'\\]/g, '')
      if (safeName) {
        query = query.or(`first_name.ilike.%${safeName}%,last_name.ilike.%${safeName}%`)
      }
    }

    const { data, error, count: total } = await query
    if (error) return exceptionOutcome(error.message)

    const patients = (data as ClientFhirRow[] ?? []).map(clientToFhirPatient)
    const bundle = buildSearchsetBundle(patients, 'Patient', total ?? patients.length, request.url)

    return new NextResponse(JSON.stringify(bundle), { status: 200, headers: { 'Content-Type': FHIR_CONTENT_TYPE } })
  } catch (err) {
    return safeApiError(err, request)
  }
})
