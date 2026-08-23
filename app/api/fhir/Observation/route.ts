// ═══════════════════════════════════════════════════════════════
// GET /api/fhir/Observation?patient=<clientId>&category=vital-signs
// FHIR R4 Observation-Suche — Quelle: vital_signs (Block 21)
//
// category ist aktuell nur mit 'vital-signs' sinnvoll befüllbar (das
// ist die einzige Observation-Quelle, die dieses Modul kennt) — wird
// aber als Parameter entgegengenommen, um FHIR-konform zu bleiben.
// ═══════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { buildSearchsetBundle, vitalSignToFhirObservation } from '@/lib/fhir/mappers'
import { exceptionOutcome, invalidOutcome, toFhirErrorResponse } from '@/lib/fhir/operation-outcome'
import type { VitalSign } from '@/lib/vitals/types'

const FHIR_CONTENT_TYPE = 'application/fhir+json; charset=utf-8'

export async function GET(request: Request) {
  const auth = await requireOpsAdmin('system.verwalten')
  if (!auth.ok) return toFhirErrorResponse(auth.response)

  try {
    const url = new URL(request.url)
    const patient = url.searchParams.get('patient')
    if (!patient) return invalidOutcome('Parameter "patient" ist erforderlich, z. B. ?patient=<Klienten-ID>.')

    const category = url.searchParams.get('category')
    if (category && category !== 'vital-signs') {
      return invalidOutcome(`Kategorie "${category}" wird nicht unterstützt. Unterstützt: vital-signs.`)
    }

    const count = Math.min(Math.max(parseInt(url.searchParams.get('_count') ?? '50', 10) || 50, 1), 200)
    const offset = Math.max(parseInt(url.searchParams.get('_offset') ?? '0', 10) || 0, 0)

    const admin = createAdminClient()
    const { data, error, count: total } = await admin
      .from('vital_signs')
      .select('*', { count: 'exact' })
      .eq('organization_id', auth.ctx.organizationId)
      .eq('client_id', patient)
      .order('measured_at', { ascending: false })
      .range(offset, offset + count - 1)

    if (error) return exceptionOutcome(error.message)

    const observations = (data as VitalSign[] ?? []).map(vitalSignToFhirObservation)
    const bundle = buildSearchsetBundle(observations, 'Observation', total ?? observations.length, request.url)

    return new NextResponse(JSON.stringify(bundle), { status: 200, headers: { 'Content-Type': FHIR_CONTENT_TYPE } })
  } catch (err) {
    return safeApiError(err, request)
  }
}
