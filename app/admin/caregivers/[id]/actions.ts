'use server'

import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/organizations/server'
import { logAuditEventOrWarn } from '@/lib/audit-log'
import { isValidUUID } from '@/lib/safe-query'

// ═══════════════════════════════════════════════════════════════
// Server-seitige Aktionen fuer Betreuungskraft-Detailseite
// Ersetzt client-seitige Supabase-Writes durch gepruefte Server Actions
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

// ── Dokument zur Mitarbeiterakte hinzufuegen ────────────────────

interface DocPayload {
  caregiverId: string
  documentType: string
  title: string | null
  documentUrl: string | null
  issuedDate: string | null
  validUntil: string | null
  notes: string | null
}

export async function addCaregiverDocument(
  payload: DocPayload,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireAdmin()

    if (!isValidUUID(payload.caregiverId)) {
      return { ok: false, error: 'Ungueltige Betreuungskraft-ID.' }
    }
    if (!payload.documentType) {
      return { ok: false, error: 'Dokumententyp ist Pflichtfeld.' }
    }

    const row = {
      caregiver_id: payload.caregiverId,
      document_type: payload.documentType,
      title: payload.title,
      document_url: payload.documentUrl,
      issued_date: payload.issuedDate,
      valid_until: payload.validUntil,
      notes: payload.notes,
    }

    const { data: result, error: dbError } = await supabase
      .from('caregiver_documents')
      .insert(row)
      .select('id')
      .single()

    if (dbError) return { ok: false, error: `Speichern fehlgeschlagen: ${dbError.message}` }

    await logAuditEventOrWarn({
      action: 'create',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'caregiver_document',
      entityId: result.id,
      details: { caregiver_id: payload.caregiverId, document_type: payload.documentType },
    })

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err.message || 'Unerwarteter Fehler.' }
  }
}

// ── Qualifikation / Fortbildung hinzufuegen ─────────────────────

interface QualPayload {
  caregiverId: string
  title: string
  qualificationType: string | null
  documentUrl: string | null
  issuedDate: string | null
  validUntil: string | null
}

export async function addCaregiverQualification(
  payload: QualPayload,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireAdmin()

    if (!isValidUUID(payload.caregiverId)) {
      return { ok: false, error: 'Ungueltige Betreuungskraft-ID.' }
    }
    if (!payload.title) {
      return { ok: false, error: 'Bezeichnung ist Pflichtfeld.' }
    }

    const row = {
      caregiver_id: payload.caregiverId,
      title: payload.title,
      qualification_type: payload.qualificationType,
      document_url: payload.documentUrl,
      issued_date: payload.issuedDate,
      valid_until: payload.validUntil,
    }

    const { data: result, error: dbError } = await supabase
      .from('caregiver_qualifications')
      .insert(row)
      .select('id')
      .single()

    if (dbError) return { ok: false, error: `Speichern fehlgeschlagen: ${dbError.message}` }

    await logAuditEventOrWarn({
      action: 'create',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'caregiver_qualification',
      entityId: result.id,
      details: { caregiver_id: payload.caregiverId, title: payload.title },
    })

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err.message || 'Unerwarteter Fehler.' }
  }
}

// ── Handzeichen aendern (History + Caregiver-Update) ────────────

interface InitialsPayload {
  caregiverId: string
  initials: string
  reason: string | null
}

export async function changeCaregiverInitials(
  payload: InitialsPayload,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireAdmin()

    if (!isValidUUID(payload.caregiverId)) {
      return { ok: false, error: 'Ungueltige Betreuungskraft-ID.' }
    }
    if (!payload.initials) {
      return { ok: false, error: 'Handzeichen ist Pflichtfeld.' }
    }

    const now = new Date().toISOString()

    // Bisheriges aktives Handzeichen in der Historie abschliessen
    await supabase
      .from('caregiver_initials_history')
      .update({ valid_until: now })
      .eq('caregiver_id', payload.caregiverId)
      .is('valid_until', null)

    // Neues Handzeichen in die Historie einfuegen
    const { data: historyRow, error: histErr } = await supabase
      .from('caregiver_initials_history')
      .insert({
        caregiver_id: payload.caregiverId,
        initials: payload.initials,
        valid_from: now,
        valid_until: null,
        changed_reason: payload.reason,
      })
      .select('id')
      .single()

    if (histErr) return { ok: false, error: `Historie-Eintrag fehlgeschlagen: ${histErr.message}` }

    // Aktuelles Handzeichen auf dem Caregiver-Datensatz aktualisieren
    const { error: updateErr } = await supabase
      .from('caregivers')
      .update({ initials: payload.initials })
      .eq('id', payload.caregiverId)

    if (updateErr) return { ok: false, error: `Handzeichen-Update fehlgeschlagen: ${updateErr.message}` }

    await logAuditEventOrWarn({
      action: 'update',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'caregiver',
      entityId: payload.caregiverId,
      details: { aktion: 'handzeichen_geaendert', neues_handzeichen: payload.initials, grund: payload.reason },
    })

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err.message || 'Unerwarteter Fehler.' }
  }
}

// ── Bonus vergeben ──────────────────────────────────────────────

interface BonusPayload {
  caregiverId: string
  bonusType: string
  points: number | null
  description: string | null
  rewardType: string | null
  rewardValue: number | null
}

export async function addCaregiverBonus(
  payload: BonusPayload,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireAdmin()

    if (!isValidUUID(payload.caregiverId)) {
      return { ok: false, error: 'Ungueltige Betreuungskraft-ID.' }
    }
    if (!payload.bonusType) {
      return { ok: false, error: 'Bonus-Kategorie ist Pflichtfeld.' }
    }

    const row = {
      caregiver_id: payload.caregiverId,
      bonus_type: payload.bonusType,
      points: payload.points,
      description: payload.description,
      reward_type: payload.rewardType,
      reward_value: payload.rewardValue,
      awarded_date: new Date().toISOString().split('T')[0],
      awarded_by: userId,
    }

    const { data: result, error: dbError } = await supabase
      .from('caregiver_bonuses')
      .insert(row)
      .select('id')
      .single()

    if (dbError) return { ok: false, error: `Speichern fehlgeschlagen: ${dbError.message}` }

    await logAuditEventOrWarn({
      action: 'create',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'caregiver_bonus',
      entityId: result.id,
      details: { caregiver_id: payload.caregiverId, bonus_type: payload.bonusType, points: payload.points },
    })

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err.message || 'Unerwarteter Fehler.' }
  }
}

// ── Registrierung & Abrechnung aktualisieren ────────────────────

interface RegPayload {
  caregiverId: string
  lifetimeRegistrationNumber: string | null
  ikNummer: string | null
  qualificationLevel: string
}

export async function updateCaregiverRegistration(
  payload: RegPayload,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireAdmin()

    if (!isValidUUID(payload.caregiverId)) {
      return { ok: false, error: 'Ungueltige Betreuungskraft-ID.' }
    }

    const { error: dbError } = await supabase
      .from('caregivers')
      .update({
        lifetime_registration_number: payload.lifetimeRegistrationNumber,
        ik_nummer: payload.ikNummer,
        qualification_level: payload.qualificationLevel,
      })
      .eq('id', payload.caregiverId)

    if (dbError) return { ok: false, error: `Speichern fehlgeschlagen: ${dbError.message}` }

    await logAuditEventOrWarn({
      action: 'update',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'caregiver',
      entityId: payload.caregiverId,
      details: {
        aktion: 'registrierung_aktualisiert',
        lifetime_registration_number: payload.lifetimeRegistrationNumber,
        ik_nummer: payload.ikNummer,
        qualification_level: payload.qualificationLevel,
      },
    })

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err.message || 'Unerwarteter Fehler.' }
  }
}
