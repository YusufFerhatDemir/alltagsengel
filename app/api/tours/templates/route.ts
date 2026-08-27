import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { uebersetzeDbFehler } from '@/lib/touren/server'
import { withTracking } from '@/lib/monitoring/tracker'

const TEMPLATE_SELECT =
  'id, name, caregiver_id, weekday, start_zeit, stops, aktiv, notes, created_at, updated_at, ' +
  'caregivers:caregiver_id(first_name, last_name)'

interface TemplateStop {
  client_id: string
  dauer_minuten: number
  service_type?: string
  notes?: string
}

function validiereStops(stops: unknown): string | null {
  if (!Array.isArray(stops)) return 'stops muss ein Array sein.'
  for (const s of stops as TemplateStop[]) {
    if (!s.client_id) return 'Jeder Vorlagen-Stop braucht client_id.'
    if (!s.dauer_minuten || s.dauer_minuten <= 0) return 'Jeder Vorlagen-Stop braucht dauer_minuten > 0.'
  }
  return null
}

// ── GET /api/tours/templates ──────────────────────────────────────
export const GET = withTracking(async function GET(req: NextRequest) {
  const auth = await requireOpsAdmin('einsatz.lesen')
  if (!auth.ok) return auth.response

  const admin = createAdminClient()
  let query = admin
    .from('tour_templates')
    .select(TEMPLATE_SELECT)
    .eq('organization_id', auth.ctx.organizationId)
    .order('name', { ascending: true })
  if (new URL(req.url).searchParams.get('aktiv') !== 'alle') query = query.eq('aktiv', true)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: uebersetzeDbFehler(error) }, { status: 500 })
  return NextResponse.json(data)
})

// ── POST /api/tours/templates ─────────────────────────────────────
export const POST = withTracking(async function POST(req: NextRequest) {
  const auth = await requireOpsAdmin('einsatz.schreiben')
  if (!auth.ok) return auth.response

  const body = await req.json()
  const { name, caregiver_id, weekday, start_zeit, stops, notes } = body
  if (!name?.trim()) return NextResponse.json({ error: 'name ist Pflicht.' }, { status: 400 })
  const stopFehler = validiereStops(stops ?? [])
  if (stopFehler) return NextResponse.json({ error: stopFehler }, { status: 400 })
  if (weekday != null && (weekday < 1 || weekday > 7)) {
    return NextResponse.json({ error: 'weekday muss 1 (Montag) bis 7 (Sonntag) sein.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('tour_templates')
    .insert({
      organization_id: auth.ctx.organizationId,
      name: name.trim(),
      caregiver_id: caregiver_id || null,
      weekday: weekday ?? null,
      start_zeit: start_zeit || null,
      stops: stops ?? [],
      notes: notes || null,
      created_by: auth.ctx.userId,
    })
    .select(TEMPLATE_SELECT)
    .single()
  if (error) return NextResponse.json({ error: uebersetzeDbFehler(error) }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
})

// ── PATCH /api/tours/templates — body: { id, …updates } ──────────
export const PATCH = withTracking(async function PATCH(req: NextRequest) {
  const auth = await requireOpsAdmin('einsatz.schreiben')
  if (!auth.ok) return auth.response

  const body = await req.json()
  const { id, ...rest } = body
  if (!id) return NextResponse.json({ error: 'id erforderlich.' }, { status: 400 })

  const updates: Record<string, unknown> = {}
  for (const feld of ['name', 'caregiver_id', 'weekday', 'start_zeit', 'stops', 'aktiv', 'notes'] as const) {
    if (rest[feld] !== undefined) updates[feld] = rest[feld]
  }
  if (updates.stops !== undefined) {
    const stopFehler = validiereStops(updates.stops)
    if (stopFehler) return NextResponse.json({ error: stopFehler }, { status: 400 })
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Keine Änderungen übergeben.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('tour_templates')
    .update(updates)
    .eq('id', id)
    .eq('organization_id', auth.ctx.organizationId)
    .select(TEMPLATE_SELECT)
    .single()
  if (error) {
    const status = error.code === 'PGRST116' ? 404 : 500
    return NextResponse.json({ error: uebersetzeDbFehler(error) }, { status })
  }
  return NextResponse.json(data)
})
