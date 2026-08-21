import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePersonalAdmin } from '@/lib/personal/api-auth'
import { pruefeEinsatzfreigabe, setzeEinsatzfreigabe } from '@/lib/personal/einsatzfreigabe'
import { writeAuditLog } from '@/lib/personal/audit'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ caregiverId: string }> }
) {
  try {
    const auth = await requirePersonalAdmin()
    if (!auth.ok) return auth.response
    const supabase = createAdminClient()

    const { caregiverId } = await params
    const data = await pruefeEinsatzfreigabe(supabase, caregiverId, auth.ctx.organizationId)
    return NextResponse.json(data)
  } catch (e: any) {
    return apiErrorResponse(e)
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ caregiverId: string }> }
) {
  try {
    const auth = await requirePersonalAdmin()
    if (!auth.ok) return auth.response
    const supabase = createAdminClient()

    const { caregiverId } = await params
    const { freigabe } = await req.json()
    const data = await setzeEinsatzfreigabe(supabase, caregiverId, auth.ctx.organizationId, freigabe)

    await writeAuditLog(supabase, {
      entitaetTyp: 'einsatzfreigabe',
      entitaetId: caregiverId,
      aktion: freigabe ? 'freigegeben' : 'gesperrt',
      benutzerId: auth.ctx.userId,
      organizationId: auth.ctx.organizationId,
    })

    return NextResponse.json(data)
  } catch (e: any) {
    return apiErrorResponse(e)
  }
}
