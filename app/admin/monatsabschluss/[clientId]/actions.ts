'use server'

import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/organizations/server'
import { logAuditEvent } from '@/lib/audit-log'
import { isValidUUID } from '@/lib/safe-query'

// ═══════════════════════════════════════════════════════════════
// Server-seitige Aktionen für Monatsabschluss-Detail
// Ersetzt client-seitige Supabase-Writes durch geprüfte Server Actions
// ═══════════════════════════════════════════════════════════════

async function requireMonatsabschlussAdmin() {
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

// ── Monat abschließen ────────────────────────────────────────────

export interface CloseMonthInput {
  clientId: string
  year: number
  month: number
  ampel: string
  totalRecords: number
  totalAmount: number
  budgetUsed: number | null
  budgetAvailable: number | null
}

export async function closeMonthAction(input: CloseMonthInput): Promise<{ ok: true; closingId: string }> {
  const { supabase, userId, organizationId, role, name } = await requireMonatsabschlussAdmin()

  // ── Validierung ──
  if (!input.clientId || !isValidUUID(input.clientId)) {
    throw new Error('Ungueltige Klienten-ID.')
  }
  if (typeof input.year !== 'number' || input.year < 2020 || input.year > 2100) {
    throw new Error('Ungueltiges Jahr.')
  }
  if (typeof input.month !== 'number' || input.month < 1 || input.month > 12) {
    throw new Error('Ungueltiger Monat.')
  }
  if (!['gruen', 'gelb', 'rot'].includes(input.ampel)) {
    throw new Error('Ungueltige Ampel-Bewertung.')
  }
  if (input.ampel === 'rot') {
    throw new Error('Abschluss bei roter Ampel ist nicht moeglich.')
  }

  const now = new Date().toISOString()

  const { data: upserted, error: upsertErr } = await supabase
    .from('monthly_closings')
    .upsert({
      client_id: input.clientId,
      year: input.year,
      month: input.month,
      status: 'closed',
      ampel: input.ampel,
      total_records: input.totalRecords,
      total_amount: input.totalAmount,
      budget_used: input.budgetUsed,
      budget_available: input.budgetAvailable,
      closed_by: userId,
      closed_at: now,
    }, { onConflict: 'client_id,year,month' })
    .select('id')
    .single()

  if (upsertErr) throw new Error(`Monatsabschluss fehlgeschlagen: ${upsertErr.message}`)

  const closingId = upserted?.id ?? null

  // Legacy audit_logs Eintrag (bestehende Struktur beibehalten)
  try {
    await supabase.from('audit_logs').insert({
      entity_type: 'monthly_closing',
      entity_id: closingId,
      action: 'close',
      actor_id: userId,
      after: {
        client_id: input.clientId,
        year: input.year,
        month: input.month,
        ampel: input.ampel,
        total_records: input.totalRecords,
        total_amount: input.totalAmount,
        budget_used: input.budgetUsed,
        budget_available: input.budgetAvailable,
      },
    })
  } catch { /* audit-log darf Hauptaktion nicht blockieren */ }

  // mis_audit_log Eintrag
  await logAuditEvent({
    action: 'update',
    actorId: userId,
    actorRole: role,
    actorName: name,
    organizationId,
    entityType: 'monthly_closing',
    entityId: closingId,
    details: {
      aktion: 'monat_abgeschlossen',
      client_id: input.clientId,
      zeitraum: `${input.year}-${String(input.month).padStart(2, '0')}`,
      ampel: input.ampel,
      total_records: input.totalRecords,
      total_amount: input.totalAmount,
    },
  }).catch(() => {})

  return { ok: true, closingId: closingId ?? '' }
}
