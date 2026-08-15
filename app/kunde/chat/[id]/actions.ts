'use server'

import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/organizations/server'
import { logAuditEvent } from '@/lib/audit-log'

// ═══════════════════════════════════════════════════════════════
// Server-seitige Aktionen fuer Kunden-Chat
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

// ── Nachrichten als gelesen markieren ────────────────────────────

export async function markMessagesReadAction(
  input: { bookingId: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase, userId } = await requireKunde()

    if (!input.bookingId) {
      return { ok: false, error: 'bookingId ist erforderlich.' }
    }

    const { error } = await supabase
      .from('messages')
      .update({ read: true })
      .eq('booking_id', input.bookingId)
      .eq('receiver_id', userId)
      .eq('read', false)

    if (error) {
      return { ok: false, error: `Nachrichten konnten nicht als gelesen markiert werden: ${error.message}` }
    }

    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unbekannter Fehler.' }
  }
}

// ── Buchungs-Chatnachricht senden ───────────────────────────────

export async function sendBookingMessageAction(
  input: { bookingId: string; receiverId: string; content: string },
): Promise<
  | { ok: true; data: { id: string; sender_id: string; content: string; created_at: string } }
  | { ok: false; error: string }
> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireKunde()

    const content = input.content?.trim()
    if (!input.bookingId) return { ok: false, error: 'bookingId ist erforderlich.' }
    if (!input.receiverId) return { ok: false, error: 'receiverId ist erforderlich.' }
    if (!content) return { ok: false, error: 'Nachricht darf nicht leer sein.' }

    const { data, error } = await supabase
      .from('messages')
      .insert({
        booking_id: input.bookingId,
        sender_id: userId,
        receiver_id: input.receiverId,
        content,
      })
      .select('id, sender_id, content, created_at')
      .single()

    if (error || !data) {
      return { ok: false, error: `Nachricht konnte nicht gesendet werden: ${error?.message ?? 'Keine Daten.'}` }
    }

    logAuditEvent({
      action: 'create',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'messages',
      entityId: data.id,
      details: { booking_id: input.bookingId, receiver_id: input.receiverId },
    }).catch(() => {})

    return { ok: true, data }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unbekannter Fehler.' }
  }
}

// ── Fahrt-Chatnachricht senden ──────────────────────────────────

export async function sendRideMessageAction(
  input: { rideId: string; content: string },
): Promise<
  | { ok: true; data: { id: string; sender_id: string; content: string; created_at: string } }
  | { ok: false; error: string }
> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireKunde()

    const content = input.content?.trim()
    if (!input.rideId) return { ok: false, error: 'rideId ist erforderlich.' }
    if (!content) return { ok: false, error: 'Nachricht darf nicht leer sein.' }

    const { data, error } = await supabase
      .from('chat_messages')
      .insert({
        ride_id: input.rideId,
        sender_id: userId,
        content,
      })
      .select('id, sender_id, content, created_at')
      .single()

    if (error || !data) {
      return { ok: false, error: `Nachricht konnte nicht gesendet werden: ${error?.message ?? 'Keine Daten.'}` }
    }

    logAuditEvent({
      action: 'create',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'chat_messages',
      entityId: data.id,
      details: { ride_id: input.rideId },
    }).catch(() => {})

    return { ok: true, data }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unbekannter Fehler.' }
  }
}
