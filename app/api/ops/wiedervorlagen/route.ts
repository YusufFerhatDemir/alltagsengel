import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { listWiedervorlagen, createWiedervorlage } from '@/lib/ops/wiedervorlagen'
import type { WiedervorlageStatus } from '@/lib/ops/types'

export async function GET(request: Request) {
  const auth = await requireOpsAdmin()
  if (!auth.ok) return auth.response
  const supabase = createAdminClient()
  const url = new URL(request.url)
  const status = (url.searchParams.get('status') || undefined) as WiedervorlageStatus | undefined
  const empfaengerId = url.searchParams.get('empfaenger_id') || undefined
  try {
    const data = await listWiedervorlagen(supabase, {
      organizationId: auth.ctx.organizationId,
      status,
      empfaengerId,
    })
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 })
  }
}

export async function POST(request: Request) {
  const auth = await requireOpsAdmin()
  if (!auth.ok) return auth.response
  const supabase = createAdminClient()
  try {
    const body = await request.json()
    const { id: _id, organization_id: _oid, created_at: _ca, ...safeData } = body
    const data = await createWiedervorlage(supabase, {
      organizationId: auth.ctx.organizationId,
      data: safeData,
    })
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 })
  }
}
