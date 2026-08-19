'use server'

import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/organizations/server'
import { logAuditEvent } from '@/lib/audit-log'

// ═══════════════════════════════════════════════════════════════
// Server-seitige Aktionen fuer Team (MIS)
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

// ── Aufgabe erstellen ─────────────────────────────────────────

export async function createTask(data: {
  title: string
  module: string
  priority: string
  description: string
  due_date: string | null
}): Promise<{ ok: true; data?: any } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireMISAdmin()

    const { data: inserted, error } = await supabase
      .from('mis_tasks')
      .insert({
        title: data.title,
        module: data.module,
        priority: data.priority,
        description: data.description,
        due_date: data.due_date || null,
        created_by: userId,
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
      entityType: 'task',
      entityId: inserted?.id,
      details: { aktion: 'aufgabe_erstellt', title: data.title, module: data.module },
    }).catch(() => {})

    return { ok: true, data: inserted }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unbekannter Fehler' }
  }
}

// ── Profil aktualisieren (nur sichere Felder) ─────────────────

export async function updateProfile(
  profileId: string,
  data: {
    first_name: string
    last_name: string
    email: string
    phone: string
    location: string
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireMISAdmin()

    const { error } = await supabase
      .from('profiles')
      .update({
        first_name: data.first_name,
        last_name: data.last_name,
        email: data.email,
        phone: data.phone,
        location: data.location,
      })
      .eq('id', profileId)

    if (error) return { ok: false, error: error.message }

    await logAuditEvent({
      action: 'update',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'profile',
      entityId: profileId,
      details: { aktion: 'profil_aktualisiert' },
    }).catch(() => {})

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unbekannter Fehler' }
  }
}
