import { createAdminClient } from '@/lib/supabase/admin'

// ═══════════════════════════════════════════════════════════════
// native-auth — gemeinsame Session-Prüfung für die dedizierten
// /api/native/*-Routen (Bridge für die Expo-App). Die Native App hat
// keine Browser-Cookies → Bearer-Token im Authorization-Header
// (supabase-js session.access_token), analog app/api/referral/route.ts.
// ═══════════════════════════════════════════════════════════════

export interface NativeAuthResult {
  ok: true
  userId: string
  caregiverId: string
  organizationId: string
}

export interface NativeAuthError {
  ok: false
  status: number
  error: string
}

/**
 * Verifiziert den Bearer-Token aus dem Authorization-Header und lädt
 * die zugehörige caregivers.id des eingeloggten Users (caregivers.user_id
 * = auth.uid()). Gibt 401, wenn kein/ungültiger Token, 403, wenn der
 * User keine eigene Betreuungskraft-Zeile hat.
 */
export async function requireCaregiverSession(
  request: Request
): Promise<NativeAuthResult | NativeAuthError> {
  const authHeader = request.headers.get('authorization')
  if (!authHeader) {
    return { ok: false, status: 401, error: 'Nicht autorisiert' }
  }

  const token = authHeader.replace('Bearer ', '')
  const adminSupabase = createAdminClient()

  const {
    data: { user },
    error: authError,
  } = await adminSupabase.auth.getUser(token)

  if (authError || !user) {
    return { ok: false, status: 401, error: 'Nicht autorisiert' }
  }

  const { data: caregiver } = await adminSupabase
    .from('caregivers')
    .select('id, organization_id')
    .eq('user_id', user.id)
    .single()

  if (!caregiver) {
    return { ok: false, status: 403, error: 'Kein Betreuungskraft-Konto für diesen Nutzer' }
  }

  return { ok: true, userId: user.id, caregiverId: caregiver.id, organizationId: caregiver.organization_id }
}
