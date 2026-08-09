// ═══════════════════════════════════════════════════════════════
// Auth-Guard für app/api/coach/** — DiPA "Digitaler PflegeCoach"
//
// ABWEICHUNG von lib/pflege/api-auth.ts (bewusst):
//  * KEIN Admin-/Rollen-Check gegen profiles, KEINE Organisation —
//    der PflegeCoach ist ein Endnutzer-Produkt, jeder eingeloggte
//    Nutzer darf ausschließlich SEINE eigenen Daten sehen.
//  * KEIN createAdminClient (service_role) — alle Datenzugriffe laufen
//    über den Session-Client, damit die coach_*-RLS die einzige
//    Zugriffs-Wahrheit bleibt (DiPAV-Produktgrenze).
// ═══════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import type { CoachUser } from './types'

export type CoachSessionResult =
  | { ok: true; supabase: SupabaseClient; user: User }
  | { ok: false; response: NextResponse }

export type CoachUserResult =
  | { ok: true; supabase: SupabaseClient; user: User; coachUser: CoachUser }
  | { ok: false; response: NextResponse }

/** Nur Session prüfen — für Onboarding (coach_users-Zeile existiert noch nicht). */
export async function requireCoachSession(): Promise<CoachSessionResult> {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return { ok: false, response: NextResponse.json({ error: 'Nicht angemeldet.' }, { status: 401 }) }
  }
  return { ok: true, supabase, user }
}

/** Session + coach_users-Profil (RLS: nur die eigene Zeile ist sichtbar). */
export async function requireCoachUser(): Promise<CoachUserResult> {
  const session = await requireCoachSession()
  if (!session.ok) return session

  const { data: coachUser, error } = await session.supabase
    .from('coach_users')
    .select('*')
    .eq('user_id', session.user.id)
    .maybeSingle()

  if (error) {
    return { ok: false, response: NextResponse.json({ error: 'PflegeCoach-Profil konnte nicht geladen werden.' }, { status: 500 }) }
  }
  if (!coachUser) {
    return { ok: false, response: NextResponse.json({ error: 'Kein PflegeCoach-Profil. Bitte zuerst das Onboarding abschließen.', code: 'NO_COACH_PROFILE' }, { status: 403 }) }
  }

  return { ok: true, supabase: session.supabase, user: session.user, coachUser: coachUser as CoachUser }
}
