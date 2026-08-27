import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { aktualisiereKarte, loescheKarte } from '@/lib/kim/karten'
import { withTracking } from '@/lib/monitoring/tracker'

/**
 * PATCH /api/billing/kim/karten/[id]
 * DELETE /api/billing/kim/karten/[id]
 */
export const PATCH = withTracking(async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireOpsAdmin('system.verwalten')
  if (!auth.ok) return auth.response
  const { organizationId } = auth.ctx

  try {
    const { id } = await params
    const body = await request.json()
    const admin = createAdminClient()
    const data = await aktualisiereKarte(admin, organizationId, id, body)
    return NextResponse.json(data)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Interner Serverfehler'
    return NextResponse.json({ error: message }, { status: 400 })
  }
})

export const DELETE = withTracking(async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireOpsAdmin('system.verwalten')
  if (!auth.ok) return auth.response
  const { organizationId } = auth.ctx

  try {
    const { id } = await params
    const admin = createAdminClient()
    await loescheKarte(admin, organizationId, id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Interner Serverfehler'
    return NextResponse.json({ error: message }, { status: 400 })
  }
})
