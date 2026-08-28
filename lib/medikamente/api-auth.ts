import { NextResponse } from 'next/server'
import { holeRollenQuellen, quellenDuerfen, type RollenQuellen } from '@/lib/auth/rollen-quelle'
import type { Berechtigung } from '@/lib/auth/rollen'
import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId, resolveUserOrgId } from '@/lib/organizations/server'

export interface MedAuthContext {
  userId: string
  organizationId: string
  /**
   * Wirksame Rolle als BESCHRIFTUNG (Protokoll, Anzeige) — nicht als
   * Entscheidungsgrundlage. Sie ist die engere der beiden Quellen, nicht
   * deren Schnittmenge: bei gleich weiten, aber verschiedenen Rollen
   * beantwortet `rolleDarf(ctx.role, …)` eine Frage anders als der Guard
   * selbst. Fuer jede weitere Entscheidung ist `quellen` die Quelle.
   */
  role: string
  /** Beide Rollenquellen, fuer nachgelagerte Entscheidungen im Handler. */
  quellen: RollenQuellen
  name: string
}

export type MedAuthResult =
  | { ok: true; ctx: MedAuthContext }
  | { ok: false; response: NextResponse }

/**
 * Rollenkonzept (lib/auth/rollen.ts): der Guard prueft nicht mehr auf
 * „ist Admin", sondern auf eine BERECHTIGUNG. admin/superadmin haben alle,
 * pdl/qm/buchhaltung nur die ihrer Aufgabe. Der Default ist die
 * Lese-Berechtigung des Fachbereichs; schreibende Routen uebergeben die
 * Schreib-Berechtigung ausdruecklich.
 */
export async function requireMedAdmin(
  berechtigung: Berechtigung = 'pflege.lesen'
): Promise<MedAuthResult> {
  const supabase = await createClient()
  const quellen = await holeRollenQuellen(supabase)
  if (!quellen) {
    return { ok: false, response: NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 }) }
  }

  if (!quellenDuerfen(quellen, berechtigung)) {
    return { ok: false, response: NextResponse.json({ error: 'Für diesen Bereich fehlt Ihnen die Berechtigung.' }, { status: 403 }) }
  }

  const organizationId = await getActiveOrgId()
  if (!organizationId) {
    return { ok: false, response: NextResponse.json({ error: 'Keine Organisation zugewiesen.' }, { status: 403 }) }
  }

  const name = quellen.name

  return {
    ok: true,
    ctx: { userId: quellen.userId, organizationId, role: quellen.rolle, quellen, name },
  }
}

export async function requireMedUser(): Promise<
  { ok: true; userId: string; role: string; quellen: RollenQuellen; organizationId: string } | { ok: false; response: NextResponse }
> {
  const supabase = await createClient()
  const quellen = await holeRollenQuellen(supabase)
  if (!quellen) {
    return { ok: false, response: NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 }) }
  }

  if (!quellen.profilRolle) {
    return { ok: false, response: NextResponse.json({ error: 'Kein Profil.' }, { status: 403 }) }
  }

  const organizationId = await resolveUserOrgId()
  if (!organizationId) {
    return { ok: false, response: NextResponse.json({ error: 'Keine Organisation zugewiesen.' }, { status: 403 }) }
  }

  return { ok: true, userId: quellen.userId, role: quellen.rolle, quellen, organizationId }
}
