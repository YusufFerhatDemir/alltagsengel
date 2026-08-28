import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { uebersetzeDbFehler } from '@/lib/touren/server'
import { caregiverGehoertZuOrg } from '@/lib/personal/organization-guard'
import { clientGehoertZuOrg } from '@/lib/clients/organization-guard'
import type { SupabaseClient } from '@supabase/supabase-js'
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

// ═══════════════════════════════════════════════════════════════════════
// Mandanten-Fence auf die Fremdschluessel aus dem Request-Rumpf
// ═══════════════════════════════════════════════════════════════════════
//
// BEFUND (28.08.2026, Track 7): POST und PATCH haben `caregiver_id` und
// die `client_id` jedes Vorlagen-Stops UNGEPRUEFT aus dem Rumpf
// uebernommen. Beide Wege schreiben mit dem Dienstschluessel, der RLS
// umgeht — eine fremde UUID landete damit in der eigenen Vorlage.
//
// Das ist nicht bloss ein toter Verweis, sondern ein LESEWEG NACH DRAUSSEN:
// GET liest dieselbe Tabelle mit dem Dienstschluessel und bettet
// `caregivers:caregiver_id(first_name, last_name)` ein. PostgREST folgt
// dem Fremdschluessel ohne jede Mandantenbedingung, und der
// Dienstschluessel hebt auch den RESTRICTIVE org_fence auf. Ein einziges
// POST mit der UUID einer fremden Betreuungskraft holte damit deren
// KLARNAMEN in die eigene Vorlagenliste — dieselbe Bauform wie die drei
// caregivers-Joins aus der Personalverwaltung, nur ohne View dazwischen.
//
// 404 statt 403, wie in lib/personal/organization-guard.ts: die
// Unterscheidung „gibt es nicht" / „gehoert jemand anderem" waere selbst
// schon eine Auskunft ueber fremde Bestaende.
//
// Bewusst KEINE RLS-Policy als Abhilfe: der Dienstschluessel umgeht jede
// Policy, der Fence gehoert deshalb in den Code.
async function fenceFremdschluessel(
  admin: SupabaseClient,
  organizationId: string,
  caregiverId: unknown,
  stops: unknown,
): Promise<string | null> {
  if (typeof caregiverId === 'string' && caregiverId.trim() !== '') {
    if (!(await caregiverGehoertZuOrg(admin, caregiverId, organizationId))) {
      return 'Mitarbeiter nicht gefunden.'
    }
  }
  if (Array.isArray(stops)) {
    const clientIds = [...new Set(
      stops.map(s => (s as { client_id?: unknown })?.client_id).filter(
        (v): v is string => typeof v === 'string' && v.trim() !== '',
      ),
    )]
    for (const clientId of clientIds) {
      if (!(await clientGehoertZuOrg(admin, clientId, organizationId))) {
        return 'Klient nicht gefunden.'
      }
    }
  }
  return null
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
  const fenceFehler = await fenceFremdschluessel(admin, auth.ctx.organizationId, caregiver_id, stops ?? [])
  if (fenceFehler) return NextResponse.json({ error: fenceFehler }, { status: 404 })

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
  const fenceFehler = await fenceFremdschluessel(
    admin, auth.ctx.organizationId, updates.caregiver_id, updates.stops,
  )
  if (fenceFehler) return NextResponse.json({ error: fenceFehler }, { status: 404 })

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
