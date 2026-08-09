import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePflegeAdmin } from '@/lib/pflege/api-auth'
import { getAssessment, updateAssessment } from '@/lib/sis'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const auth = await requirePflegeAdmin()
    if (!auth.ok) return auth.response

    const admin = createAdminClient()
    const assessment = await getAssessment(admin, id, auth.ctx.organizationId)
    if (!assessment) return NextResponse.json({ error: 'SIS nicht gefunden.' }, { status: 404 })

    return NextResponse.json({ assessment })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const auth = await requirePflegeAdmin()
    if (!auth.ok) return auth.response

    const body = await request.json()
    const admin = createAdminClient()
    const assessment = await updateAssessment(admin, id, auth.ctx.organizationId, {
      assessmentDatum: body.assessmentDatum,
      assessmentTyp: body.assessmentTyp,
      eingangsfrage: body.eingangsfrage,
      bemerkung: body.bemerkung,
    })

    return NextResponse.json({ assessment })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 })
  }
}
