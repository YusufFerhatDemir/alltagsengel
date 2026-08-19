'use server'

import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/organizations/server'
import { logAuditEventOrWarn } from '@/lib/audit-log'

// ═══════════════════════════════════════════════════════════════
// Server-seitige Aktionen fuer Leistungsnachweis-Upload / Pruefzentrale
// Ersetzt client-seitige Supabase-Writes durch gepruefe Server Actions
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

// ── Entwurfs-Leistungsnachweis anlegen ──

export async function createDraftServiceRecordAction(input: {
  client_id: string
  date: string
  service_type: string
}): Promise<
  | { ok: true; data: { id: string; date: string; start_time: string | null; end_time: string | null; amount: number | null; status: string } }
  | { ok: false; error: string }
> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireAdmin()

    if (!input.client_id || typeof input.client_id !== 'string') {
      return { ok: false, error: 'Klient-ID fehlt.' }
    }
    if (!input.date) {
      return { ok: false, error: 'Datum fehlt.' }
    }
    if (!input.service_type?.trim()) {
      return { ok: false, error: 'Leistungsart fehlt.' }
    }

    const { data, error } = await supabase
      .from('service_records')
      .insert({
        client_id: input.client_id,
        date: input.date,
        service_type: input.service_type,
        status: 'draft',
      })
      .select('id, date, start_time, end_time, amount, status')
      .single()

    if (error || !data) {
      return { ok: false, error: `Fehler beim Anlegen: ${error?.message || 'Unbekannter Fehler'}` }
    }

    // Audit-Log (fail-soft)
    await logAuditEventOrWarn({
      action: 'create',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'service_record',
      entityId: data.id,
      details: {
        client_id: input.client_id,
        date: input.date,
        service_type: input.service_type,
        status: 'draft',
        source: 'leistungsnachweis-upload',
      },
    })

    return { ok: true, data }
  } catch (err: any) {
    return { ok: false, error: err.message || 'Unerwarteter Fehler.' }
  }
}
