'use server'

import { createClient } from '@/lib/supabase/server'
import { resolveUserOrgId } from '@/lib/organizations/server'
import { logAuditEventOrWarn } from '@/lib/audit-log'

// ═══════════════════════════════════════════════════════════════
// Server-seitige Aktionen fuer Kunden-Support-Nachrichten
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

// ── Support-Nachricht senden ────────────────────────────────────

export async function sendSupportNoteAction(
  input: { clientId: string; content: string }
): Promise<
  | { ok: true; data: { id: string; author_id: string; author_role: string; content: string; is_urgent: boolean; created_at: string } }
  | { ok: false; error: string }
> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireKunde()

    if (!input.clientId) {
      return { ok: false, error: 'Client-ID fehlt.' }
    }

    const content = input.content?.trim()
    if (!content) {
      return { ok: false, error: 'Nachricht darf nicht leer sein.' }
    }

    const { data, error: dbError } = await supabase
      .from('care_notes')
      .insert({
        client_id: input.clientId,
        author_id: userId,
        author_role: 'kunde',
        author_name: name,
        category: 'allgemein',
        content,
      })
      .select('id, author_id, author_role, content, is_urgent, created_at')
      .single()

    if (dbError || !data) {
      return { ok: false, error: dbError?.message || 'Nachricht konnte nicht gesendet werden.' }
    }

    await logAuditEventOrWarn({
      action: 'create',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'care_notes',
      entityId: data.id,
      details: { client_id: input.clientId },
    })

    return { ok: true, data }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unbekannter Fehler' }
  }
}
