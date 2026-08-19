'use server'

import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/organizations/server'
import { logAuditEvent } from '@/lib/audit-log'

// ═══════════════════════════════════════════════════════════════
// Server-seitige Aktionen fuer Vertragsverwaltung
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

// ── Vertrag anlegen ────────────────────────────────────────────

export async function createContract(data: {
  title: string
  partner: string
  type: string
  status: string
  start_date: string
  end_date: string
  value: string
  auto_renew: boolean
  notice_period_days: string
  notes: string
}): Promise<{ ok: true; data?: any } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireMISAdmin()

    const row = {
      title: data.title,
      partner: data.partner,
      type: data.type,
      status: data.status,
      start_date: data.start_date || null,
      end_date: data.end_date || null,
      value: parseFloat(data.value) || null,
      auto_renew: data.auto_renew,
      notice_period_days: parseInt(data.notice_period_days, 10) || null,
      notes: data.notes || null,
      organization_id: organizationId,
      created_by: userId,
    }

    const { data: inserted, error } = await supabase
      .from('mis_contracts')
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
      entityType: 'mis_contracts',
      entityId: inserted.id,
      details: { aktion: 'vertrag_angelegt', title: data.title },
    }).catch(() => {})

    return { ok: true, data: inserted }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unbekannter Fehler' }
  }
}

// ── Vertragsstatus aendern ─────────────────────────────────────

export async function updateContractStatus(
  id: string,
  newStatus: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireMISAdmin()

    const now = new Date().toISOString()
    const { error } = await supabase
      .from('mis_contracts')
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
      entityType: 'mis_contracts',
      entityId: id,
      details: { aktion: 'status_geaendert', neuer_status: newStatus },
    }).catch(() => {})

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unbekannter Fehler' }
  }
}

// ── Vertrag loeschen ───────────────────────────────────────────

export async function deleteContract(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireMISAdmin()

    const { error } = await supabase
      .from('mis_contracts')
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
      entityType: 'mis_contracts',
      entityId: id,
      details: { aktion: 'vertrag_geloescht' },
    }).catch(() => {})

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unbekannter Fehler' }
  }
}
