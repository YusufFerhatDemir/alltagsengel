import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { genehmigeHkpVerordnung, ladeHkpVerordnung } from '@/lib/abrechnung/sgb-v/verordnung-service'

/** GET /api/billing/sgb-v/verordnungen/[id] */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireOpsAdmin()
  if (!auth.ok) return auth.response

  try {
    const { id } = await params
    const admin = createAdminClient()
    const verordnung = await ladeHkpVerordnung(admin, auth.ctx.organizationId, id)
    if (!verordnung) return NextResponse.json({ error: 'Verordnung nicht gefunden.' }, { status: 404 })
    return NextResponse.json({ verordnung })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Interner Serverfehler'
    console.error('[billing/sgb-v/verordnungen/[id]] Fehler:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/** PATCH /api/billing/sgb-v/verordnungen/[id] — Kassengenehmigung eintragen. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireOpsAdmin()
  if (!auth.ok) return auth.response

  try {
    const { id } = await params
    const body = await request.json()
    const admin = createAdminClient()
    await genehmigeHkpVerordnung(admin, auth.ctx.organizationId, id, {
      genehmigungBis: body.genehmigungBis ?? null,
      aktenzeichen: body.aktenzeichen ?? null,
    }, auth.ctx.userId)
    return NextResponse.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Interner Serverfehler'
    console.error('[billing/sgb-v/verordnungen/[id]] Fehler:', message)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
