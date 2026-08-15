'use server'

import { createClient } from '@/lib/supabase/server'
import { geocodePLZ } from '@/lib/geocoding'
import { logAuditEvent } from '@/lib/audit-log'

async function requireAuth() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new Error('Nicht autorisiert.')
  return { supabase, userId: user.id }
}

// ── Profil-Upsert nach Registrierung ─────────────────────────

export async function upsertRegistrationProfile(profileData: {
  id: string
  role: string
  first_name: string
  last_name: string
  email: string
  agb_accepted_at: string
  agb_version: string
  location?: string
  postal_code?: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase, userId } = await requireAuth()

    if (profileData.id !== userId) {
      return { ok: false, error: 'Nicht autorisiert.' }
    }

    const data: Record<string, unknown> = { ...profileData }

    // Geocoding server-seitig durchfuehren
    if (profileData.postal_code && profileData.postal_code.length === 5) {
      const coords = await geocodePLZ(profileData.postal_code)
      if (coords) {
        data.latitude = coords.lat
        data.longitude = coords.lng
      }
    }

    const { error } = await supabase.from('profiles').upsert(data)
    if (error) return { ok: false, error: error.message }

    await logAuditEvent({
      action: 'create',
      actorId: userId,
      actorRole: profileData.role,
      entityType: 'profile',
      entityId: userId,
      details: { aktion: 'registrierung_profil_angelegt', rolle: profileData.role },
    }).catch(() => {})

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unbekannter Fehler' }
  }
}

// ── Care-Recipient anlegen ───────────────────────────────────

export async function insertCareRecipient(data: {
  first_name: string
  last_name: string
  pflegegrad?: number | null
  postal_code?: string | null
  relationship?: string | null
  birth_year?: number | null
  address?: string | null
  city?: string | null
  notes?: string | null
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase, userId } = await requireAuth()

    const { error } = await supabase.from('care_recipients').insert({
      profile_id: userId,
      ...data,
    })
    if (error) return { ok: false, error: error.message }

    await logAuditEvent({
      action: 'create',
      actorId: userId,
      entityType: 'care_recipient',
      details: { aktion: 'pflegeempfaenger_angelegt', first_name: data.first_name, relationship: data.relationship },
    }).catch(() => {})

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unbekannter Fehler' }
  }
}
