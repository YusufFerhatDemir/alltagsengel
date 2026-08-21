import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePflegeAdmin } from '@/lib/pflege/api-auth'
import { entsperrePlan, sperrePlan } from '@/lib/pflege/massnahmenplaene'

/** POST { gesperrt: boolean } — sperrt oder entsperrt einen Maßnahmenplan. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const auth = await requirePflegeAdmin()
    if (!auth.ok) return auth.response

    const body = await request.json().catch(() => ({}))
    const gesperrt = body.gesperrt !== false

    const admin = createAdminClient()
    const plan = gesperrt
      ? await sperrePlan(admin, id, auth.ctx.organizationId)
      : await entsperrePlan(admin, id, auth.ctx.organizationId)

    return NextResponse.json({ plan })
  } catch (err) {
    return apiErrorResponse(err, request)
  }
}
