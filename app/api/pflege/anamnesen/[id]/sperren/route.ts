import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePflegeAdmin } from '@/lib/pflege/api-auth'
import { entsperreAnamnese, sperreAnamnese } from '@/lib/pflege/anamnesen'

/** POST { gesperrt: boolean } — sperrt oder entsperrt eine Anamnese. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const auth = await requirePflegeAdmin('pflege.schreiben')
    if (!auth.ok) return auth.response

    const body = await request.json().catch(() => ({}))
    const gesperrt = body.gesperrt !== false

    const admin = createAdminClient()
    const anamnese = gesperrt
      ? await sperreAnamnese(admin, id, auth.ctx.organizationId)
      : await entsperreAnamnese(admin, id, auth.ctx.organizationId)

    return NextResponse.json({ anamnese })
  } catch (err) {
    return apiErrorResponse(err, request)
  }
}
