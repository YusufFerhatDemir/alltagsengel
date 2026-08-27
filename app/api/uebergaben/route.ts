import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { requireUebergabeUser } from '@/lib/uebergabe/api-auth'
import { caregiverIdsGehoerenZuOrg, createProtokoll, listProtokolle } from '@/lib/uebergabe/protokolle'
import type { ProtokollStatus, Schicht } from '@/lib/uebergabe/types'
import { safeErrorResponse } from '@/lib/utils/api-error'
import { withTracking } from '@/lib/monitoring/tracker'

export const GET = withTracking(async function GET(request: Request) {
  try {
    const auth = await requireUebergabeUser()
    if (!auth.ok) return auth.response

    const params = new URL(request.url).searchParams
    // Lesen läuft für Engel über den eigenen Client, damit RLS die
    // klientenbezogenen Punkte filtert; Admins lesen mit Service-Role.
    const supabase = auth.ctx.istAdmin ? createAdminClient() : await createClient()

    const protokolle = await listProtokolle(supabase, {
      organizationId: auth.ctx.organizationId,
      datumVon: params.get('datumVon') ?? undefined,
      datumBis: params.get('datumBis') ?? undefined,
      schicht: (params.get('schicht') as Schicht) ?? undefined,
      status: (params.get('status') as ProtokollStatus) ?? undefined,
      tourId: params.get('tourId') ?? undefined,
      limit: params.get('limit') ? Number(params.get('limit')) : undefined,
    })

    return NextResponse.json({ protokolle })
  } catch (err) {
    return safeErrorResponse(err, 400)
  }
})

export const POST = withTracking(async function POST(request: Request) {
  try {
    const auth = await requireUebergabeUser()
    if (!auth.ok) return auth.response

    const body = await request.json()
    if (!body.datum || !body.schicht) {
      return NextResponse.json({ error: 'datum und schicht sind Pflichtfelder.' }, { status: 400 })
    }

    const supabase = auth.ctx.istAdmin ? createAdminClient() : await createClient()

    const uebernehmerCaregiverIds = Array.isArray(body.uebernehmerCaregiverIds) ? body.uebernehmerCaregiverIds : []
    if (!(await caregiverIdsGehoerenZuOrg(supabase, uebernehmerCaregiverIds, auth.ctx.organizationId))) {
      return NextResponse.json({ error: 'Eine oder mehrere Betreuungskräfte gehören nicht zur Organisation.' }, { status: 404 })
    }

    const protokoll = await createProtokoll(supabase, {
      // Engel schreiben mit eigenem Client — dort setzt current_org_id() die Org.
      organizationId: auth.ctx.istAdmin ? auth.ctx.organizationId : undefined,
      datum: body.datum,
      schicht: body.schicht,
      tourId: body.tourId ?? null,
      uebergeberId: auth.ctx.userId,
      uebergeberName: auth.ctx.name,
      uebernehmerCaregiverIds,
      zusammenfassung: body.zusammenfassung ?? null,
    })

    return NextResponse.json({ protokoll }, { status: 201 })
  } catch (err) {
    return safeErrorResponse(err, 400)
  }
})
