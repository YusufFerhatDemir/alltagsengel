// Server-seitiger Admin-Check für die Abrechnungs-API-Routen.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/organizations/server'

export async function requireAdmin(): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 }) }
  }
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (!profile || !['admin', 'superadmin'].includes(profile.role)) {
    return { ok: false, response: NextResponse.json({ error: 'Nur für Administratoren' }, { status: 403 }) }
  }
  return { ok: true }
}

/**
 * Admin-Check inklusive aktiver Organisation.
 *
 * Die Organisation haengt am organization_members-Mapping (Org-Switcher-Cookie),
 * NICHT an profiles — profiles hat keine organization_id-Spalte. Guards, die
 * sie dort selektieren, liefern still 403.
 *
 * Jede Route, die Mandantendaten liest oder schreibt, muss ueber diesen
 * Einstieg gehen: eine fehlende organization_id ist der Unterschied zwischen
 * "eigene Stammdaten" und "Stammdaten aller Mandanten".
 */
export async function requireAdminMitOrg(): Promise<
  | { ok: true; userId: string; organizationId: string }
  | { ok: false; response: NextResponse }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 }) }
  }
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (!profile || !['admin', 'superadmin'].includes(profile.role)) {
    return { ok: false, response: NextResponse.json({ error: 'Nur für Administratoren' }, { status: 403 }) }
  }

  const organizationId = await getActiveOrgId()
  if (!organizationId) {
    return { ok: false, response: NextResponse.json({ error: 'Keine Organisation zugewiesen' }, { status: 403 }) }
  }

  return { ok: true, userId: user.id, organizationId }
}
