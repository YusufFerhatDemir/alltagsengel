import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { ladeSyncStatusUebersicht } from '@/lib/sync/dashboard'

// GET /api/admin/sync-status — Übersicht offener Konflikte, Sync-Fehler
// (letzte 24h) und offener Sync-Vorgänge, org-gefenced auf die aktive
// Organisation des Admins (analog allen anderen Block-19-Dashboards).
export async function GET(request: Request) {
  const auth = await requireOpsAdmin('system.verwalten')
  if (!auth.ok) return auth.response

  try {
    const admin = createAdminClient()
    const uebersicht = await ladeSyncStatusUebersicht(admin, auth.ctx.organizationId)
    return NextResponse.json(uebersicht)
  } catch (err) {
    return safeApiError(err, request)
  }
}
