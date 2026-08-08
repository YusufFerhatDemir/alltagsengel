import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/organizations/server'

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
    .select('role, first_name, last_name')
    .eq('id', user.id)
    .single()

  if (!profile || !['admin', 'superadmin'].includes(profile.role)) {
    return { ok: false, response: NextResponse.json({ error: 'Nur fuer Administratoren.' }, { status: 403 }) }
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
    .select('role, first_name, last_name')
    .eq('id', user.id)
    .single()

  // profiles hat keine organization_id-Spalte: Engel bekommen ihre Org aus dem
  // caregivers-Datensatz, alle uebrigen aus der aktiven Organisation
  // (organization_members / Org-Switcher-Cookie).
  const { data: caregiver } = await supabase
    .from('caregivers')
    .select('organization_id')
    .eq('user_id', user.id)
    .maybeSingle()

  const organizationId: string | undefined = caregiver?.organization_id ?? await getActiveOrgId()

  if (!organizationId) {
    return { ok: false, response: NextResponse.json({ error: 'Keine Organisation zugewiesen.' }, { status: 403 }) }
  }

  const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Alltagsengel'
  return { ok: true, userId: user.id, organizationId, role: profile?.role ?? 'engel', name }
}
