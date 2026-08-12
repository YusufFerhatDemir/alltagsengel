import type { SupabaseClient } from '@supabase/supabase-js'
import { logBillingAction } from './audit'
import { datumBerlin, heuteBerlin } from '@/lib/utils/timezone';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DunningLevel =
  | 'offen' | 'erinnerung' | 'mahnung_1' | 'mahnung_2'
  | 'letzte_mahnung' | 'inkasso_vorbereitung' | 'bezahlt'

export const DUNNING_LEVEL_ORDER: DunningLevel[] = [
  'offen', 'erinnerung', 'mahnung_1', 'mahnung_2',
  'letzte_mahnung', 'inkasso_vorbereitung', 'bezahlt',
]

export const DUNNING_LABELS: Record<DunningLevel, string> = {
  offen: 'Offen',
  erinnerung: 'Zahlungserinnerung',
  mahnung_1: '1. Mahnung',
  mahnung_2: '2. Mahnung',
  letzte_mahnung: 'Letzte Mahnung',
  inkasso_vorbereitung: 'Inkasso-Vorbereitung',
  bezahlt: 'Bezahlt',
}

export const DUNNING_DAYS: Record<DunningLevel, number> = {
  offen: 0,
  erinnerung: 14,
  mahnung_1: 28,
  mahnung_2: 42,
  letzte_mahnung: 56,
  inkasso_vorbereitung: 70,
  bezahlt: 0,
}

export const DUNNING_FEES_CENTS: Record<DunningLevel, number> = {
  offen: 0,
  erinnerung: 0,
  mahnung_1: 250,
  mahnung_2: 500,
  letzte_mahnung: 750,
  inkasso_vorbereitung: 1000,
  bezahlt: 0,
}

export interface DunningBlockReason {
  invoiceId: string
  reason: string
}

// ---------------------------------------------------------------------------
// ensureDunningEntry — erstellt/aktualisiert Mahneintrag für eine Rechnung
// ---------------------------------------------------------------------------

export async function ensureDunningEntry(
  supabase: SupabaseClient,
  invoiceId: string,
  organizationId: string,
  actorId: string
): Promise<string> {
  const { data: inv } = await supabase
    .from('invoices')
    .select('id, total_amount, paid_amount, due_date, status')
    .eq('id', invoiceId)
    .single()

  if (!inv) throw new Error(`Rechnung ${invoiceId} nicht gefunden.`)

  const totalCents = Math.round(Number(inv.total_amount || 0) * 100)
  const paidCents = Math.round(Number(inv.paid_amount || 0) * 100)

  const { data: existing } = await supabase
    .from('dunning_entries')
    .select('id')
    .eq('invoice_id', invoiceId)
    .maybeSingle()

  if (existing) return existing.id

  const dueDate = inv.due_date || heuteBerlin()

  const { data, error } = await supabase
    .from('dunning_entries')
    .insert({
      organization_id: organizationId,
      invoice_id: invoiceId,
      dunning_level: 'offen',
      due_date: dueDate,
      amount_due_cents: totalCents,
      amount_paid_cents: paidCents,
      created_by: actorId,
    })
    .select('id')
    .single()

  if (error || !data) throw new Error(`Mahneintrag konnte nicht erstellt werden: ${error?.message}`)
  return data.id
}

// ---------------------------------------------------------------------------
// checkDunningBlocks — prüft ob Mahnung blockiert ist
// ---------------------------------------------------------------------------

export async function checkDunningBlocks(
  supabase: SupabaseClient,
  invoiceId: string
): Promise<DunningBlockReason[]> {
  const blocks: DunningBlockReason[] = []

  const { data: inv } = await supabase
    .from('invoices')
    .select('id, status')
    .eq('id', invoiceId)
    .single()

  if (!inv) return [{ invoiceId, reason: 'Rechnung nicht gefunden' }]

  if (inv.status === 'storniert') {
    blocks.push({ invoiceId, reason: 'Rechnung ist storniert' })
  }
  if (inv.status === 'strittig') {
    blocks.push({ invoiceId, reason: 'Rechnung ist strittig — keine Mahnung' })
  }

  const { data: disputes } = await supabase
    .from('invoice_disputes')
    .select('id, status')
    .eq('invoice_id', invoiceId)
    .eq('status', 'open')

  if (disputes && disputes.length > 0) {
    blocks.push({ invoiceId, reason: `${disputes.length} offene Beanstandung(en)` })
  }

  const { data: differences } = await supabase
    .from('payment_differences')
    .select('id, widerspruch_status')
    .eq('invoice_id', invoiceId)
    .in('widerspruch_status', ['widerspruch_eingereicht', 'nachforderung'])

  if (differences && differences.length > 0) {
    blocks.push({ invoiceId, reason: 'Offener Widerspruch gegen Kürzung' })
  }

  const { data: corrections } = await supabase
    .from('invoice_corrections')
    .select('id, status')
    .eq('original_invoice_id', invoiceId)
    .in('status', ['entwurf', 'freigegeben'])

  if (corrections && corrections.length > 0) {
    blocks.push({ invoiceId, reason: 'Offene Gutschrift/Korrektur' })
  }

  return blocks
}

// ---------------------------------------------------------------------------
// advanceDunning — eskaliert Mahnstufe
// ---------------------------------------------------------------------------

export async function advanceDunning(
  supabase: SupabaseClient,
  invoiceId: string,
  actorId: string
): Promise<{ newLevel: DunningLevel; feeCents: number }> {
  const blocks = await checkDunningBlocks(supabase, invoiceId)
  if (blocks.length > 0) {
    throw new Error(
      `Mahnung blockiert: ${blocks.map(b => b.reason).join('; ')}`
    )
  }

  const { data: entry } = await supabase
    .from('dunning_entries')
    .select('*')
    .eq('invoice_id', invoiceId)
    .single()

  if (!entry) throw new Error(`Kein Mahneintrag für Rechnung ${invoiceId}`)
  if (entry.block_dunning) throw new Error(`Mahnung manuell blockiert: ${entry.block_reason || 'kein Grund'}`)

  const currentIdx = DUNNING_LEVEL_ORDER.indexOf(entry.dunning_level as DunningLevel)
  if (currentIdx < 0 || currentIdx >= DUNNING_LEVEL_ORDER.length - 2) {
    throw new Error(`Mahnstufe "${entry.dunning_level}" kann nicht weiter eskaliert werden.`)
  }

  const newLevel = DUNNING_LEVEL_ORDER[currentIdx + 1]
  const feeCents = DUNNING_FEES_CENTS[newLevel]

  const now = new Date()
  const nextDays = DUNNING_DAYS[DUNNING_LEVEL_ORDER[Math.min(currentIdx + 2, DUNNING_LEVEL_ORDER.length - 1)]]
  const nextDate = new Date(now)
  nextDate.setDate(nextDate.getDate() + (nextDays - DUNNING_DAYS[newLevel]))

  await supabase
    .from('dunning_entries')
    .update({
      dunning_level: newLevel,
      dunning_fee_cents: (entry.dunning_fee_cents || 0) + feeCents,
      last_dunning_at: now.toISOString(),
      next_dunning_at: datumBerlin(nextDate),
      days_overdue: Math.max(0, Math.floor((now.getTime() - new Date(entry.due_date).getTime()) / 86400000)),
    })
    .eq('invoice_id', invoiceId)

  await supabase
    .from('invoices')
    .update({ dunning_level: newLevel })
    .eq('id', invoiceId)

  await logBillingAction(supabase, {
    entityType: 'dunning',
    organizationId: entry.organization_id,
    entityId: entry.id,
    action: 'escalated',
    previousState: { level: entry.dunning_level },
    newState: { level: newLevel, fee_cents: feeCents },
    actorId,
  })

  return { newLevel, feeCents }
}

// ---------------------------------------------------------------------------
// getDunningOverview — Dashboard-Daten
// ---------------------------------------------------------------------------

export interface DunningOverview {
  total: number
  byLevel: Record<DunningLevel, number>
  totalOpenCents: number
  totalOverdueCents: number
  blockedCount: number
}

export async function getDunningOverview(
  supabase: SupabaseClient,
  organizationId: string
): Promise<DunningOverview> {
  const { data: entries } = await supabase
    .from('dunning_entries')
    .select('dunning_level, amount_due_cents, amount_paid_cents, block_dunning, due_date')
    .eq('organization_id', organizationId)
    .neq('dunning_level', 'bezahlt')

  const overview: DunningOverview = {
    total: 0,
    byLevel: {
      offen: 0, erinnerung: 0, mahnung_1: 0, mahnung_2: 0,
      letzte_mahnung: 0, inkasso_vorbereitung: 0, bezahlt: 0,
    },
    totalOpenCents: 0,
    totalOverdueCents: 0,
    blockedCount: 0,
  }

  const today = heuteBerlin()

  for (const e of entries || []) {
    overview.total++
    const level = e.dunning_level as DunningLevel
    overview.byLevel[level] = (overview.byLevel[level] || 0) + 1
    const openCents = (e.amount_due_cents || 0) - (e.amount_paid_cents || 0)
    overview.totalOpenCents += openCents
    if (e.due_date < today) overview.totalOverdueCents += openCents
    if (e.block_dunning) overview.blockedCount++
  }

  return overview
}
