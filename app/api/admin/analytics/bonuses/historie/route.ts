import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { listBerechnungen, type BonusBerechnungStatus } from '@/lib/analytics/bonusEngine'

export async function GET(request: Request) {
  const auth = await requireOpsAdmin()
  if (!auth.ok) return auth.response
  const url = new URL(request.url)
  const status = (url.searchParams.get('status') || undefined) as BonusBerechnungStatus | undefined
  try {
    const supabase = await createClient()
    const berechnungen = await listBerechnungen(supabase, { organizationId: auth.ctx.organizationId, status })
    return NextResponse.json(berechnungen)
  } catch (e: any) {
    return apiErrorResponse(e, request)
  }
}
