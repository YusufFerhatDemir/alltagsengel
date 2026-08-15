'use server'

import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/organizations/server'
import { logAuditEvent } from '@/lib/audit-log'

// ═══════════════════════════════════════════════════════════════
// Server-seitige Aktionen für Kostenträger-Kontakte
// Ersetzt client-seitige Supabase-Writes durch geprüfte Server Actions
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

// ── Kontakt anlegen oder aktualisieren ───────────────────────────

interface KontaktPayload {
  name: string
  typ: string
  ik_nummer: string | null
  email: string | null
  post_adresse: string | null
  telefon: string | null
  fax: string | null
  bundesland: string | null
  elektronisch_abrechenbar: boolean
  notes: string | null
}

export async function upsertKostentraeger(
  editingId: string | null,
  payload: KontaktPayload,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name: actorName } = await requireAdmin()

    if (!payload.name || typeof payload.name !== 'string') {
      return { ok: false, error: 'Name ist Pflichtfeld.' }
    }

    const row = {
      name: payload.name,
      typ: payload.typ,
      ik_nummer: payload.ik_nummer,
      email: payload.email,
      post_adresse: payload.post_adresse,
      telefon: payload.telefon,
      fax: payload.fax,
      bundesland: payload.bundesland,
      elektronisch_abrechenbar: payload.elektronisch_abrechenbar,
      notes: payload.notes,
    }

    const { error: dbError } = editingId
      ? await supabase.from('kostentraeger_kontakte').update(row).eq('id', editingId)
      : await supabase.from('kostentraeger_kontakte').insert(row)

    if (dbError) return { ok: false, error: `Speichern fehlgeschlagen: ${dbError.message}` }

    await logAuditEvent({
      action: editingId ? 'update' : 'create',
      actorId: userId,
      actorRole: role,
      actorName: actorName,
      organizationId,
      entityType: 'kostentraeger_kontakt',
      entityId: editingId || 'neu',
      details: { name: payload.name, typ: payload.typ },
    }).catch(() => {})

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err.message || 'Unerwarteter Fehler.' }
  }
}

// ── Kontakt löschen ──────────────────────────────────────────────

export async function deleteKostentraeger(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireAdmin()

    if (!id || typeof id !== 'string') {
      return { ok: false, error: 'Ungueltige ID.' }
    }

    const { error: dbError } = await supabase.from('kostentraeger_kontakte').delete().eq('id', id)
    if (dbError) return { ok: false, error: `Loeschen fehlgeschlagen: ${dbError.message}` }

    await logAuditEvent({
      action: 'delete',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'kostentraeger_kontakt',
      entityId: id,
      details: {},
    }).catch(() => {})

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err.message || 'Unerwarteter Fehler.' }
  }
}
