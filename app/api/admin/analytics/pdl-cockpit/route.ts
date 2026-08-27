import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { ladePdlCockpit, standardZeitraumAktuellerMonat } from '@/lib/analytics/pdl-cockpit'
import { withTracking } from '@/lib/monitoring/tracker'

export const GET = withTracking(async function GET(request: Request) {
  const auth = await requireOpsAdmin('berichte.lesen')
  if (!auth.ok) return auth.response

  const url = new URL(request.url)
  const von = url.searchParams.get('von')
  const bis = url.searchParams.get('bis')
  const zeitraum = von && bis ? { von, bis } : standardZeitraumAktuellerMonat()

  try {
    // Service-Role statt RLS-Client: lib/analytics/pdl-cockpit.ts fragt u. a.
    // absences, personal_arbeitszeitkonto, satisfaction_calls, verordnungen
    // und dienstplan_eintraege ab — keine dieser Tabellen hat eine
    // RLS-Policy für pdl/qm (nur is_admin() + teils Engel-Policies), obwohl
    // beide Rollen hier per requireOpsAdmin('berichte.lesen') zugriffs-
    // berechtigt sind. Jede Einzelabfrage ist bewusst try/catch-resilient
    // (Kommentar in ladePdlCockpit) — ohne Service-Role verschluckt genau
    // dieses Resilienz-Design die RLS-Lücke lautlos zu "0", ausgerechnet
    // für die Kennzahlen, die das PDL-Cockpit seiner Zielrolle zeigen soll.
    const supabase = createAdminClient()
    const data = await ladePdlCockpit(supabase, auth.ctx.organizationId, zeitraum)
    return NextResponse.json(data)
  } catch (e: any) {
    return apiErrorResponse(e, request)
  }
})
