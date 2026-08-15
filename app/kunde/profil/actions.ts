'use server'

import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/organizations/server'
import { logAuditEvent } from '@/lib/audit-log'

// ═══════════════════════════════════════════════════════════════
// Server-seitige Aktionen fuer das Kundenprofil
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

  const organizationId = await getActiveOrgId()
  const name = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || 'Kunde'
  return { supabase, userId: user.id, organizationId, role: profile.role, name }
}

// ── PLZ im Profil speichern ─────────────────────────────────────

export async function savePlzAction(
  input: { plz: string }
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireKunde()

    if (!input.plz || !/^\d{5}$/.test(input.plz)) {
      return { ok: false, error: 'Bitte eine gueltige 5-stellige PLZ eingeben.' }
    }

    const { error: dbError } = await supabase
      .from('profiles')
      .update({ postal_code: input.plz })
      .eq('id', userId)

    if (dbError) {
      return { ok: false, error: dbError.message }
    }

    logAuditEvent({
      action: 'update',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'profiles',
      entityId: userId,
      details: { field: 'postal_code' },
    }).catch(() => {})

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unbekannter Fehler' }
  }
}
