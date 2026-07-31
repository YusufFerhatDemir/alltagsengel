import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ACTIVE_ORG_COOKIE } from '@/lib/organizations/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/organizations/switch
 * Body: { organization_id }
 * Wechselt die aktive Organisation: validiert Mitgliedschaft, setzt Cookie
 * (serverseitiger Kontext) und app_metadata.org_id (RLS-Kontext im JWT —
 * greift nach dem nächsten Token-Refresh).
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })

  let body: any
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Ungültiger Request-Body' }, { status: 400 })
  }
  const orgId = String(body?.organization_id || '')
  if (!/^[0-9a-f-]{36}$/i.test(orgId)) {
    return NextResponse.json({ error: 'Ungültige Organisations-ID' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: membership, error } = await admin
    .from('organization_members')
    .select('role, organizations(name)')
    .eq('organization_id', orgId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (error || !membership) {
    return NextResponse.json({ error: 'Sie sind kein Mitglied dieser Organisation.' }, { status: 403 })
  }

  try {
    await admin.auth.admin.updateUserById(user.id, { app_metadata: { org_id: orgId } })
  } catch { /* Membership-Fallback in current_org_id() greift trotzdem */ }

  const cookieStore = await cookies()
  cookieStore.set(ACTIVE_ORG_COOKIE, orgId, {
    path: '/', httpOnly: true, sameSite: 'lax', secure: true, maxAge: 60 * 60 * 24 * 365,
  })

  return NextResponse.json({ ok: true, active_org_id: orgId })
}
