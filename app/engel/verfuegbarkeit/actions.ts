'use server'

import { createClient } from '@/lib/supabase/server'
import { resolveUserOrgId } from '@/lib/organizations/server'
import { logAuditEvent } from '@/lib/audit-log'

type Slot = { id: string; weekday: number; start_time: string; end_time: string }

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
// 1. Einzelnes Zeitfenster hinzufuegen
// ---------------------------------------------------------------------------
export async function addAvailabilitySlot(
  weekday: number,
  startTime: string,
  endTime: string,
): Promise<{ ok: true; data: Slot } | { ok: false; error: string }> {
  try {
    if (typeof weekday !== 'number' || weekday < 0 || weekday > 6) {
      return { ok: false, error: 'Ungueltiger Wochentag.' }
    }
    if (!startTime || typeof startTime !== 'string' || !/^\d{2}:\d{2}$/.test(startTime)) {
      return { ok: false, error: 'Ungueltige Startzeit.' }
    }
    if (!endTime || typeof endTime !== 'string' || !/^\d{2}:\d{2}$/.test(endTime)) {
      return { ok: false, error: 'Ungueltige Endzeit.' }
    }

    const { supabase, userId, organizationId, role, name } = await requireEngel()

    const { data, error: dbError } = await supabase
      .from('angel_availability')
      .insert({ angel_id: userId, weekday, start_time: startTime, end_time: endTime })
      .select('id, weekday, start_time, end_time')
      .single()

    if (dbError) {
      return { ok: false, error: 'Das Zeitfenster konnte nicht gespeichert werden.' }
    }

    logAuditEvent({
      action: 'create',
      actorId: userId,
      organizationId,
      actorRole: role,
      actorName: name,
      entityType: 'angel_availability',
      entityId: (data as Slot).id,
      details: { weekday, startTime, endTime },
    }).catch(() => {})

    return { ok: true, data: data as Slot }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unbekannter Fehler.'
    return { ok: false, error: message }
  }
}

// ---------------------------------------------------------------------------
// 2. Einzelnes Zeitfenster loeschen
// ---------------------------------------------------------------------------
export async function deleteAvailabilitySlot(
  slotId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    if (!slotId || typeof slotId !== 'string') {
      return { ok: false, error: 'Ungueltige Slot-ID.' }
    }

    const { supabase, userId, organizationId, role, name } = await requireEngel()

    // Verify the slot belongs to the authenticated user
    const { data: existing, error: fetchError } = await supabase
      .from('angel_availability')
      .select('id, angel_id')
      .eq('id', slotId)
      .single()

    if (fetchError || !existing) {
      return { ok: false, error: 'Zeitfenster nicht gefunden.' }
    }
    if (existing.angel_id !== userId) {
      return { ok: false, error: 'Zugriff verweigert.' }
    }

    const { error: dbError } = await supabase
      .from('angel_availability')
      .delete()
      .eq('id', slotId)

    if (dbError) {
      return { ok: false, error: 'Das Zeitfenster konnte nicht geloescht werden.' }
    }

    logAuditEvent({
      action: 'delete',
      actorId: userId,
      organizationId,
      actorRole: role,
      actorName: name,
      entityType: 'angel_availability',
      entityId: slotId,
    }).catch(() => {})

    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unbekannter Fehler.'
    return { ok: false, error: message }
  }
}

// ---------------------------------------------------------------------------
// 3. Vorlage uebernehmen (Batch-Insert fuer mehrere Wochentage)
// ---------------------------------------------------------------------------
export async function applyDefaultTemplate(
  weekdays: number[],
  startTime: string,
  endTime: string,
): Promise<{ ok: true; data: Slot[] } | { ok: false; error: string }> {
  try {
    if (!Array.isArray(weekdays) || weekdays.length === 0) {
      return { ok: false, error: 'Keine Wochentage angegeben.' }
    }
    if (weekdays.some(d => typeof d !== 'number' || d < 0 || d > 6)) {
      return { ok: false, error: 'Ungueltiger Wochentag in der Liste.' }
    }
    if (!startTime || typeof startTime !== 'string' || !/^\d{2}:\d{2}$/.test(startTime)) {
      return { ok: false, error: 'Ungueltige Startzeit.' }
    }
    if (!endTime || typeof endTime !== 'string' || !/^\d{2}:\d{2}$/.test(endTime)) {
      return { ok: false, error: 'Ungueltige Endzeit.' }
    }

    const { supabase, userId, organizationId, role, name } = await requireEngel()

    const { data, error: dbError } = await supabase
      .from('angel_availability')
      .insert(weekdays.map(weekday => ({
        angel_id: userId,
        weekday,
        start_time: startTime,
        end_time: endTime,
      })))
      .select('id, weekday, start_time, end_time')

    if (dbError) {
      return { ok: false, error: 'Die Vorlage konnte nicht uebernommen werden.' }
    }

    logAuditEvent({
      action: 'create',
      actorId: userId,
      organizationId,
      actorRole: role,
      actorName: name,
      entityType: 'angel_availability',
      details: { weekdays, startTime, endTime, count: weekdays.length },
    }).catch(() => {})

    return { ok: true, data: (data || []) as Slot[] }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unbekannter Fehler.'
    return { ok: false, error: message }
  }
}
