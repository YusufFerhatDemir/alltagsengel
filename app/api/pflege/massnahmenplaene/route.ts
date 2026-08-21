import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePflegeAdmin } from '@/lib/pflege/api-auth'
import { createPlan, listPlaene, neueVersion } from '@/lib/pflege/massnahmenplaene'
import type { PlanStatus, PlanTyp } from '@/lib/pflege/types'

export async function GET(request: Request) {
  try {
    const auth = await requirePflegeAdmin()
    if (!auth.ok) return auth.response

    const params = new URL(request.url).searchParams
    const admin = createAdminClient()
    const plaene = await listPlaene(admin, {
      organizationId: auth.ctx.organizationId,
      clientId: params.get('clientId') ?? undefined,
      status: (params.get('status') as PlanStatus) ?? undefined,
      planTyp: (params.get('planTyp') as PlanTyp) ?? undefined,
    })

    return NextResponse.json({ plaene })
  } catch (err) {
    return safeApiError(err, request)
  }
}

/**
 * POST — legt einen neuen Plan an.
 * Mit `vorgaengerId` entsteht stattdessen eine neue Version des angegebenen
 * Plans (version+1, Maßnahmen werden übernommen).
 */
export async function POST(request: Request) {
  try {
    const auth = await requirePflegeAdmin()
    if (!auth.ok) return auth.response
    const { userId, organizationId } = auth.ctx

    const body = await request.json()
    const admin = createAdminClient()

    if (body.vorgaengerId) {
      const plan = await neueVersion(admin, body.vorgaengerId, organizationId, userId, {
        titel: body.titel,
        gueltigVon: body.gueltigVon,
        gueltigBis: body.gueltigBis,
      })
      return NextResponse.json({ plan })
    }

    if (!body.clientId || !body.titel) {
      return NextResponse.json({ error: 'clientId und titel sind Pflichtfelder.' }, { status: 400 })
    }

    const plan = await createPlan(admin, {
      organizationId,
      clientId: body.clientId,
      titel: body.titel,
      planTyp: body.planTyp,
      gueltigVon: body.gueltigVon,
      gueltigBis: body.gueltigBis ?? null,
      betreuungsziele: body.betreuungsziele ?? null,
      pflegeziele: body.pflegeziele ?? null,
      erstelltVon: userId,
    })

    return NextResponse.json({ plan })
  } catch (err) {
    return apiErrorResponse(err, request)
  }
}
