import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { ladeQualityDashboard } from '@/lib/analytics/quality'
import { standardZeitraumAktuellerMonat } from '@/lib/analytics/kpi'

export async function GET(request: Request) {
  const auth = await requireOpsAdmin('berichte.lesen')
  if (!auth.ok) return auth.response

  const url = new URL(request.url)
  const von = url.searchParams.get('von')
  const bis = url.searchParams.get('bis')

  const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
  if ((von && !ISO_DATE.test(von)) || (bis && !ISO_DATE.test(bis))) {
    return NextResponse.json({ error: 'von/bis müssen im Format YYYY-MM-DD übergeben werden.' }, { status: 400 })
  }

  const zeitraum = von && bis ? { von, bis } : standardZeitraumAktuellerMonat()

  try {
    const supabase = await createClient()
    const dashboard = await ladeQualityDashboard(supabase, auth.ctx.organizationId, zeitraum)
    return NextResponse.json(dashboard)
  } catch (e: any) {
    return apiErrorResponse(e, request)
  }
}
