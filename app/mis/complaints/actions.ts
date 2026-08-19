'use server'

import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/organizations/server'
import { logAuditEventOrWarn } from '@/lib/audit-log'

// ═══════════════════════════════════════════════════════════════
// Server-seitige Aktionen fuer Beschwerdemanagement
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

// ── Beschwerde anlegen ─────────────────────────────────────────

export async function createComplaint(data: {
  title: string
  description: string
  category: string
  priority: string
  customer_name: string
  angel_name: string
  reported_by: string
  assigned_to: string
  incident_date: string
  due_date: string
  notes: string
}): Promise<{ ok: true; data?: any } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireMISAdmin()

    const row = {
      title: data.title,
      description: data.description,
      category: data.category,
      priority: data.priority,
      customer_name: data.customer_name || null,
      angel_name: data.angel_name || null,
      reported_by: data.reported_by || null,
      assigned_to: data.assigned_to || null,
      incident_date: data.incident_date || null,
      due_date: data.due_date || null,
      notes: data.notes || null,
      organization_id: organizationId,
      created_by: userId,
    }

    const { data: inserted, error } = await supabase
      .from('mis_complaints')
      .insert(row)
      .select()
      .single()

    if (error) {
      return { ok: false, error: error.message }
    }

    await logAuditEventOrWarn({
      action: 'create',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'mis_complaints',
      entityId: inserted.id,
      details: { aktion: 'beschwerde_angelegt', title: data.title },
    })

    return { ok: true, data: inserted }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unbekannter Fehler' }
  }
}

// ── Beschwerdestatus aendern ───────────────────────────────────

export async function updateComplaintStatus(
  id: string,
  newStatus: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireMISAdmin()

    const now = new Date().toISOString()
    const updateData: Record<string, any> = {
      status: newStatus,
      updated_at: now,
    }

    if (newStatus === 'geloest') {
      updateData.resolved_date = now
    }
    if (newStatus === 'geschlossen') {
      updateData.closed_date = now
    }

    const { error } = await supabase
      .from('mis_complaints')
      .update(updateData)
      .eq('id', id)

    if (error) {
      return { ok: false, error: error.message }
    }

    await logAuditEventOrWarn({
      action: 'update',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'mis_complaints',
      entityId: id,
      details: { aktion: 'status_geaendert', neuer_status: newStatus },
    })

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unbekannter Fehler' }
  }
}

// ── CAPA-Daten speichern ───────────────────────────────────────

export async function saveComplaintCapa(
  id: string,
  data: {
    root_cause: string
    corrective_action: string
    preventive_action: string
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireMISAdmin()

    const now = new Date().toISOString()
    const { error } = await supabase
      .from('mis_complaints')
      .update({
        root_cause: data.root_cause,
        corrective_action: data.corrective_action,
        preventive_action: data.preventive_action,
        updated_at: now,
      })
      .eq('id', id)

    if (error) {
      return { ok: false, error: error.message }
    }

    await logAuditEventOrWarn({
      action: 'update',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'mis_complaints',
      entityId: id,
      details: { aktion: 'capa_gespeichert' },
    })

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unbekannter Fehler' }
  }
}

// ── Beschwerde loeschen ────────────────────────────────────────

export async function deleteComplaint(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireMISAdmin()

    const { error } = await supabase
      .from('mis_complaints')
      .delete()
      .eq('id', id)

    if (error) {
      return { ok: false, error: error.message }
    }

    await logAuditEventOrWarn({
      action: 'delete',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'mis_complaints',
      entityId: id,
      details: { aktion: 'beschwerde_geloescht' },
    })

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unbekannter Fehler' }
  }
}
