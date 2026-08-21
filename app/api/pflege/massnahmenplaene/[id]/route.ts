import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePflegeAdmin } from '@/lib/pflege/api-auth'
import { getPlan, updatePlan } from '@/lib/pflege/massnahmenplaene'
import { listMassnahmen } from '@/lib/pflege/massnahmen'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const auth = await requirePflegeAdmin()
    if (!auth.ok) return auth.response
    const { organizationId } = auth.ctx

    const admin = createAdminClient()
    const plan = await getPlan(admin, id, organizationId)
    if (!plan) return NextResponse.json({ error: 'Maßnahmenplan nicht gefunden.' }, { status: 404 })

    const massnahmen = await listMassnahmen(admin, { organizationId, planId: id })

    return NextResponse.json({ plan, massnahmen })
  } catch (err) {
    return safeApiError(err, _request)
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const auth = await requirePflegeAdmin()
    if (!auth.ok) return auth.response

    const body = await request.json()
    const admin = createAdminClient()
    const plan = await updatePlan(admin, id, auth.ctx.organizationId, {
      titel: body.titel,
      planTyp: body.planTyp,
      gueltigVon: body.gueltigVon,
      gueltigBis: body.gueltigBis,
      status: body.status,
      betreuungsziele: body.betreuungsziele,
      pflegeziele: body.pflegeziele,
    })

    return NextResponse.json({ plan })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 })
  }
}
