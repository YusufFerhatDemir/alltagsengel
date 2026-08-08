import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsUser } from '@/lib/ops/api-auth'
import { getZaehler } from '@/lib/ops/benachrichtigungen'

export async function GET(request: Request) {
  const auth = await requireOpsUser()
  if (!auth.ok) return auth.response
  const supabase = createAdminClient()
  try {
    const data = await getZaehler(supabase, {
      organizationId: auth.ctx.organizationId,
      empfaengerId: auth.ctx.userId,
    })
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 })
  }
}
