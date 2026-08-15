'use server'

import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/organizations/server'

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
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !['admin', 'superadmin'].includes(profile.role)) {
    throw new Error('Nur fuer Administratoren.')
  }

  const organizationId = await getActiveOrgId()
  if (!organizationId) throw new Error('Keine Organisation zugewiesen.')

  return { supabase, userId: user.id, organizationId }
}

// ── Vertretungsanfrage eskalieren ─────────────────────────────

export async function escalateRequest(requestId: string, currentLevel: number): Promise<{ ok: true }> {
  const { supabase } = await requireScheduleAdmin()
  const newLevel = Math.min((currentLevel ?? 0) + 1, 2)
  const newStatus = newLevel >= 2 ? 'external' : 'escalated'
  const { error } = await supabase.from('substitution_requests')
    .update({ escalation_level: newLevel, status: newStatus })
    .eq('id', requestId)
  if (error) throw new Error(`Eskalation fehlgeschlagen: ${error.message}`)
  return { ok: true }
}

// ── Vertretungsanfrage als gescheitert markieren ──────────────

export async function markRequestFailed(requestId: string): Promise<{ ok: true }> {
  const { supabase } = await requireScheduleAdmin()
  const { error } = await supabase.from('substitution_requests')
    .update({ status: 'failed' })
    .eq('id', requestId)
  if (error) throw new Error(`Status-Update fehlgeschlagen: ${error.message}`)
  return { ok: true }
}

// ── Klient-Benachrichtigung umschalten ────────────────────────

export async function toggleClientNotified(requestId: string, currentNotified: boolean): Promise<{ ok: true }> {
  const { supabase } = await requireScheduleAdmin()
  const { error } = await supabase.from('substitution_requests')
    .update({ client_notified: !currentNotified })
    .eq('id', requestId)
  if (error) throw new Error(`Klient-Info Update fehlgeschlagen: ${error.message}`)
  return { ok: true }
}

// ── Vertretungskraft zuweisen ─────────────────────────────────

export async function assignSubstitute(requestId: string, caregiverId: string): Promise<{ ok: true }> {
  const { supabase } = await requireScheduleAdmin()
  const { error } = await supabase.from('substitution_requests')
    .update({
      substitute_caregiver_id: caregiverId,
      status: 'filled',
      resolved_at: new Date().toISOString(),
    })
    .eq('id', requestId)
  if (error) throw new Error(`Zuweisung fehlgeschlagen: ${error.message}`)
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
  const { supabase } = await requireScheduleAdmin()
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
  const { supabase } = await requireScheduleAdmin()
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
  return { ok: true }
}
