import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { NextResponse } from 'next/server'
import { istCronGeheimnis } from '@/lib/api/cron-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { processPending, checkFristen } from '@/lib/workflow/processing'

export async function POST(request: Request) {
  // Konstantzeit-Vergleich im gemeinsamen Helfer; fail-closed, wenn
  // CRON_SECRET nicht gesetzt ist. Der Header heisst hier bewusst weiter
  // `x-cron-secret` — die Aufrufer dieser Route kennen kein Bearer-Schema.
  const isCron = istCronGeheimnis(request.headers.get('x-cron-secret'))

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
