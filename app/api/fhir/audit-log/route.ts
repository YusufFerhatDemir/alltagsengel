import { apiErrorResponse } from '@/lib/api/error-sanitizer'
// ═══════════════════════════════════════════════════════════════
// GET /api/fhir/audit-log — Audit-Trail für Admin-UI (Block 21)
// ═══════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'

export async function GET(request: Request) {
  const auth = await requireOpsAdmin('system.verwalten')
  if (!auth.ok) return auth.response

  try {
    const url = new URL(request.url)
    const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') ?? '50', 10) || 50, 1), 200)

    const admin = createAdminClient()
    const { data, error } = await admin
      .from('fhir_audit_log')
      .select('*')
      .eq('organization_id', auth.ctx.organizationId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) return apiErrorResponse(error, request)
    return NextResponse.json({ entries: data ?? [] })
  } catch (err) {
    return safeApiError(err, request)
  }
}
