import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePersonalAdmin } from '@/lib/personal/api-auth'
import { updateAbwesenheit } from '@/lib/personal/abwesenheiten'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requirePersonalAdmin('personal.schreiben')
    if (!auth.ok) return auth.response
    const supabase = createAdminClient()

    const { id } = await params
    const body = await req.json()
    const data = await updateAbwesenheit(supabase, id, auth.ctx.organizationId, body)
    return NextResponse.json(data)
  } catch (e: any) {
    return apiErrorResponse(e)
  }
}
