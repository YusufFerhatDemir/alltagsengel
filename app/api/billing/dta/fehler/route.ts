import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { aktualisiereFehler, holeFehlerDashboard } from '@/lib/abrechnung/fehlerprotokoll'

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, organization_id')
      .eq('id', user.id)
      .single()

    if (!profile || !['admin', 'superadmin'].includes(profile.role)) {
      return NextResponse.json({ error: 'Nur für Administratoren.' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const view = searchParams.get('view')

    const admin = createAdminClient()

    if (view === 'dashboard') {
      const dashboard = await holeFehlerDashboard(admin, profile.organization_id!, {
        laufId: searchParams.get('lauf_id') || undefined,
        zeitraumVon: searchParams.get('von') || undefined,
        zeitraumBis: searchParams.get('bis') || undefined,
      })
      return NextResponse.json(dashboard)
    }

    let query = admin
      .from('dta_fehlerprotokoll')
      .select('*, lauf:abrechnungslaeufe(id, abrechnungsmonat, kostentraeger_name)')
      .eq('organization_id', profile.organization_id)
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
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, organization_id')
      .eq('id', user.id)
      .single()

    if (!profile || !['admin', 'superadmin'].includes(profile.role)) {
      return NextResponse.json({ error: 'Nur für Administratoren.' }, { status: 403 })
    }

    const body = await request.json()
    if (!body.fehlerId || !body.bearbeitungsstatus) {
      return NextResponse.json(
        { error: 'fehlerId und bearbeitungsstatus sind Pflichtfelder.' },
        { status: 400 },
      )
    }

    const admin = createAdminClient()
    await aktualisiereFehler(admin, { ...body, actorId: user.id })

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
