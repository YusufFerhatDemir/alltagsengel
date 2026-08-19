import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId, resolveUserOrgId } from '@/lib/organizations/server'

export interface AngehAuthContext {
  userId: string
  organizationId: string
  role: string
  name: string
}

export type AngehAuthResult =
  | { ok: true; ctx: AngehAuthContext }
  | { ok: false; response: NextResponse }

export async function requireAngehAdmin(): Promise<AngehAuthResult> {
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

export async function requireAngehUser(): Promise<
  | { ok: true; userId: string; role: string; organizationId: string }
  | { ok: false; response: NextResponse }
> {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return { ok: false, response: NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 }) }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile) {
    return { ok: false, response: NextResponse.json({ error: 'Kein Profil.' }, { status: 403 }) }
  }

  // Rollenprüfung: Nur Benutzer mit der Rolle "angehoerige" dürfen zugreifen.
  // Admins/Superadmins werden ebenfalls durchgelassen (für Verwaltungszwecke).
  const erlaubteRollen = ['angehoerige', 'admin', 'superadmin']
  if (!erlaubteRollen.includes(profile.role)) {
    return { ok: false, response: NextResponse.json({ error: 'Zugriff nur fuer Angehoerige.' }, { status: 403 }) }
  }

  const organizationId = await resolveUserOrgId()
  if (!organizationId) {
    return { ok: false, response: NextResponse.json({ error: 'Keine Organisation zugewiesen.' }, { status: 403 }) }
  }

  return { ok: true, userId: user.id, role: profile.role, organizationId }
}
