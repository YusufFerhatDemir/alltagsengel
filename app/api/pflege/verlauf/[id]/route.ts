import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePflegeAdmin } from '@/lib/pflege/api-auth'
import { updateVerlauf } from '@/lib/pflege/verlauf'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const auth = await requirePflegeAdmin('pflege.schreiben')
    if (!auth.ok) return auth.response

    const body = await request.json()
    const admin = createAdminClient()
    const eintrag = await updateVerlauf(admin, id, auth.ctx.organizationId, {
      eintragTyp: body.eintragTyp,
      kategorie: body.kategorie,
      titel: body.titel,
      inhalt: body.inhalt,
      istDringend: body.istDringend,
      sichtbarkeit: body.sichtbarkeit,
      massnahmeId: body.massnahmeId,
    }, auth.ctx.role)

    return NextResponse.json({ eintrag })
  } catch (err) {
    return apiErrorResponse(err, request)
  }
}
