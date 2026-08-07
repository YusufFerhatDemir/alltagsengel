import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { allocatePayment } from '@/lib/billing/core'

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
    const { paymentId, allocations } = body

    if (!paymentId || !allocations || !Array.isArray(allocations) || allocations.length === 0) {
      return NextResponse.json({ error: 'paymentId und allocations[] erforderlich.' }, { status: 400 })
    }

    for (const a of allocations) {
      if (!a.invoiceId || !a.amountCents || a.amountCents <= 0) {
        return NextResponse.json({ error: 'Jede Zuordnung braucht invoiceId und amountCents > 0.' }, { status: 400 })
      }
    }

    const admin = createAdminClient()
    await allocatePayment(admin, { paymentId, allocations, actorId: user.id })

    return NextResponse.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Interner Serverfehler'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
