// ═══════════════════════════════════════════════════════════════
// Auth-Guard für app/api/uebergaben/** — analog lib/pflege/api-auth.ts
// Übergaben werden von Betreuungskräften geschrieben, nicht nur von
// Administratoren. Deshalb gibt es hier zusätzlich einen Guard, der
// jeden angemeldeten Mitarbeitenden samt Organisation auflöst.
// ═══════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server'
import { holeRollenQuellen, quellenDuerfen } from '@/lib/auth/rollen-quelle'
import { wirksamDarf, type Berechtigung } from '@/lib/auth/rollen'
import { createClient } from '@/lib/supabase/server'
import { resolveUserOrgId } from '@/lib/organizations/server'

export interface UebergabeAuthContext {
  userId: string
  organizationId: string
  role: string
  name: string
  caregiverId: string | null
  istAdmin: boolean
  /**
   * Beide Rollenquellen, damit spaetere Pruefungen (requireUebergabeAdmin)
   * exakt dieselbe Regel anwenden wie der Einstieg. Ueber `role` allein
   * ginge das nicht: das ist der Anzeigename der wirksamen Rolle, und bei
   * zwei gleich weiten, aber verschiedenen Rollen entscheidet nur die
   * Schnittmenge richtig (siehe lib/auth/rollen.ts).
   */
  appRolle: string
  profilRolle: string
}

export type UebergabeAuthResult =
  | { ok: true; ctx: UebergabeAuthContext }
  | { ok: false; response: NextResponse }

/**
 * Rollen, die in der Dienstuebergabe ueberhaupt vorkommen. Engel und
 * Betreuungskraefte stehen NICHT im Rollenkonzept (lib/auth/rollen.ts) —
 * ihr Zugriff haengt an der eigenen Einsatzzuordnung, nicht an einer
 * Verwaltungsberechtigung. Deshalb hier zusaetzlich aufgefuehrt.
 */
const EINSATZ_ROLLEN = ['engel', 'caregiver', 'mitarbeiter']

/** Jeder angemeldete Mitarbeitende mit gültiger Organisation. */
export async function requireUebergabeUser(): Promise<UebergabeAuthResult> {
  const supabase = await createClient()
  const quellen = await holeRollenQuellen(supabase)
  if (!quellen) {
    return { ok: false, response: NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 }) }
  }

  // Gültiger Token ohne Profil-Zeile darf nicht still durchrutschen.
  if (!quellen.profilRolle) {
    return { ok: false, response: NextResponse.json({ error: 'Kein Profil gefunden.' }, { status: 403 }) }
  }

  const role = quellen.rolle || 'engel'
  // Kunden und Angehörige haben in der Dienstübergabe nichts zu suchen.
  // Übergaben enthalten Gesundheitsdaten — Verwaltungsrollen brauchen
  // dafür 'pflege.lesen' (also admin/superadmin/pdl/qm, nicht die
  // Buchhaltung).
  if (!quellenDuerfen(quellen, 'pflege.lesen') && !EINSATZ_ROLLEN.includes(role)) {
    return { ok: false, response: NextResponse.json({ error: 'Keine Berechtigung für Übergaben.' }, { status: 403 }) }
  }

  // Die Organisation haengt am organization_members-Mapping (Org-Switcher-Cookie),
  // NICHT an profiles — profiles hat keine organization_id-Spalte.
  const organizationId = await resolveUserOrgId()
  if (!organizationId) {
    return { ok: false, response: NextResponse.json({ error: 'Keine Organisation zugewiesen.' }, { status: 403 }) }
  }

  const { data: caregiver } = await supabase
    .from('caregivers')
    .select('id')
    .eq('user_id', quellen.userId)
    .maybeSingle()

  const name = quellen.name

  return {
    ok: true,
    ctx: {
      userId: quellen.userId,
      organizationId,
      role,
      name,
      caregiverId: caregiver?.id ?? null,
      appRolle: quellen.appRolle,
      profilRolle: quellen.profilRolle,
      // „istAdmin" heisst hier: darf protokollübergreifend arbeiten.
      // Das ist an die Schreibberechtigung für Pflegedaten gebunden.
      istAdmin: quellenDuerfen(quellen, 'pflege.schreiben'),
    },
  }
}

/** Für löschende und protokollübergreifende Zugriffe. */
export async function requireUebergabeAdmin(
  berechtigung: Berechtigung = 'pflege.schreiben'
): Promise<UebergabeAuthResult> {
  const auth = await requireUebergabeUser()
  if (!auth.ok) return auth
  if (!wirksamDarf(auth.ctx.appRolle, auth.ctx.profilRolle, berechtigung)) {
    return { ok: false, response: NextResponse.json({ error: 'Für diesen Bereich fehlt Ihnen die Berechtigung.' }, { status: 403 }) }
  }
  return auth
}
