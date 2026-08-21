import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePersonalAdmin } from '@/lib/personal/api-auth'
import { listSchulungen, createSchulung } from '@/lib/personal/schulungen'
import type { Schulungsart } from '@/lib/personal/types'

export async function GET(request: Request) {
  const auth = await requirePersonalAdmin()
  if (!auth.ok) return auth.response
  const supabase = createAdminClient()
  const url = new URL(request.url)
  const caregiverId = url.searchParams.get('caregiverId')
  const schulungsart = url.searchParams.get('schulungsart')
  try {
    const data = await listSchulungen(supabase, {
      organizationId: auth.ctx.organizationId,
      caregiverId: caregiverId || undefined,
      schulungsart: (schulungsart || undefined) as Schulungsart | undefined,
    })
    return NextResponse.json(data)
  } catch (e: any) {
    return apiErrorResponse(e, request)
  }
}

export async function POST(request: Request) {
  const auth = await requirePersonalAdmin()
  if (!auth.ok) return auth.response
  const supabase = createAdminClient()
  try {
    const body = await request.json()
    const data = await createSchulung(supabase, {
      ...body,
      // Mandant und Urheber kommen aus dem Auth-Kontext und duerfen
      // nicht aus dem Request-Body ueberschrieben werden.
      organizationId: auth.ctx.organizationId,
      erstelltVon: auth.ctx.userId,
    })
    return NextResponse.json(data, { status: 201 })
  } catch (e: any) {
    return apiErrorResponse(e, request)
  }
}
