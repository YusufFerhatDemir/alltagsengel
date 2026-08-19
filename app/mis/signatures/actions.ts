'use server'

import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/organizations/server'
import { logAuditEventOrWarn } from '@/lib/audit-log'

// ═══════════════════════════════════════════════════════════════
// Server-seitige Aktionen fuer Unterschriftenverwaltung
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

// ── Unterschriftsanfrage anlegen ───────────────────────────────

export async function createSignatureRequest(data: {
  document_title: string
  document_type: string
  signer_name: string
  signer_email: string
  expires_at: string
  notes: string
}): Promise<{ ok: true; data?: any } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireMISAdmin()

    const row = {
      document_title: data.document_title,
      document_type: data.document_type,
      signer_name: data.signer_name,
      signer_email: data.signer_email || null,
      expires_at: data.expires_at || null,
      notes: data.notes || null,
      status: 'pending',
      organization_id: organizationId,
      created_by: userId,
    }

    const { data: inserted, error } = await supabase
      .from('mis_signature_requests')
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
      entityType: 'mis_signature_requests',
      entityId: inserted.id,
      details: { aktion: 'unterschrift_angefordert', document_title: data.document_title },
    })

    return { ok: true, data: inserted }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unbekannter Fehler' }
  }
}

// ── Unterschriftsanfrage-Status aendern ────────────────────────

export async function updateSignatureRequestStatus(
  id: string,
  status: string,
  extras?: Record<string, unknown>
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireMISAdmin()

    const now = new Date().toISOString()
    const updateData: Record<string, any> = {
      status,
      updated_at: now,
      ...(extras || {}),
    }

    if (status === 'sent') {
      updateData.sent_at = now
    }
    if (status === 'signed') {
      updateData.signed_at = now
    }

    const { error } = await supabase
      .from('mis_signature_requests')
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
      entityType: 'mis_signature_requests',
      entityId: id,
      details: { aktion: 'status_geaendert', neuer_status: status },
    })

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unbekannter Fehler' }
  }
}

// ── Unterschriftsanfrage loeschen ──────────────────────────────

export async function deleteSignatureRequest(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireMISAdmin()

    const { error } = await supabase
      .from('mis_signature_requests')
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
      entityType: 'mis_signature_requests',
      entityId: id,
      details: { aktion: 'unterschrift_anfrage_geloescht' },
    })

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unbekannter Fehler' }
  }
}
