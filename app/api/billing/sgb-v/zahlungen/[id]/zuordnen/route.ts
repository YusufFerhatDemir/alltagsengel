import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { ordneZahlungSgbVLaufZu } from '@/lib/abrechnung/sgb-v/zahlungsabgleich'

/** POST /api/billing/sgb-v/zahlungen/[id]/zuordnen — Body: { laufId } */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireOpsAdmin()
  if (!auth.ok) return auth.response

  try {
    const { id } = await params
    const body = await request.json()
    if (!body.laufId) return NextResponse.json({ error: 'laufId ist Pflicht.' }, { status: 400 })

    const admin = createAdminClient()
    await ordneZahlungSgbVLaufZu(admin, auth.ctx.organizationId, id, body.laufId, auth.ctx.userId)

    return NextResponse.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Interner Serverfehler'
    console.error('[billing/sgb-v/zahlungen/[id]/zuordnen] Fehler:', message)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
