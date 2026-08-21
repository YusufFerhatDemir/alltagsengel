import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePflegeAdmin } from '@/lib/pflege/api-auth'
import { deaktiviereDiagnose, updateDiagnose } from '@/lib/pflege/diagnosen'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const auth = await requirePflegeAdmin()
    if (!auth.ok) return auth.response

    const body = await request.json()
    const admin = createAdminClient()
    const diagnose = await updateDiagnose(admin, id, auth.ctx.organizationId, {
      diagnoseTyp: body.diagnoseTyp,
      bezeichnung: body.bezeichnung,
      icdCode: body.icdCode,
      beschreibung: body.beschreibung,
      diagnostiziertAm: body.diagnostiziertAm,
      diagnostiziertVon: body.diagnostiziertVon,
      schweregrad: body.schweregrad,
      aktiv: body.aktiv,
      betreuungsrelevant: body.betreuungsrelevant,
      hinweisFuerEngel: body.hinweisFuerEngel,
    })

    return NextResponse.json({ diagnose })
  } catch (err) {
    return apiErrorResponse(err, request)
  }
}

/** Soft-Delete: aktiv=false. Die Diagnose bleibt für die Historie erhalten. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const auth = await requirePflegeAdmin()
    if (!auth.ok) return auth.response

    const admin = createAdminClient()
    const diagnose = await deaktiviereDiagnose(admin, id, auth.ctx.organizationId)

    return NextResponse.json({ diagnose })
  } catch (err) {
    return apiErrorResponse(err, _request)
  }
}
