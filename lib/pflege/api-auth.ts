// ═══════════════════════════════════════════════════════════════
// Auth-Guard für app/api/pflege/** — analog lib/akten/api-auth.ts
// ═══════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server'
import { holeRollenQuellen, quellenDuerfen, type RollenQuellen } from '@/lib/auth/rollen-quelle'
import type { Berechtigung } from '@/lib/auth/rollen'
import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/organizations/server'

export interface PflegeAuthContext {
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

export type PflegeAuthResult =
  | { ok: true; ctx: PflegeAuthContext }
  | { ok: false; response: NextResponse }

/**
 * Guard mit Organisationszuordnung — für alle /api/pflege-Routen.
 *
 * Rollenkonzept (lib/auth/rollen.ts): der Guard prueft nicht mehr auf
 * „ist Admin", sondern auf eine BERECHTIGUNG. admin/superadmin haben alle,
 * pdl/qm/buchhaltung nur die ihrer Aufgabe. Der Default ist die
 * Lese-Berechtigung des Fachbereichs; schreibende Routen uebergeben die
 * Schreib-Berechtigung ausdruecklich.
 */
export async function requirePflegeAdmin(
  berechtigung: Berechtigung = 'pflege.lesen'
): Promise<PflegeAuthResult> {
  const supabase = await createClient()
  const quellen = await holeRollenQuellen(supabase)
  if (!quellen) {
    return { ok: false, response: NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 }) }
  }

  if (!quellenDuerfen(quellen, berechtigung)) {
    return { ok: false, response: NextResponse.json({ error: 'Für diesen Bereich fehlt Ihnen die Berechtigung.' }, { status: 403 }) }
  }

  // Die Organisation haengt am organization_members-Mapping (Org-Switcher-Cookie),
  // NICHT an profiles — profiles hat keine organization_id-Spalte.
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

/**
 * Auth-Guard für schreibende Engel-Routen (Verlaufseintrag erstellen).
 * Prüft nur den eingeloggten User — welche Kunden er sehen/beschreiben darf,
 * entscheidet RLS (engel_pflege_verlauf_insert über aktive assignments).
 */
export async function requirePflegeUser(): Promise<
  { ok: true; userId: string; role: string; quellen: RollenQuellen; name: string } | { ok: false; response: NextResponse }
> {
  const supabase = await createClient()
  const quellen = await holeRollenQuellen(supabase)
  if (!quellen) {
    return { ok: false, response: NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 }) }
  }

  // Gültiger Token ohne Profil-Zeile darf NICHT still als 'engel' durchrutschen —
  // sonst bekäme ein profilloser Account Engel-Schreibrechte (analog requirePflegeAdmin).
  if (!quellen.profilRolle) {
    return { ok: false, response: NextResponse.json({ error: 'Kein Profil gefunden.' }, { status: 403 }) }
  }

  const name = quellen.name
  return { ok: true, userId: quellen.userId, role: quellen.rolle ?? 'engel', quellen, name }
}
