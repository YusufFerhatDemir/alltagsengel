'use server'

import { createClient } from '@/lib/supabase/server'
import { resolveUserOrgId } from '@/lib/organizations/server'
import { logAuditEventOrWarn } from '@/lib/audit-log'

// ═══════════════════════════════════════════════════════════════
// Server-seitige Aktionen fuer die Kunden-Startseite
// Ersetzt client-seitige Supabase-Writes durch gepruefte Server Actions
// ═══════════════════════════════════════════════════════════════

async function requireKunde() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new Error('Nicht autorisiert.')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, first_name, last_name')
    .eq('id', user.id)
    .single()

  if (!profile || !['kunde', 'client', 'admin', 'superadmin'].includes(profile.role)) {
    throw new Error('Nur fuer Kunden.')
  }

  // Org des Nutzers aus Mitgliedschaft/caregivers/clients (Audit MITTEL-1:
  // fail-closed statt stillem Rueckfall auf die Stamm-Org).
  const organizationId = await resolveUserOrgId()
  const name = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || 'Kunde'
  return { supabase, userId: user.id, organizationId, role: profile.role, name }
}

// ── Standort im Profil aktualisieren ────────────────────────────

export async function updateLocationAction(
  input: { location: string }
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireKunde()

    const location = input.location?.trim()
    if (!location) {
      return { ok: false, error: 'Standort darf nicht leer sein.' }
    }

    const { error: dbError } = await supabase
      .from('profiles')
      .update({ location })
      .eq('id', userId)

    if (dbError) {
      return { ok: false, error: dbError.message }
    }

    await logAuditEventOrWarn({
      action: 'update',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'profiles',
      entityId: userId,
      details: { field: 'location' },
    })

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unbekannter Fehler' }
  }
}
