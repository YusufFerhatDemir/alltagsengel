import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { erstellePruefmappe } from '@/lib/analytics/pruefmappe'
import { withTracking } from '@/lib/monitoring/tracker'

export const GET = withTracking(async function GET(request: Request) {
  const auth = await requireOpsAdmin('berichte.lesen')
  if (!auth.ok) return auth.response

  const url = new URL(request.url)
  const clientId = url.searchParams.get('client_id')
  const von = url.searchParams.get('von')
  const bis = url.searchParams.get('bis')
  if (!clientId || !von || !bis) {
    return NextResponse.json({ error: 'client_id, von und bis sind erforderlich.' }, { status: 400 })
  }

  try {
    // Service-Role statt RLS-Client: pflege_massnahmenplaene/pflege_massnahmen
    // haben keine RLS-Policy für pdl/qm (nur is_admin() + Engel-Select). Ohne
    // Service-Role zeigte die MDK-Prüfmappe die Kategorie "Maßnahmenplan"
    // für PDL/QM immer als "keine_daten", selbst wenn ein aktiver Plan
    // existiert — bei einer Prüfvorbereitung besonders riskant.
    const supabase = createAdminClient()
    const mappe = await erstellePruefmappe(supabase, { organizationId: auth.ctx.organizationId, clientId, von, bis })
    return NextResponse.json(mappe)
  } catch (e: any) {
    return apiErrorResponse(e, request)
  }
})
