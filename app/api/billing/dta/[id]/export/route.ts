import { createClient } from '@/lib/supabase/server'
import { rolleDarf } from '@/lib/auth/guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { exportiereLauf } from '@/lib/abrechnung/kassenabrechnung-engine'
import { getOrgIK } from '@/lib/config/org-config'
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

    if (!profile || !rolleDarf(profile.role, 'abrechnung.schreiben')) {
      return NextResponse.json({ error: 'Nur für Administratoren.' }, { status: 403 })
    }

    // Die Organisation haengt am organization_members-Mapping (Org-Switcher-Cookie),
    // NICHT an profiles — profiles hat keine organization_id-Spalte.
    const organizationId = await getActiveOrgId()
    if (!organizationId) {
      return NextResponse.json({ error: 'Keine Organisation.' }, { status: 403 })
    }

    const admin = createAdminClient()

    // Org-Fence: exportiereLauf laeuft mit Service-Role (BYPASSRLS), die
    // Zugehoerigkeit des Laufs muss deshalb hier explizit geprueft werden.
    const { data: lauf } = await admin
      .from('abrechnungslaeufe')
      .select('id')
      .eq('id', id)
      .eq('organization_id', organizationId)
      .maybeSingle()

    if (!lauf) {
      return NextResponse.json({ error: 'Lauf nicht gefunden.' }, { status: 404 })
    }

    const absenderIk = await getOrgIK(admin, organizationId)

    const ergebnis = await exportiereLauf(admin, id, absenderIk, user.id, organizationId)

    return NextResponse.json(ergebnis)
  } catch (err) {
    return safeApiError(err, _request)
  }
}
