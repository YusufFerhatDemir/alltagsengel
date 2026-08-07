import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { erstelleAbrechnungslauf } from '@/lib/abrechnung/kassenabrechnung-engine'

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
    if (!profile.organization_id) {
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
      organizationId: profile.organization_id,
      abrechnungsmonat,
      bundesland,
      kostentraegerIk,
      laufTyp,
      actorId: user.id,
    })

    return NextResponse.json(ergebnis)
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    )
  }
}
