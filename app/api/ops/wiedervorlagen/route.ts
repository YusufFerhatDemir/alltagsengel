import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { listWiedervorlagen, createWiedervorlage } from '@/lib/ops/wiedervorlagen'
import type { WiedervorlageStatus } from '@/lib/ops/types'
import { withTracking } from '@/lib/monitoring/tracker'

export const GET = withTracking(async function GET(request: Request) {
  const auth = await requireOpsAdmin('qm.lesen')
  if (!auth.ok) return auth.response
  const supabase = createAdminClient()
  const url = new URL(request.url)
  const status = (url.searchParams.get('status') || undefined) as WiedervorlageStatus | undefined
  const empfaengerId = url.searchParams.get('empfaenger_id') || undefined
  try {
    const data = await listWiedervorlagen(supabase, {
      organizationId: auth.ctx.organizationId,
      status,
      empfaengerId,
    })
    return NextResponse.json(data)
  } catch (e: any) {
    return apiErrorResponse(e, request)
  }
})

export const POST = withTracking(async function POST(request: Request) {
  const auth = await requireOpsAdmin('qm.schreiben')
  if (!auth.ok) return auth.response
  const supabase = createAdminClient()
  try {
    const body = await request.json()
    const { id: _id, organization_id: _oid, created_at: _ca, ...safeData } = body
    const data = await createWiedervorlage(supabase, {
      organizationId: auth.ctx.organizationId,
      data: { ...safeData, erstellt_von: safeData.erstellt_von || auth.ctx.userId },
    })
    return NextResponse.json(data)
  } catch (e: any) {
    return apiErrorResponse(e, request)
  }
})
