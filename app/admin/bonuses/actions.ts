'use server'

import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/organizations/server'
import { logAuditEventOrWarn } from '@/lib/audit-log'
import { heuteBerlin } from '@/lib/utils/timezone'

// ═══════════════════════════════════════════════════════════════
// Server-seitige Aktionen für Mitarbeiterbindung / Bonuses
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

// ── Bonus vergeben ───────────────────────────────────────────────

interface AwardBonusPayload {
  caregiver_id: string
  bonus_type: string
  points: number | null
  description: string | null
  reward_type: string | null
  reward_value: number | null
}

export async function awardBonus(
  payload: AwardBonusPayload,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireAdmin()

    if (!payload.caregiver_id || typeof payload.caregiver_id !== 'string') {
      return { ok: false, error: 'Bitte einen Mitarbeiter waehlen.' }
    }

    const row = {
      caregiver_id: payload.caregiver_id,
      bonus_type: payload.bonus_type,
      points: payload.points,
      description: payload.description,
      reward_type: payload.reward_type,
      reward_value: payload.reward_value,
      awarded_date: heuteBerlin(),
      awarded_by: 'Alltagsengel',
    }

    const { error: dbError } = await supabase.from('caregiver_bonuses').insert(row)
    if (dbError) return { ok: false, error: `Bonus-Vergabe fehlgeschlagen: ${dbError.message}` }

    await logAuditEventOrWarn({
      action: 'create',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'caregiver_bonus',
      entityId: payload.caregiver_id,
      details: { bonus_type: payload.bonus_type, points: payload.points, reward_type: payload.reward_type },
    })

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err.message || 'Unerwarteter Fehler.' }
  }
}
