import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { listAktivitaetslog } from '@/lib/ops/aktivitaetslog'
import type { AktivitaetEntitaetTyp } from '@/lib/ops/types'

export async function GET(request: Request) {
  const auth = await requireOpsAdmin('audit.lesen')
  if (!auth.ok) return auth.response
  const supabase = createAdminClient()
  const url = new URL(request.url)
  const entitaetTyp = (url.searchParams.get('entitaet_typ') || undefined) as AktivitaetEntitaetTyp | undefined
  const entitaetId = url.searchParams.get('entitaet_id') || undefined
  const limit = url.searchParams.get('limit') ? Number(url.searchParams.get('limit')) : undefined
  const offset = url.searchParams.get('offset') ? Number(url.searchParams.get('offset')) : undefined
  try {
    const data = await listAktivitaetslog(supabase, {
      organizationId: auth.ctx.organizationId,
      entitaetTyp,
      entitaetId,
      limit,
      offset,
    })
    return NextResponse.json(data)
  } catch (e: any) {
    return apiErrorResponse(e, request)
  }
}
