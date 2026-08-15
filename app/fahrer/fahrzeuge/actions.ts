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

// ── Fahrzeug hinzufuegen ──────────────────────────────────────

export interface AddVehicleInput {
  kennzeichen: string
  marke: string
  modell: string
  baujahr: string
  farbe: string
  sitze: string
  rollstuhl_geeignet: boolean
  tragestuhl_geeignet: boolean
  liegend_transport: boolean
  klimaanlage: boolean
  tuev_bis: string
  versicherung_bis: string
}

export async function addVehicle(
  input: AddVehicleInput
): Promise<{ ok: true; data: any } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireFahrer()

    // Validate required fields
    if (!input.kennzeichen || typeof input.kennzeichen !== 'string' || !input.kennzeichen.trim()) {
      return { ok: false, error: 'Kennzeichen ist erforderlich.' }
    }
    if (!input.marke || typeof input.marke !== 'string' || !input.marke.trim()) {
      return { ok: false, error: 'Marke ist erforderlich.' }
    }
    if (!input.modell || typeof input.modell !== 'string' || !input.modell.trim()) {
      return { ok: false, error: 'Modell ist erforderlich.' }
    }

    // Look up provider for user
    const { data: provider } = await supabase
      .from('krankenfahrt_providers')
      .select('id')
      .eq('user_id', userId)
      .single()

    if (!provider) {
      return { ok: false, error: 'Kein Dienstleister-Profil gefunden.' }
    }

    // Insert vehicle
    const { data, error: insertError } = await supabase
      .from('fahrzeuge')
      .insert({
        provider_id: provider.id,
        kennzeichen: input.kennzeichen.trim(),
        marke: input.marke.trim(),
        modell: input.modell.trim(),
        baujahr: input.baujahr ? parseInt(input.baujahr) : null,
        farbe: input.farbe?.trim() || null,
        sitze: input.sitze ? parseInt(input.sitze) : null,
        rollstuhl_geeignet: !!input.rollstuhl_geeignet,
        tragestuhl_geeignet: !!input.tragestuhl_geeignet,
        liegend_transport: !!input.liegend_transport,
        klimaanlage: !!input.klimaanlage,
        tuev_bis: input.tuev_bis || null,
        versicherung_bis: input.versicherung_bis || null,
        is_active: true,
      })
      .select()
      .single()

    if (insertError) {
      return { ok: false, error: 'Fehler beim Hinzufuegen des Fahrzeugs.' }
    }

    logAuditEvent({
      action: 'create',
      actorId: userId,
      organizationId,
      actorRole: role,
      actorName: name,
      entityType: 'fahrzeug',
      entityId: data?.id,
      details: { kennzeichen: input.kennzeichen.trim(), marke: input.marke.trim(), modell: input.modell.trim() },
    }).catch(() => {})

    return { ok: true, data }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unerwarteter Fehler.' }
  }
}

// ── Fahrzeug-Status umschalten ────────────────────────────────

export async function toggleVehicleActive(
  vehicleId: string,
  newStatus: boolean
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireFahrer()

    if (!vehicleId || typeof vehicleId !== 'string') {
      return { ok: false, error: 'Fahrzeug-ID fehlt.' }
    }
    if (typeof newStatus !== 'boolean') {
      return { ok: false, error: 'Ungueltiger Status.' }
    }

    // Look up provider for user
    const { data: provider } = await supabase
      .from('krankenfahrt_providers')
      .select('id')
      .eq('user_id', userId)
      .single()

    if (!provider) {
      return { ok: false, error: 'Kein Dienstleister-Profil gefunden.' }
    }

    // Verify vehicle belongs to user's provider
    const { data: vehicle } = await supabase
      .from('fahrzeuge')
      .select('id')
      .eq('id', vehicleId)
      .eq('provider_id', provider.id)
      .single()

    if (!vehicle) {
      return { ok: false, error: 'Fahrzeug nicht gefunden oder keine Berechtigung.' }
    }

    // Update status
    const { error: updateError } = await supabase
      .from('fahrzeuge')
      .update({ is_active: newStatus })
      .eq('id', vehicleId)
      .eq('provider_id', provider.id)

    if (updateError) {
      return { ok: false, error: 'Fehler beim Aktualisieren des Fahrzeug-Status.' }
    }

    logAuditEvent({
      action: 'update',
      actorId: userId,
      organizationId,
      actorRole: role,
      actorName: name,
      entityType: 'fahrzeug',
      entityId: vehicleId,
      details: { is_active: newStatus },
    }).catch(() => {})

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unerwarteter Fehler.' }
  }
}
