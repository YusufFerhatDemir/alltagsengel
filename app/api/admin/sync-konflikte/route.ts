import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { listeOffeneKonflikte } from '@/lib/sync/audit'
import { withTracking } from '@/lib/monitoring/tracker'

// GET /api/admin/sync-konflikte — offene Sync-Konflikte (status='offen')
// für die manuelle Auflösung im Admin-UI (app/admin/sync-konflikte/).
export const GET = withTracking(async function GET(request: Request) {
  const auth = await requireOpsAdmin('system.verwalten')
  if (!auth.ok) return auth.response

  try {
    const admin = createAdminClient()
    const konflikte = await listeOffeneKonflikte(admin, auth.ctx.organizationId)
    return NextResponse.json({ konflikte })
  } catch (err) {
    return safeApiError(err, request)
  }
})
