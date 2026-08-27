import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAktenAdmin } from '@/lib/akten/api-auth'
import { softDeleteKontaktperson, updateKontaktperson } from '@/lib/akten/kontaktpersonen'
import { withTracking } from '@/lib/monitoring/tracker'

export const PATCH = withTracking(async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const auth = await requireAktenAdmin('stammdaten.schreiben')
    if (!auth.ok) return auth.response
    const { organizationId, userId, role } = auth.ctx

    const body = await request.json()
    const admin = createAdminClient()
    const kontaktperson = await updateKontaktperson(admin, id, organizationId, body, userId, role)

    return NextResponse.json({ kontaktperson })
  } catch (err) {
    return apiErrorResponse(err, request)
  }
})

export const DELETE = withTracking(async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const auth = await requireAktenAdmin('stammdaten.schreiben')
    if (!auth.ok) return auth.response
    const { organizationId, userId, role } = auth.ctx

    const admin = createAdminClient()
    await softDeleteKontaktperson(admin, id, organizationId, userId, role)

    return NextResponse.json({ success: true })
  } catch (err) {
    return apiErrorResponse(err, _request)
  }
})
