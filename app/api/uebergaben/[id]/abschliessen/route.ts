import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { requireUebergabeUser } from '@/lib/uebergabe/api-auth'
import { abschliessenProtokoll } from '@/lib/uebergabe/protokolle'
import { safeErrorResponse } from '@/lib/utils/api-error'
import { withTracking } from '@/lib/monitoring/tracker'

export const POST = withTracking(async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireUebergabeUser()
    if (!auth.ok) return auth.response
    const { id } = await params

    let zusammenfassung: string | undefined
    try {
      const body = await request.json()
      zusammenfassung = body?.zusammenfassung
    } catch {
      // Abschluss ohne Body ist zulässig — dann bleibt die bestehende
      // Zusammenfassung stehen.
    }

    const supabase = auth.ctx.istAdmin ? createAdminClient() : await createClient()
    const protokoll = await abschliessenProtokoll(
      supabase, id, auth.ctx.organizationId, auth.ctx.userId, zusammenfassung,
    )

    return NextResponse.json({ protokoll })
  } catch (err) {
    return safeErrorResponse(err, 400)
  }
})
