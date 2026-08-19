'use server'

import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/organizations/server'
import { logAuditEvent } from '@/lib/audit-log'

// ═══════════════════════════════════════════════════════════════
// Server-seitige Aktionen fuer Fahrzeugverwaltung
// Ersetzt client-seitige Supabase-Writes durch gepruefte Server Actions
// ═══════════════════════════════════════════════════════════════

async function requireMISAdmin() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new Error('Nicht autorisiert.')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, first_name, last_name')
    .eq('id', user.id)
    .single()

  if (!profile || !['admin', 'superadmin'].includes(profile.role)) {
    throw new Error('Nur fuer Administratoren.')
  }

  const organizationId = await getActiveOrgId()
  if (!organizationId) throw new Error('Keine Organisation zugewiesen.')

  const name = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || 'Alltagsengel'
  return { supabase, userId: user.id, organizationId, role: profile.role, name }
}

// ── Fahrzeug anlegen ───────────────────────────────────────────

export async function createVehicle(data: {
  plate: string
  brand: string
  model: string
  year: string
  fuel_type: string
  status: string
  current_km: string
  next_tuev: string
  next_service_km: string
  insurance_until: string
  assigned_to: string
  notes: string
}): Promise<{ ok: true; data?: any } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireMISAdmin()

    const row = {
      plate: data.plate.toUpperCase(),
      brand: data.brand,
      model: data.model,
      year: parseInt(data.year, 10) || null,
      fuel_type: data.fuel_type,
      status: data.status,
      current_km: parseInt(data.current_km, 10) || 0,
      next_tuev: data.next_tuev || null,
      next_service_km: parseInt(data.next_service_km, 10) || null,
      insurance_until: data.insurance_until || null,
      assigned_to: data.assigned_to || null,
      notes: data.notes || null,
      organization_id: organizationId,
      created_by: userId,
    }

    const { data: inserted, error } = await supabase
      .from('mis_vehicles')
      .insert(row)
      .select()
      .single()

    if (error) {
      return { ok: false, error: error.message }
    }

    await logAuditEvent({
      action: 'create',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'mis_vehicles',
      entityId: inserted.id,
      details: { aktion: 'fahrzeug_angelegt', plate: row.plate },
    }).catch(() => {})

    return { ok: true, data: inserted }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unbekannter Fehler' }
  }
}

// ── Fahrzeugstatus aendern ─────────────────────────────────────

export async function updateVehicleStatus(
  id: string,
  newStatus: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireMISAdmin()

    const now = new Date().toISOString()
    const { error } = await supabase
      .from('mis_vehicles')
      .update({ status: newStatus, updated_at: now })
      .eq('id', id)

    if (error) {
      return { ok: false, error: error.message }
    }

    await logAuditEvent({
      action: 'update',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'mis_vehicles',
      entityId: id,
      details: { aktion: 'status_geaendert', neuer_status: newStatus },
    }).catch(() => {})

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unbekannter Fehler' }
  }
}

// ── Kilometerstand aktualisieren ───────────────────────────────

export async function updateVehicleKm(
  id: string,
  km: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireMISAdmin()

    const now = new Date().toISOString()
    const { error } = await supabase
      .from('mis_vehicles')
      .update({ current_km: km, updated_at: now })
      .eq('id', id)

    if (error) {
      return { ok: false, error: error.message }
    }

    await logAuditEvent({
      action: 'update',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'mis_vehicles',
      entityId: id,
      details: { aktion: 'km_aktualisiert', neuer_km: km },
    }).catch(() => {})

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unbekannter Fehler' }
  }
}

// ── Fahrzeug loeschen ──────────────────────────────────────────

export async function deleteVehicle(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireMISAdmin()

    const { error } = await supabase
      .from('mis_vehicles')
      .delete()
      .eq('id', id)

    if (error) {
      return { ok: false, error: error.message }
    }

    await logAuditEvent({
      action: 'delete',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'mis_vehicles',
      entityId: id,
      details: { aktion: 'fahrzeug_geloescht' },
    }).catch(() => {})

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unbekannter Fehler' }
  }
}
