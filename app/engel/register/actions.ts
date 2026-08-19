'use server'

import { createClient } from '@/lib/supabase/server'
import { getActiveOrgIdOrDefault } from '@/lib/organizations/server'
import { logAuditEvent } from '@/lib/audit-log'
import { geocodePLZ } from '@/lib/geocoding'

// Register: user may not have 'engel' role yet — only check authenticated
async function requireAuth() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new Error('Nicht autorisiert.')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, first_name, last_name')
    .eq('id', user.id)
    .single()

  // Registrierung: der Nutzer hat noch keine caregivers/clients-Zeile —
  // bewusster Stamm-Org-Fallback (Audit MITTEL-1, dokumentierte Ausnahme).
  const organizationId = await getActiveOrgIdOrDefault()
  const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Engel'
  return { supabase, userId: user.id, organizationId, role: profile?.role ?? null, name }
}

// ---------------------------------------------------------------------------
// Register as Engel — upsert angel row + update profile
// ---------------------------------------------------------------------------
export async function registerAsEngel(data: {
  firstName: string
  lastName: string
  email: string
  phone: string
  plz: string
  stadt: string
  qualification: string
  services: string[]
  availability: string[]
  hourlyRate: number
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    // --- Input validation ---
    if (!Array.isArray(data.services) || data.services.length === 0) {
      return { ok: false, error: 'Bitte mindestens eine Leistung wählen.' }
    }
    if (!Array.isArray(data.availability) || data.availability.length === 0) {
      return { ok: false, error: 'Bitte mindestens einen Verfügbarkeitstag wählen.' }
    }
    if (typeof data.hourlyRate !== 'number' || data.hourlyRate <= 0) {
      return { ok: false, error: 'Ungültiger Stundensatz.' }
    }

    const { supabase, userId, organizationId, role, name } = await requireAuth()

    // --- 1. Upsert angel profile ---
    const { error: angelError } = await supabase.from('angels').upsert({
      id: userId,
      hourly_rate: data.hourlyRate,
      services: data.services,
      availability: data.availability,
      bio: null,
      qualification: data.qualification || null,
      is_certified: (data.qualification || '').includes('45b') || (data.qualification || '').includes('53b'),
      is_45b_capable: (data.qualification || '').includes('45b'),
      is_online: true,
      total_jobs: 0,
      rating: 5.0,
      satisfaction_pct: 100,
    })

    if (angelError) {
      return { ok: false, error: angelError.message }
    }

    // --- 2. Update profile with personal data ---
    const profileUpdate: Record<string, any> = {}
    if (data.firstName) profileUpdate.first_name = data.firstName
    if (data.lastName) profileUpdate.last_name = data.lastName
    if (data.email) profileUpdate.email = data.email
    if (data.phone) profileUpdate.phone = data.phone
    if (data.plz || data.stadt) {
      profileUpdate.location = [data.plz, data.stadt].filter(Boolean).join(' ')
      if (data.plz && data.plz.length === 5) {
        profileUpdate.postal_code = data.plz
        const coords = await geocodePLZ(data.plz)
        if (coords) {
          profileUpdate.latitude = coords.lat
          profileUpdate.longitude = coords.lng
        }
      }
    }
    if (Object.keys(profileUpdate).length > 0) {
      const { error: profileError } = await supabase
        .from('profiles')
        .update(profileUpdate)
        .eq('id', userId)

      if (profileError) {
        return { ok: false, error: profileError.message }
      }
    }

    // --- 3. Audit log (fail-soft) ---
    logAuditEvent({
      action: 'create',
      actorId: userId,
      organizationId,
      actorRole: role,
      actorName: name,
      entityType: 'angel',
      entityId: userId,
      details: {
        services: data.services,
        availability: data.availability,
        qualification: data.qualification || null,
      },
    }).catch(() => {})

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Registrierung fehlgeschlagen.' }
  }
}
