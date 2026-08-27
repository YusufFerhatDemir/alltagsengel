import { createClient } from '@/lib/supabase/server'
import { rolleDarf } from '@/lib/auth/guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { getActiveOrgId } from '@/lib/organizations/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { withTracking } from '@/lib/monitoring/tracker'

export const GET = withTracking(async function GET(
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

    if (!profile || !rolleDarf(profile.role, 'abrechnung.lesen')) {
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
      .select('*')
      .eq('id', id)
      .eq('organization_id', organizationId)
      .single()

    if (!lauf) {
      return NextResponse.json({ error: 'Lauf nicht gefunden.' }, { status: 404 })
    }

    const { data: rechnungen } = await admin
      .from('dta_lauf_rechnungen')
      .select('*, invoice:invoices(id, invoice_number_formatted, total_amount, status, client_id)')
      .eq('lauf_id', id)
      .order('position_im_lauf')

    const { data: dakotaAuftraege } = await admin
      .from('dta_dakota_auftraege')
      .select('*')
      .eq('lauf_id', id)

    const { data: validierungen } = await admin
      .from('dta_validierungen')
      .select('*')
      .eq('lauf_id', id)
      .order('created_at', { ascending: false })
      .limit(1)

    const { data: fehler } = await admin
      .from('dta_fehlerprotokoll')
      .select('*')
      .eq('lauf_id', id)
      .order('created_at', { ascending: false })

    const { data: ruecklaeufer } = await admin
      .from('dta_ruecklaeufer')
      .select('*')
      .eq('lauf_id', id)
      .order('created_at', { ascending: false })

    return NextResponse.json({
      lauf,
      rechnungen: rechnungen ?? [],
      dakotaAuftraege: dakotaAuftraege ?? [],
      validierung: validierungen?.[0] ?? null,
      fehler: fehler ?? [],
      ruecklaeufer: ruecklaeufer ?? [],
    })
  } catch (err) {
    return safeApiError(err, _request)
  }
})
