'use server'

import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/organizations/server'
import { fullName } from '@/lib/admin/ops'

// ═══════════════════════════════════════════════════════════════
// Server-seitige Aktionen für das Qualitätsmanagement (M13)
// Ersetzt client-seitige Supabase-Writes durch geprüfte Server Actions
// ═══════════════════════════════════════════════════════════════

async function requireQMAdmin() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new Error('Nicht autorisiert.')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, first_name, last_name')
    .eq('id', user.id)
    .single()

  if (!profile || !['admin', 'superadmin'].includes(profile.role)) {
    throw new Error('Nur für Administratoren.')
  }

  const organizationId = await getActiveOrgId()
  if (!organizationId) throw new Error('Keine Organisation zugewiesen.')

  return { supabase, userId: user.id, organizationId, role: profile.role }
}

// ── Zufriedenheitsanruf dokumentieren ──────────────────────────

export interface SatisfactionCallInput {
  clientId: string
  callType: string
  callDate: string
  rating: number
  punctual: boolean
  comfortable: boolean
  keep: boolean
  suggestions: string | null
  notes: string | null
  nextCallDate: string
}

export async function saveSatisfactionCall(input: SatisfactionCallInput): Promise<{ ok: true }> {
  const { supabase, organizationId } = await requireQMAdmin()

  // ── Validierung ──
  if (!input.clientId || typeof input.clientId !== 'string') {
    throw new Error('Bitte einen Klienten wählen.')
  }
  if (!input.callType || typeof input.callType !== 'string') {
    throw new Error('Bitte einen Anruf-Typ wählen.')
  }
  if (!input.callDate || !/^\d{4}-\d{2}-\d{2}$/.test(input.callDate)) {
    throw new Error('Bitte ein gültiges Datum angeben.')
  }
  if (typeof input.rating !== 'number' || input.rating < 1 || input.rating > 5) {
    throw new Error('Zufriedenheit muss zwischen 1 und 5 liegen.')
  }

  // ── Cross-Tenant-Schutz: Klient muss zur Organisation gehören ──
  const { data: client } = await supabase
    .from('clients')
    .select('id')
    .eq('id', input.clientId)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (!client) {
    throw new Error('Klient nicht gefunden oder gehört nicht zur Organisation.')
  }

  const { error } = await supabase.from('satisfaction_calls').insert({
    client_id: input.clientId,
    call_type: input.callType,
    call_date: input.callDate,
    called_by: 'Alltagsengel',
    satisfaction_rating: input.rating,
    is_punctual: input.punctual,
    feels_comfortable: input.comfortable,
    keep_caregiver: input.keep,
    suggestions: input.suggestions || null,
    notes: input.notes || null,
    next_call_date: input.nextCallDate,
    organization_id: organizationId,
  })

  if (error) throw new Error(`Anruf konnte nicht gespeichert werden: ${error.message}`)
  return { ok: true }
}

// ── Qualitätsdaten laden (Klienten + Anrufe) ──────────────────

export interface QualityDataResult {
  clients: Array<{ id: string; name: string; created_at: string | null; status: string }>
  calls: Array<{
    id: string; client_id: string; client: string; call_type: string | null; call_date: string | null
    called_by: string | null; satisfaction_rating: number | null; is_punctual: boolean | null
    feels_comfortable: boolean | null; keep_caregiver: boolean | null; suggestions: string | null
    notes: string | null; next_call_date: string | null
  }>
}

export async function loadQualityData(): Promise<QualityDataResult> {
  const { supabase, organizationId } = await requireQMAdmin()

  const [clRes, caRes] = await Promise.all([
    supabase
      .from('clients')
      .select('id, first_name, last_name, created_at, status')
      .eq('organization_id', organizationId),
    supabase
      .from('satisfaction_calls')
      .select('id, client_id, call_type, call_date, called_by, satisfaction_rating, is_punctual, feels_comfortable, keep_caregiver, suggestions, notes, next_call_date, client:clients(first_name, last_name)')
      .eq('organization_id', organizationId)
      .order('call_date', { ascending: false }),
  ])

  if (clRes.error) throw new Error(`Klienten laden: ${clRes.error.message}`)
  if (caRes.error) throw new Error(`Anrufe laden: ${caRes.error.message}`)

  return {
    clients: (clRes.data ?? []).map((c: any) => ({
      id: c.id,
      name: fullName(c),
      created_at: c.created_at,
      status: c.status || 'active',
    })),
    calls: (caRes.data ?? []).map((c: any) => ({
      id: c.id,
      client_id: c.client_id,
      client: fullName(c.client),
      call_type: c.call_type,
      call_date: c.call_date,
      called_by: c.called_by,
      satisfaction_rating: c.satisfaction_rating,
      is_punctual: c.is_punctual,
      feels_comfortable: c.feels_comfortable,
      keep_caregiver: c.keep_caregiver,
      suggestions: c.suggestions,
      notes: c.notes,
      next_call_date: c.next_call_date,
    })),
  }
}
