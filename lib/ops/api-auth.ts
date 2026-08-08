import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export interface OpsAuthContext {
  userId: string
  organizationId: string
  role: string
  name: string
}

export type OpsAuthResult =
  | { ok: true; ctx: OpsAuthContext }
  | { ok: false; response: NextResponse }

export async function requireOpsAdmin(): Promise<OpsAuthResult> {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return { ok: false, response: NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 }) }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, organization_id, first_name, last_name')
    .eq('id', user.id)
    .single()

  if (!profile || !['admin', 'superadmin'].includes(profile.role)) {
    return { ok: false, response: NextResponse.json({ error: 'Nur fuer Administratoren.' }, { status: 403 }) }
  }
  if (!profile.organization_id) {
    return { ok: false, response: NextResponse.json({ error: 'Keine Organisation zugewiesen.' }, { status: 403 }) }
  }

  const name = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || 'Alltagsengel'

  return {
    ok: true,
    ctx: { userId: user.id, organizationId: profile.organization_id, role: profile.role, name },
  }
}

export async function requireOpsUser(): Promise<
  { ok: true; userId: string; organizationId: string; role: string; name: string } | { ok: false; response: NextResponse }
> {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return { ok: false, response: NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 }) }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, organization_id, first_name, last_name')
    .eq('id', user.id)
    .single()

  let organizationId = profile?.organization_id

  if (!organizationId) {
    const { data: caregiver } = await supabase
      .from('caregivers')
      .select('organization_id')
      .eq('user_id', user.id)
      .maybeSingle()
    organizationId = caregiver?.organization_id
  }

  if (!organizationId) {
    return { ok: false, response: NextResponse.json({ error: 'Keine Organisation zugewiesen.' }, { status: 403 }) }
  }

  const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Alltagsengel'
  return { ok: true, userId: user.id, organizationId, role: profile?.role ?? 'engel', name }
}
