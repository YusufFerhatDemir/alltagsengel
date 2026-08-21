import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePflegeAdmin } from '@/lib/pflege/api-auth'
import { createDiagnose, listDiagnosen } from '@/lib/pflege/diagnosen'
import type { DiagnoseTyp } from '@/lib/pflege/types'

export async function GET(request: Request) {
  try {
    const auth = await requirePflegeAdmin()
    if (!auth.ok) return auth.response

    const params = new URL(request.url).searchParams
    const admin = createAdminClient()
    const diagnosen = await listDiagnosen(admin, {
      organizationId: auth.ctx.organizationId,
      clientId: params.get('clientId') ?? undefined,
      diagnoseTyp: (params.get('diagnoseTyp') as DiagnoseTyp) ?? undefined,
      nurAktive: params.get('nurAktive') === 'true',
      nurBetreuungsrelevante: params.get('nurBetreuungsrelevante') === 'true',
    })

    return NextResponse.json({ diagnosen })
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
    if (!body.clientId || !body.bezeichnung) {
      return NextResponse.json({ error: 'clientId und bezeichnung sind Pflichtfelder.' }, { status: 400 })
    }

    const admin = createAdminClient()
    const diagnose = await createDiagnose(admin, {
      organizationId,
      clientId: body.clientId,
      diagnoseTyp: body.diagnoseTyp,
      bezeichnung: body.bezeichnung,
      icdCode: body.icdCode ?? null,
      beschreibung: body.beschreibung ?? null,
      diagnostiziertAm: body.diagnostiziertAm ?? null,
      diagnostiziertVon: body.diagnostiziertVon ?? null,
      schweregrad: body.schweregrad ?? null,
      betreuungsrelevant: body.betreuungsrelevant,
      hinweisFuerEngel: body.hinweisFuerEngel ?? null,
      erstelltVon: userId,
    })

    return NextResponse.json({ diagnose })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 })
  }
}
