import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAktenAdmin } from '@/lib/akten/api-auth'
import { getVertrag, updateVertrag } from '@/lib/akten/vertraege'
import type { VertragsStatus } from '@/lib/akten/types'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const auth = await requireAktenAdmin()
    if (!auth.ok) return auth.response
    const { organizationId } = auth.ctx

    const admin = createAdminClient()
    const vertrag = await getVertrag(admin, id, organizationId)
    if (!vertrag) return NextResponse.json({ error: 'Vertrag nicht gefunden.' }, { status: 404 })

    return NextResponse.json({ vertrag })
  } catch (err) {
    return safeApiError(err, request)
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const auth = await requireAktenAdmin()
    if (!auth.ok) return auth.response
    const { organizationId, userId, role } = auth.ctx

    const body = await request.json()
    const admin = createAdminClient()
    const vertrag = await updateVertrag(
      admin,
      id,
      organizationId,
      {
        titel: body.titel,
        status: body.status as VertragsStatus | undefined,
        vertragsbeginn: body.vertragsbeginn,
        vertragsende: body.vertragsende,
        kuendigungsfristTage: body.kuendigungsfristTage,
        autoVerlaengerung: body.autoVerlaengerung,
        bemerkung: body.bemerkung,
      },
      userId,
      role
    )

    return NextResponse.json({ vertrag })
  } catch (err) {
    return apiErrorResponse(err, request)
  }
}
