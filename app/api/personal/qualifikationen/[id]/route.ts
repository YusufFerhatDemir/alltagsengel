import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePersonalAdmin } from '@/lib/personal/api-auth'
import { updateQualifikation, deleteQualifikation } from '@/lib/personal/qualifikationen'
import { withTracking } from '@/lib/monitoring/tracker'

export const PATCH = withTracking(async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePersonalAdmin('personal.schreiben')
  if (!auth.ok) return auth.response
  const { id } = await params
  const supabase = createAdminClient()
  try {
    const body = await request.json()
    // Der Prüfvermerk (`verifiziert`) trägt den angemeldeten Benutzer ein —
    // `verifiziert_von`/`verifiziert_am` sind bewusst keine Body-Felder mehr.
    const data = await updateQualifikation(supabase, id, auth.ctx.organizationId, body, auth.ctx.userId)
    return NextResponse.json(data)
  } catch (e: any) {
    return apiErrorResponse(e, request)
  }
})

export const DELETE = withTracking(async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePersonalAdmin('personal.schreiben')
  if (!auth.ok) return auth.response
  const { id } = await params
  const supabase = createAdminClient()
  try {
    await deleteQualifikation(supabase, id, auth.ctx.organizationId)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return apiErrorResponse(e, request)
  }
})
