import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { erstelleKorrekturlauf, fuehreKorrekturAus, ladeKorrekturHistorie } from '@/lib/abrechnung/korrekturlaeufe'

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
    const laufId = searchParams.get('lauf_id')

    const admin = createAdminClient()

    if (laufId) {
      const historie = await ladeKorrekturHistorie(admin, laufId)
      return NextResponse.json(historie)
    }

    const { data } = await admin
      .from('dta_korrekturlaeufe')
      .select('*, original_lauf:abrechnungslaeufe!dta_korrekturlaeufe_original_lauf_id_fkey(id, abrechnungsmonat, kostentraeger_name, status)')
      .eq('organization_id', profile.organization_id)
      .order('created_at', { ascending: false })
      .limit(100)

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

    const admin = createAdminClient()

    if (body.action === 'ausfuehren' && body.korrekturId) {
      const ergebnis = await fuehreKorrekturAus(admin, body.korrekturId, user.id)
      return NextResponse.json(ergebnis)
    }

    if (!body.originalLaufId || !body.korrekturTyp || !body.korrekturGrund) {
      return NextResponse.json(
        { error: 'originalLaufId, korrekturTyp und korrekturGrund sind Pflichtfelder.' },
        { status: 400 },
      )
    }

    const ergebnis = await erstelleKorrekturlauf(admin, {
      organizationId: profile.organization_id!,
      originalLaufId: body.originalLaufId,
      ruecklaeuferId: body.ruecklaeuferId,
      fehlerIds: body.fehlerIds,
      korrekturTyp: body.korrekturTyp,
      korrekturGrund: body.korrekturGrund,
      actorId: user.id,
    })

    return NextResponse.json(ergebnis)
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
