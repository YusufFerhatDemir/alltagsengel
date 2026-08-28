import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { erstelleAbrechnungslauf } from '@/lib/abrechnung/kassenabrechnung-engine'
import { getActiveOrgId } from '@/lib/organizations/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { withTracking } from '@/lib/monitoring/tracker'
import { holeRollenQuellenFuer, quellenDuerfen } from '@/lib/auth/rollen-quelle'

export const POST = withTracking(async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 })
    }

    const quellen = await holeRollenQuellenFuer(supabase, user)

    if (!quellenDuerfen(quellen, 'abrechnung.schreiben')) {
      return NextResponse.json({ error: 'Nur für Administratoren.' }, { status: 403 })
    }

    // Die Organisation haengt am organization_members-Mapping (Org-Switcher-Cookie),
    // NICHT an profiles — profiles hat keine organization_id-Spalte.
    const organizationId = await getActiveOrgId()
    if (!organizationId) {
      return NextResponse.json({ error: 'Keine Organisation zugewiesen.' }, { status: 403 })
    }

    const body = await request.json()
    const { abrechnungsmonat, bundesland, kostentraegerIk, laufTyp } = body

    if (!abrechnungsmonat || !bundesland) {
      return NextResponse.json(
        { error: 'abrechnungsmonat und bundesland sind Pflichtfelder.' },
        { status: 400 },
      )
    }

    const admin = createAdminClient()
    const ergebnis = await erstelleAbrechnungslauf(admin, {
      organizationId,
      abrechnungsmonat,
      bundesland,
      kostentraegerIk,
      laufTyp,
      actorId: user.id,
    })

    return NextResponse.json(ergebnis)
  } catch (err) {
    return safeApiError(err, request)
  }
})
