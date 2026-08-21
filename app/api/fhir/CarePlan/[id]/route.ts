// ═══════════════════════════════════════════════════════════════
// GET /api/fhir/CarePlan/[id] — FHIR R4 CarePlan (Block 21)
// ═══════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { massnahmenplanToFhirCarePlan } from '@/lib/fhir/mappers'
import { exceptionOutcome, notFoundOutcome, toFhirErrorResponse } from '@/lib/fhir/operation-outcome'
import type { PflegeMassnahme, PflegeMassnahmenplan } from '@/lib/pflege/types'

const FHIR_CONTENT_TYPE = 'application/fhir+json; charset=utf-8'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await requireOpsAdmin()
  if (!auth.ok) return toFhirErrorResponse(auth.response)

  try {
    const admin = createAdminClient()
    const { data: plan, error } = await admin
      .from('pflege_massnahmenplaene')
      .select('*')
      .eq('id', id)
      .eq('organization_id', auth.ctx.organizationId)
      .maybeSingle()

    if (error) return exceptionOutcome(error.message)
    if (!plan) return notFoundOutcome('CarePlan', id)

    const { data: massnahmen, error: mErr } = await admin
      .from('pflege_massnahmen')
      .select('*')
      .eq('organization_id', auth.ctx.organizationId)
      .eq('plan_id', id)
      .order('sortierung', { ascending: true })
    if (mErr) return exceptionOutcome(mErr.message)

    const carePlan = massnahmenplanToFhirCarePlan(plan as PflegeMassnahmenplan, (massnahmen as PflegeMassnahme[]) ?? [])
    return new NextResponse(JSON.stringify(carePlan), { status: 200, headers: { 'Content-Type': FHIR_CONTENT_TYPE } })
  } catch (err) {
    return safeApiError(err, _request)
  }
}
