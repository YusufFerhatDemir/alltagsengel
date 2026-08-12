// ═══════════════════════════════════════════════════════════════
// GET /api/fhir/CarePlan?patient=<clientId> — FHIR R4 CarePlan-Suche
// Quelle: pflege_massnahmenplaene + pflege_massnahmen (Block 21)
// ═══════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { buildSearchsetBundle, massnahmenplanToFhirCarePlan } from '@/lib/fhir/mappers'
import { exceptionOutcome, invalidOutcome, toFhirErrorResponse } from '@/lib/fhir/operation-outcome'
import type { PflegeMassnahme, PflegeMassnahmenplan } from '@/lib/pflege/types'

const FHIR_CONTENT_TYPE = 'application/fhir+json; charset=utf-8'

export async function GET(request: Request) {
  const auth = await requireOpsAdmin()
  if (!auth.ok) return toFhirErrorResponse(auth.response)

  try {
    const url = new URL(request.url)
    const patient = url.searchParams.get('patient')
    if (!patient) return invalidOutcome('Parameter "patient" ist erforderlich, z. B. ?patient=<Klienten-ID>.')

    const count = Math.min(Math.max(parseInt(url.searchParams.get('_count') ?? '50', 10) || 50, 1), 200)
    const offset = Math.max(parseInt(url.searchParams.get('_offset') ?? '0', 10) || 0, 0)

    const admin = createAdminClient()
    const { data: plaene, error, count: total } = await admin
      .from('pflege_massnahmenplaene')
      .select('*', { count: 'exact' })
      .eq('organization_id', auth.ctx.organizationId)
      .eq('client_id', patient)
      .order('gueltig_von', { ascending: false })
      .range(offset, offset + count - 1)

    if (error) return exceptionOutcome(error.message)

    const planRows = (plaene as PflegeMassnahmenplan[]) ?? []
    const planIds = planRows.map(p => p.id)

    let massnahmenByPlan = new Map<string, PflegeMassnahme[]>()
    if (planIds.length > 0) {
      const { data: massnahmen, error: mErr } = await admin
        .from('pflege_massnahmen')
        .select('*')
        .eq('organization_id', auth.ctx.organizationId)
        .in('plan_id', planIds)
        .order('sortierung', { ascending: true })
      if (mErr) return exceptionOutcome(mErr.message)
      massnahmenByPlan = new Map()
      for (const m of (massnahmen as PflegeMassnahme[]) ?? []) {
        const list = massnahmenByPlan.get(m.plan_id) ?? []
        list.push(m)
        massnahmenByPlan.set(m.plan_id, list)
      }
    }

    const carePlans = planRows.map(p => massnahmenplanToFhirCarePlan(p, massnahmenByPlan.get(p.id) ?? []))
    const bundle = buildSearchsetBundle(carePlans, 'CarePlan', total ?? carePlans.length, request.url)

    return new NextResponse(JSON.stringify(bundle), { status: 200, headers: { 'Content-Type': FHIR_CONTENT_TYPE } })
  } catch (err) {
    return exceptionOutcome((err as Error).message)
  }
}
