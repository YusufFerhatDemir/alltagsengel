import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsUser } from '@/lib/ops/api-auth'
import { getNachricht } from '@/lib/ops/nachrichten'
import { withTracking } from '@/lib/monitoring/tracker'

export const GET = withTracking(async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireOpsUser()
  if (!auth.ok) return auth.response
  const { id } = await params
  const supabase = createAdminClient()
  try {
    const data = await getNachricht(supabase, {
      organizationId: auth.organizationId,
      id,
      userId: auth.userId,
    })
    if (!data) return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 })

    const { data: rawReplies } = await supabase
      .from('ops_nachrichten')
      .select('id, inhalt, absender_id, created_at, profiles:absender_id(first_name, last_name)')
      .eq('organization_id', auth.organizationId)
      .eq('eltern_id', id)
      .order('created_at', { ascending: true })
    const replies = (rawReplies ?? []).map((r: any) => ({
      id: r.id,
      inhalt: r.inhalt,
      absender_name: r.profiles ? `${r.profiles.first_name} ${r.profiles.last_name}`.trim() : null,
      created_at: r.created_at,
    }))

    return NextResponse.json({ ...data, replies: replies ?? [] })
  } catch (e: any) {
    return apiErrorResponse(e)
  }
})
