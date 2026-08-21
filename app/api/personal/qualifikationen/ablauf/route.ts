import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePersonalAdmin } from '@/lib/personal/api-auth'
import { listAblaufWarnungen } from '@/lib/personal/qualifikationen'

export async function GET() {
  const auth = await requirePersonalAdmin()
  if (!auth.ok) return auth.response
  const supabase = createAdminClient()
  try {
    const data = await listAblaufWarnungen(supabase, auth.ctx.organizationId)
    return NextResponse.json(data)
  } catch (e: any) {
    return apiErrorResponse(e)
  }
}
