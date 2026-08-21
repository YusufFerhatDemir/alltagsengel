'use server'

import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/organizations/server'
import { logAuditEventOrWarn } from '@/lib/audit-log'
import { logger } from '@/lib/logger'
const log = logger.child('mis:crm')

// ═══════════════════════════════════════════════════════════════
// Server-seitige Aktionen fuer MIS CRM
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

// ── Kunden-Pipeline-Status aktualisieren ───────────────────────

export async function updateClientPipeline(id: string, newStatus: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireMISAdmin()

    const now = new Date().toISOString()

    const { error: updateErr } = await supabase
      .from('clients')
      .update({ pipeline_status: newStatus, updated_at: now })
      .eq('id', id)

    if (updateErr) return { ok: false, error: updateErr.message }

    // Status-Label fuer die Aktivitaet
    const statusLabels: Record<string, string> = {
      new: 'Neu',
      contact: 'Kontaktiert',
      consultation: 'Beratung',
      trial: 'Probeeinsatz',
      active: 'Aktiv',
      paused: 'Pausiert',
      churned: 'Abgesprungen',
    }
    const label = statusLabels[newStatus] || newStatus

    const { error: activityErr } = await supabase
      .from('mis_crm_activities')
      .insert({
        client_id: id,
        activity_type: 'status_change',
        title: `Status → ${label}`,
        performed_by: 'System',
        organization_id: organizationId,
      })

    if (activityErr) {
      // Aktivitaet ist sekundaer — Pipeline-Update war erfolgreich
      log.error('Aktivitaet konnte nicht erstellt werden', { errorMessage: activityErr.message })
    }

    await logAuditEventOrWarn({
      action: 'update',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'clients',
      entityId: id,
      details: { aktion: 'pipeline_status_aktualisiert', neuer_status: newStatus },
    })

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unbekannter Fehler' }
  }
}

// ── Lead-Status aktualisieren ──────────────────────────────────

export async function updateLeadStatus(id: string, newStatus: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireMISAdmin()

    const now = new Date().toISOString()

    const { error } = await supabase
      .from('lead_inquiries')
      .update({ status: newStatus, updated_at: now })
      .eq('id', id)

    if (error) return { ok: false, error: error.message }

    await logAuditEventOrWarn({
      action: 'update',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'lead_inquiries',
      entityId: id,
      details: { aktion: 'lead_status_aktualisiert', neuer_status: newStatus },
    })

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unbekannter Fehler' }
  }
}

// ── Neuen Lead erstellen ───────────────────────────────────────

export async function createLead(data: {
  name: string
  phone: string
  plz: string
  message: string
  source: string
  service: string
}): Promise<{ ok: true; data?: any } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name: actorName } = await requireMISAdmin()

    const row = {
      name: data.name,
      phone: data.phone,
      plz: data.plz,
      message: data.message,
      source: data.source,
      service: data.service,
      status: 'new',
      organization_id: organizationId,
    }

    const { data: inserted, error } = await supabase
      .from('lead_inquiries')
      .insert(row)
      .select()
      .single()

    if (error) return { ok: false, error: error.message }

    await logAuditEventOrWarn({
      action: 'create',
      actorId: userId,
      actorRole: role,
      actorName: actorName,
      organizationId,
      entityType: 'lead_inquiries',
      entityId: inserted?.id ?? 'unknown',
      details: { aktion: 'lead_erstellt', name: data.name, source: data.source },
    })

    return { ok: true, data: inserted }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unbekannter Fehler' }
  }
}

// ── Kooperationspartner erstellen ──────────────────────────────

export async function createPartner(data: {
  name: string
  type: string
  city: string
  phone: string
  email: string
  contact_person: string
}): Promise<{ ok: true; data?: any } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name: actorName } = await requireMISAdmin()

    const row = {
      name: data.name,
      type: data.type,
      city: data.city,
      phone: data.phone,
      email: data.email,
      contact_person: data.contact_person,
      status: 'active',
      organization_id: organizationId,
    }

    const { data: inserted, error } = await supabase
      .from('cooperation_partners')
      .insert(row)
      .select()
      .single()

    if (error) return { ok: false, error: error.message }

    await logAuditEventOrWarn({
      action: 'create',
      actorId: userId,
      actorRole: role,
      actorName: actorName,
      organizationId,
      entityType: 'cooperation_partners',
      entityId: inserted?.id ?? 'unknown',
      details: { aktion: 'partner_erstellt', name: data.name, type: data.type },
    })

    return { ok: true, data: inserted }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unbekannter Fehler' }
  }
}

// ── CRM-Aktivitaet erstellen ───────────────────────────────────

export async function createActivity(data: {
  activity_type: string
  title: string
  description: string
  performed_by: string
  client_id?: string
  lead_id?: string
}): Promise<{ ok: true; data?: any } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name: actorName } = await requireMISAdmin()

    const row: Record<string, any> = {
      activity_type: data.activity_type,
      title: data.title,
      description: data.description,
      performed_by: data.performed_by,
      organization_id: organizationId,
    }

    if (data.client_id) row.client_id = data.client_id
    if (data.lead_id) row.lead_id = data.lead_id

    const { data: inserted, error } = await supabase
      .from('mis_crm_activities')
      .insert(row)
      .select()
      .single()

    if (error) return { ok: false, error: error.message }

    await logAuditEventOrWarn({
      action: 'create',
      actorId: userId,
      actorRole: role,
      actorName: actorName,
      organizationId,
      entityType: 'mis_crm_activities',
      entityId: inserted?.id ?? 'unknown',
      details: { aktion: 'aktivitaet_erstellt', title: data.title, activity_type: data.activity_type },
    })

    return { ok: true, data: inserted }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unbekannter Fehler' }
  }
}
