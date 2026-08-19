'use server'

import { createClient } from '@/lib/supabase/server'
import { resolveUserOrgId } from '@/lib/organizations/server'
import { logAuditEvent } from '@/lib/audit-log'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const VALID_STATUSES = ['offen', 'in_bearbeitung', 'warten', 'erledigt', 'storniert'] as const

async function requireEngel() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new Error('Nicht autorisiert.')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, first_name, last_name')
    .eq('id', user.id)
    .single()

  if (!profile || !['engel', 'caregiver', 'admin', 'superadmin'].includes(profile.role)) {
    throw new Error('Nur fuer Engel.')
  }

  // Org des Nutzers aus Mitgliedschaft/caregivers/clients (Audit MITTEL-1:
  // fail-closed statt stillem Rueckfall auf die Stamm-Org).
  const organizationId = await resolveUserOrgId()
  const name = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || 'Engel'
  return { supabase, userId: user.id, organizationId, role: profile.role, name }
}

// ---------------------------------------------------------------------------
// Aufgaben-Status aktualisieren
// ---------------------------------------------------------------------------
export async function updateTaskStatus(
  taskId: string,
  newStatus: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    if (!taskId || typeof taskId !== 'string' || !UUID_RE.test(taskId)) {
      return { ok: false, error: 'Ungueltige Aufgaben-ID.' }
    }

    if (!newStatus || !VALID_STATUSES.includes(newStatus as typeof VALID_STATUSES[number])) {
      return { ok: false, error: 'Ungueltiger Status.' }
    }

    const { supabase, userId, organizationId, role, name } = await requireEngel()

    const updates: Record<string, unknown> = { status: newStatus }
    if (newStatus === 'erledigt') {
      updates.erledigt_am = new Date().toISOString()
      updates.erledigt_von = userId
    }

    const { error: dbError } = await supabase
      .from('ops_aufgaben')
      .update(updates)
      .eq('id', taskId)

    if (dbError) {
      return { ok: false, error: 'Status konnte nicht aktualisiert werden.' }
    }

    logAuditEvent({
      action: 'update',
      actorId: userId,
      organizationId,
      actorRole: role,
      actorName: name,
      entityType: 'ops_aufgaben',
      entityId: taskId,
      details: { field: 'status', value: newStatus },
    }).catch(() => {})

    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unbekannter Fehler.'
    return { ok: false, error: message }
  }
}
