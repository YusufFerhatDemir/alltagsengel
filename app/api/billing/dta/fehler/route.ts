import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { aktualisiereFehler, holeFehlerDashboard } from '@/lib/abrechnung/fehlerprotokoll'
import { getActiveOrgId } from '@/lib/organizations/server'
import { withTracking } from '@/lib/monitoring/tracker'
import { holeRollenQuellenFuer, quellenDuerfen } from '@/lib/auth/rollen-quelle'

export const GET = withTracking(async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 })
    }

    const quellen = await holeRollenQuellenFuer(supabase, user)

    if (!quellenDuerfen(quellen, 'abrechnung.lesen')) {
      return NextResponse.json({ error: 'Nur für Administratoren.' }, { status: 403 })
    }

    // Die Organisation haengt am organization_members-Mapping (Org-Switcher-Cookie),
    // NICHT an profiles — profiles hat keine organization_id-Spalte.
    const organizationId = await getActiveOrgId()
    if (!organizationId) {
      return NextResponse.json({ error: 'Keine Organisation zugewiesen.' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const view = searchParams.get('view')

    const admin = createAdminClient()

    if (view === 'dashboard') {
      const dashboard = await holeFehlerDashboard(admin, organizationId, {
        laufId: searchParams.get('lauf_id') || undefined,
        zeitraumVon: searchParams.get('von') || undefined,
        zeitraumBis: searchParams.get('bis') || undefined,
      })
      return NextResponse.json(dashboard)
    }

    let query = admin
      .from('dta_fehlerprotokoll')
      .select('*, lauf:abrechnungslaeufe(id, abrechnungsmonat, kostentraeger_name)')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(200)

    const status = searchParams.get('status')
    const schwere = searchParams.get('schwere')
    const laufId = searchParams.get('lauf_id')

    if (status) query = query.eq('bearbeitungsstatus', status)
    if (schwere) query = query.eq('schweregrad', schwere)
    if (laufId) query = query.eq('lauf_id', laufId)

    const { data } = await query
    return NextResponse.json(data ?? [])
  } catch (err) {
    return safeApiError(err, request)
  }
})

export const PATCH = withTracking(async function PATCH(request: Request) {
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
    if (!body.fehlerId || !body.bearbeitungsstatus) {
      return NextResponse.json(
        { error: 'fehlerId und bearbeitungsstatus sind Pflichtfelder.' },
        { status: 400 },
      )
    }

    const admin = createAdminClient()

    // Org-Fence: aktualisiereFehler laeuft mit Service-Role (BYPASSRLS).
    const { data: fehler } = await admin
      .from('dta_fehlerprotokoll')
      .select('id')
      .eq('id', body.fehlerId)
      .eq('organization_id', organizationId)
      .maybeSingle()

    if (!fehler) {
      return NextResponse.json({ error: 'Fehler nicht gefunden.' }, { status: 404 })
    }

    await aktualisiereFehler(admin, {
      fehlerId: body.fehlerId,
      bearbeitungsstatus: body.bearbeitungsstatus,
      loesung: body.loesung,
      interneErklaerung: body.interneErklaerung,
      korrekturLaufId: body.korrekturLaufId,
      verantwortlicher: body.verantwortlicher,
      wiedervorlageAm: body.wiedervorlageAm,
      actorId: user.id,
      organizationId,
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    return safeApiError(err, request)
  }
})
