'use server'

import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/organizations/server'
import { logAuditEvent } from '@/lib/audit-log'

// ═══════════════════════════════════════════════════════════════
// Server-seitige Aktionen für Bewerbungen
// Ersetzt client-seitige Supabase-Writes durch geprüfte Server Actions
// ═══════════════════════════════════════════════════════════════

async function requireAdmin() {
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

// ── Bewerbungsstatus ändern ──────────────────────────────────────

export async function updateApplicationStatus(
  applicationId: string,
  status: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireAdmin()

    if (!applicationId || typeof applicationId !== 'string') {
      return { ok: false, error: 'Ungueltige Bewerbungs-ID.' }
    }
    if (!status || typeof status !== 'string') {
      return { ok: false, error: 'Ungueltiger Status.' }
    }

    const { error: dbError } = await supabase
      .from('applications')
      .update({ status })
      .eq('id', applicationId)

    if (dbError) return { ok: false, error: `Status-Update fehlgeschlagen: ${dbError.message}` }

    await logAuditEvent({
      action: 'update',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'application',
      entityId: applicationId,
      details: { neuer_status: status },
    }).catch(() => {})

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err.message || 'Unerwarteter Fehler.' }
  }
}

// ── Neue Bewerbung anlegen ───────────────────────────────────────

interface NewApplicationPayload {
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  position: string | null
  source: string
  referred_by_caregiver_id: string | null
  notes: string | null
}

export async function createApplication(
  payload: NewApplicationPayload,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireAdmin()

    if (!payload.first_name?.trim() || !payload.last_name?.trim()) {
      return { ok: false, error: 'Vor- und Nachname sind Pflichtfelder.' }
    }

    const row = {
      first_name: payload.first_name.trim(),
      last_name: payload.last_name.trim(),
      email: payload.email,
      phone: payload.phone,
      position: payload.position,
      source: payload.source,
      referred_by_caregiver_id: payload.referred_by_caregiver_id,
      notes: payload.notes,
      status: 'new',
    }

    const { error: dbError } = await supabase.from('applications').insert(row)
    if (dbError) return { ok: false, error: `Anlegen fehlgeschlagen: ${dbError.message}` }

    await logAuditEvent({
      action: 'create',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'application',
      entityId: 'neu',
      details: { first_name: row.first_name, last_name: row.last_name, source: row.source },
    }).catch(() => {})

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err.message || 'Unerwarteter Fehler.' }
  }
}
