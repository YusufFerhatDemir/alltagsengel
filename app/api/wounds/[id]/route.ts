import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireWundenAdmin } from '@/lib/wunden/api-auth'
import { getWound, updateWound } from '@/lib/wunden/wunden'
import { listAssessments } from '@/lib/wunden/assessments'
import { listTreatments, naechsterVwTermin } from '@/lib/wunden/behandlungen'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const auth = await requireWundenAdmin()
    if (!auth.ok) return auth.response
    const { organizationId } = auth.ctx

    const admin = createAdminClient()
    const wunde = await getWound(admin, id, organizationId)
    if (!wunde) return NextResponse.json({ error: 'Wunde nicht gefunden.' }, { status: 404 })

    const [assessments, behandlungen] = await Promise.all([
      listAssessments(admin, id, organizationId),
      listTreatments(admin, id, organizationId),
    ])

    return NextResponse.json({
      wunde,
      assessments,
      behandlungen,
      naechsterVw: naechsterVwTermin(behandlungen),
    })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const auth = await requireWundenAdmin()
    if (!auth.ok) return auth.response

    const body = await request.json()
    const admin = createAdminClient()
    const wunde = await updateWound(admin, id, auth.ctx.organizationId, {
      wundTyp: body.wundTyp,
      dekubitusGrad: body.dekubitusGrad,
      lokalisation: body.lokalisation,
      koerperstelleCode: body.koerperstelleCode,
      koerperseite: body.koerperseite,
      entstandenAm: body.entstandenAm,
      status: body.status,
      abgeheiltAm: body.abgeheiltAm,
      bemerkung: body.bemerkung,
    })

    return NextResponse.json({ wunde })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 })
  }
}
