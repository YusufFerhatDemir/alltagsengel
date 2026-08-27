import { NextResponse } from 'next/server'
import { rolleDarf } from '@/lib/auth/guard'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getActiveOrgId } from '@/lib/organizations/server'
import { berlinParts } from '@/lib/utils/timezone'
import { uebertrageJahresbudgets } from '@/lib/budget/auto-budget'
import { withTracking } from '@/lib/monitoring/tracker'

export const POST = withTracking(async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !rolleDarf(profile.role, 'stammdaten.schreiben')) {
    return NextResponse.json({ error: 'Nur für Administratoren.' }, { status: 403 })
  }

  const organizationId = await getActiveOrgId()
  if (!organizationId) {
    return NextResponse.json({ error: 'Keine Organisation zugewiesen.' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const currentYear = parseInt(berlinParts(new Date()).year, 10)
  const vonJahr = typeof body.vonJahr === 'number' ? body.vonJahr : currentYear - 1
  const nachJahr = typeof body.nachJahr === 'number' ? body.nachJahr : currentYear

  if (nachJahr <= vonJahr) {
    return NextResponse.json({ error: 'nachJahr muss größer als vonJahr sein.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const result = await uebertrageJahresbudgets(admin, organizationId, vonJahr, nachJahr)

  return NextResponse.json({
    vonJahr,
    nachJahr,
    ...result,
  })
})
