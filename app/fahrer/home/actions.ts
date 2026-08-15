'use server'

import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/organizations/server'
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

  const organizationId = await getActiveOrgId()
  const name = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || 'Fahrer'
  return { supabase, userId: user.id, organizationId, role: profile.role, name }
}

// ---------------------------------------------------------------------------
// 1. Update provider city based on user location
// ---------------------------------------------------------------------------
export async function updateProviderCity(providerId: string, city: string) {
  try {
    if (!providerId || typeof providerId !== 'string') {
      return { ok: false, error: 'Ungueltige Provider-ID.' }
    }
    if (!city || typeof city !== 'string' || city.trim().length === 0) {
      return { ok: false, error: 'Stadt darf nicht leer sein.' }
    }

    const { supabase, userId, organizationId, role, name } = await requireFahrer()

    // Verify provider belongs to the authenticated user
    const { data: provider, error: providerError } = await supabase
      .from('krankenfahrt_providers')
      .select('id, user_id')
      .eq('id', providerId)
      .single()

    if (providerError || !provider) {
      return { ok: false, error: 'Provider nicht gefunden.' }
    }
    if (provider.user_id !== userId) {
      return { ok: false, error: 'Zugriff verweigert.' }
    }

    const { error: updateError } = await supabase
      .from('krankenfahrt_providers')
      .update({ city: city.trim() })
      .eq('id', providerId)

    if (updateError) {
      return { ok: false, error: 'Stadt konnte nicht aktualisiert werden.' }
    }

    logAuditEvent({
      action: 'update',
      actorId: userId,
      organizationId,
      actorRole: role,
      actorName: name,
      entityType: 'krankenfahrt_provider',
      entityId: providerId,
      details: { field: 'city', newValue: city.trim() },
    }).catch(() => {})

    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unbekannter Fehler.'
    return { ok: false, error: message }
  }
}

// ---------------------------------------------------------------------------
// 2. Claim a ride (set provider_id + status → confirmed)
// ---------------------------------------------------------------------------
export async function claimRide(rideId: string) {
  try {
    if (!rideId || typeof rideId !== 'string') {
      return { ok: false, error: 'Ungueltige Fahrt-ID.' }
    }

    const { supabase, userId, organizationId, role, name } = await requireFahrer()

    // Look up provider for this user
    const { data: provider, error: providerError } = await supabase
      .from('krankenfahrt_providers')
      .select('id')
      .eq('user_id', userId)
      .single()

    if (providerError || !provider) {
      return { ok: false, error: 'Kein Provider-Profil gefunden.' }
    }

    // Verify the ride exists, is pending, and unassigned
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
      return { ok: false, error: 'Fahrt konnte nicht uebernommen werden.' }
    }

    logAuditEvent({
      action: 'update',
      actorId: userId,
      organizationId,
      actorRole: role,
      actorName: name,
      entityType: 'krankenfahrt',
      entityId: rideId,
      details: { action: 'claim', providerId: provider.id, newStatus: 'confirmed' },
    }).catch(() => {})

    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unbekannter Fehler.'
    return { ok: false, error: message }
  }
}

// ---------------------------------------------------------------------------
// 3. Start a ride (status → in_progress)
// ---------------------------------------------------------------------------
export async function startRide(rideId: string) {
  try {
    if (!rideId || typeof rideId !== 'string') {
      return { ok: false, error: 'Ungueltige Fahrt-ID.' }
    }

    const { supabase, userId, organizationId, role, name } = await requireFahrer()

    // Look up provider for this user
    const { data: provider, error: providerError } = await supabase
      .from('krankenfahrt_providers')
      .select('id')
      .eq('user_id', userId)
      .single()

    if (providerError || !provider) {
      return { ok: false, error: 'Kein Provider-Profil gefunden.' }
    }

    // Verify the ride belongs to this provider and is in confirmed status
    const { data: ride, error: rideError } = await supabase
      .from('krankenfahrten')
      .select('id, status, provider_id')
      .eq('id', rideId)
      .single()

    if (rideError || !ride) {
      return { ok: false, error: 'Fahrt nicht gefunden.' }
    }
    if (ride.provider_id !== provider.id) {
      return { ok: false, error: 'Zugriff verweigert.' }
    }
    if (ride.status !== 'confirmed') {
      return { ok: false, error: 'Fahrt muss im Status "bestaetigt" sein.' }
    }

    const { error: updateError } = await supabase
      .from('krankenfahrten')
      .update({ status: 'in_progress' })
      .eq('id', rideId)

    if (updateError) {
      return { ok: false, error: 'Fahrt konnte nicht gestartet werden.' }
    }

    logAuditEvent({
      action: 'update',
      actorId: userId,
      organizationId,
      actorRole: role,
      actorName: name,
      entityType: 'krankenfahrt',
      entityId: rideId,
      details: { action: 'start', providerId: provider.id, newStatus: 'in_progress' },
    }).catch(() => {})

    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unbekannter Fehler.'
    return { ok: false, error: message }
  }
}

// ---------------------------------------------------------------------------
// 4. Complete a ride (status → completed)
// ---------------------------------------------------------------------------
export async function completeRide(rideId: string) {
  try {
    if (!rideId || typeof rideId !== 'string') {
      return { ok: false, error: 'Ungueltige Fahrt-ID.' }
    }

    const { supabase, userId, organizationId, role, name } = await requireFahrer()

    // Look up provider for this user
    const { data: provider, error: providerError } = await supabase
      .from('krankenfahrt_providers')
      .select('id')
      .eq('user_id', userId)
      .single()

    if (providerError || !provider) {
      return { ok: false, error: 'Kein Provider-Profil gefunden.' }
    }

    // Verify the ride belongs to this provider and is in_progress
    const { data: ride, error: rideError } = await supabase
      .from('krankenfahrten')
      .select('id, status, provider_id')
      .eq('id', rideId)
      .single()

    if (rideError || !ride) {
      return { ok: false, error: 'Fahrt nicht gefunden.' }
    }
    if (ride.provider_id !== provider.id) {
      return { ok: false, error: 'Zugriff verweigert.' }
    }
    if (ride.status !== 'in_progress') {
      return { ok: false, error: 'Fahrt muss im Status "unterwegs" sein.' }
    }

    const { error: updateError } = await supabase
      .from('krankenfahrten')
      .update({ status: 'completed' })
      .eq('id', rideId)

    if (updateError) {
      return { ok: false, error: 'Fahrt konnte nicht abgeschlossen werden.' }
    }

    logAuditEvent({
      action: 'update',
      actorId: userId,
      organizationId,
      actorRole: role,
      actorName: name,
      entityType: 'krankenfahrt',
      entityId: rideId,
      details: { action: 'complete', providerId: provider.id, newStatus: 'completed' },
    }).catch(() => {})

    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unbekannter Fehler.'
    return { ok: false, error: message }
  }
}
