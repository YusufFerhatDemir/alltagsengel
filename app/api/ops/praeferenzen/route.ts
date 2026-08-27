import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsUser } from '@/lib/ops/api-auth'
import { listPraeferenzen, upsertPraeferenz } from '@/lib/ops/praeferenzen'
import { withTracking } from '@/lib/monitoring/tracker'

export const GET = withTracking(async function GET(request: Request) {
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
    return apiErrorResponse(e, request)
  }
})

export const POST = withTracking(async function POST(request: Request) {
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
    return apiErrorResponse(e, request)
  }
})

export const PATCH = withTracking(async function PATCH(request: Request) {
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
    return apiErrorResponse(e, request)
  }
})
