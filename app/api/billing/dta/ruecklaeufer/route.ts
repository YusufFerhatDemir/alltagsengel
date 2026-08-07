import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { importiereRuecklaeufer } from '@/lib/abrechnung/ruecklaeufer'

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
    const status = searchParams.get('status')
    const laufId = searchParams.get('lauf_id')

    const admin = createAdminClient()
    let query = admin
      .from('dta_ruecklaeufer')
      .select('*, lauf:abrechnungslaeufe(id, abrechnungsmonat, kostentraeger_name, status)')
      .eq('organization_id', profile.organization_id)
      .order('created_at', { ascending: false })
      .limit(100)

    if (status) query = query.eq('status', status)
    if (laufId) query = query.eq('lauf_id', laufId)

    const { data } = await query
    return NextResponse.json(data ?? [])
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

export async function POST(request: Request) {
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
    if (!body.ruecklaeuferTyp || !body.originalMeldung) {
      return NextResponse.json(
        { error: 'ruecklaeuferTyp und originalMeldung sind Pflichtfelder.' },
        { status: 400 },
      )
    }

    const admin = createAdminClient()
    const ergebnis = await importiereRuecklaeufer(admin, {
      ...body,
      organizationId: profile.organization_id,
      actorId: user.id,
    })

    return NextResponse.json(ergebnis)
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
