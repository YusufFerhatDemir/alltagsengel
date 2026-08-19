'use server'

import { createClient } from '@/lib/supabase/server'
import { resolveUserOrgId } from '@/lib/organizations/server'
import { logAuditEvent } from '@/lib/audit-log'

async function requireFahrer() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new Error('Nicht autorisiert.')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, first_name, last_name')
    .eq('id', user.id)
    .single()

  if (!profile || !['fahrer', 'admin', 'superadmin'].includes(profile.role)) {
    throw new Error('Nur fuer Fahrer.')
  }

  // Org des Nutzers aus Mitgliedschaft/caregivers/clients (Audit MITTEL-1:
  // fail-closed statt stillem Rueckfall auf die Stamm-Org).
  const organizationId = await resolveUserOrgId()
  const name = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || 'Fahrer'
  return { supabase, userId: user.id, organizationId, role: profile.role, name }
}

async function getProviderForUser(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
) {
  const { data: provider, error } = await supabase
    .from('krankenfahrt_providers')
    .select('id')
    .eq('user_id', userId)
    .single()

  if (error || !provider) return null
  return provider
}

export async function claimRide(rideId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    if (!rideId || typeof rideId !== 'string') {
      return { ok: false, error: 'Ungueltige Fahrt-ID.' }
    }

    const { supabase, userId, organizationId, role, name } = await requireFahrer()

    const provider = await getProviderForUser(supabase, userId)
    if (!provider) {
      return { ok: false, error: 'Kein Fahrer-Profil gefunden.' }
    }

    // Verify ride is pending and unassigned
    const { data: ride, error: rideError } = await supabase
      .from('krankenfahrten')
      .select('id, status, provider_id')
      .eq('id', rideId)
      .single()

    if (rideError || !ride) {
      return { ok: false, error: 'Fahrt nicht gefunden.' }
    }

    if (ride.status !== 'pending') {
      return { ok: false, error: 'Fahrt ist nicht mehr verfuegbar.' }
    }

    if (ride.provider_id) {
      return { ok: false, error: 'Fahrt wurde bereits zugewiesen.' }
    }

    const { error: updateError } = await supabase
      .from('krankenfahrten')
      .update({ provider_id: provider.id, status: 'confirmed' })
      .eq('id', rideId)

    if (updateError) {
      return { ok: false, error: 'Fehler beim Annehmen der Fahrt.' }
    }

    logAuditEvent({
      action: 'update',
      actorId: userId,
      organizationId,
      actorRole: role,
      actorName: name,
      entityType: 'krankenfahrt',
      entityId: rideId,
      details: { field: 'status', from: 'pending', to: 'confirmed', provider_id: provider.id },
    }).catch(() => {})

    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unbekannter Fehler.'
    return { ok: false, error: message }
  }
}

export async function startRide(rideId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    if (!rideId || typeof rideId !== 'string') {
      return { ok: false, error: 'Ungueltige Fahrt-ID.' }
    }

    const { supabase, userId, organizationId, role, name } = await requireFahrer()

    const provider = await getProviderForUser(supabase, userId)
    if (!provider) {
      return { ok: false, error: 'Kein Fahrer-Profil gefunden.' }
    }

    // Verify ride belongs to user's provider and is confirmed
    const { data: ride, error: rideError } = await supabase
      .from('krankenfahrten')
      .select('id, status, provider_id')
      .eq('id', rideId)
      .single()

    if (rideError || !ride) {
      return { ok: false, error: 'Fahrt nicht gefunden.' }
    }

    if (ride.provider_id !== provider.id) {
      return { ok: false, error: 'Diese Fahrt gehoert nicht zu Ihrem Profil.' }
    }

    if (ride.status !== 'confirmed') {
      return { ok: false, error: 'Fahrt muss im Status "bestaetigt" sein.' }
    }

    const { error: updateError } = await supabase
      .from('krankenfahrten')
      .update({ status: 'in_progress' })
      .eq('id', rideId)

    if (updateError) {
      return { ok: false, error: 'Fehler beim Starten der Fahrt.' }
    }

    logAuditEvent({
      action: 'update',
      actorId: userId,
      organizationId,
      actorRole: role,
      actorName: name,
      entityType: 'krankenfahrt',
      entityId: rideId,
      details: { field: 'status', from: 'confirmed', to: 'in_progress' },
    }).catch(() => {})

    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unbekannter Fehler.'
    return { ok: false, error: message }
  }
}

export async function completeRide(rideId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    if (!rideId || typeof rideId !== 'string') {
      return { ok: false, error: 'Ungueltige Fahrt-ID.' }
    }

    const { supabase, userId, organizationId, role, name } = await requireFahrer()

    const provider = await getProviderForUser(supabase, userId)
    if (!provider) {
      return { ok: false, error: 'Kein Fahrer-Profil gefunden.' }
    }

    // Verify ride belongs to user's provider and is in_progress
    const { data: ride, error: rideError } = await supabase
      .from('krankenfahrten')
      .select('id, status, provider_id')
      .eq('id', rideId)
      .single()

    if (rideError || !ride) {
      return { ok: false, error: 'Fahrt nicht gefunden.' }
    }

    if (ride.provider_id !== provider.id) {
      return { ok: false, error: 'Diese Fahrt gehoert nicht zu Ihrem Profil.' }
    }

    if (ride.status !== 'in_progress') {
      return { ok: false, error: 'Fahrt muss im Status "unterwegs" sein.' }
    }

    const { error: updateError } = await supabase
      .from('krankenfahrten')
      .update({ status: 'completed' })
      .eq('id', rideId)

    if (updateError) {
      return { ok: false, error: 'Fehler beim Abschliessen der Fahrt.' }
    }

    logAuditEvent({
      action: 'update',
      actorId: userId,
      organizationId,
      actorRole: role,
      actorName: name,
      entityType: 'krankenfahrt',
      entityId: rideId,
      details: { field: 'status', from: 'in_progress', to: 'completed' },
    }).catch(() => {})

    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unbekannter Fehler.'
    return { ok: false, error: message }
  }
}
