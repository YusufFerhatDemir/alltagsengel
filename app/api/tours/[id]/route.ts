import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { uebersetzeDbFehler } from '@/lib/touren/server'
import { TOUR_SELECT, type TourZeile } from '@/lib/touren/select'

const ERLAUBTE_STATUS = ['GEPLANT', 'FREIGEGEBEN', 'UNTERWEGS', 'ABGESCHLOSSEN', 'STORNIERT']

// ── GET /api/tours/[id] ───────────────────────────────────────────
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireOpsAdmin()
  if (!auth.ok) return auth.response
  const { id } = await params

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('tours')
    .select(TOUR_SELECT)
    .eq('id', id)
    .eq('organization_id', auth.ctx.organizationId)
    .single()
  if (error) {
    const status = error.code === 'PGRST116' ? 404 : 500
    return NextResponse.json({ error: uebersetzeDbFehler(error) }, { status })
  }
  const tour = data as unknown as TourZeile
  return NextResponse.json({
    ...tour,
    tour_stops: [...(tour.tour_stops ?? [])].sort((a, b) => a.position - b.position),
  })
}

// ── PATCH /api/tours/[id] — Tourfelder/Status ändern ─────────────
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireOpsAdmin()
  if (!auth.ok) return auth.response
  const { id } = await params

  const body = await req.json()
  const updates: Record<string, unknown> = {}
  for (const feld of ['name', 'notes', 'status', 'start_zeit', 'ende_zeit', 'tour_date'] as const) {
    if (body[feld] !== undefined) updates[feld] = body[feld]
  }
  if (updates.status && !ERLAUBTE_STATUS.includes(updates.status as string)) {
    return NextResponse.json({ error: `Ungültiger Status. Erlaubt: ${ERLAUBTE_STATUS.join(', ')}.` }, { status: 400 })
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Keine Änderungen übergeben.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('tours')
    .update(updates)
    .eq('id', id)
    .eq('organization_id', auth.ctx.organizationId)
    .select(TOUR_SELECT)
    .single()
  if (error) {
    const status = error.code === 'PGRST116' ? 404 : 500
    return NextResponse.json({ error: uebersetzeDbFehler(error) }, { status })
  }
  return NextResponse.json(data)
}

// ── DELETE /api/tours/[id] — storniert (kein Hard-Delete) ────────
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireOpsAdmin()
  if (!auth.ok) return auth.response
  const { id } = await params

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('tours')
    .update({ status: 'STORNIERT' })
    .eq('id', id)
    .eq('organization_id', auth.ctx.organizationId)
    .select('id, status')
    .single()
  if (error) {
    const status = error.code === 'PGRST116' ? 404 : 500
    return NextResponse.json({ error: uebersetzeDbFehler(error) }, { status })
  }
  return NextResponse.json(data)
}
