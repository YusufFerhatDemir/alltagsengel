import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePflegeAdmin } from '@/lib/pflege/api-auth'
import { createAssessment, listAssessments } from '@/lib/sis'
import type { SisAssessmentTyp, SisStatus, SisVersorgungsform } from '@/lib/sis'

export async function GET(request: Request) {
  try {
    const auth = await requirePflegeAdmin()
    if (!auth.ok) return auth.response

    const params = new URL(request.url).searchParams
    const admin = createAdminClient()
    const assessments = await listAssessments(admin, {
      organizationId: auth.ctx.organizationId,
      clientId: params.get('clientId') ?? undefined,
      status: (params.get('status') as SisStatus) ?? undefined,
    })

    return NextResponse.json({ assessments })
  } catch (err) {
    return safeApiError(err, request)
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requirePflegeAdmin()
    if (!auth.ok) return auth.response
    const { userId, organizationId } = auth.ctx

    const body = await request.json()
    if (!body.clientId) {
      return NextResponse.json({ error: 'clientId ist ein Pflichtfeld.' }, { status: 400 })
    }

    const admin = createAdminClient()
    // Mandantenschutz: der Klient muss zur aktiven Organisation gehören.
    const { data: client } = await admin
      .from('clients')
      .select('id')
      .eq('id', body.clientId)
      .eq('organization_id', organizationId)
      .maybeSingle()
    if (!client) {
      return NextResponse.json({ error: 'Klient nicht gefunden oder gehört nicht zur Organisation.' }, { status: 404 })
    }

    const assessment = await createAssessment(admin, {
      organizationId,
      clientId: body.clientId,
      erhobenVon: body.erhobenVon ?? userId,
      erstelltVon: userId,
      assessmentDatum: body.assessmentDatum ?? null,
      assessmentTyp: body.assessmentTyp as SisAssessmentTyp | undefined,
      versorgungsform: body.versorgungsform as SisVersorgungsform | undefined,
      eingangsfrage: body.eingangsfrage ?? null,
      bemerkung: body.bemerkung ?? null,
    })

    return NextResponse.json({ assessment })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 })
  }
}
