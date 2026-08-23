// Server-seitiger Admin-Check für die Abrechnungs-API-Routen.
import { NextResponse } from 'next/server'
import { rolleDarf } from '@/lib/auth/guard'
import type { Berechtigung } from '@/lib/auth/rollen'
import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/organizations/server'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Prüft, ob die Sitzung auf AAL2 steht (zweiter Faktor verifiziert).
 * Admin-Konten mit eingerichtetem TOTP-Faktor MÜSSEN auf AAL2 sein,
 * sonst dürfen sie keine schreibenden Operationen durchführen.
 *
 * Fail-open für Admins OHNE eingerichteten Faktor: Sonst sperrt man
 * sie komplett aus, bevor sie MFA einrichten können. Das Layout-Gate
 * leitet sie zur Einrichtung weiter.
 */
async function requireAdminAal2(supabase: SupabaseClient): Promise<NextResponse | null> {
  try {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (!aal) return null // Fehler → fail-open (Layout-Guard greift)
    // Nur blockieren, wenn ein Faktor existiert UND die Sitzung nicht AAL2 ist
    if (aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') {
      return NextResponse.json(
        { error: 'Zweiter Faktor nicht verifiziert. Bitte erneut anmelden.' },
        { status: 403 },
      )
    }
  } catch {
    // Fail-open bei Fehlern
  }
  return null
}

/**
 * Rollenkonzept (lib/auth/rollen.ts): geprueft wird eine BERECHTIGUNG,
 * nicht die Rolle. Default ist die Lese-Berechtigung der Abrechnung —
 * schreibende Routen uebergeben 'abrechnung.schreiben', Routen an
 * Zugangsdaten/Zertifikaten 'system.verwalten' (lib/auth/bereiche.ts).
 */
export async function requireAdmin(
  berechtigung: Berechtigung = 'abrechnung.lesen'
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
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
  if (!profile || !rolleDarf(profile.role, berechtigung)) {
    return { ok: false, response: NextResponse.json({ error: 'Für diesen Bereich fehlt Ihnen die Berechtigung.' }, { status: 403 }) }
  }
  // MFA-Prüfung: Admin mit Faktor muss auf AAL2 sein
  const aalBlock = await requireAdminAal2(supabase)
  if (aalBlock) return { ok: false, response: aalBlock }
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
 *
 * Rollenkonzept (lib/auth/rollen.ts): geprueft wird eine BERECHTIGUNG,
 * nicht die Rolle.
 */
export async function requireAdminMitOrg(
  berechtigung: Berechtigung = 'abrechnung.lesen'
): Promise<
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
  if (!profile || !rolleDarf(profile.role, berechtigung)) {
    return { ok: false, response: NextResponse.json({ error: 'Für diesen Bereich fehlt Ihnen die Berechtigung.' }, { status: 403 }) }
  }
  // MFA-Prüfung: Admin mit Faktor muss auf AAL2 sein
  const aalBlock = await requireAdminAal2(supabase)
  if (aalBlock) return { ok: false, response: aalBlock }

  const organizationId = await getActiveOrgId()
  if (!organizationId) {
    return { ok: false, response: NextResponse.json({ error: 'Keine Organisation zugewiesen' }, { status: 403 }) }
  }

  return { ok: true, userId: user.id, organizationId }
}
