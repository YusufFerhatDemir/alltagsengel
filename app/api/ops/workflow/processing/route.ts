import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { processPending, checkFristen } from '@/lib/workflow/processing'

export async function POST(request: Request) {
  const cronSecret = request.headers.get('x-cron-secret')
  const expectedSecret = process.env.CRON_SECRET

  let isCron = false
  if (cronSecret && expectedSecret && cronSecret === expectedSecret) {
    isCron = true
  }

  if (!isCron) {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 })
    }
    const { data: profile } = await supabase
      .from('profiles').select('role').eq('id', user.id).single()
    if (!profile || profile.role !== 'superadmin') {
      return NextResponse.json({ error: 'Nur fuer Superadmins — diese Route verarbeitet organisationsuebergreifende Daten.' }, { status: 403 })
    }
  }

  const admin = createAdminClient()
  try {
    const body = await request.json().catch(() => ({}))
    const action = body.action ?? 'process_pending'

    if (action === 'check_fristen') {
      const data = await checkFristen(admin)
      return NextResponse.json(data)
    }

    if (action === 'process_pending') {
      const data = await processPending(admin, { limit: body.limit })
      return NextResponse.json(data)
    }

    return NextResponse.json({ error: 'Unbekannte Aktion. Erlaubt: process_pending, check_fristen' }, { status: 400 })
  } catch (e: any) {
    return apiErrorResponse(e, request)
  }
}
