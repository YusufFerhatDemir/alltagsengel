'use server'

import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/organizations/server'
import { logAuditEvent } from '@/lib/audit-log'

// ═══════════════════════════════════════════════════════════════
// Server-seitige Aktionen fuer Krankenfahrten (MIS)
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

// ── Krankenfahrt aktualisieren ────────────────────────────────

export async function updateKrankenfahrt(
  id: string,
  updates: Record<string, any>
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    if (!id) return { ok: false, error: 'Keine ID angegeben.' }

    const { supabase, userId, organizationId, role, name } = await requireMISAdmin()

    const { error } = await supabase
      .from('krankenfahrten')
      .update(updates)
      .eq('id', id)

    if (error) return { ok: false, error: error.message }

    await logAuditEvent({
      action: 'update',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'krankenfahrt',
      entityId: id,
      details: { aktion: 'krankenfahrt_aktualisiert', felder: Object.keys(updates) },
    }).catch(() => {})

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unbekannter Fehler' }
  }
}

// ── Krankenfahrt-Anbieter aktualisieren ───────────────────────

export async function updateKrankenfahrtProvider(
  id: string,
  updates: Record<string, any>
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    if (!id) return { ok: false, error: 'Keine ID angegeben.' }

    const { supabase, userId, organizationId, role, name } = await requireMISAdmin()

    const { error } = await supabase
      .from('krankenfahrt_providers')
      .update(updates)
      .eq('id', id)

    if (error) return { ok: false, error: error.message }

    await logAuditEvent({
      action: 'update',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'krankenfahrt_provider',
      entityId: id,
      details: { aktion: 'anbieter_aktualisiert', felder: Object.keys(updates) },
    }).catch(() => {})

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unbekannter Fehler' }
  }
}
