import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { requireUebergabeAdmin, requireUebergabeUser } from '@/lib/uebergabe/api-auth'
import { caregiverIdsGehoerenZuOrg, deleteProtokoll, getProtokoll, updateProtokoll } from '@/lib/uebergabe/protokolle'
import { listPunkte } from '@/lib/uebergabe/punkte'
import { listKenntnisnahmen, offeneKenntnisnahmen } from '@/lib/uebergabe/kenntnisnahmen'
import { safeErrorResponse } from '@/lib/utils/api-error'
import { withTracking } from '@/lib/monitoring/tracker'

export const GET = withTracking(async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireUebergabeUser()
    if (!auth.ok) return auth.response
    const { id } = await params

    const supabase = auth.ctx.istAdmin ? createAdminClient() : await createClient()
    const protokoll = await getProtokoll(supabase, id, auth.ctx.organizationId)
    if (!protokoll) {
      return NextResponse.json({ error: 'Übergabeprotokoll nicht gefunden.' }, { status: 404 })
    }

    const [punkte, kenntnisnahmen] = await Promise.all([
      listPunkte(supabase, id, auth.ctx.organizationId),
      listKenntnisnahmen(supabase, id, auth.ctx.organizationId),
    ])

    // Der eigentliche Nachweis ist nicht "wurde übergeben", sondern "wurde
    // vom Folgedienst zur Kenntnis genommen" — deshalb die Differenz
    // zwischen vorgesehenen Empfängern und tatsächlichen Quittungen.
    const ausstehendeKenntnisnahmen = offeneKenntnisnahmen(protokoll.uebernehmer_caregiver_ids, kenntnisnahmen)

    return NextResponse.json({ protokoll: { ...protokoll, punkte, kenntnisnahmen, ausstehendeKenntnisnahmen } })
  } catch (err) {
    return safeErrorResponse(err, 400)
  }
})

export const PATCH = withTracking(async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireUebergabeUser()
    if (!auth.ok) return auth.response
    const { id } = await params
    const body = await request.json()

    const supabase = auth.ctx.istAdmin ? createAdminClient() : await createClient()

    const uebernehmerCaregiverIds = Array.isArray(body.uebernehmerCaregiverIds)
      ? body.uebernehmerCaregiverIds
      : undefined
    if (uebernehmerCaregiverIds && !(await caregiverIdsGehoerenZuOrg(supabase, uebernehmerCaregiverIds, auth.ctx.organizationId))) {
      return NextResponse.json({ error: 'Eine oder mehrere Betreuungskräfte gehören nicht zur Organisation.' }, { status: 404 })
    }

    const protokoll = await updateProtokoll(supabase, id, auth.ctx.organizationId, {
      zusammenfassung: body.zusammenfassung,
      uebernehmerCaregiverIds,
    })

    return NextResponse.json({ protokoll })
  } catch (err) {
    return safeErrorResponse(err, 400)
  }
})

export const DELETE = withTracking(async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireUebergabeAdmin('pflege.schreiben')
    if (!auth.ok) return auth.response
    const { id } = await params

    await deleteProtokoll(createAdminClient(), id, auth.ctx.organizationId)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return safeErrorResponse(err, 400)
  }
})
