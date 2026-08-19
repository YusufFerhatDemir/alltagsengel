'use server'

import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/organizations/server'
import { logAuditEventOrWarn } from '@/lib/audit-log'

// ═══════════════════════════════════════════════════════════════
// Server-seitige Aktionen für Leistungspreise
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

// ── Preis anlegen oder aktualisieren ─────────────────────────────

interface PreisPayload {
  bundesland: string
  leistungsart: string
  preis_cent: number
  gueltig_ab: string
  gueltig_bis: string | null
}

export async function upsertLeistungspreis(
  editingId: string | null,
  payload: PreisPayload,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireAdmin()

    if (!payload.leistungsart || typeof payload.leistungsart !== 'string') {
      return { ok: false, error: 'Leistungsart ist Pflichtfeld.' }
    }
    if (typeof payload.preis_cent !== 'number' || isNaN(payload.preis_cent)) {
      return { ok: false, error: 'Preis ist Pflichtfeld.' }
    }

    const row = {
      bundesland: payload.bundesland,
      leistungsart: payload.leistungsart,
      preis_cent: payload.preis_cent,
      gueltig_ab: payload.gueltig_ab,
      gueltig_bis: payload.gueltig_bis,
    }

    const { error: dbError } = editingId
      ? await supabase.from('leistungspreise').update(row).eq('id', editingId)
      : await supabase.from('leistungspreise').insert(row)

    if (dbError) return { ok: false, error: `Speichern fehlgeschlagen: ${dbError.message}` }

    await logAuditEventOrWarn({
      action: editingId ? 'update' : 'create',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'leistungspreis',
      entityId: editingId || 'neu',
      details: row,
    })

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err.message || 'Unerwarteter Fehler.' }
  }
}

// ── Preis löschen ────────────────────────────────────────────────

export async function deleteLeistungspreis(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireAdmin()

    if (!id || typeof id !== 'string') {
      return { ok: false, error: 'Ungueltige ID.' }
    }

    const { error: dbError } = await supabase.from('leistungspreise').delete().eq('id', id)
    if (dbError) return { ok: false, error: `Loeschen fehlgeschlagen: ${dbError.message}` }

    await logAuditEventOrWarn({
      action: 'delete',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'leistungspreis',
      entityId: id,
      details: {},
    })

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err.message || 'Unerwarteter Fehler.' }
  }
}
