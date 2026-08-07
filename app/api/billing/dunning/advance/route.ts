import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { advanceDunning, ensureDunningEntry } from '@/lib/billing/core'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles').select('role, organization_id').eq('id', user.id).single()
    if (!profile || !['admin', 'superadmin'].includes(profile.role)) {
      return NextResponse.json({ error: 'Nur für Administratoren.' }, { status: 403 })
    }

    const body = await request.json()
    const { invoiceId } = body
    if (!invoiceId) return NextResponse.json({ error: 'invoiceId erforderlich.' }, { status: 400 })

    const admin = createAdminClient()

    await ensureDunningEntry(admin, invoiceId, profile.organization_id!, user.id)
    const result = await advanceDunning(admin, invoiceId, user.id)

    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Interner Serverfehler'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
