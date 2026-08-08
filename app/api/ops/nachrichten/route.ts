import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsUser } from '@/lib/ops/api-auth'
import { listPosteingang, createNachricht } from '@/lib/ops/nachrichten'

export async function GET(request: Request) {
  const auth = await requireOpsUser()
  if (!auth.ok) return auth.response
  const supabase = createAdminClient()
  try {
    const data = await listPosteingang(supabase, {
      organizationId: auth.organizationId,
      empfaengerId: auth.userId,
    })
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 })
  }
}

export async function POST(request: Request) {
  const auth = await requireOpsUser()
  if (!auth.ok) return auth.response
  const supabase = createAdminClient()
  try {
    const body = await request.json()
    const data = await createNachricht(supabase, {
      organizationId: auth.organizationId,
      data: {
        ...body,
        absender_id: body.absender_id || auth.userId,
      },
      empfaengerIds: body.empfaenger_ids,
    })
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 })
  }
}
