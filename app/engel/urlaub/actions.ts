'use server'

import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/organizations/server'
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

  const organizationId = await getActiveOrgId()
  const name = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || 'Engel'
  return { supabase, userId: user.id, organizationId, role: profile.role, name }
}

// ---------------------------------------------------------------------------
// Abwesenheit beantragen
// ---------------------------------------------------------------------------
export async function requestAbsence(data: {
  absenceType: string
  startDate: string
  endDate: string
  halberTag: boolean
  reason: string | null
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { absenceType, startDate, endDate, halberTag, reason } = data

    if (!absenceType || typeof absenceType !== 'string') {
      return { ok: false, error: 'Bitte eine Abwesenheitsart auswaehlen.' }
    }
    if (!startDate || typeof startDate !== 'string') {
      return { ok: false, error: 'Bitte ein Startdatum angeben.' }
    }
    if (!endDate || typeof endDate !== 'string') {
      return { ok: false, error: 'Bitte ein Enddatum angeben.' }
    }
    if (endDate < startDate) {
      return { ok: false, error: 'Das Enddatum muss nach dem Startdatum liegen.' }
    }

    const { supabase, userId, organizationId, role, name } = await requireEngel()

    // Caregiver-ID ueber RPC ermitteln (RLS laesst direkten Join nicht zu)
    const { data: cgIds, error: cgErr } = await supabase.rpc('eigene_caregiver_ids')
    if (cgErr) {
      return { ok: false, error: 'Engel-Profil konnte nicht ermittelt werden.' }
    }
    const caregiverId = cgIds?.[0] ?? null
    if (!caregiverId) {
      return { ok: false, error: 'Kein Engel-Profil gefunden.' }
    }

    const { data: inserted, error: insertErr } = await supabase
      .from('absences')
      .insert({
        caregiver_id: caregiverId,
        absence_type: absenceType,
        start_date: startDate,
        end_date: endDate,
        halber_tag: halberTag,
        reason: reason || null,
        status: 'beantragt',
      })
      .select('id')
      .single()

    if (insertErr) {
      return { ok: false, error: 'Abwesenheit konnte nicht beantragt werden.' }
    }

    logAuditEvent({
      action: 'create',
      actorId: userId,
      organizationId,
      actorRole: role,
      actorName: name,
      entityType: 'absence',
      entityId: inserted?.id ?? null,
      details: { absenceType, startDate, endDate, halberTag, reason },
    }).catch(() => {})

    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unbekannter Fehler.'
    return { ok: false, error: message }
  }
}
