'use server'

import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/organizations/server'
import { logAuditEvent } from '@/lib/audit-log'

// ═══════════════════════════════════════════════════════════════
// Server-seitige Aktionen fuer MIS Scheduling
// Ersetzt client-seitige Supabase-Writes durch gepruefte Server Actions
// ═══════════════════════════════════════════════════════════════

async function requireMISAdmin() {
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

// ── Schicht erstellen ──────────────────────────────────────────

export async function createShift(data: {
  engel_name: string
  kunde_name: string
  datum: string
  start_zeit: string
  end_zeit: string
  typ: string
  notizen: string
}): Promise<{ ok: true; data?: any } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name: actorName } = await requireMISAdmin()

    const row = {
      engel_name: data.engel_name,
      kunde_name: data.kunde_name,
      datum: data.datum,
      start_zeit: data.start_zeit,
      end_zeit: data.end_zeit,
      typ: data.typ,
      notizen: data.notizen,
      status: data.engel_name ? 'zugewiesen' : 'offen',
      organization_id: organizationId,
    }

    const { data: inserted, error } = await supabase
      .from('mis_shifts')
      .insert(row)
      .select()
      .single()

    if (error) return { ok: false, error: error.message }

    await logAuditEvent({
      action: 'create',
      actorId: userId,
      actorRole: role,
      actorName,
      organizationId,
      entityType: 'mis_shifts',
      entityId: inserted?.id ?? 'unknown',
      details: { aktion: 'schicht_erstellt', kunde: data.kunde_name, datum: data.datum },
    }).catch(() => {})

    return { ok: true, data: inserted }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unbekannter Fehler' }
  }
}

// ── Schicht zuweisen ───────────────────────────────────────────

export async function assignShift(id: string, engel_name: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireMISAdmin()

    const { error } = await supabase
      .from('mis_shifts')
      .update({ engel_name, status: 'zugewiesen' })
      .eq('id', id)

    if (error) return { ok: false, error: error.message }

    await logAuditEvent({
      action: 'update',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'mis_shifts',
      entityId: id,
      details: { aktion: 'schicht_zugewiesen', engel_name },
    }).catch(() => {})

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unbekannter Fehler' }
  }
}

// ── Schicht-Status aktualisieren ───────────────────────────────

export async function updateShiftStatus(id: string, status: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireMISAdmin()

    const { error } = await supabase
      .from('mis_shifts')
      .update({ status })
      .eq('id', id)

    if (error) return { ok: false, error: error.message }

    await logAuditEvent({
      action: 'update',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'mis_shifts',
      entityId: id,
      details: { aktion: 'schichtstatus_aktualisiert', neuer_status: status },
    }).catch(() => {})

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unbekannter Fehler' }
  }
}

// ── Schicht loeschen ───────────────────────────────────────────

export async function deleteShift(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireMISAdmin()

    const { error } = await supabase
      .from('mis_shifts')
      .delete()
      .eq('id', id)

    if (error) return { ok: false, error: error.message }

    await logAuditEvent({
      action: 'delete',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'mis_shifts',
      entityId: id,
      details: { aktion: 'schicht_geloescht' },
    }).catch(() => {})

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unbekannter Fehler' }
  }
}

// ── Verfuegbarkeit erstellen ───────────────────────────────────

export async function createAvailability(data: {
  engel_name: string
  wochentag: number
  von: string
  bis: string
  wiederholend: boolean
}): Promise<{ ok: true; data?: any } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name: actorName } = await requireMISAdmin()

    const row = {
      engel_id: crypto.randomUUID(),
      engel_name: data.engel_name,
      wochentag: data.wochentag,
      von: data.von,
      bis: data.bis,
      wiederholend: data.wiederholend,
      organization_id: organizationId,
    }

    const { data: inserted, error } = await supabase
      .from('mis_availability')
      .insert(row)
      .select()
      .single()

    if (error) return { ok: false, error: error.message }

    await logAuditEvent({
      action: 'create',
      actorId: userId,
      actorRole: role,
      actorName,
      organizationId,
      entityType: 'mis_availability',
      entityId: inserted?.id ?? 'unknown',
      details: { aktion: 'verfuegbarkeit_erstellt', engel_name: data.engel_name, wochentag: data.wochentag },
    }).catch(() => {})

    return { ok: true, data: inserted }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unbekannter Fehler' }
  }
}

// ── Verfuegbarkeit loeschen ────────────────────────────────────

export async function deleteAvailability(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireMISAdmin()

    const { error } = await supabase
      .from('mis_availability')
      .delete()
      .eq('id', id)

    if (error) return { ok: false, error: error.message }

    await logAuditEvent({
      action: 'delete',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'mis_availability',
      entityId: id,
      details: { aktion: 'verfuegbarkeit_geloescht' },
    }).catch(() => {})

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unbekannter Fehler' }
  }
}
