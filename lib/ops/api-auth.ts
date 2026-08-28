import { NextResponse } from 'next/server'
import { holeRollenQuellen, quellenDuerfen } from '@/lib/auth/rollen-quelle'
import type { Berechtigung } from '@/lib/auth/rollen'
import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId, resolveUserOrgId } from '@/lib/organizations/server'
import { hatOpsPostfach } from './postfach-rollen'
import type { SupabaseClient } from '@supabase/supabase-js'

/** MFA-Prüfung: Admin mit Faktor muss auf AAL2 sein. Fail-open bei Fehler. */
async function requireAdminAal2(supabase: SupabaseClient): Promise<NextResponse | null> {
  try {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (aal && aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') {
      return NextResponse.json(
        { error: 'Zweiter Faktor nicht verifiziert. Bitte erneut anmelden.' },
        { status: 403 },
      )
    }
  } catch {}
  return null
}

export interface OpsAuthContext {
  userId: string
  organizationId: string
  role: string
  name: string
}

export type OpsAuthResult =
  | { ok: true; ctx: OpsAuthContext }
  | { ok: false; response: NextResponse }

/**
 * Rollenkonzept (lib/auth/rollen.ts): der Guard prueft nicht mehr auf
 * „ist Admin", sondern auf eine BERECHTIGUNG. Der Default ist bewusst die
 * strengste ('system.verwalten' = nur Administration) — eine Route, die
 * hier nichts uebergibt, bleibt damit so eng wie vorher. Die Zuordnung
 * pro Bereich steht in lib/auth/bereiche.ts.
 */
export async function requireOpsAdmin(
  berechtigung: Berechtigung = 'system.verwalten'
): Promise<OpsAuthResult> {
  const supabase = await createClient()
  const quellen = await holeRollenQuellen(supabase)
  if (!quellen) {
    return { ok: false, response: NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 }) }
  }

  if (!quellenDuerfen(quellen, berechtigung)) {
    return { ok: false, response: NextResponse.json({ error: 'Für diesen Bereich fehlt Ihnen die Berechtigung.' }, { status: 403 }) }
  }
  // MFA-Prüfung
  const aalBlock = await requireAdminAal2(supabase)
  if (aalBlock) return { ok: false, response: aalBlock }

  // Die Organisation haengt am organization_members-Mapping (Org-Switcher-Cookie),
  // NICHT an profiles — profiles hat keine organization_id-Spalte.
  const organizationId = await getActiveOrgId()
  if (!organizationId) {
    return { ok: false, response: NextResponse.json({ error: 'Keine Organisation zugewiesen.' }, { status: 403 }) }
  }

  const name = quellen.name

  return {
    ok: true,
    ctx: { userId: quellen.userId, organizationId, role: quellen.rolle, name },
  }
}

/**
 * Wie `requireOpsUser()`, zusaetzlich mit der Postfach-Erlaubnisliste aus
 * lib/ops/postfach-rollen.ts. Siehe dort die Begruendung (Track 10).
 */
export async function requireOpsPostfachUser(): Promise<
  { ok: true; userId: string; organizationId: string; role: string; name: string } | { ok: false; response: NextResponse }
> {
  const basis = await requireOpsUser()
  if (!basis.ok) return basis

  if (!hatOpsPostfach(basis.appRolle, basis.profilRolle)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Für das interne Postfach fehlt Ihnen die Berechtigung.' },
        { status: 403 },
      ),
    }
  }

  return {
    ok: true,
    userId: basis.userId,
    organizationId: basis.organizationId,
    role: basis.role,
    name: basis.name,
  }
}

export async function requireOpsUser(): Promise<
  { ok: true; userId: string; organizationId: string; role: string; name: string; appRolle: string; profilRolle: string } | { ok: false; response: NextResponse }
> {
  const supabase = await createClient()
  const quellen = await holeRollenQuellen(supabase)
  if (!quellen) {
    return { ok: false, response: NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 }) }
  }

  // profiles hat keine organization_id-Spalte: Engel bekommen ihre Org aus dem
  // caregivers-Datensatz, alle uebrigen aus der aktiven Organisation
  // (organization_members / Org-Switcher-Cookie).
  const { data: caregiver } = await supabase
    .from('caregivers')
    .select('organization_id')
    .eq('user_id', quellen.userId)
    .maybeSingle()

  // Fail-closed (Audit MITTEL-1): Engel bekommen ihre Org aus caregivers,
  // alle uebrigen aus der Mitgliedschaft bzw. clients — kein stiller
  // Rueckfall auf die Stamm-Org mehr.
  const organizationId: string | null = caregiver?.organization_id ?? await resolveUserOrgId()

  if (!organizationId) {
    return { ok: false, response: NextResponse.json({ error: 'Keine Organisation zugewiesen.' }, { status: 403 }) }
  }

  const name = quellen.name
  return {
    ok: true,
    userId: quellen.userId,
    organizationId,
    role: quellen.rolle || 'engel',
    name,
    appRolle: quellen.appRolle,
    profilRolle: quellen.profilRolle,
  }
}
