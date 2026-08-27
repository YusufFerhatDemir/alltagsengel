import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireBonusVerwaltung } from '@/lib/analytics/bonus-auth'
import { listBerechnungen, type BonusBerechnungStatus } from '@/lib/analytics/bonusEngine'
import { withTracking } from '@/lib/monitoring/tracker'

export const GET = withTracking(async function GET(request: Request) {
  const auth = await requireBonusVerwaltung()
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
})
