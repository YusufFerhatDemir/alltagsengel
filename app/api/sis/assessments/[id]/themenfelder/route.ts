import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePflegeAdmin } from '@/lib/pflege/api-auth'
import { upsertThemenfeld } from '@/lib/sis'
import { withTracking } from '@/lib/monitoring/tracker'

/** PUT { feldNr, sichtKlient?, einschaetzungPflege?, handlungsbedarf?, bemerkung? } */
export const PUT = withTracking(async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const auth = await requirePflegeAdmin('pflege.schreiben')
    if (!auth.ok) return auth.response

    const body = await request.json()
    if (body.feldNr === undefined) {
      return NextResponse.json({ error: 'feldNr ist ein Pflichtfeld.' }, { status: 400 })
    }

    const admin = createAdminClient()
    const themenfeld = await upsertThemenfeld(admin, {
      organizationId: auth.ctx.organizationId,
      assessmentId: id,
      feldNr: Number(body.feldNr),
      sichtKlient: body.sichtKlient,
      einschaetzungPflege: body.einschaetzungPflege,
      handlungsbedarf: body.handlungsbedarf,
      bemerkung: body.bemerkung,
    })

    return NextResponse.json({ themenfeld })
  } catch (err) {
    return apiErrorResponse(err, request)
  }
})
