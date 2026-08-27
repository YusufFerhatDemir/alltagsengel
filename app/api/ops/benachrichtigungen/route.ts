import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsUser } from '@/lib/ops/api-auth'
import { listBenachrichtigungen } from '@/lib/ops/benachrichtigungen'
import type { BenachrichtigungKategorie } from '@/lib/ops/types'
import { withTracking } from '@/lib/monitoring/tracker'

export const GET = withTracking(async function GET(request: Request) {
  const auth = await requireOpsUser()
  if (!auth.ok) return auth.response
  const supabase = createAdminClient()
  const url = new URL(request.url)
  const gelesen = url.searchParams.get('gelesen')
  const kategorie = (url.searchParams.get('kategorie') || undefined) as BenachrichtigungKategorie | undefined
  const limit = url.searchParams.get('limit') ? Number(url.searchParams.get('limit')) : undefined
  try {
    const data = await listBenachrichtigungen(supabase, {
      organizationId: auth.organizationId,
      empfaengerId: auth.userId,
      gelesen: gelesen !== null ? gelesen === 'true' : undefined,
      kategorie,
      limit,
    })
    return NextResponse.json(data)
  } catch (e: any) {
    return apiErrorResponse(e, request)
  }
})
