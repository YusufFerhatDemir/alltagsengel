import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { listRegeln, createRegel } from '@/lib/workflow/regeln'
import type { WfModul } from '@/lib/workflow/types'

export async function GET(request: Request) {
  const auth = await requireOpsAdmin()
  if (!auth.ok) return auth.response
  const supabase = createAdminClient()
  const url = new URL(request.url)
  const aktivParam = url.searchParams.get('aktiv')
  const modul = (url.searchParams.get('modul') || undefined) as WfModul | undefined
  try {
    const data = await listRegeln(supabase, {
      organizationId: auth.ctx.organizationId,
      aktiv: aktivParam !== null ? aktivParam === 'true' : undefined,
      modul,
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
    const data = await createRegel(supabase, {
      organizationId: auth.ctx.organizationId,
      data: { ...body, erstellt_von: auth.ctx.userId },
    })
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 })
  }
}
