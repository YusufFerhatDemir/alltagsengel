import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { requireUebergabeUser } from '@/lib/uebergabe/api-auth'
import { listKenntnisnahmen, quittieren } from '@/lib/uebergabe/kenntnisnahmen'
import { safeErrorResponse } from '@/lib/utils/api-error'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireUebergabeUser()
    if (!auth.ok) return auth.response
    const { id } = await params

    const supabase = auth.ctx.istAdmin ? createAdminClient() : await createClient()
    const kenntnisnahmen = await listKenntnisnahmen(supabase, id, auth.ctx.organizationId)
    return NextResponse.json({ kenntnisnahmen })
  } catch (err) {
    return safeErrorResponse(err, 400)
  }
}

/**
 * POST — Kenntnisnahme quittieren. Immer für die eigene Person: wer
 * quittiert, steht im Auth-Kontext und wird nie aus dem Body übernommen.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireUebergabeUser()
    if (!auth.ok) return auth.response
    const { id } = await params

    const supabase = auth.ctx.istAdmin ? createAdminClient() : await createClient()
    const kenntnisnahme = await quittieren(supabase, {
      protokollId: id,
      organizationId: auth.ctx.istAdmin ? auth.ctx.organizationId : undefined,
      userId: auth.ctx.userId,
      caregiverId: auth.ctx.caregiverId,
      name: auth.ctx.name,
      rolle: auth.ctx.role,
    })

    return NextResponse.json({ kenntnisnahme }, { status: 201 })
  } catch (err) {
    return safeErrorResponse(err, 400)
  }
}
