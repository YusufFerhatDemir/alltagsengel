'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getActiveOrgId } from '@/lib/organizations/server'
import { logAuditEvent } from '@/lib/audit-log'

// ═══════════════════════════════════════════════════════════════
// Server-seitige Aktionen fuer Datenschutz (MIS)
// Ersetzt client-seitige Supabase-Writes durch gepruefte Server Actions
// Schreibt in BEIDE Audit-Logs:
//   (a) mis_privacy_audit_log — datenschutzspezifisches Protokoll
//   (b) mis_audit_log via logAuditEvent — systemweites Audit-Log
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

/** Schreibt in das datenschutzspezifische Audit-Log (mis_privacy_audit_log). */
async function logPrivacyAudit(opts: {
  organizationId: string
  action: string
  entityType: string
  entityId?: string | null
  performedBy: string
  details?: Record<string, unknown>
}) {
  try {
    const admin = createAdminClient()
    await admin.from('mis_privacy_audit_log').insert({
      organization_id: opts.organizationId,
      action: opts.action,
      entity_type: opts.entityType,
      entity_id: opts.entityId ?? null,
      performed_by: opts.performedBy,
      details: opts.details ?? {},
    })
  } catch {
    // fail-soft — kein Blockieren der Hauptaktion
  }
}

// ── Verarbeitungstaetigkeit erstellen ──────────────────────────

export async function createPrivacyRecord(data: {
  title: string
  purpose: string
  legal_basis: string
  data_categories: string
  affected_persons: string
  recipients: string
  retention_period: string
  toms: string
  responsible_person: string
  notes: string
}): Promise<{ ok: true; data?: any } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireMISAdmin()

    const { data: inserted, error } = await supabase
      .from('mis_privacy_records')
      .insert({
        title: data.title,
        purpose: data.purpose,
        legal_basis: data.legal_basis,
        data_categories: data.data_categories.split(',').map(s => s.trim()).filter(Boolean),
        affected_persons: data.affected_persons.split(',').map(s => s.trim()).filter(Boolean),
        recipients: data.recipients.split(',').map(s => s.trim()).filter(Boolean),
        retention_period: data.retention_period,
        toms: data.toms,
        responsible_person: data.responsible_person,
        notes: data.notes,
        status: 'active',
        organization_id: organizationId,
        created_by: userId,
      })
      .select()
      .single()

    if (error) return { ok: false, error: error.message }

    await logPrivacyAudit({
      organizationId,
      action: 'erstellt',
      entityType: 'verarbeitungstaetigkeit',
      entityId: inserted?.id,
      performedBy: name,
      details: { title: data.title },
    })

    await logAuditEvent({
      action: 'create',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'privacy_record',
      entityId: inserted?.id,
      details: { aktion: 'verarbeitungstaetigkeit_erstellt', title: data.title },
    }).catch(() => {})

    return { ok: true, data: inserted }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unbekannter Fehler' }
  }
}

// ── Verarbeitungstaetigkeit loeschen ───────────────────────────

export async function deletePrivacyRecord(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireMISAdmin()

    const { error } = await supabase
      .from('mis_privacy_records')
      .delete()
      .eq('id', id)

    if (error) return { ok: false, error: error.message }

    await logPrivacyAudit({
      organizationId,
      action: 'geloescht',
      entityType: 'verarbeitungstaetigkeit',
      entityId: id,
      performedBy: name,
    })

    await logAuditEvent({
      action: 'delete',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'privacy_record',
      entityId: id,
      details: { aktion: 'verarbeitungstaetigkeit_geloescht' },
    }).catch(() => {})

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unbekannter Fehler' }
  }
}

// ── Einwilligung erstellen ─────────────────────────────────────

export async function createPrivacyConsent(data: {
  person_name: string
  person_type: string
  consent_type: string
  channel: string
  notes: string
}): Promise<{ ok: true; data?: any } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireMISAdmin()

    const { data: inserted, error } = await supabase
      .from('mis_privacy_consents')
      .insert({
        person_name: data.person_name,
        person_type: data.person_type,
        consent_type: data.consent_type,
        channel: data.channel,
        notes: data.notes,
        status: 'erteilt',
        organization_id: organizationId,
        created_by: userId,
      })
      .select()
      .single()

    if (error) return { ok: false, error: error.message }

    await logPrivacyAudit({
      organizationId,
      action: 'einwilligung_erteilt',
      entityType: 'einwilligung',
      entityId: inserted?.id,
      performedBy: name,
      details: { person_name: data.person_name, consent_type: data.consent_type },
    })

    await logAuditEvent({
      action: 'create',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'privacy_consent',
      entityId: inserted?.id,
      details: { aktion: 'einwilligung_erteilt', person_name: data.person_name },
    }).catch(() => {})

    return { ok: true, data: inserted }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unbekannter Fehler' }
  }
}

// ── Einwilligung widerrufen ────────────────────────────────────

export async function revokePrivacyConsent(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireMISAdmin()

    const { error } = await supabase
      .from('mis_privacy_consents')
      .update({
        status: 'widerrufen',
        revoked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    if (error) return { ok: false, error: error.message }

    await logPrivacyAudit({
      organizationId,
      action: 'einwilligung_widerrufen',
      entityType: 'einwilligung',
      entityId: id,
      performedBy: name,
    })

    await logAuditEvent({
      action: 'update',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'privacy_consent',
      entityId: id,
      details: { aktion: 'einwilligung_widerrufen' },
    }).catch(() => {})

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unbekannter Fehler' }
  }
}

// ── Betroffenenanfrage erstellen ───────────────────────────────

export async function createPrivacyRequest(data: {
  requester_name: string
  request_type: string
  description: string
  assigned_to: string
}): Promise<{ ok: true; data?: any } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireMISAdmin()

    const dueDate = new Date()
    dueDate.setDate(dueDate.getDate() + 30)

    const { data: inserted, error } = await supabase
      .from('mis_privacy_requests')
      .insert({
        requester_name: data.requester_name,
        request_type: data.request_type,
        description: data.description,
        assigned_to: data.assigned_to,
        status: 'offen',
        due_date: dueDate.toISOString(),
        organization_id: organizationId,
        created_by: userId,
      })
      .select()
      .single()

    if (error) return { ok: false, error: error.message }

    await logPrivacyAudit({
      organizationId,
      action: 'anfrage_erstellt',
      entityType: 'betroffenenanfrage',
      entityId: inserted?.id,
      performedBy: name,
      details: { requester_name: data.requester_name, request_type: data.request_type },
    })

    await logAuditEvent({
      action: 'create',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'privacy_request',
      entityId: inserted?.id,
      details: { aktion: 'anfrage_erstellt', request_type: data.request_type },
    }).catch(() => {})

    return { ok: true, data: inserted }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unbekannter Fehler' }
  }
}

// ── Betroffenenanfrage-Status aktualisieren ────────────────────

export async function updatePrivacyRequestStatus(
  id: string,
  status: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireMISAdmin()

    const updateData: Record<string, any> = {
      status,
      updated_at: new Date().toISOString(),
    }

    if (status === 'abgeschlossen') {
      updateData.completed_at = new Date().toISOString()
    }

    const { error } = await supabase
      .from('mis_privacy_requests')
      .update(updateData)
      .eq('id', id)

    if (error) return { ok: false, error: error.message }

    await logPrivacyAudit({
      organizationId,
      action: 'status_geaendert',
      entityType: 'betroffenenanfrage',
      entityId: id,
      performedBy: name,
      details: { neuer_status: status },
    })

    await logAuditEvent({
      action: 'update',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'privacy_request',
      entityId: id,
      details: { aktion: 'anfrage_status_geaendert', neuer_status: status },
    }).catch(() => {})

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unbekannter Fehler' }
  }
}
