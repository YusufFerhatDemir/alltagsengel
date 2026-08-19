'use server'

import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/organizations/server'
import { logAuditEvent } from '@/lib/audit-log'

// ═══════════════════════════════════════════════════════════════
// Server-seitige Aktionen fuer Krankenfahrt-Pricing (MIS)
// Ersetzt client-seitige Supabase-Writes durch gepruefte Server Actions
// ═══════════════════════════════════════════════════════════════

const tableMap: Record<string, string> = {
  tarife: 'kf_pricing_tiers',
  zuschlaege: 'kf_pricing_surcharges',
  regionen: 'kf_pricing_regions',
  settings: 'kf_pricing_config',
}

const allowedEntities = ['tarife', 'zuschlaege', 'regionen', 'settings']

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

// ── Pricing-Eintrag speichern (Insert oder Update) ────────────

export async function savePricingItem(
  entity: string,
  item: { id?: string; [key: string]: any }
): Promise<{ ok: true; data?: any } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireMISAdmin()

    if (!allowedEntities.includes(entity)) {
      return { ok: false, error: `Ungueltige Entitaet: ${entity}` }
    }

    const table = tableMap[entity]

    if (item.id) {
      // Update
      const { id, ...rest } = item
      const { data: updated, error } = await supabase
        .from(table)
        .update({ ...rest, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()

      if (error) return { ok: false, error: error.message }

      await logAuditEvent({
        action: 'update',
        actorId: userId,
        actorRole: role,
        actorName: name,
        organizationId,
        entityType: `kf_pricing_${entity}`,
        entityId: id,
        details: { aktion: 'pricing_aktualisiert', entity },
      }).catch(() => {})

      return { ok: true, data: updated }
    } else {
      // Insert
      const { id: _unused, ...rest } = item
      const { data: inserted, error } = await supabase
        .from(table)
        .insert(rest)
        .select()
        .single()

      if (error) return { ok: false, error: error.message }

      await logAuditEvent({
        action: 'create',
        actorId: userId,
        actorRole: role,
        actorName: name,
        organizationId,
        entityType: `kf_pricing_${entity}`,
        entityId: inserted?.id,
        details: { aktion: 'pricing_erstellt', entity },
      }).catch(() => {})

      return { ok: true, data: inserted }
    }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unbekannter Fehler' }
  }
}

// ── Pricing-Eintrag loeschen ──────────────────────────────────

export async function deletePricingItem(
  entity: string,
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireMISAdmin()

    if (!allowedEntities.includes(entity)) {
      return { ok: false, error: `Ungueltige Entitaet: ${entity}` }
    }

    const table = tableMap[entity]

    const { error } = await supabase
      .from(table)
      .delete()
      .eq('id', id)

    if (error) return { ok: false, error: error.message }

    await logAuditEvent({
      action: 'delete',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: `kf_pricing_${entity}`,
      entityId: id,
      details: { aktion: 'pricing_geloescht', entity },
    }).catch(() => {})

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unbekannter Fehler' }
  }
}
