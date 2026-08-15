'use server'

import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/organizations/server'
import { logAuditEvent } from '@/lib/audit-log'

async function requireFahrer() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new Error('Nicht autorisiert.')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, first_name, last_name')
    .eq('id', user.id)
    .single()

  if (!profile || !['fahrer', 'admin', 'superadmin'].includes(profile.role)) {
    throw new Error('Nur fuer Fahrer.')
  }

  const organizationId = await getActiveOrgId()
  const name = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || 'Fahrer'
  return { supabase, userId: user.id, organizationId, role: profile.role, name }
}

// ── Chat-Nachricht senden ─────────────────────────────────────

export async function sendChatMessage(
  rideId: string,
  content: string
): Promise<{ ok: true; data: any } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireFahrer()

    // Validate inputs
    if (!rideId || typeof rideId !== 'string') {
      return { ok: false, error: 'Fahrt-ID fehlt.' }
    }

    const trimmed = typeof content === 'string' ? content.trim() : ''
    if (!trimmed) {
      return { ok: false, error: 'Nachricht darf nicht leer sein.' }
    }
    if (trimmed.length > 5000) {
      return { ok: false, error: 'Nachricht ist zu lang (max. 5000 Zeichen).' }
    }

    // Verify ride exists and user's provider is assigned
    const { data: provider } = await supabase
      .from('krankenfahrt_providers')
      .select('id')
      .eq('user_id', userId)
      .single()

    if (!provider) {
      return { ok: false, error: 'Kein Dienstleister-Profil gefunden.' }
    }

    const { data: ride } = await supabase
      .from('krankenfahrten')
      .select('id, provider_id')
      .eq('id', rideId)
      .single()

    if (!ride) {
      return { ok: false, error: 'Fahrt nicht gefunden.' }
    }

    if (ride.provider_id !== provider.id) {
      return { ok: false, error: 'Keine Berechtigung fuer diese Fahrt.' }
    }

    // Insert chat message
    const { data, error: insertError } = await supabase
      .from('chat_messages')
      .insert({ ride_id: rideId, sender_id: userId, content: trimmed })
      .select()
      .single()

    if (insertError) {
      return { ok: false, error: 'Fehler beim Senden der Nachricht.' }
    }

    logAuditEvent({
      action: 'create',
      actorId: userId,
      organizationId,
      actorRole: role,
      actorName: name,
      entityType: 'chat_message',
      entityId: data?.id,
      details: { ride_id: rideId },
    }).catch(() => {})

    return { ok: true, data }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unerwarteter Fehler.' }
  }
}
