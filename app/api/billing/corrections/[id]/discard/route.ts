import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { discardCreditNote } from '@/lib/billing/core'
import { safeApiError } from '@/lib/api/error-sanitizer'

/**
 * POST /api/billing/corrections/[id]/discard
 *
 * Verwirft eine Gutschrift im Entwurf (Soft-Delete der Korrektur + Storno der
 * noch nicht festgeschriebenen Gutschrift-Rechnung). Nur fuer Administratoren.
 *
 * Body: { reason: string }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireOpsAdmin('abrechnung.schreiben')
  if (!auth.ok) return auth.response
  const { userId, organizationId } = auth.ctx

  try {
    const { id } = await params

    const body = await request.json().catch(() => null)
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : ''
    if (!reason) {
      return NextResponse.json(
        { error: 'Grund für das Verwerfen (reason) ist erforderlich.' },
        { status: 400 }
      )
    }

    const admin = createAdminClient()
    const result = await discardCreditNote(admin, id, reason, userId, organizationId)
    return NextResponse.json(result)
  } catch (err) {
    return safeApiError(err, request)
  }
}
