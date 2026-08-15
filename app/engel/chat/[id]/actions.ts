'use server'

import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/organizations/server'
import { logAuditEvent } from '@/lib/audit-log'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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
// 1. Nachrichten als gelesen markieren
// ---------------------------------------------------------------------------
export async function markMessagesRead(
  bookingId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    if (!bookingId || !UUID_RE.test(bookingId)) {
      return { ok: false, error: 'Ungueltige Buchungs-ID.' }
    }

    const { supabase, userId, organizationId, role, name } = await requireEngel()

    const { error: dbError } = await supabase
      .from('messages')
      .update({ read: true })
      .eq('booking_id', bookingId)
      .eq('receiver_id', userId)

    if (dbError) {
      return { ok: false, error: 'Nachrichten konnten nicht als gelesen markiert werden.' }
    }

    logAuditEvent({
      action: 'update',
      actorId: userId,
      organizationId,
      actorRole: role,
      actorName: name,
      entityType: 'message',
      entityId: bookingId,
      details: { field: 'read', value: true },
    }).catch(() => {})

    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unbekannter Fehler.'
    return { ok: false, error: message }
  }
}

// ---------------------------------------------------------------------------
// 2. Chat-Nachricht senden
// ---------------------------------------------------------------------------
export async function sendChatMessage(
  bookingId: string,
  content: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    if (!bookingId || !UUID_RE.test(bookingId)) {
      return { ok: false, error: 'Ungueltige Buchungs-ID.' }
    }

    if (!content || typeof content !== 'string') {
      return { ok: false, error: 'Nachricht darf nicht leer sein.' }
    }

    const trimmed = content.trim()
    if (trimmed.length === 0) {
      return { ok: false, error: 'Nachricht darf nicht leer sein.' }
    }
    if (trimmed.length > 5000) {
      return { ok: false, error: 'Nachricht ist zu lang (max. 5000 Zeichen).' }
    }

    const { supabase, userId, organizationId, role, name } = await requireEngel()

    // Buchung laden um Empfaenger zu bestimmen
    const { data: booking, error: bookErr } = await supabase
      .from('bookings')
      .select('angel_id, customer_id')
      .eq('id', bookingId)
      .single()

    if (bookErr || !booking) {
      return { ok: false, error: 'Buchung nicht gefunden.' }
    }

    // Pruefen ob der User Teil der Buchung ist
    if (userId !== booking.angel_id && userId !== booking.customer_id) {
      return { ok: false, error: 'Kein Zugriff auf diese Buchung.' }
    }

    const receiverId = userId === booking.angel_id ? booking.customer_id : booking.angel_id

    if (!receiverId) {
      return { ok: false, error: 'Empfaenger konnte nicht ermittelt werden.' }
    }

    const { error: insertErr } = await supabase.from('messages').insert({
      booking_id: bookingId,
      sender_id: userId,
      receiver_id: receiverId,
      content: trimmed,
    })

    if (insertErr) {
      return { ok: false, error: 'Nachricht konnte nicht gesendet werden.' }
    }

    logAuditEvent({
      action: 'create',
      actorId: userId,
      organizationId,
      actorRole: role,
      actorName: name,
      entityType: 'message',
      entityId: bookingId,
      details: { booking_id: bookingId, receiver_id: receiverId },
    }).catch(() => {})

    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unbekannter Fehler.'
    return { ok: false, error: message }
  }
}
