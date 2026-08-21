'use server'

import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/organizations/server'
import { logAuditEvent } from '@/lib/audit-log'
import { logger } from '@/lib/logger'
const log = logger.child('schedule')

// ═══════════════════════════════════════════════════════════════
// Server-seitige Aktionen für Einsatzplanung & Ausfallmanagement
// Ersetzt client-seitige Supabase-Writes durch geprüfte Server Actions
// ═══════════════════════════════════════════════════════════════

async function requireScheduleAdmin() {
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

  const name = `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || undefined

  return { supabase, userId: user.id, organizationId, role: profile.role, name }
}

// ── Vertretungsanfrage eskalieren ─────────────────────────────

export async function escalateRequest(requestId: string, currentLevel: number): Promise<{ ok: true }> {
  const { supabase, userId, organizationId, role, name } = await requireScheduleAdmin()
  const newLevel = Math.min((currentLevel ?? 0) + 1, 2)
  const newStatus = newLevel >= 2 ? 'external' : 'escalated'
  const { error } = await supabase.from('substitution_requests')
    .update({ escalation_level: newLevel, status: newStatus })
    .eq('id', requestId)
  if (error) throw new Error(`Eskalation fehlgeschlagen: ${error.message}`)

  await logAuditEvent({
    action: 'update',
    actorId: userId,
    organizationId,
    actorRole: role,
    actorName: name,
    entityType: 'substitution_request',
    entityId: requestId,
    details: { aktion: 'eskaliert', newLevel, newStatus },
  }).catch((err) => log.warnWithException('Audit-Log fehlgeschlagen (non-blocking)', err))

  return { ok: true }
}

// ── Vertretungsanfrage als gescheitert markieren ──────────────

export async function markRequestFailed(requestId: string): Promise<{ ok: true }> {
  const { supabase, userId, organizationId, role, name } = await requireScheduleAdmin()
  const { error } = await supabase.from('substitution_requests')
    .update({ status: 'failed' })
    .eq('id', requestId)
  if (error) throw new Error(`Status-Update fehlgeschlagen: ${error.message}`)

  await logAuditEvent({
    action: 'update',
    actorId: userId,
    organizationId,
    actorRole: role,
    actorName: name,
    entityType: 'substitution_request',
    entityId: requestId,
    details: { aktion: 'als_gescheitert_markiert', status: 'failed' },
  }).catch((err) => log.warnWithException('Audit-Log fehlgeschlagen (non-blocking)', err))

  return { ok: true }
}

// ── Klient-Benachrichtigung umschalten ────────────────────────

export async function toggleClientNotified(requestId: string, currentNotified: boolean): Promise<{ ok: true }> {
  const { supabase, userId, organizationId, role, name } = await requireScheduleAdmin()
  const { error } = await supabase.from('substitution_requests')
    .update({ client_notified: !currentNotified })
    .eq('id', requestId)
  if (error) throw new Error(`Klient-Info Update fehlgeschlagen: ${error.message}`)

  await logAuditEvent({
    action: 'update',
    actorId: userId,
    organizationId,
    actorRole: role,
    actorName: name,
    entityType: 'substitution_request',
    entityId: requestId,
    details: { aktion: 'klient_benachrichtigung_umgeschaltet', client_notified: !currentNotified },
  }).catch((err) => log.warnWithException('Audit-Log fehlgeschlagen (non-blocking)', err))

  return { ok: true }
}

// ── Vertretungskraft zuweisen ─────────────────────────────────

export async function assignSubstitute(requestId: string, caregiverId: string): Promise<{ ok: true }> {
  const { supabase, userId, organizationId, role, name } = await requireScheduleAdmin()
  const { error } = await supabase.from('substitution_requests')
    .update({
      substitute_caregiver_id: caregiverId,
      status: 'filled',
      resolved_at: new Date().toISOString(),
    })
    .eq('id', requestId)
  if (error) throw new Error(`Zuweisung fehlgeschlagen: ${error.message}`)

  await logAuditEvent({
    action: 'update',
    actorId: userId,
    organizationId,
    actorRole: role,
    actorName: name,
    entityType: 'substitution_request',
    entityId: requestId,
    details: { aktion: 'vertretung_zugewiesen', substitute_caregiver_id: caregiverId },
  }).catch((err) => log.warnWithException('Audit-Log fehlgeschlagen (non-blocking)', err))

  return { ok: true }
}

// ── Ausfall melden ────────────────────────────────────────────

export async function reportAbsence(input: {
  caregiverId: string
  absenceType: string
  startDate: string
  endDate: string
  reason: string | null
}): Promise<{ ok: true }> {
  const { supabase, userId, organizationId, role, name } = await requireScheduleAdmin()
  if (!input.caregiverId) throw new Error('Bitte eine Betreuungskraft waehlen.')
  if (input.endDate < input.startDate) throw new Error('Enddatum liegt vor dem Startdatum.')

  const { error } = await supabase.from('absences').insert({
    caregiver_id: input.caregiverId,
    absence_type: input.absenceType,
    start_date: input.startDate,
    end_date: input.endDate,
    reason: input.reason || null,
    reported_at: new Date().toISOString(),
  })
  if (error) throw new Error(`Ausfall konnte nicht gespeichert werden: ${error.message}`)

  await logAuditEvent({
    action: 'create',
    actorId: userId,
    organizationId,
    actorRole: role,
    actorName: name,
    entityType: 'absence',
    entityId: input.caregiverId,
    details: { aktion: 'ausfall_gemeldet', absenceType: input.absenceType, startDate: input.startDate, endDate: input.endDate },
  }).catch((err) => log.warnWithException('Audit-Log fehlgeschlagen (non-blocking)', err))

  return { ok: true }
}

// ── Vertretungsanfrage erstellen ──────────────────────────────

export async function createSubstitutionRequest(input: {
  clientId: string
  originalCaregiverId: string | null
  date: string
  startTime: string | null
  endTime: string | null
  serviceType: string | null
}): Promise<{ ok: true }> {
  const { supabase, userId, organizationId, role, name } = await requireScheduleAdmin()
  if (!input.clientId || !input.date) throw new Error('Bitte Klient und Datum angeben.')

  const { error } = await supabase.from('substitution_requests').insert({
    client_id: input.clientId,
    original_caregiver_id: input.originalCaregiverId || null,
    date: input.date,
    start_time: input.startTime || null,
    end_time: input.endTime || null,
    service_type: input.serviceType || null,
    status: 'open',
    escalation_level: 0,
    client_notified: false,
  })
  if (error) throw new Error(`Vertretung konnte nicht erstellt werden: ${error.message}`)

  await logAuditEvent({
    action: 'create',
    actorId: userId,
    organizationId,
    actorRole: role,
    actorName: name,
    entityType: 'substitution_request',
    entityId: input.clientId,
    details: { aktion: 'vertretungsanfrage_erstellt', date: input.date, clientId: input.clientId },
  }).catch((err) => log.warnWithException('Audit-Log fehlgeschlagen (non-blocking)', err))

  return { ok: true }
}
