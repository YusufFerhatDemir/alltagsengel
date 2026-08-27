import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePflegeAdmin } from '@/lib/pflege/api-auth'
import { createPeriode, listPerioden } from '@/lib/pflege/doku-perioden'
import type { PeriodenStatus } from '@/lib/pflege/types'
import { withTracking } from '@/lib/monitoring/tracker'

export const GET = withTracking(async function GET(request: Request) {
  try {
    const auth = await requirePflegeAdmin('pflege.lesen')
    if (!auth.ok) return auth.response

    const params = new URL(request.url).searchParams
    const admin = createAdminClient()
    const perioden = await listPerioden(admin, {
      organizationId: auth.ctx.organizationId,
      clientId: params.get('clientId') ?? undefined,
      jahr: params.get('jahr') ? Number(params.get('jahr')) : undefined,
      status: (params.get('status') as PeriodenStatus) ?? undefined,
    })

    return NextResponse.json({ perioden })
  } catch (err) {
    return safeApiError(err, request)
  }
})

export const POST = withTracking(async function POST(request: Request) {
  try {
    const auth = await requirePflegeAdmin('pflege.schreiben')
    if (!auth.ok) return auth.response

    const body = await request.json()
    if (!body.clientId || !body.jahr || !body.monat) {
      return NextResponse.json({ error: 'clientId, jahr und monat sind Pflichtfelder.' }, { status: 400 })
    }

    const admin = createAdminClient()
    const periode = await createPeriode(admin, {
      organizationId: auth.ctx.organizationId,
      clientId: body.clientId,
      jahr: Number(body.jahr),
      monat: Number(body.monat),
    })

    return NextResponse.json({ periode })
  } catch (err) {
    return apiErrorResponse(err, request)
  }
})
