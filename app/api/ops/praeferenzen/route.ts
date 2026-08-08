import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsUser } from '@/lib/ops/api-auth'
import { listPraeferenzen, upsertPraeferenz } from '@/lib/ops/praeferenzen'

export async function GET(request: Request) {
  const auth = await requireOpsUser()
  if (!auth.ok) return auth.response
  const supabase = createAdminClient()
  try {
    const data = await listPraeferenzen(supabase, {
      organizationId: auth.organizationId,
      benutzerId: auth.userId,
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
    const data = await upsertPraeferenz(supabase, {
      organizationId: auth.organizationId,
      benutzerId: auth.userId,
      kategorie: body.kategorie,
      inApp: body.in_app,
      email: body.email,
      push: body.push,
      aktiv: body.aktiv,
    })
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 })
  }
}

export async function PATCH(request: Request) {
  const auth = await requireOpsUser()
  if (!auth.ok) return auth.response
  const supabase = createAdminClient()
  try {
    const body = await request.json()
    const data = await upsertPraeferenz(supabase, {
      organizationId: auth.organizationId,
      benutzerId: auth.userId,
      kategorie: body.kategorie,
      inApp: body.in_app,
      email: body.email,
      push: body.push,
      aktiv: body.aktiv,
    })
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 })
  }
}
