'use server'

import { createClient } from '@/lib/supabase/server'
import { resolveUserOrgId } from '@/lib/organizations/server'
import { logAuditEvent } from '@/lib/audit-log'

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
// 1. Standort aktualisieren (GPS → profiles.location)
// ---------------------------------------------------------------------------
export async function updateEngelLocation(
  city: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    if (!city || typeof city !== 'string' || city.trim().length === 0) {
      return { ok: false, error: 'Ungueltige Stadt.' }
    }
    if (city.length > 200) {
      return { ok: false, error: 'Stadtname zu lang (max. 200 Zeichen).' }
    }

    const { supabase, userId, organizationId, role, name } = await requireEngel()

    const { error: dbError } = await supabase
      .from('profiles')
      .update({ location: city.trim() })
      .eq('id', userId)

    if (dbError) {
      return { ok: false, error: 'Standort konnte nicht aktualisiert werden.' }
    }

    logAuditEvent({
      action: 'update',
      actorId: userId,
      organizationId,
      actorRole: role,
      actorName: name,
      entityType: 'profile',
      entityId: userId,
      details: { field: 'location', value: city.trim() },
    }).catch(() => {})

    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unbekannter Fehler.'
    return { ok: false, error: message }
  }
}

// ---------------------------------------------------------------------------
// 2. Online-Status umschalten (angels.is_online)
// ---------------------------------------------------------------------------
export async function toggleEngelOnline(
  isOnline: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    if (typeof isOnline !== 'boolean') {
      return { ok: false, error: 'Ungueltiger Online-Status.' }
    }

    const { supabase, userId, organizationId, role, name } = await requireEngel()

    const { error: dbError } = await supabase
      .from('angels')
      .update({ is_online: isOnline })
      .eq('id', userId)

    if (dbError) {
      return { ok: false, error: 'Online-Status konnte nicht aktualisiert werden.' }
    }

    logAuditEvent({
      action: 'update',
      actorId: userId,
      organizationId,
      actorRole: role,
      actorName: name,
      entityType: 'angel',
      entityId: userId,
      details: { field: 'is_online', value: isOnline },
    }).catch(() => {})

    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unbekannter Fehler.'
    return { ok: false, error: message }
  }
}
