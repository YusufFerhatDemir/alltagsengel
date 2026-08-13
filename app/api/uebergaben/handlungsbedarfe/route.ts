import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { requireUebergabeUser } from '@/lib/uebergabe/api-auth'
import { listOffeneHandlungsbedarfe } from '@/lib/uebergabe/punkte'
import { safeErrorResponse } from '@/lib/utils/api-error'

/** Offene Handlungsbedarfe aus allen Übergaben — das Arbeitsblatt des Folgedienstes. */
export async function GET(request: Request) {
  try {
    const auth = await requireUebergabeUser()
    if (!auth.ok) return auth.response

    const limitParam = new URL(request.url).searchParams.get('limit')
    const supabase = auth.ctx.istAdmin ? createAdminClient() : await createClient()
    const punkte = await listOffeneHandlungsbedarfe(
      supabase, auth.ctx.organizationId, limitParam ? Number(limitParam) : undefined,
    )

    return NextResponse.json({ punkte })
  } catch (err) {
    return safeErrorResponse(err, 400)
  }
}
