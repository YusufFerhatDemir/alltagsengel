import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePersonalAdmin } from '@/lib/personal/api-auth'
import { listQualifikationen, createQualifikation } from '@/lib/personal/qualifikationen'

export async function GET(request: Request) {
  const auth = await requirePersonalAdmin('personal.lesen')
  if (!auth.ok) return auth.response
  const supabase = createAdminClient()
  const url = new URL(request.url)
  const caregiverId = url.searchParams.get('caregiverId')
  const nurPflicht = url.searchParams.get('nurPflicht')
  const nurEinsatzrelevant = url.searchParams.get('nurEinsatzrelevant')
  try {
    const data = await listQualifikationen(supabase, {
      organizationId: auth.ctx.organizationId,
      caregiverId: caregiverId || undefined,
      nurPflicht: nurPflicht === 'true',
      nurEinsatzrelevant: nurEinsatzrelevant === 'true',
    })
    return NextResponse.json(data)
  } catch (e: any) {
    return apiErrorResponse(e, request)
  }
}

export async function POST(request: Request) {
  const auth = await requirePersonalAdmin('personal.schreiben')
  if (!auth.ok) return auth.response
  const supabase = createAdminClient()
  try {
    const body = await request.json()
    const data = await createQualifikation(supabase, {
      ...body,
      // Mandant kommt aus dem Auth-Kontext und darf nicht aus dem Body kommen.
      organizationId: auth.ctx.organizationId,
    })
    return NextResponse.json(data, { status: 201 })
  } catch (e: any) {
    return apiErrorResponse(e, request)
  }
}
