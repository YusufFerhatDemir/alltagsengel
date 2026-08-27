import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { requireUebergabeUser } from '@/lib/uebergabe/api-auth'
import { deletePunkt, setErledigt, updatePunkt } from '@/lib/uebergabe/punkte'
import { safeErrorResponse } from '@/lib/utils/api-error'
import { withTracking } from '@/lib/monitoring/tracker'

export const PATCH = withTracking(async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; punktId: string }> },
) {
  try {
    const auth = await requireUebergabeUser()
    if (!auth.ok) return auth.response
    const { punktId } = await params
    const body = await request.json()

    const supabase = auth.ctx.istAdmin ? createAdminClient() : await createClient()

    // Erledigung ist auch nach Abschluss erlaubt — sie wird typischerweise
    // erst im Folgedienst nachgezogen. Inhaltliche Änderungen sind es nicht.
    if (body.erledigt !== undefined && Object.keys(body).length === 1) {
      const punkt = await setErledigt(
        supabase, punktId, auth.ctx.organizationId, Boolean(body.erledigt), auth.ctx.userId,
      )
      return NextResponse.json({ punkt })
    }

    const punkt = await updatePunkt(supabase, punktId, auth.ctx.organizationId, {
      inhalt: body.inhalt,
      kategorie: body.kategorie,
      dringlichkeit: body.dringlichkeit,
      handlungsbedarf: body.handlungsbedarf,
      clientId: body.clientId,
    })
    return NextResponse.json({ punkt })
  } catch (err) {
    return safeErrorResponse(err, 400)
  }
})

export const DELETE = withTracking(async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; punktId: string }> },
) {
  try {
    const auth = await requireUebergabeUser()
    if (!auth.ok) return auth.response
    const { punktId } = await params

    const supabase = auth.ctx.istAdmin ? createAdminClient() : await createClient()
    await deletePunkt(supabase, punktId, auth.ctx.organizationId)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return safeErrorResponse(err, 400)
  }
})
