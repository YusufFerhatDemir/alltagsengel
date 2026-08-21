import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { runDunningRun } from '@/lib/billing/core'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { safeApiError } from '@/lib/api/error-sanitizer'

/**
 * Manueller Mahnlauf fuer die aktive Organisation.
 *
 * Body: { dryRun?: boolean }
 * dryRun=true simuliert nur — es wird nichts geschrieben.
 *
 * Dieselbe Logik laeuft naechtlich ueber /api/cron/mahnlauf.
 */
export async function POST(request: Request) {
  try {
    const auth = await requireOpsAdmin()
    if (!auth.ok) return auth.response
    const { userId, organizationId } = auth.ctx

    let dryRun = false
    try {
      const body = await request.json()
      dryRun = body?.dryRun === true
    } catch {
      // Leerer Body ist erlaubt — dann echter Lauf.
    }

    const admin = createAdminClient()
    const result = await runDunningRun(admin, organizationId, userId, { dryRun })

    return NextResponse.json(result)
  } catch (err) {
    return safeApiError(err, request)
  }
}
