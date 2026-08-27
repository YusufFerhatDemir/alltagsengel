import { NextRequest, NextResponse } from 'next/server'
import { apiErrorResponse, safeApiError } from '@/lib/api/error-sanitizer'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { rolleDarf } from '@/lib/auth/guard'
import { requireMedUser } from '@/lib/medikamente/api-auth'
import { listeEingaben, erfasseEingabe } from '@/lib/medikamente/medikamente'
import type { EingabeFilter } from '@/lib/medikamente/types'
import { withTracking } from '@/lib/monitoring/tracker'

// medikament_eingaben hat RLS-Policies nur fuer admin/superadmin
// (admin_med_eingaben_all) und zugewiesene Engel (engel_med_eingaben_*) —
// PDL/QM sind ueber die generische pflege.lesen/schreiben-Policy fuer
// medikamente abgedeckt, NICHT aber fuer medikament_eingaben (Migration
// 20260924000000 listet die Tabelle nicht). Ohne diese Weiche saehe PDL/QM
// hier still eine leere Liste (RLS fail-closed, aber unbemerkt) statt der
// tatsaechlichen Verabreichungsnachweise. Engel bleiben bewusst auf dem
// RLS-Client, damit eigene_caregiver_ids() sie weiter auf ihre zugewiesenen
// Klienten begrenzt — das darf die Service-Role nicht umgehen.
async function medikamenteClient(role: string, berechtigung: 'pflege.lesen' | 'pflege.schreiben') {
  return rolleDarf(role, berechtigung) ? createAdminClient() : await createClient()
}

export const GET = withTracking(async function GET(req: NextRequest) {
  const auth = await requireMedUser()
  if (!auth.ok) return auth.response

  const url = new URL(req.url)
  const clientId = url.searchParams.get('client_id')
  if (!clientId) return NextResponse.json({ error: 'client_id ist Pflichtfeld.' }, { status: 400 })

  const filter: EingabeFilter = { client_id: clientId }
  const medId = url.searchParams.get('medikament_id')
  const von = url.searchParams.get('datum_von')
  const bis = url.searchParams.get('datum_bis')
  const status = url.searchParams.get('status')

  if (medId) filter.medikament_id = medId
  if (von) filter.datum_von = von
  if (bis) filter.datum_bis = bis
  if (status) filter.status = status as EingabeFilter['status']

  try {
    const sb = await medikamenteClient(auth.role, 'pflege.lesen')
    const data = await listeEingaben(sb, auth.organizationId, filter)
    return NextResponse.json(data)
  } catch (e) {
    return safeApiError(e, req)
  }
})

export const POST = withTracking(async function POST(req: NextRequest) {
  const auth = await requireMedUser()
  if (!auth.ok) return auth.response

  try {
    const body = await req.json()
    if (!body.medikament_id || !body.client_id || !body.einnahme_zeit || !body.geplant_um || !body.status) {
      return NextResponse.json({ error: 'Pflichtfelder: medikament_id, client_id, einnahme_zeit, geplant_um, status' }, { status: 400 })
    }
    const sb = await medikamenteClient(auth.role, 'pflege.schreiben')
    const data = await erfasseEingabe(sb, auth.organizationId, auth.userId, body)
    return NextResponse.json(data, { status: 201 })
  } catch (e) {
    return apiErrorResponse(e, req)
  }
})
