import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { gebeLaufFrei } from '@/lib/abrechnung/kassenabrechnung-engine'

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
      .select('role, organization_id')
      .eq('id', user.id)
      .single()

    if (!profile || !['admin', 'superadmin'].includes(profile.role)) {
      return NextResponse.json({ error: 'Nur für Administratoren.' }, { status: 403 })
    }

    const admin = createAdminClient()

    const { data: lauf } = await admin
      .from('abrechnungslaeufe')
      .select('organization_id')
      .eq('id', id)
      .eq('organization_id', profile.organization_id)
      .single()

    if (!lauf) {
      return NextResponse.json({ error: 'Lauf nicht gefunden.' }, { status: 404 })
    }

    await gebeLaufFrei(admin, id, user.id)

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
