import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/organizations/server'

export interface PersonalAuthContext {
  userId: string
  organizationId: string
  role: string
  name: string
}

export type PersonalAuthResult =
  | { ok: true; ctx: PersonalAuthContext }
  | { ok: false; response: NextResponse }

export async function requirePersonalAdmin(): Promise<PersonalAuthResult> {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return { ok: false, response: NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 }) }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, first_name, last_name')
    .eq('id', user.id)
    .single()

  if (!profile || !['admin', 'superadmin'].includes(profile.role)) {
    return { ok: false, response: NextResponse.json({ error: 'Nur für Administratoren.' }, { status: 403 }) }
  }

  // Die Organisation haengt am organization_members-Mapping (Org-Switcher-Cookie),
  // NICHT an profiles — profiles hat keine organization_id-Spalte.
  const organizationId = await getActiveOrgId()
  if (!organizationId) {
    return { ok: false, response: NextResponse.json({ error: 'Keine Organisation zugewiesen.' }, { status: 403 }) }
  }

  const name = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || 'Alltagsengel'

  return {
    ok: true,
    ctx: { userId: user.id, organizationId, role: profile.role, name },
  }
}

export async function requirePersonalUser(): Promise<
  { ok: true; userId: string; role: string; name: string; caregiverId: string | null } | { ok: false; response: NextResponse }
> {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return { ok: false, response: NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 }) }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, first_name, last_name')
    .eq('id', user.id)
    .single()

  const { data: caregiver } = await supabase
    .from('caregivers')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()

  const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Alltagsengel'
  return { ok: true, userId: user.id, role: profile?.role ?? 'engel', name, caregiverId: caregiver?.id ?? null }
}
