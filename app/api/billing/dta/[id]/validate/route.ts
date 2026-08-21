import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { preFlightValidierung } from '@/lib/abrechnung/kassenabrechnung-engine'
import { getActiveOrgId } from '@/lib/organizations/server'
import { safeApiError } from '@/lib/api/error-sanitizer'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || !['admin', 'superadmin'].includes(profile.role)) {
      return NextResponse.json({ error: 'Nur für Administratoren.' }, { status: 403 })
    }

    // Die Organisation haengt am organization_members-Mapping (Org-Switcher-Cookie),
    // NICHT an profiles — profiles hat keine organization_id-Spalte.
    const organizationId = await getActiveOrgId()
    if (!organizationId) {
      return NextResponse.json({ error: 'Keine Organisation zugewiesen.' }, { status: 403 })
    }

    const admin = createAdminClient()

    const { data: lauf } = await admin
      .from('abrechnungslaeufe')
      .select('abrechnungsmonat, bundesland, kostentraeger_ik, organization_id')
      .eq('id', id)
      .eq('organization_id', organizationId)
      .single()

    if (!lauf) {
      return NextResponse.json({ error: 'Lauf nicht gefunden.' }, { status: 404 })
    }

    const ergebnis = await preFlightValidierung(admin, {
      organizationId: lauf.organization_id,
      abrechnungsmonat: lauf.abrechnungsmonat,
      bundesland: lauf.bundesland,
      kostentraegerIk: lauf.kostentraeger_ik === 'SAMMEL' ? undefined : lauf.kostentraeger_ik,
    })

    return NextResponse.json(ergebnis)
  } catch (err) {
    return safeApiError(err, _request)
  }
}
