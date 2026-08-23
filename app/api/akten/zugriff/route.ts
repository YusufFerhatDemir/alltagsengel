import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAktenAdmin } from '@/lib/akten/api-auth'
import { listAktenZugriffLog } from '@/lib/akten/zugriff-log'
import type { ZugriffEntitaetTyp } from '@/lib/akten/types'

export async function GET(request: Request) {
  try {
    const auth = await requireAktenAdmin('stammdaten.lesen')
    if (!auth.ok) return auth.response
    const { organizationId } = auth.ctx

    const params = new URL(request.url).searchParams
    const admin = createAdminClient()
    const eintraege = await listAktenZugriffLog(admin, {
      organizationId,
      entitaetTyp: (params.get('entitaetTyp') as ZugriffEntitaetTyp) ?? undefined,
      entitaetId: params.get('entitaetId') ?? undefined,
      benutzerId: params.get('benutzerId') ?? undefined,
      von: params.get('von') ?? undefined,
      bis: params.get('bis') ?? undefined,
      limit: params.get('limit') ? Number(params.get('limit')) : undefined,
    })

    return NextResponse.json({ eintraege })
  } catch (err) {
    return safeApiError(err, request)
  }
}
