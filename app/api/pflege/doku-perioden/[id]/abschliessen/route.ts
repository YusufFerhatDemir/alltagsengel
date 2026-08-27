import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePflegeAdmin } from '@/lib/pflege/api-auth'
import { abschliessenPeriode } from '@/lib/pflege/doku-perioden'
import { withTracking } from '@/lib/monitoring/tracker'

/** POST { freigabeBemerkung? } — schließt den Monat ab und sperrt alle Verlaufseinträge. */
export const POST = withTracking(async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const auth = await requirePflegeAdmin('pflege.schreiben')
    if (!auth.ok) return auth.response

    const body = await request.json().catch(() => ({}))
    const admin = createAdminClient()
    const { periode, gesperrteEintraege } = await abschliessenPeriode(admin, id, auth.ctx.organizationId, {
      actorId: auth.ctx.userId,
      freigabeBemerkung: body.freigabeBemerkung ?? null,
    })

    return NextResponse.json({ periode, gesperrteEintraege })
  } catch (err) {
    return apiErrorResponse(err, request)
  }
})
