// ═══════════════════════════════════════════════════════════════
// EXPANSION — Admin-Guard für die API-Routen
// ═══════════════════════════════════════════════════════════════
// Wie lib/abrechnung/require-admin.ts, liefert zusätzlich die
// User-ID und die aktive Organisation. Jede Freischaltung braucht
// einen namentlich protokollierten Verantwortlichen (actor_id).
// ═══════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/organizations/server'

export type AdminKontext =
  | { ok: true; userId: string; orgId: string }
  | { ok: false; response: NextResponse }

export async function requireExpansionAdmin(): Promise<AdminKontext> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 }),
    }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !['admin', 'superadmin'].includes(profile.role)) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Nur für Administratoren' }, { status: 403 }),
    }
  }

  const orgId = await getActiveOrgId()
  return { ok: true, userId: user.id, orgId }
}
