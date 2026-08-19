'use server'

import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/organizations/server'
import { logAuditEventOrWarn } from '@/lib/audit-log'
import { saveServiceRecord, type ServiceRecordInput } from '@/lib/admin/service-records'

// ═══════════════════════════════════════════════════════════════
// Server-seitige Aktionen fuer Leistungsnachweis-Neuanlage
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

// ── Leistungsnachweis anlegen ──

export async function createServiceRecordAction(input: {
  client_id: string
  caregiver_id: string
  date: string
  start_time: string
  end_time: string
  service_type: string
  budget_type: string
  caregiver_initials: string
  amount: number | null
  notes: string | null
  client_signature: string | null
  status: string
  completeness_check: Record<string, unknown> | null
  gps?: { lat: number; lng: number } | null
}): Promise<{ ok: true; id: string | null } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireAdmin()

    // Validierung
    if (!input.client_id || typeof input.client_id !== 'string') {
      return { ok: false, error: 'Klient-ID fehlt.' }
    }
    if (!input.caregiver_id || typeof input.caregiver_id !== 'string') {
      return { ok: false, error: 'Betreuungskraft-ID fehlt.' }
    }
    if (!input.date) return { ok: false, error: 'Datum fehlt.' }
    if (!input.start_time || !input.end_time) {
      return { ok: false, error: 'Uhrzeiten fehlen.' }
    }
    if (!input.service_type) return { ok: false, error: 'Leistungsart fehlt.' }
    if (!input.caregiver_initials?.trim()) {
      return { ok: false, error: 'Handzeichen fehlt.' }
    }

    const recordInput: ServiceRecordInput = {
      client_id: input.client_id,
      caregiver_id: input.caregiver_id,
      date: input.date,
      start_time: input.start_time,
      end_time: input.end_time,
      service_type: input.service_type,
      budget_type: input.budget_type,
      caregiver_initials: input.caregiver_initials.trim(),
      amount: input.amount,
      notes: input.notes,
      client_signature: input.client_signature,
      status: input.status,
      completeness_check: input.completeness_check,
    }

    const { id, error: insErr } = await saveServiceRecord(supabase, recordInput)

    if (insErr) {
      return { ok: false, error: `Fehler beim Speichern: ${insErr}` }
    }

    // GPS nachtragen, falls erfasst — nicht Teil des Pflicht-Inserts.
    if (id && input.gps) {
      await supabase
        .from('service_records')
        .update({ gps_lat: input.gps.lat, gps_lng: input.gps.lng })
        .eq('id', id)
    }

    // Audit-Log (fail-soft)
    await logAuditEventOrWarn({
      action: 'create',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'service_record',
      entityId: id ?? undefined,
      details: {
        client_id: input.client_id,
        caregiver_id: input.caregiver_id,
        date: input.date,
        service_type: input.service_type,
        budget_type: input.budget_type,
        status: input.status,
      },
    })

    return { ok: true, id }
  } catch (err: any) {
    return { ok: false, error: err.message || 'Unerwarteter Fehler.' }
  }
}
