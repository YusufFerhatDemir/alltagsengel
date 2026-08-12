import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { listeOffeneKonflikte } from '@/lib/sync/audit'

// GET /api/admin/sync-konflikte — offene Sync-Konflikte (status='offen')
// für die manuelle Auflösung im Admin-UI (app/admin/sync-konflikte/).
export async function GET() {
  const auth = await requireOpsAdmin()
  if (!auth.ok) return auth.response

  try {
    const admin = createAdminClient()
    const konflikte = await listeOffeneKonflikte(admin, auth.ctx.organizationId)
    return NextResponse.json({ konflikte })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
