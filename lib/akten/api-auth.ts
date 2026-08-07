// ═══════════════════════════════════════════════════════════════
// Auth-Guard für app/api/akten/** — analog dem Inline-Pattern aus
// app/api/billing/dta/**/route.ts, hier als Helper gebündelt weil
// von 13 Routen identisch gebraucht.
// ═══════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export interface AktenAuthContext {
  userId: string
  organizationId: string
  role: string
}

export type AktenAuthResult =
  | { ok: true; ctx: AktenAuthContext }
  | { ok: false; response: NextResponse }

/** Admin/Superadmin-Guard mit Organisationszuordnung — für alle /admin/api/akten-Routen. */
export async function requireAktenAdmin(): Promise<AktenAuthResult> {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return { ok: false, response: NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 }) }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, organization_id')
    .eq('id', user.id)
    .single()

  if (!profile || !['admin', 'superadmin'].includes(profile.role)) {
    return { ok: false, response: NextResponse.json({ error: 'Nur für Administratoren.' }, { status: 403 }) }
  }
  if (!profile.organization_id) {
    return { ok: false, response: NextResponse.json({ error: 'Keine Organisation zugewiesen.' }, { status: 403 }) }
  }

  return { ok: true, ctx: { userId: user.id, organizationId: profile.organization_id, role: profile.role } }
}

/**
 * Auth-Guard für Kunden-/Engel-lesende Routen (z. B. Download).
 * Prüft nur eingeloggten User — die eigentliche Berechtigung auf die
 * konkrete Zeile läuft über RLS (kunde_akten_dokumente_select /
 * engel_akten_dokumente_select / admin_akten_dokumente).
 */
export async function requireAktenUser(): Promise<
  { ok: true; userId: string } | { ok: false; response: NextResponse }
> {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return { ok: false, response: NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 }) }
  }
  return { ok: true, userId: user.id }
}
