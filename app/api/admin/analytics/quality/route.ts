import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { ladeQualityDashboard } from '@/lib/analytics/quality'
import { standardZeitraumAktuellerMonat } from '@/lib/analytics/kpi'
import { withTracking } from '@/lib/monitoring/tracker'

export const GET = withTracking(async function GET(request: Request) {
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
    // Service-Role statt RLS-Client: pflege_massnahmen und vital_sign_thresholds
    // haben keine RLS-Policy für pdl/qm (nur admin/superadmin + Engel), obwohl
    // beide Rollen hier per requireOpsAdmin('berichte.lesen') zugriffsberechtigt
    // sind — ohne Service-Role zeigte das Dashboard "offene Maßnahmen" für
    // PDL/QM still immer als 0 und Vitalalarme ohne die client-spezifischen
    // Grenzwerte (Fallback auf Standardwerte).
    const supabase = createAdminClient()
    const dashboard = await ladeQualityDashboard(supabase, auth.ctx.organizationId, zeitraum)
    return NextResponse.json(dashboard)
  } catch (e: any) {
    return apiErrorResponse(e, request)
  }
})
