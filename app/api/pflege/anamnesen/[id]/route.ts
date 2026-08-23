import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePflegeAdmin } from '@/lib/pflege/api-auth'
import { getAnamnese, updateAnamnese } from '@/lib/pflege/anamnesen'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const auth = await requirePflegeAdmin('pflege.lesen')
    if (!auth.ok) return auth.response

    const admin = createAdminClient()
    const anamnese = await getAnamnese(admin, id, auth.ctx.organizationId)
    if (!anamnese) return NextResponse.json({ error: 'Anamnese nicht gefunden.' }, { status: 404 })

    return NextResponse.json({ anamnese })
  } catch (err) {
    return safeApiError(err, _request)
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const auth = await requirePflegeAdmin('pflege.schreiben')
    if (!auth.ok) return auth.response

    const body = await request.json()
    const admin = createAdminClient()
    const anamnese = await updateAnamnese(admin, id, auth.ctx.organizationId, body)

    return NextResponse.json({ anamnese })
  } catch (err) {
    return apiErrorResponse(err, request)
  }
}
