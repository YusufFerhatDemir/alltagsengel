import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { ladeKpiDashboard, standardZeitraumAktuellerMonat } from '@/lib/analytics/kpi'
import { withTracking } from '@/lib/monitoring/tracker'

export const GET = withTracking(async function GET(request: Request) {
  const auth = await requireOpsAdmin('berichte.lesen')
  if (!auth.ok) return auth.response

  const url = new URL(request.url)
  const von = url.searchParams.get('von')
  const bis = url.searchParams.get('bis')
  const zeitraum = von && bis ? { von, bis } : standardZeitraumAktuellerMonat()

  try {
    const supabase = await createClient()
    const dashboard = await ladeKpiDashboard(supabase, auth.ctx.organizationId, zeitraum)
    return NextResponse.json(dashboard)
  } catch (e: any) {
    return apiErrorResponse(e, request)
  }
})
