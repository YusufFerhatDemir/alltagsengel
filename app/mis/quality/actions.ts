'use server'

import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/organizations/server'
import { logAuditEvent } from '@/lib/audit-log'

// ═══════════════════════════════════════════════════════════════
// Server-seitige Aktionen fuer Qualitaetsmanagement (MIS)
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

// ── Qualitaets-Audit erstellen ────────────────────────────────

export async function createQualityAudit(data: {
  audit_number: string
  audit_type: string
  auditor_name: string
  scheduled_date: string | null
  notes: string
}): Promise<{ ok: true; data?: any } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireMISAdmin()

    const { data: inserted, error } = await supabase
      .from('mis_quality_audits')
      .insert({
        audit_number: data.audit_number,
        audit_type: data.audit_type,
        auditor_name: data.auditor_name,
        scheduled_date: data.scheduled_date || null,
        notes: data.notes,
      })
      .select()
      .single()

    if (error) return { ok: false, error: error.message }

    await logAuditEvent({
      action: 'create',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'quality_audit',
      entityId: inserted?.id,
      details: { aktion: 'qualitaets_audit_erstellt', audit_number: data.audit_number },
    }).catch(() => {})

    return { ok: true, data: inserted }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unbekannter Fehler' }
  }
}

// ── CAPA erstellen ────────────────────────────────────────────

export async function createCapa(data: {
  capa_number: string
  type: string
  title: string
  description: string
  priority: string
  due_date: string | null
}): Promise<{ ok: true; data?: any } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireMISAdmin()

    const { data: inserted, error } = await supabase
      .from('mis_capa')
      .insert({
        capa_number: data.capa_number,
        type: data.type,
        title: data.title,
        description: data.description,
        priority: data.priority,
        due_date: data.due_date || null,
      })
      .select()
      .single()

    if (error) return { ok: false, error: error.message }

    await logAuditEvent({
      action: 'create',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'capa',
      entityId: inserted?.id,
      details: { aktion: 'capa_erstellt', capa_number: data.capa_number, title: data.title },
    }).catch(() => {})

    return { ok: true, data: inserted }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unbekannter Fehler' }
  }
}
