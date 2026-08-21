import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePflegeAdmin } from '@/lib/pflege/api-auth'
import { upsertRisiko } from '@/lib/sis'

/** PUT { risiko, risikoVorhanden?, weitereEinschaetzung?, bemerkung? } */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const auth = await requirePflegeAdmin()
    if (!auth.ok) return auth.response

    const body = await request.json()
    if (!body.risiko) {
      return NextResponse.json({ error: 'risiko ist ein Pflichtfeld.' }, { status: 400 })
    }

    const admin = createAdminClient()
    const zeile = await upsertRisiko(admin, {
      organizationId: auth.ctx.organizationId,
      assessmentId: id,
      risiko: body.risiko,
      risikoVorhanden: body.risikoVorhanden,
      weitereEinschaetzung: body.weitereEinschaetzung,
      bemerkung: body.bemerkung,
    })

    return NextResponse.json({ risiko: zeile })
  } catch (err) {
    return apiErrorResponse(err, request)
  }
}
