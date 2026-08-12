// ═══════════════════════════════════════════════════════════════
// Auth-Guard für app/api/wounds/** — analog lib/pflege/api-auth.ts
// ═══════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/organizations/server'

export interface WundenAuthContext {
  userId: string
  organizationId: string
  role: string
  name: string
}

export type WundenAuthResult =
  | { ok: true; ctx: WundenAuthContext }
  | { ok: false; response: NextResponse }

/** Admin/Superadmin-Guard mit Organisationszuordnung — für alle /api/wounds-Routen. */
export async function requireWundenAdmin(): Promise<WundenAuthResult> {
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

  // Organisation über organization_members (Org-Switcher-Cookie) —
  // profiles hat KEINE organization_id-Spalte.
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
